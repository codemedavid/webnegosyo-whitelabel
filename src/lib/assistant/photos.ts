/**
 * Menu photos attached to an owner's message.
 *
 * They live for ONE turn: the photo tool reads them, and only a marker part
 * (`data-photos`, a count) is stored with the message. The bytes never reach
 * the database or the chat model — the menu parser (a vision model) reads
 * them and the chat model works from its structured result.
 */

import { isAllowedImageDataUrl } from '@/lib/ai-menu-parser-request'
import { MAX_PHOTO_DATA_URL_CHARS, MAX_PHOTOS_PER_MESSAGE, MAX_PHOTOS_TOTAL_CHARS } from '@/lib/assistant/limits'
import type { StoredPart } from '@/lib/assistant/history'

export type PhotoCheck = { ok: true; photos: string[] } | { ok: false; error: string }

export function checkMessagePhotos(raw: unknown): PhotoCheck {
  if (raw === undefined || raw === null) return { ok: true, photos: [] }
  if (!Array.isArray(raw)) return { ok: false, error: 'Those photos could not be read.' }
  if (raw.length > MAX_PHOTOS_PER_MESSAGE) return { ok: false, error: `Send at most ${MAX_PHOTOS_PER_MESSAGE} photos at a time.` }
  let total = 0
  for (const photo of raw) {
    if (typeof photo !== 'string') return { ok: false, error: 'Those photos could not be read.' }
    total += photo.length
    if (photo.length > MAX_PHOTO_DATA_URL_CHARS || total > MAX_PHOTOS_TOTAL_CHARS) {
      return { ok: false, error: 'That photo is too large. Try a smaller one, or fewer at a time.' }
    }
    if (!isAllowedImageDataUrl(photo)) return { ok: false, error: 'Photos must be JPEG, PNG or WebP.' }
  }
  return { ok: true, photos: raw as string[] }
}

/** What is stored in place of the photos: how many there were. */
export function photoMarkerPart(count: number): StoredPart {
  return { type: 'data-photos', data: { count } }
}
