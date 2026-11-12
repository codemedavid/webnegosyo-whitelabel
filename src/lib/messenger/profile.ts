/**
 * Rules → the Page's Messenger Profile: the Get Started button, starter
 * questions (ice breakers) and the persistent menu.
 *
 * `buildMessengerProfile` is pure. `planProfileSync` decides what to send:
 * nothing when the hash is unchanged (Meta allows 10 profile calls per 10
 * minutes per Page), and it only ever DELETES a field we set ourselves, so a
 * Get Started button another tool put on the Page is left alone.
 */

import crypto from 'crypto'
import { clip, MESSENGER_LIMITS } from './limits'
import { encodePayload } from './payload'
import type { MessengerRule } from './rules'

export type ProfileField = 'get_started' | 'ice_breakers' | 'persistent_menu'

export type MessengerProfile = Partial<{
  get_started: { payload: string }
  ice_breakers: Array<{ locale: 'default'; call_to_actions: Array<{ question: string; payload: string }> }>
  persistent_menu: Array<{
    locale: 'default'
    composer_input_disabled: false
    call_to_actions: Array<{ type: 'postback'; title: string; payload: string }>
  }>
}>

export function buildMessengerProfile(rules: readonly MessengerRule[]): MessengerProfile {
  const enabled = rules.filter((rule) => rule.isEnabled)
  const iceBreakers = enabled.flatMap((rule) => rule.trigger.kind === 'ice_breaker'
    ? [{ question: clip(rule.trigger.question, MESSENGER_LIMITS.iceBreakerQuestion), payload: encodePayload({ verb: 'rule', ruleId: rule.id }) }]
    : []).slice(0, MESSENGER_LIMITS.iceBreakers)
  const menu = enabled.flatMap((rule) => rule.trigger.kind === 'menu_button'
    ? [{ type: 'postback' as const, title: clip(rule.trigger.label, MESSENGER_LIMITS.persistentMenuTitle), payload: encodePayload({ verb: 'rule', ruleId: rule.id }) }]
    : []).slice(0, MESSENGER_LIMITS.persistentMenuItems)
  const hasGetStarted = enabled.some((rule) => rule.trigger.kind === 'get_started')

  const profile: MessengerProfile = {}
  // Meta: a persistent menu needs the Get Started button.
  if (hasGetStarted || menu.length > 0) profile.get_started = { payload: encodePayload({ verb: 'start' }) }
  if (iceBreakers.length > 0) profile.ice_breakers = [{ locale: 'default', call_to_actions: iceBreakers }]
  if (menu.length > 0) profile.persistent_menu = [{ locale: 'default', composer_input_disabled: false, call_to_actions: menu }]
  return profile
}

export function profileHash(profile: MessengerProfile): string {
  const ordered = (['get_started', 'ice_breakers', 'persistent_menu'] as const).map((field) => [field, profile[field] ?? null])
  return crypto.createHash('sha256').update(JSON.stringify(ordered)).digest('hex')
}

export interface ProfileSyncPlan {
  set: MessengerProfile | null
  /** Fields we set before and no longer want. The persistent menu goes before Get Started. */
  remove: ProfileField[]
  hash: string
  fields: ProfileField[]
}

export function planProfileSync(
  rules: readonly MessengerRule[],
  previous: { hash: string | null; fields: readonly string[] },
): ProfileSyncPlan | null {
  const profile = buildMessengerProfile(rules)
  const hash = profileHash(profile)
  if (hash === previous.hash) return null
  const fields = (Object.keys(profile) as ProfileField[]).sort()
  const order: ProfileField[] = ['persistent_menu', 'ice_breakers', 'get_started']
  const remove = order.filter((field) => previous.fields.includes(field) && !fields.includes(field))
  return { set: fields.length > 0 ? profile : null, remove, hash, fields }
}
