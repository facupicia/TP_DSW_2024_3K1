# Client Implementation

Frontend code templates for the MercadoPago checkout flow.
These components handle user interaction only — no financial operations occur on the client.

> **Human-in-the-loop**: Present each section to the user for review before writing.

---

## Checkout Hook

**Create:** `src/hooks/useCheckout.ts`

Sends the cart to the checkout API and redirects to MercadoPago. Double-click prevention uses `useRef` (survives re-renders, unlike `useState`).

```typescript
'use client';
import { useCallback, useRef, useState } from 'react';

export function useCheckout() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const guard = useRef(false);

  const submitCheckout = useCallback(async (items: unknown[]) => {
    if (guard.current) return;
    setError(null);
    guard.current = true;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Checkout failed');
      if (data.initPoint) window.location.href = data.initPoint;
      else throw new Error('No payment link returned');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsSubmitting(false);
      guard.current = false;
    }
  }, []);

  return { submitCheckout, isSubmitting, error };
}
```

---

## Success Page with Server-Side Verification

**Create:** `src/app/payment-success/page.tsx` (adjust route name as needed)

Always verify purchase status server-side. Never trust the redirect URL alone.
Wrap `useSearchParams` in `<Suspense>` (Next.js App Router requirement).

```tsx
'use client';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';

type Status = 'loading' | 'approved' | 'pending' | 'rejected' | 'error';

function PaymentResult() {
  const purchaseId = useSearchParams().get('purchase');
  const [status, setStatus] = useState<Status>(purchaseId ? 'loading' : 'approved');

  const verify = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/purchases/${id}`);
      if (!res.ok) { setStatus('error'); return; }
      const { status } = await res.json();
      setStatus(status === 'approved' ? 'approved'
        : status === 'pending' ? 'pending' : 'rejected');
    } catch { setStatus('error'); }
  }, []);

  useEffect(() => { if (purchaseId) verify(purchaseId); }, [purchaseId, verify]);

  if (status === 'loading') {
    return <div>Verifying payment...</div>;
  }

  if (status === 'approved') {
    return (
      <div>
        <h1>Payment Successful!</h1>
        <p>Thank you for your purchase.</p>
      </div>
    );
  }

  if (status === 'pending') {
    return (
      <div>
        <h1>Payment Pending</h1>
        <p>Your payment is being processed.</p>
        <p>You'll receive an email when confirmed.</p>
        <p>This may take 1-3 business days for offline payment methods.</p>
      </div>
    );
  }

  if (status === 'rejected') {
    return (
      <div>
        <h1>Payment Failed</h1>
        <p>Your payment could not be processed.</p>
        <p>Please try again or use a different payment method.</p>
      </div>
    );
  }

  return (
    <div>
      <h1>Error</h1>
      <p>Could not verify payment status. Please contact support.</p>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return <Suspense fallback={<div>Loading...</div>}><PaymentResult /></Suspense>;
}
```
