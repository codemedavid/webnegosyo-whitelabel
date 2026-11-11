# Security headers

Every response carries `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` and a
`Content-Security-Policy-Report-Only`; no `X-Powered-By`; login/admin add `frame-ancestors 'self'`. Browsing
must log no CSP/permissions violation that would break the page once the CSP is enforced.

## Sub-features

- `headers` storefront, checkout, tracking, login, admin redirect, API.
- `violations` console `[Report Only]` lines and `securitypolicyviolation` events during every drive.
- `same-origin` storefront and admin server actions answer 200 (no 403) after the hardening.

## How to get to it (user POV)

- Any page; DevTools → Network → response headers; Console.

## Driving it with Playwright

Preconditions:

- Server up.

- **Headers.** `npx playwright test -c .claude/skills/verify-webnegosyo/playwright.verify.config.ts --output "$EVIDENCE/pw-headers" storefront -g "security headers"` → `<p>-security-headers.json`.
- **Violations.** Every drive's `watch()` writes `policy-console(...)` and `csp-violation(...)` findings; grep `$EVIDENCE/findings.jsonl`.
- **Same-origin.** `order totals` (checkout action), `admin -g "page designer"` (`admin-actions` finding lists action statuses), delivery card save.

## Gotchas

- Dev only: webpack's eval source maps trigger `script-src 'unsafe-eval'` reports. Judge production CSP on a preview deploy.
