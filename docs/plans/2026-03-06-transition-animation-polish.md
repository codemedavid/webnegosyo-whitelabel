# Transition & Animation Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate jarring delays and sudden pop-ins across the upsell flow by adding smooth slide-up/slide-down animations, eager bundle preloading, and image prefetching.

**Architecture:** Per-component Framer Motion animation fixes. Each full-screen overlay (InlineUpgradeSection, PairSuggestionSheet, CheckoutUpsellModal) gets consistent slide-up/slide-down entry/exit animations. Modal JS bundles are eagerly preloaded on product detail mount to eliminate first-open delay.

**Tech Stack:** Framer Motion (already in use), Next.js dynamic imports, Cloudinary image transforms

---

### Task 1: Eager Bundle Preloading in ProductDetailContent

**Files:**
- Modify: `src/components/customer/product-detail-content.tsx`

**Step 1: Add eager preload useEffect**

After the existing dynamic imports (lines 24-49), add a `useEffect` inside the `ProductDetailContent` component that eagerly imports all modal bundles on mount. Find the component function body (around line 95) and add after the existing hooks:

```tsx
// Eager-preload upsell modal bundles so they're ready when triggered
useEffect(() => {
    import('./inline-upgrade-section')
    import('./pair-suggestion-sheet')
    import('./upsell-suggestion-modal')
    import('@/components/customer/bundle-upsell-modal')
    import('@/components/customer/bundle-customization-modal')
    import('@/components/customer/checkout-upsell-modal')
}, [])
```

Add this inside `ProductDetailContent` after the `useProductDetailModals` hook call (around line 290).

**Step 2: Verify the build compiles**

Run: `npm run lint`
Expected: No new errors

**Step 3: Commit**

```bash
git add src/components/customer/product-detail-content.tsx
git commit -m "perf: eager-preload upsell modal bundles on product detail mount"
```

---

### Task 2: InlineUpgradeSection — Slide-up Entry/Exit Animation

**Files:**
- Modify: `src/components/customer/inline-upgrade-section.tsx`

**Step 1: Add Framer Motion imports and animation variants**

Replace the current imports at the top of the file:

```tsx
'use client'

import { memo, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { OptimizedImage } from '@/components/shared/optimized-image'
import { trackAnalyticsEventAction } from '@/app/actions/analytics'
import { formatPrice } from '@/lib/cart-utils'
import type { MenuItem, UpgradeUpsell } from '@/types/database'
import type { BundleWithItems } from '@/lib/bundles-service'

const backdropVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.15 } },
    exit: { opacity: 0, transition: { duration: 0.15 } },
}

const sheetVariants = {
    hidden: { y: '100%' },
    visible: {
        y: 0,
        transition: { type: 'spring' as const, damping: 28, stiffness: 350 },
    },
    exit: {
        y: '100%',
        transition: { type: 'tween' as const, duration: 0.2, ease: 'easeOut' },
    },
}
```

**Step 2: Wrap the return JSX in AnimatePresence + motion.div**

Replace the current return block (the `<div className="fixed inset-0 z-50 flex flex-col bg-white">` and everything inside it) with:

```tsx
return (
    <AnimatePresence>
        {open && (upgrades.length > 0 || bundles.length > 0) && (
            <>
                {/* Backdrop */}
                <motion.div
                    className="fixed inset-0 z-50 bg-black/50"
                    variants={backdropVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                />

                {/* Sheet */}
                <motion.div
                    className="fixed inset-0 z-50 flex flex-col bg-white"
                    variants={sheetVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                >
                    {/* Header area */}
                    <div className="flex-shrink-0 px-6 pt-8 pb-2">
                        <p className="text-sm text-gray-400 font-medium">{sourceItem.name}</p>
                        <h1 className="text-2xl font-bold text-gray-900 mt-1 leading-tight">{header}</h1>
                    </div>

                    {/* Cards area */}
                    <div className="flex-1 flex items-center justify-center px-6">
                        <div className="grid grid-cols-2 gap-4 w-full max-w-lg">
                            {/* Ala Carte card */}
                            <button
                                onClick={handleDismiss}
                                className="rounded-xl border border-gray-200 bg-white p-4 flex flex-col items-center text-center transition-all active:scale-[0.97] active:bg-gray-50 shadow-sm"
                            >
                                <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-gray-50">
                                    {sourceItem.image_url ? (
                                        <OptimizedImage src={sourceItem.image_url} alt={sourceLabel} fill className="object-contain p-2" sizes="40vw" />
                                    ) : (
                                        <div className="flex h-full w-full items-center justify-center text-gray-300 text-4xl">🍽</div>
                                    )}
                                </div>
                                <p className="text-sm font-semibold text-gray-900 mt-3">No, {sourceLabel.toLowerCase()} only</p>
                                <p className="text-sm text-gray-500 mt-0.5">
                                    {formatPrice(sourcePrice, { hideCurrencySymbol })}
                                </p>
                            </button>

                            {/* Upgrade/Meal card */}
                            <button
                                onClick={handleUpgrade}
                                className="rounded-xl border border-gray-200 bg-white p-4 flex flex-col items-center text-center transition-all active:scale-[0.97] active:bg-gray-50 shadow-sm"
                            >
                                <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-gray-50">
                                    {targetImage ? (
                                        <OptimizedImage src={targetImage} alt={targetLabel} fill className="object-contain p-2" sizes="40vw" />
                                    ) : (
                                        <div className="flex h-full w-full items-center justify-center text-gray-300 text-4xl">🍽</div>
                                    )}
                                </div>
                                <p className="text-sm font-semibold text-gray-900 mt-3">Yes, {targetLabel.toLowerCase()}</p>
                            </button>
                        </div>
                    </div>

                    {/* Cancel button at bottom */}
                    <div className="flex-shrink-0 px-6 pb-8 pt-4">
                        <button
                            onClick={handleDismiss}
                            className="w-full max-w-md mx-auto block h-12 rounded-lg border border-gray-300 text-sm font-medium text-gray-500 transition-colors active:bg-gray-100"
                        >
                            Cancel
                        </button>
                    </div>
                </motion.div>
            </>
        )}
    </AnimatePresence>
)
```

**Step 3: Remove the early return guard**

Remove this line (currently around line 49):
```tsx
if (!open || (upgrades.length === 0 && bundles.length === 0)) return null
```

The `AnimatePresence` now handles the show/hide logic. The early return prevents exit animations from running.

**Step 4: Verify build**

Run: `npm run lint`
Expected: No new errors

**Step 5: Commit**

```bash
git add src/components/customer/inline-upgrade-section.tsx
git commit -m "feat: add slide-up/down animation to InlineUpgradeSection"
```

---

### Task 3: Delayed Auto-Open for Upgrade Section

**Files:**
- Modify: `src/hooks/useProductDetailModals.ts`

**Step 1: Add 200ms delay before auto-opening upgrade screen**

Replace the auto-open `useEffect` (lines 40-45):

```tsx
// Auto-open the upgrade screen once -- skip if user already chose or dismissed
// Brief delay so user sees the product detail page first
useEffect(() => {
    if (upgradeDismissed) return
    if (menuEngineeringEnabled && (upgradeUpsellsCount > 0 || upsellBundlesCount > 0)) {
        const timer = setTimeout(() => setIsUpgradeScreenOpen(true), 200)
        return () => clearTimeout(timer)
    }
}, [menuEngineeringEnabled, upgradeUpsellsCount, upsellBundlesCount, upgradeDismissed])
```

**Step 2: Verify build**

Run: `npm run lint`
Expected: No new errors

**Step 3: Commit**

```bash
git add src/hooks/useProductDetailModals.ts
git commit -m "ux: add 200ms delay before auto-opening upgrade screen"
```

---

### Task 4: Upgrade Navigation — Slide Transition

**Files:**
- Modify: `src/components/customer/product-detail-content.tsx`

**Step 1: Add transition state and handler**

Inside `ProductDetailContent`, add a state variable near the other state declarations (around line 260-280):

```tsx
const [isPageTransitioning, setIsPageTransitioning] = useState(false)
const pendingNavigationRef = useRef<string | null>(null)
```

**Step 2: Update the onSelectUpgrade handler**

Replace the inline `onSelectUpgrade` handler on the `InlineUpgradeSection` component (around line 908-912):

```tsx
onSelectUpgrade={(upgrade) => {
    setIsUpgradeScreenOpen(false)
    setUpgradeDismissed(true)
    // Trigger slide-left exit animation, then navigate
    pendingNavigationRef.current = `/${tenant.slug}/menu/item/${upgrade.targetItem.id}?upgraded=1`
    setIsPageTransitioning(true)
}}
```

**Step 3: Add a useEffect to handle navigation after animation**

Add near the other `useEffect` hooks:

```tsx
useEffect(() => {
    if (isPageTransitioning && pendingNavigationRef.current) {
        const timer = setTimeout(() => {
            const url = pendingNavigationRef.current!
            pendingNavigationRef.current = null
            setIsPageTransitioning(false)
            router.replace(url)
        }, 250) // Match the exit animation duration
        return () => clearTimeout(timer)
    }
}, [isPageTransitioning, router])
```

**Step 4: Wrap the main content in a motion.div for exit animation**

Find the outermost wrapper `<div>` of the component's main content (the first `<div>` in the return, not the modals). Wrap it with a transition:

Add `AnimatePresence` to the import from 'framer-motion' (line 23 — it's currently `import { motion } from 'framer-motion'`):

```tsx
import { motion, AnimatePresence } from 'framer-motion'
```

Then wrap the main content div (the one with `className` starting with something like `"flex flex-col min-h-dvh"` or similar — it's the root element at around line 575) with:

```tsx
<motion.div
    animate={isPageTransitioning ? { x: '-100%', opacity: 0 } : { x: 0, opacity: 1 }}
    transition={{ type: 'tween' as const, duration: 0.25, ease: 'easeInOut' }}
    className="flex flex-col min-h-dvh"
    style={/* keep existing style */}
>
```

Replace the outer `<div>` with this `<motion.div>` (and update the closing `</div>` to `</motion.div>`).

**Step 5: Verify build**

Run: `npm run lint`
Expected: No new errors

**Step 6: Commit**

```bash
git add src/components/customer/product-detail-content.tsx
git commit -m "feat: add slide-left transition when navigating to upgrade item"
```

---

### Task 5: PairSuggestionSheet — Slide-up Entry/Exit + Image Preloading

**Files:**
- Modify: `src/components/customer/pair-suggestion-sheet.tsx`

**Step 1: Update animation variants**

Replace the `pageVariants` (lines 22-26) with slide-up variants:

```tsx
const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.15 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
}

const sheetVariants = {
  hidden: { y: '100%' },
  visible: {
    y: 0,
    transition: { type: 'spring' as const, damping: 28, stiffness: 350 },
  },
  exit: {
    y: '100%',
    transition: { type: 'tween' as const, duration: 0.2, ease: 'easeOut' },
  },
}
```

**Step 2: Add image preloading**

Inside the `PairSuggestionSheet` component, add after the analytics tracking `useEffect`:

```tsx
// Preload images for first 6 suggestions
useEffect(() => {
    if (!open || suggestions.length === 0) return
    suggestions.slice(0, 6).forEach(item => {
        if (item.image_url) {
            const img = new window.Image()
            img.src = item.image_url
        }
    })
}, [open, suggestions])
```

**Step 3: Update the JSX to use backdrop + sheet pattern**

Replace the return block. Change from the current single `motion.div` to a backdrop + sheet pattern:

```tsx
return (
    <AnimatePresence>
        {open && (
            <>
                {/* Backdrop */}
                <motion.div
                    className="fixed inset-0 z-50 bg-black/50"
                    variants={backdropVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                />

                {/* Sheet */}
                <motion.div
                    className="fixed inset-0 z-50 flex flex-col bg-white"
                    variants={sheetVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                >
                    {/* Centered content wrapper */}
                    <div className="flex-1 flex flex-col items-center justify-center overflow-y-auto px-8 py-10 sm:px-12 sm:py-14">
                        <div className="w-full max-w-2xl">
                            {/* Title + Subtitle */}
                            <motion.h1
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="text-xl sm:text-2xl font-bold text-gray-900 text-center leading-snug"
                            >
                                Perfect with {triggerItemName}
                            </motion.h1>
                            <motion.p
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="text-sm text-gray-400 text-center mt-2 mb-8"
                            >
                                Complete your meal
                            </motion.p>

                            {/* Grid */}
                            <motion.div
                                className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4"
                                variants={gridVariants}
                                initial="hidden"
                                animate="visible"
                            >
                                {suggestions.map((item, i) => (
                                    <PairCard
                                        key={item.id}
                                        item={item}
                                        onTap={() => handleTapItem(item)}
                                        hideCurrencySymbol={hideCurrencySymbol}
                                        eagerImage={i < 4}
                                    />
                                ))}
                            </motion.div>

                            {/* Continue button */}
                            <div className="mt-10">
                                <button
                                    onClick={handleDismiss}
                                    className="w-full h-12 border border-gray-300 text-sm font-medium text-gray-500 transition-colors active:bg-gray-50 hover:bg-gray-50"
                                >
                                    Continue
                                </button>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </>
        )}
    </AnimatePresence>
)
```

**Step 4: Update onClose in ProductDetailContent to wait for exit animation**

In `product-detail-content.tsx`, update the `onClose` handler for `PairSuggestionSheet` (around line 931-938). Replace with a delayed navigation:

```tsx
onClose={() => {
    setIsPairSheetOpen(false)
    // Wait for exit animation to complete before navigating
    setTimeout(() => {
        if (buyNowIntentRef.current) {
            buyNowIntentRef.current = false
            router.push(`/${tenant.slug}/cart`)
        } else {
            router.back()
        }
    }, 250)
}}
```

**Step 5: Verify build**

Run: `npm run lint`
Expected: No new errors

**Step 6: Commit**

```bash
git add src/components/customer/pair-suggestion-sheet.tsx src/components/customer/product-detail-content.tsx
git commit -m "feat: add slide-up animation + image preloading to PairSuggestionSheet"
```

---

### Task 6: CheckoutUpsellModal — Slide-up Entry/Exit

**Files:**
- Modify: `src/components/customer/checkout-upsell-modal.tsx`

**Step 1: Replace page variants with slide-up variants**

Replace `pageVariants` (lines 41-45) with:

```tsx
const backdropVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.15 } },
    exit: { opacity: 0, transition: { duration: 0.15 } },
}

const sheetVariants = {
    hidden: { y: '100%' },
    visible: {
        y: 0,
        transition: { type: 'spring' as const, damping: 28, stiffness: 350 },
    },
    exit: {
        y: '100%',
        transition: { type: 'tween' as const, duration: 0.2, ease: 'easeOut' },
    },
}
```

**Step 2: Update the JSX to use backdrop + sheet pattern**

Replace the return block. Change from the current single `motion.div` to backdrop + sheet:

```tsx
return (
    <AnimatePresence>
        {open && (
            <>
                {/* Backdrop */}
                <motion.div
                    className="fixed inset-0 z-50 bg-black/50"
                    variants={backdropVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                />

                {/* Sheet */}
                <motion.div
                    className={`fixed inset-0 ${zIndexClass} flex flex-col`}
                    style={{ backgroundColor: bgColor }}
                    variants={sheetVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                >
                    {/* Centered content wrapper */}
                    <div className="flex-1 flex flex-col items-center justify-center overflow-y-auto px-8 py-10 sm:px-12 sm:py-14">
                        <div className="w-full max-w-md">
                            {/* Title + Subtitle */}
                            <motion.h1
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="text-xl sm:text-2xl font-bold text-gray-900 text-center leading-snug"
                            >
                                {title}
                            </motion.h1>
                            {subtitle && (
                                <motion.p
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="text-sm text-gray-400 text-center mt-2 mb-8"
                                >
                                    {subtitle}
                                </motion.p>
                            )}
                            {!subtitle && <div className="mb-8" />}

                            {/* Grid */}
                            {isLoading ? (
                                <div className="grid grid-cols-2 gap-4">
                                    {Array.from({ length: Math.min(maxItems, 4) }).map((_, i) => (
                                        <SkeletonCard key={i} />
                                    ))}
                                </div>
                            ) : suggestions.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-16">
                                    <ShoppingBag className="h-14 w-14 text-gray-200 mb-3" />
                                    <p className="text-sm text-gray-400">No suggestions right now</p>
                                </div>
                            ) : (
                                <motion.div
                                    className="grid grid-cols-2 gap-4"
                                    variants={gridVariants}
                                    initial="hidden"
                                    animate="visible"
                                >
                                    {suggestions.map((item, i) => (
                                        <ItemCard
                                            key={item.id}
                                            item={item}
                                            onTap={() => handleTapItem(item)}
                                            hideCurrencySymbol={hideCurrencySymbol}
                                            eagerImage={i < 4}
                                        />
                                    ))}
                                </motion.div>
                            )}

                            {/* "Not Today" button */}
                            <div className="mt-10">
                                <button
                                    onClick={handleDismiss}
                                    className="w-full h-12 border border-gray-300 text-sm font-medium text-gray-500 transition-colors active:bg-gray-50 hover:bg-gray-50"
                                >
                                    Not Today
                                </button>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </>
        )}
    </AnimatePresence>
)
```

**Step 3: Verify build**

Run: `npm run lint`
Expected: No new errors

**Step 4: Commit**

```bash
git add src/components/customer/checkout-upsell-modal.tsx
git commit -m "feat: add slide-up animation to CheckoutUpsellModal"
```

---

### Task 7: Final Verification

**Step 1: Run full lint check**

Run: `npm run lint`
Expected: All passes

**Step 2: Run tests**

Run: `npm run test`
Expected: All existing tests still pass

**Step 3: Final commit (if any lint fixes needed)**

```bash
git add -A
git commit -m "fix: lint fixes for transition animation polish"
```
