# Server Implementation

Complete code templates for the server-side MercadoPago integration.
All code defaults to **sandbox/test mode** (`TEST-xxxx` credentials).

> **Human-in-the-loop**: Present each section to the user for review before writing. Never auto-execute financial code.

---

## MercadoPago Client

**Create:** `src/lib/mercadopago/client.ts`

This module wraps the official MercadoPago Node.js SDK. It creates payment preferences (checkout sessions) and fetches payment details for webhook verification.

```typescript
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';

const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN!,
});

const preference = new Preference(client);
const payment = new Payment(client);

/** Validate and normalize the base URL. Rejects non-http(s) protocols (e.g. javascript:, data:). */
function validateBaseUrl(raw: string): string {
  const parsed = new URL(raw);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Invalid base URL protocol: ${parsed.protocol}`);
  }
  return parsed.origin;
}

interface CreatePreferenceParams {
  items: { id: string; title: string; quantity: number; unit_price: number }[];
  purchaseId: string;
  buyerEmail?: string;
}

export async function createPreference({
  items, purchaseId, buyerEmail,
}: CreatePreferenceParams) {
  const baseUrl = validateBaseUrl(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');

  return preference.create({
    body: {
      items: items.map((item) => ({
        id: item.id,
        title: item.title,
        quantity: item.quantity,
        unit_price: item.unit_price,
        currency_id: 'ARS', // Change per references/countries.md
      })),
      ...(buyerEmail ? { payer: { email: buyerEmail } } : {}),
      back_urls: {
        success: `${baseUrl}/payment-success?purchase=${purchaseId}`,
        failure: `${baseUrl}/payment-failure?purchase=${purchaseId}`,
        pending: `${baseUrl}/payment-success?purchase=${purchaseId}&status=pending`,
      },
      // CRITICAL: auto_return requires HTTPS. Omit on localhost or MP returns 400.
      ...(baseUrl.startsWith('https') ? { auto_return: 'approved' as const } : {}),
      external_reference: purchaseId,
      notification_url: `${baseUrl}/api/webhooks/mercadopago`,
      statement_descriptor: 'YOUR_BRAND', // Replace with user's brand (max 22 chars)
      expires: true,
      expiration_date_from: new Date().toISOString(),
      expiration_date_to: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    },
    // Optional: Prevent duplicate preferences on retry
    requestOptions: {
      idempotencyKey: purchaseId,
    },
  });
}

export async function getPayment(paymentId: string) {
  return payment.get({ id: paymentId });
}
```

---

## Checkout API Route

**Create:** `src/app/api/checkout/route.ts`

Validates the cart, creates a purchase record, and returns a MercadoPago redirect URL. Does not move money — it creates a *preference* (checkout session) that the buyer must approve on MercadoPago's hosted page.

```typescript
import { NextResponse } from 'next/server';
import { createPurchase, updatePurchase } from '@/lib/db/purchases';
import { createPreference } from '@/lib/mercadopago/client';
import { z } from 'zod';

const checkoutSchema = z.object({
  items: z.array(z.object({
    id: z.string().max(255),
    title: z.string().min(1).max(255),
    quantity: z.number().int().positive().max(9999),
    unit_price: z.number().positive(),
  })).min(1).max(100),
  email: z.string().email().max(255).optional(),
});

// CSRF: JSON Content-Type triggers a CORS preflight, which blocks cross-origin POST.
// If using cookie-based auth, add an explicit CSRF token (e.g. csurf, next-csrf).

// Rate limiting: Apply at the infrastructure level (Vercel WAF, Cloudflare, nginx limit_req).
// This endpoint creates DB rows and MP preferences — abuse can exhaust API quotas.
// Recommended: ≤10 req/min per IP for checkout.

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validation = checkoutSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid request data' }, { status: 400 });
    }

    const { items, email } = validation.data;
    const totalAmount = items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);

    // Configure per currency: e.g. 500_000 ARS, 50_000 BRL, 100_000 MXN, 200_000_000 COP, 50_000_000 CLP
    const MAX_CHECKOUT_AMOUNT = 500_000;
    if (totalAmount > MAX_CHECKOUT_AMOUNT) {
      return NextResponse.json({ error: 'Amount exceeds maximum allowed' }, { status: 400 });
    }

    const purchase = await createPurchase({
      user_email: email || 'pending@checkout',
      status: 'pending',
      total_amount: totalAmount,
    });

    const mpPreference = await createPreference({
      items, purchaseId: purchase.id, buyerEmail: email,
    });

    await updatePurchase(purchase.id, {
      mercadopago_preference_id: mpPreference.id,
    });

    return NextResponse.json({
      preferenceId: mpPreference.id,
      initPoint: mpPreference.init_point,
      purchaseId: purchase.id,
    });
  } catch (error) {
    console.error('Checkout error:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Checkout failed' }, { status: 500 });
  }
}
```

---

## Webhook Handler

**Create:** `src/app/api/webhooks/mercadopago/route.ts`

Receives asynchronous payment notifications from MercadoPago. Verifies the HMAC signature, fetches the payment details, validates the amount, and atomically updates the purchase status.

```typescript
import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { getPurchaseStatus, updatePurchaseStatusAtomically } from '@/lib/db/purchases';
import { getPayment } from '@/lib/mercadopago/client';

// Rate limiting: Apply at the infrastructure level (Vercel WAF, Cloudflare rate-limit rules,
// AWS API Gateway throttling, or nginx limit_req). Recommended: ≤30 req/s per IP.

const WEBHOOK_SECRET = process.env.MERCADOPAGO_WEBHOOK_SECRET;

// Reject webhooks whose timestamp is older than this — prevents replay attacks.
const MAX_WEBHOOK_AGE_SECONDS = 300; // 5 minutes

function verifyWebhookSignature(request: Request, body: string): boolean {
  // Fail-closed: always reject if the secret is not configured.
  // Set MERCADOPAGO_WEBHOOK_SECRET in every environment, including development
  // (any non-empty string works in dev; use the real secret in staging/production).
  if (!WEBHOOK_SECRET) {
    throw new Error('MERCADOPAGO_WEBHOOK_SECRET is not configured');
  }

  const xSignature = request.headers.get('x-signature');
  const xRequestId = request.headers.get('x-request-id');
  if (!xSignature || !xRequestId) return false;

  // Parse ts and v1 from x-signature header
  const parts = Object.fromEntries(
    xSignature.split(',').map((part) => {
      const [key, ...rest] = part.trim().split('=');
      return [key, rest.join('=')];
    })
  );
  const ts = parts['ts'];
  const hash = parts['v1'];
  if (!ts || !hash) return false;

  // Reject stale or replayed webhooks
  const webhookAgeSeconds = Math.floor(Date.now() / 1000) - parseInt(ts, 10);
  if (isNaN(webhookAgeSeconds) || webhookAgeSeconds < 0 || webhookAgeSeconds > MAX_WEBHOOK_AGE_SECONDS) {
    return false;
  }

  // Parse data.id from body
  const parsed = JSON.parse(body);
  const dataId = parsed?.data?.id;

  // Build the template string per MercadoPago docs
  const template = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
  const expected = createHmac('sha256', WEBHOOK_SECRET)
    .update(template)
    .digest('hex');

  // Timing-safe comparison to prevent timing attacks
  const expectedBuf = Buffer.from(expected, 'hex');
  const hashBuf = Buffer.from(hash, 'hex');
  if (expectedBuf.length !== hashBuf.length) return false;
  return timingSafeEqual(expectedBuf, hashBuf);
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();

    if (!verifyWebhookSignature(request, rawBody)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const body = JSON.parse(rawBody);

    // Handle both IPN and webhook formats
    if (body.type !== 'payment' && body.action !== 'payment.created' && body.action !== 'payment.updated') {
      return NextResponse.json({ received: true });
    }

    const paymentId = body.data?.id;
    if (!paymentId) return NextResponse.json({ received: true });

    // Validate format: MercadoPago payment IDs are numeric strings (1–20 digits).
    // Reject anything else before it reaches the SDK / external API.
    const paymentIdStr = String(paymentId);
    if (!/^\d{1,20}$/.test(paymentIdStr)) return NextResponse.json({ received: true });

    const payment = await getPayment(paymentIdStr);
    if (!payment?.external_reference) return NextResponse.json({ received: true });

    // Amount verification: reject if payment amount doesn't match stored amount
    const existing = await getPurchaseStatus(payment.external_reference);
    if (!existing) return NextResponse.json({ received: true });

    if (
      existing.total_amount != null &&
      Number(payment.transaction_amount) !== Number(existing.total_amount)
    ) {
      console.error(
        `Amount mismatch for purchase ${payment.external_reference}: ` +
        `expected ${existing.total_amount}, got ${payment.transaction_amount}`
      );
      return NextResponse.json({ error: 'Amount mismatch' }, { status: 400 });
    }

    let status: 'pending' | 'approved' | 'rejected' = 'pending';
    if (payment.status === 'approved') status = 'approved';
    else if (['rejected', 'cancelled', 'refunded'].includes(payment.status || '')) status = 'rejected';

    const payerEmail = payment.payer?.email;

    // Atomic update: only updates if purchase is still in 'pending' state.
    // Returns false (no-op) if already in a terminal state — prevents race conditions.
    await updatePurchaseStatusAtomically(payment.external_reference, 'pending', {
      status,
      mercadopago_payment_id: paymentId.toString(),
      ...(payerEmail ? { user_email: payerEmail } : {}),
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error instanceof Error ? error.message : 'Unknown error');
    // Always return 200 to prevent MercadoPago from retrying indefinitely
    return NextResponse.json({ received: true });
  }
}

// GET endpoint for MercadoPago verification pings
export async function GET() {
  return NextResponse.json({ status: 'ok' });
}
```

---

## Purchase Status API

**Create:** `src/app/api/purchases/[id]/route.ts`

Read-only endpoint that returns the purchase status. Used by the success page for server-side verification. Does not perform any financial operations.

```typescript
import { NextResponse } from 'next/server';
import { getPurchaseStatus } from '@/lib/db/purchases';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const data = await getPurchaseStatus(id);

  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ id: data.id, status: data.status });
}
```
