// ---------------------------------------------------------------------------
// Hero Section Designer — Starter templates
// ---------------------------------------------------------------------------

import type {
  HeroDesign,
  HeroElement,
} from '@/types/hero-designer'
import {
  createAnimatedBgElement,
  createButtonElement,
  createCountdownElement,
  createImageElement,
  createShapeElement,
  createSocialProofElement,
  createTextElement,
  createVideoElement,
  defaultLayout,
  NO_ANIMATION,
} from '@/lib/hero-designer-defaults'

// ── Template interface ─────────────────────────────────────────────────────

export interface HeroTemplate {
  id: string
  name: string
  description: string
  /** CSS gradient string used as a visual thumbnail preview */
  thumbnail: string
  design: HeroDesign
}

// ── Helper ─────────────────────────────────────────────────────────────────

function design(
  desktopHeight: number,
  mobileHeight: number,
  bg: string,
  elements: HeroElement[],
): HeroDesign {
  return {
    version: 1,
    canvas: {
      desktop: { width: 1440, height: desktopHeight },
      mobile: { width: 390, height: mobileHeight },
    },
    backgroundColor: bg,
    elements,
  }
}

// ── 1. Classic Centered ────────────────────────────────────────────────────

function classicCentered(): HeroTemplate {
  return {
    id: 'classic-centered',
    name: 'Classic Centered',
    description: 'Centered heading, subtitle, and call-to-action button on a clean white background.',
    thumbnail: 'linear-gradient(180deg, #ffffff 0%, #f3f4f6 100%)',
    design: design(500, 450, '#ffffff', [
      createTextElement({
        label: 'Heading',
        zIndex: 1,
        desktop: defaultLayout({ x: 15, y: 20, width: 70, height: -1 }),
        mobile: defaultLayout({ x: 5, y: 15, width: 90, height: -1 }),
        animation: { type: 'fadeIn', duration: 600, delay: 0 },
        props: {
          kind: 'text',
          content: 'Delicious Food, Delivered Fast',
          fontFamily: 'Inter',
          fontSize: 52,
          fontWeight: 700,
          lineHeight: 1.15,
          letterSpacing: -0.5,
          color: '#1a1a1a',
          textAlign: 'center',
          textShadow: '',
          bold: false,
          italic: false,
          underline: false,
        },
      }),
      createTextElement({
        label: 'Subtitle',
        zIndex: 1,
        desktop: defaultLayout({ x: 20, y: 45, width: 60, height: -1 }),
        mobile: defaultLayout({ x: 10, y: 42, width: 80, height: -1 }),
        animation: { type: 'fadeIn', duration: 600, delay: 200 },
        props: {
          kind: 'text',
          content: 'Order from your favorite local restaurants with just a few taps.',
          fontFamily: 'Inter',
          fontSize: 20,
          fontWeight: 400,
          lineHeight: 1.5,
          letterSpacing: 0,
          color: '#6b7280',
          textAlign: 'center',
          textShadow: '',
          bold: false,
          italic: false,
          underline: false,
        },
      }),
      createButtonElement({
        label: 'CTA Button',
        zIndex: 1,
        desktop: defaultLayout({ x: 35, y: 65, width: 30, height: 8 }),
        mobile: defaultLayout({ x: 15, y: 65, width: 70, height: 8 }),
        animation: { type: 'slideUp', duration: 500, delay: 400 },
      }),
    ]),
  }
}

// ── 2. Split Layout ────────────────────────────────────────────────────────

function splitLayout(): HeroTemplate {
  return {
    id: 'split-layout',
    name: 'Split Layout',
    description: 'Text content on the left with an image on the right. Stacks vertically on mobile.',
    thumbnail: 'linear-gradient(90deg, #ffffff 50%, #fef3c7 50%)',
    design: design(550, 600, '#ffffff', [
      createTextElement({
        label: 'Heading',
        zIndex: 1,
        desktop: defaultLayout({ x: 5, y: 20, width: 42, height: -1 }),
        mobile: defaultLayout({ x: 5, y: 52, width: 90, height: -1 }),
        animation: { type: 'slideRight', duration: 600, delay: 0 },
        props: {
          kind: 'text',
          content: 'Fresh Meals Made With Love',
          fontFamily: 'Inter',
          fontSize: 48,
          fontWeight: 700,
          lineHeight: 1.15,
          letterSpacing: -0.5,
          color: '#1a1a1a',
          textAlign: 'left',
          textShadow: '',
          bold: false,
          italic: false,
          underline: false,
        },
      }),
      createTextElement({
        label: 'Description',
        zIndex: 1,
        desktop: defaultLayout({ x: 5, y: 48, width: 40, height: -1 }),
        mobile: defaultLayout({ x: 5, y: 68, width: 90, height: -1 }),
        animation: { type: 'slideRight', duration: 600, delay: 200 },
        props: {
          kind: 'text',
          content: 'Browse our menu and get your favorites delivered straight to your door.',
          fontFamily: 'Inter',
          fontSize: 18,
          fontWeight: 400,
          lineHeight: 1.6,
          letterSpacing: 0,
          color: '#6b7280',
          textAlign: 'left',
          textShadow: '',
          bold: false,
          italic: false,
          underline: false,
        },
      }),
      createButtonElement({
        label: 'CTA Button',
        zIndex: 1,
        desktop: defaultLayout({ x: 5, y: 68, width: 22, height: 7 }),
        mobile: defaultLayout({ x: 5, y: 82, width: 90, height: 8 }),
        animation: { type: 'slideUp', duration: 500, delay: 400 },
      }),
      createImageElement({
        label: 'Hero Image',
        zIndex: 0,
        desktop: defaultLayout({ x: 52, y: 5, width: 45, height: 90 }),
        mobile: defaultLayout({ x: 5, y: 2, width: 90, height: 45 }),
        animation: { type: 'fadeIn', duration: 700, delay: 100 },
        props: {
          kind: 'image',
          src: '',
          alt: 'Hero image',
          objectFit: 'cover',
          borderRadius: 12,
          opacity: 1,
        },
      }),
    ]),
  }
}

// ── 3. Full-Screen Image ───────────────────────────────────────────────────

function fullScreenImage(): HeroTemplate {
  return {
    id: 'full-screen-image',
    name: 'Full-Screen Image',
    description: 'Full-canvas background image with a dark overlay and white text content.',
    thumbnail: 'linear-gradient(180deg, #1f2937 0%, #111827 100%)',
    design: design(600, 500, '#000000', [
      createImageElement({
        label: 'Background Image',
        zIndex: 0,
        desktop: defaultLayout({ x: 0, y: 0, width: 100, height: 100 }),
        mobile: defaultLayout({ x: 0, y: 0, width: 100, height: 100 }),
        animation: { ...NO_ANIMATION },
        props: {
          kind: 'image',
          src: '',
          alt: 'Background',
          objectFit: 'cover',
          borderRadius: 0,
          opacity: 1,
        },
      }),
      createShapeElement({
        label: 'Dark Overlay',
        zIndex: 1,
        desktop: defaultLayout({ x: 0, y: 0, width: 100, height: 100 }),
        mobile: defaultLayout({ x: 0, y: 0, width: 100, height: 100 }),
        animation: { ...NO_ANIMATION },
        props: {
          kind: 'shape',
          shapeType: 'rectangle',
          fillColor: '#000000',
          borderWidth: 0,
          borderColor: 'transparent',
          borderRadius: 0,
          opacity: 0.5,
        },
      }),
      createTextElement({
        label: 'Heading',
        zIndex: 2,
        desktop: defaultLayout({ x: 15, y: 25, width: 70, height: -1 }),
        mobile: defaultLayout({ x: 5, y: 20, width: 90, height: -1 }),
        animation: { type: 'fadeIn', duration: 700, delay: 200 },
        props: {
          kind: 'text',
          content: 'Experience Our Cuisine',
          fontFamily: 'Inter',
          fontSize: 56,
          fontWeight: 700,
          lineHeight: 1.15,
          letterSpacing: -0.5,
          color: '#ffffff',
          textAlign: 'center',
          textShadow: '0 2px 8px rgba(0,0,0,0.4)',
          bold: false,
          italic: false,
          underline: false,
        },
      }),
      createTextElement({
        label: 'Subtitle',
        zIndex: 2,
        desktop: defaultLayout({ x: 20, y: 48, width: 60, height: -1 }),
        mobile: defaultLayout({ x: 10, y: 48, width: 80, height: -1 }),
        animation: { type: 'fadeIn', duration: 700, delay: 400 },
        props: {
          kind: 'text',
          content: 'Handcrafted dishes from the finest ingredients, delivered to you.',
          fontFamily: 'Inter',
          fontSize: 20,
          fontWeight: 400,
          lineHeight: 1.5,
          letterSpacing: 0,
          color: '#e5e7eb',
          textAlign: 'center',
          textShadow: '',
          bold: false,
          italic: false,
          underline: false,
        },
      }),
      createButtonElement({
        label: 'CTA Button',
        zIndex: 2,
        desktop: defaultLayout({ x: 35, y: 65, width: 30, height: 8 }),
        mobile: defaultLayout({ x: 15, y: 68, width: 70, height: 8 }),
        animation: { type: 'slideUp', duration: 500, delay: 600 },
        props: {
          kind: 'button',
          text: 'View Menu',
          linkUrl: '',
          linkTarget: '_self',
          backgroundColor: '#FF3B30',
          textColor: '#ffffff',
          borderWidth: 0,
          borderColor: 'transparent',
          borderRadius: 8,
          hoverEffect: 'darken',
          fontSize: 18,
          fontWeight: 600,
        },
      }),
    ]),
  }
}

// ── 4. Minimal Text ────────────────────────────────────────────────────────

function minimalText(): HeroTemplate {
  return {
    id: 'minimal-text',
    name: 'Minimal Text',
    description: 'A single large heading on a clean white background. Pure simplicity.',
    thumbnail: 'linear-gradient(180deg, #fafafa 0%, #ffffff 100%)',
    design: design(400, 350, '#ffffff', [
      createTextElement({
        label: 'Heading',
        zIndex: 0,
        desktop: defaultLayout({ x: 10, y: 30, width: 80, height: -1 }),
        mobile: defaultLayout({ x: 5, y: 25, width: 90, height: -1 }),
        animation: { type: 'fadeIn', duration: 800, delay: 0 },
        props: {
          kind: 'text',
          content: 'Simply Delicious.',
          fontFamily: 'Inter',
          fontSize: 64,
          fontWeight: 700,
          lineHeight: 1.1,
          letterSpacing: -1,
          color: '#1a1a1a',
          textAlign: 'center',
          textShadow: '',
          bold: false,
          italic: false,
          underline: false,
        },
      }),
    ]),
  }
}

// ── 5. Bold CTA ────────────────────────────────────────────────────────────

function boldCta(): HeroTemplate {
  return {
    id: 'bold-cta',
    name: 'Bold CTA',
    description: 'Animated gradient background with a bold headline, subtext, CTA button, and social proof.',
    thumbnail: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    design: design(550, 500, '#1a1a2e', [
      createAnimatedBgElement({
        label: 'Gradient Background',
        zIndex: 0,
        desktop: defaultLayout({ x: 0, y: 0, width: 100, height: 100 }),
        mobile: defaultLayout({ x: 0, y: 0, width: 100, height: 100 }),
        animation: { ...NO_ANIMATION },
        props: {
          kind: 'animated-bg',
          gradientType: 'linear',
          gradientColors: ['#667eea', '#764ba2'],
          gradientAngle: 135,
          patternType: 'none',
          patternOpacity: 0,
          parallax: false,
        },
      }),
      createTextElement({
        label: 'Heading',
        zIndex: 1,
        desktop: defaultLayout({ x: 15, y: 18, width: 70, height: -1 }),
        mobile: defaultLayout({ x: 5, y: 12, width: 90, height: -1 }),
        animation: { type: 'slideUp', duration: 600, delay: 200 },
        props: {
          kind: 'text',
          content: 'Order Anytime, Anywhere',
          fontFamily: 'Inter',
          fontSize: 56,
          fontWeight: 700,
          lineHeight: 1.1,
          letterSpacing: -0.5,
          color: '#ffffff',
          textAlign: 'center',
          textShadow: '',
          bold: false,
          italic: false,
          underline: false,
        },
      }),
      createTextElement({
        label: 'Subtext',
        zIndex: 1,
        desktop: defaultLayout({ x: 20, y: 42, width: 60, height: -1 }),
        mobile: defaultLayout({ x: 10, y: 40, width: 80, height: -1 }),
        animation: { type: 'slideUp', duration: 600, delay: 400 },
        props: {
          kind: 'text',
          content: 'Skip the line. Get your favorites delivered in minutes.',
          fontFamily: 'Inter',
          fontSize: 20,
          fontWeight: 400,
          lineHeight: 1.5,
          letterSpacing: 0,
          color: '#e0d4f7',
          textAlign: 'center',
          textShadow: '',
          bold: false,
          italic: false,
          underline: false,
        },
      }),
      createButtonElement({
        label: 'CTA Button',
        zIndex: 1,
        desktop: defaultLayout({ x: 30, y: 60, width: 40, height: 9 }),
        mobile: defaultLayout({ x: 10, y: 60, width: 80, height: 9 }),
        animation: { type: 'scaleIn', duration: 500, delay: 600 },
        props: {
          kind: 'button',
          text: 'Start Ordering',
          linkUrl: '',
          linkTarget: '_self',
          backgroundColor: '#ffffff',
          textColor: '#4c1d95',
          borderWidth: 0,
          borderColor: 'transparent',
          borderRadius: 12,
          hoverEffect: 'scale',
          fontSize: 20,
          fontWeight: 700,
        },
      }),
      createSocialProofElement({
        label: 'Social Proof',
        zIndex: 1,
        desktop: defaultLayout({ x: 35, y: 80, width: 30, height: 6 }),
        mobile: defaultLayout({ x: 15, y: 80, width: 70, height: 6 }),
        animation: { type: 'fadeIn', duration: 600, delay: 800 },
        props: {
          kind: 'social-proof',
          presetType: 'orders',
          text: 'Orders Completed',
          number: 5000,
          iconName: 'ShoppingBag',
          badgeStyle: 'pill',
          backgroundColor: 'rgba(255,255,255,0.15)',
          textColor: '#ffffff',
        },
      }),
    ]),
  }
}

// ── 6. Video Hero ──────────────────────────────────────────────────────────

function videoHero(): HeroTemplate {
  return {
    id: 'video-hero',
    name: 'Video Hero',
    description: 'Background video with a dark overlay, bold heading, and call-to-action.',
    thumbnail: 'linear-gradient(180deg, #0f172a 0%, #334155 100%)',
    design: design(600, 500, '#000000', [
      createVideoElement({
        label: 'Background Video',
        zIndex: 0,
        desktop: defaultLayout({ x: 0, y: 0, width: 100, height: 100 }),
        mobile: defaultLayout({ x: 0, y: 0, width: 100, height: 100 }),
        animation: { ...NO_ANIMATION },
      }),
      createShapeElement({
        label: 'Dark Overlay',
        zIndex: 1,
        desktop: defaultLayout({ x: 0, y: 0, width: 100, height: 100 }),
        mobile: defaultLayout({ x: 0, y: 0, width: 100, height: 100 }),
        animation: { ...NO_ANIMATION },
        props: {
          kind: 'shape',
          shapeType: 'rectangle',
          fillColor: '#000000',
          borderWidth: 0,
          borderColor: 'transparent',
          borderRadius: 0,
          opacity: 0.5,
        },
      }),
      createTextElement({
        label: 'Heading',
        zIndex: 2,
        desktop: defaultLayout({ x: 15, y: 30, width: 70, height: -1 }),
        mobile: defaultLayout({ x: 5, y: 25, width: 90, height: -1 }),
        animation: { type: 'fadeIn', duration: 700, delay: 300 },
        props: {
          kind: 'text',
          content: 'Taste the Difference',
          fontFamily: 'Inter',
          fontSize: 52,
          fontWeight: 700,
          lineHeight: 1.15,
          letterSpacing: -0.5,
          color: '#ffffff',
          textAlign: 'center',
          textShadow: '0 2px 8px rgba(0,0,0,0.5)',
          bold: false,
          italic: false,
          underline: false,
        },
      }),
      createButtonElement({
        label: 'CTA Button',
        zIndex: 2,
        desktop: defaultLayout({ x: 35, y: 58, width: 30, height: 8 }),
        mobile: defaultLayout({ x: 15, y: 60, width: 70, height: 8 }),
        animation: { type: 'slideUp', duration: 500, delay: 500 },
        props: {
          kind: 'button',
          text: 'Watch & Order',
          linkUrl: '',
          linkTarget: '_self',
          backgroundColor: '#FF3B30',
          textColor: '#ffffff',
          borderWidth: 0,
          borderColor: 'transparent',
          borderRadius: 8,
          hoverEffect: 'darken',
          fontSize: 18,
          fontWeight: 600,
        },
      }),
    ]),
  }
}

// ── 7. Restaurant Showcase ─────────────────────────────────────────────────

function restaurantShowcase(): HeroTemplate {
  return {
    id: 'restaurant-showcase',
    name: 'Restaurant Showcase',
    description: 'Image background with a semi-transparent overlay featuring your restaurant name, tagline, and order button.',
    thumbnail: 'linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.7) 100%), linear-gradient(180deg, #f59e0b 0%, #d97706 100%)',
    design: design(550, 450, '#1a1a1a', [
      createImageElement({
        label: 'Background Image',
        zIndex: 0,
        desktop: defaultLayout({ x: 0, y: 0, width: 100, height: 100 }),
        mobile: defaultLayout({ x: 0, y: 0, width: 100, height: 100 }),
        animation: { ...NO_ANIMATION },
        props: {
          kind: 'image',
          src: '',
          alt: 'Restaurant background',
          objectFit: 'cover',
          borderRadius: 0,
          opacity: 1,
        },
      }),
      createShapeElement({
        label: 'Overlay',
        zIndex: 1,
        desktop: defaultLayout({ x: 0, y: 0, width: 100, height: 100 }),
        mobile: defaultLayout({ x: 0, y: 0, width: 100, height: 100 }),
        animation: { ...NO_ANIMATION },
        props: {
          kind: 'shape',
          shapeType: 'rectangle',
          fillColor: '#000000',
          borderWidth: 0,
          borderColor: 'transparent',
          borderRadius: 0,
          opacity: 0.4,
        },
      }),
      createTextElement({
        label: 'Restaurant Name',
        zIndex: 2,
        desktop: defaultLayout({ x: 10, y: 25, width: 80, height: -1 }),
        mobile: defaultLayout({ x: 5, y: 20, width: 90, height: -1 }),
        animation: { type: 'fadeIn', duration: 700, delay: 200 },
        props: {
          kind: 'text',
          content: 'Your Restaurant Name',
          fontFamily: 'Inter',
          fontSize: 52,
          fontWeight: 700,
          lineHeight: 1.15,
          letterSpacing: -0.5,
          color: '#ffffff',
          textAlign: 'center',
          textShadow: '0 2px 10px rgba(0,0,0,0.5)',
          bold: false,
          italic: false,
          underline: false,
        },
      }),
      createTextElement({
        label: 'Tagline',
        zIndex: 2,
        desktop: defaultLayout({ x: 20, y: 48, width: 60, height: -1 }),
        mobile: defaultLayout({ x: 10, y: 48, width: 80, height: -1 }),
        animation: { type: 'fadeIn', duration: 600, delay: 400 },
        props: {
          kind: 'text',
          content: 'Authentic flavors, unforgettable experience.',
          fontFamily: 'Inter',
          fontSize: 20,
          fontWeight: 400,
          lineHeight: 1.5,
          letterSpacing: 0,
          color: '#e5e7eb',
          textAlign: 'center',
          textShadow: '',
          bold: false,
          italic: false,
          underline: false,
        },
      }),
      createButtonElement({
        label: 'Order Now Button',
        zIndex: 2,
        desktop: defaultLayout({ x: 35, y: 65, width: 30, height: 8 }),
        mobile: defaultLayout({ x: 15, y: 68, width: 70, height: 8 }),
        animation: { type: 'slideUp', duration: 500, delay: 600 },
        props: {
          kind: 'button',
          text: 'Order Now',
          linkUrl: '',
          linkTarget: '_self',
          backgroundColor: '#FF3B30',
          textColor: '#ffffff',
          borderWidth: 0,
          borderColor: 'transparent',
          borderRadius: 8,
          hoverEffect: 'darken',
          fontSize: 18,
          fontWeight: 600,
        },
      }),
    ]),
  }
}

// ── 8. Promo Countdown ─────────────────────────────────────────────────────

function promoCountdown(): HeroTemplate {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)

  return {
    id: 'promo-countdown',
    name: 'Promo Countdown',
    description: 'Limited-time promotion with a countdown timer, bold heading, and call-to-action.',
    thumbnail: 'linear-gradient(180deg, #fef2f2 0%, #fee2e2 100%)',
    design: design(450, 400, '#fefefe', [
      createTextElement({
        label: 'Heading',
        zIndex: 1,
        desktop: defaultLayout({ x: 15, y: 12, width: 70, height: -1 }),
        mobile: defaultLayout({ x: 5, y: 8, width: 90, height: -1 }),
        animation: { type: 'slideDown', duration: 600, delay: 0 },
        props: {
          kind: 'text',
          content: 'Limited Time Offer',
          fontFamily: 'Inter',
          fontSize: 48,
          fontWeight: 700,
          lineHeight: 1.15,
          letterSpacing: -0.5,
          color: '#dc2626',
          textAlign: 'center',
          textShadow: '',
          bold: false,
          italic: false,
          underline: false,
        },
      }),
      createCountdownElement({
        label: 'Countdown Timer',
        zIndex: 1,
        desktop: defaultLayout({ x: 20, y: 38, width: 60, height: 15 }),
        mobile: defaultLayout({ x: 5, y: 35, width: 90, height: 15 }),
        animation: { type: 'scaleIn', duration: 500, delay: 300 },
        props: {
          kind: 'countdown',
          targetDate: tomorrow.toISOString(),
          showDays: true,
          showHours: true,
          showMinutes: true,
          showSeconds: true,
          fontSize: 36,
          color: '#1a1a1a',
          separatorColor: '#dc2626',
        },
      }),
      createButtonElement({
        label: 'CTA Button',
        zIndex: 1,
        desktop: defaultLayout({ x: 30, y: 68, width: 40, height: 9 }),
        mobile: defaultLayout({ x: 10, y: 68, width: 80, height: 9 }),
        animation: { type: 'slideUp', duration: 500, delay: 500 },
        props: {
          kind: 'button',
          text: 'Claim Deal Now',
          linkUrl: '',
          linkTarget: '_self',
          backgroundColor: '#dc2626',
          textColor: '#ffffff',
          borderWidth: 0,
          borderColor: 'transparent',
          borderRadius: 8,
          hoverEffect: 'darken',
          fontSize: 20,
          fontWeight: 700,
        },
      }),
    ]),
  }
}

// ── Exported template list ─────────────────────────────────────────────────

export const heroTemplates: HeroTemplate[] = [
  classicCentered(),
  splitLayout(),
  fullScreenImage(),
  minimalText(),
  boldCta(),
  videoHero(),
  restaurantShowcase(),
  promoCountdown(),
]
