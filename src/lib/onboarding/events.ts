/**
 * Onboarding funnel events: the first time a set-up reached each screen or
 * milestone. The names are a fixed list (no free text, never an answer), so
 * the funnel can be read without ever reading what the buyer typed.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { WIZARD_STEPS } from './wizard-steps'

/** Sent by the buyer's browser through the token route. */
export const CLIENT_EVENTS = [
  'opened',
  ...WIZARD_STEPS.map((step) => `screen:${step}` as const),
  'shared',
  'qr_shown',
  'choices_done',
] as const

/** Written by the server where the thing actually happens. */
export const SERVER_EVENTS = ['submitted', 'build_ready', 'build_failed', 'live'] as const

export type ClientEvent = (typeof CLIENT_EVENTS)[number]
export type ServerEvent = (typeof SERVER_EVENTS)[number]
export type OnboardingEvent = ClientEvent | ServerEvent

export function isClientEvent(value: unknown): value is ClientEvent {
  return typeof value === 'string' && (CLIENT_EVENTS as readonly string[]).includes(value)
}

/** Record the first occurrence; later ones are ignored. Never throws: measurement must not break a set-up. */
export async function recordOnboardingEvent(admin: SupabaseClient, onboardingId: string, event: OnboardingEvent): Promise<void> {
  try {
    const { error } = await admin
      .from('onboarding_events')
      .upsert({ onboarding_id: onboardingId, event }, { onConflict: 'onboarding_id,event', ignoreDuplicates: true })
    if (error) console.warn('[onboarding/events] not recorded', { event, message: error.message })
  } catch (error) {
    console.warn('[onboarding/events] not recorded', { event, message: error instanceof Error ? error.message : String(error) })
  }
}
