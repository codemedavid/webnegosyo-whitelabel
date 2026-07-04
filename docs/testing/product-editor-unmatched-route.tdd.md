# TDD Evidence — Fix "Unmatched Route" when opening a product (webnegosyo-app)

**Source plan:** none — journeys derived during this TDD run from a bug report
(screenshot: tapping an item in Product Management showed expo-router's
"Unmatched Route / Page could not be found" screen at `webnegosyo-admin:///`).

## User journeys

- As a merchant, I want to tap a product in Product Management and land on its
  editor, so that I can edit it — instead of hitting "Unmatched Route".
- As a merchant, I want the "+ Add" button to open the editor in create mode.
- As a merchant, after creating a product I want to be redirected to that new
  product's editor.

## Root cause

Product navigation used expo-router's **object href form** with the `(main)`
group segment baked into `pathname` alongside a `[productId]` template:

```ts
router.push({ pathname: "/(main)/product/[productId]", params: { productId: product.id } })
```

Under expo-router v6 with `typedRoutes: true` this failed to resolve and fell
through to the built-in not-found screen. Order detail navigation never had the
bug because it uses a **fully-substituted string href**
(`router.push(`/(main)/order/${order._id}`)`).

## Fix

Extracted a single, unit-tested href builder `productHref()` in
`webnegosyo-app/lib/navigation.ts` that returns the substituted string path
(typed to match the generated `Href` template shape), and pointed both call
sites plus the post-create redirect at it. This aligns product navigation with
the proven order-detail pattern and centralizes the route contract (DRY).

## Task report

| Step | Command | Result |
|------|---------|--------|
| RED  | `npx jest lib/navigation.test.ts` | FAIL — `TS2307: Cannot find module './navigation'` (compile-time RED; test exercises the intended fix path) |
| GREEN | `npx jest lib/navigation.test.ts` | PASS — 4/4 |
| Regression | `npx jest` | PASS — 89/89, 6 suites |
| Type-check | `npx tsc --noEmit` | PASS — clean (typed-routes `Href` accepts the builder's return) |

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | An existing product id builds `/(main)/product/<id>` | `lib/navigation.test.ts:builds a fully-substituted string path` | unit | PASS |
| 2 | The unsubstituted `[productId]` template never leaks into the href (the exact Unmatched-Route trigger) | `lib/navigation.test.ts:never leaks the unsubstituted [productId] template` | unit | PASS |
| 3 | The `new` sentinel routes to create mode | `lib/navigation.test.ts:routes to the editor in create mode` | unit | PASS |
| 4 | URL-unsafe id characters are encoded | `lib/navigation.test.ts:encodes ids that contain URL-unsafe characters` | unit | PASS |

## Follow-up: `Cannot find native module 'ExponentImagePicker'`

Once navigation resolved, opening the editor surfaced a second, deeper defect.
`expo-image-picker` runs `requireNativeModule('ExponentImagePicker')` at module
top-level, and `[productId].tsx` imported it with a **static top-level import**,
so when the native module isn't in the running binary the whole screen module
throws at import time → crash / Unmatched Route.

Two-part resolution:

- **Operational (primary unblock):** the native module was added to JS + the
  config plugin but the native app was never rebuilt. Rebuild the dev client so
  `ExponentImagePicker` is linked: `npx expo run:ios` (or an EAS dev build). A JS
  reload cannot link native code.
- **Code hardening (TDD):** extracted `lib/image-picker.ts` which **lazy-loads**
  `expo-image-picker` inside `pickProductImage()` and returns a typed outcome. A
  missing native module now degrades to `{ status: "unavailable" }` → friendly
  Alert, instead of taking the route down. The static top-level import was
  removed from the screen.

| Step | Command | Result |
|------|---------|--------|
| RED  | `npx jest lib/image-picker.test.ts` | FAIL — `TS2307: Cannot find module './image-picker'` (compile-time RED) |
| GREEN | `npx jest lib/image-picker.test.ts` | PASS — 6/6 |
| Regression | `npx jest` | PASS — 95/95, 7 suites |
| Type-check | `npx tsc --noEmit` | PASS — clean |

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 5 | The missing-native-module error is detected (both wordings) | `lib/image-picker.test.ts:isNativeModuleMissingError` | unit | PASS |
| 6 | Unrelated errors / non-Error values are not misclassified | `lib/image-picker.test.ts:does not misclassify / non-Error values` | unit | PASS |
| 7 | Picker assets map to PickedImage with fileName/mimeType fallbacks | `lib/image-picker.test.ts:toPickedImage` | unit | PASS |

## Coverage and known gaps

`webnegosyo-app` jest is scoped to pure-logic `lib/` and `theme/` modules;
screen/router integration is verified manually via Expo (existing project
convention). Href construction and the native-module-missing detection + asset
mapping — the actual sources of both defects — are now fully unit-covered. The
`pickProductImage()` orchestrator (permission + launch flow) is a thin lazy
wrapper exercised manually. Manual verification remaining after a native
rebuild: tap a product → editor renders; tap "Add Photo" → picker opens (or a
friendly "unavailable" Alert if run against a build without the module).
