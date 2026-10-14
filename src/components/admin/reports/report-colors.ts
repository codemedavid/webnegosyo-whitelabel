/**
 * Chart colour roles for the report primitives (plan §4 "Colour semantics").
 * Every mark clears 3:1 on white (WCAG 1.4.11). Plain module so server and
 * client components can both import it.
 */

/** This period's columns. Coral on white ≈ 3.4:1. */
export const SERIES_CURRENT = '#E4572E'
/** The comparison period's dashed line. wn-stone on white ≈ 5.9:1. */
export const SERIES_COMPARE = '#6B655B'

/**
 * Payment-method segments, in the order parts arrive. Distinct hues that all
 * clear 3:1 on white and sit 2px apart, so neighbours read as separate marks.
 * Grey is deliberately absent: grey + hatching means "Unpaid".
 */
export const CATEGORY_COLORS = [
  '#1D1815', // ink
  '#E4572E', // coral
  '#0F766E', // teal
  '#2563EB', // blue
  '#B45309', // amber-700
  '#7C3AED', // violet
  '#BE185D', // pink-700
  '#15803D', // green-700
] as const

/** Unpaid: neutral, hatched, never a method colour. */
export const UNPAID_PATTERN =
  'repeating-linear-gradient(135deg, #A39C90 0 3px, #E5E0D6 3px 6px)'

/** Heatmap ramp, quiet → busy. Index 0 = no activity. */
export const HEAT_STEPS = ['#F4F2EE', '#FBEAE3', '#F6C3AE', '#EE8F6C', '#E4572E', '#B23E1B'] as const

export function categoryColor(index: number): string {
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length]
}
