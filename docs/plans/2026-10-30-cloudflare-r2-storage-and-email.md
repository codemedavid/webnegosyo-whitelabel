# Cloudflare: R2 image storage + Email Sending + webnegosyo.com on Cloudflare DNS

Status: approved 2026-10-30. Done: P1 DNS on Cloudflare, P2 R2 bucket + media.webnegosyo.com + transformations, P5 copy (13,490 originals verified). This change: P3 readers + P4 upload switch (flag off). Next: deploy, app binary, flag on, P6 relink, P7 email (needs Workers Paid).

## Goal

Make Cloudflare our long-term home for files and email:

1. **Storage**: every new image (dish photos, logos, banners, payment proofs, hero/welcome
   designs, onboarding uploads, MCP/Loyverse mirrors, announcements, university) is stored
   in **Cloudflare R2** and served from **`https://media.webnegosyo.com/...`**, resized on
   the fly by Cloudflare Image Transformations. ImageKit is retired only after every image
   it holds has been copied and verified.
2. **Email**: the platform can send transactional email from `@webnegosyo.com` through
   **Cloudflare Email Sending** (public beta since 2026-04-16; REST API + SMTP).
3. **DNS**: `webnegosyo.com` moves from Vercel DNS to Cloudflare DNS with **zero downtime**
   for the storefronts (`*.webnegosyo.com`), the apex, `www`, superadmin, the other Vercel
   projects on the domain, and the existing Amazon SES records.

**Hard rule for every phase: nothing that works today stops working.** Each phase is
additive, has a verification step, and has a rollback that takes minutes.

## What exists today (verified 2026-10-30)

### Images
- ImageKit everywhere: `src/lib/imagekit-*.ts` (utils / server / signature / upload /
  uploader-auth / remote), `image-ingest.ts`, `payment-proof.ts`, ~45 web components,
  `webnegosyo-app/lib/{image-thumb,product-image-upload,image-picker,tenant-logo}.ts`,
  `mobile/lib/imagekit-upload.ts`, `next.config.ts` (`images.remotePatterns`),
  `scripts/validate-env.mjs`, privacy page.
- Five ImageKit accounts still deliver. `menu_items.image_url` alone: hd3mbcia1 2,340 ·
  hau6qlmlz 1,986 · yz7rsjjak 1,271 · vkhqoanac (current upload account) 1,180 ·
  vmgfsnjfe 24 · plus 1,261 legacy Cloudinary, 522 placeholder, 400 Loyverse.
- `image-backup/` already holds **14,739 originals, 8.1 GB** (`manifest.json` keyed by
  canonical URL; ImageKit fetched with `?tr=orig-true`). This is the source for the copy
  into R2 — no re-download from ImageKit needed for anything already backed up.
- **Host allow-lists that would silently break if R2 URLs appeared before they are updated:**
  - `src/lib/checkout/payment-proof-guard.ts` — drops any payment proof not on an ImageKit
    host → a checkout with an R2 proof would lose its proof.
  - `webnegosyo-app/lib/image-thumb.ts` — only resizes ImageKit/Cloudinary; R2 images would
    load full-size in the register (slow, not broken). Needs an app OTA first.
  - `next.config.ts` remotePatterns — `next/image` refuses unknown hosts.
  - `transformImageUrl` / `isOptimizableImageUrl` — unknown hosts get no resizing.

### Email
- **No code sends email today.** Set-up links and invites build `mailto:` drafts only.
- DNS already carries **Amazon SES** records (root SPF `include:amazonses.com`, 3 DKIM
  CNAMEs, `_amazonses` TXT, `feedback` MX + SPF). Most likely Supabase Auth's custom SMTP
  (password reset / invites). **Must be confirmed** and these records must survive the move.
- No MX on the apex → no inbound mail on webnegosyo.com today.

### DNS (Vercel DNS, registrar Hostinger, DNSSEC unsigned, expires 2027-02-06)
| Name | Type | Value |
|---|---|---|
| `@` | ALIAS | `4e695fd33c8b1b39.vercel-dns-017.com` (Vercel default) |
| `*` | ALIAS | `4e695fd33c8b1b39.vercel-dns-017.com` (Vercel default) |
| `*` | A | `76.76.21.21` |
| `@` | CAA | `0 issue "letsencrypt.org"`, `"sectigo.com"`, `"pki.goog"` (Vercel defaults) |
| `@` | TXT | `v=spf1 include:amazonses.com ~all` |
| `_amazonses` | TXT | `TRmncImt38Jui2/i+nGd3Cikwy+Hv2y/N6zm47qsFrE=` |
| `drkpdl5l62hp5owrhzw4hclhgkwyg7zv._domainkey` | CNAME | `…dkim.amazonses.com.` |
| `72cojxrkoj3aebj3mp4g66lnpowoqz5q._domainkey` | CNAME | `…dkim.amazonses.com.` |
| `qchl65ejufvyxhwzd5xt3n2spignntdz._domainkey` | CNAME | `…dkim.amazonses.com.` |
| `feedback` | MX | `10 feedback-smtp.us-east-1.amazonses.com.` |
| `feedback` | TXT | `v=spf1 include:amazonses.com ~all` |
| `merin` | A | `34.111.179.208` (Replit) |
| `merin` | TXT | `replit-verify=1cdeb6b2-…` |

Vercel projects on the domain: `webnegosyo-whitelabel` (`*.webnegosyo.com`, apex, `www`),
`for-rent-ph`, `pilak`, `deliverya`, `r3publika`, `hhbcshoppe`, `drivedirect` subdomains.
Tenant custom domains (pitarson.com, …) point at Vercel on their own DNS — **not affected**.
`src/lib/domains/` uses the Vercel *project domains* API, not Vercel DNS — **not affected**.

### Cloudflare account (probed read-only with the given token)
- Token valid. **R2 is not enabled yet** ("Please enable R2 through the Cloudflare
  Dashboard") → needs a payment method on the account. No zones yet.

## The one real risk: the wildcard certificate

`*.webnegosyo.com` (every storefront) uses a wildcard certificate that Vercel can only issue
and renew through a DNS challenge. Today that works because Vercel *is* the DNS. After the
move it keeps working only if Cloudflare delegates `_acme-challenge` back to Vercel
(official Vercel method, "wildcard domain without Vercel nameservers"):

- `NS _acme-challenge → ns1.vercel-dns.com.` and `ns2.vercel-dns.com.`
- Wildcard routing: `CNAME * → cname.vercel-dns-0.com.` (or the project-specific value the
  Vercel Domains page shows), **DNS only (grey cloud)** — proxying a wildcard through
  Cloudflare to Vercel is Enterprise-only and breaks Vercel's own SSL.

If this is wrong nothing breaks on day one — it breaks up to ~60–90 days later when the
cert renews. So we **prove it on day one** by forcing a re-issue (`vercel certs issue
'*.webnegosyo.com'`) right after the switch, and re-check at the next renewal.

## Decisions (recommendations — owner to confirm)

1. **Move `webnegosyo.com` itself to Cloudflare DNS** (recommended), rather than a second
   media-only domain. Email Sending *requires* the sending domain on Cloudflare DNS, and R2
   custom domains + Image Transformations need a Cloudflare zone. One zone serves all three.
   The registrar stays Hostinger; only the nameservers change.
2. **Media host = `media.webnegosyo.com`**, an R2 custom domain (proxied, orange cloud).
   Stored image URLs are permanent, so this name must never change. Never store `r2.dev`
   or `workers.dev` URLs. Add `media` (and `cdn`, `img`, `mail`, `cf-bounce`) to
   `RESERVED_SUBDOMAINS` first — no tenant has those slugs today (checked).
3. **One bucket**, `webnegosyo-media`, location hint APAC. Keys keep today's folder layout
   (`<folder>/<uuid>.<ext>`). Copied legacy images keep a deterministic key
   `legacy/<provider>/<account>/<path>` so the relink is reproducible.
4. **Uploads = presigned PUT URLs** signed by our server (R2 has no POST-policy uploads),
   with `Content-Type` and `Content-Length` signed in so a client can't swap the file type
   or size. Bucket CORS allows `PUT` (the signature is the authorization).
5. **Resizing = Cloudflare Image Transformations** on the zone:
   `https://media.webnegosyo.com/cdn-cgi/image/width=400,quality=70,format=auto/<key>`.
   "Resize from any origin" OFF (only our own media). Cost: first 5,000 unique
   transformations/month free, then ~$0.50 per 1,000 — confirm in the dashboard.
6. **Provider switch is a server env flag** (`STORAGE_UPLOAD_PROVIDER=imagekit|r2`, default
   `imagekit`). Flipping back is instant and needs no deploy of the apps.
7. **ImageKit stays alive** (read-only) until: every DB/Convex reference is relinked,
   old app builds that still upload straight to ImageKit have aged out, and 30 days pass
   with zero ImageKit hits in our own URLs.

## Phases

### Phase 0 — Account prep (owner, ~15 min)
- Enable R2 in the dashboard (add payment method). Storage for 8 GB ≈ within the 10 GB free
  tier; egress is free.
- **Rotate the credentials pasted in chat** and replace them with scoped ones:
  - R2 API token scoped to **Object Read & Write on `webnegosyo-media` only** (S3 key pair).
  - A separate token with **Email Sending: Edit** only (Phase 7).
  - An account token for zone/DNS setup that is deleted after Phase 1.
- Put them in Vercel (Production + Preview, *Sensitive*) and `.env.local`. Never in git.
- Lower TTLs on Vercel DNS records to 60s a day ahead (where Vercel allows).

### Phase 1 — Move DNS to Cloudflare with zero downtime
1. Add `webnegosyo.com` to Cloudflare (Free plan). **Do not trust the auto-import** — build
   the zone from the table above, record by record.
2. All Vercel-bound records **DNS only (grey)**: apex (CNAME-flattened to the Vercel value
   or `A 76.76.21.21` — whatever Vercel's Domains page recommends), `www`, `*`, the project
   subdomains. Add `_acme-challenge` NS ×2. Keep CAA allowing letsencrypt, sectigo, pki.goog.
3. Copy SES (SPF, `_amazonses`, 3 DKIM CNAMEs grey, `feedback` MX+TXT) and `merin` A+TXT.
4. **Pre-flight before touching Hostinger**: `dig @<assigned>.ns.cloudflare.com` for every
   name (apex, www, a real tenant slug, a random slug, superadmin, each project subdomain,
   `_acme-challenge` NS, DKIM, MX, TXT) and diff against `dig @ns1.vercel-dns.com`. Script
   it; every answer must match.
5. Switch nameservers at Hostinger. **Leave the Vercel DNS records in place** — they are the
   rollback (switch NS back).
6. Verify during propagation and after: storefront load on 3 tenant subdomains, apex, www,
   admin login, superadmin, project subdomains, `vercel certs issue '*.webnegosyo.com'`
   succeeds, Vercel Domains page shows "Valid Configuration", SES console still shows the
   domain verified, Supabase password-reset email still arrives, custom-domain
   verification flow still works for a test domain.
7. Add `_dmarc` TXT (`p=none` first, reporting on) — needed for both SES and Cloudflare.

**Rollback:** set Hostinger nameservers back to `ns1/ns2.vercel-dns.com`.

### Phase 2 — R2 bucket + media host (no app change yet)
- Create bucket, connect custom domain `media.webnegosyo.com`, CORS (PUT/GET from
  `https://*.webnegosyo.com`, `https://webnegosyo.com`, plus `*` for PUT if tenant custom
  domains upload — they do via the storefront payment proof).
- Enable Image Transformations on the zone; restrict to own origin.
- Cache rule for `media.webnegosyo.com`: long edge TTL, immutable keys.
- Verify: upload a test object via S3 API, fetch it plain and via `/cdn-cgi/image/width=200`.

### Phase 3 — Code: read R2 everywhere, still upload to ImageKit (TDD)
Make every reader understand R2 *before* any R2 URL can exist:
- `src/lib/storage/` (new): `media-url.ts` (pure: `isR2MediaUrl`, `transformR2Url`
  mapping our `ImageTransformOptions` → `width/height/fit/gravity/quality/format`),
  `r2-presign.ts` (pure SigV4 presign via `aws4fetch`, edge-safe; or `@aws-sdk/s3-request-presigner`),
  `r2-server.ts` (`server-only`: put / delete / head).
- `transformImageUrl`, `isOptimizableImageUrl`, `generateImageSrcSet` dispatch R2 → R2
  transform (ImageKit + Cloudinary kept forever as legacy renderers, like Cloudinary today).
- `payment-proof-guard.ts` allows the media host; delete path accepts R2 keys under
  `payment-proofs/` (store `r2:<key>` in `payment_proof_public_id`, no migration).
- `next.config.ts` remotePatterns + `validate-env.mjs` (R2 vars optional until Phase 4).
- `webnegosyo-app/lib/image-thumb.ts` + any customer-app thumb → R2 branch. **Ship as OTA**
  and confirm adoption before Phase 4.
- `pass-images.ts` (wallet passes), `tenant-favicon.ts`, Sentry filters, privacy page
  (add Cloudflare as a processor).
- Tests: unit tests per module, the PostgREST-capped fakes where reads page, a contract test
  that every place that recognises an ImageKit host also recognises the media host.

### Phase 4 — Switch new uploads to R2 (flag, reversible)
- New route `POST /api/uploads/sign` → `{ provider: 'r2', uploadUrl, headers, publicUrl, key }`
  (same auth + folder sanitising as `/api/imagekit/auth`). The old ImageKit route stays for
  app builds that don't know the new one.
- Browser `image-upload` / `simple-image-upload` / dish photo / payment proof, server
  uploaders (`imagekit-server` upload, `image-ingest`, `imagekit-remote`, Loyverse mirror,
  menu-import, onboarding upload, MCP) go through ONE `uploadImage()` that picks the
  provider from the flag.
- App uploaders (`product-image-upload.ts`, `mobile/lib/imagekit-upload.ts`) learn the new
  route behind a capability check → OTA.
- Flip `STORAGE_UPLOAD_PROVIDER=r2` on Preview → test every upload surface → Production.
- Watch: Sentry, upload error rate, a live checkout with payment proof on a platform store.
  **Rollback:** flip the flag back; R2 images already stored keep working (readers know them).

### Phase 5 — Copy every existing image into R2 (no URL changes yet)
- Refresh the backup (`node image-backup/extract.mjs && node image-backup/backup.mjs`) so
  anything uploaded since 2026-10-26 is included.
- New `image-backup/restore-r2.mjs`: uploads each original to
  `legacy/<provider>/<account>/<path>`, resumable, records sha256 + R2 ETag in the manifest.
- Verify: HEAD every object, byte-compare sample, transform sample. dns9deszp images stay
  dead (no source) — unchanged.

### Phase 6 — Relink stored URLs (batched, logged, reversible)
- Every source `image-backup/extract.mjs` already scans (menu_items, tenants incl.
  hero_design/welcome_design TEXT JSON, banners, bundles, orders.customer_data, onboarding,
  lessons, loyalty, announcements…), plus Convex tenants (payment proofs, cached order
  images) via their own mutations.
- A `media_relink_log` (old → new, table, row id, column) so any row can be put back.
  Batches of ≤500, statement_timeout set, per-tenant, Redis/storefront caches refreshed.
- Only relink a URL whose R2 copy is verified. Anything unmatched is left on ImageKit.
- Mobile offline packs re-download naturally (new URLs).

### Phase 7 — Email Sending foundation
- Onboard `webnegosyo.com` in Email Service → Email Sending (adds `cf-bounce` MX/SPF/DKIM;
  root SPF untouched, SES keeps working). DMARC tightened to `quarantine` once both pass.
- `src/lib/email/` (new): REST client (`/accounts/{id}/email/sending/send`), timed fetch,
  zod-validated payload, typed templates (HTML + text), a `email_log` table (service role
  only, no bodies with secrets), Upstash rate limit per recipient/tenant, suppression on
  permanent bounce.
- First emails (owner to pick — suggestions): onboarding set-up link + sign-up invite
  (replacing the `mailto:` draft), staff invite, order receipt to customers who typed an
  email, daily summary to owners.
- Supabase Auth emails: optionally move its custom SMTP from SES to Cloudflare SMTP (beta)
  — only after Cloudflare delivery is proven; SES stays as the fallback.

### Phase 8 — Retire ImageKit
- 30 days with no ImageKit URLs written and none left in the DB (query), old app builds
  gone (no `/api/imagekit/auth` calls in logs for 30 days) → remove the ImageKit upload
  route + keys; keep `imagekit-utils` as a legacy renderer (cheap insurance).
- Download a final ImageKit inventory before closing any account.

## Owner actions needed
1. Confirm the decisions above (especially moving the nameservers and `media.webnegosyo.com`).
2. Enable R2 (payment method) and rotate the pasted credentials (Phase 0).
3. Tell me what uses Amazon SES today (Supabase Auth SMTP?) and which emails to send first.
4. Do the Hostinger nameserver switch yourself when the pre-flight diff is clean (I'll give
   the two Cloudflare nameservers and the checklist).

## Out of scope
- Moving the Next.js app off Vercel, Cloudflare proxy (orange cloud) for storefront traffic,
  inbound email (Email Routing), Cloudflare Images *storage* product (we use R2 + transforms).
