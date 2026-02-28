# Product Detail Page — Instant Navigation

## Problem
Clicking a menu item card feels unresponsive. `router.push()` triggers a full server render with no visual feedback until the server finishes fetching data.

## Solution: Approach A — useTransition + Parallel Fetch + Mobile Prefetch

### Changes

#### 1. `src/app/[tenant]/menu/menu-client.tsx`
- Add `useTransition` from React
- Wrap `router.push()` in `startTransition()` — triggers `loading.tsx` skeleton immediately
- Track `isPending` + `pendingItemId` to show visual feedback on the tapped card
- Pass pending state to card components

#### 2. `src/app/[tenant]/menu/item/[itemId]/page.tsx`
- Parallelize tenant + item fetch with `Promise.all` (currently sequential)
- Validate tenant ownership after both resolve
- Saves ~50-150ms per navigation

#### 3. `src/components/customer/prefetching-card.tsx`
- Remove hover-only gate (`window.matchMedia('(hover: hover)')`)
- Add `onTouchStart` for mobile prefetch
- Keep `hasPrefetched` dedup ref

#### 4. Visual feedback
- Tapped card gets reduced opacity during pending state
- Driven by `isPending` + `pendingItemId` from parent

### What stays the same
- SSR/ISR architecture unchanged
- `loading.tsx` skeleton unchanged
- No new files or dependencies
- Card template components unchanged
