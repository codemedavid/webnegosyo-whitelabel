/**
 * Browser-only helpers that turn QR artwork into files and paper.
 *
 * Kept apart from the pure modules: everything here touches the DOM, canvas,
 * fetch or downloads.
 */

import { zipSync } from 'fflate'
import type { QrArtwork } from '@/lib/qr-print/qr-artwork'

/** Width the logo is fetched at — crisp in the 2× PNG and on paper. */
const LOGO_FETCH_WIDTH = 640
const LOGO_FETCH_QUALITY = 90
/** PNGs are exported at twice the artwork's size: ~1600 × 2200 px per card. */
export const PNG_SCALE = 2
const PRINT_FRAME_CLEANUP_MS = 60_000
/** A print sheet that has not loaded by now never will; give the buttons back. */
export const PRINT_FRAME_LOAD_TIMEOUT_MS = 15_000

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the logo'))
    reader.readAsDataURL(blob)
  })
}

async function fetchImageDataUrl(url: string, init?: RequestInit): Promise<string | null> {
  const response = await fetch(url, init)
  if (!response.ok) return null
  const blob = await response.blob()
  if (!blob.type.startsWith('image/')) return null
  return blobToDataUrl(blob)
}

/**
 * The store logo as a `data:` URL, which an SVG drawn through <img> or onto a
 * canvas can show. Goes through the app's own image optimizer first (same
 * origin, so no CORS question), then the logo's host directly. Null when
 * neither works — the artwork then shows the store's initials.
 */
export async function loadLogoDataUrl(logoUrl: string | null): Promise<string | null> {
  if (!logoUrl) return null
  const optimized = `/_next/image?url=${encodeURIComponent(logoUrl)}&w=${LOGO_FETCH_WIDTH}&q=${LOGO_FETCH_QUALITY}`
  for (const attempt of [() => fetchImageDataUrl(optimized), () => fetchImageDataUrl(logoUrl, { mode: 'cors' })]) {
    try {
      const dataUrl = await attempt()
      if (dataUrl) return dataUrl
    } catch (error) {
      console.warn('[qr-codes] logo fetch attempt failed', error)
    }
  }
  return null
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not draw the QR code'))
    image.src = src
  })
}

export async function artworkToPngBlob(artwork: QrArtwork, scale: number = PNG_SCALE): Promise<Blob> {
  const svgUrl = URL.createObjectURL(new Blob([artwork.svg], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const image = await loadImage(svgUrl)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(artwork.width * scale)
    canvas.height = Math.round(artwork.height * scale)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('This browser cannot export images')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not export the image'))), 'image/png')
    )
  } finally {
    URL.revokeObjectURL(svgUrl)
  }
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Let the download start before the URL goes away.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function downloadSvg(artwork: QrArtwork, fileName: string): void {
  downloadBlob(new Blob([artwork.svg], { type: 'image/svg+xml;charset=utf-8' }), `${fileName}.svg`)
}

export async function downloadPng(artwork: QrArtwork, fileName: string): Promise<void> {
  downloadBlob(await artworkToPngBlob(artwork), `${fileName}.png`)
}

export interface ZipEntry {
  fileName: string
  artwork: QrArtwork
}

/** Every code as a PNG in one ZIP. Names are made unique so nothing overwrites. */
export async function downloadPngZip(entries: ZipEntry[], zipName: string): Promise<void> {
  const files: Record<string, [Uint8Array, { level: 0 }]> = {}
  for (const entry of entries) {
    const blob = await artworkToPngBlob(entry.artwork)
    let name = `${entry.fileName}.png`
    for (let n = 2; name in files; n += 1) name = `${entry.fileName}-${n}.png`
    // PNG is already compressed; storing it is as small and much faster.
    files[name] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }]
  }
  const zipped = zipSync(files)
  downloadBlob(new Blob([zipped as BlobPart], { type: 'application/zip' }), `${zipName}.zip`)
}

/** Print a sheet from a hidden iframe, so only the codes reach the paper. */
export function printSheet(html: string, loadTimeoutMs: number = PRINT_FRAME_LOAD_TIMEOUT_MS): Promise<void> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe')
    frame.setAttribute('aria-hidden', 'true')
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'

    // The caller disables its export buttons until this settles, so it must
    // settle even when the frame never loads or errors.
    const loadTimer = setTimeout(() => {
      frame.remove()
      reject(new Error('The print sheet did not load. Please try again.'))
    }, loadTimeoutMs)

    frame.onerror = () => {
      clearTimeout(loadTimer)
      frame.remove()
      reject(new Error('Could not open the print sheet'))
    }
    frame.onload = async () => {
      clearTimeout(loadTimer)
      const win = frame.contentWindow
      if (!win) {
        frame.remove()
        reject(new Error('Could not open the print sheet'))
        return
      }
      try {
        await Promise.all(Array.from(win.document.images, (image) => image.decode().catch(() => undefined)))
        win.focus()
        win.print()
        resolve()
      } catch (error) {
        reject(error instanceof Error ? error : new Error('Could not print'))
      } finally {
        // print() blocks in most browsers but not all; leave time for the dialog.
        setTimeout(() => frame.remove(), PRINT_FRAME_CLEANUP_MS)
      }
    }
    frame.srcdoc = html
    document.body.appendChild(frame)
  })
}
