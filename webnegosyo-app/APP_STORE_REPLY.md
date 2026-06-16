# App Store Connect — Resolution Center reply (paste as-is)

Submission ID: 1c41f120-0bfb-4623-a463-9bcc0fd5d889 · Resubmitting build: **1.0 (16)**

---

Hello App Review Team,

Thank you for the detailed feedback on submission 1c41f120. We have addressed all three items in build 16.

**Guideline 5.1.1(iv) — Camera permission**

We revised the camera permission flow on the QR-scan screen. The button shown before the system prompt now reads **"Continue"** (previously "Grant access"), and the text above it only explains why the camera is used — it does not direct the user to grant access. If the user has previously declined, we instead show an **"Open Settings"** button that links to the iOS Settings app rather than re-requesting. The first camera request the user sees is the standard system permission dialog.

**Guideline 5.1.1(v) — Account deletion**

We added a fully in-app account deletion flow. After signing in, a merchant taps **Account** (top-right of the dashboard) → **Delete Account** → confirms, and the account is **permanently deleted** on our server (the login credential is removed and can no longer be used to sign in). No website visit, email, or phone call is required.

To verify this, please sign in with the **merchant credentials provided in App Review Information** (Email + Password), then go to **Account → Delete Account**. Please note: the "Explore Demo — no account needed" option is an anonymous, no-login browsing mode, so it has no account to delete and intentionally hides this control — the deletion flow must be tested with the provided sign-in credentials. A screen recording of the complete flow on a physical device is attached in App Review Information.

For context: the in-app "Create your store" form submits an onboarding request, and the merchant account is then provisioned by our team; the in-app Delete Account flow above fully covers deletion for these accounts.

**Guideline 3.1.1 — In-App Purchase**

WebNegosyo Admin is a **free business-operations tool** that lets food and retail merchants manage their own real-world orders and view their own store's analytics. The app contains **no in-app purchases, no paywall, no subscription screen, and no purchase or "subscribe" call-to-action of any kind** — there is no StoreKit/IAP code or entitlement in the binary.

The online-ordering/"smart menu" platform a merchant uses is a **business-to-business SaaS service sold to businesses** (not to consumers) and is arranged separately, outside the app — the same model as merchant companion apps such as Square, Toast, and Shopify. Under Guideline 3.1.3(e) ("Goods and Services Outside the App") and the business-app provisions of 3.1.3, this category is not required to use In-App Purchase, as nothing digital is sold or unlocked within the app.

If there is a specific on-screen element the team would like us to review, please point us to it and we will adjust right away — to our knowledge the app surfaces no purchasable digital content.

Thank you for your time and for the clear guidance. Please let us know if any further detail would help.

— The WebNegosyo Team
