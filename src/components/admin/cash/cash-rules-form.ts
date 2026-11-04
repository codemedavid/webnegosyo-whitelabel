/**
 * The Settings card's cash-rules form: what changed (only those keys are
 * saved), and the usual float typed in pesos. Pure, so it is tested.
 */

import type { CashSettings, CashSettingsPatch } from '@/lib/cash/settings'

export type CashRulesDraft = Pick<
  CashSettings,
  'blindClose' | 'requireDenominations' | 'varianceReasonFromCents' | 'remittanceMode' | 'requireShiftToSell' | 'overdueGraceMinutes'
> & {
  /** What the owner typed for the usual float, in pesos; '' = each drawer's own. */
  defaultFloatText: string
}

export function draftFrom(settings: CashSettings): CashRulesDraft {
  return {
    blindClose: settings.blindClose,
    requireDenominations: settings.requireDenominations,
    varianceReasonFromCents: settings.varianceReasonFromCents,
    remittanceMode: settings.remittanceMode,
    requireShiftToSell: settings.requireShiftToSell,
    overdueGraceMinutes: settings.overdueGraceMinutes,
    defaultFloatText: settings.defaultFloatCents === null ? '' : String(settings.defaultFloatCents / 100),
  }
}

const PESOS = /^\d{1,7}(\.\d{1,2})?$/

/** '' → null (each drawer's own); "2,000.50" → 200050; anything else → undefined (invalid). */
export function parseFloatPesos(text: string): number | null | undefined {
  const trimmed = text.replace(/[,\s₱]/g, '')
  if (trimmed === '') return null
  if (!PESOS.test(trimmed)) return undefined
  const [whole, fraction = ''] = trimmed.split('.')
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}

export type PatchResult = { ok: true; patch: CashSettingsPatch } | { ok: false; error: string }

/** Only the keys that differ from what is saved. */
export function changedRules(saved: CashSettings, draft: CashRulesDraft): PatchResult {
  const floatCents = parseFloatPesos(draft.defaultFloatText)
  if (floatCents === undefined) return { ok: false, error: 'Type the usual float in pesos, like 2000, or leave it blank.' }
  const next: CashSettingsPatch = {
    blindClose: draft.blindClose,
    requireDenominations: draft.requireDenominations,
    varianceReasonFromCents: draft.varianceReasonFromCents,
    remittanceMode: draft.remittanceMode,
    requireShiftToSell: draft.requireShiftToSell,
    overdueGraceMinutes: draft.overdueGraceMinutes,
    defaultFloatCents: floatCents,
  }
  const patch = Object.fromEntries(
    (Object.keys(next) as Array<keyof CashSettingsPatch>).filter((key) => next[key] !== saved[key]).map((key) => [key, next[key]]),
  ) as CashSettingsPatch
  return { ok: true, patch }
}
