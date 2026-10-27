import 'server-only'
import { randomInt } from 'node:crypto'

/**
 * Small JSON bodies for the app's write routes. Anything that is not JSON, is
 * larger than `maxBytes` or does not parse comes back as `null` — the route
 * answers one bad_request for all of them.
 */
const DEFAULT_MAX_BYTES = 4096

export async function readAppJson(request: Request, maxBytes = DEFAULT_MAX_BYTES): Promise<unknown | null> {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return null
  try {
    const text = await request.text()
    return new TextEncoder().encode(text).byteLength > maxBytes ? null : JSON.parse(text)
  } catch {
    return null
  }
}

/**
 * The same floor (350–450 ms) for every outcome of a sign-in call, so timing
 * does not tell a caller which branch it hit. Not constant-time under database
 * lock waits or outages.
 */
export async function paceFrom(start: number): Promise<void> {
  const delay = Math.max(0, 350 + randomInt(0, 101) - (performance.now() - start))
  if (delay) await new Promise<void>((resolve) => setTimeout(resolve, delay))
}
