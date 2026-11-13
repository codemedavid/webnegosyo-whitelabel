# Customer-app store builds: setup and first build

What App Studio → Builds needs before its Build button works, and the one-time
steps per store app. Plan: `docs/plans/2026-11-13-customer-app-p9-build-pipeline.md`.

## Once for the platform

**Expo (EAS)**
1. Create the `webnegosyo-customer` project in the Expo org (`cd customer-app && npx eas-cli@latest init`), note its project id.
2. Make a robot/personal access token for CI.
3. Webhooks (secret ≥ 16 characters, the same value for both):
   `npx eas-cli@latest webhook:create --event BUILD --url https://www.webnegosyo.com/api/app-builds/eas-webhook --secret <EAS_WEBHOOK_SECRET>`
   and the same with `--event SUBMIT`.

**GitHub** (repository settings → Secrets and variables → Actions)
- Secrets: `EXPO_TOKEN`, `APP_BUILD_API_URL` (`https://www.webnegosyo.com`), `APP_BUILD_CI_SECRET` (≥ 24 random characters), `ASC_API_KEY_P8` (the .p8 file's text), `ASC_API_KEY_ID`, `ASC_API_KEY_ISSUER_ID`, `APPLE_TEAM_ID`, `PLAY_SERVICE_ACCOUNT_JSON`.
- Variable: `CUSTOMER_APP_EAS_PROJECT_ID`.
- A fine-grained token for Vercel: this repository only, permission **Actions: Read and write**, nothing else.

**Vercel** (production env)
- `GITHUB_DISPATCH_TOKEN` (the fine-grained token), `APP_BUILD_GITHUB_REPO` (`owner/name`), optional `APP_BUILD_GITHUB_REF` (default `main`), `APP_BUILD_CI_SECRET` (same value as GitHub's), `EAS_WEBHOOK_SECRET` (same as the webhooks).

Until all five are set the Builds tab says which are missing and starts nothing.

## Once per store app

- **App Store Connect**: create the app record for the bundle id (App Studio → Identity), paste its numeric Apple ID into App Studio → Release. Without it iOS builds are made but not sent to TestFlight.
- **Play Console**: create the app for the package name. The first upload goes in by hand (Play needs one release before its API accepts uploads); after that, builds go to internal testing by themselves.
- **Signing credentials**: Expo's docs don't promise that a brand-new bundle id / package gets its credentials in a non-interactive CI build. Until the P0 spike proves it, run the first build of each app once from a terminal (`cd customer-app && APP_NAME=… APP_BUNDLE_ID=… APP_ANDROID_PACKAGE=… npx eas-cli@latest credentials`) so EAS stores them.

## Checking the pipeline without spending a build

Set `APP_BUILD_DRY_RUN=1` on the deployment (a preview is enough, with the other
env set). Every build then runs the whole workflow (manifest, icons, app install,
config check) and stops before `eas build`, closing the build as "Dry run: …".
EAS and the store keys are not needed for a dry run. Remove the variable to build
for real.

## When a build fails

The Builds tab shows the reason. "The build didn't start" = the workflow never fetched its manifest within 30 minutes (dispatch token, repo name, or GitHub Actions disabled). "Stopped before EAS" carries the GitHub run link. EAS errors carry EAS's own message; open the build on expo.dev.
