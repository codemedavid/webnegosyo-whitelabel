/**
 * Mirrors Loyverse catalog images onto ImageKit so the menu never depends on
 * Loyverse's CDN (foreign hotlinks rot when a merchant leaves, and next/image
 * only tolerates them via a remotePatterns escape hatch).
 *
 * The decision is pure and deliberately one-way:
 * - no local image, or a local image that is itself a Loyverse hotlink → mirror;
 * - anything else (ImageKit, Cloudinary, merchant upload) → leave it alone.
 * Consequence: once mirrored, a photo changed in Loyverse does not propagate —
 * a merchant's hand-picked photo must never be clobbered by a sync, and we
 * cannot tell "our mirror of the old photo" apart from "their better photo".
 */

const LOYVERSE_IMAGE_HOST = 'api.loyverse.com'

export function isLoyverseImageUrl(url: string | null | undefined): boolean {
  if (!url) return false
  try {
    return new URL(url).hostname === LOYVERSE_IMAGE_HOST
  } catch {
    return false
  }
}

export function shouldMirrorLoyverseImage(
  existingImageUrl: string | null | undefined,
  loyverseImageUrl: string | null | undefined
): boolean {
  if (!loyverseImageUrl) return false
  if (!existingImageUrl) return true
  return isLoyverseImageUrl(existingImageUrl)
}

/**
 * Fetches the Loyverse image and re-hosts it on ImageKit. Returns the ImageKit
 * URL, or null on any failure — the caller falls back to the hotlink, which
 * next.config's remotePatterns keeps renderable.
 */
export async function mirrorLoyverseImage(
  tenantId: string,
  loyverseImageUrl: string
): Promise<string | null> {
  try {
    // Lazy imports keep the server-only modules out of client bundles.
    const { fetchRemoteImageAsBase64 } = await import('@/lib/imagekit-remote')
    const { uploadBase64ToImageKit } = await import('@/lib/imagekit-server')

    const remote = await fetchRemoteImageAsBase64(loyverseImageUrl)
    const { url } = await uploadBase64ToImageKit(remote.base64, {
      folder: `menu-items/${tenantId}`,
      fileName: remote.fileName,
    })
    return url
  } catch {
    return null
  }
}
