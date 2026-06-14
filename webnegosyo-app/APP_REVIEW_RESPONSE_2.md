# App Review Response — Submission 1c41f120 (Round 2)

App: **WebNegosyo Admin** (`com.webnegosyo.admin`)
Reviewed build: **1.0 (14)** · Resubmitting build: **1.0 (15)**
Guidelines addressed: **5.1.1(iv)**, **5.1.1(v)**, **3.1.1**

Everything below is ready to paste into **App Store Connect → Resolution Center**, plus
the App Review Information fields to set before resubmitting.

---

## Lead reply (paste first)

> Hello App Review Team,
>
> Thank you for the detailed feedback on submission 1c41f120. We've addressed all three
> items in build 15:
>
> **5.1.1(iv) — Camera permission wording.** The screen that scans customer order QR codes
> no longer uses a directive button before the system prompt. The button now reads
> **"Continue"**, and the short text above it only explains why the camera is used. If a
> user has previously declined, we show an **"Open Settings"** button that deep-links to the
> iOS Settings app instead of repeating a request.
>
> **5.1.1(v) — Account deletion.** We added a fully in-app account-deletion flow. A signed-in
> merchant taps **Account** (top-right of the dashboard) → **Delete Account** → confirms, and
> the account is **permanently deleted** server-side (the login credential is removed and can
> no longer sign in). No website visit, email, or phone call is required. A screen recording
> of the full flow is attached in App Review Information.
>
> **3.1.1 — In-App Purchase.** WebNegosyo Admin is a **free** business-operations tool for
> food/retail merchants to manage their own real-world orders. It contains **no in-app
> purchases, no digital goods, no paywall, and no purchase/subscribe call-to-action of any
> kind**. The "smart menu / online-ordering" platform is a **B2B SaaS service sold to
> businesses** (not consumers) and is arranged separately outside the app — analogous to
> merchant companion apps such as Square, Toast, and Shopify. Per Guideline 3.1.3(e) (and the
> business-app provisions of 3.1.3), this category does not require In-App Purchase. Detailed
> answers are below.
>
> Please let us know if any further detail would help. Thank you for your time.
>
> — The WebNegosyo Team

---

## Guideline 5.1.1(iv) — Camera permission request

**What Apple flagged:** a custom message with a "grant access" button before the OS prompt.

**Fix shipped (`app/(main)/scan.tsx`):**
- The pre-permission button text is now **"Continue"** (was "Grant access"). Tapping it
  triggers the standard iOS camera permission dialog where the user freely chooses.
- The accompanying text is purely informational ("This screen uses the camera to scan
  customer order QR codes…"), which Apple permits.
- If the user previously denied access (`canAskAgain === false`), the button becomes
  **"Open Settings"** and deep-links via `Linking.openSettings()` — we never re-nag.
- No other screen presents a directive "allow/grant" button before a system permission.

---

## Guideline 5.1.1(v) — Account deletion

**Fix shipped:** in-app, self-service, permanent deletion.

**Where it lives:**
- New **Account** screen (`app/(main)/account.tsx`), reachable from the **Account** button in
  the dashboard header (top-right, visible immediately after sign-in).
- The screen shows the signed-in store/email, a **Sign Out** button, and a clearly labeled
  **Delete account** section with a red **Delete Account** button.

**What happens on delete:**
1. Tap **Delete Account** → a confirmation dialog explains it is permanent and cannot be
   undone (this is an accidental-deletion safeguard, not a deactivation).
2. On confirm, the app calls a secured Supabase Edge Function (`delete-account`) that:
   - identifies the caller from their own auth token (a user can only delete *their own*
     account),
   - removes their access record, and
   - **deletes the auth user** so the credential can never sign in again.
3. The app signs out locally and returns to the login screen with a confirmation.

This is true deletion (not deactivation), requires no website/email/phone step, and is
available to any account created via the in-app **Create your store** flow.

**Reviewer walkthrough (for the screen recording — capture on a physical device):**
> 1. **Sign in with the merchant credentials provided in App Review Information** (Email +
>    Password). Do **not** use "Explore Demo" for this test — the no-login demo session has no
>    account, so it intentionally hides Delete Account.
> 2. On the dashboard, tap **Account** (top-right).
> 3. Tap **Delete Account**, then confirm **Delete Account** in the dialog.
> 4. The app confirms "Account deleted" and returns to the login screen. The deleted
>    credentials can no longer sign in.

> ⚠️ The credentials you provide for this test **must be a throwaway/test merchant account** —
> deletion is permanent.

> ℹ️ Note on account creation: the in-app **"Create your store"** form submits an onboarding
> request; the merchant account itself is then provisioned by our team (there is no in-app
> self-service `auth.signUp`). The in-app **Delete Account** flow above fully satisfies the
> deletion requirement for those provisioned accounts.

---

## Guideline 3.1.1 — In-App Purchase (business-model appeal)

There is **no purchasable digital content inside the app** and **no IAP path to remove or
add** — the app is free and contains no store, paywall, price, "subscribe", or external
purchase link. The platform subscription is a **B2B service billed to businesses outside the
app**. Answers for the record:

1. **Who uses the paid services?** Independent food/retail businesses and their staff who run
   a store on WebNegosyo. The app itself is a free management tool with no paid content.
2. **Where is anything purchased?** Nothing is purchased in the app. The optional platform
   subscription is a separate B2B arrangement made outside the app — no paywall, no IAP.
3. **What "previously purchased" content is accessed?** After signing in, a merchant manages
   their *own* store operations: real-time orders, order-status changes, daily sales, revenue
   trends, product analytics, and (optionally) printing receipts to their own hardware. These
   are operational business tools, not digital content sold to consumers.
4. **Is it a single-company internal app?** No — it serves many independent businesses, each
   with separate accounts and data. Anyone can become a merchant.
5. **What is unlocked without IAP?** Nothing in the app is gated by a purchase. The app is
   free; the B2B SaaS subscription (software to run an online-ordering business) is billed
   outside the app and unlocks no digital goods inside the app.
6. **Consumers, single users, or businesses?** Sold to **businesses** (restaurants and small
   food/retail merchants) as a tool to run their store — not a consumer or family product.
7. **Comparable apps:** Square, Toast, Shopify, Lightspeed, and similar merchant companion
   apps that let a business manage its own operations without IAP for the B2B subscription.
8. **Guidelines relied on:** 3.1.3(e) "Goods and Services Outside the App" and the
   business/enterprise provisions of 3.1.3 — paid functionality consumed outside the app and
   sold business-to-business does not require In-App Purchase.

> If the reviewer's concern is a specific on-screen element, please point us to it and we will
> adjust immediately — but to our knowledge the app surfaces no purchasable digital content.

---

## App Review Information — set before resubmitting

- [ ] **🔴 Provision a throwaway test merchant account** (real Supabase auth user + `app_users`
      admin row for a test tenant) and put its **Email + Password** in **Sign-In Required**.
      This is the single most important step — without real credentials the reviewer **cannot
      reach Delete Account** (the no-login demo intentionally hides it) and will likely
      re-reject 5.1.1(v).
- [ ] **Notes** — add:
  > • Browse with no login: tap **"Explore Demo — no account needed"** on the first screen.
  > • **To verify account deletion, sign in with the merchant Email/Password above (NOT the
  >   demo)**, then tap **Account** (top-right) → **Delete Account** → confirm. A screen
  >   recording of the full flow is attached.
  > • The app is a free B2B merchant tool — no in-app purchases, paywall, or digital goods.
  >   "Create your store" submits an onboarding request; accounts are provisioned by our team.
- [ ] **Attach the account-deletion screen recording** (physical device, throwaway account).

## Pre-resubmit checklist

- [ ] Build 15 uploaded to App Store Connect and attached to this version.
- [ ] `delete-account` Supabase Edge Function deployed (done) and reachable from the app.
- [ ] Camera "Continue" wording verified on device.
- [ ] Account → Delete Account flow verified on device with a throwaway account.
- [ ] **iOS printer smoke-test** (physical iPad, iPadOS 26): cold launch (no crash), open
      **Printer Settings**, **Scan for Printers** (Bluetooth prompt appears), and a test print.
      iOS printing was just re-enabled (SDK 54 New Architecture). If printing is unavailable on
      iOS, pin `newArchEnabled: false` via the `expo-build-properties` plugin and rebuild —
      this does not affect App Review approval (the failure mode is graceful, not a crash).
- [ ] Resolution Center reply (above) posted for all three guidelines.
- [ ] Submit for Review.

## Files changed in this build (for reference)

| Area | File |
|---|---|
| Camera button wording + Settings fallback | `app/(main)/scan.tsx` |
| Account screen + in-app deletion | `app/(main)/account.tsx` |
| Hidden `account` route | `app/(main)/_layout.tsx` |
| Account entry point (header) | `app/(main)/dashboard.tsx` |
| Server-side deletion | `supabase/functions/delete-account/index.ts` |
| iOS thermal printer re-enabled | `lib/printer.ts`, `react-native.config.js` |
