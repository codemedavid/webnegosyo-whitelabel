/**
 * Phone menu photos are often 5–12 MB; the upload limit is 4 MB. Re-encode
 * large photos as JPEG, big enough for the AI to read small print. Returns the
 * original file when it is already small, or when the browser cannot decode
 * it — the server then decides.
 */

const TARGET_BYTES = 3_500_000
const MAX_DIMENSION = 2400
const JPEG_QUALITY = 0.85

export async function shrinkPhoto(file: File): Promise<File> {
  if (file.size <= TARGET_BYTES) return file
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file

  let bitmap: ImageBitmap | null = null
  const canvas = document.createElement('canvas')
  try {
    bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const context = canvas.getContext('2d')
    if (!context) return file
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], `${(file.name || 'menu').replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg' })
  } catch {
    return file
  } finally {
    // A full-size decoded photo is tens of MB; release it on every path (iOS
    // Safari caps total canvas memory and fails the next upload otherwise).
    bitmap?.close()
    canvas.width = 0
    canvas.height = 0
  }
}
