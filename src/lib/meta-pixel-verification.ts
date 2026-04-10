function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function countMetaPixelInitOccurrences(html: string, pixelId: string) {
  if (!html || !pixelId) return 0

  const escapedPixelId = escapeRegExp(pixelId)
  const pattern = new RegExp(
    `fbq\\s*\\(\\s*['"]init['"]\\s*,\\s*['"]${escapedPixelId}['"]\\s*\\)`,
    'g'
  )

  return html.match(pattern)?.length ?? 0
}

export function verifyMetaPixelHtml(html: string, pixelId: string) {
  const occurrences = countMetaPixelInitOccurrences(html, pixelId)

  return {
    occurrences,
    ok: occurrences === 1,
  }
}
