# TDD Evidence — Remove business account registration (Apple Guideline 3.1.1)

**Submission:** c39cb5b7-ae34-4b9d-962c-50c562587d10 · **Reviewed build:** 1.0 (18) · **Date:** 2026-07-15
**Branch:** `feat/webnegosyo-profit-analytics`

## Source plan / journeys
Derived during this TDD run from the App Review rejection letter. Guideline 3.1.1
(Business): the app must not offer an account-registration flow for businesses /
organizations. Merchant stores are provisioned by the WebNegosyo team out-of-app;
the binary must expose only **Sign In** (existing accounts) + **Explore Demo**
(read-only). Guideline 2.3.3 (screenshots) is App Store Connect metadata — not code.

User journeys guaranteed:
1. As Apple review, when I open the app I see no way to register/create a business account.
2. As an existing merchant, I can still sign in.
3. As a guest, I can still Explore Demo with no account.

## Task report
- **Removed the registration flow.** Deleted `app/(auth)/signup.tsx` ("Create your
  store" lead form that wrote to `app_signup_requests`); removed the signup link and
  its styles from `app/(auth)/login.tsx`; removed the `signup` screen from
  `app/(auth)/_layout.tsx`; reworded the demo banner in `app/(main)/dashboard.tsx`
  that pointed users to "Create your store".
- **Validation:** `npx jest app-store-compliance`
  - RED (before code changes): `4 failed, 1 passed` — failures on signup-file-exists,
    login route to signup, "Create your store" CTA, and `name="signup"` navigator entry.
  - GREEN (after changes): `5 passed`.
- **Regression:** full suite `npx jest` → `15 suites, 212 tests passed`.
- **Types/lint:** `npx tsc --noEmit` clean on touched files; `eslint` 0 errors
  (1 pre-existing exhaustive-deps warning at dashboard.tsx:138, unrelated).
- **Guarantee:** the shipped auth flow contains no business account-registration
  entry point; sign-in and read-only demo remain intact. A source-guardrail test
  fails if any registration entry point is re-introduced.

## Test specification
| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | No signup screen file ships | `lib/app-store-compliance.test.ts:does not ship a signup screen file` | guardrail | PASS |
| 2 | Login has no route to signup | `…:login screen exposes no route to a signup screen` | guardrail | PASS |
| 3 | Login has no "Create your store" CTA | `…:login screen shows no 'Create your store' registration call-to-action` | guardrail | PASS |
| 4 | Auth navigator registers no signup screen | `…:auth navigator does not register a signup screen` | guardrail | PASS |
| 5 | No auth screen writes to `app_signup_requests` | `…:no auth screen writes to the app_signup_requests table` | guardrail | PASS |

## Coverage & known gaps
Screens are exercised manually via Expo (jest is scoped to `lib/` + `theme/` per
`jest.config.js`), so the guarantee is enforced via a source-guardrail test rather
than a rendered-component test. The `app_signup_requests` table + anon-insert RLS
(migration `20260602000001`) are left in place — harmless with no writer; drop later
if desired.

## Manual follow-ups (App Store Connect — not code)
- **3.1.1:** rebuild + submit (new build number); include reviewer note that stores
  are team-provisioned and the app is sign-in only (see `APP_STORE_REPLY_3.md`).
  Keep real throwaway merchant creds in App Review Information for the deletion flow.
- **2.3.3:** replace the 6.5" iPhone and 13" iPad screenshots with captures of the
  app **in use** (dashboard, orders, analytics) — not the login/splash screen. Update
  via "View All Sizes in Media Manager".
