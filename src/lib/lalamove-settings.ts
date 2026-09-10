/**
 * What a merchant's own Lalamove save has to decide, kept away from the
 * database so it can be tested on its own.
 *
 * The settings page lets a store owner manage its Lalamove connection
 * without the platform admin: the account keys, and the number the rider
 * calls at pickup. Two rules earn this module:
 *
 *  - The keys are write-only. A merchant editing just the phone leaves both
 *    key fields blank, and a blank field must mean "keep what is stored",
 *    never "erase it".
 *  - Lalamove refuses anything but bare E.164 and names no number when it
 *    does, so the phone is normalized and checked here, before a customer
 *    has checked out against a store that cannot book a rider.
 */

import { isE164Phone, normalizeLalamovePhone } from '@/lib/lalamove-phone'

export interface LalamoveSettingsInput {
  apiKey: string
  secretKey: string
  /** Blank clears the field, which falls back to the store's footer phone. */
  senderPhone: string
}

export interface LalamoveSettingsPatch {
  /** `null` when no new keys were entered — leave the stored ones alone. */
  secrets: { lalamove_api_key: string; lalamove_secret_key: string } | null
  tenant: { lalamove_sender_phone: string | null }
}

export type LalamoveSettingsResult =
  | { ok: true; patch: LalamoveSettingsPatch }
  | { ok: false; error: string }

export interface LalamoveSettingsOptions {
  /** Drives PH's local-format rules; other markets keep the typed code. */
  market?: string | null
  /** False on the very first connect, when keys are not optional. */
  hasExistingKeys: boolean
}

export function parseLalamoveSettings(
  input: LalamoveSettingsInput,
  options: LalamoveSettingsOptions
): LalamoveSettingsResult {
  const apiKey = input.apiKey.trim()
  const secretKey = input.secretKey.trim()

  if (Boolean(apiKey) !== Boolean(secretKey)) {
    return { ok: false, error: 'Enter both the API key and the secret key.' }
  }

  const hasNewKeys = Boolean(apiKey && secretKey)
  if (!hasNewKeys && !options.hasExistingKeys) {
    return {
      ok: false,
      error: 'Add your Lalamove API key and secret key to connect your account.',
    }
  }

  const typedPhone = input.senderPhone.trim()
  let senderPhone: string | null = null
  if (typedPhone !== '') {
    const normalized = normalizeLalamovePhone(typedPhone, options.market)
    if (!isE164Phone(normalized)) {
      return {
        ok: false,
        error: `"${typedPhone}" is not a valid mobile number. Enter your store number, e.g. 09171234567.`,
      }
    }
    senderPhone = normalized as string
  }

  return {
    ok: true,
    patch: {
      secrets: hasNewKeys
        ? { lalamove_api_key: apiKey, lalamove_secret_key: secretKey }
        : null,
      tenant: { lalamove_sender_phone: senderPhone },
    },
  }
}
