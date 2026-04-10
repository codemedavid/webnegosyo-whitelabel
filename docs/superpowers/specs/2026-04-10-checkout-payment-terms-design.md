# Checkout Payment Terms — Design Spec

**Date:** 2026-04-10
**Status:** Draft

## Overview

Add a required payment terms choice to the marketing checkout at `/checkout` so customers can choose either:

- `50% Downpayment`
- `Full Payment`

The selected term must change the payable amount shown on the checkout page and the amount saved for the resulting checkout lead.

## Current State

- [`src/app/checkout/page.tsx`](/Users/codemedavid/Documents/whitelabel/src/app/checkout/page.tsx) renders a static summary with a hardcoded `₱3,899` price.
- [`src/components/landing/checkout-form.tsx`](/Users/codemedavid/Documents/whitelabel/src/components/landing/checkout-form.tsx) submits customer details and selected payment method.
- [`src/app/actions/checkout-leads.ts`](/Users/codemedavid/Documents/whitelabel/src/app/actions/checkout-leads.ts) forwards the form payload to the checkout lead service.
- Checkout leads currently assume a single amount for all submissions.

## Product Rules

- Base product price remains `₱3,899`.
- `Full Payment` means payable amount is `₱3,899`.
- `50% Downpayment` means payable amount is half of `₱3,899`, rounded to the nearest peso.
- For the current price, the downpayment payable amount is `₱1,950`.
- Payment terms are required before submission.

## UX Design

### Checkout Form

Add a new required `Payment Terms` radio-card section to the existing form, placed before `Payment Method`.

Options:

- `50% Downpayment`
  - Supporting copy: `Pay ₱1,950 now, settle the remaining balance before setup completion.`
- `Full Payment`
  - Supporting copy: `Pay the full ₱3,899 today.`

Behavior:

- Default selection should be `50% Downpayment` so the lower payable amount is visible immediately.
- Changing the term updates the checkout summary amount in real time.
- Validation fails if no term is selected.

### Checkout Summary

The summary card should distinguish between:

- Product price: `₱3,899`
- Pay today: dynamic based on selected payment term

For `50% Downpayment`, add a short note explaining that the remaining balance will be coordinated after the initial payment.

### Confirmation Page and Admin Follow-Up

- The saved lead amount becomes the payable amount chosen during checkout.
- Confirmation should continue to show the payable amount the customer selected.
- Admin views should surface the chosen payment term alongside the amount so the team knows whether the lead is partial or full payment.

## Data Model

Extend checkout leads with a persisted payment term value.

### `checkout_leads`

Add:

- `payment_term` — text, not null

Allowed values:

- `downpayment_50`
- `full_payment`

Interpretation:

- `amount` remains the amount expected for this lead's immediate payment, not always the full product price.
- Historical leads without `payment_term` should be backfilled or treated as `full_payment` if migration strategy requires compatibility.

## Technical Approach

### Shared Pricing Constants

Create a small shared pricing module so the same calculation is used by:

- marketing checkout page
- checkout form submission
- confirmation page or admin displays if needed

Recommended exports:

- base price constant
- payment term enum/union
- helper that returns payable amount for a term

### Page and Form Composition

- Lift selected payment term state to [`src/app/checkout/page.tsx`](/Users/codemedavid/Documents/whitelabel/src/app/checkout/page.tsx).
- Pass the selected term and setter into [`src/components/landing/checkout-form.tsx`](/Users/codemedavid/Documents/whitelabel/src/components/landing/checkout-form.tsx).
- Keep the existing payment-method loading and selection flow unchanged.

### Submission Flow

Extend the form payload in [`src/app/actions/checkout-leads.ts`](/Users/codemedavid/Documents/whitelabel/src/app/actions/checkout-leads.ts) and the lead service so submission includes:

- `payment_term`
- computed payable `amount`

Server-side logic should recompute the amount from `payment_term` rather than trusting a client-provided number.

## Error Handling

- If payment terms are missing or invalid, block submission with a form error.
- If server-side pricing validation fails, return a submission error instead of creating a lead with inconsistent data.

## Testing

- Add a form regression test covering payment term selection and validation.
- Add a checkout page regression test confirming the summary amount changes when the selected term changes.
- Add a server-side unit test confirming `downpayment_50` resolves to `₱1,950` and `full_payment` resolves to `₱3,899`.

## Out of Scope

- Split payment schedules beyond 50% downpayment versus full payment
- Automatic tracking of remaining balance collection
- Changes to tenant checkout flows under [`src/app/[tenant]/checkout/page.tsx`](/Users/codemedavid/Documents/whitelabel/src/app/[tenant]/checkout/page.tsx)
