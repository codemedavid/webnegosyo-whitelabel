# Admin Page Designer

The owner edits the checkout, thank-you and tracking pages in a full-screen editor (`/admin/page-designer/<page>`):
templates, layers, Look tab, block styles, Show for/when, checkout questions, preview, publish. A published
`steps` checkout shows step dots on the storefront.

## Sub-features

- `render` all three editors load with the seeded design.
- `toolbar` Publish stays on screen at 1280×800 with the admin sidebar open.
- `templates` Templates → `Use the Step by step template` replaces the checkout design.
- `publish` Publish → `Published`; `tenants.checkout_design` page.layout = `steps`; server action 200 (no 403).
- `step-dots` storefront checkout shows `ol[aria-label="Steps"] [data-part="step"]`; upcoming dots use `color-mix(... text ...)`, not `--co-border`.

## How to get to it (user POV)

- Admin sidebar → Store Setup → Page Designer, or `http://sample-demo.localhost:3100/admin/page-designer/checkout|thank-you|tracking`.
- Page switcher in the editor toolbar: `Order tracking`, `Thank-you page`, `Checkout`.

## Driving it with Playwright

Preconditions:

- Hold lifted (admin spec does it), designs seeded.

- **Render + toolbar.** `npx playwright test -c .claude/skills/verify-webnegosyo/playwright.verify.config.ts --output "$EVIDENCE/pw-admin" --project=desktop admin -g "page designer"`:
  screenshots `desktop-p1-designer-<page>.png`, finding `designer-<page>` with Publish's right edge vs window width.
- **Publish steps.** Same test: Templates → Step by step → Publish → reads `tenants.checkout_design`.
- **Storefront dots.** Same test, fresh customer context: cart → `/checkout`, saves `desktop-step-dots.json`
  (style + computed background per dot). Restores the seeded design by re-running the seed in `finally`.
- **Broader designer tour.** The repo QA spec's admin test (block style, Show for, questions editor, Look, Preview).

## Gotchas

- The thank-you and tracking toolbars carry an extra `Showing: <state>` select; check Publish on those, not just checkout.
- Templates apply without a confirm dialog; never click a page-wide `Apply` (the canvas has a voucher `Apply`).
- The editor is desktop-only; on phone, record render + toolbar only.
- Publishing changes the live sample-demo storefront until the seed is re-run.
