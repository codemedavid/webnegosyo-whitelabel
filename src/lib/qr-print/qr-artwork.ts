/**
 * The printable artwork for one QR code, as a standalone SVG document.
 *
 * One drawing serves every output: the on-screen preview (as an <img>), the
 * SVG download, the PNG export (drawn onto a canvas) and the print sheet. An
 * SVG shown through <img> runs no script and loads nothing external, which is
 * why the logo must arrive as a `data:image/...` URL and every piece of
 * merchant text is escaped here.
 *
 * Two designs:
 * - `card`: a table tent — store name on the brand colour, the table or
 *   branch, the code with the logo in its middle, and a call to action.
 * - `plain`: just the code (with its logo), for merchants dropping it into
 *   their own poster.
 */

import { buildQrMatrix, logoHoleSize, type QrMatrix } from '@/lib/qr-print/qr-matrix'

export type QrDesign = 'card' | 'plain'

export interface QrArtworkInput {
  url: string
  design: QrDesign
  storeName: string
  /** "Table 12", a branch name, or null for the store's own code. */
  title: string | null
  /** The branch under a table's title. */
  subtitle: string | null
  caption: string
  accentColor: string
  /** The store logo as `data:image/...`; null draws the initials instead. */
  logoDataUrl: string | null
}

export interface QrArtwork {
  svg: string
  width: number
  height: number
}

const DEFAULT_ACCENT = '#111827'
const INK = '#111827'
const MUTED = '#6b7280'
const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif"

const CARD_WIDTH = 800
const CARD_HEIGHT = 1100
const CARD_RADIUS = 36
const CARD_PADDING_X = 56
const HEADER_HEIGHT = 150
const CARD_QR_SIZE = 560
const BOTTOM_PADDING = 40

/** Units per module for the plain design, and the spec's 4-module quiet zone. */
const PLAIN_MODULE = 10
const QUIET_ZONE = 4

/** Rough average glyph width, in em, of a bold sans-serif. */
const GLYPH_WIDTH_EM = 0.58

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i
const DATA_IMAGE_URL = /^data:image\/(?:png|jpe?g|webp|gif|svg\+xml);base64,[a-z0-9+/=]+$/i

export function safeAccentColor(raw: string | null | undefined): string {
  return typeof raw === 'string' && HEX_COLOR.test(raw.trim()) ? raw.trim().toLowerCase() : DEFAULT_ACCENT
}

export function storeInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((word) => word !== '')
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('')
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean
}

/** Readable text on top of `hex`: white on dark brand colours, ink on light ones. */
function textOn(hex: string): string {
  const full = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex
  const [r, g, b] = [1, 3, 5].map((i) => {
    const channel = parseInt(full.slice(i, i + 2), 16) / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance > 0.45 ? INK : '#ffffff'
}

interface TextSpec {
  text: string
  x: number
  y: number
  maxSize: number
  minSize: number
  maxWidth: number
  weight: number
  fill: string
}

/** One centred line that shrinks to fit, and squeezes only past its minimum size. */
function textLine(spec: TextSpec): string {
  const fitted = Math.floor(spec.maxWidth / Math.max(1, spec.text.length * GLYPH_WIDTH_EM))
  const size = Math.max(spec.minSize, Math.min(spec.maxSize, fitted))
  const estimated = spec.text.length * GLYPH_WIDTH_EM * size
  const squeeze = estimated > spec.maxWidth ? ` textLength="${spec.maxWidth}" lengthAdjust="spacingAndGlyphs"` : ''
  return (
    `<text x="${spec.x}" y="${spec.y}" text-anchor="middle" dominant-baseline="middle" font-family="${FONT}" ` +
    `font-size="${size}" font-weight="${spec.weight}" fill="${spec.fill}"${squeeze}>${escapeXml(spec.text)}</text>`
  )
}

interface CodeSpec {
  matrix: QrMatrix
  /** Top-left of the code, in artwork units. */
  x: number
  y: number
  /** Artwork units per module. */
  module: number
  logoDataUrl: string | null
  initials: string
  accent: string
}

/** The modules as one path of horizontal runs, with the centre left open for the logo. */
function codePath(matrix: QrMatrix, hole: number): string {
  const holeStart = (matrix.size - hole) / 2
  const holeEnd = holeStart + hole
  const inHole = (row: number, col: number) =>
    hole > 0 && row >= holeStart && row < holeEnd && col >= holeStart && col < holeEnd

  const runs: string[] = []
  for (let row = 0; row < matrix.size; row += 1) {
    let col = 0
    while (col < matrix.size) {
      if (!matrix.dark[row][col] || inHole(row, col)) {
        col += 1
        continue
      }
      const start = col
      while (col < matrix.size && matrix.dark[row][col] && !inHole(row, col)) col += 1
      runs.push(`M${start} ${row}h${col - start}v1h${start - col}z`)
    }
  }
  return runs.join('')
}

function codeMarkup(spec: CodeSpec): string {
  const { matrix, x, y, module: moduleSize } = spec
  const hole = logoHoleSize(matrix.size)
  const modules =
    `<g transform="translate(${x} ${y}) scale(${moduleSize})" shape-rendering="crispEdges">` +
    `<path fill="${INK}" d="${codePath(matrix, hole)}"/></g>`

  const holeSize = hole * moduleSize
  const holeX = x + ((matrix.size - hole) / 2) * moduleSize
  const holeY = y + ((matrix.size - hole) / 2) * moduleSize
  const inset = moduleSize * 0.6
  const radius = holeSize * 0.2
  const inner = holeSize - inset * 2

  const logo = spec.logoDataUrl
    ? `<clipPath id="logo-clip"><rect x="${holeX + inset}" y="${holeY + inset}" width="${inner}" height="${inner}" rx="${radius * 0.7}"/></clipPath>` +
      `<image href="${escapeXml(spec.logoDataUrl)}" x="${holeX + inset}" y="${holeY + inset}" width="${inner}" height="${inner}" ` +
      `preserveAspectRatio="xMidYMid meet" clip-path="url(#logo-clip)"/>`
    : `<rect x="${holeX + inset}" y="${holeY + inset}" width="${inner}" height="${inner}" rx="${radius * 0.7}" fill="${spec.accent}"/>` +
      textLine({
        text: spec.initials,
        x: holeX + holeSize / 2,
        y: holeY + holeSize / 2 + inner * 0.04,
        maxSize: Math.round(inner * 0.46),
        minSize: 8,
        maxWidth: inner * 0.8,
        weight: 800,
        fill: textOn(spec.accent),
      })

  return `${modules}<rect x="${holeX}" y="${holeY}" width="${holeSize}" height="${holeSize}" rx="${radius}" fill="#ffffff"/>${logo}`
}

function svgDocument(width: number, height: number, body: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `${body}</svg>`
  )
}

function renderPlain(input: QrArtworkInput, matrix: QrMatrix, logo: string | null, accent: string): QrArtwork {
  const size = (matrix.size + QUIET_ZONE * 2) * PLAIN_MODULE
  const code = codeMarkup({
    matrix,
    x: QUIET_ZONE * PLAIN_MODULE,
    y: QUIET_ZONE * PLAIN_MODULE,
    module: PLAIN_MODULE,
    logoDataUrl: logo,
    initials: storeInitials(input.storeName),
    accent,
  })
  return { svg: svgDocument(size, size, `<rect width="${size}" height="${size}" fill="#ffffff"/>${code}`), width: size, height: size }
}

/** The link as people read it under the code: no protocol, never wider than the card. */
function displayUrl(url: string): string {
  return truncate(url.replace(/^https?:\/\//, ''), 60)
}

function renderCard(input: QrArtworkInput, matrix: QrMatrix, logo: string | null, accent: string): QrArtwork {
  const centre = CARD_WIDTH / 2
  const textWidth = CARD_WIDTH - CARD_PADDING_X * 2
  const title = input.title ? truncate(input.title, 26) : ''
  const subtitle = input.subtitle ? truncate(input.subtitle, 40) : ''

  const titleHeight = title ? 100 : 0
  const subtitleHeight = subtitle ? 56 : 0
  const blockHeight = titleHeight + subtitleHeight + 30 + CARD_QR_SIZE + 64 + 40 + 20 + 28
  const available = CARD_HEIGHT - HEADER_HEIGHT - BOTTOM_PADDING
  let cursor = HEADER_HEIGHT + Math.max(0, (available - blockHeight) / 2)

  const parts: string[] = [
    `<clipPath id="card-clip"><rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" rx="${CARD_RADIUS}"/></clipPath>`,
    `<g clip-path="url(#card-clip)">`,
    `<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="#ffffff"/>`,
    `<rect width="${CARD_WIDTH}" height="${HEADER_HEIGHT}" fill="${accent}"/>`,
    textLine({
      text: truncate(input.storeName, 34),
      x: centre,
      y: HEADER_HEIGHT / 2 + 2,
      maxSize: 56,
      minSize: 28,
      maxWidth: textWidth,
      weight: 800,
      fill: textOn(accent),
    }),
  ]

  if (title) {
    parts.push(textLine({ text: title, x: centre, y: cursor + 56, maxSize: 84, minSize: 40, maxWidth: textWidth, weight: 800, fill: INK }))
    cursor += titleHeight
  }
  if (subtitle) {
    parts.push(textLine({ text: subtitle, x: centre, y: cursor + 22, maxSize: 36, minSize: 24, maxWidth: textWidth, weight: 600, fill: MUTED }))
    cursor += subtitleHeight
  }
  cursor += 30

  const moduleSize = CARD_QR_SIZE / matrix.size
  parts.push(
    codeMarkup({
      matrix,
      x: (CARD_WIDTH - CARD_QR_SIZE) / 2,
      y: cursor,
      module: moduleSize,
      logoDataUrl: logo,
      initials: storeInitials(input.storeName),
      accent,
    })
  )
  cursor += CARD_QR_SIZE + 64

  parts.push(
    textLine({ text: truncate(input.caption, 44), x: centre, y: cursor, maxSize: 36, minSize: 24, maxWidth: textWidth, weight: 700, fill: INK }),
    textLine({ text: displayUrl(input.url), x: centre, y: cursor + 46, maxSize: 22, minSize: 14, maxWidth: textWidth, weight: 500, fill: MUTED }),
    `</g>`,
    `<rect x="2" y="2" width="${CARD_WIDTH - 4}" height="${CARD_HEIGHT - 4}" rx="${CARD_RADIUS - 2}" fill="none" stroke="#e5e7eb" stroke-width="4"/>`
  )

  return { svg: svgDocument(CARD_WIDTH, CARD_HEIGHT, parts.join('')), width: CARD_WIDTH, height: CARD_HEIGHT }
}

/** Null when the link cannot fit a QR code at all. */
export function renderQrArtwork(input: QrArtworkInput): QrArtwork | null {
  const logo = input.logoDataUrl && DATA_IMAGE_URL.test(input.logoDataUrl) ? input.logoDataUrl : null
  // The hole is cut whether or not a logo loaded (initials fill it), so the
  // code always carries level H and looks the same either way.
  const matrix = buildQrMatrix(input.url, { hasLogo: true })
  if (!matrix) return null
  const accent = safeAccentColor(input.accentColor)
  return input.design === 'plain' ? renderPlain(input, matrix, logo, accent) : renderCard(input, matrix, logo, accent)
}
