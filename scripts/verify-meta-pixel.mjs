#!/usr/bin/env node

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function countMetaPixelInitOccurrences(html, pixelId) {
  if (!html || !pixelId) return 0

  const escapedPixelId = escapeRegExp(pixelId)
  const pattern = new RegExp(
    `fbq\\s*\\(\\s*['"]init['"]\\s*,\\s*['"]${escapedPixelId}['"]\\s*\\)`,
    'g'
  )

  return html.match(pattern)?.length ?? 0
}

async function main() {
  const url = process.argv[2]
  const pixelId = process.argv[3] || process.env.NEXT_PUBLIC_META_PIXEL_ID

  if (!url) {
    console.error('Usage: node scripts/verify-meta-pixel.mjs <url> [pixelId]')
    process.exit(1)
  }

  if (!pixelId) {
    console.error('Missing pixel id. Pass it as the second argument or set NEXT_PUBLIC_META_PIXEL_ID.')
    process.exit(1)
  }

  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      'user-agent': 'webnegosyo-meta-pixel-check/1.0',
      accept: 'text/html,application/xhtml+xml',
    },
  })

  if (!response.ok) {
    console.error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
    process.exit(1)
  }

  const html = await response.text()
  const occurrences = countMetaPixelInitOccurrences(html, pixelId)

  console.log(`URL: ${response.url}`)
  console.log(`Pixel ID: ${pixelId}`)
  console.log(`Meta Pixel init occurrences: ${occurrences}`)

  if (occurrences !== 1) {
    console.error(`Expected exactly 1 Meta Pixel init for ${pixelId}, found ${occurrences}.`)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
