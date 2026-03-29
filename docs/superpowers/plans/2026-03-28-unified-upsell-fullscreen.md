# Unified Full-Screen Upsell System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 3 inconsistent upsell modals (PairSuggestionSheet, BundleUpsellModal, UpsellSuggestionModal) with a single unified full-screen component, refactor CheckoutUpsellModal to match, and fix navigation/UX bugs.

**Architecture:** New shared `UpsellFullScreenLayout` wrapper + `UpsellItemCard` component used by both `PostAddUpsellScreen` (replaces 3 modals) and refactored `CheckoutUpsellModal`. Two extracted hooks (`useBodyScrollLock`, `useImagePreload`) standardize cross-cutting behavior. The `useProductDetailModals` hook is simplified to replace 3 modal states with 1.

**Tech Stack:** React, TypeScript, Framer Motion, Next.js App Router, Lucide icons, existing analytics via `trackAnalyticsEventAction`

**Spec:** `docs/superpowers/specs/2026-03-28-unified-upsell-fullscreen-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/hooks/useBodyScrollLock.ts` | Lock/unlock body scroll on mount/unmount |
| Create | `src/hooks/useImagePreload.ts` | Preload first N image URLs on mount |
| Create | `src/components/customer/upsell-item-card.tsx` | Shared card: image, name, price, add button, checkmark |
| Create | `src/components/customer/upsell-full-screen-layout.tsx` | Shared full-screen wrapper: overlay, animation, escape key, header |
| Create | `src/components/customer/post-add-upsell-screen.tsx` | Combined post-add-to-cart screen (3 modes) |
| Create | `tests/unit/hooks/useBodyScrollLock.test.ts` | Hook tests |
| Create | `tests/unit/hooks/useImagePreload.test.ts` | Hook tests |
| Create | `tests/unit/components/post-add-upsell-screen.test.ts` | Mode selection logic tests |
| Modify | `src/components/customer/checkout-upsell-modal.tsx` | Refactor to use shared layout + card |
| Modify | `src/components/customer/product-detail-content.tsx` | Replace 3 modal triggers with PostAddUpsellScreen |
| Modify | `src/hooks/useProductDetailModals.ts` | Simplify: replace 3 states with 1 `isPostAddUpsellOpen` |
| Deprecate | `src/components/customer/pair-suggestion-sheet.tsx` | No longer imported |
| Deprecate | `src/components/customer/bundle-upsell-modal.tsx` | No longer imported |
| Deprecate | `src/components/customer/upsell-suggestion-modal.tsx` | No longer imported |

---

## Task 1: Create `useBodyScrollLock` Hook

**Files:**
- Create: `src/hooks/useBodyScrollLock.ts`
- Create: `tests/unit/hooks/useBodyScrollLock.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/hooks/useBodyScrollLock.test.ts`:

```typescript
import { renderHook } from '@testing-library/react'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'

describe('useBodyScrollLock', () => {
  beforeEach(() => {
    document.body.style.overflow = ''
  })

  it('sets body overflow to hidden when active', () => {
    renderHook(() => useBodyScrollLock(true))
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('does not set overflow when inactive', () => {
    renderHook(() => useBodyScrollLock(false))
    expect(document.body.style.overflow).toBe('')
  })

  it('restores original overflow on unmount', () => {
    document.body.style.overflow = 'auto'
    const { unmount } = renderHook(() => useBodyScrollLock(true))
    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.overflow).toBe('auto')
  })

  it('restores overflow when active changes to false', () => {
    const { rerender } = renderHook(
      ({ active }) => useBodyScrollLock(active),
      { initialProps: { active: true } }
    )
    expect(document.body.style.overflow).toBe('hidden')
    rerender({ active: false })
    expect(document.body.style.overflow).toBe('')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- --testPathPattern="useBodyScrollLock"`
Expected: FAIL — cannot find module `@/hooks/useBodyScrollLock`

- [ ] **Step 3: Write the implementation**

Create `src/hooks/useBodyScrollLock.ts`:

```typescript
import { useEffect, useRef } from 'react'

export function useBodyScrollLock(active: boolean) {
  const originalOverflowRef = useRef('')

  useEffect(() => {
    if (!active) return

    originalOverflowRef.current = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = originalOverflowRef.current
    }
  }, [active])
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- --testPathPattern="useBodyScrollLock"`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useBodyScrollLock.ts tests/unit/hooks/useBodyScrollLock.test.ts
git commit -m "feat: add useBodyScrollLock hook for unified upsell system"
```

---

## Task 2: Create `useImagePreload` Hook

**Files:**
- Create: `src/hooks/useImagePreload.ts`
- Create: `tests/unit/hooks/useImagePreload.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/hooks/useImagePreload.test.ts`:

```typescript
import { renderHook } from '@testing-library/react'
import { useImagePreload } from '@/hooks/useImagePreload'

describe('useImagePreload', () => {
  let createElementSpy: jest.SpyInstance

  beforeEach(() => {
    createElementSpy = jest.spyOn(document, 'createElement')
  })

  afterEach(() => {
    createElementSpy.mockRestore()
  })

  it('creates Image elements for the first N urls', () => {
    const urls = [
      'https://example.com/a.jpg',
      'https://example.com/b.jpg',
      'https://example.com/c.jpg',
      'https://example.com/d.jpg',
    ]
    renderHook(() => useImagePreload(urls, 2))

    const imgCalls = createElementSpy.mock.results
      .filter((r: { type: string; value: HTMLElement }) => r.type === 'return' && r.value?.tagName === 'IMG')

    // We only preload 2 of 4
    expect(imgCalls.length).toBe(2)
  })

  it('does nothing with empty urls', () => {
    renderHook(() => useImagePreload([], 6))

    const imgCalls = createElementSpy.mock.results
      .filter((r: { type: string; value: HTMLElement }) => r.type === 'return' && r.value?.tagName === 'IMG')

    expect(imgCalls.length).toBe(0)
  })

  it('defaults to 6 images when count not specified', () => {
    const urls = Array.from({ length: 10 }, (_, i) => `https://example.com/${i}.jpg`)
    renderHook(() => useImagePreload(urls))

    const imgCalls = createElementSpy.mock.results
      .filter((r: { type: string; value: HTMLElement }) => r.type === 'return' && r.value?.tagName === 'IMG')

    expect(imgCalls.length).toBe(6)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --testPathPattern="useImagePreload"`
Expected: FAIL — cannot find module `@/hooks/useImagePreload`

- [ ] **Step 3: Write the implementation**

Create `src/hooks/useImagePreload.ts`:

```typescript
import { useEffect } from 'react'

export function useImagePreload(urls: string[], count = 6) {
  useEffect(() => {
    if (urls.length === 0) return

    const toPreload = urls.slice(0, count)
    toPreload.forEach((url) => {
      const img = document.createElement('img')
      img.src = url
    })
  }, [urls, count])
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- --testPathPattern="useImagePreload"`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useImagePreload.ts tests/unit/hooks/useImagePreload.test.ts
git commit -m "feat: add useImagePreload hook for unified upsell system"
```

---

## Task 3: Create `UpsellItemCard` Component

**Files:**
- Create: `src/components/customer/upsell-item-card.tsx`

This is the shared card used by both PostAddUpsellScreen and CheckoutUpsellModal.

- [ ] **Step 1: Create the component**

Create `src/components/customer/upsell-item-card.tsx`:

```tsx
'use client'

import { memo, useState, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { OptimizedImage } from '@/components/shared/optimized-image'
import { formatPrice } from '@/lib/cart-utils'
import type { MenuItem } from '@/types/database'

interface UpsellItemCardProps {
  item: MenuItem
  onAdd: (item: MenuItem) => void
  hideCurrencySymbol?: boolean
  index: number
}

const cardVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { type: 'tween', duration: 0.15 } },
}

export const UpsellItemCard = memo(function UpsellItemCard({
  item,
  onAdd,
  hideCurrencySymbol,
  index,
}: UpsellItemCardProps) {
  const [isAdded, setIsAdded] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleAdd = useCallback(() => {
    if (isAdded) return
    onAdd(item)
    setIsAdded(true)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setIsAdded(false), 1200)
  }, [item, onAdd, isAdded])

  const displayPrice = item.discounted_price ?? item.price

  return (
    <motion.button
      variants={cardVariants}
      onClick={handleAdd}
      className="flex flex-col overflow-hidden rounded-xl bg-white shadow-sm border border-gray-100 text-left transition-shadow hover:shadow-md"
      type="button"
      aria-label={isAdded ? `${item.name} added` : `Add ${item.name}`}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-gray-100">
        {item.image_url ? (
          <OptimizedImage
            src={item.image_url}
            alt={item.name}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 22vw"
            loading={index < 4 ? 'eager' : 'lazy'}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-gray-300">
            No image
          </div>
        )}

        {/* Added overlay */}
        {isAdded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 flex flex-col items-center justify-center bg-black/50"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', damping: 15, stiffness: 300 }}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500"
            >
              <Check className="h-5 w-5 text-white" strokeWidth={3} />
            </motion.div>
            <span className="mt-1.5 text-xs font-semibold text-white">Added!</span>
          </motion.div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-0.5 p-2.5">
        <span className="line-clamp-2 text-sm font-medium text-gray-900">
          {item.name}
        </span>
        <span className="text-sm font-semibold text-gray-700">
          {formatPrice(displayPrice, { hideCurrencySymbol })}
        </span>
      </div>
    </motion.button>
  )
})
```

- [ ] **Step 2: Verify no lint errors**

Run: `npx eslint src/components/customer/upsell-item-card.tsx --no-error-on-unmatched-pattern`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/customer/upsell-item-card.tsx
git commit -m "feat: add shared UpsellItemCard component"
```

---

## Task 4: Create `UpsellFullScreenLayout` Component

**Files:**
- Create: `src/components/customer/upsell-full-screen-layout.tsx`

This is the shared full-screen wrapper with overlay, animations, scroll lock, escape key, and header.

- [ ] **Step 1: Create the component**

Create `src/components/customer/upsell-full-screen-layout.tsx`:

```tsx
'use client'

import { useEffect, useCallback, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, X } from 'lucide-react'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'

interface UpsellFullScreenLayoutProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
}

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.15 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
}

const contentVariants = {
  hidden: { y: '100%' },
  visible: {
    y: 0,
    transition: { type: 'spring', damping: 28, stiffness: 350 },
  },
  exit: {
    y: '100%',
    transition: { type: 'tween', duration: 0.2 },
  },
}

export function UpsellFullScreenLayout({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: UpsellFullScreenLayoutProps) {
  useBodyScrollLock(open)

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose]
  )

  useEffect(() => {
    if (!open) return
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [open, handleEscape])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex flex-col bg-white"
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <motion.div
            className="flex h-full flex-col"
            variants={contentVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <button
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
                aria-label="Go back"
                type="button"
              >
                <ArrowLeft className="h-5 w-5 text-gray-700" />
              </button>
              <button
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
                aria-label="Close"
                type="button"
              >
                <X className="h-5 w-5 text-gray-700" />
              </button>
            </div>

            {/* Title area */}
            <div className="px-4 pt-4 pb-2">
              <h2 className="text-xl font-bold text-gray-900">{title}</h2>
              {subtitle && (
                <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>
              )}
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              {children}
            </div>

            {/* Sticky footer */}
            {footer && (
              <div className="border-t border-gray-100 px-4 py-3">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
```

- [ ] **Step 2: Verify no lint errors**

Run: `npx eslint src/components/customer/upsell-full-screen-layout.tsx --no-error-on-unmatched-pattern`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/customer/upsell-full-screen-layout.tsx
git commit -m "feat: add shared UpsellFullScreenLayout wrapper component"
```

---

## Task 5: Create `PostAddUpsellScreen` Component

**Files:**
- Create: `src/components/customer/post-add-upsell-screen.tsx`
- Create: `tests/unit/components/post-add-upsell-screen.test.ts`

- [ ] **Step 1: Write the failing test for mode selection logic**

Create `tests/unit/components/post-add-upsell-screen.test.ts`:

```typescript
import { getUpsellMode } from '@/components/customer/post-add-upsell-screen'
import { createTestMenuItem } from '../fixtures/menu-item.fixture'
import { createTestBundleWithSlots } from '../fixtures/bundle.fixture'

describe('getUpsellMode', () => {
  const items = [createTestMenuItem(), createTestMenuItem({ id: 'item-2' })]
  const bundle = createTestBundleWithSlots()

  it('returns "pairs_only" when suggestions exist but no bundle', () => {
    expect(getUpsellMode(items, null)).toBe('pairs_only')
  })

  it('returns "bundle_only" when bundle exists but no suggestions', () => {
    expect(getUpsellMode([], bundle)).toBe('bundle_only')
  })

  it('returns "pairs_and_bundle" when both exist', () => {
    expect(getUpsellMode(items, bundle)).toBe('pairs_and_bundle')
  })

  it('returns null when neither exists', () => {
    expect(getUpsellMode([], null)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --testPathPattern="post-add-upsell-screen"`
Expected: FAIL — cannot find module

- [ ] **Step 3: Create the component**

Create `src/components/customer/post-add-upsell-screen.tsx`:

```tsx
'use client'

import { memo, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Package, Sparkles } from 'lucide-react'
import { UpsellFullScreenLayout } from '@/components/customer/upsell-full-screen-layout'
import { UpsellItemCard } from '@/components/customer/upsell-item-card'
import { useImagePreload } from '@/hooks/useImagePreload'
import { formatPrice } from '@/lib/cart-utils'
import { trackAnalyticsEventAction } from '@/app/actions/analytics'
import type { MenuItem, BundleWithSlots } from '@/types/database'

export type UpsellMode = 'pairs_only' | 'bundle_only' | 'pairs_and_bundle'

export function getUpsellMode(
  suggestions: MenuItem[],
  matchingBundle: BundleWithSlots | null
): UpsellMode | null {
  const hasSuggestions = suggestions.length > 0
  const hasBundle = matchingBundle !== null

  if (hasSuggestions && hasBundle) return 'pairs_and_bundle'
  if (hasSuggestions) return 'pairs_only'
  if (hasBundle) return 'bundle_only'
  return null
}

interface PostAddUpsellScreenProps {
  open: boolean
  onClose: () => void
  onAddItem: (item: MenuItem) => void
  onAcceptBundle: (bundle: BundleWithSlots) => void
  suggestions: MenuItem[]
  matchingBundle: BundleWithSlots | null
  triggerItemName: string
  tenantId: string
  sourceItemId: string
  hideCurrencySymbol?: boolean
}

const gridVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.03 },
  },
}

export const PostAddUpsellScreen = memo(function PostAddUpsellScreen({
  open,
  onClose,
  onAddItem,
  onAcceptBundle,
  suggestions,
  matchingBundle,
  triggerItemName,
  tenantId,
  sourceItemId,
  hideCurrencySymbol,
}: PostAddUpsellScreenProps) {
  const shownTrackedRef = useRef(false)
  const addedCountRef = useRef(0)

  const mode = getUpsellMode(suggestions, matchingBundle)
  const imageUrls = suggestions.map((s) => s.image_url).filter(Boolean)
  useImagePreload(imageUrls)

  // Track upsell_shown once per open
  if (open && !shownTrackedRef.current && mode) {
    shownTrackedRef.current = true
    trackAnalyticsEventAction(tenantId, 'upsell_shown', {
      source: 'post_add',
      mode,
      itemCount: suggestions.length,
      sourceItemId,
      bundleId: matchingBundle?.id ?? null,
    })
  }

  // Reset tracking when closed
  if (!open && shownTrackedRef.current) {
    shownTrackedRef.current = false
    addedCountRef.current = 0
  }

  const handleAddItem = useCallback(
    (item: MenuItem) => {
      addedCountRef.current += 1
      onAddItem(item)
      trackAnalyticsEventAction(tenantId, 'upsell_clicked', {
        source: 'post_add',
        mode,
        itemId: item.id,
        itemName: item.name,
        price: item.discounted_price ?? item.price,
        sourceItemId,
      })
    },
    [onAddItem, tenantId, mode, sourceItemId]
  )

  const handleClose = useCallback(() => {
    trackAnalyticsEventAction(tenantId, 'upsell_dismissed', {
      source: 'post_add',
      mode,
      suggestionsShown: suggestions.length,
      itemsAdded: addedCountRef.current,
      sourceItemId,
    })
    onClose()
  }, [onClose, tenantId, mode, suggestions.length, sourceItemId])

  const handleAcceptBundle = useCallback(() => {
    if (!matchingBundle) return
    trackAnalyticsEventAction(tenantId, 'upsell_clicked', {
      source: 'post_add',
      mode,
      bundleId: matchingBundle.id,
      bundleName: matchingBundle.name,
      sourceItemId,
    })
    onAcceptBundle(matchingBundle)
  }, [matchingBundle, onAcceptBundle, tenantId, mode, sourceItemId])

  if (!mode) return null

  const title =
    mode === 'bundle_only'
      ? 'Bundle Deal Available!'
      : `Perfect with ${triggerItemName}`
  const subtitle =
    mode === 'bundle_only'
      ? 'Save more with a combo'
      : 'Complete your meal'

  return (
    <UpsellFullScreenLayout
      open={open}
      onClose={handleClose}
      title={title}
      subtitle={subtitle}
      footer={
        <button
          onClick={handleClose}
          className="w-full rounded-xl bg-gray-900 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-800"
          type="button"
        >
          Continue
        </button>
      }
    >
      {/* Pairs grid - shown in pairs_only and pairs_and_bundle modes */}
      {(mode === 'pairs_only' || mode === 'pairs_and_bundle') && (
        <motion.div
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
          variants={gridVariants}
          initial="hidden"
          animate="visible"
        >
          {suggestions.map((item, index) => (
            <UpsellItemCard
              key={item.id}
              item={item}
              onAdd={handleAddItem}
              hideCurrencySymbol={hideCurrencySymbol}
              index={index}
            />
          ))}
        </motion.div>
      )}

      {/* Divider - shown only in pairs_and_bundle mode */}
      {mode === 'pairs_and_bundle' && (
        <div className="my-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-gray-200" />
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
            or make it a bundle
          </span>
          <div className="h-px flex-1 bg-gray-200" />
        </div>
      )}

      {/* Bundle card - shown in bundle_only and pairs_and_bundle modes */}
      {matchingBundle && (mode === 'bundle_only' || mode === 'pairs_and_bundle') && (
        <BundlePromoCard
          bundle={matchingBundle}
          onAccept={handleAcceptBundle}
          hideCurrencySymbol={hideCurrencySymbol}
          isHero={mode === 'bundle_only'}
        />
      )}
    </UpsellFullScreenLayout>
  )
})

// --- Bundle promo card (internal) ---

interface BundlePromoCardProps {
  bundle: BundleWithSlots
  onAccept: () => void
  hideCurrencySymbol?: boolean
  isHero: boolean
}

function BundlePromoCard({ bundle, onAccept, hideCurrencySymbol, isHero }: BundlePromoCardProps) {
  const savings =
    bundle.pricing_type === 'discount' && bundle.discount_percent
      ? `Save ${bundle.discount_percent}%`
      : bundle.pricing_type === 'fixed' && bundle.fixed_price
        ? `Only ${formatPrice(bundle.fixed_price, { hideCurrencySymbol })}`
        : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className={`overflow-hidden rounded-2xl border border-gray-100 bg-gradient-to-br from-gray-50 to-white shadow-sm ${
        isHero ? 'mx-auto max-w-md' : ''
      }`}
    >
      {/* Bundle image for hero mode */}
      {isHero && bundle.image_url && (
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-gray-100">
          <img
            src={bundle.image_url}
            alt={bundle.name}
            className="h-full w-full object-cover"
          />
        </div>
      )}

      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50">
            <Package className="h-5 w-5 text-amber-600" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-gray-900">{bundle.name}</h3>
              <Sparkles className="h-4 w-4 text-amber-500" />
            </div>
            {bundle.description && (
              <p className="mt-0.5 text-sm text-gray-500">{bundle.description}</p>
            )}
          </div>
        </div>

        {/* Slot pills */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {bundle.slots.map((slot) => (
            <span
              key={slot.id}
              className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600"
            >
              {slot.pick_count}x {slot.name}
            </span>
          ))}
        </div>

        {/* Savings + CTA */}
        <div className="mt-4 flex items-center gap-3">
          {savings && (
            <span className="rounded-full bg-green-50 px-3 py-1 text-sm font-semibold text-green-700">
              {savings}
            </span>
          )}
          <button
            onClick={onAccept}
            className="ml-auto rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-800"
            type="button"
          >
            Upgrade to Bundle
          </button>
        </div>
      </div>
    </motion.div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- --testPathPattern="post-add-upsell-screen"`
Expected: PASS (4 tests for getUpsellMode)

- [ ] **Step 5: Run lint**

Run: `npx eslint src/components/customer/post-add-upsell-screen.tsx --no-error-on-unmatched-pattern`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/components/customer/post-add-upsell-screen.tsx tests/unit/components/post-add-upsell-screen.test.ts
git commit -m "feat: add PostAddUpsellScreen with 3 adaptive layout modes"
```

---

## Task 6: Refactor `CheckoutUpsellModal` to Use Shared Components

**Files:**
- Modify: `src/components/customer/checkout-upsell-modal.tsx`

- [ ] **Step 1: Read the current file**

Run: Read `src/components/customer/checkout-upsell-modal.tsx` fully to confirm current implementation matches exploration.

- [ ] **Step 2: Refactor the component**

Replace the internal card rendering, scroll locking, and animation code with the shared components. Keep the existing data-fetching logic (`getCheckoutUpsellsAction`), preview mode support, and cart-total display intact.

The refactored component should:
1. Replace the inline bottom-sheet animation with `UpsellFullScreenLayout`
2. Replace the inline card JSX with `UpsellItemCard`
3. Use `useImagePreload` instead of inline preloading
4. Keep `useCart().addItem()` for adding items (checkout upsell adds directly to cart unlike post-add which uses a callback)
5. Keep the preview mode (`previewSuggestions`, `previewColors`, `zIndexClass`) logic
6. Keep the cart total display in the footer
7. Keep the item-removal-on-add behavior (items disappear from suggestions after being added)

Key changes in the refactored version:
- Import and use `UpsellFullScreenLayout` as the wrapper
- Import and use `UpsellItemCard` for each suggestion
- Import and use `useImagePreload` for image preloading
- Remove all inline `motion.div` wrappers, `AnimatePresence`, backdrop variants
- Remove inline body scroll lock code
- Add escape key support (handled by `UpsellFullScreenLayout`)
- Keep `SkeletonCard` for loading state
- Keep analytics tracking: `upsell_shown`, `upsell_clicked`, `upsell_dismissed` with `source: 'checkout_modal'`

The footer should contain:
- Cart total display (existing)
- Primary button: "Continue to Checkout"
- Ghost link: "No thanks, checkout"

Note: The `UpsellItemCard` needs a slight adaptation here because checkout upsell removes items from the list after adding. Wrap `onAdd` to handle this: call `addItem()`, show toast, then filter the item out of local `suggestions` state. The card's checkmark animation (1200ms) plays before the item is removed.

- [ ] **Step 3: Verify no lint errors**

Run: `npx eslint src/components/customer/checkout-upsell-modal.tsx --no-error-on-unmatched-pattern`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/components/customer/checkout-upsell-modal.tsx
git commit -m "refactor: checkout upsell modal to use shared full-screen layout and card"
```

---

## Task 7: Update `useProductDetailModals` Hook

**Files:**
- Modify: `src/hooks/useProductDetailModals.ts`

- [ ] **Step 1: Read the current file**

File is at `src/hooks/useProductDetailModals.ts` (already read — 117 lines).

- [ ] **Step 2: Simplify modal states**

Replace three separate modal states:
```typescript
// REMOVE these three:
const [isUpsellModalOpen, setIsUpsellModalOpen] = useState(false)
const [isPairSheetOpen, setIsPairSheetOpen] = useState(false)
// And bundleUpsell (state-driven open):
const [bundleUpsell, setBundleUpsell] = useState<BundleWithSlots | null>(null)
```

With one unified state:
```typescript
// ADD this one:
const [isPostAddUpsellOpen, setIsPostAddUpsellOpen] = useState(false)
```

Keep `bundleForCustomization` (that's for the BundleWizard, a separate flow).

Replace `handleUpsellClose` with a new `handlePostAddUpsellClose`:
```typescript
const handlePostAddUpsellClose = useCallback(() => {
  setIsPostAddUpsellOpen(false)
  if (buyNowIntentRef.current) {
    buyNowIntentRef.current = false
    router.push(`/${tenantSlug}/cart`)
  } else {
    router.back()
  }
}, [router, tenantSlug])
```

Update the return object:
- Remove: `isUpsellModalOpen`, `setIsUpsellModalOpen`, `isPairSheetOpen`, `setIsPairSheetOpen`, `bundleUpsell`, `setBundleUpsell`, `handleUpsellClose`
- Add: `isPostAddUpsellOpen`, `setIsPostAddUpsellOpen`, `handlePostAddUpsellClose`
- Keep: everything else (image modal, preview states, upgrade screen, bundleForCustomization, buyNowIntentRef, navigateAfterBuyNow)

- [ ] **Step 3: Verify no lint errors**

Run: `npx eslint src/hooks/useProductDetailModals.ts --no-error-on-unmatched-pattern`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useProductDetailModals.ts
git commit -m "refactor: simplify useProductDetailModals to single post-add upsell state"
```

---

## Task 8: Update `product-detail-content.tsx` to Use PostAddUpsellScreen

**Files:**
- Modify: `src/components/customer/product-detail-content.tsx`

This is the integration task — wiring the new component into the existing page.

- [ ] **Step 1: Read the current file**

Read `src/components/customer/product-detail-content.tsx` fully, focusing on:
- Dynamic imports (lines 24-49)
- `handleAddToCart` (lines 528-570)
- `handleBuyNow` (lines 572-575)
- Modal JSX rendering (lines 928-1030+)

- [ ] **Step 2: Update dynamic imports**

Remove dynamic imports for:
- `UpsellSuggestionModal` (lines 30-33)
- `BundleUpsellModal` (lines 38-41)
- `PairSuggestionSheet` (lines 46-49)

Add dynamic import for:
```typescript
const PostAddUpsellScreen = dynamic(
  () => import('@/components/customer/post-add-upsell-screen').then(m => ({ default: m.PostAddUpsellScreen })),
  { ssr: false }
)
```

Keep dynamic imports for: `InlineUpgradeSection`, `CheckoutUpsellModal`, `BundleWizard`.

- [ ] **Step 3: Update destructured hook values**

From `useProductDetailModals()`, replace destructured values:
- Remove: `isUpsellModalOpen`, `setIsUpsellModalOpen`, `isPairSheetOpen`, `setIsPairSheetOpen`, `bundleUpsell`, `setBundleUpsell`, `handleUpsellClose`
- Add: `isPostAddUpsellOpen`, `setIsPostAddUpsellOpen`, `handlePostAddUpsellClose`

- [ ] **Step 4: Update `handleAddToCart` priority chain**

Replace the current priority chain (lines 528-570) with unified logic:

```typescript
const handleAddToCart = useCallback(
  (skipNavigation = false) => {
    // ... existing variation validation (lines 529-538) stays the same ...

    // Add the item to cart
    addItem(item, selectedVariation, selectedAddons, quantity, specialInstructions)

    // Check if any upsell data exists
    const hasSuggestions = menuEngineeringEnabled && complementaryUpsells.length > 0
    const hasBundle = bundlesEnabled && matchingBundle !== null

    if (hasSuggestions || hasBundle) {
      // Open unified upsell screen
      setIsPostAddUpsellOpen(true)
      return
    }

    // No upsells — navigate directly
    if (buyNowIntentRef.current) {
      buyNowIntentRef.current = false
      router.push(`/${tenantSlug}/cart`)
    } else if (!skipNavigation) {
      router.back()
    }
  },
  [/* existing deps + setIsPostAddUpsellOpen */]
)
```

Note: `matchingBundle` is the first bundle from `upsellBundles` whose slot categories match `item.category_id`. This matching logic already exists in the current code (around line 548-553). Extract it to a `useMemo`:

```typescript
const matchingBundle = useMemo(() => {
  if (!bundlesEnabled || !upsellBundles?.length) return null
  return upsellBundles.find((b) =>
    b.slots.some((s) => s.category_id === item.category_id)
  ) ?? null
}, [bundlesEnabled, upsellBundles, item.category_id])
```

- [ ] **Step 5: Update `handleBuyNow`**

No changes needed — it already sets `buyNowIntentRef.current = true` and calls `handleAddToCart(false)`. The new `handleAddToCart` handles the rest.

- [ ] **Step 6: Replace modal JSX**

Remove all JSX for:
- `PairSuggestionSheet` (lines 956-978)
- `UpsellSuggestionModal` (lines 981-991)
- `BundleUpsellModal` (lines 994-1014)

Replace with single `PostAddUpsellScreen`:

```tsx
<PostAddUpsellScreen
  open={isPostAddUpsellOpen}
  onClose={handlePostAddUpsellClose}
  onAddItem={(upsellItem) => {
    addItem(
      upsellItem,
      undefined,
      [],
      1,
      undefined,
      'suggestion',
      item.id
    )
  }}
  onAcceptBundle={(bundle) => {
    setIsPostAddUpsellOpen(false)
    setBundleForCustomization(bundle)
  }}
  suggestions={complementaryUpsells ?? []}
  matchingBundle={matchingBundle}
  triggerItemName={item.name}
  tenantId={tenantId}
  sourceItemId={item.id}
  hideCurrencySymbol={hideCurrencySymbol}
/>
```

Keep `BundleWizard` JSX as-is (it opens from `bundleForCustomization` state set by `onAcceptBundle` above).

- [ ] **Step 7: Update eager module preloads useEffect**

In the useEffect that preloads modules (lines 308-315), replace the 3 removed imports:

```typescript
useEffect(() => {
  import('./inline-upgrade-section')
  import('./post-add-upsell-screen')
  import('@/components/customer/bundle-wizard')
  import('@/components/customer/checkout-upsell-modal')
}, [])
```

- [ ] **Step 8: Verify no lint errors**

Run: `npx eslint src/components/customer/product-detail-content.tsx --no-error-on-unmatched-pattern`
Expected: No errors

- [ ] **Step 9: Commit**

```bash
git add src/components/customer/product-detail-content.tsx
git commit -m "feat: integrate PostAddUpsellScreen replacing 3 separate upsell modals"
```

---

## Task 9: Remove Deprecated Components

**Files:**
- Delete: `src/components/customer/pair-suggestion-sheet.tsx`
- Delete: `src/components/customer/bundle-upsell-modal.tsx`
- Delete: `src/components/customer/upsell-suggestion-modal.tsx`

- [ ] **Step 1: Verify no remaining imports**

Run these grep commands to confirm no other file imports the deprecated components:

```bash
grep -r "pair-suggestion-sheet" src/ --include="*.tsx" --include="*.ts" -l
grep -r "bundle-upsell-modal" src/ --include="*.tsx" --include="*.ts" -l
grep -r "upsell-suggestion-modal" src/ --include="*.tsx" --include="*.ts" -l
```

Expected: No results (or only the files themselves). If any other file still imports them, update that file first.

- [ ] **Step 2: Delete the files**

```bash
rm src/components/customer/pair-suggestion-sheet.tsx
rm src/components/customer/bundle-upsell-modal.tsx
rm src/components/customer/upsell-suggestion-modal.tsx
```

- [ ] **Step 3: Run lint on full project**

Run: `npm run lint`
Expected: No new errors introduced

- [ ] **Step 4: Commit**

```bash
git add -u src/components/customer/pair-suggestion-sheet.tsx src/components/customer/bundle-upsell-modal.tsx src/components/customer/upsell-suggestion-modal.tsx
git commit -m "chore: remove deprecated upsell modals replaced by PostAddUpsellScreen"
```

---

## Task 10: Final Verification

- [ ] **Step 1: Run all tests**

Run: `npm run test`
Expected: All tests pass, no regressions.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: No errors.

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds. No TypeScript errors related to removed components.

- [ ] **Step 4: Manual smoke test checklist**

Start dev server (`npm run dev`) and verify with a tenant that has `menu_engineering_enabled` and `bundles_enabled`:

1. Open a product detail page that has complementary pair suggestions
2. Click "Add to Cart" — verify full-screen upsell appears with pairs grid
3. Add an item from the grid — verify green checkmark overlay
4. Click "Continue" — verify smooth exit animation then navigation back
5. Open a product whose category matches a bundle
6. Click "Add to Cart" — verify full-screen with pairs + bundle card (or bundle-only if no pairs)
7. Click "Upgrade to Bundle" — verify BundleWizard opens
8. Complete bundle wizard — verify it adds to cart correctly
9. Go to cart page and click "Proceed to Checkout" — verify checkout upsell is full-screen
10. Click "Buy Now" on a product — verify after dismissing upsell, you land on cart page (not back)
11. Press Escape while upsell is open — verify it closes
12. Verify body is not scroll-locked after closing any upsell

- [ ] **Step 5: Commit any fixes from smoke test**

If any issues found, fix and commit with descriptive message.
