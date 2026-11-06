/**
 * Turns a pasted line into a place, asking the server only for short links.
 * Browser side of `pasted-location.ts`.
 */

import { parsePastedLocation, type PastedLocation } from './pasted-location'

export type PastedResult =
  | { kind: 'point'; point: { lat: number; lng: number } }
  | { kind: 'query'; query: string }
  /** It was a map link, and we could not tell where it goes. */
  | { kind: 'unreadable' }

export const UNREADABLE_LINK_MESSAGE = 'We could not read that link. Please search for your address or pick it on the map.'

function isFinished(location: PastedLocation | null | undefined): location is Exclude<PastedLocation, { kind: 'short-link' }> {
  return location?.kind === 'point' || location?.kind === 'query'
}

/** Null when the text is just someone typing an address. Never rejects. */
export async function readPastedLocation(text: string): Promise<PastedResult | null> {
  const pasted = parsePastedLocation(text)
  if (!pasted) return null
  if (pasted.kind !== 'short-link') return pasted

  try {
    const response = await fetch('/api/maps/resolve-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: pasted.url }),
    })
    const body = (await response.json().catch(() => null)) as { location?: PastedLocation | null } | null
    return isFinished(body?.location) ? body.location : { kind: 'unreadable' }
  } catch (error) {
    console.error('[maps] could not read a pasted link:', error)
    return { kind: 'unreadable' }
  }
}
