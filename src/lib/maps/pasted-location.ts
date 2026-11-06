/**
 * A place someone pasted instead of typed: coordinates, or a map link copied
 * from Messenger. Filipinos share Google Maps links all the time, and a link
 * holds the exact spot no search would find.
 *
 * Only reads what the customer gave us. Nothing here calls a map service; short
 * links need one redirect lookup, done by POST /api/maps/resolve-link.
 */

export interface PastedPoint {
  lat: number
  lng: number
}

export type PastedLocation =
  | { kind: 'point'; point: PastedPoint }
  /** A link naming a place, not a spot: search for these words. */
  | { kind: 'query'; query: string }
  /** A short link: only the server can find out where it goes. */
  | { kind: 'short-link'; url: string }

const COORDINATES = /^\s*\(?\s*(-?\d{1,2}\.\d+)\s*[,\s]\s*(-?\d{1,3}\.\d+)\s*\)?\s*$/
const AT_POINT = /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/
const DATA_POINT = /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/
const PARAM_POINT = /^\s*(?:loc:)?(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*$/
const POINT_PARAMS = ['q', 'query', 'll', 'center', 'destination', 'daddr', 'coordinate', 'sll']
const QUERY_PARAMS = ['q', 'query', 'destination', 'daddr', 'address']
const PLACE_PATH = /\/maps\/(?:place|search|dir(?:\/[^/]*)?)\/([^/@]+)/
const MAX_QUERY_LENGTH = 200

const SHORT_LINK_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl'])

function point(lat: string, lng: string): PastedPoint | null {
  const parsedLat = Number(lat)
  const parsedLng = Number(lng)
  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) return null
  if (Math.abs(parsedLat) > 90 || Math.abs(parsedLng) > 180) return null
  if (parsedLat === 0 && parsedLng === 0) return null
  return { lat: parsedLat, lng: parsedLng }
}

function matchPoint(text: string, pattern: RegExp): PastedPoint | null {
  const match = text.match(pattern)
  return match ? point(match[1], match[2]) : null
}

function toUrl(text: string): URL | null {
  const trimmed = text.trim()
  if (!/^https?:\/\//i.test(trimmed) && !/^(?:www\.|maps\.|goo\.gl|google\.)/i.test(trimmed)) return null
  try {
    return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }
}

/** Google's sites by country (`google.com`, `google.com.ph`), and nothing that merely starts with the word. */
function isGoogleHost(hostname: string): boolean {
  return /^(?:www\.|maps\.)?google(?:\.[a-z]{2,3}){1,2}$/i.test(hostname)
}

function isMapUrl(url: URL): boolean {
  const host = url.hostname.toLowerCase()
  if (host === 'maps.apple.com') return true
  if (!isGoogleHost(host)) return false
  return host.startsWith('maps.') || url.pathname.startsWith('/maps')
}

function decodeWords(value: string): string {
  try {
    return decodeURIComponent(value).replace(/\+/g, ' ').trim()
  } catch {
    return value.replace(/\+/g, ' ').trim()
  }
}

/** The spot or place a full map link names, or null when it names neither. */
export function locationFromMapUrl(url: URL): PastedLocation | null {
  if (!isMapUrl(url)) return null
  const whole = `${url.pathname}${url.search}`

  // `!3d…!4d…` is the place itself; `@…` is only where the map was looking.
  const dataPoint = matchPoint(whole, DATA_POINT)
  if (dataPoint) return { kind: 'point', point: dataPoint }
  for (const name of POINT_PARAMS) {
    const value = url.searchParams.get(name)
    const found = value ? matchPoint(value, PARAM_POINT) : null
    if (found) return { kind: 'point', point: found }
  }
  const atPoint = matchPoint(whole, AT_POINT)
  if (atPoint) return { kind: 'point', point: atPoint }

  for (const name of QUERY_PARAMS) {
    const value = url.searchParams.get(name)?.trim()
    if (value) return { kind: 'query', query: value.slice(0, MAX_QUERY_LENGTH) }
  }
  const placeWords = url.pathname.match(PLACE_PATH)?.[1]
  return placeWords ? { kind: 'query', query: decodeWords(placeWords).slice(0, MAX_QUERY_LENGTH) } : null
}

/** A short map link we may look up, or null. Google's other short links (`goo.gl/abc`) are not maps. */
export function shortMapLink(url: URL): string | null {
  const host = url.hostname.toLowerCase()
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (!SHORT_LINK_HOSTS.has(host)) return null
  if (host === 'goo.gl' && !url.pathname.startsWith('/maps')) return null
  return `https://${host}${url.pathname}${url.search}`
}

/** What a pasted line holds, or null when it is just someone typing an address. */
export function parsePastedLocation(text: string): PastedLocation | null {
  const coordinates = matchPoint(text, COORDINATES)
  if (coordinates) return { kind: 'point', point: coordinates }

  const url = toUrl(text)
  if (!url) return null
  const short = shortMapLink(url)
  if (short) return { kind: 'short-link', url: short }
  return locationFromMapUrl(url)
}
