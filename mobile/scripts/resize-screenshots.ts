/**
 * Resize raw simulator screenshots to App Store required sizes.
 *
 * Usage: npx tsx scripts/resize-screenshots.ts
 *
 * Takes raw screenshots from assets/screenshots/iphone/raw_*.png
 * and resizes them to the required App Store dimensions.
 *
 * iPhone sizes:
 *   - 1242×2688 (6.5" - iPhone Xs Max, 11 Pro Max)
 *   - 1284×2778 (6.7" - iPhone 12/13/14/15 Pro Max)
 *
 * iPad sizes:
 *   - 2048×2732 (12.9" iPad Pro 3rd gen)
 *   - 2064×2752 (12.9" iPad Pro 6th gen / M2+)
 */

import sharp from 'sharp'
import fs from 'fs'
import path from 'path'

const SCREENSHOTS_DIR = path.join(__dirname, '..', 'assets', 'screenshots')

interface OutputSize {
  name: string
  width: number
  height: number
  folder: string
}

const IPHONE_SIZES: OutputSize[] = [
  { name: '6.5inch', width: 1242, height: 2688, folder: 'iphone' },
  { name: '6.7inch', width: 1284, height: 2778, folder: 'iphone' },
]

const IPAD_SIZES: OutputSize[] = [
  { name: '12.9inch-3rd', width: 2048, height: 2732, folder: 'ipad' },
  { name: '12.9inch-6th', width: 2064, height: 2752, folder: 'ipad' },
]

async function resizeScreenshot(inputPath: string, outputSize: OutputSize, outputDir: string) {
  const basename = path.basename(inputPath, '.png').replace('raw_', '')
  const outputPath = path.join(outputDir, `${basename}_${outputSize.name}.png`)

  const metadata = await sharp(inputPath).metadata()
  const srcWidth = metadata.width!
  const srcHeight = metadata.height!
  const srcAspect = srcWidth / srcHeight
  const targetAspect = outputSize.width / outputSize.height

  let resized: sharp.Sharp

  if (Math.abs(srcAspect - targetAspect) < 0.05) {
    // Similar aspect ratio — just resize
    resized = sharp(inputPath).resize(outputSize.width, outputSize.height, { fit: 'cover' })
  } else {
    // Different aspect ratio (e.g. iPhone screenshot → iPad)
    // Resize to fit within target, then pad with background color
    resized = sharp(inputPath).resize(outputSize.width, outputSize.height, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
  }

  await resized.png({ quality: 100 }).toFile(outputPath)
  return outputPath
}

async function main() {
  const iphoneRawDir = path.join(SCREENSHOTS_DIR, 'iphone')
  const iphoneOutDir = path.join(SCREENSHOTS_DIR, 'iphone', 'final')
  const ipadOutDir = path.join(SCREENSHOTS_DIR, 'ipad', 'final')

  fs.mkdirSync(iphoneOutDir, { recursive: true })
  fs.mkdirSync(ipadOutDir, { recursive: true })

  // Find all raw screenshots
  const rawFiles = fs.readdirSync(iphoneRawDir)
    .filter(f => f.startsWith('raw_') && f.endsWith('.png'))
    .sort()

  if (rawFiles.length === 0) {
    console.error('No raw screenshots found in assets/screenshots/iphone/raw_*.png')
    console.error('Take screenshots first by running the app in the simulator.')
    process.exit(1)
  }

  console.log(`Found ${rawFiles.length} raw screenshots\n`)

  let total = 0
  for (const rawFile of rawFiles) {
    const inputPath = path.join(iphoneRawDir, rawFile)

    // Generate iPhone sizes
    for (const size of IPHONE_SIZES) {
      const outPath = await resizeScreenshot(inputPath, size, iphoneOutDir)
      console.log(`  ✓ ${path.basename(outPath)} (${size.width}×${size.height})`)
      total++
    }

    // Generate iPad sizes (from iPhone screenshot with padding)
    for (const size of IPAD_SIZES) {
      const outPath = await resizeScreenshot(inputPath, size, ipadOutDir)
      console.log(`  ✓ ${path.basename(outPath)} (${size.width}×${size.height})`)
      total++
    }
  }

  console.log(`\n✅ Generated ${total} resized screenshots`)
  console.log(`   iPhone: ${iphoneOutDir}`)
  console.log(`   iPad:   ${ipadOutDir}`)
}

main().catch(err => {
  console.error('Failed:', err)
  process.exit(1)
})
