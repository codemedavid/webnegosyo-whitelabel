# Search Bar Branding & Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the customer menu search bar dedicated branding fields plus a show/hide toggle, edited inline via a pencil icon that opens the existing branding-editor overlay.

**Architecture:** Add 9 nullable columns to `tenants`, surface them through `BrandingColors.searchBar`, render them in `<SearchBar>` with sensible fallbacks, gate visibility on the `enabled` flag, add a pencil button (admin-only) on the search bar that opens a new `'search_bar'` section in `branding-editor-overlay.tsx`.

**Tech Stack:** Supabase migrations, Next.js 15 App Router, Zod validation, React, Tailwind CSS, Jest + RTL.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/<NN>_search_bar_branding.sql` | Create | Add 9 columns to `tenants` |
| `src/types/database.ts` | Modify | Add fields to `Tenant` type |
| `src/lib/branding-utils.ts` | Modify | Extend `BrandingColors`, `DEFAULT_BRANDING`, `getTenantBranding` |
| `src/lib/product-detail-data.ts` | Modify | Add new fields to partial SELECT + `SelectedTenant` |
| `src/app/actions/branding.ts` | Modify | Extend Zod schema with new fields |
| `src/components/customer/search-bar.tsx` | Modify | Apply new branding, render admin pencil, support radius/style |
| `src/components/customer/layouts/layout-default.tsx` | Modify | Pass admin props, gate render on `enabled` |
| `src/components/customer/layouts/layout-sidebar.tsx` | Modify | Same |
| `src/components/customer/layouts/layout-grid-focus.tsx` | Modify | Same |
| `src/components/customer/layouts/layout-mosaic.tsx` | Modify | Same |
| `src/components/customer/layouts/layout-magazine.tsx` | Modify | Same |
| `src/components/customer/layouts/layout-list.tsx` | Modify | Same |
| `src/components/admin/branding-editor-overlay.tsx` | Modify | Add `'search_bar'` section type + render block |
| `tests/unit/components/customer/search-bar.test.tsx` | Create | Unit tests |

---

## Task 1: Database migration

**Files:**
- Create: `supabase/migrations/<NN>_search_bar_branding.sql` (use next available numeric prefix from `supabase/migrations/`)

- [ ] **Step 1: Find next migration number**

Run: `ls supabase/migrations/ | tail -5`
Use the next sequential number (e.g., if last is `028_*.sql`, create `029_search_bar_branding.sql`).

- [ ] **Step 2: Write migration**

```sql
-- supabase/migrations/<NN>_search_bar_branding.sql
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS search_bar_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS search_bar_background text,
  ADD COLUMN IF NOT EXISTS search_bar_text text,
  ADD COLUMN IF NOT EXISTS search_bar_placeholder text,
  ADD COLUMN IF NOT EXISTS search_bar_icon text,
  ADD COLUMN IF NOT EXISTS search_bar_border text,
  ADD COLUMN IF NOT EXISTS search_bar_focus_ring text,
  ADD COLUMN IF NOT EXISTS search_bar_radius text NOT NULL DEFAULT 'pill'
    CHECK (search_bar_radius IN ('pill', 'rounded', 'square')),
  ADD COLUMN IF NOT EXISTS search_bar_style text NOT NULL DEFAULT 'filled'
    CHECK (search_bar_style IN ('filled', 'outline', 'ghost'));

COMMENT ON COLUMN tenants.search_bar_enabled IS 'Toggle visibility of menu search bar';
COMMENT ON COLUMN tenants.search_bar_radius IS 'pill | rounded | square';
COMMENT ON COLUMN tenants.search_bar_style IS 'filled | outline | ghost';
```

- [ ] **Step 3: Apply migration locally**

Run: `npx supabase db push` (or whatever the project's standard local migration command is — check `package.json` scripts).
Expected: Migration applied without error.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/<NN>_search_bar_branding.sql
git commit -m "feat(db): add search bar branding columns to tenants"
```

---

## Task 2: Update database types

**Files:**
- Modify: `src/types/database.ts` — add fields to Tenant type definitions

- [ ] **Step 1: Find Tenant table definition**

Run: `grep -n "tenants:" src/types/database.ts | head -3`

- [ ] **Step 2: Add fields to `Row`, `Insert`, `Update` shapes**

In the `tenants` table block, add these alongside existing branding fields:

```ts
search_bar_enabled: boolean
search_bar_background: string | null
search_bar_text: string | null
search_bar_placeholder: string | null
search_bar_icon: string | null
search_bar_border: string | null
search_bar_focus_ring: string | null
search_bar_radius: 'pill' | 'rounded' | 'square'
search_bar_style: 'filled' | 'outline' | 'ghost'
```

For `Insert` and `Update` shapes, make `search_bar_enabled`, `search_bar_radius`, `search_bar_style` optional (`?:`) since they have defaults; nullable color fields should be `string | null`.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep -i 'search_bar' | head`
Expected: No errors mentioning the new fields.

- [ ] **Step 4: Commit**

```bash
git add src/types/database.ts
git commit -m "feat(types): add search bar fields to Tenant type"
```

---

## Task 3: Extend branding-utils

**Files:**
- Modify: `src/lib/branding-utils.ts`

- [ ] **Step 1: Add `searchBar` to `BrandingColors` interface**

Add at the bottom of the interface (after `accent?`):

```ts
  // Search bar
  searchBar: {
    enabled: boolean
    background: string | null
    text: string | null
    placeholder: string | null
    icon: string | null
    border: string | null
    focusRing: string | null
    radius: 'pill' | 'rounded' | 'square'
    style: 'filled' | 'outline' | 'ghost'
  }
```

- [ ] **Step 2: Add `searchBar` to `DEFAULT_BRANDING`**

In the `DEFAULT_BRANDING` object (after `accent: '#ffd700'`):

```ts
  searchBar: {
    enabled: true,
    background: null,
    text: null,
    placeholder: null,
    icon: null,
    border: null,
    focusRing: null,
    radius: 'pill',
    style: 'filled',
  },
```

- [ ] **Step 3: Read fields in `getTenantBranding`**

In the returned object, after the `accent` line, add:

```ts
    searchBar: {
      enabled: tenant['search_bar_enabled'] !== false,
      background: typeof tenant['search_bar_background'] === 'string' && tenant['search_bar_background'] ? tenant['search_bar_background'] : null,
      text: typeof tenant['search_bar_text'] === 'string' && tenant['search_bar_text'] ? tenant['search_bar_text'] : null,
      placeholder: typeof tenant['search_bar_placeholder'] === 'string' && tenant['search_bar_placeholder'] ? tenant['search_bar_placeholder'] : null,
      icon: typeof tenant['search_bar_icon'] === 'string' && tenant['search_bar_icon'] ? tenant['search_bar_icon'] : null,
      border: typeof tenant['search_bar_border'] === 'string' && tenant['search_bar_border'] ? tenant['search_bar_border'] : null,
      focusRing: typeof tenant['search_bar_focus_ring'] === 'string' && tenant['search_bar_focus_ring'] ? tenant['search_bar_focus_ring'] : null,
      radius: (['pill','rounded','square'].includes(tenant['search_bar_radius'] as string) ? tenant['search_bar_radius'] : 'pill') as 'pill' | 'rounded' | 'square',
      style: (['filled','outline','ghost'].includes(tenant['search_bar_style'] as string) ? tenant['search_bar_style'] : 'filled') as 'filled' | 'outline' | 'ghost',
    },
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -i branding-utils | head`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/branding-utils.ts
git commit -m "feat(branding): extend BrandingColors with searchBar config"
```

---

## Task 4: Update product-detail-data partial SELECT

**Files:**
- Modify: `src/lib/product-detail-data.ts`

- [ ] **Step 1: Locate `getCachedTenantBySlug` SELECT and `SelectedTenant` interface**

Run: `grep -n "search_bar\|SelectedTenant\|getCachedTenantBySlug" src/lib/product-detail-data.ts`

- [ ] **Step 2: Add the 9 new columns to the SELECT string**

Insert into the comma-separated SELECT list (alongside other branding columns):

```
search_bar_enabled, search_bar_background, search_bar_text, search_bar_placeholder, search_bar_icon, search_bar_border, search_bar_focus_ring, search_bar_radius, search_bar_style
```

- [ ] **Step 3: Add the same fields to `SelectedTenant` interface**

```ts
  search_bar_enabled: boolean
  search_bar_background: string | null
  search_bar_text: string | null
  search_bar_placeholder: string | null
  search_bar_icon: string | null
  search_bar_border: string | null
  search_bar_focus_ring: string | null
  search_bar_radius: 'pill' | 'rounded' | 'square'
  search_bar_style: 'filled' | 'outline' | 'ghost'
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep product-detail-data | head`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/product-detail-data.ts
git commit -m "feat(branding): include search bar fields in cached tenant SELECT"
```

---

## Task 5: Extend Zod schema in branding action

**Files:**
- Modify: `src/app/actions/branding.ts`

- [ ] **Step 1: Add fields to `brandingSchema`**

Insert into the schema (next to other color fields):

```ts
    // Search bar
    search_bar_enabled: z.boolean().optional(),
    search_bar_background: cssColorString().optional().or(z.literal('')),
    search_bar_text: cssColorString().optional().or(z.literal('')),
    search_bar_placeholder: cssColorString().optional().or(z.literal('')),
    search_bar_icon: cssColorString().optional().or(z.literal('')),
    search_bar_border: cssColorString().optional().or(z.literal('')),
    search_bar_focus_ring: cssColorString().optional().or(z.literal('')),
    search_bar_radius: z.enum(['pill', 'rounded', 'square']).optional(),
    search_bar_style: z.enum(['filled', 'outline', 'ghost']).optional(),
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep 'actions/branding' | head`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/actions/branding.ts
git commit -m "feat(branding): allow search bar fields through saveBrandingAction"
```

---

## Task 6: Write failing tests for SearchBar

**Files:**
- Create: `tests/unit/components/customer/search-bar.test.tsx`

- [ ] **Step 1: Write the test file**

```tsx
// tests/unit/components/customer/search-bar.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { SearchBar } from '@/components/customer/search-bar'
import { DEFAULT_BRANDING, type BrandingColors } from '@/lib/branding-utils'

function makeBranding(overrides: Partial<BrandingColors['searchBar']> = {}): BrandingColors {
  return {
    ...DEFAULT_BRANDING,
    searchBar: { ...DEFAULT_BRANDING.searchBar, ...overrides },
  }
}

describe('SearchBar', () => {
  it('renders the input with the placeholder', () => {
    render(<SearchBar value="" onChange={() => {}} branding={makeBranding()} />)
    expect(screen.getByPlaceholderText('Search menu...')).toBeInTheDocument()
  })

  it('calls onChange when typing', () => {
    const onChange = jest.fn()
    render(<SearchBar value="" onChange={onChange} branding={makeBranding()} />)
    fireEvent.change(screen.getByPlaceholderText('Search menu...'), { target: { value: 'pizza' } })
    expect(onChange).toHaveBeenCalledWith('pizza')
  })

  it('applies pill radius by default', () => {
    render(<SearchBar value="" onChange={() => {}} branding={makeBranding()} />)
    expect(screen.getByPlaceholderText('Search menu...').className).toMatch(/rounded-full/)
  })

  it('applies square radius when configured', () => {
    render(<SearchBar value="" onChange={() => {}} branding={makeBranding({ radius: 'square' })} />)
    expect(screen.getByPlaceholderText('Search menu...').className).toMatch(/rounded-none/)
  })

  it('applies rounded radius when configured', () => {
    render(<SearchBar value="" onChange={() => {}} branding={makeBranding({ radius: 'rounded' })} />)
    expect(screen.getByPlaceholderText('Search menu...').className).toMatch(/rounded-lg/)
  })

  it('shows admin pencil button when isBrandAdmin and onEditBrandingSection are passed', () => {
    const onEdit = jest.fn()
    render(
      <SearchBar
        value=""
        onChange={() => {}}
        branding={makeBranding()}
        isBrandAdmin
        onEditBrandingSection={onEdit}
      />
    )
    const pencil = screen.getByRole('button', { name: /edit search bar/i })
    fireEvent.click(pencil)
    expect(onEdit).toHaveBeenCalled()
  })

  it('does not show pencil when not admin', () => {
    render(<SearchBar value="" onChange={() => {}} branding={makeBranding()} />)
    expect(screen.queryByRole('button', { name: /edit search bar/i })).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to confirm failure**

Run: `npm run test -- --testPathPattern="search-bar"`
Expected: Failing tests for radius classes and admin pencil (existing component does not support those features yet).

- [ ] **Step 3: Commit failing tests**

```bash
git add tests/unit/components/customer/search-bar.test.tsx
git commit -m "test(search-bar): add tests for radius variants and admin pencil"
```

---

## Task 7: Implement SearchBar enhancements

**Files:**
- Modify: `src/components/customer/search-bar.tsx`

- [ ] **Step 1: Replace component with new implementation**

Rewrite the entire file:

```tsx
'use client'

import { memo, useMemo, useCallback } from 'react'
import { Search, X, Pencil } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { BrandingColors } from '@/lib/branding-utils'
import { setAlpha } from '@/lib/branding-utils'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  branding?: BrandingColors
  isBrandAdmin?: boolean
  onEditBrandingSection?: () => void
}

const RADIUS_CLASS: Record<'pill' | 'rounded' | 'square', string> = {
  pill: 'rounded-full',
  rounded: 'rounded-lg',
  square: 'rounded-none',
}

export const SearchBar = memo(function SearchBar({
  value,
  onChange,
  placeholder = 'Search menu...',
  branding,
  isBrandAdmin = false,
  onEditBrandingSection,
}: SearchBarProps) {
  const cfg = branding?.searchBar

  const resolved = useMemo(() => {
    if (!branding) return null
    const fallbackBg = setAlpha(branding.cards, 0.8)
    const ring = cfg?.focusRing || setAlpha(branding.primary, 0.2)
    const borderColor = cfg?.border || branding.border
    const isOutline = cfg?.style === 'outline'
    const isGhost = cfg?.style === 'ghost'
    return {
      bg: isOutline ? 'transparent' : (cfg?.background || fallbackBg),
      text: cfg?.text || branding.textPrimary,
      placeholder: cfg?.placeholder || branding.textMuted,
      icon: cfg?.icon || branding.textMuted,
      border: isGhost ? 'transparent' : borderColor,
      ring,
      radius: RADIUS_CLASS[cfg?.radius || 'pill'],
    }
  }, [branding, cfg])

  const handleFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    if (resolved) e.currentTarget.style.borderColor = setAlpha(branding!.primary, 0.6)
  }, [resolved, branding])

  const handleBlur = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    if (resolved) e.currentTarget.style.borderColor = resolved.border
  }, [resolved])

  const adminPencil = isBrandAdmin && onEditBrandingSection ? (
    <button
      type="button"
      onClick={onEditBrandingSection}
      title="Edit search bar"
      aria-label="Edit search bar"
      className="absolute -right-1 -top-1 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-white/95 text-gray-600 shadow-sm transition-colors hover:bg-white hover:text-gray-900"
    >
      <Pencil className="h-3.5 w-3.5" />
    </button>
  ) : null

  if (branding && resolved) {
    return (
      <div className="relative">
        {adminPencil}
        <Search
          className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2"
          style={{ color: resolved.icon }}
        />
        <Input
          type="search"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`pl-12 pr-12 h-12 ${resolved.radius} backdrop-blur-sm border focus:ring-2 focus:outline-none branded-search-input`}
          style={{
            borderColor: resolved.border,
            backgroundColor: resolved.bg,
            color: resolved.text,
            // @ts-expect-error -- CSS custom properties for theming via inline style
            '--tw-ring-color': resolved.ring,
            '--branded-placeholder-color': resolved.placeholder,
          }}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
        {value && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full"
            style={{ color: resolved.icon }}
            onClick={() => onChange('')}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="relative">
      {adminPencil}
      <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
      <Input
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pl-12 pr-12 h-12 rounded-full border-gray-200 bg-white/80 backdrop-blur-sm focus:border-orange-300 focus:ring-orange-200"
      />
      {value && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-2 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full hover:bg-gray-100"
          onClick={() => onChange('')}
        >
          <X className="h-4 w-4 text-gray-400" />
        </Button>
      )}
    </div>
  )
})
```

- [ ] **Step 2: Run tests to confirm pass**

Run: `npm run test -- --testPathPattern="search-bar"`
Expected: All tests pass.

- [ ] **Step 3: Lint**

Run: `npm run lint -- src/components/customer/search-bar.tsx`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/customer/search-bar.tsx
git commit -m "feat(search-bar): support radius, style variants and admin pencil"
```

---

## Task 8: Wire up all 6 layouts

**Files:** All 6 files share the same change pattern. For each file, locate the `<SearchBar ... />` usage and:
1. Wrap the surrounding `<div>` (or render block) in a guard: `{(branding.searchBar.enabled || isBrandAdmin) && (...)}`.
2. Pass `isBrandAdmin={isBrandAdmin}` and `onEditBrandingSection={() => onOpenBrandingSection?.('search_bar')}` to `<SearchBar>`.

The component already receives `branding`, `isBrandAdmin`, and `onOpenBrandingSection` props (verified in `layout-default.tsx:50,74,196-197`).

- [ ] **Step 1: Modify `layout-default.tsx` (line ~170-179)**

Replace the existing block:

```tsx
{!isLoading && (branding.searchBar.enabled || isBrandAdmin) && (
    <div className="mb-8 md:hidden">
        <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search..."
            branding={branding}
            isBrandAdmin={isBrandAdmin}
            onEditBrandingSection={() => onOpenBrandingSection?.('search_bar')}
        />
    </div>
)}
```

- [ ] **Step 2: Modify `layout-sidebar.tsx`**

Run: `grep -n "<SearchBar" src/components/customer/layouts/layout-sidebar.tsx`

Apply the same pattern: gate the wrapping `<div>` on `(branding.searchBar.enabled || isBrandAdmin)` and pass `isBrandAdmin` + `onEditBrandingSection={() => onOpenBrandingSection?.('search_bar')}`.

- [ ] **Step 3: Modify `layout-grid-focus.tsx`**

Same pattern (line ~90).

- [ ] **Step 4: Modify `layout-mosaic.tsx`**

Same pattern (line ~172).

- [ ] **Step 5: Modify `layout-magazine.tsx`**

Same pattern (line ~194).

- [ ] **Step 6: Modify `layout-list.tsx`**

Same pattern (line ~126).

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep layouts | head`
Expected: No errors.

- [ ] **Step 8: Lint**

Run: `npm run lint -- src/components/customer/layouts`
Expected: No errors.

- [ ] **Step 9: Commit**

```bash
git add src/components/customer/layouts/
git commit -m "feat(layouts): gate search bar visibility and wire admin pencil"
```

---

## Task 9: Add `'search_bar'` section to branding-editor-overlay

**Files:**
- Modify: `src/components/admin/branding-editor-overlay.tsx`

- [ ] **Step 1: Extend `MenuBrandingSection` union (line 16)**

Change to:

```ts
type MenuBrandingSection = 'main_header' | 'category_navigation' | 'category_header' | 'cart_badge' | 'hero' | 'menu_cards' | 'search_bar'
```

- [ ] **Step 2: Add to `menuSectionLabels` (line ~229)**

```ts
  const menuSectionLabels: Record<MenuBrandingSection, string> = {
    main_header: 'Main Header',
    category_navigation: 'Category Navigation',
    category_header: 'Category Headers',
    cart_badge: 'Cart Badge',
    hero: 'Hero Section',
    menu_cards: 'Menu Cards',
    search_bar: 'Search Bar',
  }
```

- [ ] **Step 3: Add render branch in `renderMenuBrandingSection` (above `// menu_cards` block)**

```tsx
    if (section === 'search_bar') {
      return (
        <Section key={section} title="Search Bar" emoji="🔎">
          <div className="space-y-3">
            <label className="flex items-center justify-between gap-2 rounded-md border border-gray-200 px-3 py-2">
              <span className="text-xs font-medium">Show search bar</span>
              <input
                type="checkbox"
                checked={draft.search_bar_enabled !== false}
                onChange={(e) => updateDraft('search_bar_enabled', e.target.checked)}
                className="h-4 w-4"
              />
            </label>
            <div className="grid gap-3 grid-cols-2">
              <Swatch id="search_bar_background" label="Background" value={draft.search_bar_background || ''} onChange={(v) => updateDraft('search_bar_background', v)} compact />
              <Swatch id="search_bar_text" label="Text" value={draft.search_bar_text || ''} onChange={(v) => updateDraft('search_bar_text', v)} compact />
              <Swatch id="search_bar_placeholder" label="Placeholder" value={draft.search_bar_placeholder || ''} onChange={(v) => updateDraft('search_bar_placeholder', v)} compact />
              <Swatch id="search_bar_icon" label="Icon" value={draft.search_bar_icon || ''} onChange={(v) => updateDraft('search_bar_icon', v)} compact />
              <Swatch id="search_bar_border" label="Border" value={draft.search_bar_border || ''} onChange={(v) => updateDraft('search_bar_border', v)} compact />
              <Swatch id="search_bar_focus_ring" label="Focus Ring" value={draft.search_bar_focus_ring || ''} onChange={(v) => updateDraft('search_bar_focus_ring', v)} compact />
            </div>
            <div className="grid gap-3 grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="search_bar_radius" className="text-xs">Shape</Label>
                <select
                  id="search_bar_radius"
                  value={draft.search_bar_radius || 'pill'}
                  onChange={(e) => updateDraft('search_bar_radius', e.target.value)}
                  className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm"
                >
                  <option value="pill">Pill</option>
                  <option value="rounded">Rounded</option>
                  <option value="square">Square</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="search_bar_style" className="text-xs">Style</Label>
                <select
                  id="search_bar_style"
                  value={draft.search_bar_style || 'filled'}
                  onChange={(e) => updateDraft('search_bar_style', e.target.value)}
                  className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm"
                >
                  <option value="filled">Filled</option>
                  <option value="outline">Outline</option>
                  <option value="ghost">Ghost</option>
                </select>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => {
                updateDraft('search_bar_background', '')
                updateDraft('search_bar_text', '')
                updateDraft('search_bar_placeholder', '')
                updateDraft('search_bar_icon', '')
                updateDraft('search_bar_border', '')
                updateDraft('search_bar_focus_ring', '')
                updateDraft('search_bar_radius', 'pill')
                updateDraft('search_bar_style', 'filled')
              }}
            >
              Reset to defaults
            </Button>
          </div>
        </Section>
      )
    }
```

- [ ] **Step 4: Add `'search_bar'` to the section list array (line ~402)**

```ts
                ['main_header', 'category_navigation', 'category_header', 'cart_badge', 'hero', 'search_bar', 'menu_cards'] as MenuBrandingSection[]
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep branding-editor-overlay | head`
Expected: No errors. If `updateDraft` complains about new keys, ensure the Tenant type extension from Task 2 is present.

- [ ] **Step 6: Lint**

Run: `npm run lint -- src/components/admin/branding-editor-overlay.tsx`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/admin/branding-editor-overlay.tsx
git commit -m "feat(branding-editor): add search bar section with toggle and styles"
```

---

## Task 10: Manual verification

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Visit a tenant menu as admin**

Navigate to `http://<tenant>.localhost:3000/menu` while logged in as the tenant's admin.

Expected:
- Search bar renders.
- Pencil icon appears at top-right corner of the search bar.

- [ ] **Step 3: Open editor**

Click the pencil. The branding editor overlay should open focused on the "Search Bar" section.

Expected:
- "Show search bar" toggle visible and ON.
- 6 color swatches.
- Shape and Style dropdowns.

- [ ] **Step 4: Toggle visibility**

Turn off "Show search bar", save. Reload the menu in an incognito window (non-admin). Search bar should not render. Reload as admin — search bar still renders so the admin can toggle it back.

- [ ] **Step 5: Apply colors**

Set background `#1f1f1f`, text `#fafafa`, placeholder `#888888`, border `#333333`. Save. Reload. Search bar matches the dark theme like the screenshot example.

- [ ] **Step 6: Run full test + lint suite**

Run: `npm run lint && npm run test`
Expected: Both pass.

- [ ] **Step 7: Commit any final fixups**

If touch-ups were needed:
```bash
git add -p
git commit -m "fix: search bar manual verification touch-ups"
```

---

## Self-Review Notes

- Spec coverage: every column, every component change, every section in the overlay → covered by Tasks 1–9.
- Placeholder scan: every step contains real code or a real command. ✅
- Type consistency: `searchBar.focusRing` (camelCase in `BrandingColors`) ↔ `search_bar_focus_ring` (snake_case in DB). All references match. ✅
- The `setAlpha` import is preserved in the new search-bar.tsx. ✅
