# Master Plan: WebNegosyo Mobile & Desktop Apps

## Context

WebNegosyo is a multi-tenant restaurant ordering SaaS (102+ tenants). The platform currently runs as a server-rendered Next.js 15 web app with Supabase backend. There are **no native apps, no PWA, no push notifications, and no real-time features**. The business needs:

1. **Customer App** — White-labeled per tenant. Each restaurant gets their own branded app on Play Store, App Store, and browser install.
2. **Admin App** — Real-time order tracking with push notifications. Both mobile and desktop.

This plan covers both as separate development tracks with shared infrastructure.

---

## Shared Infrastructure (Must Build First)

These changes are prerequisites for both customer and admin apps.

### 1. Supabase Realtime for Orders

Enable real-time subscriptions on the `orders` table so admin dashboards get live order updates.

**Migration:**
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
```

### 2. RLS Policies for Orders & Menu Items

Both `orders` and `menu_items` currently have **RLS disabled**. This is a security risk and blocks Realtime (which respects RLS).

**Migration — orders:**
- Tenant admins can SELECT their own tenant's orders
- Superadmins can SELECT all orders
- Public can INSERT orders (customer placing order)
- Tenant admins can UPDATE their own tenant's orders

**Migration — menu_items:**
- Public can SELECT where `is_available = true`
- Tenant admins can full CRUD on their own tenant's items

### 3. Push Notification Infrastructure

**New table:** `push_subscriptions`
- `id`, `user_id`, `tenant_id`, `endpoint`, `p256dh`, `auth_key`, `device_type`, `created_at`
- RLS: users can manage their own subscriptions

**VAPID keys:** Generate and store as env vars (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`)

**Push dispatch:** Supabase Edge Function triggered by database webhook on `orders` INSERT → sends Web Push to all subscribed admins for that `tenant_id`.

### 4. Service Worker

Required for both PWA install and push notifications. Use `serwist` (maintained successor to `next-pwa`).

**Caching strategy:**
- Cache-first: static assets (`_next/static/`), fonts, UI icons
- Stale-while-revalidate: menu pages, category data
- Network-first: cart, checkout, admin pages
- Cache Cloudinary images with size-based TTL

**Files to modify:**
- `next.config.ts` — serwist plugin config
- `src/app/layout.tsx` — service worker registration
- New: `src/app/sw.ts` — service worker entry point

---

## Track 1: Customer App (Per-Tenant White-Labeled)

### Phase 1: PWA Foundation (Week 1-2)

This is the base that ALL distribution channels build upon.

#### 1A. Dynamic Web App Manifest

**New file:** `src/app/api/manifest/route.ts`

Generates a unique `manifest.json` per tenant using their branding data:
- `name` → tenant display name
- `short_name` → tenant slug or abbreviated name
- `theme_color` → tenant's `primary_color` from branding
- `background_color` → tenant's `background_color`
- `icons` → tenant's logo (resized to 192x192 and 512x512 via Cloudinary transforms)
- `start_url` → `/menu` (relative to tenant's domain)
- `display` → `standalone`
- `scope` → `/`

**Modify:** `src/app/[tenant]/layout.tsx` — add `<link rel="manifest">` pointing to `/api/manifest?tenant={slug}`

**Modify:** `src/app/[tenant]/layout.tsx` — add meta tags: `<meta name="apple-mobile-web-app-capable">`, `<meta name="theme-color">`, `<link rel="apple-touch-icon">`

#### 1B. App Icon Generation

**New API route:** `src/app/api/icon/route.ts`

Takes tenant slug + size, returns the tenant's logo resized via Cloudinary URL transforms. Generates maskable icons for Android adaptive icons.

If tenant has no logo, generate a colored icon with their initials using Canvas API or SVG.

#### 1C. Install Prompt

**New component:** `src/components/customer/install-prompt.tsx`

- Listens for `beforeinstallprompt` event (Chrome/Android)
- Shows a branded banner: "Install {Restaurant Name} for quick ordering"
- For iOS Safari: detects `navigator.standalone` and shows manual instructions ("Tap Share → Add to Home Screen")
- Dismissable with localStorage persistence (don't show again for 7 days)
- Only shows on customer menu pages, not admin

#### 1D. Offline Fallback

- Offline page (`src/app/offline/page.tsx`) with tenant branding
- Service worker serves cached menu when offline
- Cart works offline (already localStorage-based)
- Checkout blocked offline with friendly message

**Estimated effort:** 2 weeks

### Phase 2: Google Play Store via TWA (Week 3-4)

TWA (Trusted Web Activity) wraps a PWA into an Android app. Google officially supports this.

#### 2A. Digital Asset Links

**New file:** `src/app/.well-known/assetlinks.json/route.ts`

Dynamic route that returns Digital Asset Links per tenant's custom domain, proving ownership of the URL for TWA. This is required by Google Play to remove the browser address bar.

#### 2B. Automated Build Pipeline

Use **Bubblewrap** (Google's official TWA CLI tool) to generate Android projects:

```
Input per tenant:
- App name (from tenant.name)
- Package name (com.webnegosyo.{slug})
- Start URL (https://{tenant-domain}/menu)
- Theme color (from tenant branding)
- Icons (from /api/icon endpoint)
- Signing key

Output: Signed AAB (Android App Bundle)
```

**Automation script:** A Node.js script that:
1. Queries all tenants from Supabase
2. For each tenant with `play_store_enabled = true`:
   - Generates Bubblewrap config from tenant data
   - Builds signed AAB
   - Optionally uploads to Play Store via Google Play Developer API

**New tenant field:** `play_store_enabled` (boolean), `play_store_listing_id` (text)

#### 2C. Play Store Listing

Each tenant gets their own listing with:
- App name: "{Restaurant Name}"
- Screenshots: Auto-generated from their menu page
- Description: Template with restaurant-specific details
- Developer: WebNegosyo (single developer account, $25)

**Estimated effort:** 2 weeks for pipeline, then ~30 min per tenant to publish

### Phase 3: Apple App Store via Capacitor (Week 5-8)

Apple does NOT support TWA. We need Capacitor to wrap the web app in a native iOS shell.

#### 3A. Capacitor Project Template

Create a template Capacitor project that:
- Points WKWebView to `https://{tenant-domain}/menu`
- Configures native push notifications (APNs)
- Sets app icon, splash screen, and display name from tenant data
- Handles deep links and universal links

**Template structure:**
```
capacitor-template/
├── capacitor.config.ts    (templated with tenant vars)
├── ios/App/               (Xcode project)
├── android/app/           (also usable for Play Store alternative)
└── scripts/
    └── build-tenant.sh    (generates tenant-specific build)
```

#### 3B. Automated iOS Build Pipeline

Script that per tenant:
1. Copies template project
2. Injects tenant config (name, domain, colors, icons)
3. Generates iOS icons from tenant logo (1024x1024 → all required sizes)
4. Updates `Info.plist` with tenant-specific bundle ID
5. Builds via `xcodebuild` (requires Mac with Xcode)
6. Signs with distribution certificate
7. Uploads to App Store Connect via `altool` or Transporter

**Requirements:**
- Apple Developer Account ($99/year)
- Mac build machine (local or CI like GitHub Actions with macOS runner)
- Distribution certificate + provisioning profiles

**New tenant fields:** `app_store_enabled` (boolean), `apple_app_id` (text)

#### 3C. Native Push for iOS

Capacitor's `@capacitor/push-notifications` plugin:
- Register for APNs token on app launch
- Send token to backend (store in `push_subscriptions` table with `device_type = 'ios'`)
- Backend sends via APNs (using Supabase Edge Function)

**Estimated effort:** 4 weeks (includes Apple review process learning curve)

### Phase 4: Customer App Polish (Week 9-10)

- **App rating prompt** — After 3rd order, prompt to rate on Play Store / App Store
- **Deep links** — `https://{tenant}/menu/item/{id}` opens directly in installed app
- **Share functionality** — "Share this restaurant" generates app store / PWA install link
- **Splash screens** — Branded per tenant on native apps
- **Analytics** — Track installs, active users per tenant per platform

---

## Track 2: Admin App (Order Management & Notifications)

### Phase 1: Real-Time Order Dashboard (Week 1-2)

#### 1A. Live Order Feed

**Modify:** `src/components/admin/orders-list.tsx` (or create new wrapper)

Add Supabase Realtime subscription:
```typescript
supabase
  .channel(`orders:${tenantId}`)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'orders',
    filter: `tenant_id=eq.${tenantId}`
  }, handleOrderChange)
  .subscribe()
```

- New orders: prepend to list + play notification sound + show toast
- Status updates: animate the order card transition
- Auto-refresh order counts in dashboard stats

#### 1B. Order Notification Sound

**New:** Audio file for new order notification (subtle chime)
- Play via Web Audio API when new order arrives
- Respect browser autoplay policies (require user interaction first)
- Volume control in admin settings

#### 1C. Order Quick Actions

**Modify:** Order list items to support quick status transitions:
- Swipe right → Confirm order
- Swipe left → Mark as preparing
- Tap status badge → Cycle through statuses
- Visual indicators: color-coded status, time since order

### Phase 2: Admin Push Notifications (Week 3)

#### 2A. Notification Permission Flow

**Modify:** `src/components/admin/admin-layout-client.tsx`

On first admin login:
1. Show notification opt-in card: "Get notified when new orders arrive"
2. Request `Notification.permission`
3. Subscribe to Web Push using VAPID public key
4. Send subscription to server → store in `push_subscriptions`

#### 2B. Push Content

When new order is placed:
- **Title:** "New Order #{order_number}"
- **Body:** "{customer_name} - {item_count} items - ₱{total}"
- **Action:** Click opens order detail in admin dashboard
- **Badge:** Update app badge count (supported on Android PWA)

#### 2C. Notification Preferences

**New component:** `src/components/admin/notification-settings.tsx`

- Toggle: New orders
- Toggle: Order status changes
- Toggle: Sound on/off
- Quiet hours: Don't notify between X and Y time
- Store preferences in `push_subscriptions` or new `notification_preferences` table

### Phase 3: Admin PWA (Week 4)

#### 3A. Admin Manifest

Separate manifest for admin pages:
- `name`: "{Restaurant Name} Admin"
- `start_url`: `/admin`
- `display`: `standalone`
- `theme_color`: Admin theme color (darker/professional variant)

**New route:** `src/app/api/manifest/admin/route.ts`

**Modify:** `src/app/[tenant]/admin/layout.tsx` — link to admin manifest

#### 3B. Admin Install Prompt

**New component:** `src/components/admin/install-prompt.tsx`

- Show after first login: "Install the admin app for instant order notifications"
- Especially important on mobile: standalone mode hides browser chrome
- Show on both mobile and desktop

#### 3C. Mobile Admin UX Improvements

**Modify:** Admin layout for mobile-optimized experience:
- Bottom tab navigation (Dashboard, Orders, Menu, Settings) instead of sidebar on mobile
- Pull-to-refresh on orders list
- Floating action button for quick actions
- Haptic feedback on order status changes (via `navigator.vibrate`)

### Phase 4: Desktop Admin Enhancement (Week 5)

The admin PWA installed on desktop provides:
- Taskbar/dock icon with notification badges
- Native OS notifications (via Web Push)
- Standalone window (no browser chrome)
- Auto-launch option (user configures in OS)

No Tauri/Electron needed — the PWA covers desktop use cases adequately.

**Optional future:** If merchants need features like receipt printing via USB, barcode scanning, or POS integration, then a Tauri wrapper could be justified. But that's a separate initiative.

---

## Implementation Order & Dependencies

```
Week 1-2: [SHARED] Service Worker + Realtime + RLS migrations
          [ADMIN]  Live order feed + notification sound

Week 3:   [SHARED] Push notification infrastructure (VAPID, Edge Function, subscriptions table)
          [ADMIN]  Push notification permission flow + preferences
          [CUSTOMER] Dynamic manifest + icon generation + install prompt

Week 4:   [ADMIN]  Admin PWA manifest + install prompt + mobile UX
          [CUSTOMER] Offline support + polish

Week 5-6: [CUSTOMER] Google Play TWA pipeline + Digital Asset Links
          [ADMIN]  Desktop admin enhancements

Week 7-10: [CUSTOMER] Apple App Store Capacitor pipeline
           [CUSTOMER] First batch of tenant apps submitted to stores
```

---

## Database Migrations Needed

1. `enable_realtime_orders` — Add orders to realtime publication
2. `add_rls_orders` — Enable RLS + policies on orders table
3. `add_rls_menu_items` — Enable RLS + policies on menu_items table
4. `create_push_subscriptions` — Push subscription storage
5. `add_app_store_fields` — `play_store_enabled`, `app_store_enabled`, `apple_app_id`, `play_store_listing_id` on tenants table
6. `create_notification_preferences` — Admin notification settings

## New Dependencies

- `serwist` — Service worker for Next.js (PWA)
- `web-push` — Server-side Web Push API
- `@anthropic-ai/bubblewrap` or `@nicholasmorgan/pwa-to-apk` — TWA build tool (for Play Store pipeline)
- `@capacitor/core`, `@capacitor/push-notifications` — iOS native wrapper (for App Store pipeline)

## Key Files to Modify

- `next.config.ts` — serwist plugin, PWA headers
- `src/app/[tenant]/layout.tsx` — manifest link, meta tags, service worker registration
- `src/app/[tenant]/admin/layout.tsx` — admin manifest link
- `src/components/admin/admin-layout-client.tsx` — push notification permission
- `src/components/admin/orders-list.tsx` — Supabase Realtime subscription
- `src/lib/branding-utils.ts` — reuse for manifest generation
- `src/middleware.ts` — handle `.well-known` routes, service worker scope

## New Files to Create

- `src/app/sw.ts` — service worker entry
- `src/app/api/manifest/route.ts` — dynamic customer manifest
- `src/app/api/manifest/admin/route.ts` — admin manifest
- `src/app/api/icon/route.ts` — dynamic icon generation
- `src/app/.well-known/assetlinks.json/route.ts` — Digital Asset Links for TWA
- `src/components/customer/install-prompt.tsx` — customer install banner
- `src/components/admin/install-prompt.tsx` — admin install banner
- `src/components/admin/notification-settings.tsx` — notification preferences
- `src/app/offline/page.tsx` — offline fallback
- `supabase/functions/push-notification/index.ts` — Edge Function for push dispatch
- `scripts/build-twa.ts` — TWA build automation
- `capacitor-template/` — Capacitor project template for iOS builds

## Risks & Considerations

1. **Apple App Store rejection risk** — Apple has been known to reject apps that are "thin wrappers" around websites (Guideline 4.2). Mitigation: The Capacitor apps should include native push notifications and offline caching to demonstrate native functionality beyond a simple web view. Some tenants may need to be selective about which apps get submitted.

2. **Scaling app store listings** — Managing 102+ separate Play Store and App Store listings is operational overhead. Recommendation: Start with a "premium tier" — only tenants who pay for it get app store presence. All tenants get PWA install for free.

3. **iOS push notification limitations** — PWA push on iOS requires the app to be installed to the home screen AND iOS 16.4+. In the Philippines, iOS market share is ~15%. Native Capacitor apps solve this for premium tenants.

4. **Build infrastructure** — iOS builds require a Mac. For CI/CD, GitHub Actions macOS runners cost ~$0.08/min. Budget ~$50-100/month for automated builds.

5. **App store fees** — Apple Developer: $99/year. Google Play: $25 one-time. These are platform costs, not per-tenant.

## Verification Plan

1. **PWA:** Run Lighthouse audit — PWA score should be 100. Test install on Android Chrome, iOS Safari, desktop Chrome/Edge.
2. **Realtime:** Open admin dashboard in two tabs. Place an order. Both tabs should show the new order instantly without refresh.
3. **Push:** Close the admin dashboard. Place an order. Should receive a push notification on the device.
4. **TWA:** Build a test tenant's APK. Install on Android device. Verify no browser address bar, branding matches, push notifications work.
5. **Capacitor iOS:** Build a test tenant's IPA. Install on iOS device via TestFlight. Verify native push, branding, standalone mode.
6. **Offline:** Enable airplane mode on installed PWA. Menu should load from cache. Cart should work. Checkout should show offline message.
