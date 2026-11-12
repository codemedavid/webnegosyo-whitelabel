# Customer app P8: App Studio (+ P0 account checklist)

Status: APPROVED 2026-11-12 — schematic preview, com.webnegosyo.<slug> ids, App Studio generates the review code. Building on feat/customer-app-studio.

## Goal

A superadmin sets up a store's customer app in one place, with no code and no
SQL. They decide:
- what it is called and how it looks on a phone (name, icon, splash);
- what its Home screen shows;
- what the store listing says;
- whether it is live.

The build pipeline (P9) reads the same rows. Merchants get a reduced version
later, behind a permission (owner decision, 2026-09-30).

The data already exists (applied 2026-10-26): `tenant_apps` holds identity and
the release gate, and `tenant_app_configs` holds the draft and published Home
config. `/api/app/v1/config` already serves `published`. What is missing is
everything that lets a person edit them.

## Screens (`/superadmin/apps`)

1. **Apps list:**
   - every store with an app: name, icon, status (draft / live / paused), last publish;
   - "Set up an app" opens a store picker. It creates the `tenant_apps` row with
     defaults from the store: name (cut to 30), `com.webnegosyo.<slug>` for both
     ids (sanitised per store rules), splash background from the brand colour.

2. **Editor** (`/superadmin/apps/[tenantId]`). Tabs on the left, a phone preview
   on the right.

   **Identity**
   - Name: at most 30 characters. That is the App Store limit; the home screen
     shows about 12, and a warning says so.
   - Bundle id / Android package: editable while the app is a draft, locked once
     it has gone live. Uniqueness is already enforced by the table.
   - Icon:
     - ImageKit upload through the existing staff signer;
     - checked at upload: square, at least 1024×1024, PNG or JPG, no transparency
       (Apple refuses it);
     - "Use store logo" when the logo qualifies.
   - Splash: image plus background colour.
   - Publisher accounts: WebNegosyo or the store's own (`store_account`).

   **App Review sign-in**
   - App Studio generates the review number's 6-digit code.
   - The code is shown once; only its hash is stored (`review_code_hash`, the
     same server key as the sign-in).
   - The code only works while the app is a draft. A regenerate button is available.

   **Appearance**
   - Font and corners (`published.theme`).
   - The colours come from Branding Studio. They are shown read-only with an
     "Edit in Branding Studio" link: one source of truth.

   **Home**
   - The block editor: add, remove, reorder, and choose who sees each block
     (everyone / guests / members), over the 8 block types the app already
     draws (member card, banners, quick actions, featured items, categories,
     rewards teaser, announcement, order again).
   - Banners: image upload, plus where a tap goes (a dish, a category, Rewards,
     a web link) picked from the real menu.
   - Copy: greeting, and the guest "join" title and body.

   **Store listing**
   - Subtitle (30), promotional text (170), description (4000), keywords (100),
     support URL, privacy URL, category.
   - Stored in `listing`. P9 sends it to the stores.

   **Release**
   - Status draft / live / paused. Paused makes the API say "unavailable".
   - iOS and Android minimum and latest versions, which drive the in-app
     "please update".
   - Store URLs, App Store Connect id, Play track.

3. **Draft → Publish:**
   - Every Home, Appearance and copy edit saves to `draft`, with autosave.
   - **Publish** validates the draft against the same contract the app checks
     (`appConfigSchema`), copies it to `published`, bumps `published_version`
     and refreshes the cached config read.
   - "Discard changes" goes back to the published version.
   - Identity, listing and release fields save directly; they are not
     runtime-published.

4. **Preview:**
   - a phone-sized web rendering of the Home screen built from the draft, the
     store's theme and its real menu;
   - it is a schematic look-alike, not the native app (a web page can't run it).
   - The tab bar and every block type are drawn so the layout and wording are
     right; the exact native look stays on the simulator.

## Server

- `src/lib/app-studio/`: pure validators (identity, listing, release, review
  code) and a draft ⇄ published diff. Tested.
- `src/app/actions/app-studio.ts` server actions:
  - each one calls `requirePlatformPermission('customer_apps.view' | 'customer_apps.edit')`;
  - writes go through the service role (the tables are service-role only);
  - `updated_by` is stamped;
  - a write that changed nothing is an error, never "saved".
- **New platform permission** `customer_apps` (view / edit) in
  `platform-staff/permissions.ts`, mapped to `/superadmin/apps` like
  `app_releases`.
- **No migration expected.** Every column exists. If the icon checks need an
  adaptive-icon foreground for Android, P9 derives it from the icon and the
  splash colour.

## Proof

- **Unit tests:** validators, publish (an invalid draft never reaches
  `published`), the permission gate, and id sanitising.
- **Browser on the test store** (`verify-webnegosyo`):
  - set up sample-demo's app, edit Home, publish;
  - `/api/app/v1/config` serves the new layout;
  - the simulator shows it after a refresh;
  - then clean up: delete the sample-demo `tenant_apps` row and draft.
- **SQL:** the rows written are exactly the ones expected, checked as the
  service role.

---

## P0: what I need from you (accounts), and the spikes they unlock

These can run in parallel with App Studio.

| Account | What exactly | Unlocks |
|---|---|---|
| **Expo / EAS** | Invite my working email to the Expo org that will own the `webnegosyo-customer` project (role: Developer) | building native apps (also fixes "this Mac's Xcode is too old") |
| **Apple Developer** | App Store Connect API key (Issuer ID, Key ID, .p8) with App Manager role, plus the Team ID | create bundle ids, TestFlight, submit |
| **Google Play Console** | Service account JSON with release permission. The first app record must be created by hand once | Play internal track, submit |
| **Firebase** | One project for all store apps; its FCM v1 service account JSON (uploaded to EAS) | Android push (P7) |
| **PayMongo** | A test-mode account: public key, secret key, webhook signing secret | in-app payments (P6) |

**Spikes, each a yes/no with evidence in a go/no-go note:**
1. Two bundle ids from one EAS project (`app.config.ts` reads the identity env).
2. One over-the-air update reaches both builds, and each keeps its own store.
3. A push reaches both apps (APNs and the one Firebase project).
4. A PayMongo test checkout, plus a signed webhook received and verified.

## Decisions for the owner

1. **Preview:** a schematic phone preview in App Studio (recommended), or none
   (check on a simulator or TestFlight only)?
2. **App ids:** `com.webnegosyo.<storeslug>` for every store app (recommended),
   or typed by hand per store?
3. **App Review sign-in:** App Studio generates the review code (recommended)?
