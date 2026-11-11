/**
 * `messenger_settings.messages`: a flat object, `id → string | boolean`, plus
 * `lang` ('en' | 'tl'). Checked on save (refuses anything wrong, with a
 * reason per message) and again on read in the webhook (drops anything wrong,
 * so a bad key costs one message its custom words, never the reply).
 */

import { charLength } from '../limits'
import {
  ALL_PLACEHOLDERS,
  DEFAULT_MESSAGE_SETTINGS,
  MESSAGE_BY_ID,
  MESSAGE_LANGS,
  UPDATE_MESSAGE_IDS,
  type MessageLang,
  type MessageSettings,
  type TextEntry,
  type TextMessageId,
  type ToggleId,
} from './registry'
import { placeholdersIn } from './fill'

/** Whole stored object, as text. The DB check allows a little more. */
export const MAX_MESSAGES_BYTES = 24_000

export interface MessageProblem {
  id: string
  message: string
}

/** UTF-8 bytes, as Postgres counts `octet_length` (no TextEncoder: runs in jsdom and every browser). */
function utf8Length(text: string): number {
  let bytes = 0
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4
  }
  return bytes
}

function isLang(value: unknown): value is MessageLang {
  return typeof value === 'string' && (MESSAGE_LANGS as readonly string[]).includes(value)
}

/** Why a text can't be saved for this entry, or null. */
export function textProblem(entry: TextEntry, value: string): string | null {
  const trimmed = value.trim()
  if (charLength(trimmed) > entry.max) return `Keep it under ${entry.max} characters.`
  const allowed = new Set<string>(entry.placeholders)
  const known = new Set<string>(ALL_PLACEHOLDERS)
  const wrong = placeholdersIn(trimmed).filter((key) => known.has(key) && !allowed.has(key))
  if (wrong.length > 0) {
    return allowed.size === 0
      ? `This message can't use ${wrong.map((key) => `{${key}}`).join(', ')}.`
      : `This message can use ${[...allowed].map((key) => `{${key}}`).join(', ')} only.`
  }
  return null
}

/**
 * The stored object → settings. Never throws. Legacy `order_updates.texts`
 * (release 2) fill in status messages the new object doesn't set.
 */
export function readMessages(raw: unknown, legacyOrderTexts?: Partial<Record<string, string>>): MessageSettings {
  const texts: MessageSettings['texts'] = {}
  const toggles: MessageSettings['toggles'] = {}
  let lang: MessageLang = DEFAULT_MESSAGE_SETTINGS.lang

  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (key === 'lang') {
        if (isLang(value)) lang = value
        continue
      }
      const entry = MESSAGE_BY_ID.get(key)
      if (!entry) continue
      if (entry.kind === 'toggle') {
        if (typeof value === 'boolean') toggles[key as ToggleId] = value
      } else if (typeof value === 'string' && value.trim() && textProblem(entry, value) === null) {
        texts[key as TextMessageId] = value.trim()
      }
    }
  }

  for (const [status, id] of Object.entries(UPDATE_MESSAGE_IDS)) {
    const legacy = legacyOrderTexts?.[status]
    if (texts[id] === undefined && typeof legacy === 'string' && legacy.trim() && textProblem(MESSAGE_BY_ID.get(id) as TextEntry, legacy) === null) {
      texts[id] = legacy.trim()
    }
  }

  return { lang, texts, toggles }
}

/** Settings → the object stored. Defaults are left out, so "reset" = remove the key. */
export function toStoredMessages(settings: MessageSettings): Record<string, string | boolean> {
  const stored: Record<string, string | boolean> = {}
  if (settings.lang !== 'en') stored.lang = settings.lang
  for (const [id, value] of Object.entries(settings.texts)) {
    if (typeof value === 'string' && value.trim()) stored[id] = value.trim()
  }
  for (const [id, value] of Object.entries(settings.toggles)) {
    const entry = MESSAGE_BY_ID.get(id)
    if (entry?.kind === 'toggle' && typeof value === 'boolean' && value !== entry.default) stored[id] = value
  }
  return stored
}

/** Save-time check: every key known, every value fits. Returns the cleaned settings or the problems. */
export function parseMessagesForSave(raw: unknown):
  | { ok: true; settings: MessageSettings; stored: Record<string, string | boolean> }
  | { ok: false; problems: MessageProblem[] } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, problems: [{ id: '', message: 'Nothing to save.' }] }
  const problems: MessageProblem[] = []
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (key === 'lang') {
      if (!isLang(value)) problems.push({ id: key, message: 'Unknown language.' })
      continue
    }
    const entry = MESSAGE_BY_ID.get(key)
    if (!entry) {
      problems.push({ id: key, message: 'Unknown message.' })
      continue
    }
    if (entry.kind === 'toggle') {
      if (typeof value !== 'boolean') problems.push({ id: key, message: 'Expected on or off.' })
      continue
    }
    if (typeof value !== 'string') {
      problems.push({ id: key, message: 'Expected text.' })
      continue
    }
    const problem = textProblem(entry, value)
    if (problem) problems.push({ id: key, message: problem })
  }
  if (problems.length > 0) return { ok: false, problems }
  const settings = readMessages(raw)
  const stored = toStoredMessages(settings)
  if (utf8Length(JSON.stringify(stored)) > MAX_MESSAGES_BYTES) {
    return { ok: false, problems: [{ id: '', message: 'Too much text in total. Shorten some messages.' }] }
  }
  return { ok: true, settings, stored }
}
