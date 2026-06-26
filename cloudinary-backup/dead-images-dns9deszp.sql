-- Worklist: images that could NOT be migrated to ImageKit.
-- These belong to the lost Cloudinary cloud `dns9deszp` (disabled, source files
-- gone), so they were intentionally left as-is by the relink. They need to be
-- re-uploaded manually (via the admin UI, which now targets ImageKit).
--
-- Run these SELECTs to list the affected rows.

-- Menu item hero images (the bulk: ~1417 rows)
SELECT id, tenant_id, name, image_url
FROM menu_items
WHERE image_url LIKE '%/dns9deszp/%'
ORDER BY tenant_id, name;

-- Menu item variation-type images (~50 rows)
SELECT id, tenant_id, name
FROM menu_items
WHERE variation_types::text LIKE '%/dns9deszp/%';

-- Tenant logos (~38 rows)
SELECT id, slug, name, logo_url
FROM tenants
WHERE logo_url LIKE '%/dns9deszp/%';

-- Tenant promotion banners (~13 rows)
SELECT id, slug, name
FROM tenants
WHERE promotion_banners::text LIKE '%/dns9deszp/%';

-- Payment method QR codes (~33 rows)
SELECT id, tenant_id, name, qr_code_url
FROM payment_methods
WHERE qr_code_url LIKE '%/dns9deszp/%';
