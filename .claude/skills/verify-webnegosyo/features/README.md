# WebNegosyo verification map (sample-demo)

The maintained recipes for proving the WebNegosyo web app works for a user. Read this index, run
`bin/doctor.sh`, then follow the matching feature file. Everything here drives **sample-demo** only.

## Baseline preconditions

- `bin/launch.sh` started the dev server on :3100 (webpack) and printed `EVIDENCE=test-results/verify/<run-id>`.
- `bin/doctor.sh` exits 0: routing, seed (4 QA items, 5 optional `qa_*` questions, 3 QA vouchers, 3 designs on), admin session.
- The seed is current: `npx tsx scripts/seed/sample-demo-qa.ts` (idempotent; restores designs + seeded orders).
- Admin journeys: `node .claude/skills/verify-webnegosyo/bin/db.mjs hold lift $STATE/hold.json` (the admin spec does it).
- Never drive a server this run did not start; never another tenant.

## Driving conventions

- Harness: Playwright via `playwright.verify.config.ts` (`drive/*.spec.ts`) and the repo QA spec
  `playwright.qa.config.ts`. Always `--output "$EVIDENCE/pw-<label>"`.
- Both devices: `--project=phone` (390×844, touch) and `--project=desktop` (1280×800).
- Prefer roles, accessible names, placeholders and `id`s listed in each file; no coordinates except map drags.
- Guest names start `QA-SEED`; phones are `+639000000xx`.
- After a mutation (designer publish, delivery edit, required question) restore: seed re-run or `bin/cleanup.sh`.

## Proof and skip reporting

- Screenshot the action and the resulting state (`$EVIDENCE/shots/<project>-<step>.png`).
- Back every screen claim with a service-role read (`bin/db.mjs order <id>` / `read`), saved as JSON in `$EVIDENCE`.
- A refusal = refusal message AND no new `orders` row (`qaOrderIds()` before/after).
- `$EVIDENCE/findings.jsonl` collects console errors, failed/4xx requests, CSP/Permissions-Policy reports.
- Behaviour that depends on an unapplied migration, or that the store's setup can't reach (Lalamove sandbox
  keys, MapKit on localhost), is reported **inconclusive** with the reason, never passed via another path.

## Feature entry contract

Each file: H1 + one paragraph, then `Sub-features`, `How to get to it (user POV)`,
`Driving it with Playwright`, `Gotchas`.

## Features

- [Storefront checkout](./storefront-checkout.md) — menu → cart → checkout for dine-in / pickup / delivery, address search + pin + rider notes, required questions, vouchers, totals.
- [Thank-you and tracking](./thank-you-tracking.md) — designed thank-you page, order tracking page, bill = stored total.
- [Admin Page Designer](./admin-page-designer.md) — checkout / thank-you / tracking editors, templates, publish, storefront step dots.
- [Admin order delivery card](./admin-delivery-card.md) — edit delivery details, send pin link, public pin page.
- [Admin sales reports](./admin-sales-reports.md) — overview + breakdowns, numbers = database.
- [Security headers](./security-headers.md) — baseline headers and CSP-Report-Only on every response; no violations that would block.
