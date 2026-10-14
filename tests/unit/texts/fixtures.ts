/**
 * Shared guests for the Texts engine tests (and the parity checks against the
 * merchant app's copies in webnegosyo-app/lib/sms/).
 */

import type { SmsCustomer } from '@/lib/texts/audience'

export const NOW = new Date('2026-10-14T02:00:00.000Z') // 10:00 Manila, Wednesday

const DAY_MS = 86_400_000

export function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * DAY_MS).toISOString()
}

export function guest(overrides: Partial<SmsCustomer> & { id: string }): SmsCustomer {
  return {
    name: 'Maria Santos',
    phone_e164: `+63917${overrides.id.padStart(7, '0').slice(-7)}`,
    order_count: 2,
    total_spent: 640,
    last_order_at: daysAgo(10),
    channels_used: ['web'],
    sms_consent: true,
    sms_opt_out: false,
    ...overrides,
  }
}

export const MIXED_GUESTS: SmsCustomer[] = [
  guest({ id: '1', last_order_at: daysAgo(2), order_count: 5 }),
  guest({ id: '2', phone_e164: null }),
  guest({ id: '3', sms_consent: false }),
  guest({ id: '4', sms_opt_out: true }),
  guest({ id: '5', last_order_at: daysAgo(40), order_count: 1 }),
  guest({ id: '6', last_order_at: null, order_count: 0 }),
  guest({ id: '7', last_order_at: daysAgo(25), order_count: 3, total_spent: 2000 }),
  guest({ id: '8', sms_consent: false, sms_opt_out: true, phone_e164: null }),
  guest({ id: '9', last_order_at: daysAgo(1), order_count: 1, channels_used: ['pos'] }),
]
