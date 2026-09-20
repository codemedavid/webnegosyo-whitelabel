import 'server-only'

/**
 * One door for "here is an image, host it on our CDN": either raw bytes
 * (base64 / data URI) or a public link. Every tenant-facing image write (menu
 * item, bundle, hero, logo, banner) goes through here so the SSRF guard, size
 * cap and ImageKit folder layout are enforced in exactly one place.
 *
 * Upload is awaited before any caller touches a row: a failure here leaves
 * the database untouched.
 */

import { assertSingleImageSource, type ImageSource } from '@/lib/image-source'

export type { ImageSource }

export interface IngestedImage {
  url: string
  fileId: string
  filePath: string
}

export async function ingestImage(source: ImageSource, folder: string): Promise<IngestedImage> {
  assertSingleImageSource(source)

  // Lazy so the server-only upload modules never land in a client bundle that
  // transitively imports a service which imports this file.
  const { uploadBase64ToImageKit } = await import('@/lib/imagekit-server')

  if (source.sourceUrl) {
    const { fetchRemoteImageAsBase64 } = await import('@/lib/imagekit-remote')
    const remote = await fetchRemoteImageAsBase64(source.sourceUrl, source.fileName)
    return uploadBase64ToImageKit(remote.base64, { folder, fileName: remote.fileName })
  }

  return uploadBase64ToImageKit(source.imageBase64 as string, {
    folder,
    fileName: source.fileName || `image-${Date.now()}.png`,
  })
}
