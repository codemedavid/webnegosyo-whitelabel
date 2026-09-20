/**
 * The "bytes OR link" shape every image-attach op accepts. Pure (no
 * server-only imports) so op schemas and tests can use it directly.
 */

export interface ImageSource {
  /** Image bytes as base64 (raw or a data: URI). */
  imageBase64?: string
  /** Public link to the image (Drive/Dropbox share links are rewritten). */
  sourceUrl?: string
  fileName?: string
}

export const EXACTLY_ONE_SOURCE = 'Provide exactly one of imageBase64 (bytes) or sourceUrl (a public link).'

export function hasImageSource(source: ImageSource | undefined): boolean {
  return !!(source?.imageBase64 || source?.sourceUrl)
}

/** Throws unless exactly one source is present. */
export function assertSingleImageSource(source: ImageSource): void {
  const hasBytes = typeof source.imageBase64 === 'string' && source.imageBase64.length > 0
  const hasUrl = typeof source.sourceUrl === 'string' && source.sourceUrl.length > 0
  if (hasBytes === hasUrl) throw new Error(EXACTLY_ONE_SOURCE)
}

/** Picks just the source fields out of a wider op payload. */
export function pickImageSource(input: ImageSource): ImageSource {
  const out: ImageSource = {}
  if (input.imageBase64) out.imageBase64 = input.imageBase64
  if (input.sourceUrl) out.sourceUrl = input.sourceUrl
  if (input.fileName) out.fileName = input.fileName
  return out
}
