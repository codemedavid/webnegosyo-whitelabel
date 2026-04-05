// ---------------------------------------------------------------------------
// Hero Block Designer v4 — Starter Templates
// ---------------------------------------------------------------------------

import type {
  HeroBlockDesign,
  BlockSection,
  ElementAnimation,
  AnimationType,
  BlockWidget,
  TextWidgetProps,
  ButtonWidgetProps,
} from '@/types/hero-block-designer'

import {
  createSection,
  createTextWidget,
  createImageWidget,
  createButtonWidget,
  createVideoWidget,
  createSpacerWidget,
  createCountdownWidget,
  createSocialProofWidget,
  NO_ANIMATION,
} from '@/lib/hero-block-defaults'

// ── Template Interface ──────────────────────────────────────────────────────

export interface BlockHeroTemplate {
  id: string
  name: string
  description: string
  thumbnail: string // CSS gradient for preview
  design: HeroBlockDesign
}

// ── Internal Helpers ────────────────────────────────────────────────────────

/** Shorthand for creating an ElementAnimation */
function anim(type: AnimationType, duration = 600, delay = 0): ElementAnimation {
  return { type, duration, delay }
}

/** Creates a HeroBlockDesign v4 with given sections and optional global background */
function wrapDesign(sections: BlockSection[], bg?: string): HeroBlockDesign {
  return {
    version: 4,
    sections,
    globalStyles: {
      backgroundColor: bg ?? '#ffffff',
      maxWidth: 1200,
    },
  }
}

/** Creates a text widget with merged overrides on the default TextWidgetProps */
function textWidget(overrides: Partial<TextWidgetProps> & { content: string }): BlockWidget {
  const w = createTextWidget()
  w.props = { ...(w.props as TextWidgetProps), ...overrides }
  return w
}

/** Creates a button widget with merged overrides on the default ButtonWidgetProps */
function buttonWidget(overrides?: Partial<ButtonWidgetProps>): BlockWidget {
  const w = createButtonWidget()
  if (overrides) {
    w.props = { ...(w.props as ButtonWidgetProps), ...overrides }
  }
  return w
}

// ── 1. Classic Centered ─────────────────────────────────────────────────────

function classicCentered(): BlockHeroTemplate {
  const section = createSection([100])
  const col = section.columns[0]

  col.settings.horizontalAlign = 'center'

  const heading = textWidget({
    content: 'Welcome to Our Restaurant',
    fontSize: 56,
    fontWeight: 700,
    color: '#111827',
  })
  heading.animation = anim('fadeIn', 600, 0)

  const subtitle = textWidget({
    content: 'Delicious food delivered to your doorstep',
    fontSize: 20,
    fontWeight: 400,
    color: '#6B7280',
  })
  subtitle.animation = anim('fadeIn', 600, 200)

  const spacer = createSpacerWidget()
  ;(spacer.props as { kind: 'spacer'; height: number }).height = 24
  spacer.animation = { ...NO_ANIMATION }

  const btn = buttonWidget()
  btn.animation = anim('slideUp', 600, 400)

  col.widgets = [heading, subtitle, spacer, btn]

  section.settings.padding = { top: 80, right: 20, bottom: 80, left: 20 }
  section.settings.minHeight = 500

  return {
    id: 'classic-centered',
    name: 'Classic Centered',
    description: 'Clean centered layout with heading, subtitle, and call-to-action button',
    thumbnail: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    design: wrapDesign([section]),
  }
}

// ── 2. Split Layout ─────────────────────────────────────────────────────────

function splitLayout(): BlockHeroTemplate {
  const section = createSection([50, 50])
  const left = section.columns[0]
  const right = section.columns[1]

  left.settings.verticalAlign = 'center'
  right.settings.verticalAlign = 'center'

  const heading = textWidget({
    content: 'Fresh & Delicious',
    fontSize: 48,
    fontWeight: 700,
    color: '#111827',
    textAlign: 'left',
  })
  heading.animation = anim('slideRight', 600, 0)

  const description = textWidget({
    content: 'Savor the taste of freshly prepared meals made with the finest ingredients.',
    fontSize: 18,
    fontWeight: 400,
    color: '#6B7280',
    textAlign: 'left',
  })
  description.animation = anim('slideRight', 600, 200)

  const spacer = createSpacerWidget()
  ;(spacer.props as { kind: 'spacer'; height: number }).height = 24
  spacer.animation = { ...NO_ANIMATION }

  const btn = buttonWidget()
  btn.alignment = 'left'
  btn.animation = anim('slideUp', 600, 400)

  left.widgets = [heading, description, spacer, btn]

  const image = createImageWidget()
  image.width = 'full'
  image.animation = anim('fadeIn', 800, 200)

  right.widgets = [image]

  section.settings.padding = { top: 60, right: 20, bottom: 60, left: 20 }
  section.settings.minHeight = 500

  return {
    id: 'split-layout',
    name: 'Split Layout',
    description: 'Two-column layout with text on the left and image on the right',
    thumbnail: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
    design: wrapDesign([section]),
  }
}

// ── 3. Full-Screen Image ────────────────────────────────────────────────────

function fullScreenImage(): BlockHeroTemplate {
  const section = createSection([100])
  const col = section.columns[0]

  col.settings.horizontalAlign = 'center'

  const heading = textWidget({
    content: 'Experience Culinary Excellence',
    fontSize: 60,
    fontWeight: 700,
    color: '#FFFFFF',
    textShadow: '0 2px 8px rgba(0,0,0,0.4)',
  })
  heading.animation = anim('fadeIn', 800, 0)

  const subtitle = textWidget({
    content: 'A dining experience like no other',
    fontSize: 22,
    fontWeight: 400,
    color: '#FFFFFF',
    textShadow: '0 1px 4px rgba(0,0,0,0.3)',
  })
  subtitle.animation = anim('fadeIn', 600, 300)

  const spacer = createSpacerWidget()
  ;(spacer.props as { kind: 'spacer'; height: number }).height = 32
  spacer.animation = { ...NO_ANIMATION }

  const btn = buttonWidget({
    backgroundColor: '#FFFFFF',
    textColor: '#111827',
    borderRadius: 8,
  })
  btn.animation = anim('slideUp', 600, 500)

  col.widgets = [heading, subtitle, spacer, btn]

  section.settings.contentWidth = 1200
  section.settings.minHeight = 600
  section.settings.background = { type: 'color', color: 'rgba(0,0,0,0.5)' }
  section.settings.padding = { top: 80, right: 20, bottom: 80, left: 20 }

  return {
    id: 'full-screen-image',
    name: 'Full-Screen Image',
    description: 'Immersive full-screen hero with overlay text on a dark background',
    thumbnail: 'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)',
    design: wrapDesign([section], '#000000'),
  }
}

// ── 4. Minimal Text ─────────────────────────────────────────────────────────

function minimalText(): BlockHeroTemplate {
  const section = createSection([100])
  const col = section.columns[0]

  col.settings.horizontalAlign = 'center'

  const heading = textWidget({
    content: 'Good Food.',
    fontSize: 72,
    fontWeight: 800,
    color: '#111827',
    letterSpacing: -2,
  })
  heading.animation = anim('fadeIn', 800, 0)

  col.widgets = [heading]

  section.settings.minHeight = 400
  section.settings.padding = { top: 120, right: 20, bottom: 120, left: 20 }

  return {
    id: 'minimal-text',
    name: 'Minimal Text',
    description: 'Bold, minimal design with a single impactful heading',
    thumbnail: 'linear-gradient(135deg, #fafafa 0%, #e0e0e0 100%)',
    design: wrapDesign([section]),
  }
}

// ── 5. Bold CTA ─────────────────────────────────────────────────────────────

function boldCta(): BlockHeroTemplate {
  const section = createSection([100])
  const col = section.columns[0]

  col.settings.horizontalAlign = 'center'

  const heading = textWidget({
    content: 'Order Your Favorites Now',
    fontSize: 52,
    fontWeight: 700,
    color: '#FFFFFF',
    textShadow: '0 2px 6px rgba(0,0,0,0.3)',
  })
  heading.animation = anim('slideUp', 600, 0)

  const subtitle = textWidget({
    content: 'Fast delivery. Fresh ingredients. Unforgettable taste.',
    fontSize: 20,
    fontWeight: 400,
    color: '#FFFFFF',
  })
  subtitle.animation = anim('fadeIn', 600, 200)

  const spacer = createSpacerWidget()
  ;(spacer.props as { kind: 'spacer'; height: number }).height = 32
  spacer.animation = { ...NO_ANIMATION }

  const btn = buttonWidget({
    backgroundColor: '#FFFFFF',
    textColor: '#6D28D9',
    borderRadius: 50,
  })
  btn.animation = anim('scaleIn', 600, 400)

  const socialProof = createSocialProofWidget()
  socialProof.animation = anim('fadeIn', 600, 600)

  col.widgets = [heading, subtitle, spacer, btn, socialProof]

  section.settings.minHeight = 500
  section.settings.background = {
    type: 'gradient',
    gradient: 'linear-gradient(135deg, #6D28D9 0%, #4F46E5 100%)',
  }
  section.settings.padding = { top: 80, right: 20, bottom: 80, left: 20 }

  return {
    id: 'bold-cta',
    name: 'Bold CTA',
    description: 'Vibrant gradient background with a bold call-to-action and social proof',
    thumbnail: 'linear-gradient(135deg, #6D28D9 0%, #4F46E5 100%)',
    design: wrapDesign([section]),
  }
}

// ── 6. Video Hero ───────────────────────────────────────────────────────────

function videoHero(): BlockHeroTemplate {
  const section = createSection([100])
  const col = section.columns[0]

  col.settings.horizontalAlign = 'center'

  const video = createVideoWidget()
  video.width = 'full'
  video.animation = anim('fadeIn', 800, 0)

  const heading = textWidget({
    content: 'Watch Our Story',
    fontSize: 48,
    fontWeight: 700,
    color: '#FFFFFF',
    textShadow: '0 2px 8px rgba(0,0,0,0.5)',
  })
  heading.animation = anim('slideUp', 600, 300)

  const spacer = createSpacerWidget()
  ;(spacer.props as { kind: 'spacer'; height: number }).height = 24
  spacer.animation = { ...NO_ANIMATION }

  const btn = buttonWidget({
    backgroundColor: '#FFFFFF',
    textColor: '#111827',
  })
  btn.animation = anim('slideUp', 600, 500)

  col.widgets = [video, heading, spacer, btn]

  section.settings.contentWidth = 1200
  section.settings.minHeight = 600
  section.settings.background = { type: 'color', color: '#111827' }
  section.settings.padding = { top: 60, right: 20, bottom: 60, left: 20 }

  return {
    id: 'video-hero',
    name: 'Video Hero',
    description: 'Dark-themed hero section with a prominent video and overlay text',
    thumbnail: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
    design: wrapDesign([section], '#000000'),
  }
}

// ── 7. Restaurant Showcase ──────────────────────────────────────────────────

function restaurantShowcase(): BlockHeroTemplate {
  const section = createSection([55, 45])
  const left = section.columns[0]
  const right = section.columns[1]

  left.settings.verticalAlign = 'center'
  right.settings.verticalAlign = 'center'

  const heading = textWidget({
    content: 'Taste the Tradition',
    fontSize: 48,
    fontWeight: 700,
    color: '#92400E',
    textAlign: 'left',
  })
  heading.animation = anim('slideRight', 600, 0)

  const tagline = textWidget({
    content: 'Homemade recipes passed down through generations',
    fontSize: 18,
    fontWeight: 400,
    color: '#B45309',
    textAlign: 'left',
  })
  tagline.animation = anim('slideRight', 600, 200)

  const spacer = createSpacerWidget()
  ;(spacer.props as { kind: 'spacer'; height: number }).height = 24
  spacer.animation = { ...NO_ANIMATION }

  const btn = buttonWidget({
    backgroundColor: '#92400E',
    textColor: '#FFFFFF',
    borderRadius: 8,
  })
  btn.alignment = 'left'
  btn.animation = anim('slideUp', 600, 400)

  left.widgets = [heading, tagline, spacer, btn]

  const image = createImageWidget()
  image.width = 'full'
  ;(image.props as { kind: 'image'; borderRadius: number }).borderRadius = 16
  image.animation = anim('slideLeft', 800, 200)

  right.widgets = [image]

  section.settings.background = { type: 'color', color: '#FEF3C7' }
  section.settings.padding = { top: 60, right: 20, bottom: 60, left: 20 }
  section.settings.minHeight = 500

  return {
    id: 'restaurant-showcase',
    name: 'Restaurant Showcase',
    description: 'Warm two-column layout perfect for showcasing restaurant ambiance',
    thumbnail: 'linear-gradient(135deg, #FEF3C7 0%, #F59E0B 100%)',
    design: wrapDesign([section]),
  }
}

// ── 8. Promo Countdown ──────────────────────────────────────────────────────

function promoCountdown(): BlockHeroTemplate {
  const section = createSection([100])
  const col = section.columns[0]

  col.settings.horizontalAlign = 'center'

  const heading = textWidget({
    content: 'Limited Time Offer!',
    fontSize: 52,
    fontWeight: 700,
    color: '#FFFFFF',
    textShadow: '0 2px 6px rgba(0,0,0,0.3)',
  })
  heading.animation = anim('bounce', 800, 0)

  const spacer1 = createSpacerWidget()
  ;(spacer1.props as { kind: 'spacer'; height: number }).height = 24
  spacer1.animation = { ...NO_ANIMATION }

  const countdown = createCountdownWidget()
  const cdProps = countdown.props as {
    kind: 'countdown'
    color: string
    separatorColor: string
    fontSize: number
  }
  cdProps.color = '#FFFFFF'
  cdProps.separatorColor = '#FFFFFF'
  cdProps.fontSize = 42
  countdown.animation = anim('scaleIn', 600, 300)

  const spacer2 = createSpacerWidget()
  ;(spacer2.props as { kind: 'spacer'; height: number }).height = 32
  spacer2.animation = { ...NO_ANIMATION }

  const btn = buttonWidget({
    backgroundColor: '#FFFFFF',
    textColor: '#DC2626',
    borderRadius: 50,
    text: 'Grab the Deal',
  })
  btn.animation = anim('slideUp', 600, 500)

  col.widgets = [heading, spacer1, countdown, spacer2, btn]

  section.settings.minHeight = 500
  section.settings.background = {
    type: 'gradient',
    gradient: 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)',
  }
  section.settings.padding = { top: 80, right: 20, bottom: 80, left: 20 }

  return {
    id: 'promo-countdown',
    name: 'Promo Countdown',
    description: 'Urgency-driven layout with a countdown timer for limited-time promotions',
    thumbnail: 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)',
    design: wrapDesign([section]),
  }
}

// ── Export ───────────────────────────────────────────────────────────────────

export const blockHeroTemplates: BlockHeroTemplate[] = [
  classicCentered(),
  splitLayout(),
  fullScreenImage(),
  minimalText(),
  boldCta(),
  videoHero(),
  restaurantShowcase(),
  promoCountdown(),
]
