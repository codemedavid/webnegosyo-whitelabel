/**
 * The ID-photo setting's words, from the shared engine so the web and the
 * app make the same promise. Every word of it is enforced: the bucket is
 * private, only `discount_review` holders can read a photo's row (and so get
 * a 60-second link), and a daily job deletes photos 90 days after they were
 * taken (`supabase/migrations/20261014160000_gov_discount_id_photos.sql`).
 */
export { ID_PHOTO_PRIVACY_NOTE, ID_PHOTO_RETENTION_DAYS } from "../gov-discount";
