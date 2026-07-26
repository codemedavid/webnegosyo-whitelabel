# TDD evidence — background-image upload fails in the Branding Studio

**Source plan:** none. Derived from a merchant report: uploading a background image in
the Branding Studio ("Page background" section) fails.

## Root cause

**Not a defect in the background-image feature — the whole ImageKit upload surface is
blocked at the account level.** Reproduced by replaying the browser's exact client-upload
flow (server-signed `token`/`expire`/`signature` → multipart POST to
`https://upload.imagekit.io/api/v1/files/upload`) from a script:

```
403 {"message":"Upload Limit Exceeded","help":"For support kindly contact us at support@imagekit.io ."}
```

The same 403 comes back for `folder=promotion-banners`, so this affects **every** upload
in the platform (menu item images, banners, logos, payment proofs, mobile apps), not just
page backgrounds. Account usage at the time of the run (ImageKit `/v1/accounts/usage`,
credentials valid — the management API answers `200`):

| Window | Bandwidth | Media library storage |
| --- | --- | --- |
| 2026-06-27 → 2026-07-26 | 16.45 GB | 2.21 GB |
| 2026-07-01 → 2026-07-26 | 14.05 GB | 2.28 GB |
| 2026-06-01 → 2026-06-30 | 2.13 GB | 1.74 GB |

Bandwidth has grown ~8× month over month. Clearing the block is an ImageKit
account/plan action (upgrade or contact support); it cannot be fixed in this repo.

The **code defect** the report exposes is that this was invisible. `uploadImageToImageKit`
discarded the response body on any non-2xx and rejected with a fixed
`'Upload failed. Please try again.'`, which the `ImageUpload` widget rendered as a toast.
A merchant hitting a hard quota block is told to retry — advice that can never work — and
nothing reaches the console for an operator to diagnose. The auth step masked its failure
the same way.

The rest of the feature verified sound while investigating:

- Migration `20260725140000_page_background_overlay.sql` **is applied** in production —
  all seven `background_*` columns present in `information_schema.columns`.
- `TENANT_STOREFRONT_SELECT` projects all seven columns.
- `resolveBackgroundOverlay` degrades unknown enums / unsafe URLs / out-of-range
  percents to defaults (covered by `tests/unit/background-overlay.test.ts`).
- `ImageRow` emits uploaded URLs, pasted URLs, and clears
  (`tests/unit/branding-image-row.test.tsx`) — the paste-a-URL path is a working
  workaround while uploads are blocked.

## User journeys

1. As a merchant, when an upload is refused by the image host, I want to be told the
   actual reason so I can act on it (contact the platform, use a URL) instead of retrying
   forever against a failure retrying can never clear.
2. As an operator, I want the failing status and response body in the console so an
   upload outage is diagnosable without reproducing it by hand.
3. As a merchant on a healthy account, I want uploads to keep working exactly as before.

## Task report

### 1. Reproducer first (RED)

Added `tests/unit/imagekit-upload.test.ts`, driving the helper with a fake
`XMLHttpRequest` and a mocked `/api/imagekit/auth`, including the real ImageKit
403 body observed in production.

RED — `npx jest tests/unit/imagekit-upload.test.ts`:

```
✕ surfaces the reason ImageKit rejected the upload
    Expected pattern: /Upload Limit Exceeded/
    Received message: "Upload failed. Please try again."
✕ reports the status code when the rejection body is not readable
    Expected pattern: /500/
    Received message: "Upload failed. Please try again."
✕ surfaces the reason the upload could not be authorized
    Expected pattern: /Image upload is not configured\./
    Received message: "Could not authorize upload. Please try again."

Tests: 3 failed, 2 passed, 5 total
```

The two passing tests lock in the behaviour that must not change: the success shape
(url / fileId / normalized filePath) and the connection-failure message.

### 2. Surface the reason (GREEN)

`src/lib/imagekit-upload.ts`:

- New exported pure helper `readUploadErrorMessage(body)` — reads `{ message }`
  (ImageKit) or `{ error }` (our auth route) out of an error body, returning `null` for
  empty/HTML/unparseable bodies.
- Upload rejection: rejects with the service's own message, falling back to
  `Upload failed (<status>). Please try again.`; logs `{ status, body }`.
- Auth failure: same treatment, falling back to
  `Could not authorize upload (<status>). Please try again.`

`ImageUpload` already toasts `error.message`, so the merchant now sees
"Upload Limit Exceeded" rather than a retry prompt. No call-site changes were needed.

GREEN — `npx jest tests/unit/imagekit-upload.test.ts`:

```
✓ returns the hosted url, fileId and normalized filePath on success
✓ surfaces the reason ImageKit rejected the upload
✓ reports the status code when the rejection body is not readable
✓ surfaces the reason the upload could not be authorized
✓ still reports a connection failure when the request never completes

Tests: 5 passed, 5 total
```

### 3. Regression check

`npx jest` over the ImageKit + background-image suites — 7 suites, 78 tests, all passing.
Full run: 208 of 210 suites pass; the two failures
(`webnegosyo-app/lib/printer-native-load.test.ts`,
`webnegosyo-app/lib/order-item-images.test.ts`) are pre-existing and unrelated to this
change. `npx eslint` clean on both touched files; `tsc --noEmit` reports no error in
`src/` or in either file.

## Outstanding — needs an account owner

Image uploads stay dead platform-wide until the ImageKit block is lifted. Until then,
merchants can still set a background by pasting an externally hosted URL into the field
below the uploader.
