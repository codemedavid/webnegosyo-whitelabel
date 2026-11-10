# sample-demo QA seed

Seeds the **`sample-demo`** store (platform backend) with data that exercises the
Nov 2026 features. Both scripts refuse to run against any other slug and print exactly what they
will write before writing it.

```bash
npx tsx scripts/seed/sample-demo-qa.ts --dry-run   # print the plan only
npx tsx scripts/seed/sample-demo-qa.ts             # write (idempotent: re-run = update, not duplicate)
npx tsx scripts/seed/sample-demo-qa-teardown.ts    # delete everything it made, restore tenant columns
```

Both read `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from `.env.local`.

## What it writes

| Rows | What |
|---|---|
| 1 category, 4 menu items | `QA Seed Menu`: Chicken Inasal (variation types Size/Part + add-ons), Iced Coffee (legacy variations + add-on), Fries, Cheese Bread |
| 5 checkout questions | `qa_*` on the existing order types: choice + checkbox (delivery), date + choice (pickup), checkbox (dine-in), all optional |
| 3 vouchers | `QA10OFF` (10%, max ₱100), `QA50FRIES` (50% off ONE QA Fries, `max_discounted_units = 1`), `QA20PESO` (₱20 off, min ₱150) |
| 2 ingredients | QA Bread Roll (3 pc received) → recipe of QA Cheese Bread; QA Chicken Leg (20 pc) → recipe of QA Chicken Inasal. The bread runs out on the seeded orders, so Cheese Bread is auto-86'd |
| 12 orders | `QA-SEED <name>`, pending → delivered/cancelled; 6 delivery (5 pinned with unit / landmark / rider note, 1 with a store note, 1 "can't find my place") |
| tenant columns | checkout / thank-you / tracking designs from the real `delivery-app` templates (validated with the publish schema + `pageDesignProblem`), `tracking_style`, thank-you countdown 8 s, `auto_86_enabled` |

Every row has a deterministic id derived from `QA-SEED:<key>` (`sample-demo-qa-lib.ts`), so a re-run
updates the same rows, and re-running also **restores** the seeded designs and orders after manual
testing changed them.

## Safety

- Guest phones are fake (`+63 900 000 00xx`), `sms_consent = false`, and no `customers` rows are
  created, so SMS automations never text anyone.
- Inserting orders fires the order push trigger: sample-demo has one merchant device in `push_tokens`
  (the demo owner's Android), which rings once per new order.
- Stock changes go through `stock_movements` (service role); each live seeded order is then spent
  through checkout's own claimed depletion (`applyOrderStockBestEffort`; a re-run is a no-op), because
  the background sweep skips orders older than 24 hours.
- Tenant columns are saved to `scripts/seed/.sample-demo-snapshot.json` (gitignored) before the first
  write; teardown restores them. The snapshot is machine-local: run teardown from the same checkout.
  Pre-seed values (2026-11-09): all three `*_design` null and `*_design_enabled` false,
  `tracking_style` `{}`, `confirmation_redirect` `instant` / 5 s, `auto_86_enabled` false.

Teardown also deletes orders an E2E run placed with a `QA-SEED` name, fake-phone guests, and the QA
login `qa+sample-demo@webnegosyo.test` if one was ever created.

## Browser QA

`tests/e2e/sample-demo-qa.spec.ts` (config `playwright.qa.config.ts`) drives the storefront and the
admin against this seed on phone (390×844) and desktop (1280×800):

```bash
PLATFORM_ROOT_DOMAIN=localhost:3100 npx next dev -p 3100   # Turbopack refuses a symlinked node_modules in a worktree
QA_SHOTS_DIR=/tmp/qa-shots npx playwright test -c playwright.qa.config.ts
```

The admin session comes from a service-role magic-link token (no email, no password change). Sample
Demo's subscription is overdue, so the admin tests move `tenant_subscriptions.paid_through` a week
ahead for the run and put it back afterwards; they then re-run this seed to undo designer and delivery
edits.
