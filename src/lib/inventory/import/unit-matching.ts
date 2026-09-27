/**
 * Reading a unit word ("kgs", "Kilo", "pcs", "Litres") as one of the store's units.
 *
 * Only ever resolves to a unit the store HAS. A spreadsheet saying "bottle"
 * when the store has no bottle unit is a question for the merchant — they pick
 * which unit it means once, on the review screen, and every row using that
 * word follows. Creating a unit here would need a dimension and a conversion
 * factor nobody typed.
 */

export interface ImportUnit {
  id: string
  name: string
  abbreviation: string
}

/** Chosen on the review screen: normalized unit word → unit id. */
export type UnitOverrides = Readonly<Record<string, string>>

/**
 * Lowercase, no dots or spaces, and no plural "s" — so "Kgs.", "kg" and "KG"
 * are one word. Applied to BOTH sides of every comparison, which is why a
 * plural rule this blunt is safe: "lbs" and "lb" both become "lb".
 */
export function normalizeUnitText(raw: string): string {
  const compact = raw.trim().toLowerCase().replace(/[.\s]/g, '')
  return compact.length > 2 && compact.endsWith('s') && !compact.endsWith('ss')
    ? compact.slice(0, -1)
    : compact
}

/** Other spellings of the default units, keyed to the default abbreviation. */
const ALIASES: Readonly<Record<string, readonly string[]>> = {
  g: ['gram', 'gramme', 'gm', 'gms', 'gr', 'grm'],
  kg: ['kilo', 'kilogram', 'kilogramme', 'kgm'],
  mg: ['milligram', 'milligramme'],
  oz: ['ounce'],
  lb: ['pound', 'lbs'],
  ml: ['millilitre', 'milliliter', 'mls', 'cc'],
  l: ['litre', 'liter', 'ltr', 'lt'],
  tsp: ['teaspoon'],
  tbsp: ['tablespoon', 'tbs', 'tbl'],
  cup: ['cups'],
  pc: ['piece', 'pcs', 'pce', 'each', 'ea'],
  dozen: ['doz', 'dz'],
}

const ALIAS_TO_ABBREVIATION = new Map<string, string>(
  Object.entries(ALIASES).flatMap(([abbreviation, words]) =>
    words.map((word) => [normalizeUnitText(word), abbreviation] as const),
  ),
)

export function resolveUnit(
  raw: string,
  units: readonly ImportUnit[],
  overrides: UnitOverrides = {},
): ImportUnit | null {
  const word = normalizeUnitText(raw)
  if (!word) return null

  const picked = overrides[word]
  if (picked) return units.find((unit) => unit.id === picked) ?? null

  const direct = units.find(
    (unit) => normalizeUnitText(unit.abbreviation) === word || normalizeUnitText(unit.name) === word,
  )
  if (direct) return direct

  const alias = ALIAS_TO_ABBREVIATION.get(word)
  if (!alias) return null
  return units.find((unit) => normalizeUnitText(unit.abbreviation) === normalizeUnitText(alias)) ?? null
}
