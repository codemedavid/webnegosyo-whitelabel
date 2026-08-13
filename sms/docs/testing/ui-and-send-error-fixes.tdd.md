# TDD Evidence: phone-number bug fixes + UI/UX redesign

## Source plan

None provided. This run was triggered directly by the user with a screenshot of
the running app and the request: "the app isn't working and can you give it a
nice ui/ux?" User journeys below were derived from that screenshot plus a
reading of the existing codebase during this session.

## User journeys

1. As a user who adds a contact by hand (no CSV import), I want my phone
   number stored the same way regardless of how I typed it, so the number the
   app texts is actually valid — instead of a raw, un-normalized string like
   the `09668820122` visible (next to a correctly-formatted `+639928214519`)
   in the reported screenshot.
2. As a user who runs follow-ups and gets a low "Sent X of Y" count, I want to
   see *why* each contact's message did or didn't go out, so I'm not stuck
   with a mystery number.
3. As a user of a real product, I want the app to look and feel designed —
   spacing, color, button states, cards — not a stack of unstyled text.

## Task report

### 1. `normalizePhoneNumber` fabricated invalid E.164 numbers for ambiguous input

- **Summary**: the fallback branch prefixed any 8–15 digit string with `+`,
  which turns a bare local number like `09668820122` into the invalid
  `+09668820122` instead of rejecting it.
- **Validation command**: `npx jest src/domain/phoneNumber.test.ts`
- **RED**: `Received: "+09668820122"` for `expect(normalizePhoneNumber('09668820122')).toBeNull()`
- **GREEN**: `Tests: 10 passed, 10 total`
- **Guarantee**: numbers that aren't already E.164 (`+...`) and don't match a
  recognized 10/11-digit US pattern are rejected (`null`) instead of guessed.

### 2. `buildNewContact` skipped normalization that `csvImport` already applied

- **Summary**: CSV-imported contacts were normalized via `normalizePhoneNumber`;
  manually-added contacts were not, storing the raw typed string. This is
  exactly why the screenshot shows one contact fully formatted and the other
  raw.
- **Validation command**: `npx jest src/domain/buildNewContact.test.ts`
- **RED**: `expect(contact.phone).toBe('+15555550102')` received `"(555) 555-0102"`; `expect(...).toThrow(InvalidPhoneNumberError)` — function did not throw.
- **GREEN**: `Tests: 4 passed, 4 total`
- **Guarantee**: `buildNewContact` normalizes the phone to E.164 and throws
  `InvalidPhoneNumberError` when the input can't be resolved.

### 3. `AddContactForm` had no phone validation feedback

- **Summary**: since `buildNewContact` now throws on invalid input, and the
  form's `handleSubmit` called `onSubmit` without awaiting/catching, an
  invalid number would have produced an unhandled promise rejection with no
  user-visible error. Added client-side validation using the same
  `normalizePhoneNumber` function.
- **Validation command**: `npx jest src/screens/contacts/AddContactForm.test.tsx`
- **RED**: `Unable to find an element with text: Enter a valid phone number, e.g. +15555550100.`
- **GREEN**: `Tests: 5 passed, 5 total`
- **Guarantee**: an invalid phone number shows an inline error and is never
  submitted; a valid-but-unformatted number is normalized before submit.

### 4. `TodayScreen` only showed an aggregate send count, never the reason for failure

- **Summary**: after `Run Follow-ups`, the screen rendered `Sent X of Y` and
  nothing else — no way to see why a send failed (permission denied, no
  signal, missing consent, template error). Directly explains the "Sent 0 of
  2" in the reported screenshot with no diagnosis path.
- **Validation command**: `npx jest src/screens/today/TodayScreen.test.tsx`
- **RED**: `Unable to find an element with text: Failed: No SIM card available` / `Skipped: Contact has not given consent`
- **GREEN**: `Tests: 7 passed, 7 total`
- **Guarantee**: each contact row shows its actual send outcome
  (`Sent` / `Failed: <reason>` / `Skipped: <reason>`) once `runFollowUps` has
  run, not just the preview message.

### 5. UI/UX redesign

- **Summary**: introduced `src/ui/theme.ts` (colors, spacing, radius, type
  scale) and restyled `App.tsx`, `TodayScreen.tsx`, `AddContactForm.tsx` —
  card-based rows, colored status text, a real primary button with
  pressed/disabled states, styled inputs, a loading spinner, and a single
  scrollable region (header/list/footer inside one `FlatList` instead of a
  raw `View` that could clip content below the fold).
- **Validation command**: `npx jest` (full suite, no new behavior introduced —
  purely presentational, all existing accessible text/roles preserved)
- **Result**: `Tests: 123 passed, 123 total`

## Test specification

| # | What is guaranteed | Test file | Test type | Result | Evidence |
|---|--------------------|-----------|-----------|--------|----------|
| 1 | Ambiguous bare local numbers are rejected instead of guessed | `src/domain/phoneNumber.test.ts:returns null for a bare local number without a country code instead of guessing one` | unit | PASS | `npx jest src/domain/phoneNumber.test.ts` |
| 2 | Manually-added contacts get their phone normalized to E.164 | `src/domain/buildNewContact.test.ts:normalizes a formatted phone number to E.164` | unit | PASS | `npx jest src/domain/buildNewContact.test.ts` |
| 3 | Manually-added contacts with an unresolvable phone throw `InvalidPhoneNumberError` | `src/domain/buildNewContact.test.ts:throws InvalidPhoneNumberError when the phone number cannot be normalized` | unit | PASS | `npx jest src/domain/buildNewContact.test.ts` |
| 4 | The Add Contact form normalizes the phone before submit | `src/screens/contacts/AddContactForm.test.tsx:submits the phone number normalized to E.164 format` | component | PASS | `npx jest src/screens/contacts/AddContactForm.test.tsx` |
| 5 | The Add Contact form blocks submit and shows an error for an invalid phone | `src/screens/contacts/AddContactForm.test.tsx:shows a validation error and does not submit when the phone number cannot be normalized` | component | PASS | `npx jest src/screens/contacts/AddContactForm.test.tsx` |
| 6 | A failed send shows its error reason on the contact row | `src/screens/today/TodayScreen.test.tsx:shows why a follow-up failed to send after running follow-ups` | component | PASS | `npx jest src/screens/today/TodayScreen.test.tsx` |
| 7 | A skipped send (no consent) shows its reason on the contact row | `src/screens/today/TodayScreen.test.tsx:shows why a follow-up was skipped after running follow-ups` | component | PASS | `npx jest src/screens/today/TodayScreen.test.tsx` |

## Coverage and known gaps

- **Command**: `npx jest --coverage` (exit code 0; `package.json` enforces an
  80% global threshold on branches/functions/lines/statements)
- **Result**: `All files | 99.29% Stmts | 92.9% Branch | 98.63% Funcs | 99.28% Lines`
- **Known gaps** (pre-existing, not touched by this change):
  - `src/native/index.ts` and `src/native/nativeSmsClient.ts` show 0% —
    thin wrappers around the native `SmsSender` module and
    `PermissionsAndroid`; they're exercised through the mocked `sendSms`
    dependency in every screen/hook test, not directly unit-tested.
  - `src/repositories/sqlite/sqliteClient.ts` and `src/domain/types.ts` are
    type-only files with no runtime logic.
  - **Out of scope for this session**: the app's core SMS-sending flow could
    not be verified end-to-end on a real Android device/emulator in this
    environment — the custom `SmsSender` native module (Android-only, no iOS
    implementation) requires a rebuilt dev client to test. If "Sent 0 of X"
    persists after rebuilding with these fixes, the per-contact error now
    shown on-screen (task 4 above) should indicate whether it's a permission,
    connectivity, or SIM/carrier issue on the device itself.
