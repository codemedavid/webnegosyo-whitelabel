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

ImageKit files are fetched with `?tr=orig-true`. A plain delivery URL returns
ImageKit's optimized copy, not the upload: a 3.3 MB PNG came back as a 367 KB JPEG.
The 2026-09-16 run saved about 5,500 files that way. `backup.mjs` now treats any
ImageKit entry that is not a known original as pending and fetches it again.

Re-run `extract.mjs` + `backup.mjs` whenever you want new uploads included.
Only new or changed entries are downloaded.

`extract.mjs` lists the Media Library of the CURRENT ImageKit account (the
`IMAGEKIT_PRIVATE_KEY` in `.env.local`), so it also gets files that no row points
at. Older accounts (hd3mbcia1, hau6qlmlz, yz7rsjjak, vmgfsnjfe) are reached only
through the URLs stored in the database. A new table or column that stores image URLs
has to be added to `SOURCES`. The list was checked on 2026-10-26 against a scan of every
public text/jsonb column, and nothing was missing apart from Unsplash stock photos.

Not covered: payment proofs on Convex-backed stores, which live in each tenant's
Convex deployment, and private Storage buckets (Senior/PWD ID photos, expense receipts).

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

## Snapshot (2026-10-26)

Supabase Storage holds no public images: images are stored as delivery URLs.

| Source | Unique URLs | Backed up | Notes |
|--------|-------------|-----------|-------|
| ImageKit `vkhqoanac` (current, since 2026-09-28) | 3,072 | **3,072** | Whole Media Library, including 947 files no row points at |
| ImageKit `hau6qlmlz`, `yz7rsjjak`, `vmgfsnjfe` | 4,976 | **4,976** | 16 files over 25 MP are saved at 4096 px max |
| ImageKit `hd3mbcia1` | 2,709 | **2,647** | 62 return 404 on ImageKit itself, so they are already broken on the live stores |
| Loyverse | 400 | **393** | 7 gone (404) |
| Cloudinary `dns9deszp` | 1,476 | **0** | Account disabled since 2026-06 (401), so these are lost |
| Other (Facebook CDN, `debk7mmfy`) | 3 | 0 | 403 / 404 |
| **Total** | **12,636** | **13,064 files ok** (incl. earlier snapshot rows) | **~8.3 GB** in `files/` |

To restore after an ImageKit outage:

1. `node image-backup/restore.mjs --go` — re-upload bytes to ImageKit, preserving paths.
2. `node image-backup/relink.mjs` — generate `relink.sql` if the ImageKit URL endpoint changed.
3. Run `relink.sql` in the Supabase SQL editor.
