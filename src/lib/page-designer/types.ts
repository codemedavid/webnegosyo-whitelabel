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

/**
 * Where a setting sits in the block inspector, top to bottom: the block's
 * design gallery, its colours, its switches, then the folded "More" group.
 */
export type BlockOptionGroup = 'design' | 'colors' | 'options' | 'advanced'

interface BlockOptionBase {
  key: string
  label: string
  hint?: string
  /** Inspector group; boolean/choice default to `options`, colours to `colors`. */
  group?: BlockOptionGroup
  /** Show the setting only while another option of the block is one of `values` (e.g. columns for tiles only). */
  showWhen?: { key: string; values: readonly (string | boolean)[] }
}

export interface BlockChoice {
  value: string
  label: string
  /** One line under a design in the gallery ("Best for two choices"). */
  hint?: string
}

export type BlockOption =
  | (BlockOptionBase & { type: 'boolean'; default: boolean })
  | (BlockOptionBase & {
      type: 'choice'
      default: string
      choices: readonly BlockChoice[]
      /** `gallery` = picture tiles of the block in each choice (block designs). */
      display?: 'segmented' | 'gallery'
    })
  | (BlockOptionBase & {
      /** A hex colour, or '' = follow the page colours (Look tab / Branding Studio). */
      type: 'color'
      default: ''
      /** The page colour it follows while blank, e.g. "Accent". */
      follows: string
    })
  | (BlockOptionBase & {
      /** An image URL (https), or '' = none. */
      type: 'image'
      default: ''
    })

export type BlockOptionValue = string | boolean

/**
 * Store set-ups that make a removable block essential: without it the order
 * could not go through. The page adds a plain copy back when its need holds.
 */
export type PageNeed = 'order_choice' | 'scheduling' | 'questions' | 'payment' | 'gov_claims' | 'kiosk'

/** Which needs hold for the store right now (absent = no). */
export type PageNeeds = Readonly<Partial<Record<PageNeed, boolean>>>

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
  /**
   * A removable block the page still needs in some stores: when the need
   * holds and the owner removed or hid the block, the page adds it back.
   */
  neededWhen?: PageNeed
  texts: readonly BlockTextSlot[]
  options: readonly BlockOption[]
  /**
   * The parts the block marks with `data-part` beyond the shared card / title /
   * subtitle / body text (see parts.ts), so its Style tab offers exactly them.
   */
  parts?: readonly string[]
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
