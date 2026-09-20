# Image backup (Supabase URLs + ImageKit)

Snapshot of every image URL stored in Supabase, plus files currently in the
ImageKit media library. Use this if ImageKit or a leftover Cloudinary account
goes down and you need to re-host the bytes and relink the database.

Supabase Storage itself has no buckets/objects — images live as delivery URLs
on ImageKit (and some still on Cloudinary / Loyverse).

## Commands

```bash
node image-backup/extract.mjs        # pull URL list from Supabase + ImageKit
node image-backup/backup.mjs         # download into files/ (resumable)
node image-backup/backup.mjs --retry # also retry previous HTTP/network failures
node image-backup/restore.mjs        # dry-run re-upload to ImageKit
node image-backup/restore.mjs --go   # actually re-upload
node image-backup/relink.mjs         # generate relink.sql from restore-result.json
```

`backup.mjs` is resumable and will hardlink/copy matching files from
`cloudinary-backup/files/` when the public path is the same, so the old
Cloudinary snapshot is reused instead of downloaded twice.

Download stops if free disk drops below 1.5 GB.

## Layout

| Path | Purpose |
|------|---------|
| `urls.json` | Canonical URL list + source columns |
| `backup.mjs` / `extract.mjs` / `restore.mjs` | Tooling |
| `manifest.json` | Per-URL download result (sha256, bytes, local path) |
| `files/` | Image bytes (`files/<provider>/...`) — **gitignored** |
| `restore-result.json` | old URL → new ImageKit URL after a restore |

Copy `files/` plus `manifest.json` / `urls.json` to an external drive or object
storage. The bytes are too large for git.

## Snapshot (2026-09-16)

Supabase Storage buckets: **none** (0 objects). Images are delivery URLs.

| Source | Unique URLs | Downloaded | Notes |
|--------|-------------|------------|--------|
| ImageKit (`hau6qlmlz`, `hd3mbcia1`, `vmgfsnjfe`, `yz7rsjjak`) | 7,664 | **7,602** | 17 oversized originals saved as 4096px max; 62 missing (404) |
| Loyverse | 400 | **393** | 7 gone (404) |
| Cloudinary (still in DB) | 1,604 | **0** | All `dns9deszp` — HTTP 401, account already disabled |
| Facebook CDN | 1 | **0** | HTTP 403 |
| **Total** | **9,669** | **7,995** | **~2.9 GB** in `files/` |

To restore after an ImageKit outage:

1. `node image-backup/restore.mjs --go` — re-upload bytes to ImageKit, preserving paths.
2. `node image-backup/relink.mjs` — generate `relink.sql` if the ImageKit URL endpoint changed.
3. Run `relink.sql` in the Supabase SQL editor.
