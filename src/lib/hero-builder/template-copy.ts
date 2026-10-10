// ---------------------------------------------------------------------------
// Hero Builder v5 — the words and pictures a gallery template can be filled
// with. A template builder that takes a `TemplateCopy` renders its own sample
// copy when called without one (the gallery), and a store's copy when the
// onboarding build fills it (`src/lib/onboarding/launch-heroes.ts`).
// ---------------------------------------------------------------------------

export interface TemplatePhoto {
  url: string
  alt: string
}

/** One icon line ("Open daily, 9 AM – 9 PM"). An empty list drops the widget. */
export interface TemplateHighlight {
  icon: string
  label: string
}

/** A titled card (a step, a feature). */
export interface TemplateCard {
  title: string
  body: string
}

export interface TemplateCopy {
  /** Eyebrow / badge above the headline. */
  kicker: string
  /** May carry `*emphasis*` markup. */
  headline: string
  body: string
  highlights: readonly TemplateHighlight[]
  primaryCta: string
  secondaryCta: string
  /** In the order the template places them; each template documents how many it uses. */
  photos: readonly TemplatePhoto[]
  /** Cards under the hero (how it works). */
  cards?: readonly TemplateCard[]
  /** A line under the headline that signs it (press quote). */
  signature?: string
}

/**
 * The solid color a template's top band is painted, and the color its accent
 * text uses on it: a storefront header painted the same reads as part of the
 * hero instead of a white strip above it.
 */
export interface TemplateBand {
  background: string
  title: string
}

/** The photo at `index`, or the template's own sample photo when the copy has fewer. */
export function photoAt(copy: TemplateCopy, sample: TemplateCopy, index: number): TemplatePhoto {
  return copy.photos[index] ?? sample.photos[index]
}
