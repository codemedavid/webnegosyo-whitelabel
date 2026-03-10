# Hero Section Designer — Design Document

**Date**: 2026-03-07
**Status**: Approved
**Target**: Tenant menu page hero (`/[tenant]/menu/`)
**Access**: Tenant admins via `/[tenant]/admin/hero-designer`

## Summary

A visual drag-and-drop hero section designer for tenant admins, inspired by Elementor/Wix. Merchants design custom hero sections for their menu page using a 3-panel canvas editor with pre-built templates, element library, and per-breakpoint responsive editing.

## Architecture

**Approach**: Custom Canvas Engine using `@dnd-kit` (already installed) + absolute positioning on a constrained canvas. No heavy external builder frameworks.

**Why**: Lean bundle (~30KB added), secure JSON schema (no raw HTML injection), uses existing deps, integrates naturally with Shadcn UI admin design system.

## Data Model

Single JSON column `hero_design` on the `tenants` table.

```typescript
interface HeroDesign {
  version: 1
  canvas: {
    desktop: { width: 1440; height: number }
    mobile: { width: 390; height: number }
  }
  backgroundColor: string
  backgroundImage?: { url: string; opacity: number; objectFit: 'cover' | 'contain' }
  elements: HeroElement[]
}

interface HeroElement {
  id: string
  type: 'text' | 'image' | 'button' | 'shape' | 'divider' | 'icon' | 'video' | 'countdown' | 'social-proof' | 'animated-bg'
  label: string
  visible: boolean
  locked: boolean
  zIndex: number
  desktop: ElementLayout
  mobile: ElementLayout
  props: TextProps | ImageProps | ButtonProps | ShapeProps | DividerProps | IconProps | VideoProps | CountdownProps | SocialProofProps | AnimatedBgProps
  animation?: {
    type: 'fadeIn' | 'slideUp' | 'slideLeft' | 'scaleIn' | 'bounce' | 'none'
    duration: number
    delay: number
  }
}

interface ElementLayout {
  x: number        // % from left
  y: number        // % from top
  width: number    // % of canvas
  height: number   // % of canvas (or 'auto')
  rotation: number
  padding: { top: number; right: number; bottom: number; left: number }
  margin: { top: number; right: number; bottom: number; left: number }
}
```

All positions stored as percentages for natural scaling.

## UI Layout — 3-Panel Editor

```
┌──────────────────────────────────────────────────────────┐
│ Toolbar: [Undo] [Redo] [Desktop|Mobile] [Preview] [Save] │
├────────┬─────────────────────────────┬───────────────────┤
│ Left   │      Canvas Area            │  Right Panel      │
│ Panel  │  (scaled hero preview)      │  (Properties)     │
│        │                             │                   │
│ Elements│  Drag-and-drop canvas      │  Position/Size    │
│ - Text │  with selection handles     │  Typography       │
│ - Image│                             │  Colors           │
│ - Button│                            │  Animation        │
│ - Shape│                             │  Spacing          │
│ - etc. │                             │  Border/Shadow    │
│────────│                             │                   │
│ Layers │                             │                   │
│ (z-order, visibility, lock)          │                   │
└────────┴─────────────────────────────┴───────────────────┘
```

## Components

| Component | Purpose |
|---|---|
| `HeroDesigner` | Main page wrapper, state management, undo/redo |
| `DesignerToolbar` | Top bar — undo/redo, breakpoint toggle, preview, save |
| `ElementPanel` | Left sidebar — draggable element blocks |
| `LayersPanel` | Left sidebar bottom — z-order list, visibility/lock toggles |
| `DesignerCanvas` | Center — visual canvas with DnD context |
| `CanvasElement` | Individual element on canvas (draggable, resizable) |
| `PropertiesPanel` | Right sidebar — edit selected element props |
| `HeroRenderer` | Customer-facing — reads JSON, outputs styled HTML |

## Element Types

### Core
- **Text** — Headings, paragraphs. Rich text (bold/italic/underline), font family (system + Google Fonts subset), size, weight, line-height, letter-spacing, color, text-align, text-shadow
- **Image** — Cloudinary upload, object fit, border radius, opacity, alt text
- **Button/CTA** — Text, link URL, target, bg/text color, border, radius, padding, hover effect
- **Shape** — Rectangle/circle/rounded-rect, fill, border, opacity (decorative overlays)
- **Divider** — Horizontal/vertical, thickness, color, style, width %
- **Icon** — Lucide icon picker, size, color

### Extended
- **Video** — YouTube/Vimeo/direct URL, autoplay/muted/loop, poster image
- **Countdown Timer** — Target date, display format, styling
- **Social Proof Badge** — Preset types + custom text, icon, badge style
- **Animated Background** — Gradient, pattern overlay, parallax toggle

### Shared Properties (all elements)
Position, size, rotation, padding, margin, opacity, border, box shadow, entrance animation (type + delay + duration)

## Starter Templates (8)

1. Classic Centered — Centered heading + subtext + CTA, solid background
2. Split Layout — Image right, text+CTA left (50/50)
3. Full-Screen Image — Background image + dark overlay + white text
4. Minimal Text — Large bold heading, clean white background
5. Bold CTA — Gradient bg, big heading, prominent button, social proof
6. Video Hero — Background video, overlay text, CTA
7. Restaurant Showcase — Food image bg, restaurant name + tagline + order button
8. Promo Countdown — Countdown timer + promo text + CTA

Templates = pre-populated HeroDesign JSON objects.

## Canvas Interactions

- Drag to place from element panel
- Drag to move on canvas
- 8-handle resize (corners + midpoints)
- Snap-to-grid (optional, 8px)
- Multi-select (Shift+click)
- Keyboard: Delete, Ctrl+Z/Y, arrow nudge
- Zoom controls

## Responsive Editing

Dual canvas with toggle — switch between desktop (1440px) and mobile (390px) views. Each element has independent `desktop` and `mobile` layout properties.

## Undo/Redo

State history stack, push full design state on each change, capped at 50 steps.

## Customer-Side Rendering

`HeroRenderer` reads JSON → outputs semantic HTML with inline styles. Framer Motion for animated elements. SSR compatible. Switches desktop/mobile layout via viewport. CSS containment for performance.

## Save Flow

1. Validate design JSON with Zod schema
2. Server action updates `tenants.hero_design`
3. Revalidate tenant menu page cache
4. Toast confirmation

## Database Migration

Add `hero_design JSONB` column to `tenants` table (nullable, defaults to null — falls back to existing simple hero).
