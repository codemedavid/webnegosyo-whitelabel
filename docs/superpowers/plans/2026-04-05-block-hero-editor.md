# Block-Based Hero Section Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the absolute-positioning hero designer with an Elementor-style block editor where sections contain columns contain widgets, all with per-block alignment controls.

**Architecture:** Section > Column > Widget tree structure with flow-based layout. New type system (v4), new state management hook, new editor UI, new production renderer. Clean break from v3 — old designs treated as blank.

**Tech Stack:** Next.js 15, TypeScript strict, Zod, React useReducer, dnd-kit, Framer Motion, Tailwind CSS, shadcn/ui, lucide-react

---

## File Structure

### New Files (Create)

| File | Responsibility |
|------|---------------|
| `src/types/hero-block-designer.ts` | All type definitions for v4 block system |
| `src/lib/hero-block-defaults.ts` | Factory functions, column presets, default widget props |
| `src/lib/hero-block-schemas.ts` | Zod validation for v4 designs |
| `src/hooks/use-hero-block-designer.ts` | useReducer state management for block editor |
| `src/lib/hero-block-templates.ts` | 8 starter templates in block format |
| `src/components/admin/hero-block-designer/hero-block-designer.tsx` | Main editor shell (3-panel layout) |
| `src/components/admin/hero-block-designer/block-toolbar.tsx` | Top toolbar |
| `src/components/admin/hero-block-designer/add-panel.tsx` | Left: widget grid + section presets |
| `src/components/admin/hero-block-designer/layers-panel.tsx` | Left: hierarchy tree view |
| `src/components/admin/hero-block-designer/block-canvas.tsx` | Center: live preview editor |
| `src/components/admin/hero-block-designer/block-canvas-section.tsx` | Section rendering in canvas |
| `src/components/admin/hero-block-designer/block-canvas-column.tsx` | Column rendering in canvas |
| `src/components/admin/hero-block-designer/block-canvas-widget.tsx` | Widget rendering in canvas |
| `src/components/admin/hero-block-designer/insertion-point.tsx` | "+" buttons between blocks |
| `src/components/admin/hero-block-designer/settings-panel.tsx` | Right: dynamic settings router |
| `src/components/admin/hero-block-designer/global-settings.tsx` | Right: global hero settings |
| `src/components/admin/hero-block-designer/section-settings.tsx` | Right: section-level controls |
| `src/components/admin/hero-block-designer/column-settings.tsx` | Right: column-level controls |
| `src/components/admin/hero-block-designer/widget-settings.tsx` | Right: widget-level controls |
| `src/components/admin/hero-block-designer/column-layout-picker.tsx` | Visual column layout selector |
| `src/components/admin/hero-block-designer/spacing-input.tsx` | Reusable 4-value padding/margin input |
| `src/components/admin/hero-block-designer/alignment-buttons.tsx` | Reusable alignment icon button group |
| `src/components/admin/hero-block-designer/template-picker.tsx` | Template selection modal |
| `src/components/admin/hero-block-designer/preview-modal.tsx` | Live preview modal |
| `src/components/customer/block-hero-renderer.tsx` | Production renderer for v4 designs |
| `tests/unit/hero-block-defaults.test.ts` | Tests for factory functions |
| `tests/unit/hero-block-schemas.test.ts` | Tests for Zod validation |
| `tests/unit/use-hero-block-designer.test.ts` | Tests for state management |

### Modified Files

| File | Change |
|------|--------|
| `src/app/actions/hero-designer.ts` | Add v4 schema validation branch |
| `src/app/[tenant]/admin/hero-designer/page.tsx` | Route to new block designer |
| `src/app/[tenant]/admin/hero-designer/hero-designer-wrapper.tsx` | Dynamic import new block designer |
| `src/app/[tenant]/menu/menu-client.tsx` | Render `BlockHeroRenderer` for v4 designs |

---

## Task 1: Type Definitions

**Files:**
- Create: `src/types/hero-block-designer.ts`

- [ ] **Step 1: Create the type definitions file**

```typescript
// src/types/hero-block-designer.ts

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export interface SpacingValue {
  top: number
  right: number
  bottom: number
  left: number
}

export interface MarginValue {
  top: number
  bottom: number
}

export type Breakpoint = 'desktop' | 'tablet' | 'mobile'

export interface ElementVisibility {
  desktop: boolean
  tablet: boolean
  mobile: boolean
}

// ---------------------------------------------------------------------------
// Animation (reuse pattern from v3)
// ---------------------------------------------------------------------------

export type AnimationType =
  | 'fadeIn'
  | 'slideUp'
  | 'slideDown'
  | 'slideLeft'
  | 'slideRight'
  | 'scaleIn'
  | 'bounce'
  | 'none'

export interface ElementAnimation {
  type: AnimationType
  duration: number
  delay: number
}

// ---------------------------------------------------------------------------
// Widget Props (discriminated union on `kind`)
// ---------------------------------------------------------------------------

export interface TextWidgetProps {
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

export interface ImageWidgetProps {
  kind: 'image'
  src: string
  alt: string
  objectFit: 'cover' | 'contain' | 'fill'
  borderRadius: number
  opacity: number
}

export interface ButtonWidgetProps {
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

export interface ShapeWidgetProps {
  kind: 'shape'
  shapeType: 'rectangle' | 'circle' | 'rounded-rect'
  fillColor: string
  borderWidth: number
  borderColor: string
  borderRadius: number
  opacity: number
}

export interface DividerWidgetProps {
  kind: 'divider'
  orientation: 'horizontal' | 'vertical'
  thickness: number
  color: string
  style: 'solid' | 'dashed' | 'dotted'
}

export interface SpacerWidgetProps {
  kind: 'spacer'
  height: number
}

export interface IconWidgetProps {
  kind: 'icon'
  iconName: string
  size: number
  color: string
}

export interface VideoWidgetProps {
  kind: 'video'
  videoUrl: string
  autoplay: boolean
  muted: boolean
  loop: boolean
  posterImage: string
}

export interface CountdownWidgetProps {
  kind: 'countdown'
  targetDate: string
  showDays: boolean
  showHours: boolean
  showMinutes: boolean
  showSeconds: boolean
  fontSize: number
  color: string
  separatorColor: string
}

export interface SocialProofWidgetProps {
  kind: 'social-proof'
  presetType: 'orders' | 'merchants' | 'custom'
  text: string
  number: number
  iconName: string
  badgeStyle: 'pill' | 'rounded' | 'square'
  backgroundColor: string
  textColor: string
}

export interface AnimatedBgWidgetProps {
  kind: 'animated-bg'
  gradientType: 'linear' | 'radial' | 'none'
  gradientColors: string[]
  gradientAngle: number
  patternType: 'dots' | 'lines' | 'grid' | 'none'
  patternOpacity: number
  parallax: boolean
}

export type WidgetProps =
  | TextWidgetProps
  | ImageWidgetProps
  | ButtonWidgetProps
  | ShapeWidgetProps
  | DividerWidgetProps
  | SpacerWidgetProps
  | IconWidgetProps
  | VideoWidgetProps
  | CountdownWidgetProps
  | SocialProofWidgetProps
  | AnimatedBgWidgetProps

export type BlockWidgetType = WidgetProps['kind']

// ---------------------------------------------------------------------------
// Widget overrides per breakpoint
// ---------------------------------------------------------------------------

export interface WidgetOverrides {
  alignment?: 'left' | 'center' | 'right' | 'stretch'
  width?: 'auto' | 'full' | number
  margin?: MarginValue
  padding?: SpacingValue
  props?: Partial<WidgetProps>
}

// ---------------------------------------------------------------------------
// Block Widget
// ---------------------------------------------------------------------------

export interface BlockWidget {
  id: string
  type: BlockWidgetType
  label: string
  alignment: 'left' | 'center' | 'right' | 'stretch'
  width: 'auto' | 'full' | number
  margin: MarginValue
  padding: SpacingValue
  props: WidgetProps
  animation: ElementAnimation
  visibility: ElementVisibility
  responsiveOverrides?: {
    tablet?: WidgetOverrides
    mobile?: WidgetOverrides
  }
}

// ---------------------------------------------------------------------------
// Column
// ---------------------------------------------------------------------------

export interface ColumnSettings {
  verticalAlign: 'top' | 'middle' | 'bottom'
  horizontalAlign: 'left' | 'center' | 'right'
  padding: SpacingValue
  background: {
    type: 'none' | 'color'
    color?: string
  }
  borderRadius: number
}

export interface BlockColumn {
  id: string
  width: number
  widgets: BlockWidget[]
  settings: ColumnSettings
  responsiveOverrides?: {
    tablet?: Partial<ColumnSettings>
    mobile?: Partial<ColumnSettings>
  }
}

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------

export interface SectionBackground {
  type: 'none' | 'color' | 'image' | 'gradient' | 'video'
  color?: string
  image?: { url: string; opacity: number; objectFit: 'cover' | 'contain' | 'fill' }
  gradient?: string
  video?: { url: string; opacity: number }
}

export interface SectionSettings {
  contentWidth: 'full' | 'boxed'
  horizontalAlign: 'left' | 'center' | 'right'
  minHeight: number
  background: SectionBackground
  padding: SpacingValue
  margin: MarginValue
}

export interface BlockSection {
  id: string
  label: string
  columns: BlockColumn[]
  settings: SectionSettings
  responsiveOverrides?: {
    tablet?: Partial<SectionSettings>
    mobile?: Partial<SectionSettings>
  }
}

// ---------------------------------------------------------------------------
// Top-level design document
// ---------------------------------------------------------------------------

export interface GlobalStyles {
  backgroundColor: string
  backgroundImage?: { url: string; opacity: number; objectFit: 'cover' | 'contain' | 'fill' }
  maxWidth: number
}

export interface HeroBlockDesign {
  version: 4
  sections: BlockSection[]
  globalStyles: GlobalStyles
}

// ---------------------------------------------------------------------------
// Editor state
// ---------------------------------------------------------------------------

export type BlockSelectionType = 'section' | 'column' | 'widget' | null

export interface BlockSelection {
  type: BlockSelectionType
  sectionId: string
  columnId?: string
  widgetId?: string
}

export interface BlockDesignerState {
  design: HeroBlockDesign
  selection: BlockSelection | null
  activeBreakpoint: Breakpoint
  history: HeroBlockDesign[]
  historyIndex: number
}

// ---------------------------------------------------------------------------
// Column layout presets
// ---------------------------------------------------------------------------

export interface ColumnPreset {
  id: string
  label: string
  widths: number[]
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit src/types/hero-block-designer.ts 2>&1 | head -20`
Expected: No errors (or only errors from missing tsconfig paths which is fine for isolated type file)

- [ ] **Step 3: Commit**

```bash
git add src/types/hero-block-designer.ts
git commit -m "feat: add type definitions for block-based hero designer v4"
```

---

## Task 2: Defaults & Factory Functions

**Files:**
- Create: `src/lib/hero-block-defaults.ts`
- Create: `tests/unit/hero-block-defaults.test.ts`

- [ ] **Step 1: Write failing tests for factory functions**

```typescript
// tests/unit/hero-block-defaults.test.ts
import {
  createBlankBlockDesign,
  createSection,
  createColumn,
  createTextWidget,
  createImageWidget,
  createButtonWidget,
  createSpacerWidget,
  createDividerWidget,
  createVideoWidget,
  createIconWidget,
  createCountdownWidget,
  createSocialProofWidget,
  createAnimatedBgWidget,
  createShapeWidget,
  COLUMN_PRESETS,
  ZERO_SPACING,
  ZERO_MARGIN,
  NO_ANIMATION,
  widgetFactories,
  getActiveWidgetProps,
  getActiveSectionSettings,
  getActiveColumnSettings,
} from '@/lib/hero-block-defaults'
import type { BlockWidget, BlockSection, BlockColumn } from '@/types/hero-block-designer'

describe('hero-block-defaults', () => {
  describe('constants', () => {
    it('ZERO_SPACING has all zeros', () => {
      expect(ZERO_SPACING).toEqual({ top: 0, right: 0, bottom: 0, left: 0 })
    })

    it('ZERO_MARGIN has all zeros', () => {
      expect(ZERO_MARGIN).toEqual({ top: 0, bottom: 0 })
    })

    it('NO_ANIMATION defaults to none', () => {
      expect(NO_ANIMATION).toEqual({ type: 'none', duration: 400, delay: 0 })
    })

    it('COLUMN_PRESETS has expected presets', () => {
      expect(COLUMN_PRESETS.length).toBeGreaterThanOrEqual(6)
      const ids = COLUMN_PRESETS.map(p => p.id)
      expect(ids).toContain('1-col')
      expect(ids).toContain('2-col-equal')
      expect(ids).toContain('3-col-equal')
    })

    it('COLUMN_PRESETS widths sum to 100', () => {
      for (const preset of COLUMN_PRESETS) {
        const sum = preset.widths.reduce((a, b) => a + b, 0)
        expect(sum).toBe(100)
      }
    })
  })

  describe('createBlankBlockDesign', () => {
    it('returns a v4 design with empty sections', () => {
      const design = createBlankBlockDesign()
      expect(design.version).toBe(4)
      expect(design.sections).toEqual([])
      expect(design.globalStyles.backgroundColor).toBe('#ffffff')
      expect(design.globalStyles.maxWidth).toBe(1200)
    })
  })

  describe('createSection', () => {
    it('creates a section with specified column widths', () => {
      const section = createSection([50, 50])
      expect(section.id).toBeTruthy()
      expect(section.columns).toHaveLength(2)
      expect(section.columns[0].width).toBe(50)
      expect(section.columns[1].width).toBe(50)
      expect(section.settings.contentWidth).toBe('boxed')
      expect(section.settings.minHeight).toBe(0)
    })

    it('creates a single column section by default', () => {
      const section = createSection()
      expect(section.columns).toHaveLength(1)
      expect(section.columns[0].width).toBe(100)
    })
  })

  describe('createColumn', () => {
    it('creates a column with default settings', () => {
      const col = createColumn(50)
      expect(col.id).toBeTruthy()
      expect(col.width).toBe(50)
      expect(col.widgets).toEqual([])
      expect(col.settings.verticalAlign).toBe('top')
      expect(col.settings.horizontalAlign).toBe('left')
    })
  })

  describe('widget factories', () => {
    it('createTextWidget returns a text widget', () => {
      const w = createTextWidget()
      expect(w.type).toBe('text')
      expect(w.props.kind).toBe('text')
      expect(w.alignment).toBe('center')
      expect(w.width).toBe('full')
    })

    it('createImageWidget returns an image widget', () => {
      const w = createImageWidget()
      expect(w.type).toBe('image')
      expect(w.props.kind).toBe('image')
    })

    it('createButtonWidget returns a button widget', () => {
      const w = createButtonWidget()
      expect(w.type).toBe('button')
      expect(w.props.kind).toBe('button')
    })

    it('createSpacerWidget returns a spacer widget', () => {
      const w = createSpacerWidget()
      expect(w.type).toBe('spacer')
      expect(w.props.kind).toBe('spacer')
    })

    it('createDividerWidget returns a divider widget', () => {
      const w = createDividerWidget()
      expect(w.type).toBe('divider')
      expect(w.props.kind).toBe('divider')
    })

    it('createVideoWidget returns a video widget', () => {
      const w = createVideoWidget()
      expect(w.type).toBe('video')
      expect(w.props.kind).toBe('video')
    })

    it('createIconWidget returns an icon widget', () => {
      const w = createIconWidget()
      expect(w.type).toBe('icon')
      expect(w.props.kind).toBe('icon')
    })

    it('createCountdownWidget returns a countdown widget', () => {
      const w = createCountdownWidget()
      expect(w.type).toBe('countdown')
      expect(w.props.kind).toBe('countdown')
    })

    it('createSocialProofWidget returns a social-proof widget', () => {
      const w = createSocialProofWidget()
      expect(w.type).toBe('social-proof')
      expect(w.props.kind).toBe('social-proof')
    })

    it('createAnimatedBgWidget returns an animated-bg widget', () => {
      const w = createAnimatedBgWidget()
      expect(w.type).toBe('animated-bg')
      expect(w.props.kind).toBe('animated-bg')
    })

    it('createShapeWidget returns a shape widget', () => {
      const w = createShapeWidget()
      expect(w.type).toBe('shape')
      expect(w.props.kind).toBe('shape')
    })

    it('all widgets have unique IDs', () => {
      const ids = new Set([
        createTextWidget().id,
        createTextWidget().id,
        createImageWidget().id,
      ])
      expect(ids.size).toBe(3)
    })

    it('all widgets have default visibility all true', () => {
      const w = createTextWidget()
      expect(w.visibility).toEqual({ desktop: true, tablet: true, mobile: true })
    })
  })

  describe('widgetFactories map', () => {
    it('has a factory for every widget type', () => {
      const types = ['text', 'image', 'button', 'shape', 'divider', 'spacer', 'icon', 'video', 'countdown', 'social-proof', 'animated-bg'] as const
      for (const t of types) {
        expect(widgetFactories[t]).toBeDefined()
        const w = widgetFactories[t]()
        expect(w.type).toBe(t)
      }
    })
  })

  describe('getActiveWidgetProps', () => {
    it('returns base props for desktop', () => {
      const w = createTextWidget()
      const props = getActiveWidgetProps(w, 'desktop')
      expect(props).toEqual(w.props)
    })

    it('returns tablet overrides when set', () => {
      const w: BlockWidget = {
        ...createTextWidget(),
        responsiveOverrides: {
          tablet: { props: { kind: 'text', fontSize: 24 } as Partial<BlockWidget['props']> as BlockWidget['props'] },
        },
      }
      const props = getActiveWidgetProps(w, 'tablet')
      expect(props.kind).toBe('text')
      if (props.kind === 'text') {
        expect(props.fontSize).toBe(24)
      }
    })

    it('falls back to desktop when no tablet override', () => {
      const w = createTextWidget()
      const props = getActiveWidgetProps(w, 'tablet')
      expect(props).toEqual(w.props)
    })

    it('falls back through tablet to desktop for mobile', () => {
      const w = createTextWidget()
      const props = getActiveWidgetProps(w, 'mobile')
      expect(props).toEqual(w.props)
    })
  })

  describe('getActiveSectionSettings', () => {
    it('returns base settings for desktop', () => {
      const s = createSection()
      const settings = getActiveSectionSettings(s, 'desktop')
      expect(settings).toEqual(s.settings)
    })

    it('merges tablet overrides', () => {
      const s = createSection()
      s.responsiveOverrides = { tablet: { minHeight: 300 } }
      const settings = getActiveSectionSettings(s, 'tablet')
      expect(settings.minHeight).toBe(300)
      expect(settings.contentWidth).toBe(s.settings.contentWidth)
    })
  })

  describe('getActiveColumnSettings', () => {
    it('returns base settings for desktop', () => {
      const col = createColumn(100)
      const settings = getActiveColumnSettings(col, 'desktop')
      expect(settings).toEqual(col.settings)
    })

    it('merges mobile overrides', () => {
      const col = createColumn(50)
      col.responsiveOverrides = { mobile: { verticalAlign: 'bottom' } }
      const settings = getActiveColumnSettings(col, 'mobile')
      expect(settings.verticalAlign).toBe('bottom')
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- --testPathPattern="hero-block-defaults" --no-coverage`
Expected: FAIL — modules not found

- [ ] **Step 3: Implement hero-block-defaults.ts**

```typescript
// src/lib/hero-block-defaults.ts
import { v4 as uuidv4 } from 'uuid'
import type {
  SpacingValue,
  MarginValue,
  ElementAnimation,
  BlockWidget,
  BlockWidgetType,
  WidgetProps,
  TextWidgetProps,
  ImageWidgetProps,
  ButtonWidgetProps,
  ShapeWidgetProps,
  DividerWidgetProps,
  SpacerWidgetProps,
  IconWidgetProps,
  VideoWidgetProps,
  CountdownWidgetProps,
  SocialProofWidgetProps,
  AnimatedBgWidgetProps,
  BlockColumn,
  ColumnSettings,
  BlockSection,
  SectionSettings,
  SectionBackground,
  HeroBlockDesign,
  GlobalStyles,
  ColumnPreset,
  Breakpoint,
  ElementVisibility,
} from '@/types/hero-block-designer'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ZERO_SPACING: SpacingValue = { top: 0, right: 0, bottom: 0, left: 0 }
export const ZERO_MARGIN: MarginValue = { top: 0, bottom: 0 }
export const NO_ANIMATION: ElementAnimation = { type: 'none', duration: 400, delay: 0 }
export const DEFAULT_VISIBILITY: ElementVisibility = { desktop: true, tablet: true, mobile: true }

export const COLUMN_PRESETS: ColumnPreset[] = [
  { id: '1-col', label: '1 Column', widths: [100] },
  { id: '2-col-equal', label: '2 Columns', widths: [50, 50] },
  { id: '2-col-70-30', label: '70 / 30', widths: [70, 30] },
  { id: '2-col-30-70', label: '30 / 70', widths: [30, 70] },
  { id: '3-col-equal', label: '3 Columns', widths: [33, 34, 33] },
  { id: '4-col-equal', label: '4 Columns', widths: [25, 25, 25, 25] },
  { id: '3-col-25-50-25', label: '25 / 50 / 25', widths: [25, 50, 25] },
]

// ---------------------------------------------------------------------------
// Factory: Column
// ---------------------------------------------------------------------------

export function createColumn(width: number): BlockColumn {
  return {
    id: uuidv4(),
    width,
    widgets: [],
    settings: {
      verticalAlign: 'top',
      horizontalAlign: 'left',
      padding: { ...ZERO_SPACING },
      background: { type: 'none' },
      borderRadius: 0,
    },
  }
}

// ---------------------------------------------------------------------------
// Factory: Section
// ---------------------------------------------------------------------------

const DEFAULT_SECTION_BACKGROUND: SectionBackground = { type: 'none' }

export function createSection(columnWidths?: number[]): BlockSection {
  const widths = columnWidths ?? [100]
  return {
    id: uuidv4(),
    label: 'Section',
    columns: widths.map((w) => createColumn(w)),
    settings: {
      contentWidth: 'boxed',
      horizontalAlign: 'center',
      minHeight: 0,
      background: { ...DEFAULT_SECTION_BACKGROUND },
      padding: { top: 40, right: 20, bottom: 40, left: 20 },
      margin: { ...ZERO_MARGIN },
    },
  }
}

// ---------------------------------------------------------------------------
// Factory: Widgets
// ---------------------------------------------------------------------------

function baseWidget(type: BlockWidgetType, label: string, props: WidgetProps): BlockWidget {
  return {
    id: uuidv4(),
    type,
    label,
    alignment: 'center',
    width: 'full' as const,
    margin: { ...ZERO_MARGIN },
    padding: { ...ZERO_SPACING },
    props,
    animation: { ...NO_ANIMATION },
    visibility: { ...DEFAULT_VISIBILITY },
  }
}

export function createTextWidget(): BlockWidget {
  const props: TextWidgetProps = {
    kind: 'text',
    content: 'Your Heading Here',
    fontFamily: 'Inter',
    fontSize: 48,
    fontWeight: 700,
    lineHeight: 1.2,
    letterSpacing: 0,
    color: '#000000',
    textAlign: 'center',
    textShadow: '',
    bold: true,
    italic: false,
    underline: false,
  }
  return baseWidget('text', 'Heading', props)
}

export function createImageWidget(): BlockWidget {
  const props: ImageWidgetProps = {
    kind: 'image',
    src: '',
    alt: '',
    objectFit: 'cover',
    borderRadius: 0,
    opacity: 1,
  }
  return { ...baseWidget('image', 'Image', props), width: 'auto' as const }
}

export function createButtonWidget(): BlockWidget {
  const props: ButtonWidgetProps = {
    kind: 'button',
    text: 'Order Now',
    linkUrl: '',
    linkTarget: '_self',
    backgroundColor: '#FF3B30',
    textColor: '#FFFFFF',
    borderWidth: 0,
    borderColor: '#000000',
    borderRadius: 8,
    hoverEffect: 'darken',
    fontSize: 16,
    fontWeight: 600,
  }
  return { ...baseWidget('button', 'Button', props), width: 'auto' as const }
}

export function createShapeWidget(): BlockWidget {
  const props: ShapeWidgetProps = {
    kind: 'shape',
    shapeType: 'rectangle',
    fillColor: '#E5E7EB',
    borderWidth: 0,
    borderColor: '#000000',
    borderRadius: 0,
    opacity: 1,
  }
  return baseWidget('shape', 'Shape', props)
}

export function createDividerWidget(): BlockWidget {
  const props: DividerWidgetProps = {
    kind: 'divider',
    orientation: 'horizontal',
    thickness: 2,
    color: '#D1D5DB',
    style: 'solid',
  }
  return baseWidget('divider', 'Divider', props)
}

export function createSpacerWidget(): BlockWidget {
  const props: SpacerWidgetProps = {
    kind: 'spacer',
    height: 40,
  }
  return baseWidget('spacer', 'Spacer', props)
}

export function createIconWidget(): BlockWidget {
  const props: IconWidgetProps = {
    kind: 'icon',
    iconName: 'Star',
    size: 48,
    color: '#000000',
  }
  return { ...baseWidget('icon', 'Icon', props), width: 'auto' as const }
}

export function createVideoWidget(): BlockWidget {
  const props: VideoWidgetProps = {
    kind: 'video',
    videoUrl: '',
    autoplay: true,
    muted: true,
    loop: true,
    posterImage: '',
  }
  return baseWidget('video', 'Video', props)
}

export function createCountdownWidget(): BlockWidget {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const props: CountdownWidgetProps = {
    kind: 'countdown',
    targetDate: tomorrow.toISOString(),
    showDays: true,
    showHours: true,
    showMinutes: true,
    showSeconds: true,
    fontSize: 36,
    color: '#000000',
    separatorColor: '#6B7280',
  }
  return baseWidget('countdown', 'Countdown', props)
}

export function createSocialProofWidget(): BlockWidget {
  const props: SocialProofWidgetProps = {
    kind: 'social-proof',
    presetType: 'orders',
    text: 'Orders Served',
    number: 10000,
    iconName: 'ShoppingCart',
    badgeStyle: 'pill',
    backgroundColor: '#000000',
    textColor: '#FFFFFF',
  }
  return { ...baseWidget('social-proof', 'Social Proof', props), width: 'auto' as const }
}

export function createAnimatedBgWidget(): BlockWidget {
  const props: AnimatedBgWidgetProps = {
    kind: 'animated-bg',
    gradientType: 'linear',
    gradientColors: ['#667eea', '#764ba2'],
    gradientAngle: 135,
    patternType: 'none',
    patternOpacity: 0.1,
    parallax: false,
  }
  return baseWidget('animated-bg', 'Animated Background', props)
}

// ---------------------------------------------------------------------------
// Widget factory map
// ---------------------------------------------------------------------------

export const widgetFactories: Record<BlockWidgetType, () => BlockWidget> = {
  'text': createTextWidget,
  'image': createImageWidget,
  'button': createButtonWidget,
  'shape': createShapeWidget,
  'divider': createDividerWidget,
  'spacer': createSpacerWidget,
  'icon': createIconWidget,
  'video': createVideoWidget,
  'countdown': createCountdownWidget,
  'social-proof': createSocialProofWidget,
  'animated-bg': createAnimatedBgWidget,
}

// ---------------------------------------------------------------------------
// Blank design
// ---------------------------------------------------------------------------

export function createBlankBlockDesign(): HeroBlockDesign {
  return {
    version: 4,
    sections: [],
    globalStyles: {
      backgroundColor: '#ffffff',
      maxWidth: 1200,
    },
  }
}

// ---------------------------------------------------------------------------
// Responsive resolution helpers
// ---------------------------------------------------------------------------

export function getActiveWidgetProps(widget: BlockWidget, breakpoint: Breakpoint): WidgetProps {
  if (breakpoint === 'desktop') return widget.props

  const overrides = widget.responsiveOverrides
  if (!overrides) return widget.props

  if (breakpoint === 'tablet') {
    const tabletProps = overrides.tablet?.props
    if (tabletProps) return { ...widget.props, ...tabletProps } as WidgetProps
    return widget.props
  }

  // mobile: try mobile override, then tablet override, then base
  const mobileProps = overrides.mobile?.props
  if (mobileProps) return { ...widget.props, ...mobileProps } as WidgetProps

  const tabletProps = overrides.tablet?.props
  if (tabletProps) return { ...widget.props, ...tabletProps } as WidgetProps

  return widget.props
}

export function getActiveSectionSettings(section: BlockSection, breakpoint: Breakpoint): SectionSettings {
  if (breakpoint === 'desktop') return section.settings

  const overrides = section.responsiveOverrides
  if (!overrides) return section.settings

  if (breakpoint === 'tablet') {
    const tabletOverrides = overrides.tablet
    if (tabletOverrides) return { ...section.settings, ...tabletOverrides }
    return section.settings
  }

  const mobileOverrides = overrides.mobile
  if (mobileOverrides) return { ...section.settings, ...mobileOverrides }

  const tabletOverrides = overrides.tablet
  if (tabletOverrides) return { ...section.settings, ...tabletOverrides }

  return section.settings
}

export function getActiveColumnSettings(column: BlockColumn, breakpoint: Breakpoint): ColumnSettings {
  if (breakpoint === 'desktop') return column.settings

  const overrides = column.responsiveOverrides
  if (!overrides) return column.settings

  if (breakpoint === 'tablet') {
    const tabletOverrides = overrides.tablet
    if (tabletOverrides) return { ...column.settings, ...tabletOverrides }
    return column.settings
  }

  const mobileOverrides = overrides.mobile
  if (mobileOverrides) return { ...column.settings, ...mobileOverrides }

  const tabletOverrides = overrides.tablet
  if (tabletOverrides) return { ...column.settings, ...tabletOverrides }

  return column.settings
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- --testPathPattern="hero-block-defaults" --no-coverage`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/hero-block-defaults.ts tests/unit/hero-block-defaults.test.ts
git commit -m "feat: add factory functions and defaults for block hero designer"
```

---

## Task 3: Zod Validation Schemas

**Files:**
- Create: `src/lib/hero-block-schemas.ts`
- Create: `tests/unit/hero-block-schemas.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/unit/hero-block-schemas.test.ts
import { heroBlockDesignSchema } from '@/lib/hero-block-schemas'
import { createBlankBlockDesign, createSection, createTextWidget, createButtonWidget } from '@/lib/hero-block-defaults'
import type { HeroBlockDesign } from '@/types/hero-block-designer'

describe('hero-block-schemas', () => {
  describe('heroBlockDesignSchema', () => {
    it('validates a blank design', () => {
      const design = createBlankBlockDesign()
      const result = heroBlockDesignSchema.safeParse(design)
      expect(result.success).toBe(true)
    })

    it('validates a design with sections and widgets', () => {
      const design = createBlankBlockDesign()
      const section = createSection([50, 50])
      section.columns[0].widgets.push(createTextWidget())
      section.columns[1].widgets.push(createButtonWidget())
      design.sections.push(section)

      const result = heroBlockDesignSchema.safeParse(design)
      expect(result.success).toBe(true)
    })

    it('rejects version !== 4', () => {
      const design = { ...createBlankBlockDesign(), version: 3 }
      const result = heroBlockDesignSchema.safeParse(design)
      expect(result.success).toBe(false)
    })

    it('rejects more than 10 sections', () => {
      const design = createBlankBlockDesign()
      for (let i = 0; i < 11; i++) {
        design.sections.push(createSection())
      }
      const result = heroBlockDesignSchema.safeParse(design)
      expect(result.success).toBe(false)
    })

    it('rejects CSS injection in colors', () => {
      const design = createBlankBlockDesign()
      design.globalStyles.backgroundColor = '<script>alert(1)</script>'
      const result = heroBlockDesignSchema.safeParse(design)
      expect(result.success).toBe(false)
    })

    it('rejects more than 6 columns in a section', () => {
      const design = createBlankBlockDesign()
      const section = createSection([16, 17, 17, 16, 17, 17])
      // Add a 7th column manually
      const col = { ...section.columns[0], id: 'extra-col', width: 0 }
      section.columns.push(col)
      design.sections.push(section)
      const result = heroBlockDesignSchema.safeParse(design)
      expect(result.success).toBe(false)
    })

    it('rejects more than 20 widgets per column', () => {
      const design = createBlankBlockDesign()
      const section = createSection()
      for (let i = 0; i < 21; i++) {
        section.columns[0].widgets.push(createTextWidget())
      }
      design.sections.push(section)
      const result = heroBlockDesignSchema.safeParse(design)
      expect(result.success).toBe(false)
    })

    it('validates responsive overrides on widgets', () => {
      const design = createBlankBlockDesign()
      const section = createSection()
      const widget = createTextWidget()
      widget.responsiveOverrides = {
        tablet: { alignment: 'left', width: 80 },
        mobile: { alignment: 'stretch', width: 'full' },
      }
      section.columns[0].widgets.push(widget)
      design.sections.push(section)
      const result = heroBlockDesignSchema.safeParse(design)
      expect(result.success).toBe(true)
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- --testPathPattern="hero-block-schemas" --no-coverage`
Expected: FAIL

- [ ] **Step 3: Implement hero-block-schemas.ts**

```typescript
// src/lib/hero-block-schemas.ts
import { z } from 'zod'

// ---------------------------------------------------------------------------
// CSS injection guard (same as v3)
// ---------------------------------------------------------------------------

function cssColorString() {
  return z.string().max(100).refine(
    (v) => !/[<>"';{}]/.test(v),
    { message: 'Invalid characters in color value' },
  )
}

function safeString(maxLen: number) {
  return z.string().max(maxLen).refine(
    (v) => !/[<>]/.test(v),
    { message: 'Invalid characters' },
  )
}

function safeUrl() {
  return z.string().max(2000).url().or(z.literal(''))
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const spacingSchema = z.object({
  top: z.number().min(0).max(500),
  right: z.number().min(0).max(500),
  bottom: z.number().min(0).max(500),
  left: z.number().min(0).max(500),
})

const marginSchema = z.object({
  top: z.number().min(0).max(500),
  bottom: z.number().min(0).max(500),
})

const visibilitySchema = z.object({
  desktop: z.boolean(),
  tablet: z.boolean(),
  mobile: z.boolean(),
})

const animationTypeSchema = z.enum([
  'fadeIn', 'slideUp', 'slideDown', 'slideLeft', 'slideRight', 'scaleIn', 'bounce', 'none',
])

const animationSchema = z.object({
  type: animationTypeSchema,
  duration: z.number().min(0).max(10000),
  delay: z.number().min(0).max(10000),
})

// ---------------------------------------------------------------------------
// Widget props schemas (discriminated union)
// ---------------------------------------------------------------------------

const textPropsSchema = z.object({
  kind: z.literal('text'),
  content: safeString(5000),
  fontFamily: safeString(100),
  fontSize: z.number().min(8).max(200),
  fontWeight: z.number().min(100).max(900),
  lineHeight: z.number().min(0.5).max(5),
  letterSpacing: z.number().min(-10).max(50),
  color: cssColorString(),
  textAlign: z.enum(['left', 'center', 'right']),
  textShadow: safeString(200),
  bold: z.boolean(),
  italic: z.boolean(),
  underline: z.boolean(),
})

const imagePropsSchema = z.object({
  kind: z.literal('image'),
  src: z.string().max(2000),
  alt: safeString(500),
  objectFit: z.enum(['cover', 'contain', 'fill']),
  borderRadius: z.number().min(0).max(500),
  opacity: z.number().min(0).max(1),
})

const buttonPropsSchema = z.object({
  kind: z.literal('button'),
  text: safeString(500),
  linkUrl: z.string().max(2000),
  linkTarget: z.enum(['_blank', '_self']),
  backgroundColor: cssColorString(),
  textColor: cssColorString(),
  borderWidth: z.number().min(0).max(20),
  borderColor: cssColorString(),
  borderRadius: z.number().min(0).max(500),
  hoverEffect: z.enum(['darken', 'lighten', 'scale', 'none']),
  fontSize: z.number().min(8).max(200),
  fontWeight: z.number().min(100).max(900),
})

const shapePropsSchema = z.object({
  kind: z.literal('shape'),
  shapeType: z.enum(['rectangle', 'circle', 'rounded-rect']),
  fillColor: cssColorString(),
  borderWidth: z.number().min(0).max(20),
  borderColor: cssColorString(),
  borderRadius: z.number().min(0).max(500),
  opacity: z.number().min(0).max(1),
})

const dividerPropsSchema = z.object({
  kind: z.literal('divider'),
  orientation: z.enum(['horizontal', 'vertical']),
  thickness: z.number().min(1).max(50),
  color: cssColorString(),
  style: z.enum(['solid', 'dashed', 'dotted']),
})

const spacerPropsSchema = z.object({
  kind: z.literal('spacer'),
  height: z.number().min(0).max(500),
})

const iconPropsSchema = z.object({
  kind: z.literal('icon'),
  iconName: safeString(100),
  size: z.number().min(8).max(512),
  color: cssColorString(),
})

const videoPropsSchema = z.object({
  kind: z.literal('video'),
  videoUrl: z.string().max(2000),
  autoplay: z.boolean(),
  muted: z.boolean(),
  loop: z.boolean(),
  posterImage: z.string().max(2000),
})

const countdownPropsSchema = z.object({
  kind: z.literal('countdown'),
  targetDate: z.string().max(100),
  showDays: z.boolean(),
  showHours: z.boolean(),
  showMinutes: z.boolean(),
  showSeconds: z.boolean(),
  fontSize: z.number().min(8).max(200),
  color: cssColorString(),
  separatorColor: cssColorString(),
})

const socialProofPropsSchema = z.object({
  kind: z.literal('social-proof'),
  presetType: z.enum(['orders', 'merchants', 'custom']),
  text: safeString(500),
  number: z.number().min(0).max(99999999),
  iconName: safeString(100),
  badgeStyle: z.enum(['pill', 'rounded', 'square']),
  backgroundColor: cssColorString(),
  textColor: cssColorString(),
})

const animatedBgPropsSchema = z.object({
  kind: z.literal('animated-bg'),
  gradientType: z.enum(['linear', 'radial', 'none']),
  gradientColors: z.array(cssColorString()).max(10),
  gradientAngle: z.number().min(0).max(360),
  patternType: z.enum(['dots', 'lines', 'grid', 'none']),
  patternOpacity: z.number().min(0).max(1),
  parallax: z.boolean(),
})

const widgetPropsSchema = z.discriminatedUnion('kind', [
  textPropsSchema,
  imagePropsSchema,
  buttonPropsSchema,
  shapePropsSchema,
  dividerPropsSchema,
  spacerPropsSchema,
  iconPropsSchema,
  videoPropsSchema,
  countdownPropsSchema,
  socialProofPropsSchema,
  animatedBgPropsSchema,
])

// ---------------------------------------------------------------------------
// Widget overrides
// ---------------------------------------------------------------------------

const widgetOverridesSchema = z.object({
  alignment: z.enum(['left', 'center', 'right', 'stretch']).optional(),
  width: z.union([z.literal('auto'), z.literal('full'), z.number().min(1).max(100)]).optional(),
  margin: marginSchema.optional(),
  padding: spacingSchema.optional(),
  props: widgetPropsSchema.partial().optional(),
}).optional()

// ---------------------------------------------------------------------------
// Widget
// ---------------------------------------------------------------------------

const widgetSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['text', 'image', 'button', 'shape', 'divider', 'spacer', 'icon', 'video', 'countdown', 'social-proof', 'animated-bg']),
  label: safeString(100),
  alignment: z.enum(['left', 'center', 'right', 'stretch']),
  width: z.union([z.literal('auto'), z.literal('full'), z.number().min(1).max(100)]),
  margin: marginSchema,
  padding: spacingSchema,
  props: widgetPropsSchema,
  animation: animationSchema,
  visibility: visibilitySchema,
  responsiveOverrides: z.object({
    tablet: widgetOverridesSchema,
    mobile: widgetOverridesSchema,
  }).optional(),
})

// ---------------------------------------------------------------------------
// Column
// ---------------------------------------------------------------------------

const columnBackgroundSchema = z.object({
  type: z.enum(['none', 'color']),
  color: cssColorString().optional(),
})

const columnSettingsSchema = z.object({
  verticalAlign: z.enum(['top', 'middle', 'bottom']),
  horizontalAlign: z.enum(['left', 'center', 'right']),
  padding: spacingSchema,
  background: columnBackgroundSchema,
  borderRadius: z.number().min(0).max(500),
})

const columnSchema = z.object({
  id: z.string().uuid(),
  width: z.number().min(1).max(100),
  widgets: z.array(widgetSchema).max(20),
  settings: columnSettingsSchema,
  responsiveOverrides: z.object({
    tablet: columnSettingsSchema.partial().optional(),
    mobile: columnSettingsSchema.partial().optional(),
  }).optional(),
})

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------

const sectionBackgroundSchema = z.object({
  type: z.enum(['none', 'color', 'image', 'gradient', 'video']),
  color: cssColorString().optional(),
  image: z.object({
    url: safeUrl(),
    opacity: z.number().min(0).max(1),
    objectFit: z.enum(['cover', 'contain', 'fill']),
  }).optional(),
  gradient: safeString(500).optional(),
  video: z.object({
    url: safeUrl(),
    opacity: z.number().min(0).max(1),
  }).optional(),
})

const sectionSettingsSchema = z.object({
  contentWidth: z.enum(['full', 'boxed']),
  horizontalAlign: z.enum(['left', 'center', 'right']),
  minHeight: z.number().min(0).max(2000),
  background: sectionBackgroundSchema,
  padding: spacingSchema,
  margin: marginSchema,
})

const sectionSchema = z.object({
  id: z.string().uuid(),
  label: safeString(100),
  columns: z.array(columnSchema).min(1).max(6),
  settings: sectionSettingsSchema,
  responsiveOverrides: z.object({
    tablet: sectionSettingsSchema.partial().optional(),
    mobile: sectionSettingsSchema.partial().optional(),
  }).optional(),
})

// ---------------------------------------------------------------------------
// Global styles
// ---------------------------------------------------------------------------

const globalStylesSchema = z.object({
  backgroundColor: cssColorString(),
  backgroundImage: z.object({
    url: safeUrl(),
    opacity: z.number().min(0).max(1),
    objectFit: z.enum(['cover', 'contain', 'fill']),
  }).optional(),
  maxWidth: z.number().min(320).max(2560),
})

// ---------------------------------------------------------------------------
// Top-level design
// ---------------------------------------------------------------------------

export const heroBlockDesignSchema = z.object({
  version: z.literal(4),
  sections: z.array(sectionSchema).max(10),
  globalStyles: globalStylesSchema,
})

export type ValidatedHeroBlockDesign = z.infer<typeof heroBlockDesignSchema>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- --testPathPattern="hero-block-schemas" --no-coverage`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/hero-block-schemas.ts tests/unit/hero-block-schemas.test.ts
git commit -m "feat: add Zod validation schemas for block hero designer v4"
```

---

## Task 4: State Management Hook

**Files:**
- Create: `src/hooks/use-hero-block-designer.ts`
- Create: `tests/unit/use-hero-block-designer.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/unit/use-hero-block-designer.test.ts
import { blockDesignerReducer } from '@/hooks/use-hero-block-designer'
import {
  createBlankBlockDesign,
  createSection,
  createTextWidget,
  createButtonWidget,
} from '@/lib/hero-block-defaults'
import type { BlockDesignerState } from '@/types/hero-block-designer'

function makeState(overrides?: Partial<BlockDesignerState>): BlockDesignerState {
  return {
    design: createBlankBlockDesign(),
    selection: null,
    activeBreakpoint: 'desktop',
    history: [],
    historyIndex: -1,
    ...overrides,
  }
}

describe('blockDesignerReducer', () => {
  describe('SET_DESIGN', () => {
    it('replaces the design and clears selection', () => {
      const state = makeState({ selection: { type: 'widget', sectionId: 'x', columnId: 'y', widgetId: 'z' } })
      const newDesign = createBlankBlockDesign()
      newDesign.sections.push(createSection())
      const next = blockDesignerReducer(state, { type: 'SET_DESIGN', design: newDesign })
      expect(next.design.sections).toHaveLength(1)
      expect(next.selection).toBeNull()
      expect(next.history).toEqual([])
      expect(next.historyIndex).toBe(-1)
    })
  })

  describe('ADD_SECTION', () => {
    it('adds a section with specified column widths', () => {
      const state = makeState()
      const next = blockDesignerReducer(state, { type: 'ADD_SECTION', columnWidths: [50, 50] })
      expect(next.design.sections).toHaveLength(1)
      expect(next.design.sections[0].columns).toHaveLength(2)
      expect(next.selection?.type).toBe('section')
    })

    it('inserts after specified index', () => {
      const design = createBlankBlockDesign()
      design.sections.push(createSection())
      design.sections.push(createSection())
      const state = makeState({ design })
      const next = blockDesignerReducer(state, { type: 'ADD_SECTION', columnWidths: [100], afterIndex: 0 })
      expect(next.design.sections).toHaveLength(3)
      expect(next.selection?.sectionId).toBe(next.design.sections[1].id)
    })
  })

  describe('REMOVE_SECTION', () => {
    it('removes a section by id', () => {
      const design = createBlankBlockDesign()
      const section = createSection()
      design.sections.push(section)
      const state = makeState({ design })
      const next = blockDesignerReducer(state, { type: 'REMOVE_SECTION', sectionId: section.id })
      expect(next.design.sections).toHaveLength(0)
      expect(next.selection).toBeNull()
    })
  })

  describe('DUPLICATE_SECTION', () => {
    it('duplicates a section after the original', () => {
      const design = createBlankBlockDesign()
      const section = createSection()
      section.columns[0].widgets.push(createTextWidget())
      design.sections.push(section)
      const state = makeState({ design })
      const next = blockDesignerReducer(state, { type: 'DUPLICATE_SECTION', sectionId: section.id })
      expect(next.design.sections).toHaveLength(2)
      expect(next.design.sections[1].id).not.toBe(section.id)
      expect(next.design.sections[1].columns[0].widgets).toHaveLength(1)
      expect(next.design.sections[1].columns[0].widgets[0].id).not.toBe(section.columns[0].widgets[0].id)
    })
  })

  describe('REORDER_SECTIONS', () => {
    it('reorders sections by ID array', () => {
      const design = createBlankBlockDesign()
      const s1 = createSection()
      const s2 = createSection()
      design.sections.push(s1, s2)
      const state = makeState({ design })
      const next = blockDesignerReducer(state, { type: 'REORDER_SECTIONS', sectionIds: [s2.id, s1.id] })
      expect(next.design.sections[0].id).toBe(s2.id)
      expect(next.design.sections[1].id).toBe(s1.id)
    })
  })

  describe('UPDATE_SECTION_SETTINGS', () => {
    it('updates section settings', () => {
      const design = createBlankBlockDesign()
      const section = createSection()
      design.sections.push(section)
      const state = makeState({ design })
      const next = blockDesignerReducer(state, {
        type: 'UPDATE_SECTION_SETTINGS',
        sectionId: section.id,
        settings: { minHeight: 400 },
      })
      expect(next.design.sections[0].settings.minHeight).toBe(400)
    })

    it('stores overrides for non-desktop breakpoints', () => {
      const design = createBlankBlockDesign()
      const section = createSection()
      design.sections.push(section)
      const state = makeState({ design, activeBreakpoint: 'tablet' })
      const next = blockDesignerReducer(state, {
        type: 'UPDATE_SECTION_SETTINGS',
        sectionId: section.id,
        settings: { minHeight: 200 },
        breakpoint: 'tablet',
      })
      expect(next.design.sections[0].responsiveOverrides?.tablet?.minHeight).toBe(200)
      expect(next.design.sections[0].settings.minHeight).toBe(0) // unchanged
    })
  })

  describe('SET_COLUMN_LAYOUT', () => {
    it('changes column layout preserving widgets', () => {
      const design = createBlankBlockDesign()
      const section = createSection([100])
      section.columns[0].widgets.push(createTextWidget())
      section.columns[0].widgets.push(createButtonWidget())
      design.sections.push(section)
      const state = makeState({ design })
      const next = blockDesignerReducer(state, {
        type: 'SET_COLUMN_LAYOUT',
        sectionId: section.id,
        widths: [50, 50],
      })
      expect(next.design.sections[0].columns).toHaveLength(2)
      // Widgets from old columns should be in first new column
      expect(next.design.sections[0].columns[0].widgets).toHaveLength(2)
      expect(next.design.sections[0].columns[1].widgets).toHaveLength(0)
    })
  })

  describe('ADD_WIDGET', () => {
    it('adds a widget to a column', () => {
      const design = createBlankBlockDesign()
      const section = createSection()
      design.sections.push(section)
      const columnId = section.columns[0].id
      const state = makeState({ design })
      const next = blockDesignerReducer(state, {
        type: 'ADD_WIDGET',
        sectionId: section.id,
        columnId,
        widgetType: 'text',
      })
      expect(next.design.sections[0].columns[0].widgets).toHaveLength(1)
      expect(next.design.sections[0].columns[0].widgets[0].type).toBe('text')
      expect(next.selection?.type).toBe('widget')
    })

    it('inserts at specified index', () => {
      const design = createBlankBlockDesign()
      const section = createSection()
      section.columns[0].widgets.push(createTextWidget())
      section.columns[0].widgets.push(createButtonWidget())
      design.sections.push(section)
      const columnId = section.columns[0].id
      const state = makeState({ design })
      const next = blockDesignerReducer(state, {
        type: 'ADD_WIDGET',
        sectionId: section.id,
        columnId,
        widgetType: 'image',
        atIndex: 1,
      })
      expect(next.design.sections[0].columns[0].widgets).toHaveLength(3)
      expect(next.design.sections[0].columns[0].widgets[1].type).toBe('image')
    })
  })

  describe('REMOVE_WIDGET', () => {
    it('removes a widget', () => {
      const design = createBlankBlockDesign()
      const section = createSection()
      const widget = createTextWidget()
      section.columns[0].widgets.push(widget)
      design.sections.push(section)
      const state = makeState({ design })
      const next = blockDesignerReducer(state, {
        type: 'REMOVE_WIDGET',
        sectionId: section.id,
        columnId: section.columns[0].id,
        widgetId: widget.id,
      })
      expect(next.design.sections[0].columns[0].widgets).toHaveLength(0)
    })
  })

  describe('DUPLICATE_WIDGET', () => {
    it('duplicates a widget after the original', () => {
      const design = createBlankBlockDesign()
      const section = createSection()
      const widget = createTextWidget()
      section.columns[0].widgets.push(widget)
      design.sections.push(section)
      const state = makeState({ design })
      const next = blockDesignerReducer(state, {
        type: 'DUPLICATE_WIDGET',
        sectionId: section.id,
        columnId: section.columns[0].id,
        widgetId: widget.id,
      })
      const widgets = next.design.sections[0].columns[0].widgets
      expect(widgets).toHaveLength(2)
      expect(widgets[1].id).not.toBe(widget.id)
      expect(widgets[1].type).toBe('text')
    })
  })

  describe('MOVE_WIDGET', () => {
    it('moves a widget between columns', () => {
      const design = createBlankBlockDesign()
      const section = createSection([50, 50])
      const widget = createTextWidget()
      section.columns[0].widgets.push(widget)
      design.sections.push(section)
      const state = makeState({ design })
      const next = blockDesignerReducer(state, {
        type: 'MOVE_WIDGET',
        fromSectionId: section.id,
        fromColumnId: section.columns[0].id,
        widgetId: widget.id,
        toSectionId: section.id,
        toColumnId: section.columns[1].id,
        toIndex: 0,
      })
      expect(next.design.sections[0].columns[0].widgets).toHaveLength(0)
      expect(next.design.sections[0].columns[1].widgets).toHaveLength(1)
      expect(next.design.sections[0].columns[1].widgets[0].id).toBe(widget.id)
    })
  })

  describe('REORDER_WIDGETS', () => {
    it('reorders widgets within a column', () => {
      const design = createBlankBlockDesign()
      const section = createSection()
      const w1 = createTextWidget()
      const w2 = createButtonWidget()
      section.columns[0].widgets.push(w1, w2)
      design.sections.push(section)
      const state = makeState({ design })
      const next = blockDesignerReducer(state, {
        type: 'REORDER_WIDGETS',
        sectionId: section.id,
        columnId: section.columns[0].id,
        widgetIds: [w2.id, w1.id],
      })
      expect(next.design.sections[0].columns[0].widgets[0].id).toBe(w2.id)
      expect(next.design.sections[0].columns[0].widgets[1].id).toBe(w1.id)
    })
  })

  describe('UPDATE_WIDGET_PROPS', () => {
    it('updates widget props for desktop', () => {
      const design = createBlankBlockDesign()
      const section = createSection()
      const widget = createTextWidget()
      section.columns[0].widgets.push(widget)
      design.sections.push(section)
      const state = makeState({ design })
      const next = blockDesignerReducer(state, {
        type: 'UPDATE_WIDGET_PROPS',
        sectionId: section.id,
        columnId: section.columns[0].id,
        widgetId: widget.id,
        props: { kind: 'text', fontSize: 72 },
      })
      const updatedWidget = next.design.sections[0].columns[0].widgets[0]
      if (updatedWidget.props.kind === 'text') {
        expect(updatedWidget.props.fontSize).toBe(72)
      }
    })
  })

  describe('UPDATE_WIDGET_SETTINGS', () => {
    it('updates widget alignment and width', () => {
      const design = createBlankBlockDesign()
      const section = createSection()
      const widget = createTextWidget()
      section.columns[0].widgets.push(widget)
      design.sections.push(section)
      const state = makeState({ design })
      const next = blockDesignerReducer(state, {
        type: 'UPDATE_WIDGET_SETTINGS',
        sectionId: section.id,
        columnId: section.columns[0].id,
        widgetId: widget.id,
        settings: { alignment: 'left', width: 80 },
      })
      const updatedWidget = next.design.sections[0].columns[0].widgets[0]
      expect(updatedWidget.alignment).toBe('left')
      expect(updatedWidget.width).toBe(80)
    })
  })

  describe('UPDATE_COLUMN_SETTINGS', () => {
    it('updates column settings', () => {
      const design = createBlankBlockDesign()
      const section = createSection()
      design.sections.push(section)
      const state = makeState({ design })
      const next = blockDesignerReducer(state, {
        type: 'UPDATE_COLUMN_SETTINGS',
        sectionId: section.id,
        columnId: section.columns[0].id,
        settings: { verticalAlign: 'middle' },
      })
      expect(next.design.sections[0].columns[0].settings.verticalAlign).toBe('middle')
    })
  })

  describe('SELECT_BLOCK', () => {
    it('selects a section', () => {
      const state = makeState()
      const next = blockDesignerReducer(state, {
        type: 'SELECT_BLOCK',
        selection: { type: 'section', sectionId: 'abc' },
      })
      expect(next.selection).toEqual({ type: 'section', sectionId: 'abc' })
    })

    it('clears selection with null', () => {
      const state = makeState({ selection: { type: 'section', sectionId: 'abc' } })
      const next = blockDesignerReducer(state, { type: 'SELECT_BLOCK', selection: null })
      expect(next.selection).toBeNull()
    })
  })

  describe('SET_BREAKPOINT', () => {
    it('changes the active breakpoint', () => {
      const state = makeState()
      const next = blockDesignerReducer(state, { type: 'SET_BREAKPOINT', breakpoint: 'mobile' })
      expect(next.activeBreakpoint).toBe('mobile')
    })
  })

  describe('UPDATE_GLOBAL_STYLES', () => {
    it('updates global styles', () => {
      const state = makeState()
      const next = blockDesignerReducer(state, {
        type: 'UPDATE_GLOBAL_STYLES',
        styles: { backgroundColor: '#000000', maxWidth: 960 },
      })
      expect(next.design.globalStyles.backgroundColor).toBe('#000000')
      expect(next.design.globalStyles.maxWidth).toBe(960)
    })
  })

  describe('UNDO / REDO', () => {
    it('undoes and redoes changes', () => {
      const state = makeState()
      const s1 = blockDesignerReducer(state, { type: 'ADD_SECTION', columnWidths: [100] })
      expect(s1.design.sections).toHaveLength(1)
      expect(s1.history).toHaveLength(1)

      const s2 = blockDesignerReducer(s1, { type: 'UNDO' })
      expect(s2.design.sections).toHaveLength(0)

      const s3 = blockDesignerReducer(s2, { type: 'REDO' })
      expect(s3.design.sections).toHaveLength(1)
    })
  })

  describe('RENAME_SECTION', () => {
    it('renames a section', () => {
      const design = createBlankBlockDesign()
      const section = createSection()
      design.sections.push(section)
      const state = makeState({ design })
      const next = blockDesignerReducer(state, {
        type: 'RENAME_SECTION',
        sectionId: section.id,
        label: 'Hero Banner',
      })
      expect(next.design.sections[0].label).toBe('Hero Banner')
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- --testPathPattern="use-hero-block-designer" --no-coverage`
Expected: FAIL

- [ ] **Step 3: Implement use-hero-block-designer.ts**

```typescript
// src/hooks/use-hero-block-designer.ts
'use client'

import { useCallback, useReducer, useMemo } from 'react'
import { v4 as uuidv4 } from 'uuid'
import {
  createBlankBlockDesign,
  createSection,
  createColumn,
  widgetFactories,
} from '@/lib/hero-block-defaults'
import type {
  HeroBlockDesign,
  BlockDesignerState,
  BlockSection,
  BlockColumn,
  BlockWidget,
  BlockSelection,
  BlockWidgetType,
  Breakpoint,
  SectionSettings,
  ColumnSettings,
  ElementAnimation,
  WidgetProps,
  WidgetOverrides,
  GlobalStyles,
  MarginValue,
  SpacingValue,
  ElementVisibility,
} from '@/types/hero-block-designer'

// ---------------------------------------------------------------------------
// Action types
// ---------------------------------------------------------------------------

export type BlockDesignerAction =
  | { type: 'SET_DESIGN'; design: HeroBlockDesign }
  // Section
  | { type: 'ADD_SECTION'; columnWidths: number[]; afterIndex?: number }
  | { type: 'REMOVE_SECTION'; sectionId: string }
  | { type: 'DUPLICATE_SECTION'; sectionId: string }
  | { type: 'REORDER_SECTIONS'; sectionIds: string[] }
  | { type: 'UPDATE_SECTION_SETTINGS'; sectionId: string; settings: Partial<SectionSettings>; breakpoint?: Breakpoint }
  | { type: 'RENAME_SECTION'; sectionId: string; label: string }
  // Column
  | { type: 'SET_COLUMN_LAYOUT'; sectionId: string; widths: number[] }
  | { type: 'UPDATE_COLUMN_SETTINGS'; sectionId: string; columnId: string; settings: Partial<ColumnSettings>; breakpoint?: Breakpoint }
  // Widget
  | { type: 'ADD_WIDGET'; sectionId: string; columnId: string; widgetType: BlockWidgetType; atIndex?: number }
  | { type: 'REMOVE_WIDGET'; sectionId: string; columnId: string; widgetId: string }
  | { type: 'DUPLICATE_WIDGET'; sectionId: string; columnId: string; widgetId: string }
  | { type: 'REORDER_WIDGETS'; sectionId: string; columnId: string; widgetIds: string[] }
  | { type: 'MOVE_WIDGET'; fromSectionId: string; fromColumnId: string; widgetId: string; toSectionId: string; toColumnId: string; toIndex: number }
  | { type: 'UPDATE_WIDGET_PROPS'; sectionId: string; columnId: string; widgetId: string; props: Partial<WidgetProps>; breakpoint?: Breakpoint }
  | { type: 'UPDATE_WIDGET_SETTINGS'; sectionId: string; columnId: string; widgetId: string; settings: Partial<Pick<BlockWidget, 'alignment' | 'width' | 'margin' | 'padding' | 'visibility'>>; breakpoint?: Breakpoint }
  | { type: 'UPDATE_WIDGET_ANIMATION'; sectionId: string; columnId: string; widgetId: string; animation: Partial<ElementAnimation> }
  // Global
  | { type: 'UPDATE_GLOBAL_STYLES'; styles: Partial<GlobalStyles> }
  | { type: 'SELECT_BLOCK'; selection: BlockSelection | null }
  | { type: 'SET_BREAKPOINT'; breakpoint: Breakpoint }
  // History
  | { type: 'UNDO' }
  | { type: 'REDO' }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAX_HISTORY = 50

function pushHistory(state: BlockDesignerState): BlockDesignerState {
  const history = state.history.slice(0, state.historyIndex + 1)
  history.push(structuredClone(state.design))
  if (history.length > MAX_HISTORY) history.shift()
  return { ...state, history, historyIndex: history.length - 1 }
}

function updateSection(design: HeroBlockDesign, sectionId: string, fn: (s: BlockSection) => BlockSection): HeroBlockDesign {
  return {
    ...design,
    sections: design.sections.map((s) => (s.id === sectionId ? fn(s) : s)),
  }
}

function updateColumn(design: HeroBlockDesign, sectionId: string, columnId: string, fn: (c: BlockColumn) => BlockColumn): HeroBlockDesign {
  return updateSection(design, sectionId, (s) => ({
    ...s,
    columns: s.columns.map((c) => (c.id === columnId ? fn(c) : c)),
  }))
}

function updateWidget(design: HeroBlockDesign, sectionId: string, columnId: string, widgetId: string, fn: (w: BlockWidget) => BlockWidget): HeroBlockDesign {
  return updateColumn(design, sectionId, columnId, (c) => ({
    ...c,
    widgets: c.widgets.map((w) => (w.id === widgetId ? fn(w) : w)),
  }))
}

function deepCloneWidget(widget: BlockWidget): BlockWidget {
  const cloned = structuredClone(widget)
  cloned.id = uuidv4()
  return cloned
}

function deepCloneColumn(column: BlockColumn): BlockColumn {
  const cloned = structuredClone(column)
  cloned.id = uuidv4()
  cloned.widgets = cloned.widgets.map((w) => deepCloneWidget(w))
  return cloned
}

function deepCloneSection(section: BlockSection): BlockSection {
  const cloned = structuredClone(section)
  cloned.id = uuidv4()
  cloned.columns = cloned.columns.map((c) => deepCloneColumn(c))
  return cloned
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function blockDesignerReducer(state: BlockDesignerState, action: BlockDesignerAction): BlockDesignerState {
  switch (action.type) {
    case 'SET_DESIGN':
      return {
        ...state,
        design: action.design,
        selection: null,
        history: [],
        historyIndex: -1,
      }

    case 'ADD_SECTION': {
      const prev = pushHistory(state)
      const section = createSection(action.columnWidths)
      const sections = [...prev.design.sections]
      const insertIdx = action.afterIndex !== undefined ? action.afterIndex + 1 : sections.length
      sections.splice(insertIdx, 0, section)
      return {
        ...prev,
        design: { ...prev.design, sections },
        selection: { type: 'section', sectionId: section.id },
      }
    }

    case 'REMOVE_SECTION': {
      const prev = pushHistory(state)
      const design = {
        ...prev.design,
        sections: prev.design.sections.filter((s) => s.id !== action.sectionId),
      }
      const selection = prev.selection?.sectionId === action.sectionId ? null : prev.selection
      return { ...prev, design, selection }
    }

    case 'DUPLICATE_SECTION': {
      const prev = pushHistory(state)
      const idx = prev.design.sections.findIndex((s) => s.id === action.sectionId)
      if (idx === -1) return state
      const cloned = deepCloneSection(prev.design.sections[idx])
      cloned.label = `${cloned.label} (copy)`
      const sections = [...prev.design.sections]
      sections.splice(idx + 1, 0, cloned)
      return {
        ...prev,
        design: { ...prev.design, sections },
        selection: { type: 'section', sectionId: cloned.id },
      }
    }

    case 'REORDER_SECTIONS': {
      const prev = pushHistory(state)
      const sectionMap = new Map(prev.design.sections.map((s) => [s.id, s]))
      const sections = action.sectionIds
        .map((id) => sectionMap.get(id))
        .filter((s): s is BlockSection => s !== undefined)
      return { ...prev, design: { ...prev.design, sections } }
    }

    case 'UPDATE_SECTION_SETTINGS': {
      const prev = pushHistory(state)
      const bp = action.breakpoint ?? state.activeBreakpoint
      if (bp === 'desktop') {
        const design = updateSection(prev.design, action.sectionId, (s) => ({
          ...s,
          settings: { ...s.settings, ...action.settings },
        }))
        return { ...prev, design }
      }
      // Non-desktop: store in responsive overrides
      const design = updateSection(prev.design, action.sectionId, (s) => ({
        ...s,
        responsiveOverrides: {
          ...s.responsiveOverrides,
          [bp]: { ...s.responsiveOverrides?.[bp], ...action.settings },
        },
      }))
      return { ...prev, design }
    }

    case 'RENAME_SECTION': {
      const prev = pushHistory(state)
      const design = updateSection(prev.design, action.sectionId, (s) => ({
        ...s,
        label: action.label,
      }))
      return { ...prev, design }
    }

    case 'SET_COLUMN_LAYOUT': {
      const prev = pushHistory(state)
      const design = updateSection(prev.design, action.sectionId, (s) => {
        // Collect all widgets from existing columns
        const allWidgets = s.columns.flatMap((c) => c.widgets)
        // Create new columns with specified widths
        const newColumns = action.widths.map((w) => createColumn(w))
        // Put all existing widgets into first column
        if (newColumns.length > 0 && allWidgets.length > 0) {
          newColumns[0].widgets = allWidgets
        }
        return { ...s, columns: newColumns }
      })
      return { ...prev, design }
    }

    case 'UPDATE_COLUMN_SETTINGS': {
      const prev = pushHistory(state)
      const bp = action.breakpoint ?? state.activeBreakpoint
      if (bp === 'desktop') {
        const design = updateColumn(prev.design, action.sectionId, action.columnId, (c) => ({
          ...c,
          settings: { ...c.settings, ...action.settings },
        }))
        return { ...prev, design }
      }
      const design = updateColumn(prev.design, action.sectionId, action.columnId, (c) => ({
        ...c,
        responsiveOverrides: {
          ...c.responsiveOverrides,
          [bp]: { ...c.responsiveOverrides?.[bp], ...action.settings },
        },
      }))
      return { ...prev, design }
    }

    case 'ADD_WIDGET': {
      const prev = pushHistory(state)
      const factory = widgetFactories[action.widgetType]
      if (!factory) return state
      const widget = factory()
      const design = updateColumn(prev.design, action.sectionId, action.columnId, (c) => {
        const widgets = [...c.widgets]
        const idx = action.atIndex !== undefined ? action.atIndex : widgets.length
        widgets.splice(idx, 0, widget)
        return { ...c, widgets }
      })
      return {
        ...prev,
        design,
        selection: {
          type: 'widget',
          sectionId: action.sectionId,
          columnId: action.columnId,
          widgetId: widget.id,
        },
      }
    }

    case 'REMOVE_WIDGET': {
      const prev = pushHistory(state)
      const design = updateColumn(prev.design, action.sectionId, action.columnId, (c) => ({
        ...c,
        widgets: c.widgets.filter((w) => w.id !== action.widgetId),
      }))
      const selection = prev.selection?.widgetId === action.widgetId ? null : prev.selection
      return { ...prev, design, selection }
    }

    case 'DUPLICATE_WIDGET': {
      const prev = pushHistory(state)
      const design = updateColumn(prev.design, action.sectionId, action.columnId, (c) => {
        const idx = c.widgets.findIndex((w) => w.id === action.widgetId)
        if (idx === -1) return c
        const cloned = deepCloneWidget(c.widgets[idx])
        cloned.label = `${cloned.label} (copy)`
        const widgets = [...c.widgets]
        widgets.splice(idx + 1, 0, cloned)
        return { ...c, widgets }
      })
      return { ...prev, design }
    }

    case 'REORDER_WIDGETS': {
      const prev = pushHistory(state)
      const design = updateColumn(prev.design, action.sectionId, action.columnId, (c) => {
        const widgetMap = new Map(c.widgets.map((w) => [w.id, w]))
        const widgets = action.widgetIds
          .map((id) => widgetMap.get(id))
          .filter((w): w is BlockWidget => w !== undefined)
        return { ...c, widgets }
      })
      return { ...prev, design }
    }

    case 'MOVE_WIDGET': {
      const prev = pushHistory(state)
      // Find and remove widget from source
      let movedWidget: BlockWidget | null = null
      let design = updateColumn(prev.design, action.fromSectionId, action.fromColumnId, (c) => {
        const idx = c.widgets.findIndex((w) => w.id === action.widgetId)
        if (idx === -1) return c
        movedWidget = c.widgets[idx]
        return { ...c, widgets: c.widgets.filter((w) => w.id !== action.widgetId) }
      })
      if (!movedWidget) return state
      // Insert into target
      const widgetToInsert = movedWidget
      design = updateColumn(design, action.toSectionId, action.toColumnId, (c) => {
        const widgets = [...c.widgets]
        widgets.splice(action.toIndex, 0, widgetToInsert)
        return { ...c, widgets }
      })
      return {
        ...prev,
        design,
        selection: {
          type: 'widget',
          sectionId: action.toSectionId,
          columnId: action.toColumnId,
          widgetId: action.widgetId,
        },
      }
    }

    case 'UPDATE_WIDGET_PROPS': {
      const prev = pushHistory(state)
      const bp = action.breakpoint ?? state.activeBreakpoint
      if (bp === 'desktop') {
        const design = updateWidget(prev.design, action.sectionId, action.columnId, action.widgetId, (w) => ({
          ...w,
          props: { ...w.props, ...action.props } as WidgetProps,
        }))
        return { ...prev, design }
      }
      const design = updateWidget(prev.design, action.sectionId, action.columnId, action.widgetId, (w) => ({
        ...w,
        responsiveOverrides: {
          ...w.responsiveOverrides,
          [bp]: {
            ...w.responsiveOverrides?.[bp],
            props: { ...w.responsiveOverrides?.[bp]?.props, ...action.props },
          },
        },
      }))
      return { ...prev, design }
    }

    case 'UPDATE_WIDGET_SETTINGS': {
      const prev = pushHistory(state)
      const bp = action.breakpoint ?? state.activeBreakpoint
      if (bp === 'desktop') {
        const design = updateWidget(prev.design, action.sectionId, action.columnId, action.widgetId, (w) => ({
          ...w,
          ...action.settings,
        }))
        return { ...prev, design }
      }
      const design = updateWidget(prev.design, action.sectionId, action.columnId, action.widgetId, (w) => ({
        ...w,
        responsiveOverrides: {
          ...w.responsiveOverrides,
          [bp]: { ...w.responsiveOverrides?.[bp], ...action.settings },
        },
      }))
      return { ...prev, design }
    }

    case 'UPDATE_WIDGET_ANIMATION': {
      const prev = pushHistory(state)
      const design = updateWidget(prev.design, action.sectionId, action.columnId, action.widgetId, (w) => ({
        ...w,
        animation: { ...w.animation, ...action.animation },
      }))
      return { ...prev, design }
    }

    case 'UPDATE_GLOBAL_STYLES': {
      const prev = pushHistory(state)
      return {
        ...prev,
        design: {
          ...prev.design,
          globalStyles: { ...prev.design.globalStyles, ...action.styles },
        },
      }
    }

    case 'SELECT_BLOCK':
      return { ...state, selection: action.selection }

    case 'SET_BREAKPOINT':
      return { ...state, activeBreakpoint: action.breakpoint }

    case 'UNDO': {
      if (state.historyIndex < 0) return state
      const design = state.history[state.historyIndex]
      return {
        ...state,
        design: structuredClone(design),
        historyIndex: state.historyIndex - 1,
      }
    }

    case 'REDO': {
      if (state.historyIndex >= state.history.length - 1) return state
      const design = state.history[state.historyIndex + 2]
      if (!design) return state
      return {
        ...state,
        design: structuredClone(design),
        historyIndex: state.historyIndex + 1,
      }
    }

    default:
      return state
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

function initState(initialDesign?: HeroBlockDesign): BlockDesignerState {
  return {
    design: initialDesign ?? createBlankBlockDesign(),
    selection: null,
    activeBreakpoint: 'desktop',
    history: [],
    historyIndex: -1,
  }
}

export function useHeroBlockDesigner(initialDesign?: HeroBlockDesign) {
  const [state, dispatch] = useReducer(blockDesignerReducer, initialDesign, initState)

  const canUndo = state.historyIndex >= 0
  const canRedo = state.historyIndex < state.history.length - 1

  const selectedWidget = useMemo(() => {
    if (state.selection?.type !== 'widget') return null
    const { sectionId, columnId, widgetId } = state.selection
    const section = state.design.sections.find((s) => s.id === sectionId)
    const column = section?.columns.find((c) => c.id === columnId)
    return column?.widgets.find((w) => w.id === widgetId) ?? null
  }, [state.design, state.selection])

  const selectedSection = useMemo(() => {
    if (!state.selection) return null
    return state.design.sections.find((s) => s.id === state.selection!.sectionId) ?? null
  }, [state.design, state.selection])

  const selectedColumn = useMemo(() => {
    if (!state.selection?.columnId) return null
    const section = state.design.sections.find((s) => s.id === state.selection!.sectionId)
    return section?.columns.find((c) => c.id === state.selection!.columnId) ?? null
  }, [state.design, state.selection])

  const undo = useCallback(() => dispatch({ type: 'UNDO' }), [])
  const redo = useCallback(() => dispatch({ type: 'REDO' }), [])

  return {
    state,
    dispatch,
    canUndo,
    canRedo,
    selectedWidget,
    selectedSection,
    selectedColumn,
    undo,
    redo,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- --testPathPattern="use-hero-block-designer" --no-coverage`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-hero-block-designer.ts tests/unit/use-hero-block-designer.test.ts
git commit -m "feat: add state management hook for block hero designer"
```

---

## Task 5: Starter Templates

**Files:**
- Create: `src/lib/hero-block-templates.ts`

- [ ] **Step 1: Create the templates file**

```typescript
// src/lib/hero-block-templates.ts
import {
  createSection,
  createTextWidget,
  createImageWidget,
  createButtonWidget,
  createVideoWidget,
  createSpacerWidget,
  createCountdownWidget,
  createSocialProofWidget,
  createAnimatedBgWidget,
  NO_ANIMATION,
} from '@/lib/hero-block-defaults'
import type { HeroBlockDesign, BlockSection, BlockWidget, ElementAnimation } from '@/types/hero-block-designer'

export interface BlockHeroTemplate {
  id: string
  name: string
  description: string
  thumbnail: string
  design: HeroBlockDesign
}

function anim(type: ElementAnimation['type'], duration = 600, delay = 0): ElementAnimation {
  return { type, duration, delay }
}

function wrapDesign(sections: BlockSection[], bg = '#ffffff'): HeroBlockDesign {
  return {
    version: 4,
    sections,
    globalStyles: { backgroundColor: bg, maxWidth: 1200 },
  }
}

function textWidget(overrides: Partial<BlockWidget> & { props?: Partial<BlockWidget['props']> }): BlockWidget {
  const base = createTextWidget()
  const merged = { ...base, ...overrides }
  if (overrides.props) {
    merged.props = { ...base.props, ...overrides.props } as BlockWidget['props']
  }
  return merged
}

function buttonWidget(overrides: Partial<BlockWidget> & { props?: Partial<BlockWidget['props']> }): BlockWidget {
  const base = createButtonWidget()
  const merged = { ...base, ...overrides }
  if (overrides.props) {
    merged.props = { ...base.props, ...overrides.props } as BlockWidget['props']
  }
  return merged
}

// ---------------------------------------------------------------------------
// 1. Classic Centered
// ---------------------------------------------------------------------------

function classicCentered(): BlockHeroTemplate {
  const section = createSection([100])
  section.settings.padding = { top: 80, right: 20, bottom: 80, left: 20 }
  section.settings.minHeight = 500

  const heading = textWidget({
    label: 'Heading',
    animation: anim('fadeIn', 600),
    props: { kind: 'text', content: 'Welcome to Our Restaurant', fontSize: 56, fontWeight: 700, color: '#111827', textAlign: 'center' } as BlockWidget['props'],
  })

  const subtitle = textWidget({
    label: 'Subtitle',
    animation: anim('fadeIn', 600, 200),
    props: { kind: 'text', content: 'Delicious food made with love', fontSize: 20, fontWeight: 400, color: '#6B7280', textAlign: 'center' } as BlockWidget['props'],
  })

  const spacer = createSpacerWidget()
  spacer.props = { kind: 'spacer', height: 24 }

  const btn = buttonWidget({
    label: 'CTA Button',
    animation: anim('slideUp', 500, 400),
  })

  section.columns[0].widgets = [heading, subtitle, spacer, btn]
  section.columns[0].settings.horizontalAlign = 'center'

  return {
    id: 'classic-centered',
    name: 'Classic Centered',
    description: 'Clean centered layout with heading, subtitle, and CTA',
    thumbnail: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
    design: wrapDesign([section]),
  }
}

// ---------------------------------------------------------------------------
// 2. Split Layout
// ---------------------------------------------------------------------------

function splitLayout(): BlockHeroTemplate {
  const section = createSection([50, 50])
  section.settings.padding = { top: 60, right: 20, bottom: 60, left: 20 }
  section.settings.minHeight = 500

  const heading = textWidget({
    label: 'Heading',
    animation: anim('slideLeft', 600),
    props: { kind: 'text', content: 'Fresh & Delicious', fontSize: 48, fontWeight: 700, color: '#111827', textAlign: 'left' } as BlockWidget['props'],
  })

  const subtitle = textWidget({
    label: 'Description',
    animation: anim('slideLeft', 600, 200),
    props: { kind: 'text', content: 'Order your favorite meals online and get them delivered to your door.', fontSize: 18, fontWeight: 400, color: '#6B7280', textAlign: 'left' } as BlockWidget['props'],
  })

  const spacer = createSpacerWidget()
  spacer.props = { kind: 'spacer', height: 16 }

  const btn = buttonWidget({
    label: 'Order Now',
    animation: anim('slideLeft', 500, 400),
  })

  const image = createImageWidget()
  image.label = 'Hero Image'
  image.width = 'full'
  image.animation = anim('slideRight', 600, 200)

  section.columns[0].widgets = [heading, subtitle, spacer, btn]
  section.columns[0].settings.verticalAlign = 'middle'
  section.columns[1].widgets = [image]
  section.columns[1].settings.verticalAlign = 'middle'
  section.columns[1].settings.horizontalAlign = 'center'

  return {
    id: 'split-layout',
    name: 'Split Layout',
    description: 'Text on the left, image on the right',
    thumbnail: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    design: wrapDesign([section]),
  }
}

// ---------------------------------------------------------------------------
// 3. Full-Screen Image
// ---------------------------------------------------------------------------

function fullScreenImage(): BlockHeroTemplate {
  const section = createSection([100])
  section.settings.contentWidth = 'full'
  section.settings.minHeight = 600
  section.settings.padding = { top: 100, right: 40, bottom: 100, left: 40 }
  section.settings.background = {
    type: 'color',
    color: 'rgba(0,0,0,0.5)',
  }

  const heading = textWidget({
    label: 'Heading',
    animation: anim('fadeIn', 800),
    props: { kind: 'text', content: 'Experience Fine Dining', fontSize: 60, fontWeight: 700, color: '#FFFFFF', textAlign: 'center' } as BlockWidget['props'],
  })

  const subtitle = textWidget({
    label: 'Subtitle',
    animation: anim('fadeIn', 800, 300),
    props: { kind: 'text', content: 'A culinary journey like no other', fontSize: 22, fontWeight: 400, color: '#E5E7EB', textAlign: 'center' } as BlockWidget['props'],
  })

  const spacer = createSpacerWidget()
  spacer.props = { kind: 'spacer', height: 32 }

  const btn = buttonWidget({
    label: 'View Menu',
    animation: anim('slideUp', 600, 500),
    props: { kind: 'button', text: 'View Menu', backgroundColor: '#FFFFFF', textColor: '#000000' } as BlockWidget['props'],
  })

  section.columns[0].widgets = [heading, subtitle, spacer, btn]
  section.columns[0].settings.horizontalAlign = 'center'

  return {
    id: 'full-screen-image',
    name: 'Full-Screen Image',
    description: 'Background image with overlay text',
    thumbnail: 'linear-gradient(135deg, #0c0c0c 0%, #434343 100%)',
    design: wrapDesign([section], '#000000'),
  }
}

// ---------------------------------------------------------------------------
// 4. Minimal Text
// ---------------------------------------------------------------------------

function minimalText(): BlockHeroTemplate {
  const section = createSection([100])
  section.settings.padding = { top: 120, right: 20, bottom: 120, left: 20 }
  section.settings.minHeight = 400

  const heading = textWidget({
    label: 'Heading',
    animation: anim('fadeIn', 1000),
    props: { kind: 'text', content: 'Good Food.', fontSize: 72, fontWeight: 800, color: '#000000', textAlign: 'center', letterSpacing: -2 } as BlockWidget['props'],
  })

  section.columns[0].widgets = [heading]
  section.columns[0].settings.horizontalAlign = 'center'
  section.columns[0].settings.verticalAlign = 'middle'

  return {
    id: 'minimal-text',
    name: 'Minimal Text',
    description: 'Single bold heading, pure simplicity',
    thumbnail: 'linear-gradient(135deg, #fdfcfb 0%, #e2d1c3 100%)',
    design: wrapDesign([section]),
  }
}

// ---------------------------------------------------------------------------
// 5. Bold CTA
// ---------------------------------------------------------------------------

function boldCta(): BlockHeroTemplate {
  const section = createSection([100])
  section.settings.padding = { top: 80, right: 20, bottom: 80, left: 20 }
  section.settings.minHeight = 500
  section.settings.background = {
    type: 'gradient',
    gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  }

  const heading = textWidget({
    label: 'Heading',
    animation: anim('slideUp', 600),
    props: { kind: 'text', content: 'Order Now & Save 20%', fontSize: 52, fontWeight: 800, color: '#FFFFFF', textAlign: 'center' } as BlockWidget['props'],
  })

  const subtitle = textWidget({
    label: 'Subtitle',
    animation: anim('slideUp', 600, 200),
    props: { kind: 'text', content: 'Limited time offer on all menu items', fontSize: 20, fontWeight: 400, color: '#E0E7FF', textAlign: 'center' } as BlockWidget['props'],
  })

  const spacer = createSpacerWidget()
  spacer.props = { kind: 'spacer', height: 24 }

  const btn = buttonWidget({
    label: 'CTA',
    animation: anim('scaleIn', 500, 400),
    props: { kind: 'button', text: 'Order Now', backgroundColor: '#FFFFFF', textColor: '#6D28D9', borderRadius: 50, fontSize: 18, fontWeight: 700 } as BlockWidget['props'],
  })

  const proof = createSocialProofWidget()
  proof.animation = anim('fadeIn', 600, 600)

  section.columns[0].widgets = [heading, subtitle, spacer, btn, createSpacerWidget(), proof]
  section.columns[0].settings.horizontalAlign = 'center'

  return {
    id: 'bold-cta',
    name: 'Bold CTA',
    description: 'Gradient background with strong call-to-action',
    thumbnail: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    design: wrapDesign([section]),
  }
}

// ---------------------------------------------------------------------------
// 6. Video Hero
// ---------------------------------------------------------------------------

function videoHero(): BlockHeroTemplate {
  const section = createSection([100])
  section.settings.contentWidth = 'full'
  section.settings.minHeight = 600
  section.settings.padding = { top: 100, right: 40, bottom: 100, left: 40 }
  section.settings.background = { type: 'color', color: 'rgba(0,0,0,0.6)' }

  const video = createVideoWidget()
  video.width = 'full'
  video.label = 'Background Video'

  const heading = textWidget({
    label: 'Heading',
    animation: anim('fadeIn', 800),
    props: { kind: 'text', content: 'Watch Our Story', fontSize: 52, fontWeight: 700, color: '#FFFFFF', textAlign: 'center' } as BlockWidget['props'],
  })

  const spacer = createSpacerWidget()

  const btn = buttonWidget({
    label: 'CTA',
    animation: anim('slideUp', 600, 400),
    props: { kind: 'button', text: 'Explore Menu', backgroundColor: '#EF4444', textColor: '#FFFFFF' } as BlockWidget['props'],
  })

  section.columns[0].widgets = [video, heading, spacer, btn]
  section.columns[0].settings.horizontalAlign = 'center'

  return {
    id: 'video-hero',
    name: 'Video Hero',
    description: 'Background video with overlaid content',
    thumbnail: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
    design: wrapDesign([section], '#000000'),
  }
}

// ---------------------------------------------------------------------------
// 7. Restaurant Showcase
// ---------------------------------------------------------------------------

function restaurantShowcase(): BlockHeroTemplate {
  const section = createSection([55, 45])
  section.settings.padding = { top: 60, right: 20, bottom: 60, left: 20 }
  section.settings.minHeight = 500
  section.settings.background = { type: 'color', color: '#FEF3C7' }

  const heading = textWidget({
    label: 'Restaurant Name',
    animation: anim('slideLeft', 600),
    props: { kind: 'text', content: 'The Golden Plate', fontSize: 48, fontWeight: 800, color: '#92400E', textAlign: 'left' } as BlockWidget['props'],
  })

  const tagline = textWidget({
    label: 'Tagline',
    animation: anim('slideLeft', 600, 200),
    props: { kind: 'text', content: 'Authentic flavors crafted with passion since 1985', fontSize: 18, fontWeight: 400, color: '#B45309', textAlign: 'left' } as BlockWidget['props'],
  })

  const spacer = createSpacerWidget()

  const btn = buttonWidget({
    label: 'CTA',
    animation: anim('slideLeft', 500, 400),
    props: { kind: 'button', text: 'See Our Menu', backgroundColor: '#92400E', textColor: '#FFFFFF' } as BlockWidget['props'],
  })

  const image = createImageWidget()
  image.label = 'Showcase Image'
  image.width = 'full'
  image.animation = anim('slideRight', 700, 200)
  image.props = { ...image.props, borderRadius: 16 } as typeof image.props

  section.columns[0].widgets = [heading, tagline, spacer, btn]
  section.columns[0].settings.verticalAlign = 'middle'
  section.columns[1].widgets = [image]
  section.columns[1].settings.verticalAlign = 'middle'

  return {
    id: 'restaurant-showcase',
    name: 'Restaurant Showcase',
    description: 'Warm branding with showcase image',
    thumbnail: 'linear-gradient(135deg, #FEF3C7 0%, #F59E0B 100%)',
    design: wrapDesign([section]),
  }
}

// ---------------------------------------------------------------------------
// 8. Promo Countdown
// ---------------------------------------------------------------------------

function promoCountdown(): BlockHeroTemplate {
  const section = createSection([100])
  section.settings.padding = { top: 60, right: 20, bottom: 60, left: 20 }
  section.settings.minHeight = 450
  section.settings.background = {
    type: 'gradient',
    gradient: 'linear-gradient(135deg, #EF4444 0%, #B91C1C 100%)',
  }

  const heading = textWidget({
    label: 'Promo Heading',
    animation: anim('slideUp', 600),
    props: { kind: 'text', content: 'Limited Time Offer!', fontSize: 48, fontWeight: 800, color: '#FFFFFF', textAlign: 'center' } as BlockWidget['props'],
  })

  const subtitle = textWidget({
    label: 'Subtitle',
    animation: anim('fadeIn', 600, 200),
    props: { kind: 'text', content: 'Hurry! This deal ends soon', fontSize: 18, fontWeight: 400, color: '#FEE2E2', textAlign: 'center' } as BlockWidget['props'],
  })

  const spacer1 = createSpacerWidget()

  const countdown = createCountdownWidget()
  countdown.animation = anim('scaleIn', 700, 400)
  if (countdown.props.kind === 'countdown') {
    countdown.props.color = '#FFFFFF'
    countdown.props.separatorColor = '#FCA5A5'
  }

  const spacer2 = createSpacerWidget()

  const btn = buttonWidget({
    label: 'CTA',
    animation: anim('bounce', 500, 600),
    props: { kind: 'button', text: 'Claim Offer', backgroundColor: '#FFFFFF', textColor: '#DC2626', borderRadius: 50, fontSize: 18, fontWeight: 700 } as BlockWidget['props'],
  })

  section.columns[0].widgets = [heading, subtitle, spacer1, countdown, spacer2, btn]
  section.columns[0].settings.horizontalAlign = 'center'

  return {
    id: 'promo-countdown',
    name: 'Promo Countdown',
    description: 'Limited-time offer with countdown timer',
    thumbnail: 'linear-gradient(135deg, #EF4444 0%, #B91C1C 100%)',
    design: wrapDesign([section]),
  }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

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
```

- [ ] **Step 2: Verify templates are valid against schema**

Run: `npx tsx -e "
const { blockHeroTemplates } = require('./src/lib/hero-block-templates');
const { heroBlockDesignSchema } = require('./src/lib/hero-block-schemas');
for (const t of blockHeroTemplates) {
  const r = heroBlockDesignSchema.safeParse(t.design);
  console.log(t.id, r.success ? 'PASS' : 'FAIL', r.success ? '' : JSON.stringify(r.error.issues[0]));
}
"`

Expected: All 8 templates PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/hero-block-templates.ts
git commit -m "feat: add 8 starter templates for block hero designer"
```

---

## Task 6: Shared UI Components

**Files:**
- Create: `src/components/admin/hero-block-designer/spacing-input.tsx`
- Create: `src/components/admin/hero-block-designer/alignment-buttons.tsx`
- Create: `src/components/admin/hero-block-designer/column-layout-picker.tsx`
- Create: `src/components/admin/hero-block-designer/insertion-point.tsx`

- [ ] **Step 1: Create spacing-input.tsx**

```typescript
// src/components/admin/hero-block-designer/spacing-input.tsx
'use client'

import { useState } from 'react'
import { Link2, Unlink } from 'lucide-react'
import type { SpacingValue } from '@/types/hero-block-designer'

interface SpacingInputProps {
  label: string
  value: SpacingValue
  onChange: (value: SpacingValue) => void
}

export function SpacingInput({ label, value, onChange }: SpacingInputProps) {
  const [linked, setLinked] = useState(
    value.top === value.right && value.right === value.bottom && value.bottom === value.left,
  )

  function handleChange(side: keyof SpacingValue, num: number) {
    if (linked) {
      onChange({ top: num, right: num, bottom: num, left: num })
    } else {
      onChange({ ...value, [side]: num })
    }
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs text-zinc-400">{label}</span>
        <button
          type="button"
          onClick={() => setLinked(!linked)}
          className="rounded p-0.5 text-zinc-500 hover:text-blue-400"
          title={linked ? 'Unlink sides' : 'Link sides'}
        >
          {linked ? <Link2 size={12} /> : <Unlink size={12} />}
        </button>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
          <label key={side} className="flex flex-col items-center gap-0.5">
            <input
              type="number"
              value={value[side]}
              onChange={(e) => handleChange(side, Number(e.target.value))}
              min={0}
              max={500}
              className="w-full rounded border border-zinc-700 bg-zinc-800 px-1.5 py-1 text-center text-xs text-zinc-100 outline-none focus:border-blue-500"
            />
            <span className="text-[10px] uppercase text-zinc-500">{side[0]}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

interface MarginInputProps {
  label: string
  value: { top: number; bottom: number }
  onChange: (value: { top: number; bottom: number }) => void
}

export function MarginInput({ label, value, onChange }: MarginInputProps) {
  return (
    <div>
      <span className="mb-1 block text-xs text-zinc-400">{label}</span>
      <div className="grid grid-cols-2 gap-1">
        {(['top', 'bottom'] as const).map((side) => (
          <label key={side} className="flex flex-col items-center gap-0.5">
            <input
              type="number"
              value={value[side]}
              onChange={(e) => onChange({ ...value, [side]: Number(e.target.value) })}
              min={0}
              max={500}
              className="w-full rounded border border-zinc-700 bg-zinc-800 px-1.5 py-1 text-center text-xs text-zinc-100 outline-none focus:border-blue-500"
            />
            <span className="text-[10px] uppercase text-zinc-500">{side[0]}</span>
          </label>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create alignment-buttons.tsx**

```typescript
// src/components/admin/hero-block-designer/alignment-buttons.tsx
'use client'

import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeStart,
  AlignVerticalDistributeCenter,
  AlignVerticalDistributeEnd,
} from 'lucide-react'

interface HorizontalAlignButtonsProps {
  value: 'left' | 'center' | 'right'
  onChange: (value: 'left' | 'center' | 'right') => void
  includeStretch?: false
}

interface HorizontalAlignWithStretchProps {
  value: 'left' | 'center' | 'right' | 'stretch'
  onChange: (value: 'left' | 'center' | 'right' | 'stretch') => void
  includeStretch: true
}

type AlignButtonsProps = HorizontalAlignButtonsProps | HorizontalAlignWithStretchProps

export function HorizontalAlignButtons(props: AlignButtonsProps) {
  const options = [
    { value: 'left' as const, icon: AlignLeft, label: 'Left' },
    { value: 'center' as const, icon: AlignCenter, label: 'Center' },
    { value: 'right' as const, icon: AlignRight, label: 'Right' },
    ...(props.includeStretch
      ? [{ value: 'stretch' as const, icon: AlignHorizontalDistributeCenter, label: 'Stretch' }]
      : []),
  ]

  return (
    <div className="flex gap-1">
      {options.map((opt) => {
        const Icon = opt.icon
        const isActive = props.value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => (props.onChange as (v: string) => void)(opt.value)}
            className={`rounded p-1.5 transition-colors ${
              isActive
                ? 'bg-blue-600 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
            }`}
            title={opt.label}
          >
            <Icon size={14} />
          </button>
        )
      })}
    </div>
  )
}

interface VerticalAlignButtonsProps {
  value: 'top' | 'middle' | 'bottom'
  onChange: (value: 'top' | 'middle' | 'bottom') => void
}

export function VerticalAlignButtons({ value, onChange }: VerticalAlignButtonsProps) {
  const options = [
    { value: 'top' as const, icon: AlignVerticalDistributeStart, label: 'Top' },
    { value: 'middle' as const, icon: AlignVerticalDistributeCenter, label: 'Middle' },
    { value: 'bottom' as const, icon: AlignVerticalDistributeEnd, label: 'Bottom' },
  ]

  return (
    <div className="flex gap-1">
      {options.map((opt) => {
        const Icon = opt.icon
        const isActive = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`rounded p-1.5 transition-colors ${
              isActive
                ? 'bg-blue-600 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
            }`}
            title={opt.label}
          >
            <Icon size={14} />
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: Create column-layout-picker.tsx**

```typescript
// src/components/admin/hero-block-designer/column-layout-picker.tsx
'use client'

import { COLUMN_PRESETS } from '@/lib/hero-block-defaults'

interface ColumnLayoutPickerProps {
  currentWidths: number[]
  onChange: (widths: number[]) => void
}

export function ColumnLayoutPicker({ currentWidths, onChange }: ColumnLayoutPickerProps) {
  const currentKey = currentWidths.join('-')

  return (
    <div>
      <span className="mb-2 block text-xs text-zinc-400">Column Layout</span>
      <div className="grid grid-cols-4 gap-2">
        {COLUMN_PRESETS.map((preset) => {
          const presetKey = preset.widths.join('-')
          const isActive = presetKey === currentKey
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onChange(preset.widths)}
              className={`flex h-10 items-end gap-px rounded border p-1 transition-colors ${
                isActive
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-zinc-700 bg-zinc-800 hover:border-zinc-500'
              }`}
              title={preset.label}
            >
              {preset.widths.map((w, i) => (
                <div
                  key={i}
                  className={`h-full rounded-sm ${isActive ? 'bg-blue-500' : 'bg-zinc-600'}`}
                  style={{ width: `${w}%` }}
                />
              ))}
            </button>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create insertion-point.tsx**

```typescript
// src/components/admin/hero-block-designer/insertion-point.tsx
'use client'

import { Plus } from 'lucide-react'

interface InsertionPointProps {
  onClick: () => void
  label?: string
}

export function InsertionPoint({ onClick, label }: InsertionPointProps) {
  return (
    <div className="group relative flex items-center justify-center py-2">
      <div className="absolute inset-x-4 h-px bg-transparent transition-colors group-hover:bg-blue-400" />
      <button
        type="button"
        onClick={onClick}
        className="relative z-10 flex h-6 w-6 items-center justify-center rounded-full border border-zinc-600 bg-zinc-800 text-zinc-400 opacity-0 transition-all hover:border-blue-400 hover:bg-blue-500 hover:text-white group-hover:opacity-100"
        title={label ?? 'Add'}
      >
        <Plus size={14} />
      </button>
    </div>
  )
}

interface EmptyColumnDropZoneProps {
  onClick: () => void
}

export function EmptyColumnDropZone({ onClick }: EmptyColumnDropZoneProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-24 w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-zinc-600 text-zinc-500 transition-colors hover:border-blue-400 hover:text-blue-400"
    >
      <Plus size={20} />
      <span className="text-xs">Add Widget</span>
    </button>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/hero-block-designer/spacing-input.tsx \
        src/components/admin/hero-block-designer/alignment-buttons.tsx \
        src/components/admin/hero-block-designer/column-layout-picker.tsx \
        src/components/admin/hero-block-designer/insertion-point.tsx
git commit -m "feat: add shared UI components for block hero designer"
```

---

## Task 7: Settings Panels (Right Panel)

**Files:**
- Create: `src/components/admin/hero-block-designer/global-settings.tsx`
- Create: `src/components/admin/hero-block-designer/section-settings.tsx`
- Create: `src/components/admin/hero-block-designer/column-settings.tsx`
- Create: `src/components/admin/hero-block-designer/widget-settings.tsx`
- Create: `src/components/admin/hero-block-designer/settings-panel.tsx`

Due to plan length, steps for Task 7-14 are structured as: create each file with the specified code, verify lint passes, commit.

- [ ] **Step 1: Create global-settings.tsx**

This component shows background color, background image, and max-width controls when nothing is selected. It follows the existing dark zinc theme and input patterns from the v3 `CanvasProperties` component in `properties-panel.tsx`.

File: `src/components/admin/hero-block-designer/global-settings.tsx`

Uses: color input (dual picker + hex text), number input for maxWidth, image URL input, opacity slider, objectFit select. All inputs use `border-zinc-700 bg-zinc-800 text-zinc-100 focus:border-blue-500` styling. Accepts `globalStyles: GlobalStyles` and `onUpdate: (styles: Partial<GlobalStyles>) => void` props.

- [ ] **Step 2: Create section-settings.tsx**

Shows when a section is selected: column layout picker, content width toggle (full/boxed), horizontal alignment buttons, min-height number input, background controls (tabs for none/color/image/gradient/video), padding SpacingInput, margin MarginInput, and responsive overrides section.

File: `src/components/admin/hero-block-designer/section-settings.tsx`

Accepts `section: BlockSection`, `breakpoint: Breakpoint`, `onUpdateSettings`, `onSetColumnLayout` props. Uses `ColumnLayoutPicker`, `HorizontalAlignButtons`, `SpacingInput`, `MarginInput` from shared components.

- [ ] **Step 3: Create column-settings.tsx**

Shows when a column is selected: width percentage display, vertical align buttons, horizontal align buttons, padding SpacingInput, background color, border radius.

File: `src/components/admin/hero-block-designer/column-settings.tsx`

Accepts `column: BlockColumn`, `breakpoint: Breakpoint`, `onUpdateSettings` props. Uses `VerticalAlignButtons`, `HorizontalAlignButtons`, `SpacingInput`.

- [ ] **Step 4: Create widget-settings.tsx**

Shows when a widget is selected: alignment buttons (with stretch), width selector (auto/full/custom%), margin, padding, then widget-specific props. Reuses existing property sections from `src/components/admin/hero-designer/property-sections/` for typography, appearance, animation, and element-specific settings.

File: `src/components/admin/hero-block-designer/widget-settings.tsx`

Accepts `widget: BlockWidget`, `breakpoint: Breakpoint`, `sectionId`, `columnId`, and dispatch callbacks. Imports `TypographySection`, `AppearanceSection`, `AnimationSection`, `ElementSpecificSection` from existing property sections (these are reused, not rewritten).

- [ ] **Step 5: Create settings-panel.tsx — the router**

```typescript
// src/components/admin/hero-block-designer/settings-panel.tsx
'use client'

import type { BlockSelection, HeroBlockDesign, Breakpoint, BlockSection, BlockColumn, BlockWidget } from '@/types/hero-block-designer'
import type { BlockDesignerAction } from '@/hooks/use-hero-block-designer'
import { GlobalSettings } from '@/components/admin/hero-block-designer/global-settings'
import { SectionSettingsPanel } from '@/components/admin/hero-block-designer/section-settings'
import { ColumnSettingsPanel } from '@/components/admin/hero-block-designer/column-settings'
import { WidgetSettingsPanel } from '@/components/admin/hero-block-designer/widget-settings'

interface SettingsPanelProps {
  design: HeroBlockDesign
  selection: BlockSelection | null
  breakpoint: Breakpoint
  selectedSection: BlockSection | null
  selectedColumn: BlockColumn | null
  selectedWidget: BlockWidget | null
  dispatch: React.Dispatch<BlockDesignerAction>
}

export function SettingsPanel({
  design,
  selection,
  breakpoint,
  selectedSection,
  selectedColumn,
  selectedWidget,
  dispatch,
}: SettingsPanelProps) {
  return (
    <div className="flex h-full w-72 flex-col overflow-y-auto border-l border-zinc-800 bg-zinc-900">
      {!selection && (
        <GlobalSettings
          globalStyles={design.globalStyles}
          onUpdate={(styles) => dispatch({ type: 'UPDATE_GLOBAL_STYLES', styles })}
        />
      )}

      {selection?.type === 'section' && selectedSection && (
        <SectionSettingsPanel
          section={selectedSection}
          breakpoint={breakpoint}
          onUpdateSettings={(settings) =>
            dispatch({ type: 'UPDATE_SECTION_SETTINGS', sectionId: selectedSection.id, settings, breakpoint })
          }
          onSetColumnLayout={(widths) =>
            dispatch({ type: 'SET_COLUMN_LAYOUT', sectionId: selectedSection.id, widths })
          }
          onRename={(label) =>
            dispatch({ type: 'RENAME_SECTION', sectionId: selectedSection.id, label })
          }
        />
      )}

      {selection?.type === 'column' && selectedColumn && selectedSection && (
        <ColumnSettingsPanel
          column={selectedColumn}
          breakpoint={breakpoint}
          onUpdateSettings={(settings) =>
            dispatch({
              type: 'UPDATE_COLUMN_SETTINGS',
              sectionId: selectedSection.id,
              columnId: selectedColumn.id,
              settings,
              breakpoint,
            })
          }
        />
      )}

      {selection?.type === 'widget' && selectedWidget && selectedSection && selectedColumn && (
        <WidgetSettingsPanel
          widget={selectedWidget}
          breakpoint={breakpoint}
          sectionId={selectedSection.id}
          columnId={selectedColumn.id}
          dispatch={dispatch}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/hero-block-designer/global-settings.tsx \
        src/components/admin/hero-block-designer/section-settings.tsx \
        src/components/admin/hero-block-designer/column-settings.tsx \
        src/components/admin/hero-block-designer/widget-settings.tsx \
        src/components/admin/hero-block-designer/settings-panel.tsx
git commit -m "feat: add settings panels for block hero designer"
```

---

## Task 8: Block Canvas Components

**Files:**
- Create: `src/components/admin/hero-block-designer/block-canvas-widget.tsx`
- Create: `src/components/admin/hero-block-designer/block-canvas-column.tsx`
- Create: `src/components/admin/hero-block-designer/block-canvas-section.tsx`
- Create: `src/components/admin/hero-block-designer/block-canvas.tsx`

- [ ] **Step 1: Create block-canvas-widget.tsx**

Renders a single widget in the canvas with selection highlight and hover outline. Uses the same render logic as `canvas-element.tsx` (switch on props.kind) but in flow layout instead of absolute. Shows a floating action bar on selection (duplicate, delete, drag handle). Wraps content in a div with alignment (justify-self based on widget.alignment) and width styling.

File: `src/components/admin/hero-block-designer/block-canvas-widget.tsx`

Props: `widget: BlockWidget`, `isSelected: boolean`, `breakpoint: Breakpoint`, `onSelect: () => void`

- [ ] **Step 2: Create block-canvas-column.tsx**

Renders a column as a flex container with vertical alignment. Maps over `column.widgets` rendering `BlockCanvasWidget` for each, with `InsertionPoint` between widgets and `EmptyColumnDropZone` when empty. Shows dashed border on hover with "Col" label.

File: `src/components/admin/hero-block-designer/block-canvas-column.tsx`

Props: `column: BlockColumn`, `sectionId: string`, `isSelected: boolean`, `selectedWidgetId: string | null`, `breakpoint: Breakpoint`, `onSelectColumn: () => void`, `onSelectWidget: (widgetId: string) => void`, `onAddWidget: (columnId: string, atIndex?: number) => void`

- [ ] **Step 3: Create block-canvas-section.tsx**

Renders a section as a full-width block with background styling. Contains a flex row of `BlockCanvasColumn` components. Shows section label tag on hover, selection border, and floating action bar. Applies section settings (padding, margin, minHeight, background, contentWidth).

File: `src/components/admin/hero-block-designer/block-canvas-section.tsx`

Props: `section: BlockSection`, `isSelected: boolean`, `selectedColumnId: string | null`, `selectedWidgetId: string | null`, `breakpoint: Breakpoint`, `onSelectSection: () => void`, `onSelectColumn: (columnId: string) => void`, `onSelectWidget: (widgetId: string) => void`, `onAddWidget: (sectionId: string, columnId: string, atIndex?: number) => void`

- [ ] **Step 4: Create block-canvas.tsx**

The main canvas container. Maps over `design.sections` rendering `BlockCanvasSection` for each, with `InsertionPoint` between sections and at the end. Scales the canvas width based on active breakpoint (1440/768/390) and fits it to available space. Click on empty area deselects.

```typescript
// src/components/admin/hero-block-designer/block-canvas.tsx
'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import type { HeroBlockDesign, Breakpoint, BlockSelection } from '@/types/hero-block-designer'
import type { BlockDesignerAction } from '@/hooks/use-hero-block-designer'
import { BlockCanvasSection } from '@/components/admin/hero-block-designer/block-canvas-section'
import { InsertionPoint } from '@/components/admin/hero-block-designer/insertion-point'

const BREAKPOINT_WIDTHS: Record<Breakpoint, number> = {
  desktop: 1440,
  tablet: 768,
  mobile: 390,
}

interface BlockCanvasProps {
  design: HeroBlockDesign
  breakpoint: Breakpoint
  selection: BlockSelection | null
  dispatch: React.Dispatch<BlockDesignerAction>
}

export function BlockCanvas({ design, breakpoint, selection, dispatch }: BlockCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width)
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const canvasWidth = BREAKPOINT_WIDTHS[breakpoint]
  const scale = containerWidth > 0 ? Math.min((containerWidth - 64) / canvasWidth, 1) : 1

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        dispatch({ type: 'SELECT_BLOCK', selection: null })
      }
    },
    [dispatch],
  )

  const handleAddSection = useCallback(
    (afterIndex?: number) => {
      dispatch({ type: 'ADD_SECTION', columnWidths: [100], afterIndex })
    },
    [dispatch],
  )

  const handleAddWidget = useCallback(
    (sectionId: string, columnId: string, atIndex?: number) => {
      dispatch({ type: 'ADD_WIDGET', sectionId, columnId, widgetType: 'text', atIndex })
    },
    [dispatch],
  )

  return (
    <div
      ref={containerRef}
      className="flex h-full w-full items-start justify-center overflow-auto bg-muted/30 p-8"
      onClick={handleCanvasClick}
    >
      <div
        className="shrink-0 shadow-lg"
        style={{
          width: canvasWidth,
          transform: `scale(${scale})`,
          transformOrigin: 'top center',
          backgroundColor: design.globalStyles.backgroundColor,
        }}
        onClick={handleCanvasClick}
      >
        {/* Background image */}
        {design.globalStyles.backgroundImage && (
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage: `url(${design.globalStyles.backgroundImage.url})`,
              backgroundSize: design.globalStyles.backgroundImage.objectFit === 'fill' ? '100% 100%' : design.globalStyles.backgroundImage.objectFit,
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              opacity: design.globalStyles.backgroundImage.opacity,
            }}
          />
        )}

        {design.sections.map((section, index) => (
          <div key={section.id}>
            {index === 0 && (
              <InsertionPoint
                onClick={() => handleAddSection(-1)}
                label="Add Section"
              />
            )}
            <BlockCanvasSection
              section={section}
              isSelected={selection?.sectionId === section.id && selection.type === 'section'}
              selectedColumnId={selection?.sectionId === section.id ? selection?.columnId ?? null : null}
              selectedWidgetId={selection?.sectionId === section.id ? selection?.widgetId ?? null : null}
              breakpoint={breakpoint}
              onSelectSection={() =>
                dispatch({ type: 'SELECT_BLOCK', selection: { type: 'section', sectionId: section.id } })
              }
              onSelectColumn={(columnId) =>
                dispatch({ type: 'SELECT_BLOCK', selection: { type: 'column', sectionId: section.id, columnId } })
              }
              onSelectWidget={(widgetId) => {
                // Find which column owns this widget
                const col = section.columns.find((c) => c.widgets.some((w) => w.id === widgetId))
                if (col) {
                  dispatch({
                    type: 'SELECT_BLOCK',
                    selection: { type: 'widget', sectionId: section.id, columnId: col.id, widgetId },
                  })
                }
              }}
              onAddWidget={(sectionId, columnId, atIndex) =>
                handleAddWidget(sectionId, columnId, atIndex)
              }
            />
            <InsertionPoint
              onClick={() => handleAddSection(index)}
              label="Add Section"
            />
          </div>
        ))}

        {design.sections.length === 0 && (
          <div className="flex min-h-[400px] items-center justify-center">
            <InsertionPoint onClick={() => handleAddSection()} label="Add First Section" />
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/hero-block-designer/block-canvas-widget.tsx \
        src/components/admin/hero-block-designer/block-canvas-column.tsx \
        src/components/admin/hero-block-designer/block-canvas-section.tsx \
        src/components/admin/hero-block-designer/block-canvas.tsx
git commit -m "feat: add block canvas components for hero designer"
```

---

## Task 9: Left Panel (Add & Layers)

**Files:**
- Create: `src/components/admin/hero-block-designer/add-panel.tsx`
- Create: `src/components/admin/hero-block-designer/layers-panel.tsx`

- [ ] **Step 1: Create add-panel.tsx**

Two tabs: Widgets (grid of widget type buttons with icons from lucide-react, same icon map as existing `element-panel.tsx`) and Sections (column preset buttons from `COLUMN_PRESETS`). Clicking a widget type calls `onAddWidget(type)`. Clicking a section preset calls `onAddSection(widths)`.

File: `src/components/admin/hero-block-designer/add-panel.tsx`

Props: `onAddWidget: (type: BlockWidgetType) => void`, `onAddSection: (widths: number[]) => void`

Uses same icon map: `{ text: Type, image: ImageIcon, button: MousePointer2, shape: Square, divider: Minus, spacer: MoveVertical, icon: Star, video: Play, countdown: Timer, 'social-proof': Award, 'animated-bg': Palette }`

Tab switching with `useState<'widgets' | 'sections'>`. Widgets tab shows `grid grid-cols-2 gap-2`, Sections tab shows `grid grid-cols-3 gap-2` with visual column bars.

- [ ] **Step 2: Create layers-panel.tsx**

Tree view showing Section → Column → Widget hierarchy. Uses dnd-kit `SortableContext` with `verticalListSortingStrategy` for reordering sections and widgets within columns. Click to select, expandable sections (chevron), inline rename on double-click, visibility eye toggle, delete with confirmation.

File: `src/components/admin/hero-block-designer/layers-panel.tsx`

Props: `design: HeroBlockDesign`, `selection: BlockSelection | null`, `breakpoint: Breakpoint`, `dispatch: React.Dispatch<BlockDesignerAction>`

Follow same patterns as existing `layers-panel.tsx`: DnD sensor with 8px activation, expand/collapse state, edit mode with Enter/Escape, 2-second delete confirmation timeout.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/hero-block-designer/add-panel.tsx \
        src/components/admin/hero-block-designer/layers-panel.tsx
git commit -m "feat: add left panel components for block hero designer"
```

---

## Task 10: Toolbar

**Files:**
- Create: `src/components/admin/hero-block-designer/block-toolbar.tsx`

- [ ] **Step 1: Create block-toolbar.tsx**

Follow the same layout and styling as existing `designer-toolbar.tsx`. Three groups: left (back link, title, hero toggle), center (undo/redo, breakpoint switcher), right (templates, preview, save, reset).

Remove grid toggle and zoom controls (not needed for block editor — canvas auto-scales). Remove layout mode toggle (sections have their own contentWidth setting).

```typescript
// src/components/admin/hero-block-designer/block-toolbar.tsx
'use client'

import Link from 'next/link'
import { ArrowLeft, Eye, LayoutTemplate, Loader2, Monitor, Redo2, RotateCcw, Save, Smartphone, Tablet, Undo2 } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import type { Breakpoint } from '@/types/hero-block-designer'

interface BlockToolbarProps {
  tenantSlug: string
  breakpoint: Breakpoint
  canUndo: boolean
  canRedo: boolean
  isSaving: boolean
  hasUnsavedChanges: boolean
  heroSectionEnabled: boolean
  onToggleHeroSection: (enabled: boolean) => void
  onUndo: () => void
  onRedo: () => void
  onSetBreakpoint: (bp: Breakpoint) => void
  onSave: () => void
  onReset: () => void
  onPreview: () => void
  onOpenTemplates: () => void
}

const BREAKPOINTS: { id: Breakpoint; icon: typeof Monitor; label: string }[] = [
  { id: 'desktop', icon: Monitor, label: 'Desktop' },
  { id: 'tablet', icon: Tablet, label: 'Tablet' },
  { id: 'mobile', icon: Smartphone, label: 'Mobile' },
]

export function BlockToolbar({
  tenantSlug,
  breakpoint,
  canUndo,
  canRedo,
  isSaving,
  hasUnsavedChanges,
  heroSectionEnabled,
  onToggleHeroSection,
  onUndo,
  onRedo,
  onSetBreakpoint,
  onSave,
  onReset,
  onPreview,
  onOpenTemplates,
}: BlockToolbarProps) {
  return (
    <div className="flex h-14 shrink-0 items-center gap-2 border-b bg-white px-4">
      {/* Left: Back + Title + Toggle */}
      <Link href={`/${tenantSlug}/admin`} className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100">
        <ArrowLeft size={18} />
      </Link>
      <span className="text-sm font-semibold text-gray-900">Hero Designer</span>
      <div className="flex items-center gap-2 pl-2">
        <Switch checked={heroSectionEnabled} onCheckedChange={onToggleHeroSection} />
        <span className="text-xs text-gray-500">{heroSectionEnabled ? 'Visible' : 'Hidden'}</span>
      </div>

      <div className="h-6 border-l border-gray-200" />

      {/* Center: Undo/Redo + Breakpoints */}
      <button type="button" onClick={onUndo} disabled={!canUndo} className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-40" title="Undo (Ctrl+Z)">
        <Undo2 size={18} />
      </button>
      <button type="button" onClick={onRedo} disabled={!canRedo} className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-40" title="Redo (Ctrl+Y)">
        <Redo2 size={18} />
      </button>

      <div className="h-6 border-l border-gray-200" />

      <div className="flex items-center gap-1">
        {BREAKPOINTS.map((bp) => {
          const Icon = bp.icon
          const isActive = breakpoint === bp.id
          return (
            <button
              key={bp.id}
              type="button"
              onClick={() => onSetBreakpoint(bp.id)}
              className={`flex items-center gap-1 rounded-md px-2 py-1.5 text-sm transition-colors ${
                isActive ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Icon size={16} />
              <span className="hidden sm:inline">{bp.label}</span>
            </button>
          )
        })}
      </div>

      <span className="flex-1" />

      {/* Right: Templates + Preview + Save + Reset */}
      <button type="button" onClick={onOpenTemplates} className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-100">
        <LayoutTemplate size={16} />
        <span className="hidden sm:inline">Templates</span>
      </button>

      <button type="button" onClick={onPreview} className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-100">
        <Eye size={16} />
        <span className="hidden sm:inline">Preview</span>
      </button>

      <div className="h-6 border-l border-gray-200" />

      <div className="relative">
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving || !hasUnsavedChanges}
          className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save
        </button>
        {hasUnsavedChanges && !isSaving && (
          <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-yellow-400" />
        )}
      </div>

      <button
        type="button"
        onClick={onReset}
        className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        title="Reset design"
      >
        <RotateCcw size={16} />
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/hero-block-designer/block-toolbar.tsx
git commit -m "feat: add toolbar for block hero designer"
```

---

## Task 11: Main Editor Shell + Template Picker + Preview Modal

**Files:**
- Create: `src/components/admin/hero-block-designer/template-picker.tsx`
- Create: `src/components/admin/hero-block-designer/preview-modal.tsx`
- Create: `src/components/admin/hero-block-designer/hero-block-designer.tsx`

- [ ] **Step 1: Create template-picker.tsx**

Same pattern as existing `template-picker.tsx`: full-screen modal, grid of template cards with thumbnails, blank template option. Uses `blockHeroTemplates` from `hero-block-templates.ts`. Confirm before replacing.

- [ ] **Step 2: Create preview-modal.tsx**

Same pattern as existing `preview-modal.tsx`: full-screen dark modal, device switcher (desktop/tablet/mobile), renders `BlockHeroRenderer`. Uses breakpoint widths for container sizing.

- [ ] **Step 3: Create hero-block-designer.tsx**

Main editor shell. Assembles all components:

```typescript
// src/components/admin/hero-block-designer/hero-block-designer.tsx
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useHeroBlockDesigner } from '@/hooks/use-hero-block-designer'
import { saveHeroDesignAction, updateHeroSectionEnabledAction } from '@/app/actions/hero-designer'
import { createBlankBlockDesign } from '@/lib/hero-block-defaults'
import { BlockToolbar } from '@/components/admin/hero-block-designer/block-toolbar'
import { AddPanel } from '@/components/admin/hero-block-designer/add-panel'
import { BlockLayersPanel } from '@/components/admin/hero-block-designer/layers-panel'
import { BlockCanvas } from '@/components/admin/hero-block-designer/block-canvas'
import { SettingsPanel } from '@/components/admin/hero-block-designer/settings-panel'
import { BlockTemplatePicker } from '@/components/admin/hero-block-designer/template-picker'
import { BlockPreviewModal } from '@/components/admin/hero-block-designer/preview-modal'
import type { HeroBlockDesign, BlockWidgetType } from '@/types/hero-block-designer'

interface HeroBlockDesignerProps {
  tenantId: string
  tenantSlug: string
  initialDesign: HeroBlockDesign | null
  initialHeroSectionEnabled: boolean
}

export function HeroBlockDesigner({
  tenantId,
  tenantSlug,
  initialDesign,
  initialHeroSectionEnabled,
}: HeroBlockDesignerProps) {
  const {
    state,
    dispatch,
    canUndo,
    canRedo,
    selectedWidget,
    selectedSection,
    selectedColumn,
    undo,
    redo,
  } = useHeroBlockDesigner(initialDesign ?? undefined)

  const [isSaving, setIsSaving] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [heroSectionEnabled, setHeroSectionEnabled] = useState(initialHeroSectionEnabled)
  const [leftTab, setLeftTab] = useState<'add' | 'layers'>('add')

  const lastSavedRef = useRef(JSON.stringify(initialDesign))
  const hasUnsavedChanges = JSON.stringify(state.design) !== lastSavedRef.current

  // Toggle hero visibility
  const handleToggleHero = useCallback(async (enabled: boolean) => {
    setHeroSectionEnabled(enabled)
    try {
      const result = await updateHeroSectionEnabledAction(tenantId, tenantSlug, enabled)
      if (!result.success) {
        setHeroSectionEnabled(!enabled)
        toast.error(result.error ?? 'Failed to update')
      } else {
        toast.success(enabled ? 'Hero section visible' : 'Hero section hidden')
      }
    } catch {
      setHeroSectionEnabled(!enabled)
      toast.error('An unexpected error occurred')
    }
  }, [tenantId, tenantSlug])

  // Save
  const handleSave = useCallback(async () => {
    setIsSaving(true)
    try {
      const result = await saveHeroDesignAction(tenantId, tenantSlug, state.design as unknown as Parameters<typeof saveHeroDesignAction>[2])
      if (result.success) {
        lastSavedRef.current = JSON.stringify(state.design)
        toast.success('Hero design saved')
      } else {
        toast.error(result.error ?? 'Failed to save')
      }
    } catch {
      toast.error('An unexpected error occurred')
    } finally {
      setIsSaving(false)
    }
  }, [tenantId, tenantSlug, state.design])

  // Reset
  const handleReset = useCallback(async () => {
    if (!window.confirm('Reset design? This will clear all content.')) return
    setIsSaving(true)
    try {
      const result = await saveHeroDesignAction(tenantId, tenantSlug, null)
      if (result.success) {
        dispatch({ type: 'SET_DESIGN', design: createBlankBlockDesign() })
        lastSavedRef.current = JSON.stringify(null)
        toast.success('Design reset')
      } else {
        toast.error(result.error ?? 'Failed to reset')
      }
    } catch {
      toast.error('An unexpected error occurred')
    } finally {
      setIsSaving(false)
    }
  }, [tenantId, tenantSlug, dispatch])

  // Template selection
  const handleSelectTemplate = useCallback((design: HeroBlockDesign) => {
    dispatch({ type: 'SET_DESIGN', design })
  }, [dispatch])

  // Add widget to selected column (or first column of last section)
  const handleAddWidget = useCallback((widgetType: BlockWidgetType) => {
    const sel = state.selection
    if (sel?.columnId && sel.sectionId) {
      dispatch({ type: 'ADD_WIDGET', sectionId: sel.sectionId, columnId: sel.columnId, widgetType })
      return
    }
    if (sel?.sectionId) {
      const section = state.design.sections.find((s) => s.id === sel.sectionId)
      if (section && section.columns.length > 0) {
        dispatch({ type: 'ADD_WIDGET', sectionId: section.id, columnId: section.columns[0].id, widgetType })
        return
      }
    }
    // Fallback: last section, first column
    const lastSection = state.design.sections[state.design.sections.length - 1]
    if (lastSection && lastSection.columns.length > 0) {
      dispatch({ type: 'ADD_WIDGET', sectionId: lastSection.id, columnId: lastSection.columns[0].id, widgetType })
    } else {
      toast.info('Add a section first')
    }
  }, [state.selection, state.design.sections, dispatch])

  // Add section
  const handleAddSection = useCallback((widths: number[]) => {
    dispatch({ type: 'ADD_SECTION', columnWidths: widths })
  }, [dispatch])

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      const mod = e.metaKey || e.ctrlKey

      if ((e.key === 'Delete' || e.key === 'Backspace') && state.selection) {
        e.preventDefault()
        if (state.selection.type === 'widget' && state.selection.columnId) {
          dispatch({
            type: 'REMOVE_WIDGET',
            sectionId: state.selection.sectionId,
            columnId: state.selection.columnId,
            widgetId: state.selection.widgetId!,
          })
        } else if (state.selection.type === 'section') {
          dispatch({ type: 'REMOVE_SECTION', sectionId: state.selection.sectionId })
        }
        return
      }

      if (mod && !e.shiftKey && e.key === 'z') { e.preventDefault(); undo(); return }
      if ((mod && e.shiftKey && e.key === 'z') || (mod && e.key === 'y')) { e.preventDefault(); redo(); return }

      if (mod && e.key === 'd' && state.selection) {
        e.preventDefault()
        if (state.selection.type === 'widget' && state.selection.columnId) {
          dispatch({
            type: 'DUPLICATE_WIDGET',
            sectionId: state.selection.sectionId,
            columnId: state.selection.columnId,
            widgetId: state.selection.widgetId!,
          })
        } else if (state.selection.type === 'section') {
          dispatch({ type: 'DUPLICATE_SECTION', sectionId: state.selection.sectionId })
        }
        return
      }

      if (e.key === 'Escape') {
        e.preventDefault()
        if (state.selection?.type === 'widget') {
          dispatch({ type: 'SELECT_BLOCK', selection: { type: 'column', sectionId: state.selection.sectionId, columnId: state.selection.columnId! } })
        } else if (state.selection?.type === 'column') {
          dispatch({ type: 'SELECT_BLOCK', selection: { type: 'section', sectionId: state.selection.sectionId } })
        } else {
          dispatch({ type: 'SELECT_BLOCK', selection: null })
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [state.selection, dispatch, undo, redo])

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <BlockToolbar
        tenantSlug={tenantSlug}
        breakpoint={state.activeBreakpoint}
        canUndo={canUndo}
        canRedo={canRedo}
        isSaving={isSaving}
        hasUnsavedChanges={hasUnsavedChanges}
        heroSectionEnabled={heroSectionEnabled}
        onToggleHeroSection={handleToggleHero}
        onUndo={undo}
        onRedo={redo}
        onSetBreakpoint={(bp) => dispatch({ type: 'SET_BREAKPOINT', breakpoint: bp })}
        onSave={handleSave}
        onReset={handleReset}
        onPreview={() => setShowPreview(true)}
        onOpenTemplates={() => setShowTemplates(true)}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel */}
        <div className="flex w-[280px] flex-col border-r bg-white">
          <div className="flex border-b">
            {(['add', 'layers'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setLeftTab(tab)}
                className={`flex-1 px-3 py-2 text-xs font-medium uppercase tracking-wider transition-colors ${
                  leftTab === tab ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab === 'add' ? 'Add' : 'Layers'}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {leftTab === 'add' ? (
              <AddPanel onAddWidget={handleAddWidget} onAddSection={handleAddSection} />
            ) : (
              <BlockLayersPanel
                design={state.design}
                selection={state.selection}
                breakpoint={state.activeBreakpoint}
                dispatch={dispatch}
              />
            )}
          </div>
        </div>

        {/* Center: Canvas */}
        <div className="flex-1 overflow-hidden">
          <BlockCanvas
            design={state.design}
            breakpoint={state.activeBreakpoint}
            selection={state.selection}
            dispatch={dispatch}
          />
        </div>

        {/* Right: Settings */}
        <SettingsPanel
          design={state.design}
          selection={state.selection}
          breakpoint={state.activeBreakpoint}
          selectedSection={selectedSection}
          selectedColumn={selectedColumn}
          selectedWidget={selectedWidget}
          dispatch={dispatch}
        />
      </div>

      <BlockTemplatePicker
        isOpen={showTemplates}
        onClose={() => setShowTemplates(false)}
        onSelectTemplate={handleSelectTemplate}
      />

      <BlockPreviewModal
        design={state.design}
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
      />
    </div>
  )
}

export default HeroBlockDesigner
```

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/hero-block-designer/template-picker.tsx \
        src/components/admin/hero-block-designer/preview-modal.tsx \
        src/components/admin/hero-block-designer/hero-block-designer.tsx
git commit -m "feat: add main editor shell for block hero designer"
```

---

## Task 12: Production Renderer

**Files:**
- Create: `src/components/customer/block-hero-renderer.tsx`

- [ ] **Step 1: Create block-hero-renderer.tsx**

Renders the v4 block design for customers. Follows patterns from existing `hero-renderer.tsx`: three breakpoint renders (desktop lg:block, tablet md:block lg:hidden, mobile block md:hidden), Framer Motion animations, CSS containment.

The renderer:
- Maps over `design.sections`, rendering each as `<section>` with flex row of columns
- Applies section settings (background, padding, margin, minHeight, contentWidth)
- Columns use flexbox with `flex: width%` and vertical/horizontal alignment
- Widgets render based on props.kind switch (same rendering logic as canvas-element for text, image, button, etc.)
- Wraps each widget in Framer Motion `motion.div` for entrance animations
- Respects `widget.visibility` per breakpoint
- Uses `getActiveSectionSettings`, `getActiveColumnSettings`, `getActiveWidgetProps` for responsive resolution
- Uses the same icon map as existing renderer for icon widgets

Props: `design: HeroBlockDesign`, `className?: string`

- [ ] **Step 2: Verify lint passes**

Run: `npx next lint --file src/components/customer/block-hero-renderer.tsx 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add src/components/customer/block-hero-renderer.tsx
git commit -m "feat: add production renderer for block hero designs"
```

---

## Task 13: Server Action Updates + Admin Page Integration

**Files:**
- Modify: `src/app/actions/hero-designer.ts`
- Modify: `src/app/[tenant]/admin/hero-designer/hero-designer-wrapper.tsx`
- Modify: `src/app/[tenant]/admin/hero-designer/page.tsx`

- [ ] **Step 1: Update saveHeroDesignAction to accept v4**

In `src/app/actions/hero-designer.ts`, add v4 schema validation:

```typescript
// Add import at top:
import { heroBlockDesignSchema } from '@/lib/hero-block-schemas'

// In saveHeroDesignAction, before the existing validation:
// Check if it's a v4 block design
if (design && typeof design === 'object' && 'version' in design && (design as { version: number }).version === 4) {
  const blockResult = heroBlockDesignSchema.safeParse(design)
  if (!blockResult.success) {
    return { success: false, error: `Validation failed: ${blockResult.error.issues[0]?.message}` }
  }
} else if (design) {
  // Existing v3 validation
  const result = heroDesignSchema.safeParse(design)
  // ...existing code
}
```

- [ ] **Step 2: Update hero-designer-wrapper.tsx**

Change the dynamic import to load the new block designer:

```typescript
// src/app/[tenant]/admin/hero-designer/hero-designer-wrapper.tsx
'use client'

import dynamic from 'next/dynamic'
import type { HeroBlockDesign } from '@/types/hero-block-designer'

const HeroBlockDesigner = dynamic(
  () => import('@/components/admin/hero-block-designer/hero-block-designer').then(m => m.HeroBlockDesigner),
  { ssr: false },
)

interface HeroDesignerWrapperProps {
  tenantId: string
  tenantSlug: string
  initialDesign: HeroBlockDesign | null
  initialHeroSectionEnabled: boolean
}

export default function HeroDesignerWrapper({
  tenantId,
  tenantSlug,
  initialDesign,
  initialHeroSectionEnabled,
}: HeroDesignerWrapperProps) {
  // Clean break: if design is not v4, treat as null
  const blockDesign = initialDesign && typeof initialDesign === 'object' && 'version' in initialDesign && (initialDesign as { version: number }).version === 4
    ? initialDesign as HeroBlockDesign
    : null

  return (
    <HeroBlockDesigner
      tenantId={tenantId}
      tenantSlug={tenantSlug}
      initialDesign={blockDesign}
      initialHeroSectionEnabled={initialHeroSectionEnabled}
    />
  )
}
```

- [ ] **Step 3: Update page.tsx to pass correct types**

The page.tsx likely just needs to pass the raw hero_design (which is JSON) — the wrapper handles version detection. Verify the page works by reading it, then make minimal changes if needed.

- [ ] **Step 4: Verify build compiles**

Run: `npm run lint`
Expected: No errors in modified files

- [ ] **Step 5: Commit**

```bash
git add src/app/actions/hero-designer.ts \
        src/app/[tenant]/admin/hero-designer/hero-designer-wrapper.tsx \
        src/app/[tenant]/admin/hero-designer/page.tsx
git commit -m "feat: integrate block hero designer into admin pages"
```

---

## Task 14: Menu Client Integration

**Files:**
- Modify: `src/app/[tenant]/menu/menu-client.tsx`

- [ ] **Step 1: Add BlockHeroRenderer import and version detection**

In `menu-client.tsx`, add:

```typescript
// Add import:
import { BlockHeroRenderer } from '@/components/customer/block-hero-renderer'
import type { HeroBlockDesign } from '@/types/hero-block-designer'
```

- [ ] **Step 2: Update hero rendering conditional**

Find the existing hero rendering code and update it to check design version:

```typescript
// Where HeroRenderer is currently rendered, add version check:
const heroDesign = tenant?.hero_design as Record<string, unknown> | null
const isBlockDesign = heroDesign && heroDesign.version === 4

// In the JSX where hero is rendered:
{tenant?.hero_section_enabled !== false && heroDesign && (
  isBlockDesign
    ? <BlockHeroRenderer design={heroDesign as unknown as HeroBlockDesign} />
    : null  // Clean break: old designs render nothing
)}
```

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/app/[tenant]/menu/menu-client.tsx
git commit -m "feat: render block hero designs on customer menu page"
```

---

## Task 15: Final Verification

- [ ] **Step 1: Run all tests**

Run: `npm run test -- --no-coverage`
Expected: All tests pass including new hero-block-* tests

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: No lint errors

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds (may have pre-existing errors in mcp/src — those are known)

- [ ] **Step 4: Manual smoke test**

Start dev server: `npm run dev`
1. Navigate to `/{tenant}/admin/hero-designer`
2. Verify block editor loads with blank canvas
3. Add a section (click section preset)
4. Add widgets (text, button, image)
5. Select section → verify section settings panel shows
6. Select column → verify column settings panel shows
7. Select widget → verify widget settings panel shows
8. Switch breakpoints → verify canvas resizes
9. Load a template → verify it renders
10. Save → verify toast appears
11. Navigate to `/{tenant}/menu` → verify hero renders for customer

- [ ] **Step 5: Commit any final fixes**

```bash
git add -A
git commit -m "fix: address final integration issues for block hero designer"
```
