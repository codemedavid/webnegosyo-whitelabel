/**
 * Generate App Store screenshots for Walsikopi.
 *
 * Usage: npx tsx scripts/generate-screenshots.ts
 *
 * Generates marketing-style screenshots for:
 *   - iPhone 6.5" (1242×2688) and iPhone 6.7" (1284×2778) — portrait
 *   - iPad 12.9" 3rd gen (2048×2732) and 6th gen (2064×2752) — portrait
 *
 * Output: assets/screenshots/iphone/ and assets/screenshots/ipad/
 */

import sharp from 'sharp'
import fs from 'fs'
import path from 'path'

// ─── Brand colors ───────────────────────────────────────────
const BRAND = {
  black: '#111111',
  white: '#ffffff',
  gray: '#6b7280',
  lightGray: '#f3f4f6',
  accent: '#f59e0b',
  success: '#10b981',
}

// ─── Screenshot definitions ─────────────────────────────────
interface ScreenDef {
  filename: string
  headline: string
  subtext: string
  icon: string // SVG icon path data or emoji placeholder
  bgGradientFrom: string
  bgGradientTo: string
  accentColor: string
}

const SCREENS: ScreenDef[] = [
  {
    filename: '01-welcome',
    headline: 'Welcome to Walsikopi',
    subtext: 'Choose how you\'d like to order',
    icon: 'coffee',
    bgGradientFrom: '#111111',
    bgGradientTo: '#2d2d2d',
    accentColor: '#f59e0b',
  },
  {
    filename: '02-menu',
    headline: 'Browse Our Full Menu',
    subtext: 'Search, explore categories, and find your favorites',
    icon: 'menu',
    bgGradientFrom: '#1a1a2e',
    bgGradientTo: '#16213e',
    accentColor: '#e94560',
  },
  {
    filename: '03-customize',
    headline: 'Customize Your Order',
    subtext: 'Pick sizes, flavors, add-ons, and special instructions',
    icon: 'customize',
    bgGradientFrom: '#0f3460',
    bgGradientTo: '#16213e',
    accentColor: '#e94560',
  },
  {
    filename: '04-cart',
    headline: 'Review Your Cart',
    subtext: 'Adjust quantities and check your total before ordering',
    icon: 'cart',
    bgGradientFrom: '#111111',
    bgGradientTo: '#333333',
    accentColor: '#10b981',
  },
  {
    filename: '05-checkout',
    headline: 'Quick & Easy Checkout',
    subtext: 'Fill in your details and select payment',
    icon: 'checkout',
    bgGradientFrom: '#1a1a2e',
    bgGradientTo: '#0f3460',
    accentColor: '#f59e0b',
  },
  {
    filename: '06-messenger',
    headline: 'Order Sent to Messenger',
    subtext: 'Confirm directly with our team for a personal touch',
    icon: 'messenger',
    bgGradientFrom: '#111111',
    bgGradientTo: '#2d2d2d',
    accentColor: '#0084ff',
  },
]

// ─── Size presets ───────────────────────────────────────────
interface SizePreset {
  name: string
  width: number
  height: number
  folder: string
  headlineFontSize: number
  subtextFontSize: number
  iconSize: number
  padding: number
}

const IPHONE_SIZES: SizePreset[] = [
  { name: '6.5inch', width: 1242, height: 2688, folder: 'iphone', headlineFontSize: 72, subtextFontSize: 36, iconSize: 200, padding: 80 },
  { name: '6.7inch', width: 1284, height: 2778, folder: 'iphone', headlineFontSize: 74, subtextFontSize: 37, iconSize: 210, padding: 84 },
]

const IPAD_SIZES: SizePreset[] = [
  { name: '12.9inch-3rd', width: 2048, height: 2732, folder: 'ipad', headlineFontSize: 96, subtextFontSize: 48, iconSize: 280, padding: 120 },
  { name: '12.9inch-6th', width: 2064, height: 2752, folder: 'ipad', headlineFontSize: 98, subtextFontSize: 49, iconSize: 284, padding: 122 },
]

const ALL_SIZES = [...IPHONE_SIZES, ...IPAD_SIZES]

// ─── SVG icon paths ─────────────────────────────────────────
function getIconSvg(icon: string, size: number, color: string): string {
  const s = size
  const half = s / 2
  const icons: Record<string, string> = {
    coffee: `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M18 8h1a4 4 0 010 8h-1M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8zM6 1v3M10 1v3M14 1v3" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
    menu: `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 6h16M4 12h16M4 18h16" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>
      <circle cx="8" cy="6" r="1" fill="${color}"/>
      <circle cx="8" cy="12" r="1" fill="${color}"/>
      <circle cx="8" cy="18" r="1" fill="${color}"/>
    </svg>`,
    customize: `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>`,
    cart: `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="9" cy="21" r="1" fill="${color}"/>
      <circle cx="20" cy="21" r="1" fill="${color}"/>
    </svg>`,
    checkout: `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="4" width="22" height="16" rx="2" stroke="${color}" stroke-width="1.5"/>
      <line x1="1" y1="10" x2="23" y2="10" stroke="${color}" stroke-width="1.5"/>
      <path d="M4 15h4M12 15h2" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`,
    messenger: `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2C6.477 2 2 6.145 2 11.243c0 2.907 1.42 5.498 3.645 7.193V22l3.405-1.868c.907.252 1.87.388 2.95.388 5.523 0 10-4.145 10-9.243S17.523 2 12 2z" stroke="${color}" stroke-width="1.5"/>
      <path d="M7 13l3.5-4 2 2.5L17 8" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
  }
  return icons[icon] || icons.coffee
}

// ─── Wrap text into lines ───────────────────────────────────
function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    if ((current + ' ' + word).trim().length > maxCharsPerLine) {
      lines.push(current.trim())
      current = word
    } else {
      current = current ? current + ' ' + word : word
    }
  }
  if (current.trim()) lines.push(current.trim())
  return lines
}

// ─── Escape XML special chars ───────────────────────────────
function esc(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

// ─── Generate a single screenshot ───────────────────────────
async function generateScreenshot(screen: ScreenDef, size: SizePreset, outputDir: string) {
  const { width, height, headlineFontSize, subtextFontSize, iconSize, padding } = size

  // Determine text wrap based on available width
  const maxHeadlineChars = Math.floor((width - padding * 2) / (headlineFontSize * 0.55))
  const maxSubtextChars = Math.floor((width - padding * 2) / (subtextFontSize * 0.5))

  const headlineLines = wrapText(screen.headline, maxHeadlineChars)
  const subtextLines = wrapText(screen.subtext, maxSubtextChars)

  // Layout calculations
  const iconY = height * 0.28
  const headlineStartY = iconY + iconSize + height * 0.06
  const headlineLineHeight = headlineFontSize * 1.3
  const subtextStartY = headlineStartY + headlineLines.length * headlineLineHeight + height * 0.03
  const subtextLineHeight = subtextFontSize * 1.5

  // Decorative circles
  const circle1X = width * 0.85
  const circle1Y = height * 0.12
  const circle1R = width * 0.25
  const circle2X = width * 0.15
  const circle2Y = height * 0.75
  const circle2R = width * 0.2
  const circle3X = width * 0.7
  const circle3Y = height * 0.88
  const circle3R = width * 0.12

  // Bottom bar (app-like navigation hint)
  const barY = height - height * 0.08
  const barHeight = 4
  const barWidth = width * 0.35

  // Icon SVG
  const iconSvg = getIconSvg(screen.icon, 24, screen.accentColor)

  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${screen.bgGradientFrom}"/>
        <stop offset="100%" stop-color="${screen.bgGradientTo}"/>
      </linearGradient>
      <linearGradient id="accent-grad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${screen.accentColor}" stop-opacity="0.15"/>
        <stop offset="100%" stop-color="${screen.accentColor}" stop-opacity="0.05"/>
      </linearGradient>
    </defs>

    <!-- Background gradient -->
    <rect width="${width}" height="${height}" fill="url(#bg)"/>

    <!-- Decorative circles -->
    <circle cx="${circle1X}" cy="${circle1Y}" r="${circle1R}" fill="${screen.accentColor}" opacity="0.06"/>
    <circle cx="${circle2X}" cy="${circle2Y}" r="${circle2R}" fill="${screen.accentColor}" opacity="0.04"/>
    <circle cx="${circle3X}" cy="${circle3Y}" r="${circle3R}" fill="white" opacity="0.03"/>

    <!-- Icon circle background -->
    <circle cx="${width / 2}" cy="${iconY}" r="${iconSize * 0.65}" fill="url(#accent-grad)" stroke="${screen.accentColor}" stroke-width="2" stroke-opacity="0.3"/>

    <!-- Icon (scaled) -->
    <g transform="translate(${width / 2 - iconSize / 2}, ${iconY - iconSize / 2}) scale(${iconSize / 24})">
      ${iconSvg.replace(/<\/?svg[^>]*>/g, '')}
    </g>

    <!-- Headline -->
    ${headlineLines.map((line, i) => `
    <text x="${width / 2}" y="${headlineStartY + i * headlineLineHeight}" font-family="system-ui, -apple-system, Helvetica, Arial, sans-serif" font-size="${headlineFontSize}" font-weight="800" fill="white" text-anchor="middle" letter-spacing="0.5">${esc(line)}</text>
    `).join('')}

    <!-- Subtext -->
    ${subtextLines.map((line, i) => `
    <text x="${width / 2}" y="${subtextStartY + i * subtextLineHeight}" font-family="system-ui, -apple-system, Helvetica, Arial, sans-serif" font-size="${subtextFontSize}" font-weight="400" fill="white" fill-opacity="0.7" text-anchor="middle">${esc(line)}</text>
    `).join('')}

    <!-- Walsikopi branding at bottom -->
    <text x="${width / 2}" y="${height - height * 0.04}" font-family="system-ui, -apple-system, Helvetica, Arial, sans-serif" font-size="${subtextFontSize * 0.8}" font-weight="600" fill="white" fill-opacity="0.35" text-anchor="middle" letter-spacing="3">WALSIKOPI</text>

    <!-- Bottom home indicator bar -->
    <rect x="${(width - barWidth) / 2}" y="${barY}" width="${barWidth}" height="${barHeight}" rx="${barHeight / 2}" fill="white" fill-opacity="0.2"/>
  </svg>`

  const outputPath = path.join(outputDir, `${screen.filename}_${size.name}.png`)
  await sharp(Buffer.from(svg)).png({ quality: 100 }).toFile(outputPath)
  return outputPath
}

// ─── Main ───────────────────────────────────────────────────
async function main() {
  const baseDir = path.join(__dirname, '..', 'assets', 'screenshots')
  const iphoneDir = path.join(baseDir, 'iphone')
  const ipadDir = path.join(baseDir, 'ipad')

  fs.mkdirSync(iphoneDir, { recursive: true })
  fs.mkdirSync(ipadDir, { recursive: true })

  console.log('Generating App Store screenshots for Walsikopi...\n')

  let total = 0
  for (const screen of SCREENS) {
    for (const size of ALL_SIZES) {
      const outputDir = size.folder === 'iphone' ? iphoneDir : ipadDir
      const filePath = await generateScreenshot(screen, size, outputDir)
      console.log(`  ✓ ${path.basename(filePath)} (${size.width}×${size.height})`)
      total++
    }
  }

  console.log(`\n✅ Generated ${total} screenshots`)
  console.log(`   iPhone: ${iphoneDir}`)
  console.log(`   iPad:   ${ipadDir}`)
  console.log('\nSizes generated:')
  for (const s of ALL_SIZES) {
    console.log(`  - ${s.folder} ${s.name}: ${s.width}×${s.height}px`)
  }
}

main().catch(err => {
  console.error('Failed to generate screenshots:', err)
  process.exit(1)
})
