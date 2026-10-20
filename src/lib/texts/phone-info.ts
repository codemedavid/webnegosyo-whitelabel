/**
 * The `x-wn-phone-info` header a sending phone puts on its outbox claim:
 * `encodeURIComponent(JSON.stringify({manufacturer, model, os, app, sms, bat}))`.
 * Pure.
 *
 * Headers, not body fields, because the claim route refuses unknown body keys
 * (an old server would 400 a new app) and an old app simply sends none. The
 * route records it only after the claim RPC has authenticated the device, and
 * this parser still treats it as untrusted text: bounded before decoding,
 * control characters stripped, each field cut to its column bound, and null
 * on anything structurally wrong.
 */

import { z } from 'zod'

export const PHONE_INFO_HEADER = 'x-wn-phone-info'
export const MAX_PHONE_INFO_HEADER_CHARS = 1024
const MAX_RAW_FIELD_CHARS = 200
const BOUNDS = { manufacturer: 40, model: 60, os: 20, app: 20 } as const
const APP_VERSION = /^\d{1,4}(\.\d{1,4}){0,3}([-+][0-9A-Za-z.]{1,12})?$/
// C0/C1 controls plus bidi overrides/isolates: a name that renders backwards is a lie.
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g

export interface PhoneInfo {
  manufacturer: string | null
  model: string | null
  osVersion: string | null
  appVersion: string | null
  smsPermission: boolean | null
  /** true = battery saver leaves the app alone ("Unrestricted"). */
  isBatteryUnrestricted: boolean | null
}

const rawText = z.string().max(MAX_RAW_FIELD_CHARS).optional()
const headerSchema = z.object({
  manufacturer: rawText,
  model: rawText,
  os: rawText,
  app: rawText,
  sms: z.boolean().optional(),
  bat: z.boolean().optional(),
})

function clean(value: string | undefined, max: number): string | null {
  if (value === undefined) return null
  const text = value.replace(/\s+/g, ' ').replace(CONTROL_CHARS, '').trim()
  return text === '' ? null : text.slice(0, max)
}

function decode(raw: string): unknown {
  try {
    return JSON.parse(decodeURIComponent(raw))
  } catch {
    return null
  }
}

function isEmpty(info: PhoneInfo): boolean {
  return Object.values(info).every((value) => value === null)
}

export function parsePhoneInfoHeader(raw: string | null): PhoneInfo | null {
  if (!raw || raw.length > MAX_PHONE_INFO_HEADER_CHARS) return null
  const parsed = headerSchema.safeParse(decode(raw))
  if (!parsed.success) return null
  const { manufacturer, model, os, app, sms, bat } = parsed.data
  const appVersion = clean(app, BOUNDS.app)
  const info: PhoneInfo = {
    manufacturer: clean(manufacturer, BOUNDS.manufacturer),
    model: clean(model, BOUNDS.model),
    osVersion: clean(os, BOUNDS.os),
    appVersion: appVersion && APP_VERSION.test(appVersion) ? appVersion : null,
    smsPermission: sms ?? null,
    isBatteryUnrestricted: bat ?? null,
  }
  return isEmpty(info) ? null : info
}
