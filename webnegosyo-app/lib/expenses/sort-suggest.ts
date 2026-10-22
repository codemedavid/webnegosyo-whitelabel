/**
 * Reason → category, for sorting old drawer pay-outs ("yelo" → Ice (Yelo)) and
 * pre-picking a chip from a typed note (plan §5.2).
 *
 * A keyword map in English and Filipino/Taglish, matched on whole words after
 * folding case and accents. Longer phrases beat the words inside them ("grab
 * car" is a ride, "grab" alone a delivery). A staff member's first name can't
 * be told apart from any other word, so "Ana" suggests nothing.
 *
 * Confidence is `high` only when every match points to one category and at
 * least one is a strong word; a weak word alone ("meal") or words pointing two
 * ways ("yelo at lpg") give `low`, and the UI shows it as a suggestion only.
 * Copied byte-for-byte into the merchant app.
 */
import type { ExpenseCategory } from './types'

export interface CategorySuggestion {
  categoryId: string
  systemKey: string
  confidence: 'high' | 'low'
}

interface KeywordRule {
  systemKey: string
  strong: readonly string[]
  weak?: readonly string[]
}

const KEYWORD_RULES: readonly KeywordRule[] = [
  { systemKey: 'ice', strong: ['ice', 'yelo', 'tube ice'] },
  { systemKey: 'lpg', strong: ['lpg', 'gas', 'gasul', 'solane', 'regasco'] },
  {
    systemKey: 'ingredients',
    strong: [
      'palengke', 'wet market', 'meat', 'karne', 'baboy', 'pork', 'manok', 'chicken', 'beef', 'baka', 'isda', 'fish',
      'seafood', 'hipon', 'gulay', 'veggies', 'vegetables', 'rice', 'bigas', 'sibuyas', 'bawang', 'kamatis', 'itlog',
      'egg', 'eggs', 'mantika', 'cooking oil', 'asukal', 'sugar', 'harina', 'flour', 'rekado', 'sangkap', 'ingredients',
      'grocery', 'groceries',
    ],
    weak: ['market'],
  },
  {
    systemKey: 'drinks',
    strong: [
      'sprite', 'coke', 'coca cola', 'pepsi', 'royal', 'mountain dew', 'softdrinks', 'softdrink', 'soft drinks', 'soda',
      'beer', 'san mig', 'san miguel', 'red horse', 'juice', 'mineral water', 'bottled water',
    ],
  },
  {
    systemKey: 'packaging',
    strong: ['lalagyan', 'packaging', 'styro', 'styrofoam', 'cups', 'lids', 'straw', 'straws', 'paper bag', 'plastic bag', 'containers'],
    weak: ['plastic', 'container', 'cup'],
  },
  {
    systemKey: 'wages',
    strong: ['sahod', 'sweldo', 'suweldo', 'salary', 'salaries', 'wage', 'wages', 'payroll', 'cash advance', 'vale'],
  },
  { systemKey: 'gov_contributions', strong: ['sss', 'philhealth', 'pag ibig', 'pagibig', 'hdmf'] },
  {
    systemKey: 'staff_meals',
    strong: ['staff meal', 'staff meals', 'crew meal', 'crew meals', 'pakain', 'meal allowance', 'allowance'],
    weak: ['meal', 'meals', 'kain', 'ulam', 'merienda', 'lunch', 'almusal', 'hapunan'],
  },
  { systemKey: 'thirteenth_month', strong: ['13th month', 'thirteenth month'] },
  { systemKey: 'rent', strong: ['rent', 'upa', 'renta', 'rental', 'lease'] },
  { systemKey: 'electricity', strong: ['kuryente', 'meralco', 'electric', 'electricity', 'veco'] },
  { systemKey: 'water', strong: ['tubig', 'water', 'maynilad', 'manila water', 'water bill'] },
  {
    systemKey: 'internet',
    strong: ['load', 'wifi', 'wi fi', 'internet', 'pldt', 'converge', 'prepaid'],
    weak: ['globe', 'smart', 'dito'],
  },
  {
    systemKey: 'delivery_fees',
    strong: ['delivery', 'rider', 'lalamove', 'borzo', 'mr speedy', 'toktok', 'grab express'],
    weak: ['grab'],
  },
  {
    systemKey: 'transport',
    strong: [
      'pamasahe', 'fare', 'jeep', 'jeepney', 'tricycle', 'trike', 'taxi', 'grab car', 'angkas', 'joyride', 'bus',
      'pedicab', 'parking', 'gasolina', 'gasoline',
    ],
  },
  { systemKey: 'platform_fees', strong: ['foodpanda', 'commission', 'komisyon', 'platform fee'] },
  {
    systemKey: 'cleaning',
    strong: ['sabon', 'soap', 'dishwashing', 'detergent', 'zonrox', 'bleach', 'cleaning', 'mop', 'walis', 'basahan', 'trash bag', 'garbage bag'],
  },
  { systemKey: 'repairs', strong: ['pagawa', 'repair', 'repairs', 'tubero', 'plumber', 'electrician', 'aircon'] },
  { systemKey: 'marketing', strong: ['ads', 'fb ads', 'facebook ads', 'flyers', 'tarpaulin', 'tarp', 'marketing'] },
  {
    systemKey: 'permits',
    strong: ['permit', 'permits', 'mayors permit', 'barangay clearance', 'bir', 'business tax', 'cedula', 'amilyar'],
  },
  { systemKey: 'accounting', strong: ['accountant', 'bookkeeper', 'bookkeeping'] },
  { systemKey: 'bank_charges', strong: ['bank charge', 'bank charges', 'bank fee', 'transfer fee', 'instapay', 'pesonet'] },
  { systemKey: 'equipment', strong: ['chiller', 'freezer', 'refrigerator', 'kalan', 'blender', 'oven', 'equipment'] },
  { systemKey: 'owner_draw', strong: ['kinuha ng may ari', 'owner draw'], weak: ['owner'] },
  { systemKey: 'bank_deposit', strong: ['bank deposit', 'deposit', 'deposito'] },
  { systemKey: 'loan_payment', strong: ['loan', 'loan payment', 'utang'] },
]

/** Lowercase, accents off, anything not a letter or digit → one space. */
export function foldReason(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

interface CompiledPhrase {
  systemKey: string
  tokens: readonly string[]
  isStrong: boolean
}

const PHRASES: readonly CompiledPhrase[] = KEYWORD_RULES.flatMap((rule) => [
  ...rule.strong.map((phrase) => ({ systemKey: rule.systemKey, tokens: foldReason(phrase).split(' '), isStrong: true })),
  ...(rule.weak ?? []).map((phrase) => ({ systemKey: rule.systemKey, tokens: foldReason(phrase).split(' '), isStrong: false })),
])

interface Match {
  systemKey: string
  start: number
  end: number
  isStrong: boolean
}

function findMatches(words: readonly string[]): Match[] {
  return PHRASES.flatMap((phrase) =>
    words.flatMap((_, start) =>
      phrase.tokens.every((token, offset) => words[start + offset] === token)
        ? [{ systemKey: phrase.systemKey, start, end: start + phrase.tokens.length, isStrong: phrase.isStrong }]
        : [],
    ),
  )
}

/** Drops a match lying inside a longer one ("grab" inside "grab car"). */
function outermost(matches: readonly Match[]): Match[] {
  return matches.filter(
    (match) =>
      !matches.some(
        (other) =>
          other !== match &&
          other.start <= match.start &&
          other.end >= match.end &&
          other.end - other.start > match.end - match.start,
      ),
  )
}

interface Tally {
  systemKey: string
  count: number
  firstAt: number
  hasStrong: boolean
}

function tally(matches: readonly Match[]): Tally[] {
  const byKey = new Map<string, Tally>()
  for (const match of matches) {
    const previous = byKey.get(match.systemKey)
    byKey.set(match.systemKey, {
      systemKey: match.systemKey,
      count: (previous?.count ?? 0) + 1,
      firstAt: Math.min(previous?.firstAt ?? match.start, match.start),
      hasStrong: (previous?.hasStrong ?? false) || match.isStrong,
    })
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count || a.firstAt - b.firstAt)
}

export function suggestCategoryForReason(
  reason: string,
  categories: readonly ExpenseCategory[],
): CategorySuggestion | null {
  const folded = foldReason(reason)
  if (!folded) return null
  const active = new Map(
    categories
      .filter((category) => category.archivedAt === null && category.systemKey !== null)
      .map((category) => [category.systemKey as string, category]),
  )
  const matches = outermost(findMatches(folded.split(' '))).filter((match) => active.has(match.systemKey))
  const [winner, ...rest] = tally(matches)
  if (!winner) return null
  const category = active.get(winner.systemKey) as ExpenseCategory
  return {
    categoryId: category.id,
    systemKey: winner.systemKey,
    confidence: rest.length === 0 && winner.hasStrong ? 'high' : 'low',
  }
}
