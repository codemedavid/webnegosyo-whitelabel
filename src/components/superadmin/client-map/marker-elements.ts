/**
 * DOM builders for Client Map markers. mapbox-gl owns marker elements outside
 * React, so these are plain DOM. Client data only ever lands via `textContent`,
 * `img.src` and validated hex colours — never innerHTML.
 *
 * mapbox-gl positions the ROOT element with `transform`, so hover/selected
 * scaling lives on an inner node. Every marker sits exactly on its coordinate;
 * size follows the `--pin` CSS variable set on the map container.
 */

import type { ClientPin } from '@/lib/superadmin/client-map/locate'
import { initialsOf } from '@/lib/superadmin/client-map/display'
import { transformImageUrl } from '@/lib/imagekit-utils'

const MARKER_LOGO_PX = 96
const MAX_CLUSTER_LOGOS = 3
/** Driven by `--pin` on the map container (set per zoom level). */
const PIN_SIZE = 'var(--pin, 44px)'

type LogoSource = Pick<ClientPin, 'name' | 'logoUrl' | 'color'>

export function logoThumbUrl(url: string | null, size: number): string | null {
  return transformImageUrl(url, { width: size, height: size, crop: 'fill', quality: 'auto' })
}

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag)
  element.className = className
  return element
}

function initialsNode(source: LogoSource): HTMLElement {
  const fallback = node('span', 'flex h-full w-full items-center justify-center text-[10px] font-semibold text-white')
  fallback.textContent = initialsOf(source.name)
  fallback.style.background = `linear-gradient(135deg, color-mix(in srgb, ${source.color} 70%, #000), #111)`
  return fallback
}

function logoNode(source: LogoSource, className: string): HTMLElement {
  const frame = node('span', `block overflow-hidden rounded-full bg-neutral-950 ${className}`)
  const src = logoThumbUrl(source.logoUrl, MARKER_LOGO_PX)
  if (!src) {
    frame.appendChild(initialsNode(source))
    return frame
  }

  const img = node('img', 'h-full w-full object-cover')
  img.src = src
  img.alt = ''
  img.decoding = 'async'
  img.draggable = false
  img.referrerPolicy = 'no-referrer'
  img.addEventListener('error', () => img.replaceWith(initialsNode(source)), { once: true })
  frame.appendChild(img)
  return frame
}

export function createClientMarkerElement(pin: ClientPin, isNew: boolean): HTMLButtonElement {
  const root = node('button', 'group block cursor-pointer outline-none hover:z-20 focus-visible:z-20')
  // Inline, not an arbitrary Tailwind class: this file builds DOM outside JSX, and a
  // missed class leaves the marker at the logo's natural (96px) size.
  root.style.width = PIN_SIZE
  root.style.height = PIN_SIZE
  root.type = 'button'
  root.setAttribute('aria-label', `${pin.name}${isNew ? ' (new client)' : ''}`)
  root.dataset.selected = 'false'

  const body = node('span', 'relative block h-full w-full animate-in fade-in zoom-in-50 duration-500')

  if (isNew) {
    const pulse = node('span', 'pointer-events-none absolute inset-0 animate-ping rounded-full opacity-60')
    pulse.style.background = `color-mix(in srgb, ${pin.color} 55%, transparent)`
    body.appendChild(pulse)
  }

  const approximate = pin.source === 'address'
  const ring = node(
    'span',
    [
      'relative block h-full w-full rounded-full p-[2px] transition-transform duration-300 ease-out',
      'group-hover:scale-[1.3] group-focus-visible:scale-[1.3] group-data-[selected=true]:scale-[1.45]',
      approximate ? 'outline-dashed outline-1 outline-offset-2 outline-white/35' : '',
    ].join(' '),
  )
  ring.style.background = `linear-gradient(140deg, ${pin.color}, rgba(255,255,255,0.92))`
  ring.style.boxShadow = `0 0 0 2px rgba(0,0,0,0.85), 0 6px 22px color-mix(in srgb, ${pin.color} 55%, transparent)`
  ring.appendChild(logoNode(pin, 'h-full w-full ring-2 ring-black'))
  body.appendChild(ring)

  const label = node(
    'span',
    [
      'pointer-events-none absolute left-1/2 top-full z-10 mt-2.5 -translate-x-1/2 whitespace-nowrap rounded-full',
      'border border-white/15 bg-black/85 px-3 py-1 text-[11px] font-medium text-white shadow-lg backdrop-blur-md',
      'opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100',
      'group-data-[selected=true]:opacity-100',
    ].join(' '),
  )
  label.textContent = pin.name
  body.appendChild(label)

  root.appendChild(body)
  return root
}

export function setMarkerSelected(element: HTMLElement, isSelected: boolean): void {
  element.dataset.selected = String(isSelected)
  // Mapbox stacks markers by DOM order; lift the selected one above its neighbours.
  element.style.zIndex = isSelected ? '30' : ''
}

/** Overlapping stores, drawn at their true centre: up to three logos plus a count. */
export function createClusterMarkerElement(count: number): HTMLButtonElement {
  const root = node('button', 'group block cursor-pointer outline-none hover:z-20')
  root.type = 'button'
  root.setAttribute('aria-label', `${count} clients here — zoom in`)

  const pill = node(
    'span',
    [
      'flex items-center gap-1.5 rounded-full border border-white/20 bg-black/80 py-[3px] pl-[3px] pr-3',
      'shadow-[0_0_0_4px_rgba(255,255,255,0.05),0_10px_36px_rgba(0,0,0,0.6)] backdrop-blur-md',
      'animate-in fade-in zoom-in-75 duration-300 transition-transform ease-out',
      'group-hover:scale-110 group-focus-visible:scale-110',
    ].join(' '),
  )
  const stack = node('span', 'flex -space-x-2')
  stack.dataset.role = 'logos'
  stack.appendChild(node('span', 'block h-7 w-7 rounded-full bg-white/10 ring-2 ring-black'))

  const countLabel = node('span', 'text-[13px] font-semibold tabular-nums text-white')
  countLabel.textContent = String(count)

  pill.append(stack, countLabel)
  root.appendChild(pill)
  return root
}

/** Swaps the cluster's placeholder for up to three of its members' logos. */
export function fillClusterLogos(element: HTMLElement, members: LogoSource[]): void {
  const stack = element.querySelector<HTMLElement>('[data-role="logos"]')
  if (!stack || members.length === 0) return
  stack.replaceChildren(
    ...members.slice(0, MAX_CLUSTER_LOGOS).map((member) => logoNode(member, 'h-7 w-7 ring-2 ring-black')),
  )
}
