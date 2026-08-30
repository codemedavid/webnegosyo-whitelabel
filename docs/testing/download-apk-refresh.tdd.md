# TDD evidence — 1.0.4 release builds + `/download` APK refresh

Date: 2026-08-30
Branch: `main` (build pushed to `build/merchant-apk-1.0.4`)

## Source plan

No `*.plan.md`. Journeys derived during this run from the request: build the
merchant app for the App Store, build an APK, update `/download`, and confirm the
build uses the current logo.

## User journeys

1. As a merchant, I want to download the Android app from the website and get the
   version the store is actually running, so I am not installing a build that is
   two releases old.
2. As a merchant, I want the download link to still work months after the release,
   so the button does not silently 404.
3. As the app owner, I want the iOS binary in App Store Connect to carry the
   current code and the current SmartMenu icon.

## Task report

### 1. Verify the logo is current

Read `webnegosyo-app/assets/icon.png` and `assets/android-icon-foreground.png`
directly. Both are the SmartMenu mark (red/orange "SM" with cloche), committed in
`9fef8317` on 2026-08-27 and already shipped in builds 37/38. **No change needed** —
the request's logo condition was already satisfied.

### 2. Ship the pending printer/kitchen work

`npx jest` in `webnegosyo-app` → `236 suites / 3315 tests passed`. Committed as
`51d242ae` so EAS would include it (EAS archives committed state; the work was
uncommitted and would otherwise have been silently omitted from the build).

### 3. iOS build + submission

- `eas build --platform ios --profile production` → build **39**, v1.0.4, FINISHED.
- `eas submit --platform ios` → "Submitted your app to Apple App Store Connect!"

### 4. Android APK — three dead ends before a working path

| Attempt | Outcome |
|---|---|
| EAS cloud #1 | `write EPIPE` partway through the 105 MB tarball upload |
| EAS cloud #2 | Killed externally mid-upload; never reached EAS |
| EAS cloud #3 | Uploaded, then **refused**: free-plan Android quota exhausted until Sep 1 |
| GitHub Actions `github-local` #1 | Failed at `Setup EAS` (see below) |
| GitHub Actions `github-local` #2 | **Success** — APK built on the runner, no EAS quota used |

The first workflow run failed for a real bit-rot reason, not a transient one:

```
error @oclif/plugin-autocomplete@3.3.0: The engine "node" is incompatible with
this module. Expected version ">=22.0.0". Got "20.20.2"
```

`eas-version: latest` now resolves to eas-cli 23, which requires Node ≥22, but the
workflow pinned Node 20. Fixed in `.github/workflows/build-merchant-android.yml`
(commit on the build branch): `node-version: 20` → `22`.

APK verified before publishing — package and version read out of the binary
manifest: `com.webnegosyo.admin`, versionName `1.0.4`.

### 5. `/download` refresh — RED → GREEN

**RED** (`e47404bb`):

```
npx jest --config jest.config.cjs tests/unit/downloads.test.ts
● the Android APK advertises the version the app is actually on
    Expected: "1.0.4"
    Received: "1.0.2"
Tests: 1 failed, 5 passed
```

The failure is the real defect: the page offered a v1.0.2 APK while the app had
shipped 1.0.4, and nothing in the suite objected.

RED was then **reverted** (`4032eb58`) rather than left on `main`, because the fix
was blocked for hours on the Android build and a permanently-red suite trains
everyone to read failures as normal — the exact hazard `jest.config.cjs` already
documents. It was re-applied as part of the GREEN commit.

**GREEN** (`b9ac69bd`): `src/lib/downloads.ts` now points at the release asset with
`version: "1.0.4"`, `size: "108 MB"`.

```
Tests: 6 passed, 6 total
```

Full suite: `549 passed, 3 failed, 1 skipped / 553`. The 3 failures are untracked
`presell-*.test.ts` files belonging to a **concurrent session** in this shared
worktree — not touched by this work and left alone deliberately.

`npx eslint src/lib/downloads.ts tests/unit/downloads.test.ts` → clean.

## Test specification

| # | What is guaranteed | Test | Type | Result | Evidence |
|---|---|---|---|---|---|
| 1 | Both platforms appear exactly once on the page | `downloads.test.ts:every platform appears exactly once` | unit | PASS | `npx jest --config jest.config.cjs tests/unit/downloads.test.ts` |
| 2 | An available app always has an https link, never an anchor to nowhere | `downloads.test.ts:an available app always has a link` | unit | PASS | same |
| 3 | An unavailable app has no link, so it renders "Coming soon" | `downloads.test.ts:an unavailable app has no link` | unit | PASS | same |
| 4 | A raw APK states its version and size, since it has no storefront to show them | `downloads.test.ts:a direct APK download states its version and size` | unit | PASS | same |
| 5 | **The advertised APK version matches the app's Expo config** | `downloads.test.ts:the Android APK advertises the version the app is actually on` | unit | PASS (RED first) | RED: expected 1.0.4, received 1.0.2 |
| 6 | iOS ships via the App Store, not as a sideloaded file | `downloads.test.ts:iOS ships through the App Store` | unit | PASS | same |

## Coverage and known gaps

No coverage run: the change is a six-line config edit plus one test, and
`npm run test:coverage` reports on all of `src/`, where this moves the global
number by noise.

Deliberate gaps:

- **Nothing asserts the `href` is reachable.** The URL was verified by hand
  (`curl -sI -L` → `HTTP 200`, `content-length: 113037368`), but a test that hits
  the network would be flaky and would fail offline. The expiry class of bug that
  motivated moving off EAS artifacts is therefore still not caught by CI — the fix
  is the durable host, not a test.
- **`size` is not pinned to anything.** It is hand-entered and can drift; only
  `version` is machine-checked.
- **`DESKTOP_VERSION` / desktop `href`s are untested** and still point at
  `public/downloads/*.exe`, which is gitignored for size. The Windows `.exe` is
  very likely already 404ing in production. Out of scope here, but it is the same
  bug class as the one just fixed.
