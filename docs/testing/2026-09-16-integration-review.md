# Pending-work integration review — 2026-09-16

Base: `50bde01b` (main and fetched origin/main). GitHub had no open PRs at the start. Integration branch: `integrate/review-all-pending-2026-09-16`.

## Scope and branch audit

The initial main checkout had 154 tracked modifications and new source, migrations, tests, and local artifacts. The storefront-foundation worktree held an additional unfinished storefront refactor; its code and tests were ported while preserving the root checkout's add-on changes. Original worktrees and branches are retained.

Branches already ancestral to main need no replay. Non-ancestral commits were checked against merged PRs, patch equivalence, and current implementations; commit counts alone overstate pending work because several PRs were squashed or rebased.

| Branch/work | Disposition |
| --- | --- |
| Current uncommitted web, Convex, merchant app work | Integrated with review corrections and tests. |
| refactor/storefront-foundation worktree | Integrated runtime/branding/cart refactor; fixed stale tenant request completion. |
| seacook-qa-fixes | Integrated missing tenant-payload sanitization, stock-ledger superadmin policy, preview recovery, live inventory health, tenant search/redirect and compatible image/CSS/title/pixel fixes. Retained newer scoped font and single-layout runtime. |
| category-studio-management | Category editor/export already in #42/#43. Integrated missing shifts, per-staff totals, unassigned-order filter and splash scroll lock with current authorization and settlement data. Newer Team management retained. |
| feat/webnegosyo-profit-analytics | Integrated missing daily order numbers and product profitability insights with atomic counters and existing backend contracts. Obsolete flash/registration/build-profile changes superseded. |
| origin/claude/security-audit-bugs-CiG3F | User-list authorization, app_users lookup and menu route guard already addressed. Ported missing removal of unsafe time-based Messenger order matching. |
| feat/order-visibility-notifications | Old WIP superseded by #45 Lalamove overhaul, current settings/panels and global order alerts. |
| updates/boost-sales-and-ui-improvements | Lead client/server deduplication and checkout events are retained in current Meta infrastructure; restored the missing landing ViewContent event. Obsolete pricing/video/layout not restored. |
| welcome-full-screen | Earlier layout alternative superseded by #45 outer backdrop with readable inner column. |
| feat/imagekit-migration | Already integrated through #4; patch equivalent. |
| feat/tenant-staff-management | Equivalent commits integrated through #21/#22 and newer Team implementation. |
| feature/superadmin-mcp-supabase, superadmin-mcp-auth-deploy | Superseded/integrated by #48. |
| fix/export-share-missing-native | Export fix integrated through #41/#43; missing unassigned filter covered by category work. |
| fix/ios-hide-sms-campaigns | Integrated through #37. |
| presell-stock | Integrated through #49; local unique commits patch equivalent. |
| test/voucher-web-ui | Integrated through #35. |
| origin/feat/kiosk-mode | Integrated through #27; current confirmation retains countdown and new-order action. |
| origin/feat/loyverse-integration | Integrated through #39 and subsequent webhook/confirm improvements. |
| origin/feat/unified-modifier-groups | Remaining non-ancestor is a merge commit without unique patch content. |

## Corrections found during review

- Preserve stock consumed after a menu editor was opened; omitted unchanged counters merge under the database row lock. Explicit quantity adjustments remain supported.
- Keep a newly created menu item's ID when its allocation save fails, so retry cannot create another item.
- Read current loading state/timestamps when mobile screens regain focus.
- Use settlement time for delayed Convex loyalty orders and their initial tender, normalize public read timestamps, and preserve actual later refund/collection times. SQL orders and payments use the same settlement timestamp.
- Resolve Convex recovery credentials through protected tenant secrets rather than removed public tenant columns.
- Ignore stale storefront tenant fetches after navigation.
- Apply branch filtering before Convex order limits so another busy branch cannot truncate shift history.
- Remove Messenger's recent-order fallback: message timing cannot prove customer ownership.
- Validate image length before the data-URL regex, preventing oversized-input stack failure.
- Keep reusable OAuth rules outside Next route exports; repair stale test mocks and typed fixtures.
- Remove obsolete kitchen tutorial timer prop; satisfy selected-state UI checks.

An initial review concern about bundle reward IDs was withdrawn after schema verification: bundles are separate catalog entities, not `menu_items.is_bundle`. No unsupported column is queried. Presell rewards remain excluded by the existing API, with matching picker filtering.

## Local artifacts

The spreadsheet `IMM_Items_2026-09-04_20-14-07.xlsx`, website subtitle `.srt`, `mascot-loading.mp4`, empty `seacook-qa-grok-code-handoff.tar.gz`, and `.codex/config.toml` are local inputs/tool configuration, not referenced application source. They are retained locally and excluded from the PR. No existing worktree or branch is deleted.

## Deployment boundaries

This is a code integration, not a live database migration or feature-flag rollout. Apply all missing platform migrations in timestamp order (including older dated shift and stock-policy migrations) and deploy Convex schema v31 / tenant-Supabase schema v3 through the established deployment flow. Loyalty quote/new-settlement flags fail closed, but management RPCs and maintenance cron still require their migrations. See `docs/loyalty-claims-integration.md`. SQL harnesses use isolated PGlite and do not establish real multi-session contention, handset SMS delivery, or production ingress readiness.

## Verification

- Web/Convex Jest: 743 suites passed, 8,151 tests passed; one existing suite / eight tests skipped. No failures.
- Merchant app Jest: 356 suites, 4,503 tests passed. Runner uses `--forceExit` after completion because existing asynchronous handles remain.
- Production `npm run build`: passed compilation, lint/type validation, page generation and optimization. Existing lint warnings remain; no lint errors.
- Root, Convex, merchant app and customer mobile TypeScript checks: passed. Customer mobile has no standalone test script; shared daily-number enrichment/display logic is covered by root tests.
- Nine isolated SQL harnesses passed: Convex auth, loyalty management, order projection, quote issuance, wallet, settlement, simple option stock, daily order numbering, and staff shifts. `NODE_PATH=/private/tmp/whitelabel-auth-regression/node_modules` supplies PGlite.
- Regenerated Convex bundle: 26 modules, including new date/number/loyalty helpers; bundle regression tests passed.
- Staged diff whitespace check passed. Credential-pattern scan of staged text found no private-key, GitHub token, AWS key or JWT literals. This is a pattern scan, not a comprehensive secret audit.

Validation exercised the integrated tree. No live database changes, SMS sends, mobile release builds, feature-flag changes, or tenant schema deployments were performed.
