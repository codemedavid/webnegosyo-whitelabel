# TDD Evidence — Remove the SMS campaign surface from iOS

**Source plan**: none. Journeys derived during this TDD run.
**Branch**: `fix/ios-hide-sms-campaigns` → `main`
**Date**: 2026-08-04

## User journeys

1. As a **merchant on iPhone**, I want the app not to advertise follow-up
   campaigns at all, so I am not walked into a feature that cannot work on my
   phone.
2. As the **person shipping this to the App Store**, I want no send-SMS surface
   and no SMS permission in the iOS binary, so review has nothing to reject.
3. As a **merchant on Android**, I want campaigns to behave exactly as before.

## What was already true

The SEND_SMS permission was never an iOS problem. `plugins/withSmsPermissions.js`
is a `withAndroidManifest` mod, and that mod never runs on the iOS prebuild — so
the iOS binary declares nothing about SMS, structurally rather than
conditionally. Both assertions covering this **passed on arrival** and are
recorded here as regression guards, not as a fix. What did exist on iOS was the
full campaign UI, disabled, with a notice pointing the merchant at the Android
app.

## Task report

| Task | Validation run | RED | GREEN |
|---|---|---|---|
| Availability predicate | `npx jest lib/sms/availability.test.ts` | `Cannot find module './availability'` | 3 passed |
| Screen + route gating | `npx jest lib/sms/customers-screen-mount.test.ts` | 5 failed (see below) | 20 passed |
| No regression anywhere else | `npx jest` | n/a | 150 suites, 2402 tests passed |
| Types | `npx tsc --noEmit` | n/a | clean |
| Lint | `npx expo lint` | n/a | 0 errors; 6 pre-existing warnings, none in touched files |

RED output, captured before any production file was edited:

```
● Cannot find module './availability'
● gates the SMS surface on the shared availability predicate
● no longer offers the campaigns section on a platform that cannot send
● drops the notice that told an iOS merchant to use the Android app
● does not load campaigns on a platform that cannot send them
● refuses to open the campaign editor by deep link
Tests: 5 failed, 15 passed, 20 total
```

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | Campaigns are available on Android | `lib/sms/availability.test.ts:is available on Android` | unit | PASS |
| 2 | Campaigns are absent on iOS | `…:is absent on iOS` | unit | PASS |
| 3 | An unknown platform fails closed rather than showing a dead send button | `…:fails closed for any platform it does not know` | unit | PASS |
| 4 | The Customers screen gates on the shared predicate, not an inline check | `lib/sms/customers-screen-mount.test.ts:gates the SMS surface on the shared availability predicate` | wiring | PASS |
| 5 | The campaigns section is not offered where sending is impossible | `…:no longer offers the campaigns section …` | wiring | PASS |
| 6 | The "use the Android app" notice is gone | `…:drops the notice that told an iOS merchant …` | wiring | PASS |
| 7 | Campaigns are not fetched on a platform that cannot send | `…:does not load campaigns …` | wiring | PASS |
| 8 | The editor route refuses to open by deep link | `…:refuses to open the campaign editor by deep link` | wiring | PASS |
| 9 | SEND_SMS is added by an Android-only mod, with no Info.plist path | `…:adds SEND_SMS through an Android-only config plugin` | regression | PASS |
| 10 | No SMS permission beyond sending is requested | `…:asks for no SMS permission beyond sending` | regression | PASS |

## Known gaps

- **Tests 4–10 assert on screen source text, not on a rendered screen.** This
  jest project runs pure-logic roots only (`lib`, `theme`, `plugins`), so they
  prove the gate is wired, not that a rendered iOS screen is bare. The
  predicate's own behaviour (tests 1–3) is genuinely executed. This matches the
  existing convention in the same file rather than introducing a second one.
- **Not verified on an iOS device.** No iOS build containing this change has
  been installed and opened.
- The customer list, its consent controls, and the reachability stats ("Can
  text", "Opted out", …) **remain on iOS**. Only campaigns were removed, which
  is the requested scope — a merchant can still record consent on iPhone for an
  Android device to use later. Say so if that should go too.

## Merge evidence

```
245f1ed test: add reproducer for hiding SMS campaigns on iOS   (RED, 5 failed)
9425b53 feat: remove the SMS campaign surface from iOS entirely (GREEN, 2402 passed)
```
