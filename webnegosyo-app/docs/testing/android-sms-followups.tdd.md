# TDD evidence — Android SMS follow-up campaigns

**Branch**: `feat/android-sms-followups`
**Source plan**: written inline during the `/ecc:plan` run that preceded this work (7 phases). No `*.plan.md` artifact was produced.
**Scope of this report**: Phases 0–2 only. Phases 3–7 are not started; see *Known gaps*.

Reference implementation studied: `sms/` (standalone Expo app) — its native module, config plugin, permission wrapper, and `runFollowUps` loop.

## User journeys covered

1. As a merchant, I want to pick which of my customers get a follow-up text, so I reach lapsed guests without texting people who never agreed to it.
2. As a merchant, I want to write one message with the guest's name in it, so it reads personally instead of like a blast.
3. As a merchant, I want to know what a campaign will cost before I send it, so an emoji does not silently triple my bill.
4. As a merchant, I want a campaign to become due on my own clock, so a "10am" campaign does not arrive at 6pm.
5. As a guest, I want never to be texted late at night, whatever the merchant scheduled.
6. As a merchant, I want an interrupted run to resume without texting anyone twice.
7. As a merchant, I want one unreachable number not to abort the whole campaign — but I do want the run to stop when the phone starts rate-limiting.

## Task report

| Phase | What was done | Validation run | Result |
|---|---|---|---|
| 0 | Android Expo module `modules/sms-sender` + `plugins/withSmsPermissions.js`, registered in `app.config.ts` | `npx jest plugins/withSmsPermissions.test.ts` | PASS 6/6 |
| 0 | The module compiles and ships in the APK | `eas build -p android --profile production-apk` + artifact inspection | BUILT + INSPECTED |
| 1 | Migrations `20260816120000` + `20260816130000` | applied via Supabase MCP, then probed in a rolled-back `DO` block | APPLIED + PROBED |
| 2 | Five pure domain modules under `lib/sms/` | `npx jest lib/sms` | PASS 85/85 |
| — | Whole-package regression | `npx jest` | PASS 108 suites / 1822 tests |
| — | Types | `npx tsc --noEmit` | clean |

### RED evidence

`npx jest lib/sms` before any implementation existed:

```
Test Suites: 5 failed, 5 total
Tests:       0 total
lib/sms/run-plan.test.ts:1:25 - error TS2307: Cannot find module './run-plan' …
lib/sms/audience.test.ts:1:32 - error TS2307: Cannot find module './audience' …
lib/sms/schedule.test.ts:6:8  - error TS2307: Cannot find module './schedule' …
lib/sms/send-run.test.ts:1:28 - error TS2307: Cannot find module './send-run' …
```

This is compile-time RED and the failure is the missing implementation, not broken
setup: `plugins/withSmsPermissions.test.ts` compiled and passed 6/6 under the same
jest config in the same run. Committed as `e592c95`.

### GREEN evidence

```
PASS lib/sms/schedule.test.ts
PASS lib/sms/run-plan.test.ts
PASS lib/sms/message-template.test.ts
PASS lib/sms/audience.test.ts
PASS lib/sms/send-run.test.ts
Test Suites: 5 passed, 5 total
Tests:       85 passed, 85 total
```

Committed as `9ad96ae`.

**Two assertions were corrected as wrong-test, not wrong-code**, and both are recorded
here rather than quietly amended:

- `send-run.test.ts` — the fixture builds `+63917000001` (12 digits) while the
  expectation had been written with 13. The fixture was right.
- `message-template.test.ts` — the test asserted that `ñ` forces UCS-2 encoding. It
  does not; `ñ` is in the GSM 03.38 basic set. Implementing that assertion would have
  halved every campaign's apparent capacity for a PH merchant writing "Piña". Replaced
  with the curly apostrophe `’`, which genuinely is outside GSM, plus a new test
  pinning `ñ` as GSM-7.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | A guest with no phone, no consent, or an opt-out is never texted | `lib/sms/audience.test.ts` — "who may be texted at all" | unit | PASS |
| 2 | A suppressed number is never texted, even with consent on file | `audience.test.ts:excludes a suppressed number` | unit | PASS |
| 3 | The exclusion reason reported is the eligibility veto, not the filter | `audience.test.ts:reports one reason per customer…` | unit | PASS |
| 4 | A guest who has never ordered falls outside BOTH recency windows | `audience.test.ts:treats a customer who has never ordered…` | unit | PASS |
| 5 | Audience filters (recency, count, spend, channel) all AND together | `audience.test.ts:combines every filter with AND` | unit | PASS |
| 6 | A truncated run reaches the most recent guests first | `audience.test.ts:puts the most recent customers first` | unit | PASS |
| 7 | An unknown `{{placeholder}}` throws instead of rendering a blank | `message-template.test.ts:throws with the offending names` | unit | PASS |
| 8 | The editor can reject a bad template before it is ever saved | `message-template.test.ts:validateTemplate` group | unit | PASS |
| 9 | Last-order date renders on the Manila clock, not UTC | `message-template.test.ts:formats the last order date…` | unit | PASS |
| 10 | Segment counting models the GSM-7 / UCS-2 billing cliff, incl. extension chars | `message-template.test.ts:countSmsSegments` group | unit | PASS |
| 11 | Due times are computed on the Manila wall clock for all 3 schedule kinds | `schedule.test.ts:computeNextDueAt` groups | unit | PASS |
| 12 | A send landing in quiet hours is held until the window reopens | `schedule.test.ts:shiftOutOfQuietHours` + "quiet hours are applied" | unit | PASS |
| 13 | An under-specified schedule returns null rather than firing every poll | `schedule.test.ts:returns null when…` (×3) | unit | PASS |
| 14 | A run is capped under Android's throttle, with the remainder deferred | `run-plan.test.ts:caps the batch and defers the rest` | unit | PASS |
| 15 | A resumed run skips who it already texted and still finishes | `run-plan.test.ts:skips customers already texted…` + "counts the cap against the remaining work" | unit | PASS |
| 16 | A send is recorded only after the radio confirms it | `send-run.test.ts:records the send only after the phone confirms it` | unit | PASS |
| 17 | One failed recipient does not sink the run | `send-run.test.ts:records a failure and carries on` | unit | PASS |
| 18 | A rate-limit halts the run instead of failing every remaining guest | `send-run.test.ts:stops the whole run when Android starts rate-limiting` | unit | PASS |
| 19 | An unwritable audit log halts the run (an unlogged send is a double-send on resume) | `send-run.test.ts:stops when a send cannot be recorded` | unit | PASS |
| 20 | The merchant can cancel a run in flight | `send-run.test.ts:stops when the merchant cancels mid-run` | unit | PASS |
| 21 | The send loop never throws, whatever the phone does | `send-run.test.ts:never throws, whatever the phone does` | unit | PASS |
| 22 | The manifest gains SEND_SMS and never READ_SMS/RECEIVE_SMS | `plugins/withSmsPermissions.test.ts` | unit | PASS |

## Coverage

`npx jest lib/sms --coverage --collectCoverageFrom='lib/sms/**/*.ts'`

```
All files            |   97.24 |    89.47 |     100 |   99.08
 audience.ts         |   96.55 |    86.48 |     100 |   97.87
 message-template.ts |   98.57 |    94.11 |     100 |     100
 run-plan.ts         |     100 |      100 |     100 |     100
 schedule.ts         |    94.8  |    90.69 |     100 |   98.38
 send-run.ts         |     100 |    88.23 |     100 |     100
```

Above the 80% threshold on every metric. Uncovered lines are defensive guards for
malformed stored data (unparseable dates, malformed `HH:MM`).

## Android build (2026-08-02)

**Build**: https://expo.dev/accounts/itscodemedavid/projects/webnegosyo-app/builds/46c5a2cd-8597-4889-b378-4efb9d62b595 → `Build finished`, `EAS_EXIT=0`.

The first attempt (`--profile development`) failed, but **never reached the Kotlin**:

```
"google-services.json" is missing, make sure that the file exists.
Remember that EAS Build only uploads the files tracked by git.
```

Pre-existing and unrelated to this feature: `webnegosyo-app/.gitignore:60` ignores
`google-services.json`, and `eas env:list` shows `GOOGLE_SERVICES_JSON` set as a
secret file variable in the **production** environment only. The `development`
environment has just the two Supabase vars, so dev-client builds have been broken
for this reason independently of this work. Rebuilt on `production-apk`, which
already carries the variable and is the sideload artifact this feature ships on
anyway.

The green build was not taken as proof. The artifact was downloaded (107 MB) and
inspected:

- `classes*.dex` contains `Lexpo/modules/smssender/SmsSenderModule;`,
  `Lexpo/modules/smssender/SmsSendException;`, and
  `SmsSenderModule$definition$lambda$1$$inlined$AsyncFunctionWithPromise$1..3`.
  Those inlined lambdas are the load-bearing detail: they show the
  `AsyncFunction(... promise: Promise)` overload resolved against SDK 54's
  `expo.modules.kotlin` API, which was the riskiest part of porting a module
  written for SDK 57.
- `AndroidManifest.xml` string pool contains `android.permission.SEND_SMS` and,
  across all 23 permission entries, **no** `READ_SMS` and **no** `RECEIVE_SMS` —
  the plugin grants exactly what it claims and nothing more.

**This proves compilation, linking, and packaging. It does not prove the module
works.** The `BroadcastReceiver` / `PendingIntent` result path — the whole reason
this module is not a copy of `sms/` — is only exercised by a real radio. See gap
1 below.

## Database probe (2026-08-02, project `tjcmkstsuhqdwkfdrxan`)

Applied as two migrations: `sms_followup_campaigns`, then
`sms_campaigns_fix_weekly_schedule_check`. Every assertion below ran inside a
`DO` block that ends in `RAISE EXCEPTION`, so the whole probe rolled back — the
post-probe row counts are all zero and the 571 existing customer rows were
untouched.

**The probe found a real defect, which is why it was run.** First pass:

```
OK one_off-without-date rejected;  FAIL weekly-without-weekdays accepted;
OK campaign+run+send inserted;     OK duplicate send blocked;
OK duplicate run blocked;          FAIL updated_at unchanged;
```

- `FAIL weekly-without-weekdays` was genuine. `array_length(x, 1)` returns NULL
  for an empty array, so the weekly branch of the CHECK evaluated to NULL, and a
  CHECK passes on NULL. A weekly campaign with no weekday selected was accepted
  and would then have sat in the merchant's list looking active and never sent
  anything — no error, no failed run. Fixed by `cardinality()` in `20260816130000`.
- `FAIL updated_at unchanged` was **my probe's fault, not a defect**: `now()` is
  transaction-start time, so `created_at` and `updated_at` are identical inside a
  single transaction. Re-probed by writing a stale `2020-01-01` value and
  checking the trigger overwrote it.

Second pass, after the fix:

```
OK weekly-empty rejected;  OK weekly-with-weekdays accepted;
OK interval-less rejected; OK updated_at trigger overwrote a stale value;
OK blank message rejected;
```

Structure confirmed: all four tables have `rowsecurity = true` with one policy
each; `sms_sends` carries 4 indexes, `sms_campaign_runs` 3, `sms_campaigns` and
`sms_suppressions` 2 each; `customers` now has `sms_consent`, `sms_consent_at`,
`sms_opt_out`, `sms_opt_out_at`. `get_advisors(security)` reported **no new
findings** on any `sms_*` table — every item it returned pre-dates this work.

Also confirmed on live data: **571 customer rows, 0 with `sms_consent`**. Gap 4
below is measured, not predicted.

## Known gaps

These are **not** covered by any passing test, and none of them should be read as done:

1. **The native module compiles and ships, but has never actually sent a message.** The build above proves the Kotlin builds against SDK 54 and that `SEND_SMS` is in the shipped manifest. It proves nothing about runtime. Specifically unverified, and all of it is where this module departs from `sms/`:
   - whether the `sentIntent` broadcast is received at all, so the promise resolves on the real radio result rather than hanging to the 60s `TIMEOUT`
   - whether `RECEIVER_NOT_EXPORTED` + a package-scoped `Intent` still lets our own `PendingIntent` broadcast through on API 33+
   - whether `createForSubscriptionId` picks the intended SIM on a dual-SIM handset
   - whether the runtime permission prompt appears and `never_ask_again` is handled

   **Phase 0 closes only when someone installs this APK and one real SMS arrives**, ideally once with the radio on and once in airplane mode — the airplane-mode case is the exact bug this module exists to avoid (`sms/` reports "sent" there).

   APK: https://expo.dev/artifacts/eas/Tr4GkE6mrloRK_21hBZHCMtfkUnGBu_0r1qY1XkXOEI.apk
2. ~~Migration not applied.~~ **Applied and probed** — see *Database probe* below. RLS is enabled with a policy on all four tables; the anon path was not separately exercised.
3. **Phases 3–7 are not started**: the `SmsTransport` port and permission wrapper, the Customers tab and its `TAB_PERMISSIONS` entry, the due-list/notification engine, and the web checkout consent opt-in.
4. **Until Phase 6 ships, no customer is targetable.** `customers.sms_consent` is written nowhere in the codebase today, so `selectAudience` correctly returns an empty audience for every existing tenant. That is the intended behaviour, not a defect.
5. **Campaigns cannot be branch-scoped.** `public.customers` has no `outlet_id`, so a branch-scoped account must be denied the tab entirely in Phase 4.
6. **No integration or E2E coverage.** The package's jest config is unit-only (`roots: lib, theme, plugins`), matching the existing convention; screens are exercised manually via Expo.
