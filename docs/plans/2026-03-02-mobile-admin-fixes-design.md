# Mobile Admin App Fixes Design

## Problems

### 1. Upsell Analytics Empty
The analytics screen queries `analyticsEvents` for upsell/bundle events, but the Next.js checkout never tracks these events to Convex. Result: always zeros.

### 2. Customer Details Missing
Order detail screen shows only `customerName` and `customerContact`. The checkout collects dynamic form fields per order type (email, table number, delivery address, notes, etc.) stored in `customerData` — but the mobile app ignores this field.

### 3. Default Notification Sound
Uses system default sound. Tenant wants custom `ringtone.mp3` from `public/` folder.

## Solutions

### 1. Track Upsell/Bundle Events via Convex
- From checkout upsell modal: track `upsell_shown` when modal opens, `upsell_clicked` when item added, `upsell_converted` when order placed with upsell items
- From bundle upsell modal: track `bundle_viewed` and `bundle_added`
- Set `hasUpsellItems`/`hasBundleItems` flags on order creation
- Events go to Convex `trackEvent` mutation (already exists)

### 2. Display customerData in Order Detail
- Add "Customer Details" card to `order/[orderId].tsx`
- Iterate `customerData` object keys, render each as label: value
- Format snake_case keys to Title Case
- Skip `messenger_psid` and internal fields
- Works for any order type's custom fields dynamically

### 3. Custom Notification Sound
- Copy `ringtone.mp3` to `webnegosyo-app/assets/`
- Configure Android notification channel with custom sound
- Reference custom sound in local notification scheduling
- For iOS: sound file in app bundle with notification config
