# Checkout Interstitial Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the checkout interstitial with a McDonald's kiosk-style full-screen UI, admin item picker, and instant loading via prefetch.

**Architecture:** Three parallel changes: (1) Add item picker UI to the Checkout Settings tab in menu-engineering-dashboard, (2) Rewrite checkout-upsell-modal.tsx with kiosk-style full-screen design, (3) Move data fetching from modal-open to cart-page-load for instant display. The server action is simplified to only fetch manually-selected items (no waterfall).

**Tech Stack:** Next.js 15, React, Framer Motion, Tailwind CSS, Supabase, Shadcn UI, Lucide icons

---

### Task 1: Create server action to toggle show_in_checkout_upsell

**Files:**
- Modify: `src/app/actions/menu-engineering.ts` (add new action at end, ~line 252)

**Step 1: Add the toggleCheckoutUpsellItemAction**

Add this at the end of `src/app/actions/menu-engineering.ts`:

```typescript
export async function toggleCheckoutUpsellItemAction(
  itemId: string,
  tenantId: string,
  tenantSlug: string,
  showInCheckout: boolean
) {
  try {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('menu_items')
      // @ts-expect-error – Supabase generated types not available
      .update({ show_in_checkout_upsell: showInCheckout })
      .eq('id', itemId)
      .eq('tenant_id', tenantId)
      .select('id, show_in_checkout_upsell')
      .single()

    if (error) throw error
    revalidatePath(`/${tenantSlug}/admin/menu-engineering`)
    revalidatePath(`/${tenantSlug}/menu`)
    return { success: true, data }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to toggle checkout upsell item' }
  }
}
```

**Step 2: Commit**

```bash
git add src/app/actions/menu-engineering.ts
git commit -m "feat: add server action for toggling checkout upsell items"
```

---

### Task 2: Simplify getCheckoutUpsellsAction to manual-only

**Files:**
- Modify: `src/app/actions/menu-engineering.ts:176-237`

**Step 1: Replace the 4-tier waterfall with manual-only fetch**

Replace the `getCheckoutUpsellsAction` function body (lines 176-237) with:

```typescript
export async function getCheckoutUpsellsAction(
  cartItemIds: string[],
  tenantId: string,
  maxItems: number = 4
) {
  try {
    const manualItems = await getManualUpsellItems(tenantId, maxItems)
    // Filter out items already in cart
    const filtered = manualItems.filter(item => !cartItemIds.includes(item.id))
    return { success: true, data: filtered.slice(0, maxItems) }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch checkout upsells' }
  }
}
```

**Step 2: Remove unused imports**

From the imports at top of file, remove `getUpsellsForCart` and `getStarItems` since they're no longer used by this action. Check if they're used elsewhere before removing from the import list (they're used by UpsellPairsTab — keep them in the service file, just remove from this action's imports if not used by other actions in this file).

Actually — `getUpsellsForCart` and `getStarItems` are imported at line 11-12 for use in the old waterfall. Check if any other action in this file uses them. If not, remove them from the import. They remain exported from `menu-engineering-service.ts` for potential use elsewhere.

**Step 3: Commit**

```bash
git add src/app/actions/menu-engineering.ts
git commit -m "feat: simplify checkout upsells to manual-only selection"
```

---

### Task 3: Add item picker to CheckoutUpsellSettingsTab

**Files:**
- Modify: `src/components/admin/menu-engineering-dashboard.tsx:757-865` (the CheckoutUpsellSettingsTab function)
- Modify: `src/components/admin/menu-engineering-dashboard.tsx:51-61` (MenuEngineeringDashboardProps — already has menuItems)
- Modify: `src/components/admin/menu-engineering-dashboard.tsx:870-910` (pass menuItems to the checkout tab)

**Step 1: Add import for the new toggle action**

At line 38 in the imports, add `toggleCheckoutUpsellItemAction` to the imports from `@/app/actions/menu-engineering`.

Also add `Search` and `Check` from `lucide-react` imports (line 7).

**Step 2: Update CheckoutUpsellSettingsTab props and add item picker**

Replace the `CheckoutUpsellSettingsTab` component (lines 757-865) with a version that includes:
- Receives `menuItems: MenuItemWithCategory[]` prop
- Adds `searchQuery` state for filtering
- Adds local `selectedItems` state initialized from `menuItems.filter(i => i.show_in_checkout_upsell)`
- Search input to filter menu items by name
- Grid of menu items with checkboxes (selected ones shown at top with a visual indicator)
- Each item card: thumbnail image, name, price, checkbox
- Toggle calls `toggleCheckoutUpsellItemAction` per item
- Selected count badge

```typescript
function CheckoutUpsellSettingsTab({
  tenantId,
  tenantSlug,
  initialEnabled,
  initialTitle,
  initialSubtitle,
  initialMaxItems,
  menuItems,
}: {
  tenantId: string
  tenantSlug: string
  initialEnabled: boolean
  initialTitle: string
  initialSubtitle: string
  initialMaxItems: number
  menuItems: MenuItemWithCategory[]
}) {
  const [isPending, startTransition] = useTransition()
  const [enabled, setEnabled] = useState(initialEnabled)
  const [title, setTitle] = useState(initialTitle)
  const [subtitle, setSubtitle] = useState(initialSubtitle)
  const [maxItems, setMaxItems] = useState(initialMaxItems)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(menuItems.filter(i => i.show_in_checkout_upsell).map(i => i.id))
  )
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateCheckoutUpsellSettingsAction(tenantId, tenantSlug, {
        checkout_upsell_enabled: enabled,
        checkout_upsell_title: title,
        checkout_upsell_subtitle: subtitle,
        checkout_upsell_max_items: maxItems,
      })
      if (result.success) {
        toast.success('Checkout upsell settings saved')
      } else {
        toast.error(result.error || 'Failed to save settings')
      }
    })
  }

  const handleToggleItem = async (itemId: string) => {
    const isCurrentlySelected = selectedIds.has(itemId)
    setTogglingId(itemId)

    // Optimistic update
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (isCurrentlySelected) {
        next.delete(itemId)
      } else {
        next.add(itemId)
      }
      return next
    })

    const result = await toggleCheckoutUpsellItemAction(
      itemId, tenantId, tenantSlug, !isCurrentlySelected
    )

    if (!result.success) {
      // Revert on failure
      setSelectedIds(prev => {
        const next = new Set(prev)
        if (isCurrentlySelected) {
          next.add(itemId)
        } else {
          next.delete(itemId)
        }
        return next
      })
      toast.error('Failed to update item')
    }

    setTogglingId(null)
  }

  const availableItems = menuItems.filter(i => i.is_available)
  const filteredItems = availableItems.filter(i =>
    i.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Sort: selected items first, then alphabetical
  const sortedItems = [...filteredItems].sort((a, b) => {
    const aSelected = selectedIds.has(a.id) ? 0 : 1
    const bSelected = selectedIds.has(b.id) ? 0 : 1
    if (aSelected !== bSelected) return aSelected - bSelected
    return a.name.localeCompare(b.name)
  })

  return (
    <div className="space-y-6">
      {/* Settings Card (existing, unchanged) */}
      <Card>
        <CardHeader>
          <CardTitle>Checkout Upsell Settings</CardTitle>
          <CardDescription>
            Configure the interstitial modal that appears before checkout.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Enable Toggle */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="checkout-upsell-toggle" className="text-base font-medium">
                Enable Checkout Interstitial
              </Label>
              <p className="text-sm text-muted-foreground">
                Show upsell suggestions when customers proceed to checkout
              </p>
            </div>
            <Switch
              id="checkout-upsell-toggle"
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          </div>

          <div className={`space-y-4 ${!enabled ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="space-y-2">
              <Label htmlFor="upsell-title">Title</Label>
              <Input
                id="upsell-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Before you go..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="upsell-subtitle">Subtitle</Label>
              <Input
                id="upsell-subtitle"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                placeholder="You might also enjoy these items"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="upsell-max-items">Max Items Shown</Label>
              <Input
                id="upsell-max-items"
                type="number"
                min={1}
                max={8}
                value={maxItems}
                onChange={(e) => setMaxItems(parseInt(e.target.value) || 4)}
              />
              <p className="text-xs text-muted-foreground">
                Number of suggested items to show (1-8)
              </p>
            </div>
          </div>

          <Button onClick={handleSave} disabled={isPending}>
            <Save className="mr-2 h-4 w-4" />
            {isPending ? 'Saving...' : 'Save Settings'}
          </Button>
        </CardContent>
      </Card>

      {/* Item Picker Card (NEW) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Select Upsell Items</span>
            <Badge variant="secondary">{selectedIds.size} selected</Badge>
          </CardTitle>
          <CardDescription>
            Choose which items appear in the checkout interstitial. Only selected items will be shown to customers.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search menu items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Item Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[500px] overflow-y-auto pr-1">
            {sortedItems.map((item) => {
              const isSelected = selectedIds.has(item.id)
              const isToggling = togglingId === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => handleToggleItem(item.id)}
                  disabled={isToggling}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                    isSelected
                      ? 'border-primary bg-primary/5'
                      : 'border-transparent bg-muted/50 hover:bg-muted'
                  } ${isToggling ? 'opacity-50' : ''}`}
                >
                  {/* Thumbnail */}
                  <div className="relative h-12 w-12 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                    {item.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.image_url}
                        alt={item.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <ShoppingBag className="h-5 w-5 text-gray-300" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.category?.name || 'Uncategorized'}
                    </p>
                  </div>

                  {/* Check indicator */}
                  <div className={`flex h-6 w-6 items-center justify-center rounded-full shrink-0 ${
                    isSelected ? 'bg-primary text-primary-foreground' : 'border-2 border-muted-foreground/30'
                  }`}>
                    {isSelected && <Check className="h-3.5 w-3.5" />}
                  </div>
                </button>
              )
            })}
          </div>

          {sortedItems.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">
              No items found matching &quot;{searchQuery}&quot;
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
```

**Step 3: Pass menuItems to CheckoutUpsellSettingsTab**

In the main `MenuEngineeringDashboard` component (around line 908), update the `CheckoutUpsellSettingsTab` usage to pass `menuItems`:

```tsx
<CheckoutUpsellSettingsTab
  tenantId={tenantId}
  tenantSlug={tenantSlug}
  initialEnabled={checkoutUpsellEnabled}
  initialTitle={checkoutUpsellTitle}
  initialSubtitle={checkoutUpsellSubtitle}
  initialMaxItems={checkoutUpsellMaxItems}
  menuItems={menuItems}  // ← ADD THIS
/>
```

**Step 4: Add ShoppingBag to the lucide-react imports**

At the top import from lucide-react (line 7), add `ShoppingBag`, `Search`, and `Check` to the existing destructured imports.

**Step 5: Commit**

```bash
git add src/components/admin/menu-engineering-dashboard.tsx
git commit -m "feat: add item picker to checkout upsell settings tab"
```

---

### Task 4: Add prefetch to cart page

**Files:**
- Modify: `src/app/[tenant]/cart/page.tsx`

**Step 1: Add prefetch state and useEffect**

After line 40 (`const [showUpsellModal, setShowUpsellModal] = useState(false)`), add:

```typescript
const [prefetchedItems, setPrefetchedItems] = useState<MenuItem[] | null>(null)
const [isPrefetching, setIsPrefetching] = useState(false)
```

Add import of `MenuItem` from `@/types/database` (it may already be imported via CartItem — check).

Add import of `getCheckoutUpsellsAction` from `@/app/actions/menu-engineering`.

After the `loadTenant` useEffect (after line 65), add a new prefetch useEffect:

```typescript
// Prefetch upsell items as soon as tenant loads (if interstitial is enabled)
useEffect(() => {
  if (!tenant || !tenant.menu_engineering_enabled || !tenant.checkout_upsell_enabled) return
  if (items.length === 0) return

  setIsPrefetching(true)
  const cartItemIds = items.map((ci) => ci.menu_item.id)

  getCheckoutUpsellsAction(cartItemIds, tenant.id, tenant.checkout_upsell_max_items || 4)
    .then((result) => {
      if (result.success && result.data) {
        setPrefetchedItems(result.data)
      }
    })
    .catch(() => {
      // Silent fail - modal will show empty state
    })
    .finally(() => {
      setIsPrefetching(false)
    })
}, [tenant, items])
```

**Step 2: Pass prefetchedItems to CheckoutUpsellModal**

Update the `CheckoutUpsellModal` usage (lines 352-381) to pass `previewSuggestions={prefetchedItems || undefined}`:

```tsx
<CheckoutUpsellModal
  open={showUpsellModal}
  onContinue={...}
  tenantId={tenant.id}
  branding={branding}
  title={tenant.checkout_upsell_title || 'Before you go...'}
  subtitle={tenant.checkout_upsell_subtitle || 'You might also enjoy these items'}
  maxItems={tenant.checkout_upsell_max_items || 4}
  previewSuggestions={prefetchedItems || undefined}
/>
```

Wait — `previewSuggestions` currently skips analytics tracking. We need a different prop. Let's add a `prefetchedItems` prop instead.

**Step 3: Commit**

```bash
git add src/app/[tenant]/cart/page.tsx
git commit -m "feat: prefetch upsell items on cart page load"
```

---

### Task 5: Redesign CheckoutUpsellModal — McDonald's kiosk style

**Files:**
- Rewrite: `src/components/customer/checkout-upsell-modal.tsx`

**Step 1: Full rewrite of the component**

Key changes from current implementation:
- **Mobile**: Full-screen takeover (not bottom sheet) — `fixed inset-0` instead of `inset-x-0 bottom-0`
- **Desktop**: Centered modal, 4-column grid for items
- **Accept `prefetchedItems` prop**: New optional prop that bypasses server fetch
- **No skeleton loaders**: If data is prefetched, render immediately. Only show a brief spinner if prefetch is still in-flight (edge case)
- **Larger images**: Keep aspect-[4/3] but make cards bigger
- **Bold pricing**: Larger font, more prominent
- **"+ Add" buttons**: Full-width, high contrast with plus icon
- **"No thanks, checkout" CTA**: Secondary style at bottom
- **Slide-up animation** on mobile, scale+fade on desktop (keep existing Framer Motion patterns)
- **Keep all 7 branding color variables**
- **Keep analytics tracking** (upsell_shown, upsell_clicked)
- **Keep "Added!" confirmation** overlay

The new props interface:

```typescript
interface CheckoutUpsellModalProps {
  open: boolean
  onContinue: () => void
  tenantId: string
  branding: BrandingColors
  title: string
  subtitle: string
  maxItems: number
  /** Prefetched items from cart page — skip server fetch */
  prefetchedItems?: MenuItem[]
  /** Preview mode for admin — skip analytics */
  previewSuggestions?: MenuItem[]
  previewColors?: CheckoutModalColors
  zIndexClass?: string
}
```

The fetch logic changes:

```typescript
useEffect(() => {
  if (!open) return

  // Preview mode
  if (previewSuggestions) {
    setSuggestions(previewSuggestions)
    setIsLoading(false)
    return
  }

  // Prefetched data available — instant display
  if (prefetchedItems && prefetchedItems.length > 0) {
    setSuggestions(prefetchedItems)
    setIsLoading(false)
    // Track analytics
    if (!shownTrackedRef.current) {
      shownTrackedRef.current = true
      trackAnalyticsEventAction(tenantId, 'upsell_shown', {
        source: 'checkout_modal',
        itemCount: prefetchedItems.length,
      })
    }
    return
  }

  // Fallback: fetch on demand (shouldn't happen normally)
  setIsLoading(true)
  const cartItemIds = cartItems.map((ci) => ci.menu_item.id)
  getCheckoutUpsellsAction(cartItemIds, tenantId, maxItems)
    .then(...)
    .finally(() => setIsLoading(false))
}, [open])
```

Mobile layout structure (full-screen):

```tsx
{/* Mobile: Full-screen takeover */}
<motion.div
  className={`fixed inset-0 ${zIndexClass} flex flex-col sm:hidden`}
  style={{ backgroundColor: colors.background }}
  variants={fullscreenVariants}
  initial="hidden"
  animate="visible"
  exit="exit"
>
  {/* Header */}
  <div className="flex items-center justify-between px-5 pt-safe-top py-4 shrink-0">
    <div>
      <h2 className="text-xl font-bold" style={{ color: colors.title }}>
        {title}
      </h2>
      <p className="text-sm mt-0.5" style={{ color: colors.description }}>
        {subtitle}
      </p>
    </div>
    <button onClick={handleContinue} className="rounded-full p-2 ...">
      <X className="h-5 w-5" />
    </button>
  </div>

  {/* Scrollable grid */}
  <div className="flex-1 overflow-y-auto px-4 pb-4">
    <motion.div className="grid grid-cols-2 gap-3" variants={gridVariants} ...>
      {suggestions.map((item, index) => (
        <UpsellItemCard key={item.id} item={item} ... />
      ))}
    </motion.div>
  </div>

  {/* Footer */}
  <div className="px-4 pb-safe-bottom py-4 shrink-0 border-t" style={{ borderColor: colors.border }}>
    <motion.button
      className="w-full h-14 rounded-2xl text-base font-semibold flex items-center justify-center gap-2"
      style={{
        backgroundColor: 'transparent',
        color: colors.description,
        border: `1.5px solid ${colors.border}`,
      }}
      onClick={handleContinue}
    >
      No thanks, checkout
      <ArrowRight className="h-4 w-4" />
    </motion.button>
  </div>
</motion.div>
```

Desktop layout: same centered modal approach but with 4-column grid:

```tsx
<motion.div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
```

Add `ArrowRight` to lucide-react imports.

**Step 2: Commit**

```bash
git add src/components/customer/checkout-upsell-modal.tsx
git commit -m "feat: redesign checkout interstitial with kiosk-style full-screen UI"
```

---

### Task 6: Update cart page to use new prefetchedItems prop

**Files:**
- Modify: `src/app/[tenant]/cart/page.tsx`

**Step 1: Update CheckoutUpsellModal usage**

Change `previewSuggestions` to `prefetchedItems` in the modal props:

```tsx
<CheckoutUpsellModal
  open={showUpsellModal}
  onContinue={...}
  tenantId={tenant.id}
  branding={branding}
  title={tenant.checkout_upsell_title || 'Would you like to add...?'}
  subtitle={tenant.checkout_upsell_subtitle || 'Complete your meal!'}
  maxItems={tenant.checkout_upsell_max_items || 4}
  prefetchedItems={prefetchedItems || undefined}
/>
```

Also update the default title/subtitle to the new kiosk-style copy.

**Step 2: Commit**

```bash
git add src/app/[tenant]/cart/page.tsx
git commit -m "feat: wire up prefetched items to redesigned checkout modal"
```

---

### Task 7: Lint check and fix

**Step 1: Run lint**

```bash
npm run lint
```

**Step 2: Fix any lint errors in the changed files**

Common issues to watch for:
- Unused imports (old waterfall functions)
- Missing dependencies in useEffect arrays
- img tags without next/image (allowed in admin with eslint-disable comment)

**Step 3: Commit fixes if any**

```bash
git add -A
git commit -m "fix: lint errors from checkout interstitial redesign"
```

---

### Task 8: Manual testing verification

**Step 1: Start dev server**

```bash
npm run dev
```

**Step 2: Test admin item picker**

1. Navigate to `/{tenant}/admin/menu-engineering` → "Checkout Settings" tab
2. Verify item picker grid shows all available menu items
3. Search by item name — verify filtering works
4. Select 3-4 items — verify checkmarks appear and selected count updates
5. Deselect an item — verify it unchecks
6. Save settings — verify toast success

**Step 3: Test customer checkout interstitial**

1. Navigate to `/{tenant}/menu` and add items to cart
2. Go to cart page — observe no visible loading
3. Click "Proceed to Checkout"
4. Verify: modal appears INSTANTLY (no skeleton loaders, no delay)
5. Verify: only the admin-selected items appear
6. Verify mobile: full-screen takeover layout
7. Verify desktop: centered modal with grid
8. Click "+ Add" on an item — verify "Added!" confirmation
9. Click "No thanks, checkout" — verify navigation to checkout

**Step 4: Commit final state**

```bash
git add -A
git commit -m "feat: checkout interstitial redesign complete"
```
