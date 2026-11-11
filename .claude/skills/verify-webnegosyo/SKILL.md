---
name: verify-webnegosyo
description: "Drive the WebNegosyo Next.js web app (storefront checkout, thank-you/tracking, admin Page Designer, order delivery card + pin link, sales reports) in a real browser against the designated test store sample-demo on the shared platform Supabase, and capture evidence (screenshots, DB rows, console/network). Use before calling any web/UI/checkout/admin change done, for release QA, or when asked to prove a storefront or admin behaviour works. Refuses every tenant except sample-demo."
---

# verify-webnegosyo

Proves web behaviour on **sample-demo** (tenant `72a2d4c2-a1b7-4afe-a2a2-04ab74c094d2`, platform backend) through a
local dev server on **port 3100** of this worktree. The database is the SHARED production platform
Supabase: every store lives there. Hence the hard rules:

- **sample-demo only.** `bin/doctor.sh --tenant <x>` exits 3 for anything else; `bin/db.mjs` narrows every
  read of a tenant table to sample-demo and only writes three switches on sample-demo rows. Never point a
  spec at another slug, never run `playwright.config.ts` / `npm run test:e2e` (those seed fixed slugs).
- Orders you place must carry a `QA-SEED` customer name (the seed teardown deletes them). Phones are
  fake (`+639000000xx`). Never type a real phone number: SMS automations and loyalty codes text real people.
- Placing an order rings the demo owner's Android once (push trigger). Don't place orders in a loop.
- Product bugs are reported, not fixed, from inside a verification run.

All commands run from the repo root (`git rev-parse --show-toplevel`). `$BIN` = `.claude/skills/verify-webnegosyo/bin`.

## Launch

```bash
VERIFY_RUN_ID=<name> .claude/skills/verify-webnegosyo/bin/launch.sh
```

- Starts `PLATFORM_ROOT_DOMAIN=localhost:3100 npx next dev -p 3100` (webpack: **never `--turbopack`**, it
  refuses the symlinked `node_modules` of a worktree; never `npm run dev`, that adds `--turbopack`).
- Records the PID in `$STATE/server.pid` (`$STATE` = `${TMPDIR}/verify-webnegosyo-3100`), log in `$STATE/server.log`.
- **Ready** = `GET http://sample-demo.localhost:3100/menu` is 200 and names "Sample Demo" (first compile 1-4 min).
- Refuses (exit 2) when :3100 is held by a process it did not start. Never drive someone else's server.
- Prints `RUN_ID`, `EVIDENCE=test-results/verify/<run-id>`, `STATE`. Export `EVIDENCE` for the specs.
- Prereqs: `.env.local` (Supabase URL/anon/service keys, `API_SECRET` for tracking tokens), the QA seed
  (`npx tsx scripts/seed/sample-demo-qa.ts`, idempotent; see `scripts/seed/README.md`).
- Do not run `next build` in this worktree while a dev server or another agent uses `.next`.

## Doctor

```bash
.claude/skills/verify-webnegosyo/bin/doctor.sh
```

Read-only. PASS/FAIL/WARN for: tenant guard; :3100 listening and descended from the recorded PID;
listener cwd = this worktree; host routing (`sample-demo.localhost:3100/menu` names the store); sample-demo
resolves to one platform tenant; seed present (4 QA items, 5 `qa_*` questions all optional, 3 QA vouchers,
3 Page Designer designs enabled); subscription `paid_through`; an admin magic-link session reaches
`/admin/orders` (`bin/admin-check.ts`; verdict `ok | on-hold | login | error`). Exit 0 = worth driving.
Run it first, and again whenever anything looks off.

sample-demo's subscription is overdue (paid_through 2026-10-02 when written): every admin page redirects
to `/sample-demo/subscription`. Lift it for the run and let cleanup put it back:
`node $BIN/db.mjs hold lift $STATE/hold.json` (the admin drive spec does this in beforeAll/afterAll).

## Drive

Harness: Playwright 1.62 (Chromium), two projects: `phone` 390×844 (touch, DPR 2) and `desktop` 1280×800.
The admin session is a service-role magic link verified into `@supabase/ssr` cookies
(`tests/e2e/admin-session.ts`, user `admin@sampledemowebnegosyo.com`; no email, no password change).

```bash
export EVIDENCE=test-results/verify/<run-id>
# Release checks shipped with this skill (drive/*.spec.ts):
npx playwright test -c .claude/skills/verify-webnegosyo/playwright.verify.config.ts \
  --output "$EVIDENCE/pw-<label>" [--project=phone|--project=desktop] [storefront|admin] [-g "<test title>"]
# The repo's broader QA journey (tests/e2e/sample-demo-qa.spec.ts):
QA_SHOTS_DIR="$EVIDENCE/qa-shots" npx playwright test -c playwright.qa.config.ts --output "$EVIDENCE/pw-qa"
```

- **Always pass `--output` inside the evidence dir.** Playwright empties its output dir at start; the
  default is `test-results/`, which holds every earlier run's evidence.
- Run storefront `desktop` and `phone` as separate invocations, each project's `order totals` test before
  its `required question` / `delivery` tests (they replay that test's captured `createOrderAction` body).
- Never run the QA spec and `admin.spec.ts` at the same time: both lift/restore `paid_through`.
- `drive/lib.ts` is the toolbox: `watch(page)` (console errors, page errors, failed + ≥400 requests,
  CSP/Permissions-Policy console lines, `securitypolicyviolation` events, every server-action POST with
  its `Next-Action` id and body), `replayAction` (re-POST a captured server action from inside the page,
  same origin + headers, i.e. a forged/stale submit), `fillCartToCheckout`, `fillDineIn`,
  `chooseCashAndSubmit`, `qaOrderIds`, `dbHelper`, `note` (→ `$EVIDENCE/findings.jsonl`).
- Chrome MCP works too for ad-hoc looks: open `http://sample-demo.localhost:3100/...`, then
  `read_console_messages` / `read_network_requests`. Admin needs the cookies above (set them with
  `javascript_tool` is NOT possible for httpOnly-less cookies on another tab domain; prefer Playwright).

Stable handles (from the specs): buttons `Add QA Fries`, `Increase quantity`, `Add To Cart`, `Go back`,
`Proceed to Checkout`, order types `Dine In` / `Pick Up` / `Delivery` (exact), placeholders
`Enter your name`, `Enter table number`, `9XXXXXXXXX`, `Enter code`, `/delivery address|Search your street/i`;
`Have a voucher?`, `Apply`, text `PAY AS YOU ORDER`, submit `/^(Proceed to Payment|Complete Order|Send Order via Messenger)/`;
admin: order row text `QA-SEED <Guest>`, tab `Delivery`, region `Delivery details`, `Edit details`,
`#delivery-store-note`, `Save`, `Send pin link`, `#pin-link-<orderId>`; pin page `Set your exact spot`,
`#pin-landmark`, `Send my spot`; Page Designer `Templates`, `Use the Step by step template`,
`Publish`/`Published`, tabs `Layers`/`Look`; storefront steps `ol[aria-label="Steps"] [data-part="step"]`.
Feature recipes: [`features/README.md`](features/README.md).

## Evidence

`test-results/verify/<run-id>/` (cleanup never deletes it):

- `shots/<project>-<step>.png` — action AND resulting state, phone + desktop.
- `findings.jsonl` — one JSON line per observation (browser errors, policy reports, DB reads, verdicts).
- `*.json` — DB rows read with the service role after the action (`orders`, `order_items`,
  `customer_data`, `discount_data`), captured server-action replies, headers, step-dot styles.
- `verify-report.json` — Playwright JSON report; `pw-*/` traces of failures; `server.log` (copied at cleanup).
- `qa-shots/` — the repo QA spec's screenshots.

Proof standard: the real user path; a screen claim is backed by a DB read (`node $BIN/db.mjs order <id>`,
`node $BIN/db.mjs read <table> '<postgrest query>'`); a refusal is proved by "no new row" as well as the
message. A behaviour that depends on an unapplied migration is **inconclusive**, never passed.

## Cleanup

```bash
.claude/skills/verify-webnegosyo/bin/cleanup.sh [--keep-server] [--no-seed]
```

Restores a temporarily required `qa_*` question (`$STATE/question.json`) and `paid_through`
(`$STATE/hold.json`), re-runs the idempotent seed (designs, seeded orders + delivery details, questions
optional), copies `server.log` into the evidence dir, kills ONLY the recorded PID tree, confirms :3100 is
free, and prints the evidence path. QA-SEED orders a run placed stay until
`npx tsx scripts/seed/sample-demo-qa-teardown.ts` (which also deletes the seed; re-seed afterwards).

## Helpers

| Command | What |
|---|---|
| `$BIN/launch.sh` | start + wait ready (above) |
| `$BIN/doctor.sh [--tenant sample-demo]` | read-only health; exit 0 = drive |
| `$BIN/cleanup.sh` | restore + stop + keep evidence |
| `node $BIN/db.mjs tenant` | resolve sample-demo (refuses non-platform) |
| `node $BIN/db.mjs read <table> '<query>'` | service-role read, auto-scoped to sample-demo |
| `node $BIN/db.mjs order <id>` | order row + its items |
| `node $BIN/db.mjs hold lift\|restore $STATE/hold.json` | subscription hold for admin pages |
| `node $BIN/db.mjs question require qa_<name> $STATE/question.json` / `question restore $STATE/question.json` | make one seeded question required, put it back |
| `npx tsx $BIN/admin-check.ts [/admin/path]` | does the admin session reach the page |

## Gotchas

- `scripts/seed/.sample-demo-snapshot.json` is machine-local and holds the PRE-seed tenant columns. If
  this worktree has none, copy it from the checkout that first seeded (2026-11-09: `../whitelabel-qa`)
  before running the seed, or the seed snapshots the already-seeded values and teardown "restores" them.
- Dev requests can exceed the 10 s timed fetch while webpack compiles: a first hit may 500 with
  `Timed out after 10000ms`. Re-request once compiled before calling it a bug.
- In dev, CSP-Report-Only logs `'unsafe-eval'` violations from webpack's eval source maps; that is dev-only.
- sample-demo is a Lalamove store with sandbox keys in production mode: Lalamove quotes fail, so a
  delivery order cannot be placed through the UI; prove delivery pricing/refusals with a replayed call.
- Delivery's own required question "Date & Time" is a NUMBER field; pickup's required "Pickup Date & Time"
  `<select>` may have no options, which blocks pickup orders.
- A checkout's thank-you page shows for the seeded 8 s countdown, then tracking takes over.
- Machine load matters: with other builds/renders running (load avg 20-40), next dev disposes idle routes and
  recompiles them for 1-5 min, may restart itself, and server actions can hang ("failed to forward action
  response", POSTs redirected to `/login` when the session check times out). Symptoms are `page.goto` timeouts
  and missing sheets, not app bugs. Fix: `bin/cleanup.sh` then `bin/launch.sh`, warm routes with curl
  (`/menu`, `/cart`, `/checkout`, `/menu/item/<id>`), re-run only the failed tests. Check `uptime` first.
- `npx playwright test --project desktop storefront` treats `storefront` as a second project; write `--project=desktop`.
- The repo QA spec's template step clicks a page-wide `Apply` (the canvas voucher button) and logs
  `designer-step-failed`; the template is applied anyway. The verify spec scopes the confirm to a dialog.
- Reports take `?period=today` (not `preset`).
