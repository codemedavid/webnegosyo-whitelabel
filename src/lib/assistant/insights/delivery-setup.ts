/**
 * Is this store ready to book Lalamove riders? A step-by-step checklist, pure.
 *
 * What it may say about the keys is a YES/NO only — the keys themselves never
 * leave the server, and Owl never takes them in chat (they go in Settings →
 * Delivery). Switching Lalamove on is the platform's call (a privileged
 * column); Owl can only say who to ask.
 */

import { isE164Phone, normalizeLalamovePhone } from '@/lib/lalamove-phone'
import { lalamoveStatusTone } from '@/lib/lalamove-status'

export interface DeliverySetupInput {
  lalamoveEnabled: boolean
  market: string | null
  isSandbox: boolean
  /** null = could not be checked: never told to paste keys they may already have saved. */
  hasKeys: boolean | null
  senderPhone: string | null
  footerPhone: string | null
  storePinned: boolean
  branches: { total: number; pinned: number }
  deliveryOrderTypeOn: boolean
  /** Lalamove statuses of the last 7 days' booked orders; null = could not read. */
  recentStatuses: readonly (string | null)[] | null
}

export type StepState = 'done' | 'todo' | 'blocked'

export interface SetupStep {
  id: 'switched_on' | 'keys' | 'rider_phone' | 'pickup_pin' | 'delivery_on'
  label: string
  state: StepState
  /** What to do next, in a sentence; null when done. */
  next: string | null
}

export interface DeliverySetup {
  steps: SetupStep[]
  ready: boolean
  environment: 'live' | 'sandbox' | null
  bookings: { total: number; done: number; active: number; cancelled: number } | null
}

const SETTINGS = 'Settings → Delivery'

export function evaluateDeliverySetup(input: DeliverySetupInput): DeliverySetup {
  const blocked = !input.lalamoveEnabled
  const phone = normalizeLalamovePhone(input.senderPhone || input.footerPhone, input.market)
  const phoneOk = isE164Phone(phone)
  const pinOk = input.storePinned && (input.branches.total === 0 || input.branches.pinned === input.branches.total)

  const step = (id: SetupStep['id'], label: string, ok: boolean, next: string): SetupStep => ({
    id,
    label,
    state: ok ? 'done' : blocked ? 'blocked' : 'todo',
    next: ok ? null : next,
  })

  const steps: SetupStep[] = [
    {
      id: 'switched_on',
      label: 'Lalamove switched on for your store',
      state: input.lalamoveEnabled ? 'done' : 'todo',
      next: input.lalamoveEnabled ? null : 'Lalamove is switched on by the WebNegosyo team. Message support and ask them to turn on Lalamove for your store.',
    },
    input.hasKeys === null
      ? { id: 'keys', label: 'Your Lalamove API keys saved', state: blocked ? 'blocked' : 'todo', next: `Couldn't check your keys just now. Open ${SETTINGS} to see whether they are saved.` }
      : step('keys', 'Your Lalamove API keys saved', input.hasKeys, `Get your API key and secret from the Lalamove Partner portal, then paste them in ${SETTINGS} (never in this chat).`),
    step('rider_phone', 'A phone the rider can call', phoneOk, `Add the number riders should call at pickup in ${SETTINGS}.`),
    step(
      'pickup_pin',
      'Pickup spot pinned on the map',
      pinOk,
      input.storePinned
        ? `Pin every branch's location in Branches (${input.branches.total - input.branches.pinned} still have no pin).`
        : `Pin your store's location in ${SETTINGS} so riders know where to pick up.`,
    ),
    step('delivery_on', 'Delivery switched on as an order type', input.deliveryOrderTypeOn, 'Turn on Delivery in Order types so customers can choose it.'),
  ]

  let bookings: DeliverySetup['bookings'] = null
  if (input.recentStatuses) {
    const tones = input.recentStatuses.map((status) => lalamoveStatusTone(status))
    bookings = {
      total: tones.length,
      done: tones.filter((tone) => tone === 'done').length,
      active: tones.filter((tone) => tone === 'active' || tone === 'searching').length,
      cancelled: tones.filter((tone) => tone === 'cancelled').length,
    }
  }

  return {
    steps,
    ready: steps.every((entry) => entry.state === 'done'),
    environment: input.hasKeys === true ? (input.isSandbox ? 'sandbox' : 'live') : null,
    bookings,
  }
}

/**
 * Something that looks like a Lalamove key (`pk_prod_…`, `sk_test_…`). A
 * message carrying one is cut BEFORE it is stored or sent to the model:
 * conversations are kept and leave our servers for the model provider.
 */
// Any case and `-` as well as `_` (owners retype keys); best effort, the prompt rule stays.
// Everything up to the next space goes: a secret's alphabet may include + / = .
const KEY_SHAPE = /\b[ps]k[_-](?:prod|test)[_-]\S{6,}/gi

export const KEY_REMOVED = '[Lalamove key removed]'

export function redactLalamoveKeys(text: string): { text: string; removed: number } {
  let removed = 0
  const cleaned = text.replace(KEY_SHAPE, () => {
    removed += 1
    return KEY_REMOVED
  })
  return { text: cleaned, removed }
}
