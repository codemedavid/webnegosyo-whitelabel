/**
 * How to stop a phone's battery manager from killing the SMS gateway, by
 * brand. Pure, no imports: the merchant app keeps a BYTE-IDENTICAL copy
 * (webnegosyo-app/lib/sms-automations/keep-awake.ts, pinned by
 * tests/unit/texts/keep-awake-parity.test.ts).
 *
 * Why it exists: Android's own "battery optimisation" switch is not enough on
 * most phones sold in the Philippines. Transsion (Infinix, Tecno, itel),
 * Xiaomi, OPPO/realme/vivo and Samsung each add their own app killer on top,
 * and a gateway that is killed quietly stops checking in — the store sees
 * "Offline" and nothing goes out (Sample Demo's Infinix stopped this way,
 * 2026-10-28). Menu names differ by OS version, so steps name what to look
 * for, not an exact path.
 */

export type KeepAwakeBrand = 'transsion' | 'xiaomi' | 'samsung' | 'oppo' | 'other'

export interface KeepAwakeGuide {
  brand: KeepAwakeBrand
  /** "Infinix, Tecno and itel phones"; null for the generic list. */
  title: string | null
  steps: readonly string[]
}

const COMMON_LAST = 'Open SmartMenu, then lock it in recent apps (swipe down on its card, or tap the lock) so clearing apps never closes it.'

const GUIDES: Record<KeepAwakeBrand, KeepAwakeGuide> = {
  transsion: {
    brand: 'transsion',
    title: 'Infinix, Tecno and itel phones',
    steps: [
      'Settings → Apps → SmartMenu → Battery: choose "Unrestricted" or "No restrictions".',
      'Phone Master (or Settings → App management) → Auto-start: turn SmartMenu ON.',
      'Settings → Battery → App power saving / Background running: allow SmartMenu to run in the background.',
      COMMON_LAST,
    ],
  },
  xiaomi: {
    brand: 'xiaomi',
    title: 'Xiaomi, Redmi and POCO phones',
    steps: [
      'Settings → Apps → Manage apps → SmartMenu → Autostart: turn it ON.',
      'Same screen → Battery saver: choose "No restrictions".',
      COMMON_LAST,
    ],
  },
  samsung: {
    brand: 'samsung',
    title: 'Samsung phones',
    steps: [
      'Settings → Apps → SmartMenu → Battery: choose "Unrestricted".',
      'Settings → Battery → Background usage limits → Never sleeping apps: add SmartMenu.',
      'Make sure SmartMenu is NOT in "Sleeping apps" or "Deep sleeping apps".',
    ],
  },
  oppo: {
    brand: 'oppo',
    title: 'OPPO, realme and vivo phones',
    steps: [
      'Settings → Apps → SmartMenu → Battery usage: allow background activity and auto launch.',
      'Settings → Battery → turn off any power saving that "freezes" or "optimises" SmartMenu.',
      COMMON_LAST,
    ],
  },
  other: {
    brand: 'other',
    title: null,
    steps: [
      'Settings → Apps → SmartMenu → Battery: choose "Unrestricted" (or turn battery optimisation off).',
      'If your phone has "Auto-start" or "Background running" settings, turn them ON for SmartMenu.',
      COMMON_LAST,
    ],
  },
}

const BRAND_WORDS: readonly (readonly [KeepAwakeBrand, RegExp])[] = [
  ['transsion', /infinix|tecno|itel|transsion/i],
  ['xiaomi', /xiaomi|redmi|poco/i],
  ['samsung', /samsung/i],
  ['oppo', /oppo|realme|vivo|oneplus/i],
]

/** Which brand's steps fit this phone; `other` when the maker is unknown. */
export function keepAwakeBrandOf(manufacturer: string | null | undefined, model?: string | null): KeepAwakeBrand {
  const text = `${manufacturer ?? ''} ${model ?? ''}`
  for (const [brand, pattern] of BRAND_WORDS) if (pattern.test(text)) return brand
  return 'other'
}

export function keepAwakeGuideFor(manufacturer: string | null | undefined, model?: string | null): KeepAwakeGuide {
  return GUIDES[keepAwakeBrandOf(manufacturer, model)]
}

/** Every brand's guide, for a page that doesn't know the phone yet. */
export function allKeepAwakeGuides(): readonly KeepAwakeGuide[] {
  return [GUIDES.transsion, GUIDES.xiaomi, GUIDES.samsung, GUIDES.oppo, GUIDES.other]
}
