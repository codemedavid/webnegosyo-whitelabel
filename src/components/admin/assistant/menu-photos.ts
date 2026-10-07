/**
 * Menu photos for the Owl, prepared in the browser: shrunk to
 * PHOTO_MAX_EDGE_PX and re-encoded as JPEG, so a 12MP phone shot travels as a
 * few hundred KB and the request stays under the host's body cap.
 */

import { MAX_PHOTO_DATA_URL_CHARS, PHOTO_MAX_EDGE_PX } from '@/lib/assistant/limits'

const JPEG_QUALITY = 0.82

/** The size to draw at: the longest side capped, the aspect kept, never enlarged. */
export function fitWithin(width: number, height: number, maxEdge = PHOTO_MAX_EDGE_PX): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height, 1))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

export class PhotoError extends Error {}

export async function prepareMenuPhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new PhotoError('That file is not a photo.')
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new PhotoError('That photo could not be opened. Try a JPEG or PNG.')
  }
  const size = fitWithin(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const context = canvas.getContext('2d')
  if (!context) throw new PhotoError('That photo could not be prepared.')
  context.drawImage(bitmap, 0, 0, size.width, size.height)
  bitmap.close()
  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
  if (dataUrl.length > MAX_PHOTO_DATA_URL_CHARS) throw new PhotoError('That photo is too large.')
  return dataUrl
}
