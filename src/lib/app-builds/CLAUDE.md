# Customer-app store builds (App Studio → Builds)

Plan: `docs/plans/2026-11-13-customer-app-p9-build-pipeline.md`. Setup: `docs/runbooks/customer-app-builds.md`.

- **Flow**: App Studio `startAppBuildsAction` (`customer_apps.edit`) → `tenant_app_builds` row (`queued`, manifest SNAPSHOT, sha256 of a one-time token) → GitHub `workflow_dispatch` of `.github/workflows/build-customer-app.yml` with only the token → `GET /api/app-builds/manifest` (`preparing`) → `scripts/customer-app-build/` makes icons and runs `eas build --no-wait [--auto-submit]` → `POST /api/app-builds/report` (`building`, or `errored` before EAS) → EAS webhook `POST /api/app-builds/eas-webhook` (`finished` / `errored` / `cancelled`, then `submit_status`).
- **Two credentials on the CI routes**: the repo is public, so the token in the run inputs is public too. A call needs the token AND `x-app-build-secret` = `APP_BUILD_CI_SECRET` (`verifyBuildCaller`). Never let either open anything alone.
- **Status only moves forward** (`status.ts` `canMove` = trigger `tenant_app_builds_forward_only`): a replayed or late webhook answers 200 and changes nothing. Writes name the status they move from. One open build per app + platform (partial unique index); a stuck one is closed as errored before a new start (`staleReason`).
- **Testers only**: iOS → TestFlight (only with `asc_app_id`), Android → Play internal whatever `play_track` says. Promotion to the public stores stays a person's step.
- **The manifest is checked twice**: `manifest.ts` builds it, `scripts/customer-app-build/ci-lib.mjs` `readManifest` re-checks it before any value reaches env or a path (`$GITHUB_ENV` lines use a random heredoc delimiter).
- **Icons** (`scripts/customer-app-build/assets.mjs`): iOS icon flattened (no alpha), adaptive foreground inset to the 66% safe zone on the icon's corner colour, monochrome + notification icon from the logo mark, bag glyph when the icon is not flat art. Workflow logs are public: print no store data of your own.
- **OTA**: `customer-app/app.config.ts` uses runtime policy `appVersion` and one `production` channel for every store app (a fingerprint would differ per store). Bump `version` with any native change.
- Tests: `tests/unit/app-builds/` (fake DB enforcing the migration's rules), PGlite `tests/sql/run-tenant-app-builds.cjs`.
