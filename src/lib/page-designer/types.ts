// ---------------------------------------------------------------------------
// Page Designer — the checkout, thank-you and order-tracking pages built in
// the Hero Builder editor. A page mixes the builder's free widgets (heading,
// text, image…) with the page's own working parts ("page blocks"): the
// payment picker, the order status, the place-order button. Each page lists
// its blocks in a registry (blocks-<page>.ts); the page supplies their
// renderers at run time.
// ---------------------------------------------------------------------------

import type { WidgetKind } from '@/lib/hero-builder/types'

export type PageId = 'checkout' | 'confirmation' | 'tracking'

/** One piece of wording inside a block the owner can rewrite. */
export interface BlockTextSlot {
  key: string
  /** Inspector label, e.g. "Button text". */
  label: string
  /** The built-in wording used when the owner and the store label are both blank. */
  fallback: string
  /** The Branding Studio label this slot shares, so earlier label edits keep working. */
  labelKey?: string
  maxLength: number
  /** Inspector shows a textarea. */
  multiline?: boolean
  hint?: string
}

export type BlockOption =
  | { key: string; label: string; type: 'boolean'; default: boolean; hint?: string }
  | { key: string; label: string; type: 'choice'; default: string; choices: readonly { value: string; label: string }[]; hint?: string }

export interface PageBlockDef {
  /** `<page>.<name>`, stable forever: stored in designs. */
  id: string
  page: PageId
  label: string
  description: string
  /** lucide-react icon name for the Add panel. */
  icon: string
  /**
   * Required blocks keep the page working (no way to pay or to see the order
   * otherwise). They cannot be removed, publishing refuses a design that
   * hides one on any device, and the storefront appends any that are missing.
   * A required block that does not apply (no scheduling, Messenger off)
   * simply renders nothing.
   */
  required: boolean
  texts: readonly BlockTextSlot[]
  options: readonly BlockOption[]
}

export interface PageState {
  id: string
  label: string
}

export interface PageToken {
  token: string
  label: string
}

export interface PageMeta {
  id: PageId
  label: string
  /** Admin route segment: /admin/page-designer/<slug>. */
  slug: string
  description: string
  /** Show-when states, in the order the editor's state switcher lists them. Empty = no states. */
  states: readonly PageState[]
  /** `{token}`s text widgets and block texts may use. */
  tokens: readonly PageToken[]
  /** Free widget kinds this page offers (page blocks always allowed). */
  freeKinds: readonly WidgetKind[]
}
