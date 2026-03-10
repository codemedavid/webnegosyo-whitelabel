# Hero Section Designer — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a visual drag-and-drop hero section designer that lets tenant admins create custom hero sections for their menu page, with pre-built templates, element library, responsive editing, and animations.

**Architecture:** Custom canvas engine using `@dnd-kit` (already in project) + absolute percentage-based positioning. 3-panel editor UI (elements/layers | canvas | properties). Hero designs stored as JSON in a `hero_design` JSONB column on the `tenants` table. A `HeroRenderer` component reads the JSON and outputs styled HTML on the customer-facing menu page, replacing the existing simple hero when a design exists.

**Tech Stack:** Next.js 15 App Router, @dnd-kit/core + sortable, Framer Motion, Shadcn UI, Zod, Supabase PostgreSQL, TypeScript strict mode, Tailwind CSS 4

---

## Task 1: Types & Zod Schemas

**Files:**
- Create: `src/types/hero-designer.ts`
- Create: `src/lib/hero-designer-schemas.ts`

**Step 1: Create the TypeScript interfaces file**

Create `src/types/hero-designer.ts`:

```typescript
// Hero Designer — Type definitions for the visual hero section builder

// ─── Spacing ─────────────────────────────────────────────
export interface Spacing {
  top: number
  right: number
  bottom: number
  left: number
}

// ─── Per-breakpoint layout ───────────────────────────────
export interface ElementLayout {
  x: number          // % from left
  y: number          // % from top
  width: number      // % of canvas width
  height: number     // % of canvas height, or -1 for 'auto'
  rotation: number   // degrees
  padding: Spacing
  margin: Spacing
}

// ─── Animation ───────────────────────────────────────────
export type AnimationType = 'fadeIn' | 'slideUp' | 'slideDown' | 'slideLeft' | 'slideRight' | 'scaleIn' | 'bounce' | 'none'

export interface ElementAnimation {
  type: AnimationType
  duration: number   // ms
  delay: number      // ms
}

// ─── Element prop types ──────────────────────────────────
export interface TextProps {
  kind: 'text'
  content: string
  fontFamily: string
  fontSize: number
  fontWeight: number
  lineHeight: number
  letterSpacing: number
  color: string
  textAlign: 'left' | 'center' | 'right'
  textShadow: string
  bold: boolean
  italic: boolean
  underline: boolean
}

export interface ImageProps {
  kind: 'image'
  src: string
  alt: string
  objectFit: 'cover' | 'contain' | 'fill'
  borderRadius: number
  opacity: number
}

export interface ButtonProps {
  kind: 'button'
  text: string
  linkUrl: string
  linkTarget: '_blank' | '_self'
  backgroundColor: string
  textColor: string
  borderWidth: number
  borderColor: string
  borderRadius: number
  hoverEffect: 'darken' | 'lighten' | 'scale' | 'none'
  fontSize: number
  fontWeight: number
}

export interface ShapeProps {
  kind: 'shape'
  shapeType: 'rectangle' | 'circle' | 'rounded-rect'
  fillColor: string
  borderWidth: number
  borderColor: string
  borderRadius: number
  opacity: number
}

export interface DividerProps {
  kind: 'divider'
  orientation: 'horizontal' | 'vertical'
  thickness: number
  color: string
  style: 'solid' | 'dashed' | 'dotted'
}

export interface IconProps {
  kind: 'icon'
  iconName: string   // Lucide icon name
  size: number
  color: string
}

export interface VideoProps {
  kind: 'video'
  videoUrl: string
  autoplay: boolean
  muted: boolean
  loop: boolean
  posterImage: string
}

export interface CountdownProps {
  kind: 'countdown'
  targetDate: string   // ISO 8601
  showDays: boolean
  showHours: boolean
  showMinutes: boolean
  showSeconds: boolean
  fontSize: number
  color: string
  separatorColor: string
}

export interface SocialProofProps {
  kind: 'social-proof'
  presetType: 'orders' | 'merchants' | 'custom'
  text: string
  number: number
  iconName: string
  badgeStyle: 'pill' | 'rounded' | 'square'
  backgroundColor: string
  textColor: string
}

export interface AnimatedBgProps {
  kind: 'animated-bg'
  gradientType: 'linear' | 'radial' | 'none'
  gradientColors: string[]
  gradientAngle: number
  patternType: 'dots' | 'lines' | 'grid' | 'none'
  patternOpacity: number
  parallax: boolean
}

export type ElementProps =
  | TextProps
  | ImageProps
  | ButtonProps
  | ShapeProps
  | DividerProps
  | IconProps
  | VideoProps
  | CountdownProps
  | SocialProofProps
  | AnimatedBgProps

export type HeroElementType = ElementProps['kind']

// ─── Hero element ────────────────────────────────────────
export interface HeroElement {
  id: string
  type: HeroElementType
  label: string
  visible: boolean
  locked: boolean
  zIndex: number
  desktop: ElementLayout
  mobile: ElementLayout
  props: ElementProps
  animation: ElementAnimation
}

// ─── Canvas config ───────────────────────────────────────
export interface CanvasConfig {
  desktop: { width: 1440; height: number }
  mobile: { width: 390; height: number }
}

// ─── Root design object ──────────────────────────────────
export interface HeroDesign {
  version: 1
  canvas: CanvasConfig
  backgroundColor: string
  backgroundImage?: {
    url: string
    opacity: number
    objectFit: 'cover' | 'contain'
  }
  elements: HeroElement[]
}

// ─── Designer state ──────────────────────────────────────
export type Breakpoint = 'desktop' | 'mobile'

export interface DesignerState {
  design: HeroDesign
  selectedElementId: string | null
  activeBreakpoint: Breakpoint
  zoom: number
  showGrid: boolean
  history: HeroDesign[]
  historyIndex: number
}
```

**Step 2: Create the Zod validation schemas file**

Create `src/lib/hero-designer-schemas.ts`:

```typescript
import { z } from 'zod'
import type { HeroDesign } from '@/types/hero-designer'

// Reuse the CSS injection guard from branding
const CSS_INJECTION_CHARS = /[<>"';{}]/
function cssColor() {
  return z.string().refine(
    (val) => val === '' || !CSS_INJECTION_CHARS.test(val),
    { message: 'Color value contains invalid characters' }
  )
}

const spacingSchema = z.object({
  top: z.number().min(0).max(200),
  right: z.number().min(0).max(200),
  bottom: z.number().min(0).max(200),
  left: z.number().min(0).max(200),
})

const elementLayoutSchema = z.object({
  x: z.number().min(-50).max(150),
  y: z.number().min(-50).max(150),
  width: z.number().min(1).max(200),
  height: z.number().min(-1).max(200),
  rotation: z.number().min(-360).max(360),
  padding: spacingSchema,
  margin: spacingSchema,
})

const animationSchema = z.object({
  type: z.enum(['fadeIn', 'slideUp', 'slideDown', 'slideLeft', 'slideRight', 'scaleIn', 'bounce', 'none']),
  duration: z.number().min(0).max(5000),
  delay: z.number().min(0).max(10000),
})

// --- Element prop schemas ---
const textPropsSchema = z.object({
  kind: z.literal('text'),
  content: z.string().max(5000),
  fontFamily: z.string().max(100),
  fontSize: z.number().min(8).max(200),
  fontWeight: z.number().min(100).max(900),
  lineHeight: z.number().min(0.5).max(5),
  letterSpacing: z.number().min(-10).max(50),
  color: cssColor(),
  textAlign: z.enum(['left', 'center', 'right']),
  textShadow: z.string().max(200),
  bold: z.boolean(),
  italic: z.boolean(),
  underline: z.boolean(),
})

const imagePropsSchema = z.object({
  kind: z.literal('image'),
  src: z.string().url().or(z.literal('')),
  alt: z.string().max(500),
  objectFit: z.enum(['cover', 'contain', 'fill']),
  borderRadius: z.number().min(0).max(999),
  opacity: z.number().min(0).max(1),
})

const buttonPropsSchema = z.object({
  kind: z.literal('button'),
  text: z.string().max(200),
  linkUrl: z.string().max(2000),
  linkTarget: z.enum(['_blank', '_self']),
  backgroundColor: cssColor(),
  textColor: cssColor(),
  borderWidth: z.number().min(0).max(20),
  borderColor: cssColor(),
  borderRadius: z.number().min(0).max(999),
  hoverEffect: z.enum(['darken', 'lighten', 'scale', 'none']),
  fontSize: z.number().min(8).max(100),
  fontWeight: z.number().min(100).max(900),
})

const shapePropsSchema = z.object({
  kind: z.literal('shape'),
  shapeType: z.enum(['rectangle', 'circle', 'rounded-rect']),
  fillColor: cssColor(),
  borderWidth: z.number().min(0).max(20),
  borderColor: cssColor(),
  borderRadius: z.number().min(0).max(999),
  opacity: z.number().min(0).max(1),
})

const dividerPropsSchema = z.object({
  kind: z.literal('divider'),
  orientation: z.enum(['horizontal', 'vertical']),
  thickness: z.number().min(1).max(50),
  color: cssColor(),
  style: z.enum(['solid', 'dashed', 'dotted']),
})

const iconPropsSchema = z.object({
  kind: z.literal('icon'),
  iconName: z.string().max(100),
  size: z.number().min(12).max(200),
  color: cssColor(),
})

const videoPropsSchema = z.object({
  kind: z.literal('video'),
  videoUrl: z.string().url().or(z.literal('')),
  autoplay: z.boolean(),
  muted: z.boolean(),
  loop: z.boolean(),
  posterImage: z.string().url().or(z.literal('')),
})

const countdownPropsSchema = z.object({
  kind: z.literal('countdown'),
  targetDate: z.string(),
  showDays: z.boolean(),
  showHours: z.boolean(),
  showMinutes: z.boolean(),
  showSeconds: z.boolean(),
  fontSize: z.number().min(8).max(200),
  color: cssColor(),
  separatorColor: cssColor(),
})

const socialProofPropsSchema = z.object({
  kind: z.literal('social-proof'),
  presetType: z.enum(['orders', 'merchants', 'custom']),
  text: z.string().max(200),
  number: z.number().min(0),
  iconName: z.string().max(100),
  badgeStyle: z.enum(['pill', 'rounded', 'square']),
  backgroundColor: cssColor(),
  textColor: cssColor(),
})

const animatedBgPropsSchema = z.object({
  kind: z.literal('animated-bg'),
  gradientType: z.enum(['linear', 'radial', 'none']),
  gradientColors: z.array(cssColor()).min(0).max(10),
  gradientAngle: z.number().min(0).max(360),
  patternType: z.enum(['dots', 'lines', 'grid', 'none']),
  patternOpacity: z.number().min(0).max(1),
  parallax: z.boolean(),
})

const elementPropsSchema = z.discriminatedUnion('kind', [
  textPropsSchema,
  imagePropsSchema,
  buttonPropsSchema,
  shapePropsSchema,
  dividerPropsSchema,
  iconPropsSchema,
  videoPropsSchema,
  countdownPropsSchema,
  socialProofPropsSchema,
  animatedBgPropsSchema,
])

const heroElementSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['text', 'image', 'button', 'shape', 'divider', 'icon', 'video', 'countdown', 'social-proof', 'animated-bg']),
  label: z.string().max(100),
  visible: z.boolean(),
  locked: z.boolean(),
  zIndex: z.number().min(0).max(999),
  desktop: elementLayoutSchema,
  mobile: elementLayoutSchema,
  props: elementPropsSchema,
  animation: animationSchema,
})

export const heroDesignSchema = z.object({
  version: z.literal(1),
  canvas: z.object({
    desktop: z.object({ width: z.literal(1440), height: z.number().min(100).max(2000) }),
    mobile: z.object({ width: z.literal(390), height: z.number().min(100).max(2000) }),
  }),
  backgroundColor: cssColor(),
  backgroundImage: z.object({
    url: z.string().url(),
    opacity: z.number().min(0).max(1),
    objectFit: z.enum(['cover', 'contain']),
  }).optional(),
  elements: z.array(heroElementSchema).max(50),
})

export type ValidatedHeroDesign = z.infer<typeof heroDesignSchema>
```

**Step 3: Run lint to verify**

Run: `npx eslint src/types/hero-designer.ts src/lib/hero-designer-schemas.ts --no-error-on-unmatched-pattern`

**Step 4: Commit**

```bash
git add src/types/hero-designer.ts src/lib/hero-designer-schemas.ts
git commit -m "feat(hero-designer): add types and Zod validation schemas"
```

---

## Task 2: Database Migration & Type Updates

**Files:**
- Create: Supabase migration (via MCP tool) — `add_hero_design_column`
- Modify: `src/types/database.ts:7-126` — add `hero_design` to Tenant interface
- Modify: `src/types/supabase.ts:1133-1241` — add `hero_design` to tenants Row type

**Step 1: Apply database migration**

Use the Supabase MCP `apply_migration` tool:

```sql
-- Add hero_design JSONB column to tenants table
-- Stores the full visual hero section design as JSON
-- Falls back to existing hero_title/hero_description when null
ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS hero_design JSONB DEFAULT NULL;

-- Add a comment for documentation
COMMENT ON COLUMN tenants.hero_design IS 'Visual hero section design JSON from the hero designer. When set, replaces the simple hero_title/hero_description rendering.';
```

Migration name: `add_hero_design_column`

**Step 2: Add `hero_design` to Tenant interface**

In `src/types/database.ts`, find the hero section fields (around line 49-53) and add after `hero_description_color`:

```typescript
  hero_design?: Record<string, unknown> | null;  // HeroDesign JSON
```

**Step 3: Add `hero_design` to Supabase Row type**

In `src/types/supabase.ts`, find the tenants Row section (around line 1185-1188 near other hero fields) and add:

```typescript
        hero_design: Record<string, unknown> | null
```

Also add matching entries to `Insert` and `Update` types in the same tenants section:

Insert type:
```typescript
        hero_design?: Record<string, unknown> | null
```

Update type:
```typescript
        hero_design?: Record<string, unknown> | null
```

**Step 4: Commit**

```bash
git add src/types/database.ts src/types/supabase.ts
git commit -m "feat(hero-designer): add hero_design JSONB column to tenants"
```

---

## Task 3: Default Element Factories & Templates

**Files:**
- Create: `src/lib/hero-designer-defaults.ts`
- Create: `src/lib/hero-designer-templates.ts`

**Step 1: Create element factory functions**

Create `src/lib/hero-designer-defaults.ts` — factory functions that create new elements with sensible defaults:

```typescript
import { v4 as uuidv4 } from 'uuid'
import type {
  HeroElement,
  HeroDesign,
  ElementLayout,
  Spacing,
  ElementAnimation,
  TextProps,
  ImageProps,
  ButtonProps,
  ShapeProps,
  DividerProps,
  IconProps,
  VideoProps,
  CountdownProps,
  SocialProofProps,
  AnimatedBgProps,
  HeroElementType,
} from '@/types/hero-designer'

// NOTE: If uuid is not already in package.json, use crypto.randomUUID() instead.
// Check package.json first. If not present, replace uuidv4() with crypto.randomUUID()

const ZERO_SPACING: Spacing = { top: 0, right: 0, bottom: 0, left: 0 }

function defaultLayout(overrides?: Partial<ElementLayout>): ElementLayout {
  return {
    x: 10,
    y: 10,
    width: 30,
    height: 10,
    rotation: 0,
    padding: { ...ZERO_SPACING },
    margin: { ...ZERO_SPACING },
    ...overrides,
  }
}

const NO_ANIMATION: ElementAnimation = { type: 'none', duration: 400, delay: 0 }

export function createTextElement(overrides?: Partial<TextProps>): HeroElement {
  return {
    id: crypto.randomUUID(),
    type: 'text',
    label: 'Text',
    visible: true,
    locked: false,
    zIndex: 1,
    desktop: defaultLayout({ width: 50, height: -1 }),
    mobile: defaultLayout({ x: 5, width: 90, height: -1 }),
    props: {
      kind: 'text',
      content: 'Your heading here',
      fontFamily: 'Inter',
      fontSize: 48,
      fontWeight: 700,
      lineHeight: 1.2,
      letterSpacing: -0.5,
      color: '#1a1a1a',
      textAlign: 'center',
      textShadow: '',
      bold: false,
      italic: false,
      underline: false,
      ...overrides,
    },
    animation: { ...NO_ANIMATION },
  }
}

export function createImageElement(overrides?: Partial<ImageProps>): HeroElement {
  return {
    id: crypto.randomUUID(),
    type: 'image',
    label: 'Image',
    visible: true,
    locked: false,
    zIndex: 1,
    desktop: defaultLayout({ width: 40, height: 50 }),
    mobile: defaultLayout({ x: 5, width: 90, height: 40 }),
    props: {
      kind: 'image',
      src: '',
      alt: '',
      objectFit: 'cover',
      borderRadius: 0,
      opacity: 1,
      ...overrides,
    },
    animation: { ...NO_ANIMATION },
  }
}

export function createButtonElement(overrides?: Partial<ButtonProps>): HeroElement {
  return {
    id: crypto.randomUUID(),
    type: 'button',
    label: 'Button',
    visible: true,
    locked: false,
    zIndex: 2,
    desktop: defaultLayout({ width: 20, height: 6 }),
    mobile: defaultLayout({ x: 10, width: 80, height: 8 }),
    props: {
      kind: 'button',
      text: 'Order Now',
      linkUrl: '',
      linkTarget: '_self',
      backgroundColor: '#FF3B30',
      textColor: '#ffffff',
      borderWidth: 0,
      borderColor: '',
      borderRadius: 8,
      hoverEffect: 'darken',
      fontSize: 18,
      fontWeight: 600,
      ...overrides,
    },
    animation: { ...NO_ANIMATION },
  }
}

export function createShapeElement(overrides?: Partial<ShapeProps>): HeroElement {
  return {
    id: crypto.randomUUID(),
    type: 'shape',
    label: 'Shape',
    visible: true,
    locked: false,
    zIndex: 0,
    desktop: defaultLayout({ width: 20, height: 20 }),
    mobile: defaultLayout({ width: 40, height: 20 }),
    props: {
      kind: 'shape',
      shapeType: 'rectangle',
      fillColor: '#e5e7eb',
      borderWidth: 0,
      borderColor: '',
      borderRadius: 0,
      opacity: 1,
      ...overrides,
    },
    animation: { ...NO_ANIMATION },
  }
}

export function createDividerElement(overrides?: Partial<DividerProps>): HeroElement {
  return {
    id: crypto.randomUUID(),
    type: 'divider',
    label: 'Divider',
    visible: true,
    locked: false,
    zIndex: 1,
    desktop: defaultLayout({ width: 60, height: 1 }),
    mobile: defaultLayout({ x: 5, width: 90, height: 1 }),
    props: {
      kind: 'divider',
      orientation: 'horizontal',
      thickness: 2,
      color: '#d1d5db',
      style: 'solid',
      ...overrides,
    },
    animation: { ...NO_ANIMATION },
  }
}

export function createIconElement(overrides?: Partial<IconProps>): HeroElement {
  return {
    id: crypto.randomUUID(),
    type: 'icon',
    label: 'Icon',
    visible: true,
    locked: false,
    zIndex: 1,
    desktop: defaultLayout({ width: 5, height: 8 }),
    mobile: defaultLayout({ width: 10, height: 10 }),
    props: {
      kind: 'icon',
      iconName: 'Star',
      size: 32,
      color: '#1a1a1a',
      ...overrides,
    },
    animation: { ...NO_ANIMATION },
  }
}

export function createVideoElement(overrides?: Partial<VideoProps>): HeroElement {
  return {
    id: crypto.randomUUID(),
    type: 'video',
    label: 'Video',
    visible: true,
    locked: false,
    zIndex: 0,
    desktop: defaultLayout({ x: 0, y: 0, width: 100, height: 100 }),
    mobile: defaultLayout({ x: 0, y: 0, width: 100, height: 100 }),
    props: {
      kind: 'video',
      videoUrl: '',
      autoplay: true,
      muted: true,
      loop: true,
      posterImage: '',
      ...overrides,
    },
    animation: { ...NO_ANIMATION },
  }
}

export function createCountdownElement(overrides?: Partial<CountdownProps>): HeroElement {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  return {
    id: crypto.randomUUID(),
    type: 'countdown',
    label: 'Countdown',
    visible: true,
    locked: false,
    zIndex: 2,
    desktop: defaultLayout({ width: 40, height: 10 }),
    mobile: defaultLayout({ x: 5, width: 90, height: 12 }),
    props: {
      kind: 'countdown',
      targetDate: tomorrow.toISOString(),
      showDays: true,
      showHours: true,
      showMinutes: true,
      showSeconds: true,
      fontSize: 32,
      color: '#1a1a1a',
      separatorColor: '#6b7280',
      ...overrides,
    },
    animation: { ...NO_ANIMATION },
  }
}

export function createSocialProofElement(overrides?: Partial<SocialProofProps>): HeroElement {
  return {
    id: crypto.randomUUID(),
    type: 'social-proof',
    label: 'Social Proof',
    visible: true,
    locked: false,
    zIndex: 2,
    desktop: defaultLayout({ width: 20, height: 5 }),
    mobile: defaultLayout({ x: 10, width: 80, height: 6 }),
    props: {
      kind: 'social-proof',
      presetType: 'orders',
      text: 'Orders Completed',
      number: 1000,
      iconName: 'ShoppingBag',
      badgeStyle: 'pill',
      backgroundColor: '#f3f4f6',
      textColor: '#1a1a1a',
      ...overrides,
    },
    animation: { ...NO_ANIMATION },
  }
}

export function createAnimatedBgElement(overrides?: Partial<AnimatedBgProps>): HeroElement {
  return {
    id: crypto.randomUUID(),
    type: 'animated-bg',
    label: 'Animated BG',
    visible: true,
    locked: false,
    zIndex: 0,
    desktop: defaultLayout({ x: 0, y: 0, width: 100, height: 100 }),
    mobile: defaultLayout({ x: 0, y: 0, width: 100, height: 100 }),
    props: {
      kind: 'animated-bg',
      gradientType: 'linear',
      gradientColors: ['#667eea', '#764ba2'],
      gradientAngle: 135,
      patternType: 'none',
      patternOpacity: 0.1,
      parallax: false,
      ...overrides,
    },
    animation: { ...NO_ANIMATION },
  }
}

// Factory map for creating elements by type
export const elementFactories: Record<HeroElementType, () => HeroElement> = {
  text: createTextElement,
  image: createImageElement,
  button: createButtonElement,
  shape: createShapeElement,
  divider: createDividerElement,
  icon: createIconElement,
  video: createVideoElement,
  countdown: createCountdownElement,
  'social-proof': createSocialProofElement,
  'animated-bg': createAnimatedBgElement,
}

export function createBlankDesign(): HeroDesign {
  return {
    version: 1,
    canvas: {
      desktop: { width: 1440, height: 600 },
      mobile: { width: 390, height: 500 },
    },
    backgroundColor: '#ffffff',
    elements: [],
  }
}
```

**Step 2: Create templates file**

Create `src/lib/hero-designer-templates.ts` with 8 pre-built templates. Each template is a `HeroDesign` JSON object. Templates use the factory functions for element creation but with specific positions/content pre-filled. This file should export:

```typescript
import type { HeroDesign } from '@/types/hero-designer'

export interface HeroTemplate {
  id: string
  name: string
  description: string
  thumbnail: string   // placeholder — will be a preview color/gradient
  design: HeroDesign
}

export const heroTemplates: HeroTemplate[] = [
  // 1. Classic Centered
  {
    id: 'classic-centered',
    name: 'Classic Centered',
    description: 'Centered heading + subtext + CTA button, solid background',
    thumbnail: 'linear-gradient(135deg, #667eea, #764ba2)',
    design: {
      version: 1,
      canvas: { desktop: { width: 1440, height: 500 }, mobile: { width: 390, height: 450 } },
      backgroundColor: '#ffffff',
      elements: [
        {
          id: crypto.randomUUID(),
          type: 'text',
          label: 'Heading',
          visible: true, locked: false, zIndex: 2,
          desktop: { x: 15, y: 20, width: 70, height: -1, rotation: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, margin: { top: 0, right: 0, bottom: 0, left: 0 } },
          mobile: { x: 5, y: 15, width: 90, height: -1, rotation: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, margin: { top: 0, right: 0, bottom: 0, left: 0 } },
          props: { kind: 'text', content: 'Welcome to Our Restaurant', fontFamily: 'Inter', fontSize: 52, fontWeight: 700, lineHeight: 1.1, letterSpacing: -1, color: '#1a1a1a', textAlign: 'center', textShadow: '', bold: false, italic: false, underline: false },
          animation: { type: 'fadeIn', duration: 600, delay: 0 },
        },
        {
          id: crypto.randomUUID(),
          type: 'text',
          label: 'Subtitle',
          visible: true, locked: false, zIndex: 2,
          desktop: { x: 20, y: 45, width: 60, height: -1, rotation: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, margin: { top: 0, right: 0, bottom: 0, left: 0 } },
          mobile: { x: 5, y: 42, width: 90, height: -1, rotation: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, margin: { top: 0, right: 0, bottom: 0, left: 0 } },
          props: { kind: 'text', content: 'Freshly prepared dishes delivered to your table', fontFamily: 'Inter', fontSize: 20, fontWeight: 400, lineHeight: 1.5, letterSpacing: 0, color: '#6b7280', textAlign: 'center', textShadow: '', bold: false, italic: false, underline: false },
          animation: { type: 'fadeIn', duration: 600, delay: 200 },
        },
        {
          id: crypto.randomUUID(),
          type: 'button',
          label: 'CTA Button',
          visible: true, locked: false, zIndex: 2,
          desktop: { x: 35, y: 65, width: 30, height: 8, rotation: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, margin: { top: 0, right: 0, bottom: 0, left: 0 } },
          mobile: { x: 15, y: 62, width: 70, height: 10, rotation: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, margin: { top: 0, right: 0, bottom: 0, left: 0 } },
          props: { kind: 'button', text: 'View Our Menu', linkUrl: '#menu', linkTarget: '_self', backgroundColor: '#FF3B30', textColor: '#ffffff', borderWidth: 0, borderColor: '', borderRadius: 12, hoverEffect: 'darken', fontSize: 18, fontWeight: 600 },
          animation: { type: 'slideUp', duration: 500, delay: 400 },
        },
      ],
    },
  },
  // 2. Split Layout
  {
    id: 'split-layout',
    name: 'Split Layout',
    description: 'Image on right, text + CTA on left (50/50)',
    thumbnail: 'linear-gradient(135deg, #f5f7fa, #c3cfe2)',
    design: {
      version: 1,
      canvas: { desktop: { width: 1440, height: 550 }, mobile: { width: 390, height: 600 } },
      backgroundColor: '#fafafa',
      elements: [
        {
          id: crypto.randomUUID(),
          type: 'text', label: 'Heading', visible: true, locked: false, zIndex: 2,
          desktop: { x: 5, y: 20, width: 45, height: -1, rotation: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, margin: { top: 0, right: 0, bottom: 0, left: 0 } },
          mobile: { x: 5, y: 55, width: 90, height: -1, rotation: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, margin: { top: 0, right: 0, bottom: 0, left: 0 } },
          props: { kind: 'text', content: 'Taste the Difference', fontFamily: 'Inter', fontSize: 48, fontWeight: 700, lineHeight: 1.1, letterSpacing: -0.5, color: '#1a1a1a', textAlign: 'left', textShadow: '', bold: false, italic: false, underline: false },
          animation: { type: 'slideLeft', duration: 600, delay: 0 },
        },
        {
          id: crypto.randomUUID(),
          type: 'text', label: 'Description', visible: true, locked: false, zIndex: 2,
          desktop: { x: 5, y: 45, width: 40, height: -1, rotation: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, margin: { top: 0, right: 0, bottom: 0, left: 0 } },
          mobile: { x: 5, y: 70, width: 90, height: -1, rotation: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, margin: { top: 0, right: 0, bottom: 0, left: 0 } },
          props: { kind: 'text', content: 'Handcrafted dishes using only the finest local ingredients', fontFamily: 'Inter', fontSize: 18, fontWeight: 400, lineHeight: 1.6, letterSpacing: 0, color: '#6b7280', textAlign: 'left', textShadow: '', bold: false, italic: false, underline: false },
          animation: { type: 'slideLeft', duration: 600, delay: 200 },
        },
        {
          id: crypto.randomUUID(),
          type: 'button', label: 'CTA', visible: true, locked: false, zIndex: 2,
          desktop: { x: 5, y: 65, width: 20, height: 8, rotation: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, margin: { top: 0, right: 0, bottom: 0, left: 0 } },
          mobile: { x: 5, y: 85, width: 90, height: 10, rotation: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, margin: { top: 0, right: 0, bottom: 0, left: 0 } },
          props: { kind: 'button', text: 'Order Now', linkUrl: '#menu', linkTarget: '_self', backgroundColor: '#1a1a1a', textColor: '#ffffff', borderWidth: 0, borderColor: '', borderRadius: 8, hoverEffect: 'scale', fontSize: 16, fontWeight: 600 },
          animation: { type: 'slideUp', duration: 500, delay: 400 },
        },
        {
          id: crypto.randomUUID(),
          type: 'image', label: 'Hero Image', visible: true, locked: false, zIndex: 1,
          desktop: { x: 52, y: 2, width: 46, height: 96, rotation: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, margin: { top: 0, right: 0, bottom: 0, left: 0 } },
          mobile: { x: 0, y: 0, width: 100, height: 50, rotation: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, margin: { top: 0, right: 0, bottom: 0, left: 0 } },
          props: { kind: 'image', src: '', alt: 'Hero image', objectFit: 'cover', borderRadius: 16, opacity: 1 },
          animation: { type: 'fadeIn', duration: 800, delay: 0 },
        },
      ],
    },
  },
  // 3-8: Additional templates (Full-Screen Image, Minimal Text, Bold CTA, Video Hero, Restaurant Showcase, Promo Countdown)
  // Follow the same pattern as above. Each has unique element arrangements.
  // The implementing agent should create all 8 templates following this exact pattern.
]
```

**Important:** The implementing agent must complete all 8 templates. Templates 3-8 follow the same structure. Key guidelines:
- Template 3 (Full-Screen Image): background image element at z:0, dark shape overlay at z:1, white text at z:2
- Template 4 (Minimal Text): single large text element centered, white bg, no other elements
- Template 5 (Bold CTA): gradient animated-bg at z:0, large heading, prominent button, social proof badge
- Template 6 (Video Hero): video element at z:0, dark overlay shape, white text + CTA
- Template 7 (Restaurant Showcase): image bg, semi-transparent shape overlay, restaurant name heading, tagline text, "Order Now" button
- Template 8 (Promo Countdown): countdown element, promo heading text, CTA button, urgent red/orange color scheme

**Step 3: Commit**

```bash
git add src/lib/hero-designer-defaults.ts src/lib/hero-designer-templates.ts
git commit -m "feat(hero-designer): add element factories and 8 starter templates"
```

---

## Task 4: Server Action for Saving Hero Design

**Files:**
- Create: `src/app/actions/hero-designer.ts`

**Step 1: Create the server action**

Create `src/app/actions/hero-designer.ts`:

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { heroDesignSchema } from '@/lib/hero-designer-schemas'
import type { HeroDesign } from '@/types/hero-designer'

interface SaveHeroDesignResult {
  success: boolean
  error?: string
}

async function verifyTenantAdmin(tenantId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // Check if user is superadmin
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'superadmin') return

  // Check if user is admin for this tenant
  const { data: tenantAdmin } = await supabase
    .from('tenant_admins')
    .select('id')
    .eq('user_id', user.id)
    .eq('tenant_id', tenantId)
    .single()

  if (!tenantAdmin) throw new Error('Not authorized')
}

export async function saveHeroDesignAction(
  tenantId: string,
  tenantSlug: string,
  design: HeroDesign | null
): Promise<SaveHeroDesignResult> {
  try {
    await verifyTenantAdmin(tenantId)

    // Validate if design is provided (null = clear/reset)
    if (design !== null) {
      heroDesignSchema.parse(design)
    }

    const supabase = await createClient()
    const { error } = await supabase
      .from('tenants')
      .update({ hero_design: design as unknown as Record<string, unknown> })
      .eq('id', tenantId)

    if (error) {
      return { success: false, error: error.message }
    }

    revalidatePath(`/${tenantSlug}/menu`, 'layout')
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save hero design'
    return { success: false, error: message }
  }
}

export async function getHeroDesignAction(
  tenantId: string
): Promise<{ success: boolean; design: HeroDesign | null; error?: string }> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('tenants')
      .select('hero_design')
      .eq('id', tenantId)
      .single()

    if (error) {
      return { success: false, design: null, error: error.message }
    }

    return { success: true, design: (data?.hero_design as unknown as HeroDesign) ?? null }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load hero design'
    return { success: false, design: null, error: message }
  }
}
```

**Note to implementing agent:** Check the existing `verifyTenantAdmin` pattern in `src/app/actions/branding.ts:178-190`. If there's already a shared utility for this, import and reuse it instead of duplicating. The pattern above is a reference — match the actual codebase pattern.

**Step 2: Commit**

```bash
git add src/app/actions/hero-designer.ts
git commit -m "feat(hero-designer): add save/load server actions with Zod validation"
```

---

## Task 5: Designer State Management (useHeroDesigner hook)

**Files:**
- Create: `src/hooks/use-hero-designer.ts`

**Step 1: Create the state management hook**

This hook manages the entire designer state: selected element, breakpoint, undo/redo history, and element CRUD operations.

```typescript
'use client'

import { useCallback, useReducer } from 'react'
import type {
  HeroDesign,
  HeroElement,
  Breakpoint,
  DesignerState,
  ElementLayout,
  ElementProps,
  ElementAnimation,
  HeroElementType,
} from '@/types/hero-designer'
import { createBlankDesign, elementFactories } from '@/lib/hero-designer-defaults'

const MAX_HISTORY = 50

// ─── Actions ──────────────────────────────────────────────
type DesignerAction =
  | { type: 'SET_DESIGN'; design: HeroDesign }
  | { type: 'ADD_ELEMENT'; elementType: HeroElementType }
  | { type: 'REMOVE_ELEMENT'; elementId: string }
  | { type: 'DUPLICATE_ELEMENT'; elementId: string }
  | { type: 'SELECT_ELEMENT'; elementId: string | null }
  | { type: 'UPDATE_ELEMENT_LAYOUT'; elementId: string; breakpoint: Breakpoint; layout: Partial<ElementLayout> }
  | { type: 'UPDATE_ELEMENT_PROPS'; elementId: string; props: Partial<ElementProps> }
  | { type: 'UPDATE_ELEMENT_ANIMATION'; elementId: string; animation: Partial<ElementAnimation> }
  | { type: 'UPDATE_ELEMENT_META'; elementId: string; meta: Partial<Pick<HeroElement, 'label' | 'visible' | 'locked' | 'zIndex'>> }
  | { type: 'REORDER_ELEMENTS'; elementIds: string[] }
  | { type: 'SET_BREAKPOINT'; breakpoint: Breakpoint }
  | { type: 'SET_ZOOM'; zoom: number }
  | { type: 'TOGGLE_GRID' }
  | { type: 'UPDATE_CANVAS'; backgroundColor?: string; backgroundImage?: HeroDesign['backgroundImage']; canvasHeight?: { breakpoint: Breakpoint; height: number } }
  | { type: 'UNDO' }
  | { type: 'REDO' }

function pushHistory(state: DesignerState): DesignerState {
  const newHistory = state.history.slice(0, state.historyIndex + 1)
  newHistory.push(structuredClone(state.design))
  if (newHistory.length > MAX_HISTORY) newHistory.shift()
  return { ...state, history: newHistory, historyIndex: newHistory.length - 1 }
}

function updateElement(design: HeroDesign, elementId: string, updater: (el: HeroElement) => HeroElement): HeroDesign {
  return {
    ...design,
    elements: design.elements.map((el) => (el.id === elementId ? updater(el) : el)),
  }
}

function designerReducer(state: DesignerState, action: DesignerAction): DesignerState {
  switch (action.type) {
    case 'SET_DESIGN':
      return { ...state, design: action.design, selectedElementId: null, history: [structuredClone(action.design)], historyIndex: 0 }

    case 'ADD_ELEMENT': {
      const stateWithHistory = pushHistory(state)
      const factory = elementFactories[action.elementType]
      const newElement = factory()
      return {
        ...stateWithHistory,
        design: { ...stateWithHistory.design, elements: [...stateWithHistory.design.elements, newElement] },
        selectedElementId: newElement.id,
      }
    }

    case 'REMOVE_ELEMENT': {
      const stateWithHistory = pushHistory(state)
      return {
        ...stateWithHistory,
        design: { ...stateWithHistory.design, elements: stateWithHistory.design.elements.filter((el) => el.id !== action.elementId) },
        selectedElementId: state.selectedElementId === action.elementId ? null : state.selectedElementId,
      }
    }

    case 'DUPLICATE_ELEMENT': {
      const original = state.design.elements.find((el) => el.id === action.elementId)
      if (!original) return state
      const stateWithHistory = pushHistory(state)
      const duplicate: HeroElement = {
        ...structuredClone(original),
        id: crypto.randomUUID(),
        label: `${original.label} (copy)`,
        desktop: { ...original.desktop, x: original.desktop.x + 2, y: original.desktop.y + 2 },
        mobile: { ...original.mobile, x: original.mobile.x + 2, y: original.mobile.y + 2 },
      }
      return {
        ...stateWithHistory,
        design: { ...stateWithHistory.design, elements: [...stateWithHistory.design.elements, duplicate] },
        selectedElementId: duplicate.id,
      }
    }

    case 'SELECT_ELEMENT':
      return { ...state, selectedElementId: action.elementId }

    case 'UPDATE_ELEMENT_LAYOUT': {
      const stateWithHistory = pushHistory(state)
      return {
        ...stateWithHistory,
        design: updateElement(stateWithHistory.design, action.elementId, (el) => ({
          ...el,
          [action.breakpoint]: { ...el[action.breakpoint], ...action.layout },
        })),
      }
    }

    case 'UPDATE_ELEMENT_PROPS': {
      const stateWithHistory = pushHistory(state)
      return {
        ...stateWithHistory,
        design: updateElement(stateWithHistory.design, action.elementId, (el) => ({
          ...el,
          props: { ...el.props, ...action.props } as ElementProps,
        })),
      }
    }

    case 'UPDATE_ELEMENT_ANIMATION': {
      const stateWithHistory = pushHistory(state)
      return {
        ...stateWithHistory,
        design: updateElement(stateWithHistory.design, action.elementId, (el) => ({
          ...el,
          animation: { ...el.animation, ...action.animation },
        })),
      }
    }

    case 'UPDATE_ELEMENT_META': {
      const stateWithHistory = pushHistory(state)
      return {
        ...stateWithHistory,
        design: updateElement(stateWithHistory.design, action.elementId, (el) => ({
          ...el,
          ...action.meta,
        })),
      }
    }

    case 'REORDER_ELEMENTS': {
      const stateWithHistory = pushHistory(state)
      const elementMap = new Map(stateWithHistory.design.elements.map((el) => [el.id, el]))
      const reordered = action.elementIds.map((id) => elementMap.get(id)).filter(Boolean) as HeroElement[]
      return {
        ...stateWithHistory,
        design: { ...stateWithHistory.design, elements: reordered },
      }
    }

    case 'SET_BREAKPOINT':
      return { ...state, activeBreakpoint: action.breakpoint }

    case 'SET_ZOOM':
      return { ...state, zoom: Math.max(0.25, Math.min(2, action.zoom)) }

    case 'TOGGLE_GRID':
      return { ...state, showGrid: !state.showGrid }

    case 'UPDATE_CANVAS': {
      const stateWithHistory = pushHistory(state)
      const newDesign = { ...stateWithHistory.design }
      if (action.backgroundColor !== undefined) newDesign.backgroundColor = action.backgroundColor
      if (action.backgroundImage !== undefined) newDesign.backgroundImage = action.backgroundImage
      if (action.canvasHeight) {
        newDesign.canvas = {
          ...newDesign.canvas,
          [action.canvasHeight.breakpoint]: {
            ...newDesign.canvas[action.canvasHeight.breakpoint],
            height: action.canvasHeight.height,
          },
        }
      }
      return { ...stateWithHistory, design: newDesign }
    }

    case 'UNDO': {
      if (state.historyIndex <= 0) return state
      const newIndex = state.historyIndex - 1
      return { ...state, design: structuredClone(state.history[newIndex]), historyIndex: newIndex }
    }

    case 'REDO': {
      if (state.historyIndex >= state.history.length - 1) return state
      const newIndex = state.historyIndex + 1
      return { ...state, design: structuredClone(state.history[newIndex]), historyIndex: newIndex }
    }

    default:
      return state
  }
}

export function useHeroDesigner(initialDesign?: HeroDesign) {
  const design = initialDesign ?? createBlankDesign()
  const [state, dispatch] = useReducer(designerReducer, {
    design,
    selectedElementId: null,
    activeBreakpoint: 'desktop' as Breakpoint,
    zoom: 1,
    showGrid: true,
    history: [structuredClone(design)],
    historyIndex: 0,
  })

  const canUndo = state.historyIndex > 0
  const canRedo = state.historyIndex < state.history.length - 1
  const selectedElement = state.design.elements.find((el) => el.id === state.selectedElementId) ?? null

  return {
    state,
    dispatch,
    canUndo,
    canRedo,
    selectedElement,
    // Convenience methods
    addElement: useCallback((type: HeroElementType) => dispatch({ type: 'ADD_ELEMENT', elementType: type }), []),
    removeElement: useCallback((id: string) => dispatch({ type: 'REMOVE_ELEMENT', elementId: id }), []),
    selectElement: useCallback((id: string | null) => dispatch({ type: 'SELECT_ELEMENT', elementId: id }), []),
    undo: useCallback(() => dispatch({ type: 'UNDO' }), []),
    redo: useCallback(() => dispatch({ type: 'REDO' }), []),
  }
}
```

**Step 2: Commit**

```bash
git add src/hooks/use-hero-designer.ts
git commit -m "feat(hero-designer): add useHeroDesigner state management hook with undo/redo"
```

---

## Task 6: Designer Canvas & Canvas Element Components

**Files:**
- Create: `src/components/admin/hero-designer/designer-canvas.tsx`
- Create: `src/components/admin/hero-designer/canvas-element.tsx`

**Step 1: Create `canvas-element.tsx`**

This is the individual element rendered on the canvas. It supports selection, dragging (via `@dnd-kit`), and resize handles.

Key behaviors:
- Absolute positioning using the element's layout (x%, y%, width%, height%)
- Blue selection border when selected
- 8 resize handles visible when selected (corners + midpoints)
- Drag handle uses `@dnd-kit` `useDraggable`
- Calls `onSelect` on click, `onLayoutChange` on drag end / resize end
- Shows lock icon overlay when locked (no interaction)
- Hidden when `visible: false`
- Renders element content based on `props.kind` (text shows text, image shows img, button shows button preview, etc.)

Size: ~200-250 lines. The component must handle:
- Converting percentage positions to pixel positions based on canvas dimensions
- Resize handle mouse events (onMouseDown on handle → track mousemove → convert delta to % → call onLayoutChange)
- Snap-to-grid logic when grid is enabled (round to nearest 2% increment)

**Step 2: Create `designer-canvas.tsx`**

The main canvas area. Key behaviors:
- Container div with aspect ratio matching current breakpoint (1440xH desktop, 390xH mobile)
- Scaled to fit the available viewport space (uses CSS transform: scale())
- Background color/image from design
- Renders all elements as `<CanvasElement>` components
- Grid overlay (dotted lines at 10% intervals) when showGrid is true
- Click on empty area deselects all elements
- Drop zone for new elements dragged from ElementPanel (uses `@dnd-kit` `useDroppable`)
- Calculates drop position as % of canvas dimensions

Size: ~150-200 lines.

**Step 3: Commit**

```bash
git add src/components/admin/hero-designer/
git commit -m "feat(hero-designer): add DesignerCanvas and CanvasElement with drag/resize"
```

---

## Task 7: Element Panel & Layers Panel

**Files:**
- Create: `src/components/admin/hero-designer/element-panel.tsx`
- Create: `src/components/admin/hero-designer/layers-panel.tsx`

**Step 1: Create `element-panel.tsx`**

Left sidebar top section. Displays a grid of draggable element blocks:

- Each block: icon + label (e.g., "Text" with Type icon, "Image" with Image icon, etc.)
- Uses `@dnd-kit` `useDraggable` on each block
- Organized in 2 sections: "Core" (Text, Image, Button, Shape, Divider, Icon) and "Extended" (Video, Countdown, Social Proof, Animated BG)
- Shadcn Card styling for each block
- On drag start, creates a drag overlay showing the element type

Icon mapping (Lucide):
- text → Type
- image → ImageIcon
- button → MousePointer2
- shape → Square
- divider → Minus
- icon → Star
- video → Play
- countdown → Timer
- social-proof → Award
- animated-bg → Palette

Size: ~80-100 lines.

**Step 2: Create `layers-panel.tsx`**

Left sidebar bottom section. Shows z-ordered list of all elements:

- Uses `@dnd-kit` `SortableContext` + `verticalListSortingStrategy` for drag-to-reorder (same pattern as `src/components/admin/categories-list.tsx:6-21`)
- Each layer row shows: drag handle, element icon, label (editable on double-click), visibility toggle (Eye/EyeOff), lock toggle (Lock/Unlock)
- Selected element row highlighted with blue bg
- Click row to select element
- Drag to reorder updates element array order (visual z-order)
- "Delete" button (Trash2 icon) on hover

Size: ~120-150 lines.

**Step 3: Commit**

```bash
git add src/components/admin/hero-designer/element-panel.tsx src/components/admin/hero-designer/layers-panel.tsx
git commit -m "feat(hero-designer): add ElementPanel and LayersPanel with drag-and-drop"
```

---

## Task 8: Properties Panel

**Files:**
- Create: `src/components/admin/hero-designer/properties-panel.tsx`
- Create: `src/components/admin/hero-designer/property-sections/position-section.tsx`
- Create: `src/components/admin/hero-designer/property-sections/typography-section.tsx`
- Create: `src/components/admin/hero-designer/property-sections/appearance-section.tsx`
- Create: `src/components/admin/hero-designer/property-sections/animation-section.tsx`
- Create: `src/components/admin/hero-designer/property-sections/element-specific-section.tsx`

**Step 1: Create `properties-panel.tsx`**

Right sidebar. Shows when an element is selected. Sections (collapsible via Shadcn Accordion or custom toggle):

1. **Position & Size** — x, y, width, height inputs (number), rotation slider, padding/margin 4-input groups
2. **Typography** (text/button only) — font family dropdown, size, weight, line-height, letter-spacing, alignment buttons, color picker
3. **Appearance** — opacity slider, border (width, color, radius), box shadow, fill color (shapes)
4. **Animation** — type dropdown, duration slider, delay slider, preview button
5. **Element-specific** — renders based on element type (e.g., image src + upload, button link URL, video URL, countdown target date, etc.)

When no element is selected, show canvas-level properties:
- Canvas background color picker
- Canvas background image (upload + opacity + objectFit)
- Canvas height input (per breakpoint)

Use Shadcn Input, Select, Slider, and color picker inputs. For color pickers, use a simple `<input type="color">` wrapped in a styled container (matching the pattern in the existing settings page).

Each sub-section is its own file for maintainability. `properties-panel.tsx` orchestrates them.

**Step 2: Commit**

```bash
git add src/components/admin/hero-designer/properties-panel.tsx src/components/admin/hero-designer/property-sections/
git commit -m "feat(hero-designer): add PropertiesPanel with position, typography, appearance, animation sections"
```

---

## Task 9: Designer Toolbar & Template Picker

**Files:**
- Create: `src/components/admin/hero-designer/designer-toolbar.tsx`
- Create: `src/components/admin/hero-designer/template-picker.tsx`

**Step 1: Create `designer-toolbar.tsx`**

Top bar across the full width:

Left group:
- Back arrow (link to `/[tenant]/admin/settings`)
- "Hero Designer" title text

Center group:
- Undo button (disabled when canUndo=false)
- Redo button (disabled when canRedo=false)
- Separator
- Desktop/Mobile breakpoint toggle (ToggleGroup from Shadcn — Monitor icon + Smartphone icon)
- Separator
- Grid toggle button (Grid3x3 icon)
- Zoom controls (ZoomOut, percentage display, ZoomIn)

Right group:
- "Templates" button (opens template picker dialog)
- "Preview" button (opens full-screen preview)
- "Save" button (primary, calls save action)
- "Reset" button (secondary/ghost, confirms then clears design)

Size: ~100-120 lines.

**Step 2: Create `template-picker.tsx`**

A Shadcn Dialog that shows when "Templates" is clicked:

- Grid of 8 template cards (4 per row desktop, 2 per row mobile)
- Each card: gradient/color thumbnail, template name, description
- Click card → confirm dialog ("This will replace your current design. Continue?") → loads template into designer state
- "Start Blank" option at the end

Size: ~80-100 lines.

**Step 3: Commit**

```bash
git add src/components/admin/hero-designer/designer-toolbar.tsx src/components/admin/hero-designer/template-picker.tsx
git commit -m "feat(hero-designer): add DesignerToolbar with undo/redo/breakpoint and TemplatePicker"
```

---

## Task 10: Main HeroDesigner Page Component

**Files:**
- Create: `src/components/admin/hero-designer/hero-designer.tsx`
- Create: `src/app/[tenant]/admin/hero-designer/page.tsx`

**Step 1: Create `hero-designer.tsx`**

The main client component that wires everything together:

```
'use client'
```

- Uses `useHeroDesigner` hook for state
- Wraps everything in a `DndContext` from `@dnd-kit/core`
- Layout: full-screen (100vh), no scrolling, 3-column grid
  - Left column (280px): `ElementPanel` + `LayersPanel`
  - Center (flex-1): `DesignerToolbar` on top + `DesignerCanvas` filling remaining space
  - Right column (320px): `PropertiesPanel`
- Handles DnD events:
  - `onDragEnd`: if dropped on canvas → add element at drop position; if in layers → reorder
- Keyboard shortcuts (useEffect with keydown listener):
  - Delete/Backspace → remove selected element (if not locked)
  - Ctrl+Z → undo
  - Ctrl+Y / Ctrl+Shift+Z → redo
  - Arrow keys → nudge selected element 1% in that direction
  - Escape → deselect
- Save handler: calls `saveHeroDesignAction`, shows toast via Sonner
- Auto-save indicator (optional: "Unsaved changes" dot in toolbar)

Props:
```typescript
interface HeroDesignerProps {
  tenantId: string
  tenantSlug: string
  initialDesign: HeroDesign | null
}
```

Size: ~150-200 lines.

**Step 2: Create the admin page**

Create `src/app/[tenant]/admin/hero-designer/page.tsx`:

```typescript
import { getCachedTenantBySlug } from '@/lib/cache'
import { redirect } from 'next/navigation'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import dynamic from 'next/dynamic'
import type { HeroDesign } from '@/types/hero-designer'

const HeroDesigner = dynamic(
  () => import('@/components/admin/hero-designer/hero-designer').then((m) => m.HeroDesigner),
  { ssr: false }
)

export default async function HeroDesignerPage({
  params,
}: {
  params: Promise<{ tenant: string }>
}) {
  const { tenant: tenantSlug } = await params
  const tenantData = await getCachedTenantBySlug(tenantSlug)

  if (!tenantData) redirect('/')

  return (
    <div className="h-screen flex flex-col">
      <HeroDesigner
        tenantId={tenantData.id}
        tenantSlug={tenantSlug}
        initialDesign={(tenantData.hero_design as unknown as HeroDesign) ?? null}
      />
    </div>
  )
}
```

**Note:** This page uses `dynamic` with `ssr: false` because the designer is a heavy client-side component with DnD, canvas interactions, and DOM measurements that don't work server-side.

**Step 3: Commit**

```bash
git add src/components/admin/hero-designer/hero-designer.tsx src/app/\\[tenant\\]/admin/hero-designer/page.tsx
git commit -m "feat(hero-designer): add main HeroDesigner component and admin page route"
```

---

## Task 11: Add Sidebar Navigation Link

**Files:**
- Modify: `src/components/shared/sidebar.tsx:126-172` — add "Hero Designer" to `adminSidebarItems`

**Step 1: Add the sidebar item**

In `src/components/shared/sidebar.tsx`, add a new item to the `adminSidebarItems` array. Add it after the "Settings" item (or before it — between Bundles and Orders makes sense as it's a design tool):

```typescript
  {
    label: 'Hero Designer',
    href: '/admin/hero-designer',
    icon: Paintbrush,
  },
```

Also add `Paintbrush` to the Lucide imports at the top of the file.

**Step 2: Commit**

```bash
git add src/components/shared/sidebar.tsx
git commit -m "feat(hero-designer): add Hero Designer link to admin sidebar"
```

---

## Task 12: Customer-Facing HeroRenderer

**Files:**
- Create: `src/components/customer/hero-renderer.tsx`
- Modify: `src/components/customer/layouts/layout-default.tsx:82-108` — conditionally render HeroRenderer

**Step 1: Create `hero-renderer.tsx`**

This is the customer-facing renderer. It reads a `HeroDesign` JSON object and outputs styled HTML. Key requirements:

- SSR compatible (no useEffect for layout, no window measurements)
- Uses Framer Motion for animated elements (wrap each animated element in `<motion.div>` with `initial`/`animate`/`transition`)
- Responsive: renders both desktop and mobile layouts, shows the correct one via CSS media query (display:none + display:block)
- Each element becomes an absolutely-positioned `<div>` inside a relative container
- Text elements render as `<p>` or `<h1>`-`<h6>` based on fontSize (>36 = h1, >28 = h2, etc.)
- Button elements render as `<a>` tags with href
- Image elements render as `<img>` with Cloudinary URL
- Video elements render as `<video>` or YouTube/Vimeo embed `<iframe>`
- Countdown renders a client component island (needs JS for ticking)
- Social proof renders a badge div
- Animated BG renders gradient/pattern CSS
- Shape/Divider render styled divs
- Icon renders the Lucide icon by name (dynamic import from lucide-react)

Container div uses CSS containment (`contain: layout style paint`) for rendering performance.

Props:
```typescript
interface HeroRendererProps {
  design: HeroDesign
  className?: string
}
```

Size: ~250-350 lines (includes per-element-type render functions).

**Step 2: Integrate into layout-default.tsx**

In `src/components/customer/layouts/layout-default.tsx`, at lines 82-108 where the hero section is currently rendered, wrap it in a conditional:

```typescript
{/* Hero Section */}
{tenant?.hero_design ? (
  <HeroRenderer design={tenant.hero_design as unknown as HeroDesign} className="mb-16" />
) : (
  <div className="text-center mb-16">
    {/* ... existing simple hero code stays exactly as-is ... */}
  </div>
)}
```

Import `HeroRenderer` and `HeroDesign` type at the top.

**Important:** The existing simple hero rendering must remain as the fallback. Do NOT delete it.

**Step 3: Also integrate into other layout variants**

Check these layout files for hero sections and add the same conditional:
- `src/components/customer/layouts/layout-sidebar.tsx`
- `src/components/customer/layouts/layout-magazine.tsx`
- `src/components/customer/layouts/layout-mosaic.tsx`

Each should follow the same pattern: if `tenant?.hero_design` exists, render `HeroRenderer`; otherwise, keep the existing hero.

**Step 4: Commit**

```bash
git add src/components/customer/hero-renderer.tsx src/components/customer/layouts/
git commit -m "feat(hero-designer): add HeroRenderer for customer menu page with layout fallbacks"
```

---

## Task 13: Full-Screen Preview Mode

**Files:**
- Create: `src/components/admin/hero-designer/preview-modal.tsx`

**Step 1: Create preview modal**

When "Preview" is clicked in the toolbar, show a full-screen overlay that renders the `HeroRenderer` component with the current design. Features:

- Full-screen overlay (fixed, z-50, bg-black)
- Toolbar at top: close button, breakpoint toggle (Desktop/Tablet/Mobile), actual pixel dimensions display
- Preview container centered with the chosen device frame:
  - Desktop: 1440px width (scaled to fit)
  - Tablet: 768px width
  - Mobile: 390px width
- Uses the same `HeroRenderer` component (consistency guarantee)
- Escape key closes

Size: ~80-100 lines.

**Step 2: Commit**

```bash
git add src/components/admin/hero-designer/preview-modal.tsx
git commit -m "feat(hero-designer): add full-screen preview with device frames"
```

---

## Task 14: Lint, Type-Check & Integration Test

**Files:** No new files — validation pass.

**Step 1: Run TypeScript type-check**

Run: `npx tsc --noEmit`

Fix any type errors that come up. Common issues to watch for:
- `hero_design` not matching Record<string, unknown> vs HeroDesign type
- Missing imports
- Strict null checks on optional props

**Step 2: Run ESLint**

Run: `npm run lint`

Fix all lint errors. Zero warnings is ideal but not blocking.

**Step 3: Run the dev server**

Run: `npm run dev`

Verify no build errors. Navigate to a tenant's admin → Hero Designer page. Verify:
- Canvas renders
- Can drag elements onto canvas
- Can select/move/resize elements
- Properties panel updates on selection
- Breakpoint toggle switches canvas size
- Save works (check Supabase for hero_design column)
- Customer menu page renders the saved design

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix(hero-designer): resolve lint and type errors"
```

---

## Task 15: Security & Advisory Check

**Files:** No new files.

**Step 1: Run Supabase security advisors**

Use the Supabase MCP `get_advisors` tool with type "security" to check for any new advisories after the migration.

**Step 2: Verify RLS**

The `hero_design` column is on the `tenants` table which already has RLS policies. Verify that:
- Tenant admins can only update their own tenant's `hero_design`
- The existing RLS policies on `tenants` cover the new column (they should, since RLS is row-level)

**Step 3: Verify input sanitization**

- Zod schema validates all color values against CSS injection
- Image URLs validated as proper URLs
- Text content has max length constraints
- No raw HTML is ever stored or rendered (JSON only → controlled renderer)

**Step 4: Commit any security fixes**

```bash
git add -A
git commit -m "fix(hero-designer): address security advisories"
```

---

## Execution Notes for Agents

### File Organization
All hero designer admin components go in `src/components/admin/hero-designer/`:
```
src/components/admin/hero-designer/
├── hero-designer.tsx          (main wrapper)
├── designer-toolbar.tsx       (top bar)
├── designer-canvas.tsx        (canvas area)
├── canvas-element.tsx         (individual element)
├── element-panel.tsx          (left: element blocks)
├── layers-panel.tsx           (left: z-order list)
├── properties-panel.tsx       (right: properties)
├── template-picker.tsx        (template selection dialog)
├── preview-modal.tsx          (full-screen preview)
└── property-sections/
    ├── position-section.tsx
    ├── typography-section.tsx
    ├── appearance-section.tsx
    ├── animation-section.tsx
    └── element-specific-section.tsx
```

### Dependencies Already Available
- `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/modifiers`, `@dnd-kit/utilities` — all installed
- `framer-motion` — installed
- `lucide-react` — installed
- `shadcn/ui` components — all available in `src/components/ui/`
- `sonner` — installed for toast notifications
- `zod` — installed

### Patterns to Follow
- Server actions: see `src/app/actions/branding.ts` for exact patterns
- Admin page structure: see `src/app/[tenant]/admin/categories/page.tsx`
- DnD Kit setup: see `src/components/admin/categories-list.tsx:6-21`
- Dynamic imports: use `next/dynamic` with `ssr: false` for the designer
- Color pickers: match the pattern in `src/app/[tenant]/admin/settings/page.tsx`

### Task Dependencies
- Tasks 1-2 (types, schemas, migration) must complete before anything else
- Task 3 (defaults/templates) depends on Task 1
- Task 4 (server action) depends on Tasks 1-2
- Task 5 (state hook) depends on Tasks 1, 3
- Tasks 6-9 (UI components) depend on Task 5
- Task 10 (main page) depends on Tasks 6-9
- Task 11 (sidebar link) is independent — can run anytime
- Task 12 (customer renderer) depends on Task 1, can run in parallel with Tasks 6-10
- Task 13 (preview) depends on Task 12
- Tasks 14-15 (validation) must run last

### Parallelization Groups
- **Group A** (foundation): Tasks 1, 2 → sequential
- **Group B** (data layer): Tasks 3, 4 → after Group A, can be parallel
- **Group C** (state): Task 5 → after Tasks 1, 3
- **Group D** (UI): Tasks 6, 7, 8, 9 → after Task 5, can be parallel among themselves
- **Group E** (assembly): Tasks 10, 11 → after Group D, can be parallel
- **Group F** (rendering): Tasks 12, 13 → Task 12 after Task 1, Task 13 after Task 12
- **Group G** (validation): Tasks 14, 15 → after everything
