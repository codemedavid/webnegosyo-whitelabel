/**
 * One line telling a merchant whether the day was fine.
 *
 * The measurement is the trade's standard one — **actual versus theoretical**
 * (AvT): the money the shelf came up short, as a share of the money the recipes
 * say the day used. The benchmarks are the industry's: 1–2% is a well-run
 * kitchen, 3–5% is tolerable, and above 5% is a systemic problem rather than a
 * bad week.
 *
 * The important half of this module is when it says NOTHING. A verdict is a
 * claim about a kitchen, and there are three ways this report can hold numbers
 * that look immaculate while describing a system that never ran:
 *
 * 1. **No dish has a recipe.** Then no order deducts anything, usage is zero,
 *    shrinkage is zero, and the day grades perfectly — forever. This is not
 *    hypothetical: a live tenant has inventory switched on, 51 dishes and no
 *    recipes at all.
 * 2. **Nothing was counted.** Shrinkage is only discoverable by comparing the
 *    shelf to the book. Without a count, zero missing means "nobody looked".
 * 3. **Nothing was used.** A percentage of a zero denominator is not a grade.
 *
 * In all three the verdict is `null` and the detail says which thing to fix, so
 * an unconfigured system reads as unconfigured instead of as excellent.
 */

/** Variance at or below this share of usage is a well-run kitchen. */
const GOOD_MAX_PERCENT = 2

/** Above {@link GOOD_MAX_PERCENT} and up to this is tolerable but worth watching. */
const WATCH_MAX_PERCENT = 5

export type VarianceLevel = 'good' | 'watch' | 'investigate'

export interface VarianceVerdictInput {
  /** Theoretical usage in money — the denominator. */
  cogs: number
  /** The short side of the counts, in money. */
  shrinkageCost: number
  /** How many ingredients were physically counted in the window. */
  countedCount: number
  /** How many dishes have a base recipe with at least one ingredient. */
  dishesWithRecipe: number
}

export interface VarianceVerdict {
  /** `null` when the day cannot honestly be graded. */
  level: VarianceLevel | null
  /** Variance as a share of theoretical usage. `null` alongside a null level. */
  percent: number | null
  headline: string
  detail: string
}

/**
 * The wording lives here rather than in the view module because a verdict and
 * its justification are one statement — a grade whose reason is written
 * somewhere else can drift into contradicting itself.
 */
const UNJUDGEABLE = {
  noRecipes: {
    headline: 'Not enough set up to judge this day',
    detail:
      'No dish has a recipe yet, so orders are not taking anything off your shelf.' +
      ' Until at least one dish says what it uses, this day will always look perfect.',
  },
  noCount: {
    headline: 'Nothing counted, so nothing can be missing',
    detail:
      'No ingredient was physically counted on this day, so the shelf has not been' +
      ' compared against the book. Count your highest-value items to find out.',
  },
  noUsage: {
    headline: 'No stock was used on this day',
    detail:
      'There is no usage to compare against, so a variance percentage would not' +
      ' mean anything.',
  },
} as const

function levelFor(percent: number): VarianceLevel {
  if (percent <= GOOD_MAX_PERCENT) return 'good'
  if (percent <= WATCH_MAX_PERCENT) return 'watch'
  return 'investigate'
}

const GRADED: Record<VarianceLevel, { headline: string; detail: string }> = {
  good: {
    headline: 'This day looks well run',
    detail:
      'What the shelf is short is within the 1–2% a tight kitchen normally loses to' +
      ' trim, spillage and rounding.',
  },
  watch: {
    headline: 'Worth watching',
    detail:
      'More is missing than a tight kitchen would lose, but not yet enough to suggest' +
      ' something is structurally wrong. Check the ingredients at the top of the list.',
  },
  investigate: {
    headline: 'Worth investigating',
    detail:
      'More than 5% of what this day used is unaccounted for, which is usually a' +
      ' process problem — over-portioning, an inaccurate recipe, or stock leaving' +
      ' without a sale — rather than a bad day.',
  },
}

/**
 * Grade the day, or explain why it cannot be graded.
 *
 * The refusals are checked in order of how deep the fault runs: missing recipes
 * before a missing count, because counting a shelf whose usage is never deducted
 * still produces a meaningless comparison.
 */
export function judgeVariance(input: VarianceVerdictInput): VarianceVerdict {
  const refusal =
    input.dishesWithRecipe <= 0
      ? UNJUDGEABLE.noRecipes
      : input.countedCount <= 0
        ? UNJUDGEABLE.noCount
        : input.cogs <= 0
          ? UNJUDGEABLE.noUsage
          : null

  if (refusal) {
    return { level: null, percent: null, ...refusal }
  }

  const percent = (input.shrinkageCost / input.cogs) * 100

  return { level: levelFor(percent), percent, ...GRADED[levelFor(percent)] }
}
