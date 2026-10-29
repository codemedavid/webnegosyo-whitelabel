/**
 * Object keys and content types for uploads into Cloudflare R2.
 *
 * Every key is `<folder>/<name>-<unique id>.<ext>`: unique like ImageKit's
 * `useUniqueFileName`, and uploads are written with `If-None-Match: *`, so an
 * existing object (a tenant logo, a payment QR) can never be replaced.
 * Active content (SVG, HTML, scripts) is never accepted — it would be served
 * from our own domain. Pure: no I/O.
 */

import { detectImageMime, sanitizeUploadFileName } from '@/lib/imagekit-signature'

const MB = 1024 * 1024

/** Accepted upload types → the extension their keys end with. */
const EXTENSION_BY_TYPE: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/heic': 'heic',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/csv': 'csv',
  'text/plain': 'txt',
  'application/zip': 'zip',
}

const TYPE_ALIASES: Readonly<Record<string, string>> = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'application/x-zip-compressed': 'application/zip',
}

/** Extension → type, for server uploads whose bytes don't say what they are. */
const TYPE_BY_EXTENSION: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(EXTENSION_BY_TYPE).map(([type, ext]) => [ext, type]),
)

const MAX_VIDEO_BYTES = 100 * MB
const MAX_FILE_BYTES = 25 * MB
const MAX_BASE_NAME_LENGTH = 60

/** The canonical accepted type for `raw`, or null when it is refused. */
export function normalizeUploadContentType(raw: string): string | null {
  const type = (typeof raw === 'string' ? raw : '').split(';')[0].trim().toLowerCase()
  const canonical = TYPE_ALIASES[type] ?? type
  return Object.prototype.hasOwnProperty.call(EXTENSION_BY_TYPE, canonical) ? canonical : null
}

/** Largest upload accepted for an (already normalised) type. */
export function maxUploadBytesFor(contentType: string): number {
  return contentType.startsWith('video/') ? MAX_VIDEO_BYTES : MAX_FILE_BYTES
}

interface ObjectKeyInput {
  /** Already sanitised by `sanitizeUploadFolder`. */
  folder: string
  fileName: string
  /** Already normalised by `normalizeUploadContentType` (or sniffed). */
  contentType: string
  /** Unique per upload (random). */
  id: string
}

export function buildObjectKey({ folder, fileName, contentType, id }: ObjectKeyInput): string {
  const safe = sanitizeUploadFileName(fileName).replace(/\.[A-Za-z0-9]{1,5}$/, '')
  const base = (safe.replace(/[.]+/g, '_') || 'upload').slice(0, MAX_BASE_NAME_LENGTH)
  const ext = EXTENSION_BY_TYPE[contentType] ?? 'bin'
  return `${folder}/${base}-${id}.${ext}`
}

/** The accepted type for a file name's extension, or null (some browsers send no type). */
export function contentTypeForFileName(fileName: string): string | null {
  const ext = /\.([A-Za-z0-9]{1,5})$/.exec(fileName ?? '')?.[1]?.toLowerCase()
  return (ext && TYPE_BY_EXTENSION[ext]) || null
}

/**
 * The type a server-side upload is stored with: the bytes' own signature,
 * else an accepted extension, else `application/octet-stream` (never rendered
 * as active content).
 */
export function contentTypeForBytes(bytes: Uint8Array, fileName: string): string {
  const sniffed = detectImageMime(bytes)
  if (sniffed) return sniffed
  return contentTypeForFileName(fileName) ?? 'application/octet-stream'
}

/** Marks an R2 object wherever a file id is stored (`r2:<key>`). */
export const R2_FILE_ID_PREFIX = 'r2:'

/** The key behind an `r2:` file id, or null for any other id (or a traversal). */
export function r2KeyFromFileId(fileId: string): string | null {
  if (typeof fileId !== 'string' || !fileId.startsWith(R2_FILE_ID_PREFIX)) return null
  const key = fileId.slice(R2_FILE_ID_PREFIX.length)
  return key && !key.includes('..') && !key.startsWith('/') ? key : null
}
