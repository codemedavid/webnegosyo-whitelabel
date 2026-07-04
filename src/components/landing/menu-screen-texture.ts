import * as THREE from 'three'

const SCREEN_W = 640
const SCREEN_H = 1280
const CORNER_RADIUS = 56
const BRAND = '#ea580c'
const BRAND_DEEP = '#c2410c'
const CREAM = '#f6f1e7'
const CARD_WHITE = '#fffdf8'
const INK = '#292018'
const MUTED = '#8a7f70'

const SIDEBAR_CATEGORIES = [
  { emoji: '🍽️', label: 'All', isActive: true },
  { emoji: '🍔', label: 'Meals', isActive: false },
  { emoji: '🧋', label: 'Drinks', isActive: false },
  { emoji: '🍰', label: 'Dessert', isActive: false },
] as const

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function drawHeader(ctx: CanvasRenderingContext2D, logo: HTMLImageElement | null): void {
  const grad = ctx.createLinearGradient(0, 0, SCREEN_W, 0)
  grad.addColorStop(0, BRAND)
  grad.addColorStop(1, BRAND_DEEP)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, SCREEN_W, 148)

  // Logo chip
  ctx.save()
  ctx.beginPath()
  ctx.arc(74, 74, 40, 0, Math.PI * 2)
  ctx.fillStyle = '#faf7f2'
  ctx.fill()
  ctx.clip()
  if (logo) {
    // Glyph sits in the middle ~45% of the source image — zoom in on it
    ctx.drawImage(logo, 260, 140, 560, 700, 34, 24, 80, 100)
  } else {
    ctx.fillStyle = INK
    ctx.font = '900 40px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('W', 74, 89)
    ctx.textAlign = 'left'
  }
  ctx.restore()

  ctx.fillStyle = '#fff'
  ctx.font = '800 34px system-ui, sans-serif'
  ctx.fillText('Smart Menu', 134, 68)
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  ctx.font = '500 21px system-ui, sans-serif'
  ctx.fillText('Order na — tap lang', 134, 100)

  // Cart icon (simple bag) with badge
  const cx = SCREEN_W - 74
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 4.5
  roundedRect(ctx, cx - 24, 58, 48, 44, 10)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(cx, 58, 14, Math.PI, 0)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(cx + 24, 52, 13, 0, Math.PI * 2)
  ctx.fillStyle = '#22c55e'
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = '800 18px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('2', cx + 24, 59)
  ctx.textAlign = 'left'
}

function drawSidebar(ctx: CanvasRenderingContext2D): void {
  SIDEBAR_CATEGORIES.forEach((cat, i) => {
    const cy = 250 + i * 168
    if (cat.isActive) {
      roundedRect(ctx, 14, cy - 54, 122, 142, 26)
      ctx.fillStyle = 'rgba(234,88,12,0.1)'
      ctx.fill()
    }
    ctx.beginPath()
    ctx.arc(75, cy, 42, 0, Math.PI * 2)
    ctx.fillStyle = cat.isActive ? BRAND : CARD_WHITE
    ctx.fill()
    if (!cat.isActive) {
      ctx.strokeStyle = 'rgba(41,32,24,0.1)'
      ctx.lineWidth = 2
      ctx.stroke()
    }
    ctx.font = '38px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(cat.emoji, 75, cy + 14)
    ctx.fillStyle = cat.isActive ? BRAND : MUTED
    ctx.font = `${cat.isActive ? 800 : 600} 20px system-ui, sans-serif`
    ctx.fillText(cat.label, 75, cy + 74)
    ctx.textAlign = 'left'
  })
}

function drawSearchAndTitle(ctx: CanvasRenderingContext2D): void {
  roundedRect(ctx, 160, 178, 444, 62, 31)
  ctx.fillStyle = CARD_WHITE
  ctx.fill()
  ctx.strokeStyle = 'rgba(234,88,12,0.35)'
  ctx.lineWidth = 2.5
  ctx.stroke()
  ctx.strokeStyle = MUTED
  ctx.lineWidth = 3.5
  ctx.beginPath()
  ctx.arc(196, 207, 11, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(204, 216)
  ctx.lineTo(213, 225)
  ctx.stroke()
  ctx.fillStyle = MUTED
  ctx.font = '500 24px system-ui, sans-serif'
  ctx.fillText('Search menu…', 228, 218)

  ctx.fillStyle = INK
  ctx.font = '900 40px system-ui, sans-serif'
  ctx.fillText('Best Sellers', 168, 320)
  ctx.fillStyle = BRAND
  ctx.font = '600 24px system-ui, sans-serif'
  ctx.fillText('6 items', 168, 356)
}

function drawProductCard(
  ctx: CanvasRenderingContext2D,
  y: number,
  emoji: string,
  name: string,
  price: string,
  badge: string | null
): void {
  const x = 160
  const w = 444

  ctx.save()
  ctx.shadowColor = 'rgba(41,32,24,0.14)'
  ctx.shadowBlur = 24
  ctx.shadowOffsetY = 10
  roundedRect(ctx, x, y, w, 470, 36)
  ctx.fillStyle = CARD_WHITE
  ctx.fill()
  ctx.restore()

  // Photo area
  ctx.save()
  roundedRect(ctx, x + 14, y + 14, w - 28, 310, 26)
  ctx.clip()
  const photoGrad = ctx.createRadialGradient(
    x + w / 2, y + 150, 30,
    x + w / 2, y + 170, 260
  )
  photoGrad.addColorStop(0, '#ffe8d1')
  photoGrad.addColorStop(1, '#f7cba4')
  ctx.fillStyle = photoGrad
  ctx.fillRect(x + 14, y + 14, w - 28, 310)
  ctx.font = '150px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(emoji, x + w / 2, y + 220)
  ctx.textAlign = 'left'
  ctx.restore()

  if (badge) {
    roundedRect(ctx, x + 28, y + 30, 26 + badge.length * 13, 42, 21)
    ctx.fillStyle = BRAND
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = '800 20px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(badge, x + 28 + (26 + badge.length * 13) / 2, y + 58)
    ctx.textAlign = 'left'
  }

  // Floating "+" button
  ctx.save()
  ctx.shadowColor = 'rgba(234,88,12,0.4)'
  ctx.shadowBlur = 18
  ctx.beginPath()
  ctx.arc(x + w - 62, y + 296, 40, 0, Math.PI * 2)
  ctx.fillStyle = BRAND
  ctx.fill()
  ctx.restore()
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.moveTo(x + w - 62 - 15, y + 296)
  ctx.lineTo(x + w - 62 + 15, y + 296)
  ctx.moveTo(x + w - 62, y + 296 - 15)
  ctx.lineTo(x + w - 62, y + 296 + 15)
  ctx.stroke()

  ctx.fillStyle = INK
  ctx.font = '800 30px system-ui, sans-serif'
  ctx.fillText(name, x + 28, y + 388)
  ctx.fillStyle = BRAND
  ctx.font = '900 32px system-ui, sans-serif'
  ctx.fillText(price, x + 28, y + 436)
}

function drawUpsellBar(ctx: CanvasRenderingContext2D): void {
  const y = SCREEN_H - 128
  ctx.save()
  ctx.shadowColor = 'rgba(41,32,24,0.3)'
  ctx.shadowBlur = 28
  roundedRect(ctx, 20, y, SCREEN_W - 40, 104, 30)
  ctx.fillStyle = '#1d1610'
  ctx.fill()
  ctx.restore()
  ctx.strokeStyle = 'rgba(234,88,12,0.5)'
  ctx.lineWidth = 2.5
  roundedRect(ctx, 20, y, SCREEN_W - 40, 104, 30)
  ctx.stroke()

  ctx.font = '44px system-ui, sans-serif'
  ctx.fillText('🍟', 44, y + 68)
  ctx.fillStyle = '#fff'
  ctx.font = '800 26px system-ui, sans-serif'
  ctx.fillText('Make it a Meal?', 112, y + 44)
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.font = '500 21px system-ui, sans-serif'
  ctx.fillText('Add fries + drink for ₱59', 112, y + 76)

  roundedRect(ctx, SCREEN_W - 168, y + 24, 124, 56, 28)
  const grad = ctx.createLinearGradient(SCREEN_W - 168, 0, SCREEN_W - 44, 0)
  grad.addColorStop(0, BRAND)
  grad.addColorStop(1, BRAND_DEEP)
  ctx.fillStyle = grad
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = '800 24px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('Add', SCREEN_W - 106, y + 60)
  ctx.textAlign = 'left'
}

function drawScreen(ctx: CanvasRenderingContext2D, logo: HTMLImageElement | null): void {
  ctx.clearRect(0, 0, SCREEN_W, SCREEN_H)

  // Rounded screen silhouette — corners stay transparent on the 3D plane
  ctx.save()
  roundedRect(ctx, 0, 0, SCREEN_W, SCREEN_H, CORNER_RADIUS)
  ctx.clip()

  ctx.fillStyle = CREAM
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H)

  drawHeader(ctx, logo)
  drawSidebar(ctx)
  drawSearchAndTitle(ctx)
  drawProductCard(ctx, 384, '🍛', 'Chicken Adobo Bowl', '₱149.00', 'Best Seller')
  // Second card peeking from below to imply scroll
  drawProductCard(ctx, 894, '🍜', 'Creamy Carbonara', '₱159.00', null)

  drawUpsellBar(ctx)

  // Subtle glass reflection sweep
  const sheen = ctx.createLinearGradient(0, 0, SCREEN_W, SCREEN_H * 0.6)
  sheen.addColorStop(0, 'rgba(255,255,255,0.10)')
  sheen.addColorStop(0.35, 'rgba(255,255,255,0)')
  ctx.fillStyle = sheen
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H)
  ctx.restore()
}

/**
 * Draws the phone-screen "smart menu" UI (header + category sidebar + search +
 * product cards + upsell bar) to an offscreen canvas and returns it as a THREE
 * texture. The WebNegosyo logo is loaded async and painted in when ready.
 * Client-side only (requires `document`).
 */
export function createMenuScreenTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = SCREEN_W
  canvas.height = SCREEN_H
  const ctx = canvas.getContext('2d')

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8

  if (ctx) {
    drawScreen(ctx, null)
    const logo = new Image()
    logo.onload = () => {
      drawScreen(ctx, logo)
      texture.needsUpdate = true
    }
    logo.src = '/webnegosyo-logo.png'
  }

  return texture
}

/**
 * Circular food-chip texture (emoji on a cream disc) for the floating
 * accent sprites around the phone.
 */
export function createEmojiChipTexture(emoji: string): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')

  if (ctx) {
    ctx.clearRect(0, 0, size, size)
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size / 2 - 10, 0, Math.PI * 2)
    ctx.fillStyle = '#fdf9f0'
    ctx.fill()
    ctx.lineWidth = 8
    ctx.strokeStyle = 'rgba(234,88,12,0.45)'
    ctx.stroke()
    ctx.font = '120px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(emoji, size / 2, size / 2 + 8)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}
