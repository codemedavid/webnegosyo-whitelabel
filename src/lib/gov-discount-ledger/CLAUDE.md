# Senior/PWD sales book: rules for this folder

<!-- Moved verbatim from the root CLAUDE.md on 2026-11-11. The root file's rules for every change
     (Platform Supabase First, verification, conventions) still apply here. -->

## Senior/PWD sales book — security rules (2026-10-15 review)

- **Routes** (`src/app/api/gov-discounts/*`) go through `route-guards.ts`: member of the store AND the feature — `pos` for record / approve / ID-photo upload / approvers, `discount_review` for PIN set and Missing-from-book. The branch is the caller's (`caller-scope.ts`): a branch account acts only for its own; approvals take the CASHIER's branch, never the body's.
- **PINs**: Upstash limits per cashier and per approver (`onRedisFailure: 'instance'`), DB lock escalates 15 min → 1 h → 24 h (`lock_count`). Approvals are bound to claimants + cashier (`approval-binding.ts`, `sale_fingerprint`); consume compares exactly (no LIKE) and re-checks the amount. `gov_discount_approvals` SELECT is branch-scoped.
- **Ledger** (`record-service.ts`): a take-back is believed only if the order agrees (platform: exists + no government block or cancelled; else 409) — unreadable backends reverse but flag `reversal_unverified` (keeps the grant in "Needs a look"). Late older revisions and grants after a cancel are written AND reversed at once; a late take-back never touches a newer revision. Future times → server clock (`clock_ahead`); old times kept (`late_sync`, the device queue has no max age). Cancels with nobody signed in reverse as `SYSTEM_ACTOR`. The app queue flushes each order oldest revision first.
- **Missing from sales book** (`missing-*.ts`): platform orders with a government block and no grant row; "Record now" builds the record from the STORED order (web server action, app `GET/POST /api/gov-discounts/missing`).
- **Online claims are OFF by default** (`store_tax_profiles.online_claims_enabled`, `20261021120000`, applied): Senior/PWD is given on the register after the staff see the card; the web checkout shows only a "show your ID" note. The owner can switch online claims on in Tax & discounts (web + app). `priceCheckoutGovernment` refuses an online claim while it is off, so the preview AND `createOrderAction` ignore a claim from a stale tab — never rely on hiding the field.
- **Public checkout**: setup/preview/claim orders limited per IP (`gov-discount-checkout/rate-limits.ts`, fail open). The tracking payload never carries the order blob (test-pinned), so claimant IDs stay off the public page.
