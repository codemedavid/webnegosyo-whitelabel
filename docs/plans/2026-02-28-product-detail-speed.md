# Product Detail Page — Instant Navigation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make product detail page navigation feel instant by showing immediate visual feedback on card tap and prefetching on mobile.

**Architecture:** Add `useTransition` to `router.push()` so Next.js triggers the `loading.tsx` skeleton immediately. Enable prefetching on mobile via `onTouchStart`. Thread a `pendingItemId` through existing props to show a loading state on the tapped card.

**Tech Stack:** React 19 `useTransition`, Next.js App Router prefetch, existing component props

---

### Task 1: Add `useTransition` to `menu-client.tsx`

**Files:**
- Modify: `src/app/[tenant]/menu/menu-client.tsx:2` (import line)
- Modify: `src/app/[tenant]/menu/menu-client.tsx:192-203` (handleItemSelect)

**Step 1: Update the import**

Change line 3:
```tsx
import { useState, useMemo, useEffect, useCallback } from 'react'
```
to:
```tsx
import { useState, useMemo, useEffect, useCallback, useTransition } from 'react'
```

**Step 2: Add `useTransition` hook and `pendingItemId` state**

After the existing `useState` declarations (around line 185, near `isCheckoutPreviewOpen`), add:
```tsx
const [isNavigating, startTransition] = useTransition()
const [pendingItemId, setPendingItemId] = useState<string | null>(null)
```

**Step 3: Wrap `router.push` in `startTransition`**

Replace the `handleItemSelect` callback (lines 192-203):
```tsx
  const handleItemSelect = useCallback((item: MenuItem) => {
    const hasCustomizations =
      item.variations.length > 0 ||
      (item.variation_types && item.variation_types.length > 0) ||
      item.addons.length > 0
    if (!hasCustomizations && !tenant?.menu_engineering_enabled) {
      addItem(item, undefined, [], 1, undefined)
      toast.success(`Added ${item.name} to cart`)
    } else {
      router.push(`/${tenantSlug}/menu/item/${item.id}`, { scroll: true })
    }
  }, [tenant?.menu_engineering_enabled, addItem, router, tenantSlug])
```
with:
```tsx
  const handleItemSelect = useCallback((item: MenuItem) => {
    const hasCustomizations =
      item.variations.length > 0 ||
      (item.variation_types && item.variation_types.length > 0) ||
      item.addons.length > 0
    if (!hasCustomizations && !tenant?.menu_engineering_enabled) {
      addItem(item, undefined, [], 1, undefined)
      toast.success(`Added ${item.name} to cart`)
    } else {
      setPendingItemId(item.id)
      startTransition(() => {
        router.push(`/${tenantSlug}/menu/item/${item.id}`, { scroll: true })
      })
    }
  }, [tenant?.menu_engineering_enabled, addItem, router, tenantSlug, startTransition])
```

**Step 4: Verify the build**

Run: `npm run lint`
Expected: No new errors

**Step 5: Commit**

```bash
git add src/app/[tenant]/menu/menu-client.tsx
git commit -m "feat: wrap product detail navigation in useTransition for instant feedback"
```

---

### Task 2: Thread `pendingItemId` to `PrefetchingCard`

This task passes `pendingItemId` down through the existing prop chain so the tapped card can show a loading state.

**Files:**
- Modify: `src/components/customer/layouts/index.tsx:27` (add prop to interface)
- Modify: `src/components/customer/menu-grid.tsx` (accept + pass prop)
- Modify: `src/components/customer/menu-grid-grouped.tsx` (accept + pass prop)
- Modify: `src/components/customer/prefetching-card.tsx` (accept + render loading state)

**Step 1: Add `pendingItemId` to `MenuLayoutProps` in `layouts/index.tsx`**

Add to the `MenuLayoutProps` interface (after `hideCurrencySymbol?: boolean`):
```tsx
    pendingItemId?: string | null
```

The props are spread via `{...props}` so all layout variants will pass it through automatically.

**Step 2: Add `pendingItemId` to `MenuGrid` props and pass to `PrefetchingCard`**

In `src/components/customer/menu-grid.tsx`, add `pendingItemId?: string | null` to the props interface, destructure it, and pass it to `PrefetchingCard`:
```tsx
pendingItemId={pendingItemId}
```

**Step 3: Add `pendingItemId` to `MenuGridGrouped` props and pass to `PrefetchingCard`**

Same pattern as Step 2 in `src/components/customer/menu-grid-grouped.tsx`.

**Step 4: Add loading overlay to `PrefetchingCard`**

In `src/components/customer/prefetching-card.tsx`, add `pendingItemId?: string | null` to props, then apply a loading state:

```tsx
export const PrefetchingCard = memo(function PrefetchingCard({ item, onSelect, tenantSlug, branding, template = 'classic', menuEngineeringEnabled, hideCurrencySymbol, pendingItemId }: PrefetchingCardProps) {
  const router = useRouter()
  const hasPrefetched = useRef(false)
  const isPending = pendingItemId === item.id

  // ... existing prefetch logic ...

  return (
    <div
      onMouseEnter={handleInteraction}
      style={{ contentVisibility: 'auto' }}
      className={isPending ? 'opacity-50 pointer-events-none' : ''}
    >
      <CardTemplateRenderer
        template={template}
        item={item}
        onSelect={onSelect}
        branding={branding}
        menuEngineeringEnabled={menuEngineeringEnabled}
        hideCurrencySymbol={hideCurrencySymbol}
      />
    </div>
  )
})
```

**Step 5: Pass `pendingItemId` from `menu-client.tsx` to `MenuLayout`**

In `menu-client.tsx`, add `pendingItemId={pendingItemId}` to the `<MenuLayout>` JSX props.

**Step 6: Also pass through layouts that directly render cards**

Check each layout file (`layout-default.tsx`, `layout-sidebar.tsx`, `layout-magazine.tsx`, `layout-grid-focus.tsx`, `layout-list.tsx`, `layout-mosaic.tsx`) — they receive props via spread, so `pendingItemId` will arrive. But verify they pass it to `MenuGrid`/`MenuGridGrouped`/`PrefetchingCard`. Add `pendingItemId={pendingItemId}` where `MenuGrid` or `PrefetchingCard` is rendered.

**Step 7: Verify the build**

Run: `npm run lint`
Expected: No new errors

**Step 8: Commit**

```bash
git add src/components/customer/layouts/ src/components/customer/menu-grid.tsx src/components/customer/menu-grid-grouped.tsx src/components/customer/prefetching-card.tsx src/app/[tenant]/menu/menu-client.tsx
git commit -m "feat: show loading state on tapped card during navigation"
```

---

### Task 3: Enable mobile prefetching in `PrefetchingCard`

**Files:**
- Modify: `src/components/customer/prefetching-card.tsx`

**Step 1: Remove hover-only gate and add touch support**

Replace the current interaction handler and JSX:

```tsx
export const PrefetchingCard = memo(function PrefetchingCard({ item, onSelect, tenantSlug, branding, template = 'classic', menuEngineeringEnabled, hideCurrencySymbol, pendingItemId }: PrefetchingCardProps) {
  const router = useRouter()
  const hasPrefetched = useRef(false)
  const isPending = pendingItemId === item.id

  const triggerPrefetch = useCallback(() => {
    if (hasPrefetched.current) return
    router.prefetch(`/${tenantSlug}/menu/item/${item.id}`)
    hasPrefetched.current = true
  }, [tenantSlug, item.id, router])

  return (
    <div
      onMouseEnter={triggerPrefetch}
      onTouchStart={triggerPrefetch}
      style={{ contentVisibility: 'auto' }}
      className={isPending ? 'opacity-50 pointer-events-none' : ''}
    >
      <CardTemplateRenderer
        template={template}
        item={item}
        onSelect={onSelect}
        branding={branding}
        menuEngineeringEnabled={menuEngineeringEnabled}
        hideCurrencySymbol={hideCurrencySymbol}
      />
    </div>
  )
})
```

Key changes:
- Removed `window.matchMedia('(hover: hover)')` check
- Renamed to `triggerPrefetch` for clarity
- Added `onTouchStart` for mobile — fires before `onClick`, giving the prefetch a head start
- `hasPrefetched` ref prevents duplicate calls

**Step 2: Verify the build**

Run: `npm run lint`
Expected: No new errors

**Step 3: Commit**

```bash
git add src/components/customer/prefetching-card.tsx
git commit -m "feat: enable route prefetching on mobile via onTouchStart"
```

---

### Task 4: Final verification

**Step 1: Run full lint**

Run: `npm run lint`
Expected: PASS

**Step 2: Run tests**

Run: `npm run test`
Expected: Existing tests pass

**Step 3: Test manually in dev**

Run: `npm run dev`
Verify:
1. Click a menu item with customizations → card should dim immediately, skeleton should appear within ~100ms
2. On mobile (or responsive mode): touch a card → same instant feedback
3. Items without customizations still add to cart directly (no navigation)
