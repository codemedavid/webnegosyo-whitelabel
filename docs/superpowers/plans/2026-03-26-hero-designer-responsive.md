# Hero Designer — Responsive Breakpoints & Per-Device Visibility

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tablet breakpoint, per-device visibility, and fix breakpoint isolation so mobile/tablet edits don't bleed into desktop.

**Architecture:** Extend the existing `HeroElement` type with a `tablet` layout field, `tabletProps` optional override, and replace global `visible: boolean` with `visibility: { desktop, tablet, mobile }`. Migrate existing v2 designs to v3 at read time. Update all admin designer panels and the customer-facing renderer for three breakpoints.

**Tech Stack:** TypeScript, Zod, React (hooks + components), Tailwind CSS, Framer Motion

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/types/hero-designer.ts` | Modify | Add tablet types, ElementVisibility, update Breakpoint union |
| `src/lib/hero-designer-schemas.ts` | Modify | Add tablet/visibility schemas, version 3 |
| `src/lib/hero-designer-defaults.ts` | Modify | Update factories, getActiveProps, migration v2→v3 |
| `src/lib/hero-designer-templates.ts` | Modify | Update all templates to v3 format |
| `src/hooks/use-hero-designer.ts` | Modify | New actions, tablet support in reducer |
| `src/components/admin/hero-designer/designer-toolbar.tsx` | Modify | Three-button breakpoint toggle |
| `src/components/admin/hero-designer/designer-canvas.tsx` | Modify | Per-breakpoint visibility filter |
| `src/components/admin/hero-designer/canvas-element.tsx` | Modify | Per-breakpoint visibility check |
| `src/components/admin/hero-designer/layers-panel.tsx` | Modify | Per-breakpoint eye toggle |
| `src/components/admin/hero-designer/properties-panel.tsx` | Modify | Override indicators, visibility checkboxes, fix appearance bug |
| `src/components/admin/hero-designer/property-sections/appearance-section.tsx` | Modify | Fix: use resolved props, accept breakpoint |
| `src/components/admin/hero-designer/hero-designer.tsx` | Modify | Wire new actions/props |
| `src/components/customer/hero-renderer.tsx` | Modify | Three-breakpoint rendering |
| `tests/unit/lib/hero-designer-defaults.test.ts` | Create | Tests for getActiveProps, migration, factories |

---

### Task 1: Types — Add Tablet Breakpoint & ElementVisibility

**Files:**
- Modify: `src/types/hero-designer.ts`

- [ ] **Step 1: Update the Breakpoint type**

In `src/types/hero-designer.ts`, change the `Breakpoint` type:

```typescript
export type Breakpoint = 'desktop' | 'tablet' | 'mobile'
```

- [ ] **Step 2: Add ElementVisibility interface**

Add after the `Spacing` interface:

```typescript
export interface ElementVisibility {
  desktop: boolean
  tablet: boolean
  mobile: boolean
}
```

- [ ] **Step 3: Update HeroElement**

Replace the `visible: boolean` field and add tablet fields:

```typescript
export interface HeroElement {
  id: string
  type: HeroElementType
  label: string
  /** @deprecated Use visibility instead. Kept for v2 backward compat at read time. */
  visible?: boolean
  visibility: ElementVisibility
  locked: boolean
  zIndex: number
  desktop: ElementLayout
  tablet: ElementLayout
  mobile: ElementLayout
  props: ElementProps
  tabletProps?: ElementProps
  mobileProps?: ElementProps
  animation: ElementAnimation
  parentId?: string | null
}
```

- [ ] **Step 4: Update CanvasConfig**

```typescript
export interface CanvasConfig {
  desktop: { width: 1440; height: number }
  tablet: { width: 768; height: number }
  mobile: { width: 390; height: number }
}
```

- [ ] **Step 5: Update HeroDesign version**

```typescript
export interface HeroDesign {
  version: 1 | 2 | 3
  canvas: CanvasConfig
  backgroundColor: string
  backgroundImage?: {
    url: string
    opacity: number
    objectFit: 'cover' | 'contain' | 'fill'
  }
  layoutMode?: HeroLayoutMode
  elements: HeroElement[]
}
```

- [ ] **Step 6: Commit**

```bash
git add src/types/hero-designer.ts
git commit -m "feat(hero-designer): add tablet breakpoint and ElementVisibility types"
```

---

### Task 2: Defaults — Update Factories, getActiveProps, and Migration

**Files:**
- Modify: `src/lib/hero-designer-defaults.ts`
- Create: `tests/unit/lib/hero-designer-defaults.test.ts`

- [ ] **Step 1: Write tests for getActiveProps three-level fallback**

Create `tests/unit/lib/hero-designer-defaults.test.ts`:

```typescript
import {
  getActiveProps,
  hasPropsOverride,
  migrateDesign,
  createTextElement,
  createBlankDesign,
} from '@/lib/hero-designer-defaults'
import type { TextProps, HeroDesign, HeroElement } from '@/types/hero-designer'

describe('getActiveProps', () => {
  it('returns props for desktop', () => {
    const el = createTextElement()
    const result = getActiveProps(el, 'desktop')
    expect(result).toBe(el.props)
  })

  it('returns tabletProps for tablet when set', () => {
    const el = createTextElement()
    el.tabletProps = { ...el.props, kind: 'text', fontSize: 36 } as TextProps
    const result = getActiveProps(el, 'tablet')
    expect(result).toBe(el.tabletProps)
  })

  it('falls back to props for tablet when tabletProps is undefined', () => {
    const el = createTextElement()
    el.tabletProps = undefined
    const result = getActiveProps(el, 'tablet')
    expect(result).toBe(el.props)
  })

  it('returns mobileProps for mobile when set', () => {
    const el = createTextElement()
    const result = getActiveProps(el, 'mobile')
    expect(result).toBe(el.mobileProps)
  })

  it('falls back to tabletProps for mobile when mobileProps is undefined', () => {
    const el = createTextElement()
    el.mobileProps = undefined
    el.tabletProps = { ...el.props, kind: 'text', fontSize: 36 } as TextProps
    const result = getActiveProps(el, 'mobile')
    expect(result).toBe(el.tabletProps)
  })

  it('falls back to props for mobile when both mobileProps and tabletProps are undefined', () => {
    const el = createTextElement()
    el.mobileProps = undefined
    el.tabletProps = undefined
    const result = getActiveProps(el, 'mobile')
    expect(result).toBe(el.props)
  })
})

describe('hasPropsOverride', () => {
  it('returns false for desktop', () => {
    const el = createTextElement()
    expect(hasPropsOverride(el, 'desktop')).toBe(false)
  })

  it('returns true for tablet when tabletProps is set', () => {
    const el = createTextElement()
    el.tabletProps = { ...el.props }
    expect(hasPropsOverride(el, 'tablet')).toBe(true)
  })

  it('returns false for tablet when tabletProps is undefined', () => {
    const el = createTextElement()
    el.tabletProps = undefined
    expect(hasPropsOverride(el, 'tablet')).toBe(false)
  })

  it('returns true for mobile when mobileProps is set', () => {
    const el = createTextElement()
    expect(hasPropsOverride(el, 'mobile')).toBe(true)
  })

  it('returns false for mobile when mobileProps is undefined', () => {
    const el = createTextElement()
    el.mobileProps = undefined
    expect(hasPropsOverride(el, 'mobile')).toBe(false)
  })
})

describe('migrateDesign', () => {
  it('returns v3 designs unchanged', () => {
    const design = createBlankDesign()
    expect(design.version).toBe(3)
    const result = migrateDesign(design)
    expect(result).toBe(design)
  })

  it('migrates v2 design: adds tablet layout, converts visible to visibility', () => {
    const v2Design: HeroDesign = {
      version: 2,
      canvas: {
        desktop: { width: 1440, height: 600 },
        tablet: { width: 768, height: 500 } as never,
        mobile: { width: 390, height: 500 },
      },
      backgroundColor: '#ffffff',
      elements: [
        {
          id: 'test-id',
          type: 'text',
          label: 'Test',
          visible: true,
          locked: false,
          zIndex: 0,
          desktop: { x: 10, y: 10, width: 50, height: -1, rotation: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, margin: { top: 0, right: 0, bottom: 0, left: 0 } },
          mobile: { x: 5, y: 5, width: 90, height: -1, rotation: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, margin: { top: 0, right: 0, bottom: 0, left: 0 } },
          props: { kind: 'text', content: 'Hello', fontFamily: 'Inter', fontSize: 48, fontWeight: 700, lineHeight: 1.2, letterSpacing: 0, color: '#000', textAlign: 'center', textShadow: '', bold: false, italic: false, underline: false },
          animation: { type: 'none', duration: 400, delay: 0 },
        } as unknown as HeroElement,
      ],
    } as unknown as HeroDesign

    const result = migrateDesign(v2Design)
    expect(result.version).toBe(3)

    const el = result.elements[0]
    // tablet layout should be cloned from desktop
    expect(el.tablet).toEqual(el.desktop)
    // visibility should be migrated from visible
    expect(el.visibility).toEqual({ desktop: true, tablet: true, mobile: true })
    // visible should not exist
    expect(el.visible).toBeUndefined()
    // canvas should have tablet
    expect(result.canvas.tablet).toEqual({ width: 768, height: 500 })
  })

  it('migrates visible: false to all-hidden visibility', () => {
    const v2Design = {
      version: 2,
      canvas: { desktop: { width: 1440, height: 600 }, mobile: { width: 390, height: 500 } },
      backgroundColor: '#fff',
      elements: [{
        id: 'test-id',
        type: 'text',
        label: 'Test',
        visible: false,
        locked: false,
        zIndex: 0,
        desktop: { x: 0, y: 0, width: 50, height: 10, rotation: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, margin: { top: 0, right: 0, bottom: 0, left: 0 } },
        mobile: { x: 0, y: 0, width: 50, height: 10, rotation: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, margin: { top: 0, right: 0, bottom: 0, left: 0 } },
        props: { kind: 'text', content: 'Hello', fontFamily: 'Inter', fontSize: 48, fontWeight: 700, lineHeight: 1.2, letterSpacing: 0, color: '#000', textAlign: 'center', textShadow: '', bold: false, italic: false, underline: false },
        animation: { type: 'none', duration: 400, delay: 0 },
      }],
    } as unknown as HeroDesign

    const result = migrateDesign(v2Design)
    expect(result.elements[0].visibility).toEqual({ desktop: false, tablet: false, mobile: false })
  })
})

describe('createTextElement', () => {
  it('creates element with visibility object and tablet layout', () => {
    const el = createTextElement()
    expect(el.visibility).toEqual({ desktop: true, tablet: true, mobile: true })
    expect(el.tablet).toBeDefined()
    expect(el.tablet.x).toBeDefined()
    expect(el.visible).toBeUndefined()
  })
})

describe('createBlankDesign', () => {
  it('creates v3 design with tablet canvas', () => {
    const design = createBlankDesign()
    expect(design.version).toBe(3)
    expect(design.canvas.tablet).toEqual({ width: 768, height: 500 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- --testPathPattern="hero-designer-defaults"`

Expected: Multiple failures — functions don't exist yet or return wrong values.

- [ ] **Step 3: Update baseElement to produce visibility and tablet layout**

In `src/lib/hero-designer-defaults.ts`, update the `baseElement` function:

```typescript
function baseElement(
  type: HeroElementType,
  label: string,
  desktop: Partial<ElementLayout>,
  tablet: Partial<ElementLayout>,
  mobile: Partial<ElementLayout>,
): Omit<HeroElement, 'props'> {
  return {
    id: crypto.randomUUID(),
    type,
    label,
    visibility: { desktop: true, tablet: true, mobile: true },
    locked: false,
    zIndex: 0,
    desktop: defaultLayout(desktop),
    tablet: defaultLayout(tablet),
    mobile: defaultLayout(mobile),
    animation: { ...NO_ANIMATION },
  }
}
```

Add the `ElementVisibility` import to the import block at the top of the file.

- [ ] **Step 4: Update all element factories to pass tablet layout**

Each factory that calls `baseElement` needs a third layout argument for tablet. The tablet layout should be a sensible interpolation between desktop and mobile. Update every factory:

**createTextElement:**
```typescript
...baseElement('text', 'Text',
  { width: 50, height: -1 },
  { x: 5, width: 80, height: -1 },
  { x: 5, width: 90, height: -1 },
),
```

**createImageElement:**
```typescript
...baseElement('image', 'Image',
  { width: 40, height: 50 },
  { x: 5, width: 70, height: 45 },
  { x: 5, width: 90, height: 40 },
),
```

**createButtonElement:**
```typescript
...baseElement('button', 'Button',
  { width: 20, height: 6 },
  { x: 10, width: 60, height: 7 },
  { x: 10, width: 80, height: 8 },
),
```

**createShapeElement:**
```typescript
...baseElement('shape', 'Shape',
  { width: 20, height: 20 },
  { width: 30, height: 20 },
  { width: 40, height: 20 },
),
```

**createDividerElement:**
```typescript
...baseElement('divider', 'Divider',
  { width: 60, height: 1 },
  { x: 5, width: 80, height: 1 },
  { x: 5, width: 90, height: 1 },
),
```

**createIconElement:**
```typescript
...baseElement('icon', 'Icon',
  { width: 5, height: 8 },
  { width: 8, height: 9 },
  { width: 10, height: 10 },
),
```

**createVideoElement:**
```typescript
...baseElement('video', 'Video',
  { x: 0, y: 0, width: 100, height: 100 },
  { x: 0, y: 0, width: 100, height: 100 },
  { x: 0, y: 0, width: 100, height: 100 },
),
```

**createCountdownElement:**
```typescript
...baseElement('countdown', 'Countdown',
  { width: 40, height: 10 },
  { x: 5, width: 70, height: 10 },
  { x: 5, width: 90, height: 10 },
),
```

**createSocialProofElement:**
```typescript
...baseElement('social-proof', 'Social Proof',
  { width: 20, height: 5 },
  { x: 10, width: 60, height: 5 },
  { x: 10, width: 80, height: 5 },
),
```

**createAnimatedBgElement:**
```typescript
...baseElement('animated-bg', 'Animated Background',
  { x: 0, y: 0, width: 100, height: 100 },
  { x: 0, y: 0, width: 100, height: 100 },
  { x: 0, y: 0, width: 100, height: 100 },
),
```

**createRowElement:**
```typescript
...baseElement('row', 'Row',
  { x: 5, y: 10, width: 90, height: 30 },
  { x: 2, y: 10, width: 96, height: 30 },
  { x: 2, y: 10, width: 96, height: 30 },
),
```

**createColumnElement:**
```typescript
...baseElement('column', 'Column',
  { width: 30, height: -1 },
  { width: 50, height: -1 },
  { width: 100, height: -1 },
),
```

- [ ] **Step 5: Update getActiveProps for three-level fallback**

```typescript
export function getActiveProps(element: HeroElement, breakpoint: Breakpoint): ElementProps {
  if (breakpoint === 'mobile') {
    return element.mobileProps ?? element.tabletProps ?? element.props
  }
  if (breakpoint === 'tablet') {
    return element.tabletProps ?? element.props
  }
  return element.props
}
```

- [ ] **Step 6: Add hasPropsOverride helper**

```typescript
export function hasPropsOverride(element: HeroElement, breakpoint: Breakpoint): boolean {
  if (breakpoint === 'desktop') return false
  if (breakpoint === 'tablet') return !!element.tabletProps
  return !!element.mobileProps
}
```

- [ ] **Step 7: Update migrateDesign for v2→v3**

```typescript
export function migrateDesign(design: HeroDesign): HeroDesign {
  if (design.version === 3) return design

  // First ensure v2
  let d = design
  if (d.version === 1) {
    d = {
      ...d,
      version: 2,
      elements: d.elements.map((el) => ({
        ...el,
        mobileProps: el.mobileProps ?? structuredClone(el.props),
        parentId: el.parentId ?? null,
      })),
    }
  }

  // v2 → v3: add tablet, convert visible → visibility
  const canvas = d.canvas as Record<string, { width: number; height: number }>
  return {
    ...d,
    version: 3,
    canvas: {
      desktop: d.canvas.desktop,
      tablet: canvas.tablet ?? { width: 768, height: d.canvas.mobile.height },
      mobile: d.canvas.mobile,
    },
    elements: d.elements.map((el) => {
      const oldVisible = (el as Record<string, unknown>).visible
      const wasVisible = oldVisible !== false

      const { visible: _v, ...rest } = el as HeroElement & { visible?: boolean }
      return {
        ...rest,
        visibility: el.visibility ?? { desktop: wasVisible, tablet: wasVisible, mobile: wasVisible },
        tablet: el.tablet ?? structuredClone(el.desktop),
        tabletProps: el.tabletProps ?? undefined,
        mobileProps: el.mobileProps ?? structuredClone(el.props),
        parentId: el.parentId ?? null,
      }
    }),
  } as HeroDesign
}
```

- [ ] **Step 8: Update createBlankDesign**

```typescript
export function createBlankDesign(): HeroDesign {
  return {
    version: 3,
    canvas: {
      desktop: { width: 1440, height: 600 },
      tablet: { width: 768, height: 500 },
      mobile: { width: 390, height: 500 },
    },
    backgroundColor: '#ffffff',
    layoutMode: 'boxed',
    elements: [],
  }
}
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `npm run test -- --testPathPattern="hero-designer-defaults"`

Expected: All tests PASS.

- [ ] **Step 10: Commit**

```bash
git add src/lib/hero-designer-defaults.ts tests/unit/lib/hero-designer-defaults.test.ts
git commit -m "feat(hero-designer): update defaults, factories, and migration for v3 tablet + visibility"
```

---

### Task 3: Schemas — Update Zod Validation for v3

**Files:**
- Modify: `src/lib/hero-designer-schemas.ts`

- [ ] **Step 1: Add ElementVisibility schema and update element schema**

In `src/lib/hero-designer-schemas.ts`:

Add the visibility schema after the `spacingSchema`:

```typescript
const elementVisibilitySchema = z.object({
  desktop: z.boolean(),
  tablet: z.boolean(),
  mobile: z.boolean(),
})
```

Update the `heroElementSchema` — replace `visible: z.boolean()` with the new fields:

```typescript
const heroElementSchema = z.object({
  id: z.string().uuid(),
  type: z.enum([
    'text', 'image', 'button', 'shape', 'divider', 'icon',
    'video', 'countdown', 'social-proof', 'animated-bg', 'row', 'column',
  ]),
  label: z.string().max(100),
  visible: z.boolean().optional(), // deprecated, kept for v2 compat
  visibility: elementVisibilitySchema,
  locked: z.boolean(),
  zIndex: z.number().int().min(0).max(1000),
  desktop: elementLayoutSchema,
  tablet: elementLayoutSchema,
  mobile: elementLayoutSchema,
  props: elementPropsSchema,
  tabletProps: elementPropsSchema.optional(),
  mobileProps: elementPropsSchema.optional(),
  animation: elementAnimationSchema,
  parentId: z.string().uuid().nullable().optional(),
})
```

- [ ] **Step 2: Update canvasConfigSchema**

```typescript
const canvasConfigSchema = z.object({
  desktop: z.object({
    width: z.literal(1440),
    height: z.number().int().min(100).max(2000),
  }),
  tablet: z.object({
    width: z.literal(768),
    height: z.number().int().min(100).max(2000),
  }),
  mobile: z.object({
    width: z.literal(390),
    height: z.number().int().min(100).max(2000),
  }),
})
```

- [ ] **Step 3: Update heroDesignSchema version**

```typescript
export const heroDesignSchema = z.object({
  version: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  canvas: canvasConfigSchema,
  backgroundColor: cssColorString(),
  backgroundImage: z
    .object({
      url: z.string().url().max(2000),
      opacity: z.number().min(0).max(1),
      objectFit: z.enum(['cover', 'contain', 'fill']),
    })
    .optional(),
  layoutMode: z.enum(['fullscreen', 'boxed']).optional(),
  elements: z.array(heroElementSchema).max(50),
})
```

- [ ] **Step 4: Add elementVisibilitySchema to re-exports**

```typescript
export {
  spacingSchema,
  elementLayoutSchema,
  elementVisibilitySchema,
  // ... rest of existing exports
}
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/hero-designer-schemas.ts
git commit -m "feat(hero-designer): update Zod schemas for v3 tablet + visibility"
```

---

### Task 4: State Management — Update Reducer for Tablet + Visibility

**Files:**
- Modify: `src/hooks/use-hero-designer.ts`

- [ ] **Step 1: Add new action types**

In the `DesignerAction` union, add:

```typescript
| { type: 'TOGGLE_BREAKPOINT_VISIBILITY'; id: string; breakpoint: Breakpoint }
| { type: 'RESET_BREAKPOINT_PROPS'; id: string; breakpoint: Breakpoint }
| { type: 'RESET_BREAKPOINT_LAYOUT'; id: string; breakpoint: Breakpoint }
```

- [ ] **Step 2: Update UPDATE_ELEMENT_PROPS to handle tablet**

Replace the existing `UPDATE_ELEMENT_PROPS` case:

```typescript
case 'UPDATE_ELEMENT_PROPS': {
  const stateWithHistory = pushHistory(state)
  const targetField =
    action.breakpoint === 'mobile' ? 'mobileProps'
    : action.breakpoint === 'tablet' ? 'tabletProps'
    : 'props'
  return {
    ...stateWithHistory,
    design: updateElement(
      stateWithHistory.design,
      action.id,
      (el) => {
        const currentProps = targetField === 'mobileProps'
          ? (el.mobileProps ?? el.tabletProps ?? el.props)
          : targetField === 'tabletProps'
            ? (el.tabletProps ?? el.props)
            : el.props
        return {
          ...el,
          [targetField]: { ...currentProps, ...action.props } as ElementProps,
        }
      },
    ),
  }
}
```

- [ ] **Step 3: Add TOGGLE_BREAKPOINT_VISIBILITY case**

```typescript
case 'TOGGLE_BREAKPOINT_VISIBILITY': {
  const stateWithHistory = pushHistory(state)
  return {
    ...stateWithHistory,
    design: updateElement(
      stateWithHistory.design,
      action.id,
      (el) => ({
        ...el,
        visibility: {
          ...el.visibility,
          [action.breakpoint]: !el.visibility[action.breakpoint],
        },
      }),
    ),
  }
}
```

- [ ] **Step 4: Add RESET_BREAKPOINT_PROPS case**

```typescript
case 'RESET_BREAKPOINT_PROPS': {
  if (action.breakpoint === 'desktop') return state
  const stateWithHistory = pushHistory(state)
  const field = action.breakpoint === 'tablet' ? 'tabletProps' : 'mobileProps'
  return {
    ...stateWithHistory,
    design: updateElement(
      stateWithHistory.design,
      action.id,
      (el) => ({ ...el, [field]: undefined }),
    ),
  }
}
```

- [ ] **Step 5: Add RESET_BREAKPOINT_LAYOUT case**

```typescript
case 'RESET_BREAKPOINT_LAYOUT': {
  if (action.breakpoint === 'desktop') return state
  const stateWithHistory = pushHistory(state)
  return {
    ...stateWithHistory,
    design: updateElement(
      stateWithHistory.design,
      action.id,
      (el) => {
        const source = action.breakpoint === 'tablet' ? el.desktop : el.tablet
        return { ...el, [action.breakpoint]: structuredClone(source) }
      },
    ),
  }
}
```

- [ ] **Step 6: Update UPDATE_ELEMENT_META to handle visibility**

The existing `UPDATE_ELEMENT_META` case merges `action.meta` into the element. Since `visibility` is now an object, we need to deep-merge it:

```typescript
case 'UPDATE_ELEMENT_META': {
  const stateWithHistory = pushHistory(state)
  return {
    ...stateWithHistory,
    design: updateElement(
      stateWithHistory.design,
      action.id,
      (el) => {
        const updates = { ...action.meta }
        // Deep-merge visibility if provided
        if ('visibility' in updates && updates.visibility) {
          (updates as Record<string, unknown>).visibility = {
            ...el.visibility,
            ...updates.visibility,
          }
        }
        return { ...el, ...updates }
      },
    ),
  }
}
```

Also update the `meta` type in `DesignerAction` to include visibility:

```typescript
| {
    type: 'UPDATE_ELEMENT_META'
    id: string
    meta: Partial<Pick<HeroElement, 'label' | 'visibility' | 'locked' | 'zIndex'>>
  }
```

- [ ] **Step 7: Update DUPLICATE_ELEMENT to clone tablet fields**

In the `DUPLICATE_ELEMENT` case, update the cloned element:

```typescript
const cloned: HeroElement = {
  ...structuredClone(source),
  id: crypto.randomUUID(),
  label: `${source.label} (copy)`,
  desktop: {
    ...structuredClone(source.desktop),
    x: source.desktop.x + 2,
    y: source.desktop.y + 2,
  },
  tablet: {
    ...structuredClone(source.tablet),
    x: source.tablet.x + 2,
    y: source.tablet.y + 2,
  },
  mobile: {
    ...structuredClone(source.mobile),
    x: source.mobile.x + 2,
    y: source.mobile.y + 2,
  },
  tabletProps: source.tabletProps ? structuredClone(source.tabletProps) : undefined,
  mobileProps: source.mobileProps ? structuredClone(source.mobileProps) : undefined,
}
```

- [ ] **Step 8: Update UPDATE_CANVAS for tablet height**

In the `UPDATE_CANVAS` case, add handling for `tabletHeight`:

Add `tabletHeight: number` to the updates type in `DesignerAction`:

```typescript
| {
    type: 'UPDATE_CANVAS'
    updates: Partial<
      Pick<HeroDesign, 'backgroundColor' | 'backgroundImage' | 'layoutMode'> & {
        desktopHeight: number
        tabletHeight: number
        mobileHeight: number
      }
    >
  }
```

Add in the reducer case:

```typescript
if (action.updates.tabletHeight !== undefined) {
  design.canvas = {
    ...design.canvas,
    tablet: { ...design.canvas.tablet, height: action.updates.tabletHeight },
  }
}
```

- [ ] **Step 9: Commit**

```bash
git add src/hooks/use-hero-designer.ts
git commit -m "feat(hero-designer): add tablet + visibility actions to reducer"
```

---

### Task 5: Designer Toolbar — Three-Breakpoint Toggle

**Files:**
- Modify: `src/components/admin/hero-designer/designer-toolbar.tsx`

- [ ] **Step 1: Add Tablet icon import**

Update the import to include `Tablet`:

```typescript
import {
  ArrowLeft,
  Eye,
  Grid3X3,
  LayoutTemplate,
  Loader2,
  Maximize,
  Monitor,
  Redo2,
  RotateCcw,
  Save,
  Smartphone,
  Square,
  Tablet,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
```

- [ ] **Step 2: Add tablet button between desktop and mobile**

In the center group, between the Monitor and Smartphone buttons, add:

```tsx
<button
  onClick={() => onSetBreakpoint('tablet')}
  className={`rounded-md p-1.5 ${breakpoint === 'tablet' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-100'}`}
  title="Tablet (768px)"
>
  <Tablet className="h-4 w-4" />
</button>
```

- [ ] **Step 3: Add breakpoint label below the toggle**

After the three breakpoint buttons (before the divider), add a subtle label:

```tsx
<span className="ml-1 text-xs text-gray-400">
  {breakpoint === 'desktop' ? '1440px' : breakpoint === 'tablet' ? '768px' : '390px'}
</span>
```

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/hero-designer/designer-toolbar.tsx
git commit -m "feat(hero-designer): add tablet breakpoint button to toolbar"
```

---

### Task 6: Designer Canvas — Per-Breakpoint Visibility Filtering

**Files:**
- Modify: `src/components/admin/hero-designer/designer-canvas.tsx`

- [ ] **Step 1: Update root element filter**

Change the filter from `el.visible` to `el.visibility[breakpoint]`:

```typescript
const sortedElements = [...design.elements]
  .filter((el) => el.visibility[breakpoint] && !el.parentId)
  .sort((a, b) => a.zIndex - b.zIndex)
```

- [ ] **Step 2: Update childrenByParent filter**

```typescript
for (const el of design.elements) {
  if (el.parentId && el.visibility[breakpoint]) {
    const siblings = childrenByParent.get(el.parentId) ?? []
    siblings.push(el)
    childrenByParent.set(el.parentId, siblings)
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/hero-designer/designer-canvas.tsx
git commit -m "fix(hero-designer): filter canvas elements by per-breakpoint visibility"
```

---

### Task 7: Canvas Element — Per-Breakpoint Visibility Check

**Files:**
- Modify: `src/components/admin/hero-designer/canvas-element.tsx`

- [ ] **Step 1: Update visibility check**

The `CanvasElement` component already has `breakpoint` in its props. Change:

```typescript
if (!element.visible) return null
```

to:

```typescript
if (!element.visibility[breakpoint]) return null
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/hero-designer/canvas-element.tsx
git commit -m "fix(hero-designer): use per-breakpoint visibility in canvas element"
```

---

### Task 8: Layers Panel — Per-Breakpoint Visibility Toggle

**Files:**
- Modify: `src/components/admin/hero-designer/layers-panel.tsx`

- [ ] **Step 1: Add activeBreakpoint prop**

Update `LayersPanelProps`:

```typescript
interface LayersPanelProps {
  elements: HeroElement[]
  selectedElementId: string | null
  activeBreakpoint: Breakpoint
  onSelectElement: (id: string | null) => void
  onToggleVisibility: (id: string) => void
  onToggleLock: (id: string) => void
  onReorderElements: (elementIds: string[]) => void
  onRemoveElement: (id: string) => void
  onRenameElement: (id: string, label: string) => void
}
```

Add import for `Breakpoint` from `@/types/hero-designer`.

- [ ] **Step 2: Pass activeBreakpoint through to LayerTree**

In `LayersPanel`, pass it to `LayerTree`:

```typescript
<LayerTree
  elements={rootElements}
  allElements={elements}
  selectedElementId={selectedElementId}
  activeBreakpoint={activeBreakpoint}
  depth={0}
  // ... rest of props
/>
```

Update the `LayerTree` function signature to accept `activeBreakpoint: Breakpoint`.

- [ ] **Step 3: Update SortableLayerRow to show per-breakpoint visibility**

Update `SortableLayerRow` to accept `activeBreakpoint: Breakpoint` and use it for opacity/style:

```typescript
const isVisibleOnBreakpoint = element.visibility[activeBreakpoint]
```

Update the row class to show dimmed when hidden on current breakpoint:

```typescript
className={`group flex items-center gap-1 rounded-md border px-1.5 py-1 text-sm transition-colors ${
  !isVisibleOnBreakpoint ? 'opacity-50' : ''
} ${
  isSelected
    ? 'border-blue-200 bg-blue-50'
    : 'border-transparent hover:bg-accent'
}`}
```

Add strikethrough on the label when hidden:

```typescript
<span
  onDoubleClick={handleDoubleClick}
  className={`min-w-0 flex-1 truncate text-xs ${!isVisibleOnBreakpoint ? 'line-through text-muted-foreground' : ''}`}
>
  {element.label}
</span>
```

- [ ] **Step 4: Add breakpoint visibility indicator dots**

After the eye icon button, add small indicator dots when visibility differs across breakpoints:

```typescript
{/* Breakpoint visibility dots — only show when visibility differs */}
{!(element.visibility.desktop === element.visibility.tablet && element.visibility.tablet === element.visibility.mobile) && (
  <div className="flex items-center gap-0.5 ml-0.5" title={`D:${element.visibility.desktop ? '✓' : '✗'} T:${element.visibility.tablet ? '✓' : '✗'} M:${element.visibility.mobile ? '✓' : '✗'}`}>
    <span className={`h-1.5 w-1.5 rounded-full ${element.visibility.desktop ? 'bg-green-400' : 'bg-zinc-600'}`} />
    <span className={`h-1.5 w-1.5 rounded-full ${element.visibility.tablet ? 'bg-green-400' : 'bg-zinc-600'}`} />
    <span className={`h-1.5 w-1.5 rounded-full ${element.visibility.mobile ? 'bg-green-400' : 'bg-zinc-600'}`} />
  </div>
)}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/hero-designer/layers-panel.tsx
git commit -m "feat(hero-designer): per-breakpoint visibility toggle in layers panel"
```

---

### Task 9: Properties Panel — Override Indicators, Visibility Checkboxes, Fix AppearanceSection Bug

**Files:**
- Modify: `src/components/admin/hero-designer/properties-panel.tsx`
- Modify: `src/components/admin/hero-designer/property-sections/appearance-section.tsx`

- [ ] **Step 1: Fix AppearanceSection to use resolved props**

In `appearance-section.tsx`, update to accept `breakpoint` and use resolved props:

```typescript
import { getActiveProps } from '@/lib/hero-designer-defaults'
import type { HeroElement, ElementProps, Breakpoint } from '@/types/hero-designer'

interface AppearanceSectionProps {
  element: HeroElement
  breakpoint: Breakpoint
  onUpdate: (props: Partial<ElementProps>) => void
}

export function AppearanceSection({ element, breakpoint, onUpdate }: AppearanceSectionProps) {
  const resolvedProps = getActiveProps(element, breakpoint)
  const kind = resolvedProps.kind
```

Then replace every `props.` reference in the component body with `resolvedProps.`:

- `'opacity' in props` → `'opacity' in resolvedProps`
- `props.opacity` → `resolvedProps.opacity`
- `'borderWidth' in props` → `'borderWidth' in resolvedProps`
- `props.borderColor` → `resolvedProps.borderColor`
- `'borderRadius' in props` → `'borderRadius' in resolvedProps`
- `'fillColor' in props` → `'fillColor' in resolvedProps`
- `props.fillColor` → `resolvedProps.fillColor`
- `'backgroundColor' in props` → `'backgroundColor' in resolvedProps`
- `props.backgroundColor` → `resolvedProps.backgroundColor`

- [ ] **Step 2: Update PropertiesPanel to pass breakpoint to AppearanceSection**

In `properties-panel.tsx`, update the AppearanceSection call:

```tsx
<AppearanceSection element={element} breakpoint={breakpoint} onUpdate={onUpdateProps} />
```

- [ ] **Step 3: Add visibility checkboxes to ElementProperties**

Import `Breakpoint` from types if not already imported. In the `ElementProperties` component, add a visibility section at the top (after the label/header):

```tsx
{/* Visibility per breakpoint */}
<div className="border-b border-zinc-800 px-3 py-2">
  <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-zinc-400">Visibility</p>
  <div className="flex items-center gap-3">
    {(['desktop', 'tablet', 'mobile'] as const).map((bp) => (
      <label key={bp} className="flex items-center gap-1.5 cursor-pointer">
        <input
          type="checkbox"
          checked={element.visibility[bp]}
          onChange={() => onUpdateMeta({
            visibility: { ...element.visibility, [bp]: !element.visibility[bp] },
          } as Partial<Pick<HeroElement, 'visibility'>>)}
          className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-zinc-900"
        />
        <span className="text-xs text-zinc-300 capitalize">{bp}</span>
      </label>
    ))}
  </div>
</div>
```

- [ ] **Step 4: Add override indicator to section headers**

Import `hasPropsOverride` from `@/lib/hero-designer-defaults`.

Update the `CollapsibleSection` component to accept an optional `hasOverride` prop:

```typescript
function CollapsibleSection({
  title,
  defaultOpen = true,
  hasOverride,
  onResetOverride,
  children,
}: {
  title: string
  defaultOpen?: boolean
  hasOverride?: boolean
  onResetOverride?: () => void
  children: React.ReactNode
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className="border-b border-zinc-800">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-zinc-400 hover:text-zinc-200"
      >
        {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {title}
        {hasOverride && (
          <span className="ml-1 h-1.5 w-1.5 rounded-full bg-blue-400" title="Overridden for this breakpoint" />
        )}
        <span className="flex-1" />
        {hasOverride && onResetOverride && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onResetOverride() }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onResetOverride?.() } }}
            className="text-[10px] text-zinc-500 hover:text-blue-400 normal-case tracking-normal font-normal"
          >
            Reset
          </span>
        )}
      </button>
      {isOpen && <div className="px-3 pb-3">{children}</div>}
    </div>
  )
}
```

- [ ] **Step 5: Wire override indicators in ElementProperties**

In `ElementProperties`, pass `hasOverride` and `onResetOverride` to relevant sections:

```tsx
const isOverridden = hasPropsOverride(element, breakpoint)
const isNonDesktop = breakpoint !== 'desktop'
```

For the Typography section:
```tsx
<CollapsibleSection
  title="Typography"
  hasOverride={isNonDesktop && isOverridden}
  onResetOverride={isNonDesktop ? (() => onResetProps()) : undefined}
>
```

Add `onResetProps` and `onResetLayout` to `ElementProperties` props by adding to `PropertiesPanelProps`:

```typescript
interface PropertiesPanelProps {
  // ... existing props
  onResetBreakpointProps: () => void
  onResetBreakpointLayout: () => void
}
```

- [ ] **Step 6: Update the element header to show inheritance status**

Update the subtitle in `ElementProperties`:

```tsx
<p className="mt-0.5 text-xs text-zinc-500">
  {element.type} · {breakpoint}
  {breakpoint !== 'desktop' && !isOverridden && (
    <span className="ml-1 text-zinc-600">(inherited from {breakpoint === 'mobile' ? (element.tabletProps ? 'tablet' : 'desktop') : 'desktop'})</span>
  )}
  {breakpoint !== 'desktop' && isOverridden && (
    <span className="ml-1 text-blue-400">(overridden)</span>
  )}
</p>
```

- [ ] **Step 7: Commit**

```bash
git add src/components/admin/hero-designer/properties-panel.tsx src/components/admin/hero-designer/property-sections/appearance-section.tsx
git commit -m "feat(hero-designer): override indicators, visibility checkboxes, fix appearance breakpoint bug"
```

---

### Task 10: Main HeroDesigner — Wire New Props and Actions

**Files:**
- Modify: `src/components/admin/hero-designer/hero-designer.tsx`

- [ ] **Step 1: Update LayersPanel call with activeBreakpoint**

```tsx
<LayersPanel
  elements={state.design.elements}
  selectedElementId={state.selectedElementId}
  activeBreakpoint={state.activeBreakpoint}
  onSelectElement={(id) =>
    dispatch({ type: 'SELECT_ELEMENT', id })
  }
  onToggleVisibility={(id) => {
    dispatch({
      type: 'TOGGLE_BREAKPOINT_VISIBILITY',
      id,
      breakpoint: state.activeBreakpoint,
    })
  }}
  // ... rest stays the same
/>
```

- [ ] **Step 2: Update PropertiesPanel call with reset callbacks**

```tsx
<PropertiesPanel
  selectedElement={selectedElement}
  breakpoint={state.activeBreakpoint}
  design={state.design}
  onUpdateLayout={(layout) => {
    if (!selectedElement) return
    dispatch({
      type: 'UPDATE_ELEMENT_LAYOUT',
      id: selectedElement.id,
      breakpoint: state.activeBreakpoint,
      layout,
    })
  }}
  onUpdateProps={(props) => {
    if (!selectedElement) return
    dispatch({
      type: 'UPDATE_ELEMENT_PROPS',
      id: selectedElement.id,
      props,
      breakpoint: state.activeBreakpoint,
    })
  }}
  onUpdateAnimation={(animation) => {
    if (!selectedElement) return
    dispatch({
      type: 'UPDATE_ELEMENT_ANIMATION',
      id: selectedElement.id,
      animation,
    })
  }}
  onUpdateMeta={(meta) => {
    if (!selectedElement) return
    dispatch({
      type: 'UPDATE_ELEMENT_META',
      id: selectedElement.id,
      meta,
    })
  }}
  onResetBreakpointProps={() => {
    if (!selectedElement) return
    dispatch({
      type: 'RESET_BREAKPOINT_PROPS',
      id: selectedElement.id,
      breakpoint: state.activeBreakpoint,
    })
  }}
  onResetBreakpointLayout={() => {
    if (!selectedElement) return
    dispatch({
      type: 'RESET_BREAKPOINT_LAYOUT',
      id: selectedElement.id,
      breakpoint: state.activeBreakpoint,
    })
  }}
  onUpdateCanvas={/* ... existing code stays the same */}
/>
```

- [ ] **Step 3: Update onUpdateCanvas to handle tablet height**

In the `onUpdateCanvas` callback, add tablet height handling:

```typescript
onUpdateCanvas={(updates) => {
  const canvasUpdates: Record<string, unknown> = {}
  if (updates.backgroundColor !== undefined) {
    canvasUpdates.backgroundColor = updates.backgroundColor
  }
  if (updates.backgroundImage !== undefined) {
    canvasUpdates.backgroundImage = updates.backgroundImage
  }
  if (updates.canvasHeight !== undefined) {
    const key =
      updates.canvasHeight.breakpoint === 'desktop'
        ? 'desktopHeight'
        : updates.canvasHeight.breakpoint === 'tablet'
          ? 'tabletHeight'
          : 'mobileHeight'
    canvasUpdates[key] = updates.canvasHeight.height
  }
  dispatch({
    type: 'UPDATE_CANVAS',
    updates: canvasUpdates as Parameters<
      typeof dispatch
    >[0] extends { type: 'UPDATE_CANVAS'; updates: infer U }
      ? U
      : never,
  })
}}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/hero-designer/hero-designer.tsx
git commit -m "feat(hero-designer): wire tablet breakpoint + visibility actions to main designer"
```

---

### Task 11: Templates — Update to v3 Format

**Files:**
- Modify: `src/lib/hero-designer-templates.ts`

- [ ] **Step 1: Update the design helper**

Since `createBlankDesign` now produces v3, and all element factories produce tablet layouts + visibility, update the `design` helper:

```typescript
function design(
  desktopHeight: number,
  tabletHeight: number,
  mobileHeight: number,
  bg: string,
  elements: HeroElement[],
): HeroDesign {
  return {
    version: 3,
    canvas: {
      desktop: { width: 1440, height: desktopHeight },
      tablet: { width: 768, height: tabletHeight },
      mobile: { width: 390, height: mobileHeight },
    },
    backgroundColor: bg,
    elements,
  }
}
```

- [ ] **Step 2: Update all template functions**

Each template call to `design()` needs a tablet height argument. Add a reasonable tablet height (typically between desktop and mobile):

- `classicCentered`: `design(500, 475, 450, ...)`
- `splitLayout`: `design(550, 550, 600, ...)`
- `fullScreenImage`: `design(600, 550, 500, ...)`
- `minimalText`: `design(400, 375, 350, ...)`
- `boldCta`: `design(550, 525, 500, ...)`
- `videoHero`: `design(600, 550, 500, ...)`
- `restaurantShowcase`: `design(550, 500, 450, ...)`
- `promoCountdown`: `design(450, 425, 400, ...)`

Each element factory already adds tablet layout from the updated factories, so no per-element changes needed — the factories handle it.

- [ ] **Step 3: Commit**

```bash
git add src/lib/hero-designer-templates.ts
git commit -m "feat(hero-designer): update all templates to v3 with tablet breakpoint"
```

---

### Task 12: Hero Renderer — Three-Breakpoint Customer Rendering

**Files:**
- Modify: `src/components/customer/hero-renderer.tsx`

- [ ] **Step 1: Update CanvasView visibility filtering**

Change the filter in `CanvasView` from `el.visible !== false` to per-breakpoint:

In the `childrenByParent` memo:
```typescript
if (el.parentId && (el.visibility?.[breakpoint] !== false)) {
```

In the `sortedElements` memo:
```typescript
return [...design.elements]
  .filter((el) => (el.visibility?.[breakpoint] !== false) && !el.parentId)
  .sort((a, b) => a.zIndex - b.zIndex)
```

The `?.` optional chaining handles v2 designs that haven't been migrated yet (no `visibility` field).

- [ ] **Step 2: Update CanvasView to read tablet canvas height**

The `CanvasView` component already reads `design.canvas[breakpoint].height`, so this will work once the canvas has a tablet entry. For backward compat with designs that lack `canvas.tablet`, add a fallback:

```typescript
const height = design.canvas[breakpoint]?.height ?? design.canvas.desktop.height
```

- [ ] **Step 3: Update RenderColumn child visibility filter**

In `RenderColumn`, update the filter:

```typescript
{childElements
  .filter((el) => el.visibility?.[breakpoint] !== false)
  .sort((a, b) => a.zIndex - b.zIndex)
```

- [ ] **Step 4: Update HeroRenderer to render three breakpoints**

Replace the two-div approach with three:

```tsx
export function HeroRenderer({ design, className }: HeroRendererProps) {
  const isFullscreen = design.layoutMode === 'fullscreen'

  return (
    <div
      className={className}
      style={{
        contain: 'layout style paint',
        position: 'relative',
        ...(isFullscreen
          ? {
              width: '100vw',
              marginLeft: 'calc(-50vw + 50%)',
            }
          : {}),
      }}
    >
      {/* Desktop (≥1024px) */}
      <div className="hidden lg:block">
        <CanvasView design={design} breakpoint="desktop" />
      </div>

      {/* Tablet (768–1023px) */}
      <div className="hidden md:block lg:hidden">
        <CanvasView design={design} breakpoint="tablet" />
      </div>

      {/* Mobile (<768px) */}
      <div className="block md:hidden">
        <CanvasView design={design} breakpoint="mobile" />
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/customer/hero-renderer.tsx
git commit -m "feat(hero-designer): three-breakpoint rendering with per-device visibility"
```

---

### Task 13: Lint & Build Verification

**Files:** None — verification only.

- [ ] **Step 1: Run linter**

Run: `npm run lint`

Expected: No new errors. Fix any that appear.

- [ ] **Step 2: Run tests**

Run: `npm run test -- --testPathPattern="hero-designer"`

Expected: All tests pass.

- [ ] **Step 3: Run build**

Run: `npm run build`

Expected: Build succeeds. Fix any TypeScript errors.

- [ ] **Step 4: Final commit if fixes were needed**

```bash
git add -A
git commit -m "fix(hero-designer): lint and build fixes for responsive breakpoints"
```
