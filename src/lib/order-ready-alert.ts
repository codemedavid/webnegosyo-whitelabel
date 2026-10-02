import type { OrderTypeKind } from '@/lib/order-types/order-type-kinds'

/**
 * When the customer's tracking page should audibly ring.
 *
 * Exactly on the transition into `ready` — never on first load (the customer
 * may open the page when the order is already ready; ringing then would be
 * noise, not news) and never again once rung.
 */
export function shouldRingForTransition(
  previousStatus: string | null,
  nextStatus: string,
): boolean {
  return previousStatus !== null && previousStatus !== 'ready' && nextStatus === 'ready'
}

export interface ReadyTone {
  frequencyHz: number
  startS: number
  durationS: number
}

const TRILL_HIGH_HZ = 1760
const TRILL_LOW_HZ = 1320
const TRILL_STEP_S = 0.08
const TRILL_STEPS = 10
const TRILL_GAP_S = 0.35

/** One telephone-style trill: alternating high/low beeps, back to back. */
function trill(offsetS: number): ReadyTone[] {
  return Array.from({ length: TRILL_STEPS }, (_, step) => ({
    frequencyHz: step % 2 === 0 ? TRILL_HIGH_HZ : TRILL_LOW_HZ,
    startS: offsetS + step * TRILL_STEP_S,
    durationS: TRILL_STEP_S,
  }))
}

const TRILL_LENGTH_S = TRILL_STEPS * TRILL_STEP_S

/**
 * One ring burst: two trills, like a phone. 1–2 kHz is where phone speakers
 * are loudest and a busy room is quietest.
 */
export const READY_RING_TONES: readonly ReadyTone[] = [
  ...trill(0),
  ...trill(TRILL_LENGTH_S + TRILL_GAP_S),
]

/** Played on the opt-in tap: proves the sound works without a full ring. */
export const READY_PREVIEW_TONES: readonly ReadyTone[] = READY_RING_TONES.slice(0, 4)

/** Long buzzes — a short tap is easy to miss in a pocket or on a table. */
export const READY_VIBRATION_PATTERN: readonly number[] = [900, 200, 900, 200, 900]

export const PREVIEW_VIBRATION_MS = 200

/** A ring burst and a vibration pattern start every this often. */
export const READY_RING_REPEAT_MS = 4000

/** Stop ringing after this, acknowledged or not — a forgotten phone stays quiet. */
export const READY_RING_MAX_MS = 2 * 60_000

export interface ReadyNotice {
  title: string
  body: string
}

/** Text for the system notification and the in-page banner. */
export function buildReadyNotice(input: {
  shortId: string
  storeName: string
  kind: OrderTypeKind | null | undefined
}): ReadyNotice {
  const subject = `Order #${input.shortId} from ${input.storeName}`
  const body =
    input.kind === 'pickup'
      ? `${subject} is ready for pickup.`
      : input.kind === 'delivery'
        ? `${subject} is ready and will be on its way soon.`
        : `${subject} is ready.`
  return { title: 'Your order is ready!', body }
}
