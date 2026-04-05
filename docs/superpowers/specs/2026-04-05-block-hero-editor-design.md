# Block-Based Hero Section Editor — Design Spec

## Overview

Replace the current absolute-positioning hero designer with an Elementor-style block-based editor. The new system uses a Section > Column > Widget hierarchy where everything flows naturally (no x/y coordinates). Each level has dedicated alignment controls. Scoped to the hero section only.

## Decision Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Approach | Full Elementor-style rewrite | Clean architecture, no hybrid complexity |
| Scope | Hero section only | Focused delivery, menu page unchanged |
| Widget types | All existing (10+) | Carry over text, image, button, video, divider, spacer, icon, countdown, social-proof, animated-bg, shape |
| Alignment granularity | Section + Column + Widget controls | Matches Elementor model |
| Migration | Clean break | No auto-migration of v3 designs; tenants start fresh |

## Data Model

### HeroBlockDesign (v4)

```typescript
interface HeroBlockDesign {
  version: 4
  sections: BlockSection[]
  globalStyles: {
    backgroundColor: string
    backgroundImage?: { url: string; opacity: number; objectFit: 'cover' | 'contain' | 'fill' }
    maxWidth?: number // px, for 'boxed' sections
  }
}
```

### BlockSection

```typescript
interface BlockSection {
  id: string
  label: string
  columns: BlockColumn[]
  settings: SectionSettings
  responsiveOverrides?: {
    tablet?: Partial<SectionSettings>
    mobile?: Partial<SectionSettings>
  }
}

interface SectionSettings {
  contentWidth: 'full' | 'boxed'
  horizontalAlign: 'left' | 'center' | 'right'
  minHeight: number // px, 0 = auto
  background: {
    type: 'none' | 'color' | 'image' | 'gradient' | 'video'
    color?: string
    image?: { url: string; opacity: number; objectFit: 'cover' | 'contain' | 'fill' }
    gradient?: string // CSS gradient string
    video?: { url: string; opacity: number }
  }
  padding: SpacingValue
  margin: { top: number; bottom: number }
}

interface SpacingValue {
  top: number
  right: number
  bottom: number
  left: number
}
```

### BlockColumn

```typescript
interface BlockColumn {
  id: string
  width: number // percentage, columns in a section sum to 100
  widgets: BlockWidget[]
  settings: ColumnSettings
  responsiveOverrides?: {
    tablet?: Partial<ColumnSettings>
    mobile?: Partial<ColumnSettings>
  }
}

interface ColumnSettings {
  verticalAlign: 'top' | 'middle' | 'bottom'
  horizontalAlign: 'left' | 'center' | 'right'
  padding: SpacingValue
  background?: {
    type: 'none' | 'color'
    color?: string
  }
  borderRadius?: number
}
```

### BlockWidget

```typescript
type BlockWidgetType =
  | 'text'
  | 'image'
  | 'button'
  | 'video'
  | 'divider'
  | 'spacer'
  | 'icon'
  | 'countdown'
  | 'social-proof'
  | 'animated-bg'
  | 'shape'

interface BlockWidget {
  id: string
  type: BlockWidgetType
  label: string
  alignment: 'left' | 'center' | 'right' | 'stretch'
  width: 'auto' | 'full' | number // number = percentage
  margin: { top: number; bottom: number }
  padding: SpacingValue
  props: WidgetProps // Discriminated union on 'kind' field — same pattern as current ElementProps
  animation: ElementAnimation // Reuse existing animation type
  visibility: { desktop: boolean; tablet: boolean; mobile: boolean }
  responsiveOverrides?: {
    tablet?: Partial<WidgetOverrides>
    mobile?: Partial<WidgetOverrides>
  }
}

// What can be overridden per breakpoint at widget level
interface WidgetOverrides {
  alignment: BlockWidget['alignment']
  width: BlockWidget['width']
  margin: BlockWidget['margin']
  padding: BlockWidget['padding']
  props: Partial<WidgetProps>
}
```

### Widget Props

Reuse the same discriminated union pattern from the existing `ElementProps` type. Each widget type has its own props interface:

- **TextProps**: `kind: 'text'`, text, fontSize, fontWeight, fontFamily, color, lineHeight, textAlign, letterSpacing, textShadow
- **ImageProps**: `kind: 'image'`, src, alt, objectFit, borderRadius
- **ButtonProps**: `kind: 'button'`, text, fontSize, fontWeight, color, backgroundColor, borderRadius, paddingX, paddingY, link, variant
- **VideoProps**: `kind: 'video'`, src, autoplay, muted, loop, controls
- **DividerProps**: `kind: 'divider'`, color, thickness, style (solid/dashed/dotted), width (%)
- **SpacerProps**: `kind: 'spacer'`, height (px)
- **IconProps**: `kind: 'icon'`, name, size, color
- **CountdownProps**: `kind: 'countdown'`, targetDate, style, colors
- **SocialProofProps**: `kind: 'social-proof'`, type, rating, reviewCount, text
- **AnimatedBgProps**: `kind: 'animated-bg'`, pattern, colors, speed
- **ShapeProps**: `kind: 'shape'`, shape, color, borderRadius, borderColor, borderWidth

## Editor UI

### Layout

Three-panel layout matching the current designer's general structure:

```
+----------------------------------------------------------+
|  Toolbar: Breakpoint | Undo/Redo | Save | Preview | Tmpl |
+----------+----------------------------+------------------+
|          |                            |                  |
| Left     |    Center: Block Canvas    |  Right: Settings |
| 280px    |    (live preview)          |  288px           |
|          |                            |                  |
| - Add    |  [+ Add Section]           |  (depends on     |
|   Widget |  ┌──────────────────┐      |   selection)     |
| - Add    |  │ Section 1        │      |                  |
|   Section|  │ ┌──────┬───────┐ │      |  - Global        |
| - Layers |  │ │Col 1 │Col 2  │ │      |  - Section       |
|          |  │ │[Text] │[Image]│ │      |  - Column        |
|          |  │ │[Btn]  │       │ │      |  - Widget        |
|          |  │ └──────┴───────┘ │      |                  |
|          |  └──────────────────┘      |                  |
|          |  [+ Add Section]           |                  |
+----------+----------------------------+------------------+
```

### Left Panel

Three tabs:

1. **Widgets tab**: Grid of widget type icons/labels. Click to add into the currently selected column (or first column of last section if nothing selected). Drag onto a specific column in the canvas.

2. **Sections tab**: Preset column layout buttons:
   - 1 column (100%)
   - 2 columns (50/50)
   - 2 columns (70/30)
   - 2 columns (30/70)
   - 3 columns (33/33/33)
   - 4 columns (25/25/25/25)
   - 3 columns (25/50/25)
   Click to append a new section with that layout. Inserts at the bottom (or after selected section).

3. **Layers tab**: Tree view showing hierarchy:
   ```
   > Section 1
     > Column 1 (50%)
       - Heading Text
       - Button
     > Column 2 (50%)
       - Image
   > Section 2
     ...
   ```
   - Click to select
   - Drag to reorder within same level (sections among sections, widgets within a column)
   - Right-click or "..." menu: Duplicate, Delete, Move Up/Down

### Center: Block Canvas

A live-rendered preview of the hero, not a fixed-size canvas:

- **Width**: Matches the selected breakpoint (1440px desktop, 768px tablet, 390px mobile) — scaled to fit available space
- **Sections stack vertically**, rendered with their actual backgrounds, padding, and content
- **Hover**: Blue dashed outline around the hovered block (section/column/widget) with a small label tag
- **Click**: Selects the block. Blue solid border + floating action bar (duplicate, delete, drag handle)
- **"+" insertion points**:
  - Between sections: horizontal line with centered "+" circle button
  - Inside empty columns: centered "+" button with "Add Widget" label
  - Between widgets within a column: small "+" line between them on hover
- **Drag reorder**: Drag handle on sections to reorder. Drag widgets between columns.
- **Click empty canvas area**: Deselects everything, shows global settings in right panel

### Right Panel: Settings

Dynamically renders based on selection:

**Nothing selected — Global Settings:**
- Background color/image (for the overall hero container)
- Max width for boxed sections

**Section selected — Section Settings:**
- Column layout switcher (visual grid showing column splits, click to change)
- Column width sliders (linked, must sum to 100%)
- Content width: Full / Boxed toggle
- Horizontal alignment: Left / Center / Right
- Min height (px input, 0 = auto)
- Background: None / Color / Image / Gradient / Video (tab selector)
- Padding: 4-value input (top/right/bottom/left) with link toggle for uniform
- Margin: Top / Bottom inputs
- Responsive overrides section (collapsed by default, per breakpoint)

**Column selected — Column Settings:**
- Width percentage (shown as part of section total)
- Vertical align: Top / Middle / Bottom (icon buttons)
- Horizontal align: Left / Center / Right (icon buttons)
- Padding: 4-value input
- Background color (optional)
- Border radius

**Widget selected — Widget Settings:**
- Alignment: Left / Center / Right / Stretch (icon buttons)
- Width: Auto / Full / Custom % (radio + input)
- Margin: Top / Bottom
- Padding: 4-value input
- **Widget-specific props** (reuse existing property sections):
  - Typography section (for text/button)
  - Appearance section
  - Element-specific section (image settings, video settings, etc.)
- Animation section
- Visibility per breakpoint (checkboxes)
- Responsive overrides (collapsed section)

### Toolbar

Same position as current, with:
- Back link to admin
- Breakpoint switcher: Desktop / Tablet / Mobile (icon buttons with labels)
- Undo / Redo buttons with keyboard shortcuts (Ctrl+Z / Ctrl+Y)
- Save button (primary, shows spinner when saving)
- Reset button (with confirmation dialog)
- Preview button (opens modal showing customer-facing render)
- Template picker button (opens template selection modal)
- Hero section enabled/disabled toggle

## Block Canvas Interaction Details

### Selection Model

- Click a widget: selects the widget, right panel shows widget settings
- Click a column (the empty space in a column, or the column border): selects the column, right panel shows column settings
- Click a section (the section border/header area): selects the section, right panel shows section settings
- Click outside all sections: deselects, shows global settings
- Escape key: moves selection up one level (widget → column → section → deselect)

### Keyboard Shortcuts

- **Delete/Backspace**: Remove selected block (with confirmation for sections)
- **Ctrl+Z / Ctrl+Y**: Undo / Redo
- **Ctrl+D**: Duplicate selected block
- **Escape**: Deselect / move up selection level
- **Arrow Up/Down**: Navigate between siblings (next/previous widget or section)

### Drag and Drop

- **Sections**: Drag handle at top-left of section. Reorder among sections only.
- **Widgets**: Drag handle on widget. Can move within same column (reorder) or to a different column (re-parent).
- **Columns**: Not directly draggable. Reorder by changing column layout in section settings.
- **From left panel**: Drag widget type from panel onto a column in the canvas to add.

### Responsive Behavior

- Breakpoint switcher changes the canvas preview width
- Each level (section, column, widget) can have `responsiveOverrides` for tablet and mobile
- Overrides are indicated by a blue dot in the settings panel (same as current system)
- "Reset to desktop" button to clear breakpoint overrides
- Columns can have different widths per breakpoint (e.g., 50/50 on desktop, 100/100 stacked on mobile)
- When mobile breakpoint is active and columns would be too narrow, they auto-stack vertically by default (overridable)

## Production Renderer: BlockHeroRenderer

New component that renders the v4 block design for customers:

- Sections render as `<section>` HTML elements, stacked vertically
- Columns render as CSS flexbox children within sections
- Widgets render as flow content within columns
- Responsive: Uses CSS media queries for breakpoint-specific overrides
- Animations: Framer Motion (same animation types as current system)
- Visibility: Elements hidden per breakpoint via CSS display:none
- Performance: CSS containment (`contain: layout style paint`) on sections
- Accessible: Semantic HTML, proper heading hierarchy, alt text on images

## Templates

Rebuild the 8 existing starter templates in the new block format:

1. **Classic Centered** — 1 section, 1 column, centered text + button stack
2. **Split Layout** — 1 section, 2 columns (50/50): text left, image right
3. **Full-Screen Image** — 1 section with background image, 1 column, overlaid text
4. **Minimal Text** — 1 section, 1 column, single large heading centered
5. **Bold CTA** — 1 section with gradient background, 1 column, heading + subtext + button
6. **Video Hero** — 1 section with video background, 1 column, overlaid content
7. **Restaurant Showcase** — 1 section, 2 columns: image + text/button stack
8. **Promo Countdown** — 1 section, 1 column, heading + countdown widget + button

Each template includes responsive overrides for tablet and mobile.

## Validation (Zod)

New schema file `hero-block-schemas.ts`:

- Same CSS injection guards as current (reject `<`, `>`, `"`, `'`, `;`, `{`, `}`)
- Max 10 sections per hero
- Max 6 columns per section
- Max 20 widgets per column
- Max 100 total widgets across all sections
- Column widths must sum to 100 (with +-1 tolerance for rounding)
- All numeric ranges validated (font sizes, spacing values, etc.)
- URL validation for images/videos

## State Management

New hook `use-hero-block-designer.ts` using `useReducer`:

**Actions:**
- Section CRUD: `ADD_SECTION`, `REMOVE_SECTION`, `DUPLICATE_SECTION`, `REORDER_SECTIONS`, `UPDATE_SECTION_SETTINGS`
- Column: `UPDATE_COLUMN_SETTINGS`, `SET_COLUMN_LAYOUT` (changes column count/widths for a section)
- Widget CRUD: `ADD_WIDGET`, `REMOVE_WIDGET`, `DUPLICATE_WIDGET`, `REORDER_WIDGETS`, `MOVE_WIDGET` (between columns)
- Widget props: `UPDATE_WIDGET_PROPS`, `UPDATE_WIDGET_SETTINGS`, `UPDATE_WIDGET_ANIMATION`
- Global: `UPDATE_GLOBAL_STYLES`
- Canvas: `SET_BREAKPOINT`
- Selection: `SELECT_BLOCK` (section/column/widget/null)
- History: `UNDO`, `REDO` (50 action limit)
- Design: `SET_DESIGN` (template loading / reset)

Cascade deletes: removing a section deletes its columns and widgets. Removing a column moves its widgets to adjacent column or deletes if last column.

## Server Actions

Reuse existing server actions with minimal changes:

- `saveHeroDesignAction` — Already accepts `HeroDesign | null`. The v4 `HeroBlockDesign` will be stored in the same `hero_design` JSON column. The action validates against the new schema when `version === 4`.
- `getHeroDesignAction` — Returns raw JSON. Client checks version to decide which editor/renderer to use.
- `updateHeroSectionEnabledAction` — No changes needed.

## File Structure

```
src/
├── types/
│   └── hero-block-designer.ts              # New type definitions (HeroBlockDesign, BlockSection, etc.)
├── lib/
│   ├── hero-block-defaults.ts              # Factory functions, column presets, default widget props
│   ├── hero-block-schemas.ts               # Zod validation for v4
│   └── hero-block-templates.ts             # 8 starter templates in block format
├── hooks/
│   └── use-hero-block-designer.ts          # useReducer state management
├── components/
│   ├── admin/hero-block-designer/
│   │   ├── hero-block-designer.tsx          # Main editor shell (3-panel layout)
│   │   ├── block-toolbar.tsx               # Top toolbar
│   │   ├── add-panel.tsx                   # Left: widget grid + section presets
│   │   ├── layers-panel.tsx                # Left: hierarchy tree view
│   │   ├── block-canvas.tsx                # Center: live preview editor
│   │   ├── block-canvas-section.tsx        # Section rendering in canvas
│   │   ├── block-canvas-column.tsx         # Column rendering in canvas
│   │   ├── block-canvas-widget.tsx         # Widget rendering in canvas
│   │   ├── insertion-point.tsx             # "+" buttons between blocks
│   │   ├── settings-panel.tsx              # Right: dynamic settings router
│   │   ├── global-settings.tsx             # Right: global hero settings
│   │   ├── section-settings.tsx            # Right: section-level controls
│   │   ├── column-settings.tsx             # Right: column-level controls
│   │   ├── widget-settings.tsx             # Right: widget-level controls
│   │   ├── column-layout-picker.tsx        # Visual column layout selector
│   │   ├── spacing-input.tsx               # Reusable 4-value padding/margin input
│   │   ├── alignment-buttons.tsx           # Reusable alignment icon button group
│   │   ├── template-picker.tsx             # Template selection modal (new templates)
│   │   └── preview-modal.tsx               # Live preview modal
│   └── customer/
│       └── block-hero-renderer.tsx          # Production renderer for v4 designs
└── app/[tenant]/
    └── admin/hero-designer/
        ├── page.tsx                         # Route to new block designer
        └── hero-designer-wrapper.tsx        # SSR wrapper (fetch tenant, pass to editor)
```

## Integration Points

- **Menu page** (`menu-client.tsx`): Check `hero_design.version`. If v4, render `BlockHeroRenderer`. Otherwise render nothing (clean break — old designs are treated as blank).
- **Admin page** (`admin/hero-designer/page.tsx`): Always loads the new block editor. If existing design is v3 or earlier, editor opens with a blank state.
- **Existing hero designer files**: Left in codebase but no longer routed to. Can be removed in a follow-up cleanup.

## Out of Scope

- Full page builder (hero only)
- Custom CSS per block (Elementor "Advanced" tab)
- Global color palette / design tokens
- Undo history persistence across sessions
- Collaborative editing
- Block copy/paste between sections
