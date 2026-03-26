# Hero Designer — Responsive Breakpoints & Per-Device Visibility

**Date:** 2026-03-26
**Status:** Approved

## Problem

The hero section designer has two breakpoints (desktop/mobile) but:
1. Editing sizes/props on mobile can bleed into desktop because there's no clear override/inheritance model surfaced in the UI
2. Element visibility (`visible` field) is global — no way to hide an element on mobile but show it on desktop
3. No tablet breakpoint — many merchants' customers browse on tablets
4. Properties panel lacks indicators showing which values are inherited vs overridden per breakpoint

## Solution

Add a **tablet** breakpoint and implement **per-breakpoint visibility** with a clear inheritance chain and UI indicators.

---

## 1. Data Model Changes

### 1.1 Type Changes (`src/types/hero-designer.ts`)

```typescript
export type Breakpoint = 'desktop' | 'tablet' | 'mobile'

export interface ElementVisibility {
  desktop: boolean
  tablet: boolean
  mobile: boolean
}

export interface HeroElement {
  id: string
  type: HeroElementType
  label: string
  visibility: ElementVisibility   // replaces `visible: boolean`
  locked: boolean
  zIndex: number
  desktop: ElementLayout
  tablet: ElementLayout           // NEW
  mobile: ElementLayout
  props: ElementProps             // base (desktop)
  tabletProps?: ElementProps      // NEW — overrides for tablet
  mobileProps?: ElementProps      // overrides for mobile
  animation: ElementAnimation
  parentId?: string | null
}

export interface CanvasConfig {
  desktop: { width: 1440; height: number }
  tablet: { width: 768; height: number }   // NEW
  mobile: { width: 390; height: number }
}
```

Remove the `visible: boolean` field entirely, replaced by `visibility`.

### 1.2 Inheritance Chain

**Layout:** Each breakpoint stores its own full `ElementLayout`. On creation, tablet copies from desktop, mobile copies from tablet.

**Props:** `getActiveProps(element, breakpoint)` resolves as:
- desktop → `element.props`
- tablet → `element.tabletProps ?? element.props`
- mobile → `element.mobileProps ?? element.tabletProps ?? element.props`

This three-level fallback lets merchants override only what they need.

### 1.3 Migration (`migrateDesign`)

Existing v2 designs need migration to v3:
- `element.visible` → `element.visibility = { desktop: visible, tablet: visible, mobile: visible }`
- `element.tablet` = clone of `element.desktop` (safe starting point)
- `canvas.tablet` = `{ width: 768, height: canvas.mobile.height }` (reasonable default)
- `design.version` bumps to `3`

---

## 2. Schema Changes (`src/lib/hero-designer-schemas.ts`)

- Add `elementVisibilitySchema` with three booleans
- Add `tabletProps` optional field to element schema
- Add `tablet` layout field to element schema
- Add `tablet` canvas config
- Update version to `1 | 2 | 3`

---

## 3. Defaults & Factories (`src/lib/hero-designer-defaults.ts`)

### 3.1 `createBlankDesign()`
- Canvas adds `tablet: { width: 768, height: 400 }`
- Version defaults to `3`

### 3.2 Element Factories
- All factories produce `tablet: ElementLayout` (clone of desktop default)
- All factories produce `visibility: { desktop: true, tablet: true, mobile: true }` instead of `visible: true`

### 3.3 `getActiveProps()`
Update to support three-level fallback:
```typescript
export function getActiveProps(element: HeroElement, breakpoint: Breakpoint): ElementProps {
  if (breakpoint === 'mobile') return element.mobileProps ?? element.tabletProps ?? element.props
  if (breakpoint === 'tablet') return element.tabletProps ?? element.props
  return element.props
}
```

### 3.4 `getActiveLayout()` — NEW helper
```typescript
export function getActiveLayout(element: HeroElement, breakpoint: Breakpoint): ElementLayout {
  return element[breakpoint]
}
```

### 3.5 Override detection helpers — NEW
```typescript
export function hasPropsOverride(element: HeroElement, breakpoint: Breakpoint): boolean {
  if (breakpoint === 'desktop') return false
  if (breakpoint === 'tablet') return !!element.tabletProps
  return !!element.mobileProps
}
```

---

## 4. State Management (`src/hooks/use-hero-designer.ts`)

### 4.1 Action Type Changes

- `UPDATE_ELEMENT_META` — the `meta` type must accept `visibility: Partial<ElementVisibility>` instead of `visible: boolean`
- `UPDATE_ELEMENT_PROPS` — already supports `breakpoint` param, extend to handle `'tablet'`
- `UPDATE_ELEMENT_LAYOUT` — already breakpoint-scoped, just works with `'tablet'`
- NEW action: `RESET_BREAKPOINT_PROPS` — clears `tabletProps` or `mobileProps` to revert to inherited values
- NEW action: `RESET_BREAKPOINT_LAYOUT` — copies layout from parent breakpoint (desktop→tablet, tablet→mobile)

### 4.2 Reducer Updates

`UPDATE_ELEMENT_PROPS`:
```
targetField:
  'desktop' → 'props'
  'tablet'  → 'tabletProps'
  'mobile'  → 'mobileProps'
```

`UPDATE_ELEMENT_META` — handle the new `visibility` field:
When toggling visibility for a specific breakpoint, merge into the existing visibility object.

`RESET_BREAKPOINT_PROPS`:
- For tablet: set `tabletProps = undefined`
- For mobile: set `mobileProps = undefined`

`RESET_BREAKPOINT_LAYOUT`:
- For tablet: copy `element.desktop` to `element.tablet`
- For mobile: copy `element.tablet` to `element.mobile`

### 4.3 `DUPLICATE_ELEMENT`
Clone the new `tablet` layout and `tabletProps` fields.

---

## 5. Designer Toolbar (`designer-toolbar.tsx`)

### 5.1 Three-Button Breakpoint Toggle
Replace the two-button Monitor/Smartphone toggle with three buttons:
- **Monitor** icon → desktop (1440px)
- **Tablet** icon → tablet (768px)
- **Smartphone** icon → mobile (390px)

Show the active breakpoint name + canvas width as a subtle label below the icons (e.g., "Desktop · 1440px").

---

## 6. Designer Canvas (`designer-canvas.tsx`)

### 6.1 Canvas Dimensions
Read canvas config for the active breakpoint: `design.canvas[breakpoint]`.

### 6.2 Visibility Filtering
Change filter from `el.visible` to `el.visibility[breakpoint]`:
```typescript
const sortedElements = [...design.elements]
  .filter((el) => el.visibility[breakpoint] && !el.parentId)
  .sort((a, b) => a.zIndex - b.zIndex)
```

Same for children in the `childrenByParent` map.

---

## 7. Canvas Element (`canvas-element.tsx`)

### 7.1 Visibility Check
Change `if (!element.visible) return null` to `if (!element.visibility[breakpoint]) return null`.

Add `breakpoint` to the component props (already present).

---

## 8. Layers Panel (`layers-panel.tsx`)

### 8.1 Per-Breakpoint Visibility Toggle
The eye icon toggles `visibility[activeBreakpoint]` not the global visibility.

Add the `activeBreakpoint` prop to `LayersPanel`.

Visual treatment:
- **Visible on current breakpoint:** normal eye icon
- **Hidden on current breakpoint:** crossed-out eye + row at 50% opacity + strikethrough label
- **Hidden on ALL breakpoints:** red crossed-out eye (distinguishes "hidden everywhere" from "hidden here only")

### 8.2 Visibility Indicator Dots
Add small colored dots next to the eye icon showing visibility across all three breakpoints:
- Three tiny dots (D/T/M) — filled = visible, empty = hidden on that breakpoint
- Only shown when visibility differs across breakpoints (to avoid clutter)

---

## 9. Properties Panel (`properties-panel.tsx`)

### 9.1 Breakpoint Indicator in Header
Update the element header to show:
```
[element label]
text · tablet (inherited from desktop)
```
or:
```
[element label]
text · tablet (overridden)
```

### 9.2 Section-Level Override Indicators
Each collapsible section (Position, Typography, Appearance, etc.) shows:
- **Blue dot** next to section title when that section has breakpoint-specific overrides
- **"Reset to [parent breakpoint]"** button in section header (only shown on tablet/mobile when overrides exist)

### 9.3 Visibility Toggle in Properties
Add a visibility section at the top of element properties:
```
Visibility
  ☑ Desktop  ☑ Tablet  ☐ Mobile
```
Three checkboxes, one per breakpoint. This is the explicit, discoverable way to control per-device visibility (the layers panel eye icon is the quick toggle).

---

## 10. Hero Renderer (`hero-renderer.tsx`)

### 10.1 Three-Breakpoint Rendering
Replace the two-div desktop/mobile approach with three:

```tsx
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
```

### 10.2 Visibility Filtering in CanvasView
Change `el.visible !== false` to `el.visibility?.[breakpoint] !== false` (with backward compat for old designs missing `visibility`).

---

## 11. Preview Modal (`preview-modal.tsx`)

Add tablet option to the device selector:
- Desktop: 1440px
- Tablet: 768px
- Mobile: 390px

---

## 12. Templates (`hero-designer-templates.ts`)

Update all templates to include:
- `tablet` layout per element
- `visibility` object per element
- `canvas.tablet` config
- `version: 3`

---

## 13. Server Actions / Database

No schema migration needed — the `hero_design` column is JSONB, so the new fields are added transparently. The `migrateDesign()` function handles upgrading old v2 designs to v3 at read time.

---

## Files Changed

| File | Change |
|------|--------|
| `src/types/hero-designer.ts` | Add Breakpoint, ElementVisibility, tablet fields |
| `src/lib/hero-designer-schemas.ts` | Add tablet/visibility schemas |
| `src/lib/hero-designer-defaults.ts` | Update factories, getActiveProps, migration |
| `src/lib/hero-designer-templates.ts` | Update all templates to v3 |
| `src/hooks/use-hero-designer.ts` | New actions, update reducer for tablet + visibility |
| `src/components/admin/hero-designer/designer-toolbar.tsx` | Three-button breakpoint toggle |
| `src/components/admin/hero-designer/designer-canvas.tsx` | Visibility filtering per breakpoint |
| `src/components/admin/hero-designer/canvas-element.tsx` | Per-breakpoint visibility check |
| `src/components/admin/hero-designer/layers-panel.tsx` | Per-breakpoint eye toggle, indicator dots |
| `src/components/admin/hero-designer/properties-panel.tsx` | Override indicators, visibility checkboxes, reset buttons |
| `src/components/admin/hero-designer/property-sections/position-section.tsx` | No change (already breakpoint-scoped via parent) |
| `src/components/admin/hero-designer/preview-modal.tsx` | Add tablet device option |
| `src/components/customer/hero-renderer.tsx` | Three-breakpoint rendering, visibility filtering |
| `src/components/admin/hero-designer/hero-designer.tsx` | Wire new actions/props |

---

## Out of Scope

- Making the admin designer UI itself responsive (it's a desktop-only tool)
- Adding more breakpoints beyond these three
- Per-breakpoint animation settings (could be a follow-up)
