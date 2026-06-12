# Cloudinary Image Backup

A self-contained snapshot of every Cloudinary image referenced by the Supabase
database, plus tooling to re-upload it all if a Cloudinary account is lost,
suspended, or migrated.

## Why this exists

The Cloudinary **Admin API for these credentials returns `"disabled customer"`**,
so the asset list cannot be pulled from Cloudinary itself. Instead, the source of
truth is the set of delivery URLs stored in the Supabase database. This backup
captures every one of those.

### Backup result (2026-06-01)

| Cloud         | Images | Downloaded | Status |
|---------------|--------|-----------|--------|
| `debk7mmfy`   | 1,039  | ✅ 1,039  | live (HTTP 200) |
| `dvx6cpbuq`   | 1,055  | ✅ 1,055  | live (HTTP 200) |
| `dns9deszp`   | 1,861  | ❌ 0      | **HTTP 401 — account disabled.** Could not be recovered via delivery URLs. |
| **Total**     | 3,955  | **2,094** | 1.6 GB on disk, 0 zero-byte files |

**1,861 images on `dns9deszp` are not in this backup** — that account was already
suspended when the backup ran, so its assets were unreachable. If you still have
login access to the `dns9deszp` Cloudinary dashboard, export them from the Media
Library manually and drop them into `files/dns9deszp/<public_id>.<ext>` to complete
the set; otherwise they should be treated as lost.

Note: `.env.local` only contains API credentials for the **disabled** `dns9deszp`
account. There are no API credentials for the two live clouds — only their public
delivery URLs, which is all the download needs.

## Files

| File                  | Purpose                                                        | In git? |
|-----------------------|----------------------------------------------------------------|---------|
| `urls.txt`            | All distinct Cloudinary URLs found in the DB (one per line)    | yes     |
| `backup.mjs`          | Downloads every URL into `files/`, writes `manifest.json`      | yes     |
| `manifest.json`       | Per-URL record: cloud, public_id, version, format, sha256, status, local path | yes |
| `restore.mjs`         | Re-uploads `files/` to a target Cloudinary account, preserving public_id | yes |
| `relink-db.mjs`       | Rewrites Supabase URLs using `restore-result.json` (only if cloud changed) | yes |
| `files/`              | The actual downloaded image bytes (`files/<cloud>/<public_id>.<ext>`) | **no** (gitignored — too large) |
| `restore-result.json` | old URL → new URL map produced by a restore run                | created on restore |

The image bytes are intentionally **not** committed (could be hundreds of MB).
Back up the `files/` directory separately (e.g. external drive, S3, Google Drive).
Everything needed to *rebuild* `files/` while the live clouds are up is in git.

## How to refresh the URL list

The URL list was extracted by scanning every text/jsonb column in Supabase that
can hold an image URL (`menu_items.image_url`, `.addons`, `.variation_types`,
`.variations`, `bundles.image_url`, `categories.icon`/`.default_addons`,
`tenants.logo_url`/`flash_screen_image_url`/`promotion_image_url`/`promotion_banners`,
`payment_methods.qr_code_url`, `platform_payment_methods.qr_code_url`,
`orders.payment_method_qr_code_url`, `checkout_leads.payment_proof_url`).

Re-run the extraction query in `EXTRACT_QUERY.sql` against Supabase and dump the
distinct `url` column into `urls.txt` to refresh.

## Download (back up)

```bash
node cloudinary-backup/backup.mjs           # download all pending URLs
node cloudinary-backup/backup.mjs --retry   # also re-attempt previously-failed URLs
```

Resumable and safe to re-run — anything already `ok` in the manifest is skipped.

## Restore (re-upload)

Re-uploads preserve the original `public_id`, so:

- **Same cloud restored** → identical delivery URLs → **no database change needed.**
- **New cloud** → only the cloud name in the URL changes → run `relink-db.mjs`.

```bash
export CLOUDINARY_URL='cloudinary://API_KEY:API_SECRET@TARGET_CLOUD'
node cloudinary-backup/restore.mjs                 # dry run — shows what it would do
node cloudinary-backup/restore.mjs --go            # upload everything
node cloudinary-backup/restore.mjs --go --only-cloud=dns9deszp   # only assets from one source cloud
```

This writes `restore-result.json` (old URL → new URL).

## Relink the database (only if the cloud name changed)

```bash
node cloudinary-backup/relink-db.mjs        # dry run — counts rows that would change
node cloudinary-backup/relink-db.mjs --go   # apply updates to Supabase
```

Requires `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the env
(already present in `.env.local`).
