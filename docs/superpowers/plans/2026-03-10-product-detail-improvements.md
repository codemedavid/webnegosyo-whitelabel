# Product Detail Page Improvements — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix bugs, improve rendering performance, add error handling, SEO, and availability checks to the product detail page.

**Architecture:** Server component (ISR, 5-min revalidation) passes data to a `'use client'` ProductDetailContent. We keep this split but add an error boundary, JSON-LD, item availability gating, optimized admin check, and loading fallbacks on dynamic imports.

**Tech Stack:** Next.js 15 App Router, Supabase, TypeScript, Cloudinary, Tailwind CSS

---

## Chunk 1: Error Handling, SEO & Data Validation

### Task 1: Add error.tsx Error Boundary

**Files:**
- Create: `src/app/[tenant]/menu/item/[itemId]/error.tsx`

- [ ] **Step 1: Create error boundary component**

```tsx
'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'

export default function ProductDetailError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        console.error('Product detail error:', error)
    }, [error])

    return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
            <AlertTriangle className="h-12 w-12 text-amber-500" />
            <h2 className="text-lg font-semibold">Something went wrong</h2>
            <p className="text-sm text-muted-foreground max-w-md">
                We couldn&apos;t load this item. Please try again.
            </p>
            <div className="flex gap-3">
                <Button variant="outline" onClick={() => window.history.back()}>
                    Go Back
                </Button>
                <Button onClick={reset}>
                    Try Again
                </Button>
            </div>
        </div>
    )
}
```

- [ ] **Step 2: Verify the error boundary renders**

Run: `npm run lint`
Expected: No errors related to error.tsx

- [ ] **Step 3: Commit**

```bash
git add src/app/\[tenant\]/menu/item/\[itemId\]/error.tsx
git commit -m "feat(product-detail): add error.tsx error boundary"
```

---

### Task 2: Add JSON-LD Structured Data

**Files:**
- Modify: `src/app/[tenant]/menu/item/[itemId]/page.tsx` (lines 182-208)

JSON-LD uses `JSON.stringify()` on server-constructed data (item name, price, availability) — no user-generated HTML content, so no XSS risk.

- [ ] **Step 1: Add JSON-LD script to the page return**

In `page.tsx`, after line 181 (const preloadImageUrl = ...), add the jsonLd object. Then add a `<script type="application/ld+json">` tag in the JSX return, before the `<link>` preload.

The JSON-LD object shape:
```tsx
const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: item.name,
    ...(item.description && { description: item.description }),
    ...(item.image_url && { image: item.image_url }),
    offers: {
        '@type': 'Offer',
        price: item.discounted_price ?? item.price,
        priceCurrency: 'PHP',
        availability: item.is_available
            ? 'https://schema.org/InStock'
            : 'https://schema.org/OutOfStock',
    },
}
```

- [ ] **Step 2: Verify lint passes**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/\[tenant\]/menu/item/\[itemId\]/page.tsx
git commit -m "feat(product-detail): add JSON-LD structured data for SEO"
```

---

### Task 3: Add Item Availability Check

**Files:**
- Modify: `src/components/customer/product-detail-content.tsx`

The server component already fetches `is_available` on the item. We need the client component to respect it — show a banner and disable add-to-cart when `is_available === false`.

- [ ] **Step 1: Add unavailable banner and disable CTA buttons**

In `product-detail-content.tsx`, find the add-to-cart / buy-now buttons section. Before those buttons, add a conditional unavailable banner:

```tsx
{!item.is_available && (
    <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-center text-sm text-amber-800">
        This item is currently unavailable
    </div>
)}
```

Then on both the "Add to Cart" and "Buy Now" `<Button>` elements, add:
```tsx
disabled={!item.is_available}
```

- [ ] **Step 2: Verify lint passes**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/customer/product-detail-content.tsx
git commit -m "feat(product-detail): show unavailable state and disable add-to-cart"
```

---

### Task 4: Add UUID Validation for itemId

**Files:**
- Modify: `src/app/[tenant]/menu/item/[itemId]/page.tsx` (lines 70-73)

- [ ] **Step 1: Add UUID validation before database queries**

After line 72 (`const { tenant: tenantSlug, itemId } = await params`), add:

```tsx
// Validate itemId is a valid UUID to avoid unnecessary DB round-trips
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
if (!uuidRegex.test(itemId)) {
    notFound()
}
```

- [ ] **Step 2: Verify lint passes**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/\[tenant\]/menu/item/\[itemId\]/page.tsx
git commit -m "fix(product-detail): validate itemId UUID format before DB query"
```

---

## Chunk 2: Performance Optimizations

### Task 5: Parallelize Admin Check with Non-Critical Fetches

**Files:**
- Modify: `src/app/[tenant]/menu/item/[itemId]/page.tsx` (lines 103-168)

Currently the admin check runs sequentially AFTER `Promise.allSettled`. Move it into the parallel block.

- [ ] **Step 1: Move admin check into Promise.allSettled**

Add an async IIFE as the 6th promise in the `Promise.allSettled` array (after the bundles promise at line 126):

```tsx
// Admin role check (runs in parallel, non-blocking)
(async () => {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false
    const { data: role } = await supabase
        .from('app_users')
        .select('role, tenant_id')
        .eq('user_id', user.id)
        .maybeSingle()
    const userRole = role as { role: string; tenant_id: string | null } | null
    return !!userRole && (
        userRole.role === 'superadmin' ||
        (userRole.role === 'admin' && userRole.tenant_id === tenant.id)
    )
})(),
```

Then extract the result after the existing extractions:
```tsx
const isBrandAdmin = results[5].status === 'fulfilled' ? results[5].value : false
```

Update the labels array to include `'adminCheck'` and remove the standalone admin check block (lines 149-168) and the `let isBrandAdmin = false` declaration (line 150).

- [ ] **Step 2: Verify lint passes**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/\[tenant\]/menu/item/\[itemId\]/page.tsx
git commit -m "perf(product-detail): parallelize admin check with other non-critical fetches"
```

---

### Task 6: Add Loading Fallbacks to Dynamic Imports

**Files:**
- Modify: `src/components/customer/product-detail-content.tsx` (lines 24-49)

- [ ] **Step 1: Add `loading` option to all dynamic imports**

Update each dynamic import to include `loading: () => null` since these are modals hidden by default:

```tsx
const InlineUpgradeSection = dynamic(
  () => import('./inline-upgrade-section').then((m) => ({ default: m.InlineUpgradeSection })),
  { ssr: false, loading: () => null }
)
// ... same pattern for all 5 other dynamic imports
```

- [ ] **Step 2: Verify lint passes**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/customer/product-detail-content.tsx
git commit -m "perf(product-detail): add loading fallbacks to dynamic modal imports"
```

---

### Task 7: Preload Upgrade Upsell Images from Server

**Files:**
- Modify: `src/app/[tenant]/menu/item/[itemId]/page.tsx`

Currently upgrade images are preloaded client-side in a `useEffect`. Move preload `<link>` tags to the server component.

- [ ] **Step 1: Add upgrade image preload links**

After the hero image preload link (after line 191), add:

```tsx
{upgradeUpsells.slice(0, 2).map((upsell) => {
    const upgImg = upsell.targetItem.image_url
    if (!upgImg) return null
    const preloadUrl = isCloudinaryUrl(upgImg)
        ? transformCloudinaryUrl(upgImg, { width: 640, quality: 'auto', crop: 'limit' }) || upgImg
        : upgImg
    return (
        <link
            key={upsell.targetItem.id}
            rel="preload"
            as="image"
            href={preloadUrl}
        />
    )
})}
```

- [ ] **Step 2: Verify lint passes**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/\[tenant\]/menu/item/\[itemId\]/page.tsx
git commit -m "perf(product-detail): preload upgrade upsell images from server"
```

---

### Task 8: Final Verification

- [ ] **Step 1: Run full lint**

Run: `npm run lint`
Expected: PASS with no new errors

- [ ] **Step 2: Run build to verify no SSR/ISR issues**

Run: `npm run build`
Expected: Build completes (may have pre-existing warnings, but no new errors)

- [ ] **Step 3: Commit any remaining fixes**
