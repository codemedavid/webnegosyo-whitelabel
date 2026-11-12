/**
 * A store's Messenger settings and rule set, as the webhook and editor see
 * them. Pure: the rows are read in `load-store.ts`.
 */

import { DEFAULT_RULES, parseStoredRules, type MessengerRule } from './rules'
import type { ReplyStore } from './store-view'
import { DEFAULT_MESSAGE_SETTINGS, type MessageSettings } from './messages/registry'
import { readMessages } from './messages/stored'
import { readOrderUpdates } from './order-view'

export interface MessengerSettings {
  botEnabled: boolean
  takeoverMinutes: number
  /** The store's own rules replace the built-in ones (even when it has none). */
  isCustomized: boolean
  rulesVersion: number
  testerPsid: string | null
  testerCodeHash: string | null
  testerCodeExpiresAt: Date | null
  profileHash: string | null
  profileFields: string[]
  /** What the bot says (`messenger_settings.messages`, legacy order texts folded in). */
  messages: MessageSettings
}

export const DEFAULT_SETTINGS: MessengerSettings = Object.freeze({
  botEnabled: true,
  takeoverMinutes: 60,
  isCustomized: false,
  rulesVersion: 0,
  testerPsid: null,
  testerCodeHash: null,
  testerCodeExpiresAt: null,
  profileHash: null,
  profileFields: [],
  messages: DEFAULT_MESSAGE_SETTINGS,
}) as MessengerSettings

export interface StoreBundle {
  tenantId: string
  slug: string
  facebookPageRowId: string | null
  /** `resolveOrderBackend(tenant) === 'platform'`: its orders are readable here. */
  isPlatformOrders: boolean
  store: ReplyStore | null
  rules: MessengerRule[]
  settings: MessengerSettings
}

export interface SettingsRow {
  bot_enabled: boolean
  takeover_minutes: number
  rules_customized_at: string | null
  rules_version: number
  tester_psid: string | null
  tester_code_hash: string | null
  tester_code_expires_at: string | null
  profile_hash: string | null
  profile_fields: string[] | null
  messages: unknown
  order_updates: unknown
}

export function toSettings(row: SettingsRow | null): MessengerSettings {
  if (!row) return DEFAULT_SETTINGS
  return {
    botEnabled: row.bot_enabled,
    takeoverMinutes: row.takeover_minutes,
    isCustomized: row.rules_customized_at !== null,
    rulesVersion: row.rules_version,
    testerPsid: row.tester_psid,
    testerCodeHash: row.tester_code_hash,
    testerCodeExpiresAt: row.tester_code_expires_at ? new Date(row.tester_code_expires_at) : null,
    profileHash: row.profile_hash,
    profileFields: row.profile_fields ?? [],
    messages: readMessages(row.messages, readOrderUpdates(row.order_updates ?? null).texts),
  }
}

export interface RuleRow {
  id: string
  name: string
  trigger: unknown
  action: unknown
  is_enabled: boolean
}

export function rowsToRules(rows: readonly RuleRow[]): MessengerRule[] {
  return parseStoredRules(rows.map((row) => ({ id: row.id, name: row.name, trigger: row.trigger, action: row.action, isEnabled: row.is_enabled })))
}

/** The rules a store runs. */
export function activeRules(settings: MessengerSettings, storedRules: readonly MessengerRule[]): MessengerRule[] {
  return settings.isCustomized ? [...storedRules] : [...DEFAULT_RULES]
}

