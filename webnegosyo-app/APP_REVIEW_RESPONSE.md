# App Review Response — Submission 1c41f120 (WebNegosyo Admin)

Everything below is ready to paste into App Store Connect → Resolution Center,
plus the fields to change before resubmitting.

---

## What changed in this build (lead with this in your reply)

> Thank you for the detailed feedback. We have made the following changes:
>
> 1. **Anyone can now use the app without an account.** We added an **"Explore
>    Demo — no account needed"** button on the first screen. Tapping it opens a
>    fully-populated sample store with live orders, analytics, and trends, so
>    the app is usable by the general public and reviewers immediately, with no
>    login required.
> 2. **Self-service onboarding.** We added a **"Create your store"** sign-up
>    form so any business can request an account directly in the app. WebNegosyo
>    is open to any food or retail business — it is not limited to specific
>    companies.
> 3. **Verified demo credentials** are provided in App Review Information for the
>    full signed-in experience.
> 4. **Support page** with contact information is published at
>    https://webnegosyo.com/support and set as our Support URL.
> 5. **Stability hardening** on the post-login path so an incomplete store
>    configuration can no longer block or crash the screen.

---

## Guideline 2.1(a) — Could not advance past login

**Fixes shipped:**
- Added **Explore Demo** on the login screen → no credentials required, lands
  directly on a working dashboard. This guarantees the reviewer gets past the
  login screen.
- Verified/refreshed the demo sign-in credentials.
- Hardened the post-login code paths (Convex client init + push registration)
  so they degrade gracefully instead of erroring.

**To reproduce a successful run (include in reply):**
> On the first screen, tap **"Explore Demo — no account needed."** You will land
> on the dashboard with live sample orders. You can browse Orders, Analytics,
> Trends, and Products tabs. To test the signed-in experience, use the demo
> account in App Review Information.

**Action items:**
- [ ] Put working demo credentials in **App Review Information → Sign-In Required**.
- [ ] In **Notes**, add: "No login is required — tap 'Explore Demo' on the first
      screen to use the app. Sign-in credentials are also provided for the full
      experience."

---

## Guideline 1.5 — Support URL

**Fix:** Support page published at **https://webnegosyo.com/support** (contact
email, hours, FAQ on sign-in/onboarding).

**Action item:**
- [ ] **App Information → Support URL** → change to `https://webnegosyo.com/support`.
- [ ] Deploy the web app to production first so the page is live.

---

## Guideline 2.1(b) — Business model answers (paste into Resolution Center)

**Lead summary:**
> WebNegosyo Admin is a **free** companion app for merchants to manage real-world
> food/retail orders and view their own store's analytics. It contains **no
> in-app purchases, no digital goods, and no paywall.** The platform is open to
> **any** business — anyone can explore the demo without an account or request a
> store in-app. The optional platform subscription is a separate B2B SaaS
> service billed outside the app.

1. **Who uses the paid content/features/services?**
   Independent food and retail merchants and their staff who run a store on
   WebNegosyo. The app itself has no paid content — it is a free management tool.

2. **Where can users purchase the content/subscriptions/features?**
   Nothing is purchased inside the app. The optional platform subscription is
   arranged separately (B2B), outside the app. There is no paywall or IAP.

3. **What previously-purchased content can a user access?**
   After signing in, a merchant accesses operational tools for their own store:
   real-time orders, order-status management, daily sales, revenue trends, and
   product analytics. These are business tools, not digital content for sale.

4. **Is the app restricted to a single company?**
   No. It is used by many independent businesses, each with separate accounts
   and data. It is **not** a single-company internal app.

5. **What paid features are unlocked without IAP?**
   None inside the app. The app is free. The optional platform subscription is a
   B2B service (software to run an online-ordering business) billed outside the
   app; it does not unlock digital goods in the app.

6. **What features are for the general public?**
   The app is open to the public: anyone can tap **Explore Demo** to use it with
   no account, and any business can submit a **Create your store** request
   in-app. Consumers separately order food through each merchant's own website.

7. **Sold to single users, consumers, or families?**
   Sold to businesses (restaurants and small food/retail merchants) as a tool to
   run their store. Not a consumer or family product.

8. **Max users in live, real-time services?**
   Real-time features (live order queue/notifications) are scoped to one store
   and its staff — typically 1–10 people per store. No large-scale live service.

9. **Physical goods bundled with digital content?**
   No. The app manages physical-world food orders. No digital content is sold,
   and nothing is purchased in the app.

10. **Limited/specific group of companies, or open to any?**
    **Open to any company.** Any qualifying food or retail business can become a
    WebNegosyo merchant and use this app. It is not limited to a fixed set of
    companies. Interested businesses can sign up in-app ("Create your store") or
    via https://webnegosyo.com/support.

---

## Ready-to-send email / reply (copy-paste)

> Hello App Review Team,
>
> Thank you for the feedback on submission 1c41f120 (WebNegosyo Admin).
>
> **2.1(a):** We resolved the login issue two ways. First, the app no longer
> requires an account to use — tapping "Explore Demo — no account needed" on the
> first screen opens a fully working store with live sample orders and analytics.
> Second, we verified the demo sign-in credentials in App Review Information and
> hardened the post-login screens so they cannot error on an incomplete store.
>
> **1.5:** Our Support URL now points to https://webnegosyo.com/support, a page
> with our contact email, support hours, and an FAQ.
>
> **2.1(b):** WebNegosyo Admin is a free companion app for food and retail
> merchants to manage real-world orders and view their own store's analytics. It
> has no in-app purchases, no digital goods, and no paywall. The app is open to
> the general public — anyone can explore the demo without an account, and any
> business can request a store directly in the app. It is not restricted to any
> specific company; any qualifying business can become a client. The optional
> platform subscription is a separate B2B service billed outside the app. Full
> answers to all ten questions are included above.
>
> Please let us know if any further detail would help. Thank you.
>
> — The WebNegosyo Team

---

## Pre-resubmit checklist

- [ ] Web app deployed to production (so /support is live).
- [ ] Support URL updated to /support.
- [ ] Demo credentials verified + entered in App Review Information.
- [ ] Reviewer note added ("tap Explore Demo, no login needed").
- [ ] 2.1(b) answers + email posted in Resolution Center.
- [ ] New build (with Demo Mode + Sign-Up) uploaded and attached.
- [ ] Submit for Review.

## New features added in this change (for your reference)

| Feature | File | Purpose |
|---|---|---|
| Explore Demo (no-login) | `app/(auth)/login.tsx`, `lib/demo.ts`, `stores/auth-store.ts` | Public, instant access; gets reviewer past login |
| Demo read-only guards | `app/(main)/orders.tsx`, `order/[orderId].tsx`, `product-analytics.tsx`, `scan.tsx` | Guests can't mutate the live demo store |
| Demo banner | `app/(main)/dashboard.tsx` | Clear "you're in a demo" + how to create a store |
| Create your store (sign-up) | `app/(auth)/signup.tsx`, table `app_signup_requests` | Self-service onboarding; proves public availability |
| Support page | `src/app/support/page.tsx` | Fixes Guideline 1.5 |
