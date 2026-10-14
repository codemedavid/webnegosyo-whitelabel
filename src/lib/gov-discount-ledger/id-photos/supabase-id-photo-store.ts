/**
 * The ID photos' database and bucket side — service role only.
 *
 * Every method is scoped to the tenant the ROUTE verified. Reads FOR a
 * reviewer never come through here: they go through the caller's own session
 * so RLS decides (see the link route).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { idPhotoModeOf } from '@/lib/gov-discount'
import type { IdPhotoStore } from './upload-service'
import type { IdPhotoPurgeStore } from './purge-service'
import { ID_PHOTO_BUCKET } from './rules'

type Db = SupabaseClient<Database>

const PHOTO_CONFLICT_KEY = 'tenant_id,backend,external_order_id,claimant_ref'

function fail(context: string, message: string): never {
  throw new Error(`[gov-discount-id-photos] ${context}: ${message}`)
}

export function createSupabaseIdPhotoStore(db: Db): IdPhotoStore & IdPhotoPurgeStore {
  return {
    async loadPhotoMode(tenantId) {
      const { data, error } = await db
        .from('store_tax_profiles')
        .select('id_photo_mode')
        .eq('tenant_id', tenantId)
        .maybeSingle()
      if (error) fail('photo mode', error.message)
      return idPhotoModeOf(data?.id_photo_mode)
    },

    async findGrant(tenantId, backend, externalOrderId, claimantRef) {
      const { data, error } = await db
        .from('gov_discount_claims')
        .select('outlet_id')
        .eq('tenant_id', tenantId)
        .eq('backend', backend)
        .eq('external_order_id', externalOrderId)
        .eq('claimant_ref', claimantRef)
        .eq('event', 'granted')
        .order('revision', { ascending: false })
        .limit(1)
      if (error) fail('grant', error.message)
      const row = data?.[0]
      return row ? { outletId: row.outlet_id } : null
    },

    async findPhotoPath(tenantId, backend, externalOrderId, claimantRef) {
      const { data, error } = await db
        .from('gov_discount_id_photos')
        .select('object_path')
        .eq('tenant_id', tenantId)
        .eq('backend', backend)
        .eq('external_order_id', externalOrderId)
        .eq('claimant_ref', claimantRef)
        .maybeSingle()
      if (error) fail('existing photo', error.message)
      return data?.object_path ?? null
    },

    async putObject(path, bytes, contentType) {
      const { error } = await db.storage
        .from(ID_PHOTO_BUCKET)
        .upload(path, bytes, { contentType, upsert: false, cacheControl: 'no-store' })
      if (error) fail('upload', error.message)
    },

    async savePhoto(row) {
      const { data, error } = await db
        .from('gov_discount_id_photos')
        .upsert(
          // expires_at is required by the type but always overwritten by the
          // trigger (captured_at + 90 days); the client never decides it.
          { ...row, expires_at: row.captured_at },
          { onConflict: PHOTO_CONFLICT_KEY },
        )
        .select('id')
      if (error) fail('save', error.message)
      if (!data || data.length === 0) fail('save', 'no row written')
    },

    async removeObjects(paths) {
      if (paths.length === 0) return
      const { error } = await db.storage.from(ID_PHOTO_BUCKET).remove([...paths])
      if (error) fail('remove', error.message)
    },

    async listExpired(nowIso, limit) {
      const { data, error } = await db
        .from('gov_discount_id_photos')
        .select('id, object_path')
        .lte('expires_at', nowIso)
        .order('expires_at', { ascending: true })
        .limit(limit)
      if (error) fail('expired', error.message)
      return (data ?? []).map((row) => ({ id: row.id, objectPath: row.object_path }))
    },

    async deleteRows(ids) {
      if (ids.length === 0) return
      const { error } = await db.from('gov_discount_id_photos').delete().in('id', [...ids])
      if (error) fail('delete', error.message)
    },
  }
}
