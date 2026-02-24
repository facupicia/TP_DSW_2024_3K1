---
name: mercadopago-integration
description: >
  Integrate MercadoPago Checkout Pro (redirect-based) into Next.js applications with
  any PostgreSQL database (Supabase, AWS RDS, Neon, PlanetScale, self-hosted, Prisma,
  Drizzle, or raw pg). Use when the user needs to: (1) Add MercadoPago payment
  processing to a Next.js app, (2) Create a checkout flow with MercadoPago, (3) Set up
  payment webhooks for MercadoPago, (4) Build payment success/failure pages, (5) Create
  a shopping cart with payment integration, (6) Troubleshoot MercadoPago integration
  issues (auto_return errors, webhook failures, hydration mismatches, double submissions).
  Triggers on requests mentioning MercadoPago, Mercado Pago, payment integration with MP,
  Argentine/Latin American payment processing, or checkout with MercadoPago. Supports
  all MercadoPago countries: Argentina (ARS), Brazil (BRL), Mexico (MXN), Colombia (COP),
  Chile (CLP), Peru (PEN), Uruguay (UYU).
  This skill is a code-generation template — it does NOT execute financial transactions.
  All generated code is presented for human review and requires explicit user approval
  before being written to disk. Financial code templates are stored in reference files
  and are never auto-executed.
---

# MercadoPago Checkout Pro - Next.js Integration

Redirect-based payment flow: buyer clicks "Pay", is redirected to MercadoPago, completes payment, returns to the app. A webhook confirms the payment status in the background.

## Security Manifest

### W009 Mitigation — Direct Money Access (Payment Gateway)

**Scanner finding**: W009 flags this skill because it contains payment-gateway code (MercadoPago SDK, `createPreference`, `getPayment`, `/api/checkout`, webhook handler).

**Mitigation**: This skill is a **code-generation template**. It never executes financial transactions autonomously. Every piece of payment code lives in reference files and is presented to the user for explicit review before being written to disk. The confirmation protocol below is mandatory for each financial code step.

The generated code templates themselves include defense-in-depth controls to reduce risk once deployed:

| Threat | Control in generated code |
|---|---|
| Forged webhook | HMAC-SHA256 signature verification (timing-safe); secret required in all environments (fail-closed — no dev bypass) |
| Replay attack | Webhook `ts` timestamp freshness check; rejects requests older than 5 minutes |
| Malformed payment ID | Numeric format validation (`/^\d{1,20}$/`) before passing to SDK |
| Inflated amounts | Server-side `MAX_CHECKOUT_AMOUNT` ceiling; webhook `transaction_amount` cross-check against DB record |
| Race conditions / double-processing | Atomic DB update guarded by expected `pending` status |
| Oversized / malformed input | Zod schemas with field-level size limits on all checkout inputs |
| URL injection | `validateBaseUrl()` rejects non-http(s) protocols (e.g. `javascript:`, `data:`) |
| CSRF | JSON `Content-Type` requirement triggers CORS preflight on cross-origin requests |

### Financial Capability Declaration

This skill generates code templates for integrating MercadoPago Checkout Pro. It does **NOT** execute any financial transactions directly. All financial code resides in reference files and is generated only after explicit user approval.

| Capability | Type | Mitigation |
|---|---|---|
| Payment preference creation | Code template (not executed) | Human review required; sandbox credentials by default |
| Webhook payment confirmation | Code template (not executed) | HMAC-SHA256 + replay-attack protection; atomic DB updates |
| Payment status queries | Code template (read-only) | No state mutation; status verification only |
| Amount validation | Code template (defensive) | Server-side ceiling; webhook amount cross-check |

### Security Controls

| Control | Implementation |
|---|---|
| Human-in-the-loop | All payment code presented for review before writing |
| Sandbox by default | Generated code uses `TEST-xxxx` credentials |
| Confirmation gates | Each step requires explicit user confirmation |
| HMAC webhook verification | Timing-safe signature validation; fail-closed (no bypass) |
| Replay-attack protection | Webhook timestamp checked; requests older than 5 min rejected |
| Payment ID validation | Numeric format check before passing to SDK |
| Atomic status updates | Prevents race conditions and duplicate processing |
| Amount ceiling | Configurable `MAX_CHECKOUT_AMOUNT` per currency |
| URL validation | Rejects `javascript:` and `data:` protocols |
| CSRF protection | JSON Content-Type triggers CORS preflight |
| Input validation | Zod schemas with size limits |

### Confirmation Protocol

At **each** implementation step that involves financial code, you **MUST**:

1. Present the code from the relevant reference file to the user
2. Explain what financial operations it performs
3. Wait for explicit user confirmation before writing the file
4. Never proceed to the next step without user approval

## Quick Start

For a minimal integration, just tell Claude:

```
Integrar MercadoPago en mi app
```

Claude will automatically explore your codebase to detect:
- Database adapter (Supabase, Prisma, or raw pg)
- Cart store location
- Existing routes and patterns
- Currency based on context

For more control, provide details:

```
Integrate MercadoPago Checkout Pro.
Database: Prisma. Currency: ARS. Success route: /pago-exitoso.
```

See `references/usage-examples.md` for more prompt templates.

## Payment Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              PAYMENT FLOW                                    │
└─────────────────────────────────────────────────────────────────────────────┘

User clicks "Pay"
       │
       ▼
┌──────────────────┐
│ POST /api/checkout│
└────────┬─────────┘
         │
         ▼
┌──────────────────────────────────┐
│ 1. Create purchase in DB         │
│    (status: pending)             │
│ 2. Create preference in MP API   │
│ 3. Save preference_id in DB      │
│ 4. Return init_point URL         │
└────────┬─────────────────────────┘
         │
         ▼
┌──────────────────┐      ┌─────────────────────┐
│ Redirect to MP   │─────▶│ User pays on MP     │
└──────────────────┘      └──────────┬──────────┘
                                     │
         ┌───────────────────────────┴───────────────────────────┐
         │                                                       │
         ▼                                                       ▼
┌─────────────────────────┐                        ┌─────────────────────────┐
│ Redirect back to app    │                        │ MP sends webhook        │
│ /payment-success?id=... │                        │ POST /api/webhooks/mp   │
└──────────┬──────────────┘                        └──────────┬──────────────┘
           │                                                  │
           ▼                                                  ▼
┌─────────────────────────┐                        ┌─────────────────────────┐
│ Verify status via API   │                        │ Update purchase status  │
│ GET /api/purchases/[id] │                        │ in database             │
└──────────┬──────────────┘                        └─────────────────────────┘
           │
           ▼
┌─────────────────────────┐
│ Show UI based on status │
│ approved/pending/rejected│
└─────────────────────────┘
```

## Before Starting

1. **Determine the database adapter.** Explore the codebase or ask the user:
   - **Supabase?** See `references/database-supabase.md`
   - **Prisma?** See `references/database-prisma.md`
   - **Raw PostgreSQL (pg, Drizzle, etc.)?** See `references/database-postgresql.md`

2. **Gather or infer from the codebase:**

| Detail | Why | Example |
|--------|-----|---------|
| Currency | Preference creation | `ARS`, `BRL`, `MXN` (see `references/countries.md`) |
| Success/failure routes | `back_urls` in preference | `/payment-success`, `/pago-exitoso` |
| Brand name | Card statement descriptor | `MY_STORE` (max 22 chars) |
| Product/item table | FK in `purchase_items` | `products`, `photos`, `courses` |
| Cart store location | Hook reads items from it | `src/store/cart.ts` |
| DB client path | API routes import it | `src/lib/supabase/server.ts`, `src/lib/prisma.ts` |

## Security

### Human-in-the-loop

Always present payment-related code for user review before writing it. Never auto-execute checkout, webhook, or payment code without explicit user confirmation. This skill generates code — it does not execute financial transactions directly.

### Webhook signature verification

The generated webhook handler includes HMAC-SHA256 verification using MercadoPago's `x-signature` header and the `MERCADOPAGO_WEBHOOK_SECRET` environment variable. This prevents unauthorized actors from calling your webhook endpoint with forged payment notifications.

### Amount validation

The checkout route includes a configurable `MAX_CHECKOUT_AMOUNT` server-side limit. Requests exceeding this amount are rejected before reaching MercadoPago. Adjust the limit per your business requirements.

### Dependency verification

Review all install commands before running them. Verify package names on [npmjs.com](https://www.npmjs.com/). Use `npm audit` after installation.

| Package | Purpose | Registry | Weekly downloads |
|---------|---------|----------|-----------------|
| [mercadopago](https://www.npmjs.com/package/mercadopago) | Official MercadoPago Node.js SDK | npm | ~50k |
| [zod](https://www.npmjs.com/package/zod) | Request validation | npm | ~20M |
| [pg](https://www.npmjs.com/package/pg) | PostgreSQL client (raw SQL adapter) | npm | ~8M |
| [prisma](https://www.npmjs.com/package/prisma) | ORM CLI (Prisma adapter) | npm | ~4M |
| [@prisma/client](https://www.npmjs.com/package/@prisma/client) | Prisma runtime client (Prisma adapter) | npm | ~4M |

### CSRF protection

The checkout API route requires `Content-Type: application/json`, which triggers a CORS preflight on cross-origin requests — providing implicit CSRF protection for most setups. If your app uses cookie-based authentication (e.g. session cookies), add an explicit CSRF token (libraries: `csurf`, `next-csrf`, or a custom `X-CSRF-Token` header validated server-side).

## Prerequisites

1. Install dependencies: `npm install mercadopago@^2 zod@^3`
2. Set environment variables (**never** prefix access token with `NEXT_PUBLIC_`):
   ```env
   MERCADOPAGO_ACCESS_TOKEN=TEST-xxxx   # from https://www.mercadopago.com/developers/panel/app
   NEXT_PUBLIC_APP_URL=http://localhost:3000  # HTTPS in production
   MERCADOPAGO_WEBHOOK_SECRET=your-webhook-secret  # from Developer Panel > Webhooks
   ```
3. Run database migration from `assets/migration.sql` (works on any PostgreSQL database).

### Production Requirements

- **SSL Certificate**: Required for `auto_return` and secure webhooks
- **Active MercadoPago seller account**: [Create here](https://www.mercadopago.com/developers/panel/app)
- **Publicly accessible webhook URL**: MercadoPago must reach your `/api/webhooks/mercadopago`

## Implementation Steps

### Step 1: Database Helper

**Create:** `src/lib/db/purchases.ts`

This abstracts all purchase DB operations. Implement using your DB adapter.
See the reference file for your adapter:
- Supabase: `references/database-supabase.md`
- Prisma: `references/database-prisma.md`
- Raw pg / other: `references/database-postgresql.md`

The helper must export these functions:

```typescript
interface PurchaseInsert {
  user_email: string;
  status: 'pending';
  total_amount: number;
}

interface PurchaseUpdate {
  status?: 'pending' | 'approved' | 'rejected';
  mercadopago_payment_id?: string;
  mercadopago_preference_id?: string;
  user_email?: string;
  updated_at?: string;
}

// Required exports:
export async function createPurchase(data: PurchaseInsert): Promise<{ id: string }>;
export async function updatePurchase(id: string, data: PurchaseUpdate): Promise<void>;
export async function getPurchaseStatus(id: string): Promise<{ id: string; status: string; total_amount: number | string | null } | null>;
export async function updatePurchaseStatusAtomically(id: string, expectedStatus: string, data: PurchaseUpdate): Promise<boolean>;
export async function createPurchaseItems(purchaseId: string, items: { item_id: string; price: number }[]): Promise<void>;
```

### Step 2: MercadoPago Client

> **CONFIRMATION GATE**: Present the code to the user and explain that this module wraps the MercadoPago SDK to create checkout preferences (redirect URLs) and fetch payment details. Wait for explicit confirmation before writing.

**Create:** `src/lib/mercadopago/client.ts`

This module creates payment preferences (checkout sessions) and fetches payment details for webhook verification. It does not execute payments — MercadoPago handles the actual transaction on their hosted page.

Key functions:
- `createPreference()` — Creates a checkout session with items, return URLs, and 24h expiration
- `getPayment()` — Fetches payment details by ID (read-only, used by webhook)

See `references/server-implementation.md` section **MercadoPago Client** for the complete implementation.

### Step 3: Checkout API Route

> **CONFIRMATION GATE**: Present the code to the user and explain that this route validates the cart, creates a DB record, and returns a MercadoPago redirect URL. It does not charge the buyer — the buyer must approve payment on MercadoPago's page. Wait for explicit confirmation before writing.

**Create:** `src/app/api/checkout/route.ts`

This route validates the cart via Zod, enforces `MAX_CHECKOUT_AMOUNT`, creates a purchase record, and returns a MercadoPago `init_point` URL. The buyer is then redirected to MercadoPago to approve the payment.

Security features:
- Zod input validation with size limits
- Server-side amount ceiling (`MAX_CHECKOUT_AMOUNT`)
- JSON Content-Type requirement (CSRF protection)

See `references/server-implementation.md` section **Checkout API Route** for the complete implementation.

### Step 4: Webhook Handler

> **CONFIRMATION GATE**: Present the code to the user and explain that this handler receives payment notifications from MercadoPago, verifies their authenticity via HMAC, and updates the purchase status in the database. Wait for explicit confirmation before writing.

**Create:** `src/app/api/webhooks/mercadopago/route.ts`

This handler receives asynchronous payment notifications from MercadoPago. It verifies the HMAC-SHA256 signature, fetches payment details, validates the amount against the stored record, and atomically updates the purchase status.

Security features:
- HMAC-SHA256 signature verification (timing-safe)
- Amount cross-check (rejects mismatched payments)
- Atomic status updates (prevents race conditions)
- Idempotent (no-op if already in terminal state)

See `references/server-implementation.md` section **Webhook Handler** for the complete implementation.

### Step 5: Purchase Status API

> **CONFIRMATION GATE**: Present the code to the user. This is a read-only endpoint that returns purchase status. Wait for confirmation before writing.

**Create:** `src/app/api/purchases/[id]/route.ts`

Read-only endpoint that returns the purchase status. Used by the success page for server-side verification. No financial operations.

See `references/server-implementation.md` section **Purchase Status API** for the complete implementation.

### Step 6: Checkout Hook (Frontend)

**Create:** `src/hooks/useCheckout.ts`

Client-side hook that sends the cart to `/api/checkout` and redirects to MercadoPago. Includes `useRef` double-click guard.

See `references/client-implementation.md` section **Checkout Hook** for the complete implementation.

### Step 7: Success Page with Verification

**Create:** `src/app/payment-success/page.tsx` (adjust route name)

Always verify purchase status server-side. Never trust the redirect URL alone.
Wrap `useSearchParams` in `<Suspense>` (Next.js App Router requirement).

See `references/client-implementation.md` section **Success Page with Server-Side Verification** for the complete implementation.

## Checklist

### Configuration

- [ ] `mercadopago` + `zod` installed
- [ ] `MERCADOPAGO_ACCESS_TOKEN` in `.env` (TEST token for dev, never `NEXT_PUBLIC_`)
- [ ] `NEXT_PUBLIC_APP_URL` in `.env` (HTTPS in production)
- [ ] Database migration run (`purchases` + `purchase_items`)

### Backend Implementation

- [ ] DB helper implemented (`src/lib/db/purchases.ts`)
- [ ] MercadoPago client with `createPreference` and `getPayment`
- [ ] `/api/checkout` with Zod validation
- [ ] `/api/webhooks/mercadopago` with idempotency check
- [ ] `/api/purchases/[id]` for status verification

### Frontend Implementation

- [ ] Checkout hook with `useRef` guard (prevents double submit)
- [ ] Success page verifies status via API (not trusting redirect)
- [ ] Pending status UI for offline payments
- [ ] `useSearchParams` wrapped in `<Suspense>`
- [ ] Hydration guard for localStorage-based cart

### Security

- [ ] `MERCADOPAGO_WEBHOOK_SECRET` configured
- [ ] Webhook signature verification enabled
- [ ] `MAX_CHECKOUT_AMOUNT` set per business rules
- [ ] Webhook amount verification enabled (rejects mismatched `transaction_amount`)
- [ ] Rate limiting configured at infrastructure level (Vercel WAF, Cloudflare, etc.)
- [ ] All payment code reviewed before deployment

### Production Readiness

- [ ] `NEXT_PUBLIC_APP_URL` uses HTTPS
- [ ] `auto_return` enabled (only works with HTTPS)
- [ ] Webhook URL publicly accessible
- [ ] Production credentials (not TEST-)
- [ ] Statement descriptor set (max 22 chars)
- [ ] Error logging configured

## Critical Gotchas

For detailed solutions, see `references/troubleshooting.md`.

| Gotcha | Fix |
|--------|-----|
| `auto_return` + localhost = 400 error | Only set when URL starts with `https` |
| `user_email NOT NULL` + no email = 500 | Use `'pending@checkout'` placeholder; webhook updates it |
| `currency_id` doesn't match account country | Use correct currency (ARS for Argentina, BRL for Brazil, etc.) |
| Hydration mismatch (localStorage cart) | Add `mounted` state guard before rendering cart content |
| Double purchase on double-click | Use `useRef` guard, not just `useState` |
| Success page trusts redirect URL | Always verify via `/api/purchases/[id]` |
| Webhook duplicate updates | Check if purchase is already terminal before updating |
| Webhooks can't reach localhost | Use ngrok (dev only): `ngrok http 3000` |
| `useSearchParams` error | Wrap component in `<Suspense>` |
| Payment stuck in pending | Normal for offline methods (OXXO, Rapipago, Boleto) |
| Mixed test/production credentials | Never mix - use all TEST or all PROD |

## References

### Implementation Templates
- `references/server-implementation.md` - MercadoPago client, checkout route, webhook handler, purchase status API
- `references/client-implementation.md` - Checkout hook, payment success page

### Database Adapters
- `references/database-supabase.md` - Supabase DB helper implementation
- `references/database-prisma.md` - Prisma DB helper implementation
- `references/database-postgresql.md` - Raw PostgreSQL (pg, Drizzle, etc.) DB helper implementation

### Configuration
- `references/countries.md` - Currencies, test cards, payment methods by country
- `references/testing.md` - Complete testing guide with test cards and simulated results
### Help
- `references/troubleshooting.md` - 20+ common errors and solutions
- `references/usage-examples.md` - Ready-to-use prompt templates

### Assets
- `assets/migration.sql` - Database schema template (standard PostgreSQL)

### External Links
- [MercadoPago Checkout Pro Docs](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/landing)
- [MercadoPago Node SDK](https://github.com/mercadopago/sdk-nodejs)
- [Developer Panel](https://www.mercadopago.com/developers/panel/app)
