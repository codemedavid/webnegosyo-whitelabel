/**
 * Helpers for the Page Designer part-marking tests: which `data-part`
 * values exist (src/lib/page-designer/parts.ts), the selector a block's
 * listed part id stands for, and the marks a rendered tree carries.
 */

import { PARTS } from '@/lib/page-designer/parts'

/** Part ids that are a STATE of another part (chosen, hover, current, done), not a mark of their own. */
const STATE_SUFFIX = /_(on|hover|done)$/

/** Every `data-part` value a component may write (`option_label` → `option-label`). */
export const PART_MARKS: ReadonlySet<string> = new Set(
  PARTS.filter((part) => !STATE_SUFFIX.test(part.id)).map((part) => part.id.replace(/_/g, '-')),
)

/** Parts a static render can't show (a pointer over it, a chosen icon). */
export const UNSHOWABLE_PARTS: ReadonlySet<string> = new Set(['option_hover', 'icon_on'])

/** The DOM selector that proves a listed part is drawn. */
export function partSelector(id: string): string {
  if (id === 'option_on') return '[data-part="option"][data-on]'
  if (id === 'step_on') return '[data-part="step"][data-on]'
  if (id === 'step_done') return '[data-part="step"][data-done]'
  return `[data-part="${id.replace(/_/g, '-')}"]`
}

/** The `data-part` values in `root` that no part defines. */
export function unknownMarks(root: ParentNode): string[] {
  return Array.from(root.querySelectorAll('[data-part]'))
    .map((el) => el.getAttribute('data-part') ?? '')
    .filter((mark) => !PART_MARKS.has(mark))
}

/** The listed parts `roots` (one render per scenario) never draw. */
export function missingParts(parts: readonly string[], roots: readonly ParentNode[]): string[] {
  return parts.filter((id) => !UNSHOWABLE_PARTS.has(id) && !roots.some((root) => root.querySelector(partSelector(id))))
}
