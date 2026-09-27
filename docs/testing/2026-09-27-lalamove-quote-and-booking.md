# Lalamove quotation and booking audit

The reported failure is reproducible in the checkout and order-action tests.
The original server guard only verified quotations when the caller supplied a
fee or quotation ID. Omitting both created a successful delivery order. The
customer UI also allowed proceeding, submitting, and QR handoff without a quote.

## Enforced behavior

- Lalamove checkout requires a signed quotation for the same tenant, quotation
  ID, delivery address and map pin. The signed price is authoritative, including
  a legitimate zero price. Unknown order types cannot disable the delivery gate.
- Signatures expire at the provider's expiry, capped at five minutes. Missing
  signing configuration, incomplete provider prices and invalid quotes refuse
  checkout. Existing v1 signatures require refreshing the quotation.
- Address changes immediately invalidate the displayed quote. Late responses
  cannot replace a newer route's quote. Expired/failed quotes have an explicit
  retry action, and submission rechecks expiry after stock preflight.
- QR handoff cannot carry quote verification, so Lalamove QR checkout is blocked.
- Web and merchant-app bookings share an atomic Postgres claim before the paid
  provider call. Convex uses internal transactional claim/complete/release
  mutations. Concurrent requests cannot book a second rider.
- Known failures before the booking request release the claim. An uncertain
  provider result or failure saving a booked rider preserves `BOOKING`; the
  merchant must check Lalamove before another booking. Claims deliberately do
  not expire automatically. A confirmed provider reference is shown when its
  database save fails. Operational reconciliation is manual.
- Requotes and status writes check the current booking so stale requests cannot
  replace a new booking. Web sync, cancellation and tips verify the provider
  reference belongs to the selected tenant/order.
- App operations use one immediate execution guard, including auto-sync, to
  prevent repeated confirmation callbacks and overlapping requests. The app
  service handles session errors and bounds response-body reading with its
  request timeout.

## Direct-write protections and compatibility

The separate `mobile/` customer app has no Lalamove quotation flow. Platform
Lalamove delivery checkout now directs customers to the store website before
payment instructions and again before submission. Its
Supabase migration restricts anonymous direct inserts to a known non-delivery
order type owned by the same tenant, preserving pickup and merchant/server
writes under their existing policies.

Convex has no authoritative order-type catalog, so caller-supplied names or
`source` values cannot distinguish a legitimate pickup from a disguised delivery.
For Lalamove-configured Convex stores, public order creation now requires a
verified merchant identity, including during soft authentication rollout.
Customer mobile checkout for those stores (including pickup) directs to the
website. Web orders use `createOrderInternal` with server-held credentials;
authenticated merchant POS and non-Lalamove ordering retain their paths.

## Verification and rollout

Regressions cover missing quotes, forged fees, changed routes, expiry, signed
zero fees, stale responses, repeated confirmations, cross-device booking races,
failed persistence, direct-write bypasses and tenant/booking ownership.

Run:

```sh
npx jest --config jest.config.cjs --runInBand --testPathPatterns='lalamove|delivery-quote|create-order-price-integrity|checkout-summary-contract|checkout/use-checkout-server-data'
npm --prefix webnegosyo-app test -- --runInBand lib/lalamove-service.test.ts components/LalamoveDeliveryCard.test.tsx lib/lalamove-status.test.ts
node tests/sql/run-lalamove-order-insert.cjs
npm run convex:prebundle
```

The isolated SQL test requires `@electric-sql/pglite` (it may be supplied through
`NODE_PATH` as with the existing SQL harnesses). It makes no production calls.

Validation completed: 95 checkout/backend suites (837 tests), 47 merchant-app
tests, eight isolated PostgreSQL RLS checks, root and Convex TypeScript checks,
targeted ESLint, and Convex bundle generation passed. The final native
pre-payment guard added one regression after that broader run; all 18 tests in
the four native checkout suites passed afterward.

Before these protections are live, deploy the web code with `API_SECRET` set,
apply `20260927150000_lalamove_customer_order_guard.sql`, deploy the updated
Convex template to existing tenant deployments, and release both relevant
mobile apps. The generated bundle only packages the template; it does not
deploy existing tenants. No production orders, rider bookings or deployments
were made during this audit. The original reported order was not inspected
because no order identifier was supplied.
