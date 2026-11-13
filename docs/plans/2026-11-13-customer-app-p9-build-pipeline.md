# Customer app P9: build and submit pipeline

Status: APPROVED 2026-11-13 ("ok lets do it": the recommended answers to the 4 decisions) and BUILT on
feat/customer-app-p9-builds (9be26832). Changes while building: the ASC key also lives in GitHub
secrets (non-interactive credential repair + submit need it on the runner); Expo's docs don't promise
non-interactive credentials for a NEW bundle id/package, so the first build per app may need one
`eas credentials` run (runbook); `APP_BUILD_DRY_RUN=1` proves the workflow without EAS; OTA uses
runtime policy `appVersion` (a fingerprint differs per store). Migration APPLIED 2026-11-13 (as `tenant_app_builds`) and probed: anon read + authenticated insert 42501, second open build 23505, queued→building→finished, finished→errored 23514, submit after finish ok, rolled back; generated types match live. Live test (`tests/live/app-builds-live.test.ts`) passed on platform. Browser 2026-11-13: Builds tab on the sample-demo test app shows the identity refusals with Build disabled; a seeded build moved to Built · On Play internal testing · v1.0.0 (3) · Download through two signed webhooks, picked up by the 15 s poll; row deleted.
Goal "Customer app: one codebase…", phase P9 (and the Builds panel left over from P8).

## Goal

From App Studio, a superadmin taps **Build** on a store's app and gets a signed
iOS build in TestFlight and an Android build on the Play internal track, without
touching a terminal. App Studio shows each build's status as it moves.

Everything a build differs in already lives in `tenant_apps` (name, bundle id,
package, icon, splash). `customer-app/app.config.ts` already reads that identity
from env vars. P9 is the part that turns a `tenant_apps` row into those env vars
and assets, runs EAS, and reports back.

## What can be built and proven before the P0 accounts arrive

| Part | Provable now? |
|---|---|
| Build records table + migration | Yes: PGlite + apply + probe |
| Build manifest (row → env + assets) | Yes: unit tests + one real row |
| Asset generator (icon, adaptive icon, notification icon, splash) | Yes: tests on real store icons |
| GitHub workflow file | Partly: `actionlint`, and a dry-run job that stops before `eas build` |
| EAS webhook route (signature, status updates) | Yes: tests with a test secret |
| Builds panel in App Studio | Yes: browser on sample-demo, Build button shows "needs setup" |
| A real build, TestFlight, Play internal | **No: needs P0 (Expo org, Apple key, Play service account, Firebase)** |

So the plan is to build everything up to the real `eas build` call, prove each
part, and leave the P0 spikes as the only gap.

## Flow

1. **App Studio → Build** (`customer_apps.edit`). Pick platforms (iOS, Android,
   both). The action:
   - refuses when the identity is incomplete (icon missing or fails the P8 checks,
     no splash colour, display name too long) and says what is missing;
   - refuses while another build for the same app is queued or building;
   - inserts a `tenant_app_builds` row per platform (`queued`), with a random
     one-time build token (only its sha256 stored);
   - dispatches the GitHub workflow `build-customer-app.yml` with only
     `build_id` + `token` as inputs (no store data in the dispatch).
2. **Workflow** (GitHub Actions, `workflow_dispatch`):
   - fetches its manifest from `GET /api/app-builds/<build_id>/manifest` with the
     token. The token works for that build only, for 2 hours, and the route
     marks the build `preparing`. CI never holds a service-role key.
   - downloads the icon/splash, runs the asset generator, writes `./build-assets/`;
   - sets the identity env (`APP_NAME`, `APP_BUNDLE_ID`, … already read by
     `app.config.ts`) and runs `eas build --platform <p> --profile store
     --non-interactive --no-wait --auto-submit`;
   - posts the EAS build id back (`POST /api/app-builds/<build_id>/started`).
3. **EAS → webhook** `POST /api/app-builds/eas-webhook`: verifies the
   `expo-signature` HMAC with `EAS_WEBHOOK_SECRET`, finds the build by EAS id,
   moves it to `building` / `finished` / `errored` / `cancelled`, stores the
   artifact URL, version and build number, and the error summary on failure.
   Submission events update `submit_status` (`submitted` / `submit_failed`).
   Unknown build ids are answered 200 and ignored (EAS retries non-2xx).
4. **App Studio Builds panel**: a list per app (platform, version + build
   number, status, who started it, when, EAS link, error). It refreshes while
   a build is open. A build stuck in `queued`/`preparing` for 30 min shows as
   "didn't start" with a retry (the dispatch or the CI job failed before
   reporting).

## Data (one migration)

`tenant_app_builds`, service role only like `tenant_apps`:
`id`, `tenant_id` → tenant_apps, `platform` (ios|android), `status`
(queued|preparing|building|finished|errored|cancelled), `token_hash`,
`token_expires_at`, `eas_build_id` unique, `app_version`, `build_number`,
`artifact_url`, `submit_status` (none|submitting|submitted|submit_failed),
`error`, `manifest` (jsonb snapshot of what was built), `created_by`,
`created_at`, `updated_at`. Partial unique index: one open build per
(tenant, platform). Status only moves forward (a trigger refuses going back),
so a late or replayed webhook can't undo a finish.

## Assets (`customer-app/scripts/build-assets/`, Sharp, pure where possible)

From the store's app icon (already checked square, ≥1024, no transparency in P8):
- **iOS icon**: 1024×1024 PNG, flattened onto the splash colour (no alpha).
- **Android adaptive icon**: foreground = the icon scaled into the 66% safe
  zone on transparent; background = the splash colour. Monochrome layer = the
  foreground turned to a single-colour silhouette.
- **Android notification icon**: white silhouette on transparent, 96×96. A
  photo-like icon makes a blob, so when the silhouette covers > 70% of the
  square it falls back to a plain shopping-bag glyph (tested on real icons).
- **Splash**: the splash image if set, else the icon, centred on the colour.
Each output is checked (size, alpha) before the build starts; a failed check
fails the job before any EAS minutes are spent.

## App changes

- Add `expo-updates` with `runtimeVersion: { policy: 'fingerprint' }` and one
  `production` channel shared by every store. The app picks its store from its
  native id, so one update serves all of them (P0 spike 2 proves this).
- `eas.json` for `customer-app`: `appVersionSource: remote` (EAS keeps build
  numbers per bundle id), profile `store` with `autoIncrement`, channel
  `production`, and `submit.store` (ASC app id from `tenant_apps.asc_app_id`
  passed as env, Play track from `tenant_apps.play_track`).
- Notification icon path read from env like the other identity assets.

## Secrets and config (none exist yet)

- Vercel: `GITHUB_DISPATCH_TOKEN` (fine-grained, this repo, Actions: write only),
  `EAS_WEBHOOK_SECRET`.
- GitHub: `EXPO_TOKEN`, `APP_BUILD_API_URL`; Apple ASC key + Play service account
  live in EAS credentials, not in GitHub.
- Without them the Build button shows "Build pipeline not set up" with the
  missing names, and nothing is inserted.

## Not in P9

- Store screenshots and listing upload (`listing` is stored; the first App Store
  record and the first Play upload are made by hand once per app anyway, a Play
  rule). Automating listing upload = a later step.
- Merchant self-serve builds (superadmin only, like the rest of App Studio).
- Deleting `mobile/` + `build-tenant.yml` = P10, after the pilot is live.

## Proof

- Jest: manifest builder, asset checks, webhook signature + status moves
  (including replay and out-of-order events), build action refusals.
- PGlite + platform probe: service-role only (anon/authenticated 42501), one
  open build per platform, status can't go backwards.
- Asset generator run on 5 real store icons (incl. a photo logo and a B&W logo),
  outputs looked at.
- Browser on sample-demo: Builds panel, Build refused with the missing-setup
  message, a seeded build row moving through statuses via a signed test webhook.
- Workflow: `actionlint` + a `dry_run` input that runs up to (not including)
  `eas build` against sample-demo's simtest app row.
- **Inconclusive until P0**: a real EAS build, TestFlight, Play internal, OTA
  reaching two builds.

## Decisions for the owner

1. **Where builds run.** Recommended: GitHub Actions calling **EAS cloud** for
   both platforms (iOS needs a Mac; a GitHub macOS runner costs 10× minutes and
   this Mac's Xcode is too old). Android could build locally on GitHub like the
   merchant APK to save EAS quota. Which EAS plan will the Expo org be on?
2. **The repo is public, so build logs are public.** Logs would show store
   names and bundle ids (no secrets; GitHub masks them). OK, or run the
   workflow from a private repo / EAS Workflows instead?
3. **Auto-submit.** Recommended: every finished build goes to TestFlight and
   Play internal automatically (testers only, never public). Promotion to the
   public stores stays a manual step in App Store Connect / Play Console.
4. **Notification icon fallback**: a plain shopping-bag glyph when the store's
   icon doesn't make a clean silhouette — OK?
