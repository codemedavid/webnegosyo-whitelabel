# SmartMenu 1.0.10 release status — 2026-09-27

Android 1.0.10 build 41 was published on 2026-09-27 after the production backend dependencies became available. iOS remains prepared for review. The original build and blocker records below are retained as history.

## Frozen app source

- Branch: `build/merchant-1.0.10`
- Commit: `9071957cfb3a4b543529e359699d9abac014c15c`
- Snapshot taken from the shared workspace before later concurrent changes. Subsequent QR checkout fixes in `b5c8c4ae` are not in these binaries.

## iOS

- Version 1.0.10, build 46, bundle ID `com.webnegosyo.admin`, display name SmartMenu.
- EAS build: https://expo.dev/accounts/itscodemedavid/projects/webnegosyo-app/builds/5ec9e865-f974-486f-b83f-96c6cb1a6792
- Upload completed: https://expo.dev/accounts/itscodemedavid/projects/webnegosyo-app/submissions/b99eb85c-7b46-4117-a960-ee960d1b2b58
- App Store Connect build ID: `db7eb125-5740-4e26-b7d1-e8839df3b5fa`, processing state `VALID`.
- Release version ID: `a76beb54-e8ea-47cc-a0b0-191e19a186f9`, state `PREPARE_FOR_SUBMISSION`.
- Build attached; release notes saved; existing screenshots and review credentials copied. Release type is `AFTER_APPROVAL`.
- NOT submitted for App Review; NOT live. Current public iOS version remains 1.0.8.
- IPA SHA-256: `eb074b88c90c5da980ddeec24d307808a4ea1e6d1cbf6163995891909136a1dd`.

## Android

- Version 1.0.10, versionCode 41, package `com.webnegosyo.admin`.
- Successful build: https://github.com/codemedavid/webnegosyo-whitelabel/actions/runs/36314958654
- Artifact: `/tmp/smartmenu-artifacts-1.0.10/WebNegosyo-1.0.10-build41.apk`.
- Size: 117,378,520 bytes (~112 MiB).
- SHA-256: `1287836d46397cfd82edf5b7ce594e609c115f9cc5f407be1add7c69c6d96b23`.
- Signing certificate SHA-256: `35c1ba945660519f296aa6c9ed28d23f2858d0515508d017e0d0649dbaf60cbf`, matches published 1.0.9 build 40.
- GitHub release tag `merchant-app-v1.0.10` is prepared as a DRAFT. Do not advertise its public asset URL until published.

## Website

- Prepared branch: `release/apk-download-1.0.10`, commit `b4d5ce556c0ba3451c4a63e9ab12583c5515ac4a`.
- Preview: https://webnegosyo-whitelabel-ejvh9cyp5.vercel.app/download
- Preview deployment ID: `dpl_77kfTFPPGCWr6n2GUu5sF2FgFj9B`.
- Preview built successfully; authenticated HTTP check verified the 1.0.10 APK URL.
- Production `/download` is unchanged.
- Preview is based on production commit `1d5712a7a664afb48d88bf5da889708e01a77eed`. If another session deploys a newer website, apply only the download patch to that new source; do not promote this older whole-site preview over it.

## Confirmed blockers

- Both EAS and the web app use production database `tjcmkstsuhqdwkfdrxan`.
- Production `public.loyalty_activity` is missing (PostgREST PGRST205).
- Production `/api/loyalty/activity` and `/api/loyalty/order-customers` return 404. `/api/loyalty/earning-recovery` was also absent when checked.
- New app screens depend on these routes. Review the loyalty activity/recovery/wallet migrations and deploy the matching backend before publication.
- Supabase CLI returns `User is banned`; its local project link also points to old project `chfgovrbsaeebpbykacs`.
- Supabase MCP connection cannot refresh OAuth and requires authorization.
- No migrations were applied by this release session.
- Asked the user to restore production Supabase access or confirm another session is handling migrations; no reply received yet.

## Remaining release actions

1. Restore Supabase access, reconcile/apply the required migrations to the correct project, deploy matching backend routes, and verify them.
2. Decide whether later concurrent mobile fixes need a new build; the exact source above is frozen and reproducible.
3. Publish the draft APK release, verify its public URL, and deploy the download patch on top of the latest website source.
4. Update Android `platform_app_releases.latest_version` and `store_url` to 1.0.10 and the APK URL. Preserve `minimum_version` (no forced update authorized). The current Android row incorrectly points to Google Play and advertises 1.0.8.
5. Submit the prepared iOS version for App Review, with automatic release after approval. Only advertise iOS 1.0.10 in release policy once Apple makes it available.

## Validation

- Mobile TypeScript: passed.
- Mobile lint: no errors; existing warnings.
- Mobile full suite: 456 suites passed; one test timed out under concurrent machine load (5,731 passed, one timeout). Re-ran its entire DiscountSheet suite independently: all 22 tests passed.
- Download tests: all 12 passed; download lint passed.
- Android FCM credential check: passed, Firebase project matches EAS push credentials.
- Both artifact manifests verified; Android signing certificate compared with previous public APK.

## Android publication follow-up — 2026-09-27

- Confirmed production `loyalty_activity` and `loyalty_earning_jobs` tables and their expected columns through authenticated read-only schema checks against `tjcmkstsuhqdwkfdrxan`.
- Confirmed `claim_loyalty_earning_jobs`, `finish_loyalty_earning_job` and `lookup_loyalty_wallet` in the production API schema. This session did not apply migrations.
- Live route probes now return validation/authentication responses for activity and earning recovery, and method-not-allowed for a GET to the POST-only order-customers endpoint, rather than 404.
- Published the existing Android draft release; the permanent APK URL returns HTTP 200 with 117,378,520 bytes. Local artifact SHA-256 matches the uploaded release asset digest recorded above.
- Updated the public download config and merchant source version to 1.0.10 on top of current main, preserving the newer website changes. The earlier preview was not promoted.
- Updated the Android release policy to 1.0.10 and the GitHub APK URL; `minimum_version` remains 1.0.0.
- Validation: existing version-drift test reproduced the stale 1.0.9 link; all 12 download tests passed after the update, and download config lint and diff checks passed.
- The APK remains the frozen build 41 described above; later merchant source fixes require a subsequent binary. No iOS review submission was made in this follow-up.
