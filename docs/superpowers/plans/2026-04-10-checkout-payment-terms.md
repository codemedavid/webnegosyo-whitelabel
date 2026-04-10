# Checkout Payment Terms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `50% Downpayment` and `Full Payment` terms to the marketing checkout so the payable amount updates live and the chosen term is saved with the checkout lead.

**Architecture:** Introduce a shared payment-terms pricing helper that defines the base product price and computes the payable amount for each supported term. Extend the marketing checkout page and form to keep payment-term selection in sync with the summary card, then persist the selected term and server-computed amount through the checkout lead action and service layer.

**Tech Stack:** Next.js 15 App Router, React 19, Jest, Testing Library, Zod, Supabase migrations/types, Tailwind CSS 4.

**Spec:** `docs/superpowers/specs/2026-04-10-checkout-payment-terms-design.md`

---

### Task 1: Add shared payment-terms pricing helper

**Files:**
- Create: `src/lib/checkout-leads/payment-terms.ts`
- Test: `tests/unit/lib/payment-terms.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import {
  CHECKOUT_BASE_PRICE,
  DEFAULT_PAYMENT_TERM,
  getCheckoutPayableAmount,
  isCheckoutPaymentTerm,
} from '@/lib/checkout-leads/payment-terms'

describe('checkout payment terms', () => {
  it('defines the Smart Menu base price and default term', () => {
    expect(CHECKOUT_BASE_PRICE).toBe(3899)
    expect(DEFAULT_PAYMENT_TERM).toBe('downpayment_50')
  })

  it('computes the payable amount for the 50% downpayment option', () => {
    expect(getCheckoutPayableAmount('downpayment_50')).toBe(1950)
  })

  it('computes the payable amount for the full payment option', () => {
    expect(getCheckoutPayableAmount('full_payment')).toBe(3899)
  })

  it('recognizes only supported payment terms', () => {
    expect(isCheckoutPaymentTerm('downpayment_50')).toBe(true)
    expect(isCheckoutPaymentTerm('full_payment')).toBe(true)
    expect(isCheckoutPaymentTerm('other')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runTestsByPath tests/unit/lib/payment-terms.test.ts`
Expected: FAIL with module not found for `@/lib/checkout-leads/payment-terms`

- [ ] **Step 3: Write minimal implementation**

```typescript
export const CHECKOUT_BASE_PRICE = 3899

export const CHECKOUT_PAYMENT_TERMS = ['downpayment_50', 'full_payment'] as const

export type CheckoutPaymentTerm = (typeof CHECKOUT_PAYMENT_TERMS)[number]

export const DEFAULT_PAYMENT_TERM: CheckoutPaymentTerm = 'downpayment_50'

export function isCheckoutPaymentTerm(value: string): value is CheckoutPaymentTerm {
  return CHECKOUT_PAYMENT_TERMS.includes(value as CheckoutPaymentTerm)
}

export function getCheckoutPayableAmount(term: CheckoutPaymentTerm): number {
  if (term === 'downpayment_50') {
    return Math.round(CHECKOUT_BASE_PRICE / 2)
  }

  return CHECKOUT_BASE_PRICE
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --runTestsByPath tests/unit/lib/payment-terms.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/unit/lib/payment-terms.test.ts src/lib/checkout-leads/payment-terms.ts
git commit -m "feat: add checkout payment terms pricing helper"
```

---

### Task 2: Persist payment term in checkout lead schema and app types

**Files:**
- Create: `supabase/migrations/20260410000001_checkout_payment_terms.sql`
- Modify: `src/types/database.ts`
- Modify: `src/types/supabase.ts`

- [ ] **Step 1: Write the migration**

```sql
ALTER TABLE checkout_leads
ADD COLUMN payment_term text;

UPDATE checkout_leads
SET payment_term = 'full_payment'
WHERE payment_term IS NULL;

ALTER TABLE checkout_leads
ALTER COLUMN payment_term SET NOT NULL;

ALTER TABLE checkout_leads
ADD CONSTRAINT checkout_leads_payment_term_check
CHECK (payment_term IN ('downpayment_50', 'full_payment'));
```

- [ ] **Step 2: Update app-facing types**

Add `CheckoutPaymentTerm` import and wire it into the checkout lead interfaces in `src/types/database.ts`:

```typescript
import type { CheckoutPaymentTerm } from '@/lib/checkout-leads/payment-terms'
```

```typescript
export interface CheckoutLead {
  id: string
  reference_number: string
  name: string
  email: string
  phone: string
  business_name: string
  notes: string | null
  selected_payment_method_id: string | null
  payment_term: CheckoutPaymentTerm
  status: CheckoutLeadStatus
  payment_proof_url: string | null
  payment_proof_uploaded_at: string | null
  amount: number
  created_at: string
  updated_at: string
}
```

- [ ] **Step 3: Update generated Supabase types**

Add `payment_term` to the `checkout_leads` row/insert/update shapes in `src/types/supabase.ts`:

```typescript
payment_term: string
```

```typescript
payment_term?: string
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260410000001_checkout_payment_terms.sql src/types/database.ts src/types/supabase.ts
git commit -m "feat: add checkout payment term schema and types"
```

---

### Task 3: Make checkout lead submission compute payment terms server-side

**Files:**
- Modify: `src/lib/checkout-leads/checkout-leads-service.ts`
- Modify: `src/app/actions/checkout-leads.ts`
- Test: `tests/unit/lib/checkout-leads-service.test.ts`

- [ ] **Step 1: Write the failing service test**

```typescript
import { createCheckoutLead } from '@/lib/checkout-leads/checkout-leads-service'
import { createAdminClient } from '@/lib/supabase/admin'

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(),
}))

describe('createCheckoutLead', () => {
  it('stores payment_term and server-computed downpayment amount', async () => {
    const insert = jest.fn().mockReturnThis()
    const select = jest.fn().mockReturnThis()
    const single = jest.fn().mockResolvedValue({
      data: { reference_number: 'WN-20260410-ABCD', amount: 1950, payment_term: 'downpayment_50' },
      error: null,
    })

    ;(createAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn().mockReturnValue({ insert, select, single }),
    })

    await createCheckoutLead({
      name: 'Juan Dela Cruz',
      email: 'juan@example.com',
      phone: '09171234567',
      business_name: 'Juan Kitchen',
      selected_payment_method_id: 'payment-method-1',
      payment_term: 'downpayment_50',
    })

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_term: 'downpayment_50',
        amount: 1950,
      })
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runTestsByPath tests/unit/lib/checkout-leads-service.test.ts`
Expected: FAIL because `payment_term` is not part of the input type or insert payload yet

- [ ] **Step 3: Update the action and service**

Change the action input in `src/app/actions/checkout-leads.ts`:

```typescript
import type { CheckoutPaymentTerm } from '@/lib/checkout-leads/payment-terms'
```

```typescript
export async function submitCheckoutForm(input: {
  name: string
  email: string
  phone: string
  business_name: string
  notes?: string
  selected_payment_method_id: string
  payment_term: CheckoutPaymentTerm
  meta?: {
    eventId?: string
    fbp?: string
    fbc?: string
    eventSourceUrl?: string
    clientUserAgent?: string
  }
}) {
  const result = await createCheckoutLead(input)
  // existing capture logic stays the same
}
```

Update the service input and insert logic in `src/lib/checkout-leads/checkout-leads-service.ts`:

```typescript
import {
  getCheckoutPayableAmount,
  isCheckoutPaymentTerm,
  type CheckoutPaymentTerm,
} from './payment-terms'
```

```typescript
export interface CreateCheckoutLeadInput {
  name: string
  email: string
  phone: string
  business_name: string
  notes?: string
  selected_payment_method_id: string
  payment_term: CheckoutPaymentTerm
  meta?: {
    eventId?: string
    fbp?: string
    fbc?: string
    eventSourceUrl?: string
    clientUserAgent?: string
  }
}
```

```typescript
const paymentTerm = input.payment_term

if (!isCheckoutPaymentTerm(paymentTerm)) {
  return { data: null, error: 'Invalid payment term' }
}

const amount = getCheckoutPayableAmount(paymentTerm)
```

```typescript
.insert({
  reference_number: referenceNumber,
  name: input.name,
  email: input.email,
  phone: input.phone,
  business_name: input.business_name,
  notes: input.notes ?? null,
  selected_payment_method_id: input.selected_payment_method_id,
  payment_term: paymentTerm,
  amount,
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --runTestsByPath tests/unit/lib/checkout-leads-service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/unit/lib/checkout-leads-service.test.ts src/app/actions/checkout-leads.ts src/lib/checkout-leads/checkout-leads-service.ts
git commit -m "feat: persist checkout payment terms in lead submissions"
```

---

### Task 4: Add payment-term selection to the checkout UI and bind summary pricing

**Files:**
- Modify: `src/components/landing/checkout-form.tsx`
- Modify: `src/app/checkout/page.tsx`
- Test: `tests/checkout-page-video.test.tsx`
- Test: `tests/checkout-form-payment-terms.test.tsx`

- [ ] **Step 1: Write the failing UI tests**

Create `tests/checkout-form-payment-terms.test.tsx`:

```typescript
import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CheckoutForm } from '@/components/landing/checkout-form'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}))

jest.mock('@/app/actions/checkout-leads', () => ({
  fetchActivePlatformPaymentMethods: jest.fn().mockResolvedValue([
    { id: 'pm-1', name: 'GCash', type: 'qr_code', details: null },
  ]),
  submitCheckoutForm: jest.fn().mockResolvedValue({
    data: { reference_number: 'WN-20260410-ABCD', amount: 1950 },
    error: null,
  }),
}))

describe('CheckoutForm payment terms', () => {
  it('renders downpayment and full payment options', async () => {
    render(
      <CheckoutForm
        paymentTerm="downpayment_50"
        onPaymentTermChange={() => {}}
      />
    )

    expect(await screen.findByText('50% Downpayment')).toBeInTheDocument()
    expect(screen.getByText('Full Payment')).toBeInTheDocument()
  })

  it('submits the selected payment term', async () => {
    const onPaymentTermChange = jest.fn()
    const user = userEvent.setup()

    render(
      <CheckoutForm
        paymentTerm="full_payment"
        onPaymentTermChange={onPaymentTermChange}
      />
    )

    expect(await screen.findByText('Full Payment')).toBeInTheDocument()
    await user.click(screen.getByText('50% Downpayment'))
    expect(onPaymentTermChange).toHaveBeenCalledWith('downpayment_50')
  })
})
```

Extend `tests/checkout-page-video.test.tsx` with:

```typescript
it('shows the downpayment payable amount in the summary by default', async () => {
  const page = await CheckoutPage()
  render(page)

  expect(screen.getByText('Pay Today')).toBeInTheDocument()
  expect(screen.getByText('₱1,950')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --runTestsByPath tests/checkout-form-payment-terms.test.tsx tests/checkout-page-video.test.tsx`
Expected: FAIL because `CheckoutForm` does not accept payment-term props and the summary is still static

- [ ] **Step 3: Update the page and form with minimal implementation**

In `src/app/checkout/page.tsx`, add payment-term state via a client wrapper or extracted client component. If keeping the page server-rendered, extract the interactive content into a new client component:

```typescript
'use client'

import { useState } from 'react'
import { CheckoutForm } from '@/components/landing/checkout-form'
import {
  DEFAULT_PAYMENT_TERM,
  CHECKOUT_BASE_PRICE,
  getCheckoutPayableAmount,
  type CheckoutPaymentTerm,
} from '@/lib/checkout-leads/payment-terms'

export function MarketingCheckoutContent() {
  const [paymentTerm, setPaymentTerm] = useState<CheckoutPaymentTerm>(DEFAULT_PAYMENT_TERM)
  const payableAmount = getCheckoutPayableAmount(paymentTerm)

  return (
    <>
      <CheckoutForm paymentTerm={paymentTerm} onPaymentTermChange={setPaymentTerm} />
      <div>
        <div>Product Price</div>
        <div>₱3,899</div>
        <div>Pay Today</div>
        <div>{new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(payableAmount)}</div>
      </div>
    </>
  )
}
```

In `src/components/landing/checkout-form.tsx`, add props and wire them into the form:

```typescript
import type { CheckoutPaymentTerm } from '@/lib/checkout-leads/payment-terms'

interface CheckoutFormProps {
  paymentTerm: CheckoutPaymentTerm
  onPaymentTermChange: (term: CheckoutPaymentTerm) => void
}

export function CheckoutForm({ paymentTerm, onPaymentTermChange }: CheckoutFormProps) {
```

Add the UI block before `Payment Method`:

```typescript
<div className="space-y-2">
  <Label className="text-white/70">Payment Terms</Label>
  <div className="grid gap-3">
    <button
      type="button"
      onClick={() => onPaymentTermChange('downpayment_50')}
      className={paymentTerm === 'downpayment_50' ? 'border-orange-500 bg-orange-500/10' : 'border-white/10'}
    >
      <p className="font-medium text-white">50% Downpayment</p>
      <p className="text-sm text-white/40">Pay ₱1,950 now, settle the remaining balance before setup completion.</p>
    </button>
    <button
      type="button"
      onClick={() => onPaymentTermChange('full_payment')}
      className={paymentTerm === 'full_payment' ? 'border-orange-500 bg-orange-500/10' : 'border-white/10'}
    >
      <p className="font-medium text-white">Full Payment</p>
      <p className="text-sm text-white/40">Pay the full ₱3,899 today.</p>
    </button>
  </div>
</div>
```

Pass the selected term through submit:

```typescript
const result = await submitCheckoutForm({
  name: formData.name,
  email: formData.email,
  phone: formData.phone,
  business_name: formData.businessName,
  selected_payment_method_id: formData.paymentMethodId,
  payment_term: paymentTerm,
  notes: formData.notes || undefined,
  meta: {
    eventId,
    ...getMetaBrowserData(),
  },
})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --runTestsByPath tests/checkout-form-payment-terms.test.tsx tests/checkout-page-video.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/checkout-form-payment-terms.test.tsx tests/checkout-page-video.test.tsx src/components/landing/checkout-form.tsx src/app/checkout/page.tsx
git commit -m "feat: add payment terms to marketing checkout"
```

---

### Task 5: Verify confirmation/admin compatibility and tighten regressions

**Files:**
- Modify: `src/app/checkout/confirmation/[ref]/confirmation-content.tsx`
- Modify: `src/app/superadmin/checkout-leads/components/checkout-lead-detail-panel.tsx`
- Test: `tests/unit/actions/checkout-leads.test.ts` or nearest checkout-leads action test file

- [ ] **Step 1: Write the failing display test**

Add a focused assertion in the nearest checkout confirmation or lead-detail test file:

```typescript
expect(screen.getByText('50% Downpayment')).toBeInTheDocument()
expect(screen.getByText('₱1,950')).toBeInTheDocument()
```

- [ ] **Step 2: Run the targeted test to verify it fails**

Run: `npm test -- --runTestsByPath tests/unit/actions/checkout-leads.test.ts`
Expected: FAIL because payment term is not surfaced yet, or skip this task if no confirmation/admin regression currently exists

- [ ] **Step 3: Surface payment term where amount is shown**

In `src/app/checkout/confirmation/[ref]/confirmation-content.tsx`, add a small label near the amount:

```typescript
<p className="text-sm text-white/50">
  Payment Terms: {lead.payment_term === 'downpayment_50' ? '50% Downpayment' : 'Full Payment'}
</p>
```

In `src/app/superadmin/checkout-leads/components/checkout-lead-detail-panel.tsx`, add:

```typescript
<div>
  <p className="text-xs uppercase tracking-[0.1em] text-muted-foreground">Payment Terms</p>
  <p className="font-medium">
    {lead.payment_term === 'downpayment_50' ? '50% Downpayment' : 'Full Payment'}
  </p>
</div>
```

- [ ] **Step 4: Run verification**

Run:

```bash
npm test -- --runTestsByPath tests/unit/lib/payment-terms.test.ts tests/unit/lib/checkout-leads-service.test.ts tests/checkout-form-payment-terms.test.tsx tests/checkout-page-video.test.tsx
npx eslint src/app/checkout/page.tsx src/components/landing/checkout-form.tsx src/app/actions/checkout-leads.ts src/lib/checkout-leads/checkout-leads-service.ts src/lib/checkout-leads/payment-terms.ts tests/unit/lib/payment-terms.test.ts tests/unit/lib/checkout-leads-service.test.ts tests/checkout-form-payment-terms.test.tsx tests/checkout-page-video.test.tsx
```

Expected: all targeted tests PASS and eslint exits `0`

- [ ] **Step 5: Commit**

```bash
git add src/app/checkout/confirmation/[ref]/confirmation-content.tsx src/app/superadmin/checkout-leads/components/checkout-lead-detail-panel.tsx
git commit -m "feat: surface checkout payment terms in follow-up flows"
```
