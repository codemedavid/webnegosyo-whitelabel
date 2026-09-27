# Web security and maintainability pass — 2026-09-27

Four agent assignments covered authorization, uploads/remote input, order subscriptions, and shared request handling. They ran in two waves because the session supports three concurrent subagents. Existing workspace edits were preserved. This was a source and regression-test review, not a production penetration test.

## Confirmed findings and changes

| Area | Finding | Change |
| --- | --- | --- |
| ImageKit upload signing | Legacy GET issued unbound upload signatures to anonymous callers by default, and authorized tenants could also choose another tenant's asset path. | Retired GET signing. Staff keep the parameter-bound POST flow; the customer mobile caller now uses the bounded payment-proof upload endpoint. |
| Remote image imports | Initial URL checks could be bypassed through redirects or DNS/private-address variants; the body was buffered before enforcing its size cap. | Validate the address inside the actual socket DNS lookup, check each redirect, reject special-use addresses, cap streamed bytes, redirects and total duration. |
| Pairing rules | Administrative rule reads lacked authorization; shared-tag recommendations could include another tenant's items. | Require the analytics permission, validate tenant UUIDs before raw filter interpolation, and tenant-scope all target resolution paths. |
| Receipt publishing | Tenant membership alone allowed staff without store setup access to publish receipt layouts. | Require `store_setup` for saves. Receipt printing remains available. |
| MCP OAuth consent | A logged-in merchant visiting an authorization link immediately granted access to a dynamically registered client; restricted staff could also mint full merchant credentials. | Show explicit approval, require `store_setup`, validate the trusted origin and browser/user/request binding, recheck tenant access, and atomically consume an expiring consent record. The escaped form blocks framing and does not run scripts. |
| MCP OAuth code exchange | Concurrent exchanges could both read an unused authorization code and issue credentials. | Atomically claim the unconsumed, unexpired code and require a returned row before issuing tokens. |
| Staff default screens | The merchant app's Vouchers screen was absent from the web and staff-management function registries. | Add the screen with the matching vouchers permission and workspace in both registries. |

## Refactors

- `use-realtime-orders`: an effect owns its concrete client/channel pair; callback and branch-scope changes no longer reconnect the stream. Disposed subscriptions ignore late events and connection-status callbacks.
- `supabase/timed-fetch`: keep request invocation inside the cleanup scope, remove caller abort listeners on every completion path, preserve abort reasons, and follow native Request/init signal precedence. Existing HTTP 408 timeout behavior remains intact to avoid Supabase authentication retry storms.

## Dependencies

The root npm audit initially reported **36 affected dependency entries**: 3 critical, 13 high, 19 moderate and 1 low. After updates it reports **zero**. This does not imply that every advisory was exploitable in this application or that all application vulnerabilities are eliminated.

- Next.js and its ESLint configuration: `15.5.9` → `15.5.26`; compatible transitive updates recorded in the lockfile.
- Override Next.js's pinned PostCSS with `8.5.28`.
- Override ExcelJS's UUID dependency with `11.1.1`, which keeps the CommonJS `v4` API used by ExcelJS. Verified conditional-format ID generation and the existing real XLSX round-trip tests.
- The existing ExcelJS dependency and other preexisting package edits were preserved.

References: [Next.js image-optimization advisory](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4), [UUID security backport](https://github.com/uuidjs/uuid/releases/tag/v11.1.1), [PostCSS release](https://github.com/postcss/postcss/releases/tag/8.5.28).

## Verification and limits

Baseline Jest: 913 passed suites, one failed suite, one skipped suite; the failure was the Vouchers registry mismatch fixed above. Tests were added for the confirmed security and lifecycle failures before implementing their fixes.

Final verification:

| Check | Result |
| --- | --- |
| `npm test -- --maxWorkers=2` | **920 suites and 10,245 tests passed**; one suite/eight tests skipped, zero failures. |
| `npx tsc --noEmit --incremental false` | Passed. |
| ESLint on every changed code/test file | Passed, zero warnings/errors. |
| `npm audit --json` | Zero reported vulnerabilities in the root dependency tree. |
| Final production compile mode | Passed. |
| Repository-wide `npm run lint` | 26 preexisting errors remain. |
| Whitespace checks on changed tracked files | Passed. |

The first combined run exposed the second Vouchers registry in the staff-management function; after updating it, all 61 focused registry/staff tests and the final full suite passed.

Production compilation with `next build --turbopack --experimental-build-mode compile` passed with the final application changes. This mode does not validate live database contracts or full production prerendering. No production data, migrations, deployments, commits, or external messages were changed.

Root lint already had 26 errors before this work, largely in separate app tests and CommonJS tooling; these remain. Root TypeScript initially had 12 errors from desktop tests importing desktop sources without their ambient Electron/Vite declarations. A test-only declaration file now references the desktop project's actual declarations, and `tsc --noEmit --incremental false` passes without weakening type checks.

Installed customer/merchant mobile versions still using legacy GET signing must be updated: that endpoint now refuses credentials. Current customer source has been migrated; current merchant source already uses POST.

MCP connectors now require an explicit approval click and the merchant's `store_setup` permission. Consent records reuse the existing OAuth code ledger under a scope rejected by token exchange; no schema migration is needed. Redirects use the configured canonical SmartMenu origin.

Deployment includes the root web dependency/code changes and the `manage-staff` function's matching Vouchers registry entry; deployment was not performed in this session.

Facebook OAuth state is signed and time-limited but lacks browser/user binding. The reviewed attack requires a valid state obtained by an administrator of the same tenant, or a targeted superadmin session. This remains a follow-up concern; a speculative customer-role bypass was ruled out because the database restricts `app_users` to admin/superadmin roles.

Detailed command logs for this local run are under `/tmp/whitelabel-audit/` (temporary, not committed).
