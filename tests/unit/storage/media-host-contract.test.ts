import { describe, it, expect } from '@jest/globals'
import fs from 'fs'
import path from 'path'

/**
 * Images move from ImageKit to Cloudflare R2 (`media.webnegosyo.com`). Any
 * code that recognises an ImageKit delivery URL by its host — to resize it,
 * allow it, or render it — must recognise the media host too, or the first R2
 * image silently loses its thumbnail, its payment proof or its render.
 * Plan: docs/plans/2026-10-30-cloudflare-r2-storage-and-email.md (Phase 3).
 */

const ROOT = path.resolve(__dirname, '../../..')
const SCAN = ['src', 'webnegosyo-app/lib', 'webnegosyo-app/components', 'mobile/lib', 'next.config.ts']
const IMAGEKIT_HOST = 'ik.imagekit.io'
const MEDIA_MARKERS = ['media.webnegosyo.com', 'MEDIA_HOST', 'isR2MediaUrl', 'MEDIA_DELIVERY_HOST']
const SOURCE = /\.(ts|tsx|mjs|js)$/
const SKIP = /(\.test\.|__tests__|node_modules|\.generated\.)/

function sourceFiles(entry: string): string[] {
  const full = path.join(ROOT, entry)
  if (!fs.existsSync(full)) return []
  if (fs.statSync(full).isFile()) return [full]
  return fs.readdirSync(full, { withFileTypes: true }).flatMap((d) => {
    const child = path.join(entry, d.name)
    if (SKIP.test(child)) return []
    if (d.isDirectory()) return sourceFiles(child)
    return SOURCE.test(d.name) ? [path.join(ROOT, child)] : []
  })
}

describe('media host contract', () => {
  const files = SCAN.flatMap(sourceFiles).filter((f) => fs.readFileSync(f, 'utf8').includes(IMAGEKIT_HOST))

  it('finds the known ImageKit host checks (the scan is not empty)', () => {
    expect(files.length).toBeGreaterThanOrEqual(4)
  })

  it.each(files.map((f) => [path.relative(ROOT, f), f]))(
    '%s also recognises the R2 media host',
    (_rel, file) => {
      const text = fs.readFileSync(file, 'utf8')
      expect(MEDIA_MARKERS.some((marker) => text.includes(marker))).toBe(true)
    },
  )
})
