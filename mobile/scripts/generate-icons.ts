/**
 * Generate app icons and splash screen assets from a tenant's logo.
 *
 * Usage: npx tsx scripts/generate-icons.ts <tenant-slug>
 *
 * Requires: sharp (devDependency)
 * Downloads the tenant logo, then generates:
 *   - icon.png (1024x1024) — iOS App Store icon
 *   - adaptive-icon.png (1024x1024) — Android adaptive icon foreground
 *   - favicon.png (48x48) — web favicon
 *   - notification-icon.png (96x96) — push notification icon
 *
 * All files are written to: assets/generated/<slug>/
 */

import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import https from 'https'
import http from 'http'

async function downloadImage(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    client.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        // Follow redirect
        downloadImage(res.headers.location!).then(resolve).catch(reject)
        return
      }
      const chunks: Buffer[] = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    }).on('error', reject)
  })
}

async function generateIcons(slug: string, logoUrl: string, primaryColor: string) {
  const outputDir = path.join(__dirname, '..', 'assets', 'generated', slug)
  fs.mkdirSync(outputDir, { recursive: true })

  console.log(`Downloading logo from ${logoUrl}...`)
  const logoBuffer = await downloadImage(logoUrl)

  // Get logo dimensions
  const metadata = await sharp(logoBuffer).metadata()
  console.log(`Logo: ${metadata.width}x${metadata.height}`)

  // Generate iOS icon (1024x1024) — logo centered on white background
  console.log('Generating icon.png (1024x1024)...')
  const logoResized = await sharp(logoBuffer)
    .resize(680, 680, { fit: 'inside', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toBuffer()

  await sharp({
    create: { width: 1024, height: 1024, channels: 4, background: '#ffffff' },
  })
    .composite([{ input: logoResized, gravity: 'centre' }])
    .png()
    .toFile(path.join(outputDir, 'icon.png'))

  // Generate Android adaptive icon foreground (1024x1024) — logo on transparent
  console.log('Generating adaptive-icon.png (1024x1024)...')
  const logoAdaptive = await sharp(logoBuffer)
    .resize(512, 512, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()

  await sharp({
    create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: logoAdaptive, gravity: 'centre' }])
    .png()
    .toFile(path.join(outputDir, 'adaptive-icon.png'))

  // Generate splash screen (1284x2778) — logo centered on primary color
  console.log('Generating splash.png (1284x2778)...')
  const logoSplash = await sharp(logoBuffer)
    .resize(400, 400, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()

  await sharp({
    create: { width: 1284, height: 2778, channels: 4, background: primaryColor },
  })
    .composite([{ input: logoSplash, gravity: 'centre' }])
    .png()
    .toFile(path.join(outputDir, 'splash.png'))

  // Generate favicon (48x48)
  console.log('Generating favicon.png (48x48)...')
  await sharp(logoBuffer)
    .resize(48, 48, { fit: 'inside', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toFile(path.join(outputDir, 'favicon.png'))

  // Generate notification icon (96x96 white silhouette on transparent)
  console.log('Generating notification-icon.png (96x96)...')
  await sharp(logoBuffer)
    .resize(96, 96, { fit: 'inside' })
    .grayscale()
    .threshold(128)
    .negate()
    .png()
    .toFile(path.join(outputDir, 'notification-icon.png'))

  console.log(`All icons generated in ${outputDir}`)
}

// CLI entry
const slug = process.argv[2]
const logoUrl = process.argv[3]
const primaryColor = process.argv[4] || '#111111'

if (!slug || !logoUrl) {
  console.error('Usage: npx tsx scripts/generate-icons.ts <slug> <logo-url> [primary-color]')
  process.exit(1)
}

generateIcons(slug, logoUrl, primaryColor).catch(err => {
  console.error('Error generating icons:', err)
  process.exit(1)
})

export { generateIcons }
