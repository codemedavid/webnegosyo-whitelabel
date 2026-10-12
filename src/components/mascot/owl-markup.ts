import { OWL_MARKUP } from './owl-art.generated'

/** The moods the owl can be in; each maps to a moment in the product. */
export const OWL_STATES = [
  'idle', // resting: breathes, blinks, glances around now and then
  'happy', // something went right: a couple of hops, then a happy face
  'thinking', // working on it: looks up, beak closed, "…" dots
  'waiting', // waiting on the owner: looks around, taps a foot
  'sorry', // something broke: guilty face, sweat drop
  'celebrating', // a big win: jumps, wings up, hat pops, confetti
  'sleeping', // nothing happening / store closed: eyes shut, "Z z"
] as const

export type OwlState = (typeof OWL_STATES)[number]

/** Where the owl holds his gaze (screen directions), e.g. up at a headline or down at the answers. */
export const OWL_LOOKS = ['up', 'down', 'left', 'right'] as const

export type OwlLook = (typeof OWL_LOOKS)[number]

/** Rigged parts the state styles animate (each is `class="o-<part>"` in the art). */
export const OWL_PARTS = [
  'owl-figure', 'owl-upper', 'head', 'hat', 'hat-knob', 'tuft-left', 'tuft-right',
  'eye-left', 'eye-right', 'iris-left', 'iris-right', 'lid-left', 'lid-right',
  'eye-happy-left', 'eye-happy-right', 'eye-closed-left', 'eye-closed-right',
  'brow-left', 'brow-right', 'mouth', 'beak-lower', 'wing-left', 'wing-right',
  'neckerchief-tail', 'foot-left', 'foot-right',
  'fx-zz', 'fx-dots', 'fx-sweat', 'fx-sparkles', 'fx-confetti',
] as const

/** Give every id (and every reference to one) a per-instance prefix. */
export function prefixIds(markup: string, prefix: string): string {
  return markup
    .replace(/\sid="([^"]+)"/g, ` id="${prefix}-$1"`)
    .replace(/url\(#([^)]+)\)/g, `url(#${prefix}-$1)`)
    .replace(/href="#([^"]+)"/g, `href="#${prefix}-$1"`)
}

/** Drop the blurred (soft-shading) elements: they cost more than they show at icon size. */
export function toLite(markup: string): string {
  return markup.replace(/<(?:path|ellipse|circle|rect) class="o-soft"[^>]*\/>/g, '')
}

interface OwlMarkupOptions {
  prefix: string
  isLite: boolean
}

export function owlMarkup({ prefix, isLite }: OwlMarkupOptions): string {
  return prefixIds(isLite ? toLite(OWL_MARKUP) : OWL_MARKUP, prefix)
}
