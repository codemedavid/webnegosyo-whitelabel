// ---------------------------------------------------------------------------
// Welcome Builder starting designs. Every template is a complete, publishable
// welcome page: it adapts to phones, follows the store's theme where it can,
// greets with `{store}`, and carries a way to start ordering on every device
// (pinned by tests/unit/welcome-builder/templates.test.ts).
// ---------------------------------------------------------------------------

import { buildCafeMorning, buildClassicWelcome, buildFreshStart, buildJustTheButton, buildPromoFirst, buildSplitPhoto } from './templates-light'
import { buildBoldPoster, buildDeliveryFirst, buildFineDining, buildLateNight, buildPhotoCover, buildVideoWelcome } from './templates-bold'
import type { HeroDesignV5 } from '@/lib/hero-builder/types'

/** Gallery filter order. */
export const WELCOME_TEMPLATE_CATEGORIES = ['simple', 'photo', 'cafe', 'bold', 'promo'] as const
export type WelcomeTemplateCategory = (typeof WELCOME_TEMPLATE_CATEGORIES)[number]

export interface WelcomeTemplate {
  id: string
  name: string
  description: string
  category: WelcomeTemplateCategory
  build: () => HeroDesignV5
}

export const WELCOME_TEMPLATES: readonly WelcomeTemplate[] = [
  {
    id: 'classic',
    name: 'Classic welcome',
    description: 'Your logo, a friendly greeting and one tile per way to order. The familiar screen, now yours to restyle.',
    category: 'simple',
    build: buildClassicWelcome,
  },
  {
    id: 'just-the-button',
    name: 'Just the button',
    description: 'Logo, store name and a single Start ordering button. The order type is asked at checkout.',
    category: 'simple',
    build: buildJustTheButton,
  },
  {
    id: 'photo-cover',
    name: 'Photo cover',
    description: 'A full-screen food photo with glass tiles on top. Swap in your own best shot.',
    category: 'photo',
    build: buildPhotoCover,
  },
  {
    id: 'split-photo',
    name: 'Split photo',
    description: 'Your dining room on one side, the greeting and choices on the other. Stacks neatly on phones.',
    category: 'photo',
    build: buildSplitPhoto,
  },
  {
    id: 'video',
    name: 'Kitchen video',
    description: 'A looping, muted video behind one big button. Great for grills, bars and open kitchens.',
    category: 'photo',
    build: buildVideoWelcome,
  },
  {
    id: 'cafe-morning',
    name: 'Café morning',
    description: 'Cream and cocoa, a round coffee photo and a tidy list of choices in a serif voice.',
    category: 'cafe',
    build: buildCafeMorning,
  },
  {
    id: 'fresh-start',
    name: 'Fresh start',
    description: 'Soft green, three perks and one rounded button. Made for salad bars and healthy kitchens.',
    category: 'cafe',
    build: buildFreshStart,
  },
  {
    id: 'bold-poster',
    name: 'Bold poster',
    description: 'Giant uppercase words on your brand colour. Loud, confident, impossible to miss.',
    category: 'bold',
    build: buildBoldPoster,
  },
  {
    id: 'late-night',
    name: 'Late night neon',
    description: 'Deep purple glow, neon type and a sign-style list. For bars and late-night food.',
    category: 'bold',
    build: buildLateNight,
  },
  {
    id: 'fine-dining',
    name: 'Fine dining',
    description: 'Black and gold, a classic serif and plenty of room to breathe.',
    category: 'bold',
    build: buildFineDining,
  },
  {
    id: 'promo-first',
    name: 'Promos first',
    description: 'A swipeable slideshow of this week’s deals above the order choices.',
    category: 'promo',
    build: buildPromoFirst,
  },
  {
    id: 'delivery-first',
    name: 'Delivery first',
    description: 'Lead with your delivery promise and perks, with the choices in a card beside it.',
    category: 'promo',
    build: buildDeliveryFirst,
  },
]

export function findWelcomeTemplate(id: string): WelcomeTemplate | undefined {
  return WELCOME_TEMPLATES.find((template) => template.id === id)
}
