# Responsive Layout & Card Customization — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow tenants to configure separate page layouts and card templates for mobile vs desktop, and make all 12 card templates compact-aware on mobile screens.

**Architecture:** Add 2 nullable columns (`mobile_page_layout`, `mobile_card_template`) to `tenants`. When mobile differs from desktop, render two `<MenuLayout>` wrappers with CSS `md:hidden` / `hidden md:block`. Card compactness is baked into each template via responsive Tailwind classes — no runtime logic needed.

**Tech Stack:** Supabase migrations, TypeScript, Next.js Server Actions, React, Tailwind CSS

---

### Task 1: Database Migration

**Files:**
- Create: Supabase migration via MCP tool

**Step 1: Apply migration**

Use `mcp__supabase__apply_migration` with name `add_mobile_layout_columns` and SQL:

```sql
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS mobile_page_layout text,
  ADD COLUMN IF NOT EXISTS mobile_card_template text;

COMMENT ON COLUMN tenants.mobile_page_layout IS 'Page layout for mobile screens (<768px). Falls back to page_layout when null.';
COMMENT ON COLUMN tenants.mobile_card_template IS 'Card template for mobile screens (<768px). Falls back to card_template when null.';
```

**Step 2: Verify columns exist**

Run: `mcp__supabase__execute_sql` with `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'tenants' AND column_name IN ('mobile_page_layout', 'mobile_card_template');`

Expected: 2 rows, both `text` type, both `YES` nullable.

**Step 3: Commit**

```bash
git add supabase/migrations/
git commit -m "feat: add mobile_page_layout and mobile_card_template columns to tenants"
```

---

### Task 2: TypeScript Types

**Files:**
- Modify: `src/types/database.ts:52-54`

**Step 1: Add mobile fields to Tenant interface**

After line 54 (`mobile_grid_columns?: number;`), add:

```typescript
  mobile_page_layout?: string | null; // Layout for mobile (<768px), falls back to page_layout
  mobile_card_template?: string | null; // Card template for mobile (<768px), falls back to card_template
```

**Step 2: Verify build compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No new errors from this change.

**Step 3: Commit**

```bash
git add src/types/database.ts
git commit -m "feat: add mobile layout/card types to Tenant interface"
```

---

### Task 3: Branding Server Action — Add New Fields

**Files:**
- Modify: `src/app/actions/branding.ts:74-77` (brandingSchema layout section)
- Modify: `src/app/actions/branding.ts:102-135` (ROLLOUT_DEPENDENT_FIELDS)

**Step 1: Add fields to Zod schema**

In `brandingSchema`, after the `mobile_grid_columns` line (line 77), add:

```typescript
    mobile_page_layout: z.string().optional().nullable(),
    mobile_card_template: z.string().optional().nullable(),
```

**Step 2: Add fields to ROLLOUT_DEPENDENT_FIELDS array**

Add these two strings to the `ROLLOUT_DEPENDENT_FIELDS` array:

```typescript
    'mobile_page_layout',
    'mobile_card_template',
```

**Step 3: Verify action compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

**Step 4: Commit**

```bash
git add src/app/actions/branding.ts
git commit -m "feat: add mobile layout/card fields to branding save action"
```

---

### Task 4: Branding Editor — Add Desktop/Mobile Toggle

**Files:**
- Modify: `src/components/admin/branding-editor-overlay.tsx`

This is the largest UI change. We need to:

1. Add `mobile_page_layout` and `mobile_card_template` to `BrandingDraft` interface
2. Add them to `buildDraftFromTenant()`
3. Add a `configuringScreen` state (`'desktop' | 'mobile'`) to each of the Layouts and Cards tabs
4. Modify the Layouts tab to show the toggle and update the correct draft field
5. Modify the Cards tab similarly

**Step 1: Add new fields to BrandingDraft interface**

After `mobile_grid_columns?: number` (line 83), add:

```typescript
  mobile_page_layout?: string | null
  mobile_card_template?: string | null
```

**Step 2: Add to buildDraftFromTenant()**

After `mobile_grid_columns: tenant.mobile_grid_columns || 1,` (line 159), add:

```typescript
    mobile_page_layout: tenant.mobile_page_layout || null,
    mobile_card_template: tenant.mobile_card_template || null,
```

**Step 3: Add screen toggle state**

Inside `BrandingEditorOverlay` function, after the `draft` state (line 175), add:

```typescript
  const [layoutScreen, setLayoutScreen] = useState<'desktop' | 'mobile'>('desktop')
  const [cardScreen, setCardScreen] = useState<'desktop' | 'mobile'>('desktop')
```

**Step 4: Create a reusable ScreenToggle component**

Add this inside the file, before the `BrandingEditorOverlay` export:

```tsx
function ScreenToggle({ value, onChange }: { value: 'desktop' | 'mobile'; onChange: (v: 'desktop' | 'mobile') => void }) {
  return (
    <div className="flex items-center gap-1 rounded-lg border bg-gray-50 p-1">
      <button
        type="button"
        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
          value === 'desktop' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
        }`}
        onClick={() => onChange('desktop')}
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        Desktop
      </button>
      <button
        type="button"
        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
          value === 'mobile' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
        }`}
        onClick={() => onChange('mobile')}
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
        Mobile
      </button>
    </div>
  )
}
```

**Step 5: Update Layouts tab**

Replace the Layouts TabsContent (lines 563-679). The key changes:
- Add `<ScreenToggle>` at the top
- When `layoutScreen === 'desktop'`, the layout picker updates `draft.page_layout` (existing behavior)
- When `layoutScreen === 'mobile'`, the layout picker updates `draft.mobile_page_layout`
- The currently selected layout for comparison uses the appropriate field
- When mobile is selected and `mobile_page_layout` is null, show a hint: "Using desktop layout. Pick a different one for mobile."
- Show a "Reset to Desktop" button when mobile has a value set

The layout picker buttons should use this selected value:

```typescript
const activeLayout = layoutScreen === 'desktop'
  ? (draft.page_layout || 'default')
  : (draft.mobile_page_layout || draft.page_layout || 'default')

const isExplicitMobileOverride = layoutScreen === 'mobile' && draft.mobile_page_layout !== null

// On click:
const handleLayoutSelect = (layoutId: string) => {
  if (layoutScreen === 'desktop') {
    updateDraft('page_layout', layoutId)
  } else {
    updateDraft('mobile_page_layout', layoutId)
  }
}
```

Add a "Reset to Desktop" button when in mobile mode and a mobile override exists:

```tsx
{layoutScreen === 'mobile' && draft.mobile_page_layout && (
  <button
    type="button"
    className="text-xs text-blue-600 hover:text-blue-800 underline"
    onClick={() => updateDraft('mobile_page_layout', null as unknown as string)}
  >
    Reset to desktop layout
  </button>
)}
```

And an info banner when mobile has no override:

```tsx
{layoutScreen === 'mobile' && !draft.mobile_page_layout && (
  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
    <p className="text-xs text-amber-800">
      Currently using the desktop layout. Pick a different layout to customize mobile separately.
    </p>
  </div>
)}
```

**Step 6: Update Cards tab**

Same pattern as Layouts tab:
- Add `<ScreenToggle value={cardScreen} onChange={setCardScreen}>` at the top
- When `cardScreen === 'desktop'`, picker updates `draft.card_template`
- When `cardScreen === 'mobile'`, picker updates `draft.mobile_card_template`
- Show "Reset to Desktop" / info banner similarly

```typescript
const activeCard = cardScreen === 'desktop'
  ? (draft.card_template || 'classic')
  : (draft.mobile_card_template || draft.card_template || 'classic')

const handleCardSelect = (templateId: string) => {
  if (cardScreen === 'desktop') {
    updateDraft('card_template', templateId)
  } else {
    updateDraft('mobile_card_template', templateId)
  }
}
```

**Step 7: Commit**

```bash
git add src/components/admin/branding-editor-overlay.tsx
git commit -m "feat: add Desktop/Mobile toggle to Layouts and Cards tabs in branding editor"
```

---

### Task 5: MenuClient — Dual Render Logic

**Files:**
- Modify: `src/app/[tenant]/menu/menu-client.tsx:539-566` (the `<MenuLayout>` JSX)
- Modify: `src/app/[tenant]/menu/menu-client.tsx:491` (CategorySubmenu conditional)
- Modify: `src/app/[tenant]/menu/menu-client.tsx:502-524` (BrandingEditorOverlay onPreview)

**Step 1: Add mobile override states**

After `mobileGridColumnsOverride` state (line 184), add:

```typescript
const [mobilePageLayoutOverride, setMobilePageLayoutOverride] = useState<string | null>(null)
const [mobileCardTemplateOverride, setMobileCardTemplateOverride] = useState<string | null>(null)
```

**Step 2: Compute resolved values**

Before the JSX return (around line 357), add:

```typescript
const desktopLayout = (pageLayoutOverride || tenant?.page_layout || 'default') as PageLayout
const mobileLayout = (mobilePageLayoutOverride ?? tenant?.mobile_page_layout ?? desktopLayout) as PageLayout
const desktopCard = (cardTemplateOverride || tenant?.card_template || 'classic') as CardTemplate
const mobileCard = (mobileCardTemplateOverride ?? tenant?.mobile_card_template ?? desktopCard) as CardTemplate
const needsDualRender = mobileLayout !== desktopLayout || mobileCard !== desktopCard
```

**Step 3: Update BrandingEditorOverlay onPreview**

In the `onPreview` callback (lines 505-512), add after the existing overrides:

```typescript
setMobilePageLayoutOverride(draft?.mobile_page_layout as string || null)
setMobileCardTemplateOverride(draft?.mobile_card_template as string || null)
```

**Step 4: Update CategorySubmenu conditional**

Line 491 checks `(pageLayoutOverride || tenant?.page_layout || 'default') === 'default'`. Update to account for mobile:

For dual render, the CategorySubmenu should show when the desktop layout is 'default'. On mobile, the layout-specific mobile rendering handles its own navigation.

Replace:
```tsx
{categories.length > 0 && (pageLayoutOverride || tenant?.page_layout || 'default') === 'default' && (
```
With:
```tsx
{categories.length > 0 && desktopLayout === 'default' && (
```

Actually, for dual render, the CategorySubmenu should be hidden on mobile when mobile layout is not 'default'. Wrap it:

```tsx
{categories.length > 0 && (
  <>
    {desktopLayout === 'default' && (
      <div className={needsDualRender ? 'hidden md:block' : ''}>
        <CategorySubmenu ... />
      </div>
    )}
    {needsDualRender && mobileLayout === 'default' && (
      <div className="md:hidden">
        <CategorySubmenu ... />
      </div>
    )}
  </>
)}
```

Wait — this is getting complex. Simpler approach: since CategorySubmenu is only used by 'default' layout, and other layouts handle their own navigation, just check:

```tsx
{categories.length > 0 && (
  (needsDualRender ? (
    <>
      {desktopLayout === 'default' && (
        <div className="hidden md:block">
          <CategorySubmenu ... />
        </div>
      )}
      {mobileLayout === 'default' && (
        <div className="md:hidden">
          <CategorySubmenu ... />
        </div>
      )}
    </>
  ) : desktopLayout === 'default' ? (
    <CategorySubmenu ... />
  ) : null)
)}
```

**Step 5: Replace single MenuLayout with dual render**

Replace the `<MenuLayout ... />` block (lines 539-566) with:

```tsx
{needsDualRender ? (
  <>
    {/* Mobile layout */}
    <div className="md:hidden">
      <MenuLayout
        layout={mobileLayout}
        tenant={tenant}
        tenantSlug={tenantSlug}
        categories={categories}
        filteredItems={filteredItems}
        allMenuItems={allMenuItems}
        activeCategory={activeCategory}
        setActiveCategory={setActiveCategory}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onItemSelect={handleItemSelect}
        branding={branding}
        cardTemplate={mobileCard}
        isLoading={false}
        heroOverride={heroOverride}
        bannerOverride={{
          promotionBanners: bannerOverride?.promotionBanners,
          isPromotionVisible: bannerOverride?.isPromotionVisible,
        }}
        currentSlide={currentSlide}
        setCurrentSlide={setCurrentSlide}
        mobileGridColumns={mobileGridColumnsOverride || tenant?.mobile_grid_columns || 1}
        menuEngineeringEnabled={tenant?.menu_engineering_enabled}
        hideCurrencySymbol={!!(tenant?.menu_engineering_enabled && tenant?.hide_currency_symbol)}
        isBrandAdmin={isBrandAdmin}
        onOpenBrandingSection={openBrandingEditor}
      />
    </div>
    {/* Desktop layout */}
    <div className="hidden md:block">
      <MenuLayout
        layout={desktopLayout}
        tenant={tenant}
        tenantSlug={tenantSlug}
        categories={categories}
        filteredItems={filteredItems}
        allMenuItems={allMenuItems}
        activeCategory={activeCategory}
        setActiveCategory={setActiveCategory}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onItemSelect={handleItemSelect}
        branding={branding}
        cardTemplate={desktopCard}
        isLoading={false}
        heroOverride={heroOverride}
        bannerOverride={{
          promotionBanners: bannerOverride?.promotionBanners,
          isPromotionVisible: bannerOverride?.isPromotionVisible,
        }}
        currentSlide={currentSlide}
        setCurrentSlide={setCurrentSlide}
        mobileGridColumns={mobileGridColumnsOverride || tenant?.mobile_grid_columns || 1}
        menuEngineeringEnabled={tenant?.menu_engineering_enabled}
        hideCurrencySymbol={!!(tenant?.menu_engineering_enabled && tenant?.hide_currency_symbol)}
        isBrandAdmin={isBrandAdmin}
        onOpenBrandingSection={openBrandingEditor}
      />
    </div>
  </>
) : (
  <MenuLayout
    layout={desktopLayout}
    tenant={tenant}
    tenantSlug={tenantSlug}
    categories={categories}
    filteredItems={filteredItems}
    allMenuItems={allMenuItems}
    activeCategory={activeCategory}
    setActiveCategory={setActiveCategory}
    searchQuery={searchQuery}
    setSearchQuery={setSearchQuery}
    onItemSelect={handleItemSelect}
    branding={branding}
    cardTemplate={desktopCard}
    isLoading={false}
    heroOverride={heroOverride}
    bannerOverride={{
      promotionBanners: bannerOverride?.promotionBanners,
      isPromotionVisible: bannerOverride?.isPromotionVisible,
    }}
    currentSlide={currentSlide}
    setCurrentSlide={setCurrentSlide}
    mobileGridColumns={mobileGridColumnsOverride || tenant?.mobile_grid_columns || 1}
    menuEngineeringEnabled={tenant?.menu_engineering_enabled}
    hideCurrencySymbol={!!(tenant?.menu_engineering_enabled && tenant?.hide_currency_symbol)}
    isBrandAdmin={isBrandAdmin}
    onOpenBrandingSection={openBrandingEditor}
  />
)}
```

**Step 6: Verify lint passes**

Run: `npm run lint 2>&1 | tail -10`

**Step 7: Commit**

```bash
git add src/app/[tenant]/menu/menu-client.tsx
git commit -m "feat: dual render mobile/desktop layouts in MenuClient"
```

---

### Task 6: Card Templates — Mobile Compact Mode

**Files:**
- Modify: All 12 card templates in `src/components/customer/card-templates/`

For each card, apply responsive Tailwind classes for tighter mobile rendering. The pattern for each card:

**General compact rules (apply to all vertical cards):**

| Element | Current | Mobile compact |
|---------|---------|---------------|
| Content padding | `p-4` or `p-5` | `p-2.5 md:p-4` or `p-3 md:p-5` |
| Title size | `text-lg` or `text-base` | `text-sm md:text-lg` or `text-sm md:text-base` |
| Title clamp | `line-clamp-1` | (keep as-is) |
| Description size | `text-sm` or `text-xs` | `text-[11px] md:text-sm` or stay at `text-xs` |
| Description clamp | `line-clamp-2` | `line-clamp-1 md:line-clamp-2` |
| Price size | `text-lg` or `text-2xl` | `text-sm md:text-lg` or `text-lg md:text-2xl` |
| Add button size | `h-10 w-10` or `h-11 w-11` or `h-12 w-12` | `h-8 w-8 md:h-10 md:w-10` etc. |
| Add button icon | `h-5 w-5` or `h-6 w-6` | `h-4 w-4 md:h-5 md:w-5` etc. |
| Badge text | `text-xs` | `text-[10px] md:text-xs` |
| Variation badge | `text-xs` | `text-[10px] md:text-xs` |
| Rounding | `rounded-2xl` or `rounded-3xl` | `rounded-xl md:rounded-2xl` etc. |
| Spacing | `space-y-3` | `space-y-1.5 md:space-y-3` |

**Step 1: Classic Card** (`classic-card.tsx`)

Key changes:
- Outer: `rounded-2xl` → `rounded-xl md:rounded-2xl`
- Content div: `p-4` → `p-2.5 md:p-4`
- Title: `text-lg` → `text-sm md:text-lg`
- Description: `text-sm line-clamp-2` → `text-xs md:text-sm line-clamp-1 md:line-clamp-2`
- Description margin: `mb-2` → `mb-1 md:mb-2`
- Price: `text-lg` → `text-sm md:text-lg`
- Add button: `h-10 w-10` → `h-8 w-8 md:h-10 md:w-10`
- Add button bottom/right: `bottom-3 right-3` → `bottom-2 right-2 md:bottom-3 md:right-3`
- Badge positions: `left-3 top-3` → `left-2 top-2 md:left-3 md:top-3`
- Badge text: `px-2.5 py-1 text-xs` → `px-2 py-0.5 text-[10px] md:px-2.5 md:py-1 md:text-xs`
- Variation badge: keep `text-xs` as-is (already small)

**Step 2: Modern Card** (`modern-card.tsx`)

Key changes:
- Outer: `rounded-3xl` → `rounded-2xl md:rounded-3xl`
- Floating price: `bottom-4 left-4` → `bottom-2 left-2 md:bottom-4 md:left-4`; `px-3 py-2` → `px-2 py-1 md:px-3 md:py-2`; price text `text-xl` → `text-sm md:text-xl`
- Floating add button: `h-12 w-12` → `h-9 w-9 md:h-12 md:w-12`; `bottom-4 right-4` → `bottom-2 right-2 md:bottom-4 md:right-4`; icon `h-6 w-6` → `h-4 w-4 md:h-6 md:w-6`
- Content overlay: `-mt-6 mx-4 mb-4 p-4` → `-mt-4 mx-2 mb-2 p-2.5 md:-mt-6 md:mx-4 md:mb-4 md:p-4`; rounding `rounded-2xl` → `rounded-xl md:rounded-2xl`
- Title: `text-base` → `text-sm md:text-base`
- Description: `text-xs line-clamp-2` → `text-[11px] md:text-xs line-clamp-1 md:line-clamp-2`

**Step 3: Elegant Card** (`elegant-card.tsx`)

Key changes:
- Outer: `rounded-[20px]` → Use style instead (keep as-is, it uses inline style). The rounding is inline so add mobile-aware class: can't easily do responsive inline styles. Keep `rounded-[20px]` and add `md:rounded-[20px]` — actually since Tailwind arbitrary values work, change to `rounded-2xl md:rounded-[20px]`.
- Content: `p-5 space-y-3` → `p-3 space-y-1.5 md:p-5 md:space-y-3`
- Title: `text-lg` → `text-sm md:text-lg`
- Description: `text-sm line-clamp-2` → `text-xs md:text-sm line-clamp-1 md:line-clamp-2`
- Price: `text-2xl` → `text-base md:text-2xl`
- Add button: `h-11 w-11` → `h-8 w-8 md:h-11 md:w-11`; icon: `h-5 w-5` → `h-4 w-4 md:h-5 md:w-5`
- Badge positions: `left-4 top-4` → `left-2 top-2 md:left-4 md:top-4`; `px-3 py-1.5` → `px-2 py-0.5 md:px-3 md:py-1.5`

**Step 4: Glass Card** (`glass-card.tsx`)

Key changes:
- Content: `p-4 space-y-2` → `p-2.5 space-y-1 md:p-4 md:space-y-2`
- Title: `text-base` → `text-sm md:text-base`
- Description: `text-sm line-clamp-2` → `text-xs md:text-sm line-clamp-1 md:line-clamp-2`
- Price: `text-lg` → `text-sm md:text-lg`
- Add button: `h-10 w-10` → `h-8 w-8 md:h-10 md:w-10`
- Badge positions: `left-3 top-3` → `left-2 top-2 md:left-3 md:top-3`

**Step 5: Polaroid Card** (`polaroid-card.tsx`)

Key changes:
- Outer padding inline: `10px 10px 0 10px` → `6px 6px 0 6px` on mobile. Since it's inline style, use a CSS approach or leave as-is (polaroid's charm is the frame). Keep inline padding but add a wrapper class approach. Simpler: use className `p-1.5 md:p-2.5` instead of inline padding. Remove the inline padding and use Tailwind.
- Caption: `py-4 px-1 space-y-1.5` → `py-2 px-0.5 space-y-1 md:py-4 md:px-1 md:space-y-1.5`
- Title: `text-base` → `text-sm md:text-base`
- Price: `text-lg` → `text-sm md:text-lg`
- Add button: `h-8 w-8` → `h-7 w-7 md:h-8 md:w-8`

**Step 6: Neon Card** (`neon-card.tsx`)

Key changes:
- Content: `p-4 space-y-2` → `p-2.5 space-y-1 md:p-4 md:space-y-2`
- Title: `text-base` → `text-sm md:text-base`
- Description: `text-xs line-clamp-2` → `text-[11px] md:text-xs line-clamp-1 md:line-clamp-2`
- Price: `text-lg` → `text-sm md:text-lg`
- Add button: `h-9 w-9` → `h-7 w-7 md:h-9 md:w-9`

**Step 7: Magazine Card** (`magazine-card.tsx`)

Key changes:
- Content overlay: `p-5 space-y-3` → `p-3 space-y-1.5 md:p-5 md:space-y-3`
- Title: `text-xl` → `text-base md:text-xl`
- Description: `text-sm line-clamp-2` → `text-xs md:text-sm line-clamp-1 md:line-clamp-2`
- Price: `text-2xl` → `text-base md:text-2xl`
- Add button: `h-11 w-11` → `h-8 w-8 md:h-11 md:w-11`; icon: `h-5 w-5` → `h-4 w-4 md:h-5 md:w-5`

**Step 8: Remaining cards** (minimal, compact, bold, brutalist, zen)

Apply same pattern:
- Read each file
- Reduce padding, font sizes, button sizes below `md:` breakpoint
- Keep same visual identity
- Description truncation: `line-clamp-1 md:line-clamp-2`

**Step 9: Verify lint passes**

Run: `npm run lint 2>&1 | tail -20`

**Step 10: Commit**

```bash
git add src/components/customer/card-templates/
git commit -m "feat: add responsive compact mode to all 12 card templates for mobile"
```

---

### Task 7: Verify End-to-End

**Step 1: Run lint**

Run: `npm run lint`
Expected: No errors.

**Step 2: Run build**

Run: `npm run build 2>&1 | tail -30`
Expected: Builds successfully.

**Step 3: Run tests**

Run: `npm run test 2>&1 | tail -20`
Expected: All tests pass (no existing tests touch layout/card rendering).

**Step 4: Commit any remaining fixes**

```bash
git add -A
git commit -m "fix: resolve any lint/build issues from responsive layout feature"
```

---

## Summary of All Files Changed

| File | Action | What |
|------|--------|------|
| Supabase migration | Create | Add 2 columns |
| `src/types/database.ts` | Modify | Add 2 fields to `Tenant` |
| `src/app/actions/branding.ts` | Modify | Add fields to schema + rollout list |
| `src/components/admin/branding-editor-overlay.tsx` | Modify | Desktop/Mobile toggle, new draft fields |
| `src/app/[tenant]/menu/menu-client.tsx` | Modify | Dual render logic |
| `src/components/customer/card-templates/classic-card.tsx` | Modify | Responsive compact |
| `src/components/customer/card-templates/modern-card.tsx` | Modify | Responsive compact |
| `src/components/customer/card-templates/elegant-card.tsx` | Modify | Responsive compact |
| `src/components/customer/card-templates/glass-card.tsx` | Modify | Responsive compact |
| `src/components/customer/card-templates/polaroid-card.tsx` | Modify | Responsive compact |
| `src/components/customer/card-templates/neon-card.tsx` | Modify | Responsive compact |
| `src/components/customer/card-templates/magazine-card.tsx` | Modify | Responsive compact |
| `src/components/customer/card-templates/minimal-card.tsx` | Modify | Responsive compact |
| `src/components/customer/card-templates/compact-card.tsx` | Modify | Responsive compact |
| `src/components/customer/card-templates/bold-card.tsx` | Modify | Responsive compact |
| `src/components/customer/card-templates/brutalist-card.tsx` | Modify | Responsive compact |
| `src/components/customer/card-templates/zen-card.tsx` | Modify | Responsive compact |
