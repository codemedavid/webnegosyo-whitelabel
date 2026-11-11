/**
 * Cloudflare R2 configuration and the upload-provider switch.
 *
 * `STORAGE_UPLOAD_PROVIDER=r2` sends NEW uploads to R2; anything else (or a
 * missing R2 credential) keeps ImageKit. Flipping it back is instant and needs
 * no app release: readers understand both hosts.
 * Plan: docs/plans/2026-10-30-cloudflare-r2-storage-and-email.md (Phase 4).
 */

export interface R2Config {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
}

export type UploadProvider = 'imagekit' | 'r2'

type Env = Record<string, string | undefined>

const DEFAULT_BUCKET = 'webnegosyo-media'

function read(env: Env, name: string): string {
  return (env[name] ?? '').trim()
}

/** Null when any credential is missing. */
export function readR2Config(env: Env = process.env): R2Config | null {
  const accountId = read(env, 'R2_ACCOUNT_ID')
  const accessKeyId = read(env, 'R2_ACCESS_KEY_ID')
  const secretAccessKey = read(env, 'R2_SECRET_ACCESS_KEY')
  if (!accountId || !accessKeyId || !secretAccessKey) return null
  return { accountId, accessKeyId, secretAccessKey, bucket: read(env, 'R2_BUCKET') || DEFAULT_BUCKET }
}

export function getUploadProvider(env: Env = process.env): UploadProvider {
  const wanted = read(env, 'STORAGE_UPLOAD_PROVIDER').toLowerCase()
  return wanted === 'r2' && readR2Config(env) ? 'r2' : 'imagekit'
}
