# Bundle Slot-Based Customization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace flat-item bundles with a slot-based customization wizard where admins define category-linked slots and customers walk through a step-by-step journey.

**Architecture:** New `bundle_slots` and `bundle_slot_price_overrides` tables replace `bundle_items`. Customer-facing wizard is a full-screen component with one slot per screen. Admin form becomes a 5-step wizard. Cart types change from `BundleItemCustomization[]` to `CartBundleSlotSelection[]`.

**Tech Stack:** Next.js 15 App Router, Supabase PostgreSQL (RLS), TypeScript, Tailwind CSS, Shadcn UI, React Hook Form + Zod, Jest

**Spec:** `docs/superpowers/specs/2026-03-27-bundle-slot-customization-design.md`

---

### Task 1: Database Migration — Create slot tables, drop bundle_items

**Files:**
- Create: `supabase/migrations/20260327000001_bundle_slots.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- supabase/migrations/20260327000001_bundle_slots.sql

-- 1. Create bundle_slots table
CREATE TABLE bundle_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id UUID NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  pick_count INTEGER NOT NULL DEFAULT 1 CHECK (pick_count >= 1),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Create bundle_slot_price_overrides table
CREATE TABLE bundle_slot_price_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id UUID NOT NULL REFERENCES bundle_slots(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  price_override NUMERIC NOT NULL CHECK (price_override >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (slot_id, menu_item_id)
);

-- 3. Indexes
CREATE INDEX idx_bundle_slots_bundle_id ON bundle_slots(bundle_id);
CREATE INDEX idx_bundle_slots_category_id ON bundle_slots(category_id);
CREATE INDEX idx_bundle_slot_price_overrides_slot_id ON bundle_slot_price_overrides(slot_id);

-- 4. Enable RLS
ALTER TABLE bundle_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE bundle_slot_price_overrides ENABLE ROW LEVEL SECURITY;

-- 5. RLS policies for bundle_slots (tenant-scoped via bundles)
CREATE POLICY "Anyone can view bundle slots for active bundles"
  ON bundle_slots FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bundles
      WHERE bundles.id = bundle_slots.bundle_id
    )
  );

CREATE POLICY "Authenticated users can manage slots for their tenant bundles"
  ON bundle_slots FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM bundles
      WHERE bundles.id = bundle_slots.bundle_id
        AND bundles.tenant_id IN (
          SELECT tenant_id FROM users WHERE id = auth.uid()
        )
    )
  );

-- 6. RLS policies for bundle_slot_price_overrides (via slots -> bundles)
CREATE POLICY "Anyone can view price overrides"
  ON bundle_slot_price_overrides FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bundle_slots
      JOIN bundles ON bundles.id = bundle_slots.bundle_id
      WHERE bundle_slots.id = bundle_slot_price_overrides.slot_id
    )
  );

CREATE POLICY "Authenticated users can manage price overrides for their tenant"
  ON bundle_slot_price_overrides FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM bundle_slots
      JOIN bundles ON bundles.id = bundle_slots.bundle_id
      WHERE bundle_slots.id = bundle_slot_price_overrides.slot_id
        AND bundles.tenant_id IN (
          SELECT tenant_id FROM users WHERE id = auth.uid()
        )
    )
  );

-- 7. Drop old bundle_items table
DROP TABLE IF EXISTS bundle_items;
```

- [ ] **Step 2: Verify migration file exists**

Run: `ls -la supabase/migrations/20260327000001_bundle_slots.sql`
Expected: File exists with correct content.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260327000001_bundle_slots.sql
git commit -m "feat(bundles): add bundle_slots and price_overrides tables, drop bundle_items"
```

---

### Task 2: Update TypeScript Types

**Files:**
- Modify: `src/types/database.ts`
- Create: `tests/fixtures/bundle.fixture.ts`

- [ ] **Step 1: Add new types and update existing ones in `src/types/database.ts`**

Find the existing `BundleItem` interface (around line 240) and replace the bundle-related types. Add after the `Bundle` interface:

```typescript
export interface BundleSlot {
  id: string;
  bundle_id: string;
  name: string;
  category_id: string;
  pick_count: number;
  sort_order: number;
  created_at: string;
  category?: Category;
  items?: MenuItem[];
  price_overrides?: BundleSlotPriceOverride[];
}

export interface BundleSlotPriceOverride {
  id: string;
  slot_id: string;
  menu_item_id: string;
  price_override: number;
  created_at: string;
}
```

Remove the old `BundleItem` interface:
```typescript
// DELETE this entire interface:
// export interface BundleItem {
//   id: string;
//   bundle_id: string;
//   menu_item_id: string;
//   quantity: number;
//   display_order: number;
//   menu_item?: MenuItem;
// }
```

Update `BundleWithItems` — find it and replace (it's likely an alias like `Bundle & { items: BundleItem[] }`). Add:
```typescript
export type BundleWithSlots = Bundle & {
  slots: BundleSlot[];
};
```

Replace `BundleItemCustomization` and `CartBundleItem`:

```typescript
// DELETE the old BundleItemCustomization interface

export interface CartBundleSlotSelection {
  slotId: string;
  slotName: string;
  menuItemId: string;
  menuItemName: string;
  menuItemImage: string | null;
  menuItemPrice: number;
  quantity: number;
  selectedVariations?: { [variationTypeId: string]: VariationOption };
  selectedVariation?: Variation;
  selectedAddons: Addon[];
  priceOverride: number;
}

export interface CartBundleItem {
  id: string;
  bundleId: string;
  bundleName: string;
  slots: CartBundleSlotSelection[];
  quantity: number;
  pricingType: 'fixed' | 'discount';
  basePrice: number;
  discountPercent?: number;
  subtotal: number;
}
```

Update the `Cart` interface to use the new `CartBundleItem`:
```typescript
export interface Cart {
  items: CartItem[];
  bundle_items?: CartBundleItem[];
  total: number;
  item_count: number;
}
```

- [ ] **Step 2: Find and update all references to `BundleWithItems` to use `BundleWithSlots`**

Search codebase for `BundleWithItems` — each file that imports it will be updated in later tasks. For now just ensure the type exists. Keep `BundleWithItems` temporarily as a deprecated alias if needed:

```typescript
/** @deprecated Use BundleWithSlots instead */
export type BundleWithItems = BundleWithSlots;
```

- [ ] **Step 3: Create bundle test fixtures**

Create `tests/fixtures/bundle.fixture.ts`:

```typescript
import type {
  Bundle,
  BundleSlot,
  BundleSlotPriceOverride,
  BundleWithSlots,
  CartBundleItem,
  CartBundleSlotSelection,
  Category,
} from '@/types/database'
import { createTestMenuItem } from './menu-item.fixture'

export function createTestBundle(overrides: Partial<Bundle> = {}): Bundle {
  return {
    id: 'bundle-1',
    tenant_id: 'tenant-1',
    name: 'Test Bundle',
    description: 'A test bundle',
    image_url: 'https://example.com/bundle.jpg',
    pricing_type: 'fixed',
    fixed_price: 200,
    discount_percent: undefined,
    is_active: true,
    show_on_menu: true,
    show_as_upsell: false,
    display_order: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

export function createTestCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 'category-1',
    tenant_id: 'tenant-1',
    name: 'Beverages',
    description: 'Drinks',
    order: 0,
    is_active: true,
    display_layout: 'grid',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

export function createTestBundleSlot(overrides: Partial<BundleSlot> = {}): BundleSlot {
  return {
    id: 'slot-1',
    bundle_id: 'bundle-1',
    name: 'Choose your Drink',
    category_id: 'category-1',
    pick_count: 1,
    sort_order: 0,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

export function createTestPriceOverride(
  overrides: Partial<BundleSlotPriceOverride> = {}
): BundleSlotPriceOverride {
  return {
    id: 'override-1',
    slot_id: 'slot-1',
    menu_item_id: 'premium-item-1',
    price_override: 20,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

export function createTestBundleWithSlots(
  overrides: Partial<BundleWithSlots> = {}
): BundleWithSlots {
  return {
    ...createTestBundle(),
    slots: [
      createTestBundleSlot({
        items: [
          createTestMenuItem({ id: 'drink-1', name: 'Coke', price: 45, category_id: 'category-1' }),
          createTestMenuItem({ id: 'drink-2', name: 'Iced Tea', price: 40, category_id: 'category-1' }),
        ],
        price_overrides: [],
        category: createTestCategory(),
      }),
    ],
    ...overrides,
  }
}

export function createTestSlotSelection(
  overrides: Partial<CartBundleSlotSelection> = {}
): CartBundleSlotSelection {
  return {
    slotId: 'slot-1',
    slotName: 'Choose your Drink',
    menuItemId: 'drink-1',
    menuItemName: 'Coke',
    menuItemImage: 'https://example.com/coke.jpg',
    menuItemPrice: 45,
    quantity: 1,
    selectedAddons: [],
    priceOverride: 0,
    ...overrides,
  }
}

export function createTestCartBundleItem(
  overrides: Partial<CartBundleItem> = {}
): CartBundleItem {
  return {
    id: 'cart-bundle-1',
    bundleId: 'bundle-1',
    bundleName: 'Test Bundle',
    slots: [createTestSlotSelection()],
    quantity: 1,
    pricingType: 'fixed',
    basePrice: 200,
    subtotal: 200,
    ...overrides,
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/types/database.ts tests/fixtures/bundle.fixture.ts
git commit -m "feat(bundles): add BundleSlot, CartBundleSlotSelection types, add fixtures"
```

---

### Task 3: Update Cart Pricing Utilities (TDD)

**Files:**
- Modify: `src/lib/cart-utils.ts`
- Modify: `tests/unit/lib/cart-utils-bundle.test.ts`

- [ ] **Step 1: Write failing tests for new bundle pricing**

Replace the bundle pricing tests in `tests/unit/lib/cart-utils-bundle.test.ts`. The new functions work with `CartBundleSlotSelection[]` instead of `BundleItemCustomization[]`:

```typescript
import { describe, test, expect } from '@jest/globals'
import {
  calculateCartItemSubtotal,
  calculateCartTotal,
  getCartItemCount,
  generateCartItemId,
  formatPrice,
  calculateSlotBundleBasePrice,
  calculateSlotBundleExtras,
  calculateSlotBundleSubtotal,
  calculateSlotBundleSavings,
  calculateFullCartTotal,
  getFullCartItemCount,
  calculateTotalSlotBundleSavings,
} from '@/lib/cart-utils'
import type { CartItem, CartBundleItem, VariationOption } from '@/types/database'
import {
  createTestMenuItem,
  createTestVariation,
  createTestAddon,
  createTestVariationOption,
} from '../../fixtures/menu-item.fixture'
import {
  createTestCartBundleItem,
  createTestSlotSelection,
} from '../../fixtures/bundle.fixture'

// ---- Keep existing cart-utils edge cases tests unchanged ----

describe('cart-utils edge cases', () => {
  describe('calculateCartItemSubtotal edge cases', () => {
    test('handles zero base price', () => {
      expect(calculateCartItemSubtotal(0, undefined, [], 5)).toBe(0)
    })

    test('handles zero quantity', () => {
      expect(calculateCartItemSubtotal(100, undefined, [], 0)).toBe(0)
    })

    test('handles zero price modifier on legacy variation', () => {
      const variation = createTestVariation({ price_modifier: 0 })
      expect(calculateCartItemSubtotal(50, variation, [], 2)).toBe(100)
    })

    test('handles large quantities', () => {
      expect(calculateCartItemSubtotal(100, undefined, [], 1000)).toBe(100000)
    })

    test('handles fractional base price', () => {
      expect(calculateCartItemSubtotal(99.99, undefined, [], 1)).toBe(99.99)
    })

    test('handles multiple addons with zero-priced addon', () => {
      const addons = [
        createTestAddon({ price: 0 }),
        createTestAddon({ price: 25 }),
      ]
      expect(calculateCartItemSubtotal(100, undefined, addons, 1)).toBe(125)
    })

    test('handles grouped variations with zero modifiers', () => {
      const variations: { [typeId: string]: VariationOption } = {
        'type-1': createTestVariationOption({ price_modifier: 0 }),
        'type-2': createTestVariationOption({ price_modifier: 0 }),
      }
      expect(calculateCartItemSubtotal(100, variations, [], 2)).toBe(200)
    })

    test('handles combination of grouped variations and multiple addons', () => {
      const variations: { [typeId: string]: VariationOption } = {
        'size': createTestVariationOption({ price_modifier: 30 }),
        'spice': createTestVariationOption({ price_modifier: 5 }),
      }
      const addons = [
        createTestAddon({ price: 10 }),
        createTestAddon({ price: 15 }),
        createTestAddon({ price: 20 }),
      ]
      expect(calculateCartItemSubtotal(100, variations, addons, 2)).toBe(360)
    })
  })

  describe('calculateCartTotal edge cases', () => {
    test('handles single item with zero subtotal', () => {
      const items: CartItem[] = [{
        id: '1',
        menu_item: createTestMenuItem(),
        selected_addons: [],
        quantity: 1,
        subtotal: 0,
      }]
      expect(calculateCartTotal(items)).toBe(0)
    })

    test('handles many items', () => {
      const items: CartItem[] = Array.from({ length: 50 }, (_, i) => ({
        id: `item-${i}`,
        menu_item: createTestMenuItem(),
        selected_addons: [],
        quantity: 1,
        subtotal: 10,
      }))
      expect(calculateCartTotal(items)).toBe(500)
    })
  })

  describe('getCartItemCount edge cases', () => {
    test('handles items with zero quantity', () => {
      const items: CartItem[] = [{
        id: '1',
        menu_item: createTestMenuItem(),
        selected_addons: [],
        quantity: 0,
        subtotal: 0,
      }]
      expect(getCartItemCount(items)).toBe(0)
    })
  })

  describe('generateCartItemId edge cases', () => {
    test('handles empty addon array', () => {
      expect(generateCartItemId('item-1', undefined, [])).toBe('item-1')
    })

    test('handles single addon', () => {
      expect(generateCartItemId('item-1', undefined, ['addon-1'])).toBe('item-1_addon-1')
    })

    test('handles both legacy variation and addons', () => {
      expect(generateCartItemId('item-1', 'var-1', ['addon-2', 'addon-1'])).toBe('item-1_var-1_addon-1-addon-2')
    })

    test('handles grouped variations with single type', () => {
      const variations: { [typeId: string]: VariationOption } = {
        'type-1': createTestVariationOption({ id: 'opt-1' }),
      }
      expect(generateCartItemId('item-1', variations)).toBe('item-1_type-1:opt-1')
    })
  })

  describe('formatPrice edge cases', () => {
    test('formats negative price', () => {
      const result = formatPrice(-50)
      expect(result).toContain('50.00')
    })

    test('formats very large price', () => {
      const result = formatPrice(1000000)
      expect(result).toContain('1,000,000.00')
    })

    test('formats with hideCurrencySymbol option', () => {
      const result = formatPrice(100, { hideCurrencySymbol: true })
      expect(result).toBe('100.00')
      expect(result).not.toContain('₱')
    })

    test('formats zero with hideCurrencySymbol option', () => {
      const result = formatPrice(0, { hideCurrencySymbol: true })
      expect(result).toBe('0.00')
    })
  })
})

// ---- New slot-based bundle pricing tests ----

describe('slot-based bundle pricing', () => {
  describe('calculateSlotBundleBasePrice', () => {
    test('returns fixed price for fixed pricing type', () => {
      const bundleItem = createTestCartBundleItem({ pricingType: 'fixed', basePrice: 250 })
      expect(calculateSlotBundleBasePrice(bundleItem)).toBe(250)
    })

    test('calculates discount price from slot selections', () => {
      const bundleItem = createTestCartBundleItem({
        pricingType: 'discount',
        basePrice: 0,
        discountPercent: 20,
        slots: [
          createTestSlotSelection({ menuItemPrice: 100, quantity: 1 }),
          createTestSlotSelection({ slotId: 'slot-2', menuItemPrice: 150, quantity: 1 }),
        ],
      })
      // original = 100 + 150 = 250, discounted = 250 * 0.8 = 200
      expect(calculateSlotBundleBasePrice(bundleItem)).toBe(200)
    })

    test('handles 100% discount', () => {
      const bundleItem = createTestCartBundleItem({
        pricingType: 'discount',
        basePrice: 0,
        discountPercent: 100,
        slots: [createTestSlotSelection({ menuItemPrice: 100, quantity: 1 })],
      })
      expect(calculateSlotBundleBasePrice(bundleItem)).toBe(0)
    })

    test('handles 0% discount (full price)', () => {
      const bundleItem = createTestCartBundleItem({
        pricingType: 'discount',
        basePrice: 0,
        discountPercent: 0,
        slots: [createTestSlotSelection({ menuItemPrice: 100, quantity: 1 })],
      })
      expect(calculateSlotBundleBasePrice(bundleItem)).toBe(100)
    })
  })

  describe('calculateSlotBundleExtras', () => {
    test('returns 0 for no extras', () => {
      const slots = [createTestSlotSelection()]
      expect(calculateSlotBundleExtras(slots)).toBe(0)
    })

    test('sums price overrides', () => {
      const slots = [
        createTestSlotSelection({ priceOverride: 20 }),
        createTestSlotSelection({ slotId: 'slot-2', priceOverride: 15 }),
      ]
      expect(calculateSlotBundleExtras(slots)).toBe(35)
    })

    test('sums addon prices', () => {
      const slots = [
        createTestSlotSelection({
          selectedAddons: [createTestAddon({ price: 10 }), createTestAddon({ price: 15 })],
        }),
      ]
      expect(calculateSlotBundleExtras(slots)).toBe(25)
    })

    test('sums grouped variation modifiers', () => {
      const slots = [
        createTestSlotSelection({
          selectedVariations: {
            'size': createTestVariationOption({ price_modifier: 30 }),
            'type': createTestVariationOption({ price_modifier: 10 }),
          },
        }),
      ]
      expect(calculateSlotBundleExtras(slots)).toBe(40)
    })

    test('sums legacy variation modifier', () => {
      const slots = [
        createTestSlotSelection({
          selectedVariation: createTestVariation({ price_modifier: 25 }),
        }),
      ]
      expect(calculateSlotBundleExtras(slots)).toBe(25)
    })

    test('sums overrides + variations + addons together', () => {
      const slots = [
        createTestSlotSelection({
          priceOverride: 20,
          selectedVariations: { 'size': createTestVariationOption({ price_modifier: 15 }) },
          selectedAddons: [createTestAddon({ price: 10 })],
        }),
      ]
      // 20 + 15 + 10 = 45
      expect(calculateSlotBundleExtras(slots)).toBe(45)
    })

    test('handles multiple slots with various extras', () => {
      const slots = [
        createTestSlotSelection({
          priceOverride: 20,
          selectedAddons: [createTestAddon({ price: 10 })],
        }),
        createTestSlotSelection({
          slotId: 'slot-2',
          selectedVariation: createTestVariation({ price_modifier: 15 }),
        }),
      ]
      // slot1: 20 + 10 = 30, slot2: 15, total = 45
      expect(calculateSlotBundleExtras(slots)).toBe(45)
    })
  })

  describe('calculateSlotBundleSubtotal', () => {
    test('fixed bundle: base + extras × quantity', () => {
      const bundleItem = createTestCartBundleItem({
        pricingType: 'fixed',
        basePrice: 200,
        quantity: 1,
        slots: [createTestSlotSelection({ priceOverride: 0 })],
      })
      // (200 + 0) * 1 = 200
      expect(calculateSlotBundleSubtotal(bundleItem)).toBe(200)
    })

    test('fixed bundle with extras and quantity > 1', () => {
      const bundleItem = createTestCartBundleItem({
        pricingType: 'fixed',
        basePrice: 150,
        quantity: 2,
        slots: [
          createTestSlotSelection({
            priceOverride: 20,
            selectedAddons: [createTestAddon({ price: 10 })],
          }),
        ],
      })
      // (150 + 20 + 10) * 2 = 360
      expect(calculateSlotBundleSubtotal(bundleItem)).toBe(360)
    })

    test('discount bundle: discounted total + extras × quantity', () => {
      const bundleItem = createTestCartBundleItem({
        pricingType: 'discount',
        basePrice: 0,
        discountPercent: 20,
        quantity: 1,
        slots: [
          createTestSlotSelection({ menuItemPrice: 100, priceOverride: 0, quantity: 1 }),
          createTestSlotSelection({ slotId: 'slot-2', menuItemPrice: 150, priceOverride: 25, quantity: 1 }),
        ],
      })
      // original = 250, discounted = 200, extras = 25, total = (200 + 25) * 1 = 225
      expect(calculateSlotBundleSubtotal(bundleItem)).toBe(225)
    })
  })

  describe('calculateSlotBundleSavings', () => {
    test('fixed bundle savings', () => {
      const bundleItem = createTestCartBundleItem({
        pricingType: 'fixed',
        basePrice: 200,
        slots: [
          createTestSlotSelection({ menuItemPrice: 150, quantity: 1 }),
          createTestSlotSelection({ slotId: 'slot-2', menuItemPrice: 100, quantity: 1 }),
        ],
      })
      // original = 250, base = 200, savings = 50
      expect(calculateSlotBundleSavings(bundleItem)).toBe(50)
    })

    test('discount bundle savings', () => {
      const bundleItem = createTestCartBundleItem({
        pricingType: 'discount',
        basePrice: 0,
        discountPercent: 25,
        slots: [
          createTestSlotSelection({ menuItemPrice: 200, quantity: 1 }),
        ],
      })
      // original = 200, base = 150, savings = 50
      expect(calculateSlotBundleSavings(bundleItem)).toBe(50)
    })

    test('returns 0 when fixed price >= original', () => {
      const bundleItem = createTestCartBundleItem({
        pricingType: 'fixed',
        basePrice: 500,
        slots: [createTestSlotSelection({ menuItemPrice: 100, quantity: 1 })],
      })
      expect(calculateSlotBundleSavings(bundleItem)).toBe(0)
    })
  })

  describe('calculateFullCartTotal (with new bundles)', () => {
    test('sums regular items and slot-based bundles', () => {
      const items: CartItem[] = [
        { id: '1', menu_item: createTestMenuItem(), selected_addons: [], quantity: 1, subtotal: 100 },
      ]
      const bundleItems = [createTestCartBundleItem({ subtotal: 300 })]
      expect(calculateFullCartTotal(items, bundleItems)).toBe(400)
    })

    test('handles empty bundles', () => {
      const items: CartItem[] = [
        { id: '1', menu_item: createTestMenuItem(), selected_addons: [], quantity: 1, subtotal: 150 },
      ]
      expect(calculateFullCartTotal(items, [])).toBe(150)
    })

    test('handles both empty', () => {
      expect(calculateFullCartTotal([], [])).toBe(0)
    })
  })

  describe('getFullCartItemCount (with new bundles)', () => {
    test('counts slot selections × bundle quantity', () => {
      const bundleItems = [
        createTestCartBundleItem({
          slots: [
            createTestSlotSelection({ quantity: 1 }),
            createTestSlotSelection({ slotId: 'slot-2', quantity: 2 }),
          ],
          quantity: 2,
        }),
      ]
      // (1 + 2) * 2 = 6
      expect(getFullCartItemCount([], bundleItems)).toBe(6)
    })
  })

  describe('calculateTotalSlotBundleSavings', () => {
    test('sums savings across multiple bundles', () => {
      const b1 = createTestCartBundleItem({
        pricingType: 'fixed',
        basePrice: 200,
        quantity: 1,
        slots: [
          createTestSlotSelection({ menuItemPrice: 150, quantity: 1 }),
          createTestSlotSelection({ slotId: 'slot-2', menuItemPrice: 100, quantity: 1 }),
        ],
        subtotal: 200,
      })
      const b2 = createTestCartBundleItem({
        id: 'cart-bundle-2',
        bundleId: 'bundle-2',
        pricingType: 'discount',
        basePrice: 0,
        discountPercent: 20,
        quantity: 2,
        slots: [createTestSlotSelection({ menuItemPrice: 100, quantity: 1 })],
        subtotal: 160,
      })
      // b1: 250-200=50 * 1 = 50, b2: 100-80=20 * 2 = 40, total = 90
      expect(calculateTotalSlotBundleSavings([b1, b2])).toBe(90)
    })

    test('returns 0 for empty list', () => {
      expect(calculateTotalSlotBundleSavings([])).toBe(0)
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- --testPathPattern="cart-utils-bundle"`
Expected: FAIL — `calculateSlotBundleBasePrice`, `calculateSlotBundleExtras`, etc. not found.

- [ ] **Step 3: Implement the new slot-based pricing functions in `src/lib/cart-utils.ts`**

Add these new functions after the existing bundle functions (keep the old functions temporarily for the deprecated alias to compile — they'll be removed in Task 8 cleanup):

```typescript
// ---- Slot-based bundle pricing ----

export function calculateSlotBundleBasePrice(bundleItem: CartBundleItem): number {
  if (bundleItem.pricingType === 'fixed') {
    return bundleItem.basePrice
  }
  const originalTotal = bundleItem.slots.reduce(
    (sum, s) => sum + s.menuItemPrice * s.quantity, 0
  )
  const discountPercent = Math.min(bundleItem.discountPercent ?? 0, 100)
  return Math.max(0, Math.round(originalTotal * (1 - discountPercent / 100) * 100) / 100)
}

export function calculateSlotBundleExtras(slots: CartBundleSlotSelection[]): number {
  return slots.reduce((sum, s) => {
    let variationExtra = 0
    if (s.selectedVariations) {
      variationExtra = Object.values(s.selectedVariations).reduce(
        (acc, opt) => acc + opt.price_modifier, 0
      )
    } else if (s.selectedVariation) {
      variationExtra = s.selectedVariation.price_modifier || 0
    }
    const addonExtra = s.selectedAddons.reduce((acc, a) => acc + a.price, 0)
    return sum + s.priceOverride + variationExtra + addonExtra
  }, 0)
}

export function calculateSlotBundleSubtotal(bundleItem: CartBundleItem): number {
  const base = calculateSlotBundleBasePrice(bundleItem)
  const extras = calculateSlotBundleExtras(bundleItem.slots)
  return Math.round((base + extras) * bundleItem.quantity * 100) / 100
}

export function calculateSlotBundleSavings(bundleItem: CartBundleItem): number {
  const originalTotal = bundleItem.slots.reduce(
    (sum, s) => sum + s.menuItemPrice * s.quantity, 0
  )
  const base = calculateSlotBundleBasePrice(bundleItem)
  return Math.max(0, Math.round((originalTotal - base) * 100) / 100)
}

export function calculateTotalSlotBundleSavings(bundleItems: CartBundleItem[]): number {
  return bundleItems.reduce(
    (total, bi) => total + calculateSlotBundleSavings(bi) * bi.quantity, 0
  )
}
```

Also add the import at the top of `cart-utils.ts`:
```typescript
import type { CartBundleSlotSelection } from '@/types/database'
```

Update `calculateFullCartTotal` and `getFullCartItemCount` to work with the new `CartBundleItem` shape (the `slots` array instead of `customizations`):

```typescript
export function calculateFullCartTotal(items: CartItem[], bundleItems: CartBundleItem[]): number {
  const itemsTotal = items.reduce((total, item) => total + item.subtotal, 0)
  const bundlesTotal = bundleItems.reduce((total, bi) => total + bi.subtotal, 0)
  return Math.round((itemsTotal + bundlesTotal) * 100) / 100
}

export function getFullCartItemCount(items: CartItem[], bundleItems: CartBundleItem[]): number {
  const regularCount = items.reduce((count, item) => count + item.quantity, 0)
  const bundleCount = bundleItems.reduce((count, bi) => {
    const itemsInBundle = bi.slots.reduce((s, slot) => s + slot.quantity, 0)
    return count + itemsInBundle * bi.quantity
  }, 0)
  return regularCount + bundleCount
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- --testPathPattern="cart-utils-bundle"`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cart-utils.ts tests/unit/lib/cart-utils-bundle.test.ts
git commit -m "feat(bundles): add slot-based bundle pricing functions with tests"
```

---

### Task 4: Update Bundles Service Layer

**Files:**
- Modify: `src/lib/bundles-service.ts`

- [ ] **Step 1: Rewrite Zod schemas for slot-based input**

Replace the existing schemas in `src/lib/bundles-service.ts`:

```typescript
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Bundle, BundleSlot, BundleSlotPriceOverride, BundleWithSlots } from '@/types/database'

export const bundleSlotPriceOverrideInputSchema = z.object({
  menu_item_id: z.string().uuid(),
  price_override: z.number().min(0),
})

export const bundleSlotInputSchema = z.object({
  name: z.string().min(1, 'Slot name is required'),
  category_id: z.string().uuid('Must select a category'),
  pick_count: z.number().int().min(1, 'Must pick at least 1 item').default(1),
  sort_order: z.number().int().min(0).default(0),
  price_overrides: z.array(bundleSlotPriceOverrideInputSchema).default([]),
})

export const bundleSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().optional().nullable(),
  image_url: z.string().url('Must be a valid URL').or(z.literal('')),
  pricing_type: z.enum(['fixed', 'discount']),
  fixed_price: z.number().min(0).optional().nullable(),
  discount_percent: z.number().min(1).max(100).optional().nullable(),
  is_active: z.boolean().default(true),
  show_on_menu: z.boolean().default(false),
  show_as_upsell: z.boolean().default(false),
  display_order: z.number().int().min(0).default(0),
  slots: z.array(bundleSlotInputSchema).min(1, 'Bundle must have at least one slot'),
})

export type BundleInput = z.infer<typeof bundleSchema>
```

- [ ] **Step 2: Rewrite query functions to use slots**

Replace all service functions. The main query pattern changes from joining `bundle_items` to joining `bundle_slots`:

```typescript
const BUNDLE_WITH_SLOTS_QUERY = `
  *,
  slots:bundle_slots(
    *,
    category:categories(*),
    price_overrides:bundle_slot_price_overrides(*),
    items:categories!inner(
      id,
      menu_items:menu_items(*)
    )
  )
`

// Note: The above nested join won't work directly. Instead, fetch slots and items separately.
// Simpler approach: fetch bundle with slots, then fetch items per category in application code.

const BUNDLE_SLOTS_QUERY = `
  *,
  slots:bundle_slots(
    *,
    category:categories(id, name, icon, icon_color),
    price_overrides:bundle_slot_price_overrides(*)
  )
`
```

Rewrite `getBundlesByTenant`:
```typescript
export async function getBundlesByTenant(tenantId: string): Promise<BundleWithSlots[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('bundles')
    .select(BUNDLE_SLOTS_QUERY)
    .eq('tenant_id', tenantId)
    .order('display_order', { ascending: true })

  if (error) throw new Error(`Failed to fetch bundles: ${error.message}`)
  return (data ?? []) as unknown as BundleWithSlots[]
}
```

Rewrite `getBundleById`:
```typescript
export async function getBundleById(bundleId: string, tenantId: string): Promise<BundleWithSlots> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('bundles')
    .select(BUNDLE_SLOTS_QUERY)
    .eq('id', bundleId)
    .eq('tenant_id', tenantId)
    .single()

  if (error) throw new Error(`Failed to fetch bundle: ${error.message}`)
  return data as unknown as BundleWithSlots
}
```

Rewrite `createBundle`:
```typescript
export async function createBundle(tenantId: string, input: BundleInput): Promise<BundleWithSlots> {
  const supabase = createAdminClient()
  const validated = bundleSchema.parse(input)

  const { data: bundle, error: bundleError } = await supabase
    .from('bundles')
    .insert({
      tenant_id: tenantId,
      name: validated.name,
      description: validated.description ?? null,
      image_url: validated.image_url || '',
      pricing_type: validated.pricing_type,
      fixed_price: validated.fixed_price ?? null,
      discount_percent: validated.discount_percent ?? null,
      is_active: validated.is_active,
      show_on_menu: validated.show_on_menu,
      show_as_upsell: validated.show_as_upsell,
      display_order: validated.display_order,
    })
    .select()
    .single()

  if (bundleError) throw new Error(`Failed to create bundle: ${bundleError.message}`)

  // Insert slots
  for (const slot of validated.slots) {
    const { data: slotData, error: slotError } = await supabase
      .from('bundle_slots')
      .insert({
        bundle_id: bundle.id,
        name: slot.name,
        category_id: slot.category_id,
        pick_count: slot.pick_count,
        sort_order: slot.sort_order,
      })
      .select()
      .single()

    if (slotError) throw new Error(`Failed to create slot: ${slotError.message}`)

    // Insert price overrides for this slot
    if (slot.price_overrides.length > 0) {
      const overrides = slot.price_overrides.map((po) => ({
        slot_id: slotData.id,
        menu_item_id: po.menu_item_id,
        price_override: po.price_override,
      }))
      const { error: overrideError } = await supabase
        .from('bundle_slot_price_overrides')
        .insert(overrides)

      if (overrideError) throw new Error(`Failed to create price overrides: ${overrideError.message}`)
    }
  }

  return getBundleById(bundle.id, tenantId)
}
```

Rewrite `updateBundle`:
```typescript
export async function updateBundle(
  bundleId: string,
  tenantId: string,
  input: BundleInput
): Promise<BundleWithSlots> {
  const supabase = createAdminClient()
  const validated = bundleSchema.parse(input)

  const { error: bundleError } = await supabase
    .from('bundles')
    .update({
      name: validated.name,
      description: validated.description ?? null,
      image_url: validated.image_url || '',
      pricing_type: validated.pricing_type,
      fixed_price: validated.fixed_price ?? null,
      discount_percent: validated.discount_percent ?? null,
      is_active: validated.is_active,
      show_on_menu: validated.show_on_menu,
      show_as_upsell: validated.show_as_upsell,
      display_order: validated.display_order,
    })
    .eq('id', bundleId)
    .eq('tenant_id', tenantId)

  if (bundleError) throw new Error(`Failed to update bundle: ${bundleError.message}`)

  // Delete existing slots (cascades to price_overrides)
  await supabase.from('bundle_slots').delete().eq('bundle_id', bundleId)

  // Re-insert slots
  for (const slot of validated.slots) {
    const { data: slotData, error: slotError } = await supabase
      .from('bundle_slots')
      .insert({
        bundle_id: bundleId,
        name: slot.name,
        category_id: slot.category_id,
        pick_count: slot.pick_count,
        sort_order: slot.sort_order,
      })
      .select()
      .single()

    if (slotError) throw new Error(`Failed to create slot: ${slotError.message}`)

    if (slot.price_overrides.length > 0) {
      const overrides = slot.price_overrides.map((po) => ({
        slot_id: slotData.id,
        menu_item_id: po.menu_item_id,
        price_override: po.price_override,
      }))
      const { error: overrideError } = await supabase
        .from('bundle_slot_price_overrides')
        .insert(overrides)

      if (overrideError) throw new Error(`Failed to create price overrides: ${overrideError.message}`)
    }
  }

  return getBundleById(bundleId, tenantId)
}
```

Keep `deleteBundle`, `toggleBundleActive`, `reorderBundles` largely the same (they operate on the `bundles` table, not items).

Rewrite `getMenuBundles` and `getUpsellBundles`:
```typescript
export async function getMenuBundles(tenantId: string): Promise<BundleWithSlots[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('bundles')
    .select(BUNDLE_SLOTS_QUERY)
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .eq('show_on_menu', true)
    .order('display_order', { ascending: true })

  if (error) throw new Error(`Failed to fetch menu bundles: ${error.message}`)
  // Filter out bundles with no valid slots
  return ((data ?? []) as unknown as BundleWithSlots[]).filter(b => b.slots.length > 0)
}

export async function getUpsellBundles(tenantId: string): Promise<BundleWithSlots[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('bundles')
    .select(BUNDLE_SLOTS_QUERY)
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .eq('show_as_upsell', true)
    .order('display_order', { ascending: true })

  if (error) throw new Error(`Failed to fetch upsell bundles: ${error.message}`)
  return ((data ?? []) as unknown as BundleWithSlots[]).filter(b => b.slots.length > 0)
}
```

Add a new helper to fetch menu items for a slot's category:
```typescript
export async function getSlotItems(
  categoryId: string,
  tenantId: string
): Promise<{ items: MenuItem[]; category: Category }> {
  const supabase = createAdminClient()

  const [{ data: items, error: itemsError }, { data: category, error: catError }] = await Promise.all([
    supabase
      .from('menu_items')
      .select('*')
      .eq('category_id', categoryId)
      .eq('tenant_id', tenantId)
      .eq('is_available', true)
      .order('order', { ascending: true }),
    supabase
      .from('categories')
      .select('*')
      .eq('id', categoryId)
      .single(),
  ])

  if (itemsError) throw new Error(`Failed to fetch slot items: ${itemsError.message}`)
  if (catError) throw new Error(`Failed to fetch category: ${catError.message}`)

  return { items: items ?? [], category }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/bundles-service.ts
git commit -m "feat(bundles): rewrite service layer for slot-based model"
```

---

### Task 5: Update Server Actions

**Files:**
- Modify: `src/app/actions/bundles.ts`

- [ ] **Step 1: Update server actions to use new service signatures**

The actions keep the same interface pattern but pass `BundleInput` with `slots` instead of `items`. Update imports and function bodies:

Replace the import:
```typescript
import {
  getBundlesByTenant,
  getBundleById,
  createBundle,
  updateBundle,
  deleteBundle,
  toggleBundleActive,
  reorderBundles,
  getMenuBundles,
  getUpsellBundles,
  bundleSchema,
  type BundleInput,
} from '@/lib/bundles-service'
import type { BundleWithSlots } from '@/types/database'
```

The action signatures stay the same — they pass through to the service layer. The only real change is the input type now contains `slots` instead of `items`. Ensure the actions use `BundleWithSlots` as their return type instead of `BundleWithItems`.

- [ ] **Step 2: Commit**

```bash
git add src/app/actions/bundles.ts
git commit -m "feat(bundles): update server actions for slot-based model"
```

---

### Task 6: Update Bundle Adapter

**Files:**
- Modify: `src/lib/bundle-adapter.ts`

- [ ] **Step 1: Update `bundleToMenuItem` to work with slots**

The adapter creates a `MenuItem` wrapper for display in the menu grid. Update it to derive info from slots instead of items:

```typescript
import type { BundleWithSlots, MenuItem } from '@/types/database'

export interface BundleMenuItem extends MenuItem {
  _isBundle: true
  _bundleData: BundleWithSlots
}

export function bundleToMenuItem(bundle: BundleWithSlots): BundleMenuItem {
  const slots = bundle.slots ?? []

  // Description from slot names
  const autoDescription = slots
    .map((s) => {
      const prefix = s.pick_count > 1 ? `${s.pick_count}× ` : ''
      return `${prefix}${s.name}`
    })
    .join(' + ')

  // Use bundle image or first slot category icon as fallback
  const imageUrl = bundle.image_url || ''

  // For fixed pricing, use fixed_price. For discount, we can't calculate without selections.
  // Show the base fixed price or 0 for discount (UI will show "From ₱X").
  const price = bundle.pricing_type === 'fixed'
    ? (bundle.fixed_price ?? 0)
    : 0

  return {
    id: `bundle_${bundle.id}`,
    tenant_id: bundle.tenant_id,
    category_id: 'bundles',
    name: bundle.name,
    description: bundle.description || autoDescription,
    price,
    discounted_price: undefined,
    image_url: imageUrl,
    variation_types: [],
    variations: [],
    addons: [],
    is_available: bundle.is_active,
    is_featured: false,
    order: bundle.display_order,
    created_at: bundle.created_at,
    updated_at: bundle.updated_at,
    _isBundle: true,
    _bundleData: bundle,
  }
}

export function isBundleMenuItem(item: MenuItem): item is BundleMenuItem {
  return '_isBundle' in item && (item as BundleMenuItem)._isBundle === true
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/bundle-adapter.ts
git commit -m "feat(bundles): update bundle adapter for slot-based model"
```

---

### Task 7: Update Cart Context (useCart)

**Files:**
- Modify: `src/hooks/useCart.tsx`

- [ ] **Step 1: Update bundle cart functions**

Update `addBundleToCart` to accept the new `CartBundleSlotSelection[]`:

```typescript
const addBundleToCart = useCallback(
  (bundleItem: Omit<CartBundleItem, 'id' | 'subtotal'>) => {
    const bundleCartId = `bundle_${bundleItem.bundleId}_${Date.now()}`
    const newBundleItem: CartBundleItem = {
      ...bundleItem,
      id: bundleCartId,
      subtotal: 0,
    }
    newBundleItem.subtotal = calculateSlotBundleSubtotal(newBundleItem)
    setBundleItems((prev) => [...prev, newBundleItem])
  },
  []
)
```

Update `updateBundleQuantity` to use `calculateSlotBundleSubtotal`:

```typescript
const updateBundleQuantity = useCallback((bundleCartId: string, quantity: number) => {
  if (quantity <= 0) {
    setBundleItems((prev) => prev.filter((bi) => bi.id !== bundleCartId))
    return
  }
  const clampedQuantity = Math.min(quantity, MAX_QUANTITY)
  setBundleItems((prev) =>
    prev.map((bi) => {
      if (bi.id === bundleCartId) {
        const updated = { ...bi, quantity: clampedQuantity }
        updated.subtotal = calculateSlotBundleSubtotal(updated)
        return updated
      }
      return bi
    })
  )
}, [])
```

Update the `CartContextType` interface:
```typescript
addBundleToCart: (bundleItem: Omit<CartBundleItem, 'id' | 'subtotal'>) => void
```

Update `isValidBundleItems` to validate the new shape:
```typescript
function isValidBundleItems(items: unknown): items is CartBundleItem[] {
  if (!Array.isArray(items)) return false
  return items.every((item) => {
    if (!item || typeof item !== 'object') return false
    const i = item as Record<string, unknown>
    return (
      typeof i.id === 'string' &&
      typeof i.bundleId === 'string' &&
      typeof i.bundleName === 'string' &&
      Array.isArray(i.slots) &&
      typeof i.quantity === 'number' &&
      i.quantity > 0 &&
      typeof i.subtotal === 'number'
    )
  })
}
```

Update Messenger sync to use slot names:
```typescript
const bundleCartItems = latestBundleItems.map(bi => ({
  name: `Bundle: ${bi.bundleName}`,
  quantity: bi.quantity,
  subtotal: bi.subtotal,
  variation: bi.slots.map(s => `${s.slotName}: ${s.menuItemName}`).join(', '),
}))
```

Update imports at top of file:
```typescript
import { calculateSlotBundleSubtotal, calculateFullCartTotal, getFullCartItemCount } from '@/lib/cart-utils'
import type { CartBundleItem } from '@/types/database'
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useCart.tsx
git commit -m "feat(bundles): update cart context for slot-based bundles"
```

---

### Task 8: Customer Bundle Wizard — Main Component

**Files:**
- Create: `src/components/customer/bundle-wizard.tsx`

- [ ] **Step 1: Create the wizard orchestrator component**

This component manages wizard state and renders the current step. It's the full-screen overlay that opens when a customer taps a bundle card.

```typescript
'use client'

import { useState, useCallback, useMemo } from 'react'
import { X } from 'lucide-react'
import type { BundleWithSlots, CartBundleSlotSelection, MenuItem, BundleSlotPriceOverride } from '@/types/database'
import type { BrandingColors } from '@/lib/branding-utils'
import { useCart } from '@/hooks/useCart'
import { calculateSlotBundleBasePrice, calculateSlotBundleExtras, formatPrice } from '@/lib/cart-utils'
import { BundleWizardSlotScreen } from './bundle-wizard-slot-screen'
import { BundleWizardCustomizeScreen } from './bundle-wizard-customize-screen'
import { BundleWizardReviewScreen } from './bundle-wizard-review-screen'
import { toast } from 'sonner'

interface BundleWizardProps {
  open: boolean
  onClose: () => void
  bundle: BundleWithSlots | null
  branding: BrandingColors
  hideCurrencySymbol?: boolean
}

type WizardStep =
  | { type: 'slot-select'; slotIndex: number }
  | { type: 'customize'; slotIndex: number; itemIndex: number }
  | { type: 'review' }

export function BundleWizard({ open, onClose, bundle, branding, hideCurrencySymbol }: BundleWizardProps) {
  const { addBundleToCart } = useCart()
  const [step, setStep] = useState<WizardStep>({ type: 'slot-select', slotIndex: 0 })
  const [slotSelections, setSlotSelections] = useState<Map<string, CartBundleSlotSelection[]>>(new Map())

  const slots = useMemo(() => {
    if (!bundle) return []
    return [...bundle.slots].sort((a, b) => a.sort_order - b.sort_order)
  }, [bundle])

  const totalSlots = slots.length

  const resetWizard = useCallback(() => {
    setStep({ type: 'slot-select', slotIndex: 0 })
    setSlotSelections(new Map())
  }, [])

  const handleClose = useCallback(() => {
    resetWizard()
    onClose()
  }, [onClose, resetWizard])

  const getPriceOverride = useCallback(
    (slotId: string, menuItemId: string): number => {
      const slot = slots.find((s) => s.id === slotId)
      if (!slot?.price_overrides) return 0
      const override = slot.price_overrides.find((po) => po.menu_item_id === menuItemId)
      return override?.price_override ?? 0
    },
    [slots]
  )

  const allSelections = useMemo(() => {
    return Array.from(slotSelections.values()).flat()
  }, [slotSelections])

  const runningTotal = useMemo(() => {
    if (!bundle) return 0
    const tempBundleItem = {
      id: 'temp',
      bundleId: bundle.id,
      bundleName: bundle.name,
      slots: allSelections,
      quantity: 1,
      pricingType: bundle.pricing_type as 'fixed' | 'discount',
      basePrice: bundle.fixed_price ?? 0,
      discountPercent: bundle.discount_percent ?? undefined,
      subtotal: 0,
    }
    const base = calculateSlotBundleBasePrice(tempBundleItem)
    const extras = calculateSlotBundleExtras(allSelections)
    return base + extras
  }, [bundle, allSelections])

  const handleSlotItemsSelected = useCallback(
    (slotId: string, selections: CartBundleSlotSelection[]) => {
      setSlotSelections((prev) => {
        const next = new Map(prev)
        next.set(slotId, selections)
        return next
      })
    },
    []
  )

  const handleSlotComplete = useCallback(
    (slotIndex: number, selections: CartBundleSlotSelection[]) => {
      const slot = slots[slotIndex]
      handleSlotItemsSelected(slot.id, selections)

      // Check if any selected item needs customization
      const needsCustomize = selections.some(
        (s) => {
          const item = slot.items?.find((i) => i.id === s.menuItemId)
          if (!item) return false
          return (item.variation_types?.length ?? 0) > 0 || (item.addons?.length ?? 0) > 0
        }
      )

      if (needsCustomize) {
        setStep({ type: 'customize', slotIndex, itemIndex: 0 })
      } else if (slotIndex < totalSlots - 1) {
        setStep({ type: 'slot-select', slotIndex: slotIndex + 1 })
      } else {
        setStep({ type: 'review' })
      }
    },
    [slots, totalSlots, handleSlotItemsSelected]
  )

  const handleCustomizeComplete = useCallback(
    (slotIndex: number, updatedSelections: CartBundleSlotSelection[]) => {
      const slot = slots[slotIndex]
      handleSlotItemsSelected(slot.id, updatedSelections)

      if (slotIndex < totalSlots - 1) {
        setStep({ type: 'slot-select', slotIndex: slotIndex + 1 })
      } else {
        setStep({ type: 'review' })
      }
    },
    [slots, totalSlots, handleSlotItemsSelected]
  )

  const handleBack = useCallback(() => {
    if (step.type === 'customize') {
      setStep({ type: 'slot-select', slotIndex: step.slotIndex })
    } else if (step.type === 'slot-select' && step.slotIndex > 0) {
      setStep({ type: 'slot-select', slotIndex: step.slotIndex - 1 })
    } else if (step.type === 'review') {
      setStep({ type: 'slot-select', slotIndex: totalSlots - 1 })
    }
  }, [step, totalSlots])

  const handleEditSlot = useCallback((slotIndex: number) => {
    setStep({ type: 'slot-select', slotIndex })
  }, [])

  const handleAddToCart = useCallback(() => {
    if (!bundle) return
    addBundleToCart({
      bundleId: bundle.id,
      bundleName: bundle.name,
      slots: allSelections,
      quantity: 1,
      pricingType: bundle.pricing_type as 'fixed' | 'discount',
      basePrice: bundle.fixed_price ?? 0,
      discountPercent: bundle.discount_percent ?? undefined,
    })
    toast.success(`${bundle.name} added to cart!`)
    handleClose()
  }, [bundle, allSelections, addBundleToCart, handleClose])

  if (!open || !bundle) return null

  const currentSlotIndex = step.type === 'slot-select' || step.type === 'customize'
    ? step.slotIndex
    : totalSlots

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Progress bar */}
      <div className="flex gap-1 px-4 pt-4">
        {slots.map((_, i) => (
          <div
            key={i}
            className="flex-1 h-1 rounded-full transition-colors"
            style={{
              backgroundColor: i < currentSlotIndex
                ? branding.success
                : i === currentSlotIndex && step.type !== 'review'
                  ? branding.primary
                  : branding.border,
            }}
          />
        ))}
        <div
          className="flex-1 h-1 rounded-full transition-colors"
          style={{
            backgroundColor: step.type === 'review' ? branding.primary : branding.border,
          }}
        />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <button onClick={step.type === 'slot-select' && step.slotIndex === 0 ? handleClose : handleBack}>
          <span className="text-sm" style={{ color: branding.textSecondary }}>
            {step.type === 'slot-select' && step.slotIndex === 0 ? '✕ Close' : '← Back'}
          </span>
        </button>
        <span className="text-sm" style={{ color: branding.textSecondary }}>
          {step.type === 'review'
            ? 'Review'
            : `Step ${currentSlotIndex + 1} of ${totalSlots}`}
        </span>
        <button onClick={handleClose}>
          <X className="w-5 h-5" style={{ color: branding.textSecondary }} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {step.type === 'slot-select' && (
          <BundleWizardSlotScreen
            slot={slots[step.slotIndex]}
            existingSelections={slotSelections.get(slots[step.slotIndex]?.id) ?? []}
            getPriceOverride={getPriceOverride}
            branding={branding}
            hideCurrencySymbol={hideCurrencySymbol}
            onComplete={(selections) => handleSlotComplete(step.slotIndex, selections)}
          />
        )}
        {step.type === 'customize' && (
          <BundleWizardCustomizeScreen
            slot={slots[step.slotIndex]}
            selections={slotSelections.get(slots[step.slotIndex]?.id) ?? []}
            branding={branding}
            hideCurrencySymbol={hideCurrencySymbol}
            onComplete={(updated) => handleCustomizeComplete(step.slotIndex, updated)}
          />
        )}
        {step.type === 'review' && (
          <BundleWizardReviewScreen
            bundle={bundle}
            slots={slots}
            slotSelections={slotSelections}
            branding={branding}
            hideCurrencySymbol={hideCurrencySymbol}
            onEditSlot={handleEditSlot}
            onAddToCart={handleAddToCart}
            runningTotal={runningTotal}
          />
        )}
      </div>

      {/* Bottom bar (not on review — review has its own CTA) */}
      {step.type !== 'review' && (
        <div
          className="border-t px-4 py-3 flex items-center justify-between"
          style={{ borderColor: branding.border, backgroundColor: branding.cardsColor }}
        >
          <div>
            <div className="text-xs" style={{ color: branding.textSecondary }}>Running total</div>
            <div className="text-lg font-bold" style={{ color: branding.textPrimary }}>
              {formatPrice(runningTotal, { hideCurrencySymbol })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/customer/bundle-wizard.tsx
git commit -m "feat(bundles): add bundle wizard orchestrator component"
```

---

### Task 9: Customer Bundle Wizard — Slot Selection Screen

**Files:**
- Create: `src/components/customer/bundle-wizard-slot-screen.tsx`

- [ ] **Step 1: Create the slot item selection screen**

```typescript
'use client'

import { useState, useCallback } from 'react'
import Image from 'next/image'
import type { BundleSlot, CartBundleSlotSelection, MenuItem } from '@/types/database'
import type { BrandingColors } from '@/lib/branding-utils'
import { formatPrice } from '@/lib/cart-utils'
import { Check } from 'lucide-react'

interface BundleWizardSlotScreenProps {
  slot: BundleSlot
  existingSelections: CartBundleSlotSelection[]
  getPriceOverride: (slotId: string, menuItemId: string) => number
  branding: BrandingColors
  hideCurrencySymbol?: boolean
  onComplete: (selections: CartBundleSlotSelection[]) => void
}

export function BundleWizardSlotScreen({
  slot,
  existingSelections,
  getPriceOverride,
  branding,
  hideCurrencySymbol,
  onComplete,
}: BundleWizardSlotScreenProps) {
  const items = slot.items ?? []
  const [selectedIds, setSelectedIds] = useState<string[]>(
    existingSelections.map((s) => s.menuItemId)
  )

  const toggleItem = useCallback(
    (item: MenuItem) => {
      setSelectedIds((prev) => {
        if (prev.includes(item.id)) {
          return prev.filter((id) => id !== item.id)
        }
        if (prev.length >= slot.pick_count) {
          // Replace the oldest selection
          return [...prev.slice(1), item.id]
        }
        return [...prev, item.id]
      })
    },
    [slot.pick_count]
  )

  const handleNext = useCallback(() => {
    const selections: CartBundleSlotSelection[] = selectedIds.map((itemId, i) => {
      const item = items.find((it) => it.id === itemId)!
      const existing = existingSelections.find((s) => s.menuItemId === itemId)
      const priceOverride = getPriceOverride(slot.id, itemId)

      return existing ?? {
        slotId: slot.id,
        slotName: slot.name,
        menuItemId: item.id,
        menuItemName: item.name,
        menuItemImage: item.image_url || null,
        menuItemPrice: item.price,
        quantity: 1,
        selectedAddons: [],
        priceOverride,
      }
    })
    onComplete(selections)
  }, [selectedIds, items, existingSelections, getPriceOverride, slot, onComplete])

  const isReady = selectedIds.length === slot.pick_count

  return (
    <div className="px-4 pb-24">
      <h2 className="text-xl font-bold mb-1" style={{ color: branding.textPrimary }}>
        {slot.name}
      </h2>
      <p className="text-sm mb-4" style={{ color: branding.textSecondary }}>
        Pick {slot.pick_count} from {slot.category?.name ?? 'this category'}
      </p>

      <div className="grid grid-cols-2 gap-3">
        {items.map((item) => {
          const isSelected = selectedIds.includes(item.id)
          const selectionIndex = selectedIds.indexOf(item.id)
          const priceOverride = getPriceOverride(slot.id, item.id)

          return (
            <button
              key={item.id}
              onClick={() => toggleItem(item)}
              className="relative rounded-xl overflow-hidden text-left transition-all"
              style={{
                backgroundColor: branding.cardsColor,
                border: `2px solid ${isSelected ? branding.success : 'transparent'}`,
              }}
            >
              {/* Image */}
              <div className="aspect-[4/3] relative bg-muted">
                {item.image_url ? (
                  <Image
                    src={item.image_url}
                    alt={item.name}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 50vw, 33vw"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-2xl">
                    🍽️
                  </div>
                )}
              </div>

              {/* Selection badge */}
              {isSelected && (
                <div
                  className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold"
                  style={{ backgroundColor: branding.success, color: '#fff' }}
                >
                  {slot.pick_count > 1 ? selectionIndex + 1 : <Check className="w-4 h-4" />}
                </div>
              )}

              {/* Content */}
              <div className="p-3">
                <div className="text-sm font-semibold truncate" style={{ color: branding.textPrimary }}>
                  {item.name}
                </div>
                <div className="text-xs mt-0.5" style={{
                  color: priceOverride > 0 ? branding.warning : branding.success,
                }}>
                  {priceOverride > 0
                    ? `+ ${formatPrice(priceOverride, { hideCurrencySymbol })}`
                    : 'Included'}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Next button (fixed at bottom) */}
      <div className="fixed bottom-0 left-0 right-0 p-4 border-t"
        style={{ borderColor: branding.border, backgroundColor: branding.background }}>
        <button
          onClick={handleNext}
          disabled={!isReady}
          className="w-full py-3.5 rounded-xl font-semibold text-base transition-opacity disabled:opacity-40"
          style={{ backgroundColor: branding.primary, color: '#fff' }}
        >
          Next →
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/customer/bundle-wizard-slot-screen.tsx
git commit -m "feat(bundles): add wizard slot selection screen"
```

---

### Task 10: Customer Bundle Wizard — Customize Screen

**Files:**
- Create: `src/components/customer/bundle-wizard-customize-screen.tsx`

- [ ] **Step 1: Create the customization screen**

This screen lets the customer customize variations and addons for each selected item in the slot. It iterates through each selection that has customizable options.

```typescript
'use client'

import { useState, useCallback } from 'react'
import Image from 'next/image'
import type { BundleSlot, CartBundleSlotSelection, Variation, VariationOption, Addon } from '@/types/database'
import type { BrandingColors } from '@/lib/branding-utils'
import { formatPrice } from '@/lib/cart-utils'
import { Check } from 'lucide-react'

interface BundleWizardCustomizeScreenProps {
  slot: BundleSlot
  selections: CartBundleSlotSelection[]
  branding: BrandingColors
  hideCurrencySymbol?: boolean
  onComplete: (updatedSelections: CartBundleSlotSelection[]) => void
}

export function BundleWizardCustomizeScreen({
  slot,
  selections,
  branding,
  hideCurrencySymbol,
  onComplete,
}: BundleWizardCustomizeScreenProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [updatedSelections, setUpdatedSelections] = useState<CartBundleSlotSelection[]>(selections)

  const items = slot.items ?? []

  // Find items that need customization
  const customizableIndices = selections
    .map((sel, i) => {
      const item = items.find((it) => it.id === sel.menuItemId)
      if (!item) return -1
      const hasVariations = (item.variation_types?.length ?? 0) > 0 || (item.variations?.length ?? 0) > 0
      const hasAddons = (item.addons?.length ?? 0) > 0
      return hasVariations || hasAddons ? i : -1
    })
    .filter((i) => i !== -1)

  const currentSelIndex = customizableIndices[currentIndex]
  const currentSelection = updatedSelections[currentSelIndex]
  const currentItem = items.find((it) => it.id === currentSelection?.menuItemId)

  const handleVariationSelect = useCallback(
    (typeId: string, option: VariationOption) => {
      setUpdatedSelections((prev) => {
        const next = [...prev]
        const sel = { ...next[currentSelIndex] }
        sel.selectedVariations = { ...(sel.selectedVariations ?? {}), [typeId]: option }
        next[currentSelIndex] = sel
        return next
      })
    },
    [currentSelIndex]
  )

  const handleLegacyVariationSelect = useCallback(
    (variation: Variation) => {
      setUpdatedSelections((prev) => {
        const next = [...prev]
        const sel = { ...next[currentSelIndex] }
        sel.selectedVariation = variation
        next[currentSelIndex] = sel
        return next
      })
    },
    [currentSelIndex]
  )

  const handleAddonToggle = useCallback(
    (addon: Addon) => {
      setUpdatedSelections((prev) => {
        const next = [...prev]
        const sel = { ...next[currentSelIndex] }
        const existing = sel.selectedAddons.find((a) => a.id === addon.id)
        sel.selectedAddons = existing
          ? sel.selectedAddons.filter((a) => a.id !== addon.id)
          : [...sel.selectedAddons, addon]
        next[currentSelIndex] = sel
        return next
      })
    },
    [currentSelIndex]
  )

  const handleNext = useCallback(() => {
    if (currentIndex < customizableIndices.length - 1) {
      setCurrentIndex((prev) => prev + 1)
    } else {
      onComplete(updatedSelections)
    }
  }, [currentIndex, customizableIndices.length, onComplete, updatedSelections])

  if (!currentItem || !currentSelection) return null

  const isLastCustomizable = currentIndex === customizableIndices.length - 1

  return (
    <div className="px-4 pb-24">
      {/* Item header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-14 h-14 rounded-lg overflow-hidden relative bg-muted flex-shrink-0">
          {currentItem.image_url ? (
            <Image src={currentItem.image_url} alt={currentItem.name} fill className="object-cover" sizes="56px" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xl">🍽️</div>
          )}
        </div>
        <div>
          <h2 className="text-lg font-bold" style={{ color: branding.textPrimary }}>
            {currentItem.name}
          </h2>
          {currentSelection.priceOverride > 0 && (
            <p className="text-sm" style={{ color: branding.warning }}>
              + {formatPrice(currentSelection.priceOverride, { hideCurrencySymbol })} premium
            </p>
          )}
        </div>
      </div>

      {customizableIndices.length > 1 && (
        <p className="text-xs mb-4" style={{ color: branding.textSecondary }}>
          Customizing {currentIndex + 1} of {customizableIndices.length} items
        </p>
      )}

      {/* Grouped Variations */}
      {currentItem.variation_types?.map((vt) => (
        <div key={vt.id} className="mb-5">
          <p className="text-sm font-semibold mb-2" style={{ color: branding.textPrimary }}>
            {vt.name}
            {vt.is_required && <span className="text-red-500 ml-0.5">*</span>}
          </p>
          <div className="flex flex-wrap gap-2">
            {vt.options.map((opt) => {
              const isSelected = currentSelection.selectedVariations?.[vt.id]?.id === opt.id
              return (
                <button
                  key={opt.id}
                  onClick={() => handleVariationSelect(vt.id, opt)}
                  className="px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
                  style={{
                    backgroundColor: isSelected ? branding.primary : branding.cardsColor,
                    color: isSelected ? '#fff' : branding.textPrimary,
                    border: `1.5px solid ${isSelected ? branding.primary : branding.border}`,
                  }}
                >
                  {opt.name}
                  {opt.price_modifier > 0 && (
                    <span className="ml-1 opacity-75">
                      +{formatPrice(opt.price_modifier, { hideCurrencySymbol })}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      ))}

      {/* Legacy Variations */}
      {!currentItem.variation_types?.length && currentItem.variations?.length ? (
        <div className="mb-5">
          <p className="text-sm font-semibold mb-2" style={{ color: branding.textPrimary }}>Size</p>
          <div className="flex flex-wrap gap-2">
            {currentItem.variations.map((v) => {
              const isSelected = currentSelection.selectedVariation?.id === v.id
              return (
                <button
                  key={v.id}
                  onClick={() => handleLegacyVariationSelect(v)}
                  className="px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
                  style={{
                    backgroundColor: isSelected ? branding.primary : branding.cardsColor,
                    color: isSelected ? '#fff' : branding.textPrimary,
                    border: `1.5px solid ${isSelected ? branding.primary : branding.border}`,
                  }}
                >
                  {v.name}
                  {v.price_modifier > 0 && (
                    <span className="ml-1 opacity-75">
                      +{formatPrice(v.price_modifier, { hideCurrencySymbol })}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      {/* Addons */}
      {currentItem.addons && currentItem.addons.length > 0 && (
        <div className="mb-5">
          <p className="text-sm font-semibold mb-2" style={{ color: branding.textPrimary }}>Add-ons</p>
          <div className="flex flex-col gap-2">
            {currentItem.addons.map((addon) => {
              const isSelected = currentSelection.selectedAddons.some((a) => a.id === addon.id)
              return (
                <button
                  key={addon.id}
                  onClick={() => handleAddonToggle(addon)}
                  className="flex items-center justify-between px-4 py-3 rounded-lg transition-all"
                  style={{
                    backgroundColor: branding.cardsColor,
                    border: `1.5px solid ${isSelected ? branding.success : branding.border}`,
                  }}
                >
                  <div>
                    <span className="text-sm" style={{ color: branding.textPrimary }}>{addon.name}</span>
                    <span className="text-xs ml-2" style={{ color: branding.warning }}>
                      +{formatPrice(addon.price, { hideCurrencySymbol })}
                    </span>
                  </div>
                  {isSelected && (
                    <div
                      className="w-5 h-5 rounded flex items-center justify-center"
                      style={{ backgroundColor: branding.success }}
                    >
                      <Check className="w-3.5 h-3.5 text-white" />
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Next button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 border-t"
        style={{ borderColor: branding.border, backgroundColor: branding.background }}>
        <button
          onClick={handleNext}
          className="w-full py-3.5 rounded-xl font-semibold text-base"
          style={{ backgroundColor: branding.primary, color: '#fff' }}
        >
          {isLastCustomizable ? 'Continue →' : 'Next item →'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/customer/bundle-wizard-customize-screen.tsx
git commit -m "feat(bundles): add wizard customize screen for variations/addons"
```

---

### Task 11: Customer Bundle Wizard — Review Screen

**Files:**
- Create: `src/components/customer/bundle-wizard-review-screen.tsx`

- [ ] **Step 1: Create the review screen**

```typescript
'use client'

import Image from 'next/image'
import type { BundleWithSlots, BundleSlot, CartBundleSlotSelection } from '@/types/database'
import type { BrandingColors } from '@/lib/branding-utils'
import { calculateSlotBundleBasePrice, calculateSlotBundleExtras, calculateSlotBundleSavings, formatPrice } from '@/lib/cart-utils'

interface BundleWizardReviewScreenProps {
  bundle: BundleWithSlots
  slots: BundleSlot[]
  slotSelections: Map<string, CartBundleSlotSelection[]>
  branding: BrandingColors
  hideCurrencySymbol?: boolean
  onEditSlot: (slotIndex: number) => void
  onAddToCart: () => void
  runningTotal: number
}

export function BundleWizardReviewScreen({
  bundle,
  slots,
  slotSelections,
  branding,
  hideCurrencySymbol,
  onEditSlot,
  onAddToCart,
  runningTotal,
}: BundleWizardReviewScreenProps) {
  const allSelections = Array.from(slotSelections.values()).flat()
  const tempBundleItem = {
    id: 'temp',
    bundleId: bundle.id,
    bundleName: bundle.name,
    slots: allSelections,
    quantity: 1,
    pricingType: bundle.pricing_type as 'fixed' | 'discount',
    basePrice: bundle.fixed_price ?? 0,
    discountPercent: bundle.discount_percent ?? undefined,
    subtotal: 0,
  }

  const basePrice = calculateSlotBundleBasePrice(tempBundleItem)
  const extras = calculateSlotBundleExtras(allSelections)
  const premiumTotal = allSelections.reduce((sum, s) => sum + s.priceOverride, 0)
  const customizationTotal = extras - premiumTotal
  const savings = calculateSlotBundleSavings(tempBundleItem)
  const originalTotal = allSelections.reduce((sum, s) => sum + s.menuItemPrice * s.quantity, 0)

  return (
    <div className="px-4 pb-24">
      <h2 className="text-xl font-bold mb-1" style={{ color: branding.textPrimary }}>
        {bundle.name}
      </h2>
      <p className="text-sm mb-4" style={{ color: branding.textSecondary }}>
        Review your selections
      </p>

      {/* Slot summaries */}
      <div className="flex flex-col gap-3 mb-6">
        {slots.map((slot, i) => {
          const selections = slotSelections.get(slot.id) ?? []
          return (
            <div
              key={slot.id}
              className="rounded-xl p-4"
              style={{ backgroundColor: branding.cardsColor, border: `1px solid ${branding.border}` }}
            >
              {selections.map((sel) => (
                <div key={sel.menuItemId} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg overflow-hidden relative bg-muted flex-shrink-0">
                      {sel.menuItemImage ? (
                        <Image src={sel.menuItemImage} alt={sel.menuItemName} fill className="object-cover" sizes="48px" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-lg">🍽️</div>
                      )}
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wide" style={{ color: branding.textMuted }}>
                        {slot.name}
                      </div>
                      <div className="text-sm font-semibold" style={{ color: branding.textPrimary }}>
                        {sel.menuItemName}
                      </div>
                      <div className="text-xs" style={{ color: branding.textSecondary }}>
                        {[
                          sel.selectedVariation?.name,
                          ...(sel.selectedVariations
                            ? Object.values(sel.selectedVariations).map((v) => v.name)
                            : []),
                          ...sel.selectedAddons.map((a) => a.name),
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'No customizations'}
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-xs" style={{
                      color: sel.priceOverride > 0 ? branding.warning : branding.success,
                    }}>
                      {sel.priceOverride > 0
                        ? `+ ${formatPrice(sel.priceOverride, { hideCurrencySymbol })}`
                        : 'Included'}
                    </div>
                    <button
                      onClick={() => onEditSlot(i)}
                      className="text-xs mt-1"
                      style={{ color: branding.link }}
                    >
                      Edit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        })}
      </div>

      {/* Pricing breakdown */}
      <div
        className="rounded-xl p-4 mb-6"
        style={{
          backgroundColor: `${branding.success}10`,
          border: `1px solid ${branding.success}30`,
        }}
      >
        <div className="flex justify-between text-sm mb-1.5">
          <span style={{ color: branding.textSecondary }}>
            {bundle.pricing_type === 'fixed' ? 'Bundle price' : `${bundle.discount_percent}% off`}
          </span>
          <span style={{ color: branding.textPrimary }}>
            {formatPrice(basePrice, { hideCurrencySymbol })}
          </span>
        </div>
        {premiumTotal > 0 && (
          <div className="flex justify-between text-sm mb-1.5">
            <span style={{ color: branding.textSecondary }}>Premium selections</span>
            <span style={{ color: branding.warning }}>
              + {formatPrice(premiumTotal, { hideCurrencySymbol })}
            </span>
          </div>
        )}
        {customizationTotal > 0 && (
          <div className="flex justify-between text-sm mb-1.5">
            <span style={{ color: branding.textSecondary }}>Add-ons & extras</span>
            <span style={{ color: branding.warning }}>
              + {formatPrice(customizationTotal, { hideCurrencySymbol })}
            </span>
          </div>
        )}
        <div
          className="flex justify-between text-base font-bold pt-2.5 mt-2.5"
          style={{ borderTop: `1px solid ${branding.success}30`, color: branding.textPrimary }}
        >
          <span>Total</span>
          <span>{formatPrice(runningTotal, { hideCurrencySymbol })}</span>
        </div>
        {savings > 0 && (
          <div className="flex justify-between text-sm mt-1">
            <span style={{ color: branding.success }}>You save</span>
            <span className="font-semibold" style={{ color: branding.success }}>
              {formatPrice(savings, { hideCurrencySymbol })}
            </span>
          </div>
        )}
      </div>

      {/* Add to cart CTA */}
      <div className="fixed bottom-0 left-0 right-0 p-4 border-t"
        style={{ borderColor: branding.border, backgroundColor: branding.background }}>
        <button
          onClick={onAddToCart}
          className="w-full py-3.5 rounded-xl font-bold text-base"
          style={{ backgroundColor: branding.success, color: '#fff' }}
        >
          Add Bundle to Cart — {formatPrice(runningTotal, { hideCurrencySymbol })}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/customer/bundle-wizard-review-screen.tsx
git commit -m "feat(bundles): add wizard review screen with pricing breakdown"
```

---

### Task 12: Update Bundle Card for Slots

**Files:**
- Modify: `src/components/customer/bundle-card.tsx`

- [ ] **Step 1: Update the card to show slots instead of fixed items**

Rewrite `bundle-card.tsx` to show slot icons and "From ₱X" pricing. The card now receives `BundleWithSlots` instead of `BundleWithItems`. Show slot pills, "From" prefix on price, and "Save up to" on savings badge. When no hero image is provided, show slot category icons in a row.

Key changes:
- Props type: `bundle: BundleWithSlots`
- Price display: `"From {formatPrice(bundle.fixed_price)}"` for fixed, or remove price for discount
- Slot pills: `"{pick_count} {slot.category?.name}"` for each slot
- Savings badge: `"Save up to ₱X"` (estimate using cheapest items per slot)
- Image area: Hero image if set, otherwise slot icons row

- [ ] **Step 2: Commit**

```bash
git add src/components/customer/bundle-card.tsx
git commit -m "feat(bundles): update bundle card for slot-based display"
```

---

### Task 13: Wire Up Wizard in Menu Page

**Files:**
- Modify: `src/app/[tenant]/menu/menu-server.tsx`
- Modify: `src/app/[tenant]/menu/menu-client.tsx`

- [ ] **Step 1: Update menu-server.tsx bundle query**

Replace the bundle query to use slots:
```typescript
const bundlesQuery = tenant.bundles_enabled
  ? supabase
      .from('bundles')
      .select(`
        *,
        slots:bundle_slots(
          *,
          category:categories(id, name, icon, icon_color),
          price_overrides:bundle_slot_price_overrides(*)
        )
      `)
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .eq('show_on_menu', true)
      .order('display_order', { ascending: true })
  : Promise.resolve({ data: null, error: null })
```

After fetching bundles, for each bundle's slots, fetch the menu items per category:
```typescript
// Populate slot items from their categories
if (bundlesData) {
  for (const bundle of bundlesData) {
    for (const slot of (bundle as any).slots ?? []) {
      const { data: slotItems } = await supabase
        .from('menu_items')
        .select('*')
        .eq('category_id', slot.category_id)
        .eq('tenant_id', tenant.id)
        .eq('is_available', true)
        .order('order', { ascending: true })
      slot.items = slotItems ?? []
    }
  }
}
```

- [ ] **Step 2: Update menu-client.tsx to use BundleWizard**

Replace the `BundleCustomizationModal` dynamic import with `BundleWizard`:
```typescript
const BundleWizard = dynamic(
  () => import('@/components/customer/bundle-wizard').then((m) => ({ default: m.BundleWizard })),
  { ssr: false }
)
```

Replace the modal usage:
```typescript
<BundleWizard
  open={!!selectedBundle}
  onClose={() => setSelectedBundle(null)}
  bundle={selectedBundle}
  branding={branding}
  hideCurrencySymbol={tenant?.hide_currency_symbol}
/>
```

- [ ] **Step 3: Commit**

```bash
git add src/app/[tenant]/menu/menu-server.tsx src/app/[tenant]/menu/menu-client.tsx
git commit -m "feat(bundles): wire up slot-based wizard in menu page"
```

---

### Task 14: Update Admin Bundle Form

**Files:**
- Modify: `src/components/admin/bundle-form.tsx`

- [ ] **Step 1: Rewrite the admin form for 5-step slot-based wizard**

This is the largest UI change. The form changes from 4 steps to 5 steps:
1. Basic Info (same)
2. Slots (new — add/remove slots, pick category, set pick count)
3. Price Overrides (new — per-item pricing within each slot)
4. Pricing (same — fixed vs discount)
5. Visibility & Review (same)

Key changes:
- `STEP_TITLES` becomes `['Basic Info', 'Slots', 'Price Overrides', 'Pricing', 'Visibility & Review']`
- Replace `BundleItemEntry` state with `BundleSlotEntry`:
```typescript
interface BundleSlotEntry {
  id: string // temp client-side ID
  name: string
  category_id: string
  pick_count: number
  sort_order: number
  price_overrides: { menu_item_id: string; price_override: number }[]
}
```
- Step 2 renders: slot cards with name input, category dropdown (from `categories` prop), pick count input, drag-to-reorder, add/remove
- Step 3 renders: for each slot, list items from that slot's category. Each item row has "Included" default or "+₱" input
- Props: add `categories: Category[]` (fetched in the admin page)
- Form submit builds `BundleInput` with `slots` array from `BundleSlotEntry[]`

The admin page (`bundles/new/page.tsx` and `bundles/[id]/page.tsx`) needs to also fetch and pass `categories`:
```typescript
const categories = await getCategoriesByTenant(tenant.id)
// Pass to BundleForm
<BundleForm ... categories={categories} />
```

- [ ] **Step 2: Update admin pages to pass categories**

Modify `src/app/[tenant]/admin/bundles/new/page.tsx`:
```typescript
import { getCategoriesByTenant } from '@/lib/admin-service'
// ...
const categories = await getCategoriesByTenant(tenant.id)
// ...
<BundleForm
  tenantId={tenant.id}
  tenantSlug={tenantSlug}
  menuItems={menuItems}
  categories={categories}
  suggestedItemIds={suggestedItemIds}
  suggestedDiscount={suggestedDiscount}
/>
```

Same for `src/app/[tenant]/admin/bundles/[id]/page.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/bundle-form.tsx src/app/[tenant]/admin/bundles/new/page.tsx src/app/[tenant]/admin/bundles/[id]/page.tsx
git commit -m "feat(bundles): rewrite admin form for slot-based configuration"
```

---

### Task 15: Update Bundle Upsell Modal

**Files:**
- Modify: `src/components/customer/bundle-upsell-modal.tsx`

- [ ] **Step 1: Update upsell trigger to be category-based**

The upsell modal now checks if the added item's category matches any slot's category in upsell bundles. Update the trigger logic in `menu-client.tsx` where the upsell check happens:

```typescript
// When customer adds an item, check if its category is in any upsell bundle's slots
const matchingUpsellBundle = upsellBundles.find((bundle) =>
  bundle.slots.some((slot) => slot.category_id === addedItem.category_id)
)
```

The modal component itself stays mostly the same — it shows the bundle info and "Upgrade to Bundle" button. The `onAccept` callback opens the wizard instead of the old customization modal.

- [ ] **Step 2: Commit**

```bash
git add src/components/customer/bundle-upsell-modal.tsx src/app/[tenant]/menu/menu-client.tsx
git commit -m "feat(bundles): update upsell trigger for category-based slot matching"
```

---

### Task 16: Add Analytics Tracking to Wizard

**Files:**
- Modify: `src/components/customer/bundle-wizard.tsx`

- [ ] **Step 1: Add analytics events to the wizard**

Import the analytics hook and fire events at key points in `bundle-wizard.tsx`:

```typescript
import { useAnalytics } from '@/hooks/use-analytics'
```

In the component body:
```typescript
const { trackEvent } = useAnalytics()
```

Fire events:
- On wizard open (when `open` becomes true): `trackEvent('bundle_wizard_started', { bundleId: bundle.id, bundleName: bundle.name, slotCount: slots.length })`
- In `handleSlotComplete`: `trackEvent('bundle_slot_selected', { bundleId: bundle.id, slotId: slot.id, slotName: slot.name, menuItemId: selections[0]?.menuItemId, stepNumber: slotIndex + 1 })`
- In `handleCustomizeComplete`: `trackEvent('bundle_customized', { bundleId: bundle.id, slotId: slots[slotIndex].id, menuItemId: updatedSelections[0]?.menuItemId })`
- In `handleAddToCart`: `trackEvent('bundle_added_to_cart', { bundleId: bundle.id, bundleName: bundle.name, totalPrice: runningTotal, savingsAmount: savings })`
- In `handleClose` (when not on first step and not completing): `trackEvent('bundle_wizard_abandoned', { bundleId: bundle.id, lastCompletedStep: currentSlotIndex, totalSteps: totalSlots })`

- [ ] **Step 2: Commit**

```bash
git add src/components/customer/bundle-wizard.tsx
git commit -m "feat(bundles): add analytics tracking to bundle wizard"
```

---

### Task 17: Cleanup — Remove Old Bundle Components and Functions

**Files:**
- Delete: `src/components/customer/bundle-customization-modal.tsx`
- Modify: `src/lib/cart-utils.ts` (remove old bundle functions)
- Modify: `src/types/database.ts` (remove deprecated alias)

- [ ] **Step 1: Remove old bundle customization modal**

```bash
rm src/components/customer/bundle-customization-modal.tsx
```

- [ ] **Step 2: Remove deprecated old bundle pricing functions from cart-utils.ts**

Remove: `calculateBundleBasePrice`, `calculateBundleOriginalTotal`, `calculateBundleExtras`, `calculateBundleSubtotal`, `calculateBundleSavings`, `calculateTotalBundleSavings` (the old ones that took `BundleItemCustomization[]`).

Also remove the `BundleWithItems` deprecated alias from `database.ts` if nothing references it anymore.

- [ ] **Step 3: Run lint to check for broken imports**

Run: `npm run lint`
Expected: No errors related to bundle imports. Fix any remaining references.

- [ ] **Step 4: Run all tests**

Run: `npm run test`
Expected: All tests pass. The old test helpers (`createBundle`, `createCustomization`, `createCartBundleItem`) in the test file are replaced by Task 3.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(bundles): remove old bundle_items components and deprecated functions"
```

---

### Task 18: Final Verification

- [ ] **Step 1: Run full lint check**

Run: `npm run lint`
Expected: No errors.

- [ ] **Step 2: Run full test suite**

Run: `npm run test`
Expected: All tests pass.

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`
Check:
1. Navigate to a tenant's menu page — bundle cards show slot pills
2. Tap a bundle — wizard opens with progress bar
3. Pick items in each slot — customize variations/addons
4. Review screen shows all selections with pricing
5. Add to cart — bundle appears in cart with correct total
6. Admin: create a new bundle with slots — form works
7. Admin: edit existing bundle — loads correctly
