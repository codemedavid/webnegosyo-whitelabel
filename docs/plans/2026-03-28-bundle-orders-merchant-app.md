# Bundle Orders in Merchant App — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable the webnegosyo-app (merchant admin) to display bundle order items in collapsible groups with full detail, and update thermal receipts to group bundle items.

**Architecture:** The web checkout currently only sends regular cart items to Convex — bundle cart items are ignored. We need to: (1) flatten bundle cart items into order items with bundle metadata, (2) add `bundleName`/`slotName` fields to the Convex schema + mutations, (3) update the merchant app order detail screen with collapsible bundle sections, and (4) update the receipt formatter to group bundle items.

**Tech Stack:** Convex (schema + mutations), Next.js (checkout page), React Native / Expo (merchant app), ESC/POS thermal printing

---

## Task 1: Add `bundleName` and `slotName` to Convex Schema

**Files:**
- Modify: `convex-template/convex/schema.ts:40-70`

**Step 1: Add fields to orderItems table**

In `convex-template/convex/schema.ts`, add two optional fields to the `orderItems` table definition (after `bundleId`):

```typescript
    isBundleItem: v.optional(v.boolean()),
    bundleId: v.optional(v.string()),
    bundleName: v.optional(v.string()),    // NEW
    slotName: v.optional(v.string()),      // NEW
```

**Step 2: Verify schema is valid**

Run: `cd convex-template && npx convex dev --once` (or just verify no TS errors)

**Step 3: Commit**

```bash
git add convex-template/convex/schema.ts
git commit -m "feat: add bundleName and slotName to Convex orderItems schema"
```

---

## Task 2: Update Convex `createOrder` Mutation to Accept New Fields

**Files:**
- Modify: `convex-template/convex/orders.ts:26-57`

**Step 1: Add fields to createOrder args**

In the `items` array validator inside `createOrder`, add after `bundleId`:

```typescript
        bundleName: v.optional(v.string()),
        slotName: v.optional(v.string()),
```

No handler changes needed — the spread `...item` on line 71 already passes all fields through.

**Step 2: Commit**

```bash
git add convex-template/convex/orders.ts
git commit -m "feat: accept bundleName/slotName in createOrder mutation"
```

---

## Task 3: Flatten Bundle Cart Items in Web Checkout

**Files:**
- Modify: `src/app/[tenant]/checkout/page.tsx:40` (useCart destructure)
- Modify: `src/app/[tenant]/checkout/page.tsx:481-511` (order items mapping)

**Step 1: Destructure bundleItems from useCart**

Change line 40 from:
```typescript
const { items, total, clearCart, orderType, setOrderType, messengerPsid } = useCart()
```
to:
```typescript
const { items, bundleItems, total, clearCart, orderType, setOrderType, messengerPsid } = useCart()
```

**Step 2: Include bundleItems in the snapshot**

Find where `snapshotItems` is created (the snapshot taken before clearing cart). Add a `snapshotBundleItems` alongside it. Search for `snapshotItems` assignment and add:

```typescript
const snapshotBundleItems = [...bundleItems]
```

**Step 3: Flatten bundle items into orderItems array**

After the existing `orderItems` mapping (after line 511), add bundle item flattening:

```typescript
        // Flatten bundle items into order items
        for (const bundle of snapshotBundleItems) {
          for (const slot of bundle.slots) {
            let slotPrice = slot.priceOverride
            let variationText = ''

            if (slot.selectedVariation) {
              slotPrice += slot.selectedVariation.price_modifier
              variationText = slot.selectedVariation.name
            } else if (slot.selectedVariations) {
              const modifierSum = Object.values(slot.selectedVariations).reduce(
                (sum, option) => sum + option.price_modifier, 0
              )
              slotPrice += modifierSum
              variationText = Object.values(slot.selectedVariations).map(opt => opt.name).join(', ')
            }

            const addonTotal = slot.selectedAddons.reduce((sum, a) => sum + a.price, 0)
            const itemTotal = (slotPrice + addonTotal) * slot.quantity * bundle.quantity

            orderItems.push({
              menu_item_id: slot.menuItemId,
              menu_item_name: slot.menuItemName,
              variation: variationText || undefined,
              addons: slot.selectedAddons.map(a => a.name),
              quantity: slot.quantity * bundle.quantity,
              price: slotPrice + addonTotal,
              subtotal: itemTotal,
              special_instructions: undefined,
              isBundleItem: true,
              bundleId: bundle.bundleId,
              bundleName: bundle.bundleName,
              slotName: slot.slotName,
            })
          }
        }
```

Note: The `orderItems` array must be declared with `let` (not `const`) or use `push`. Check the existing code — if it uses `const orderItems = snapshotItems.map(...)`, change it to allow mutation or use spread:

```typescript
const regularItems = snapshotItems.map(item => { ... })
const bundleOrderItems = snapshotBundleItems.flatMap(bundle =>
  bundle.slots.map(slot => { ... })
)
const orderItems = [...regularItems, ...bundleOrderItems]
```

**Step 4: Verify lint passes**

Run: `npm run lint -- --no-error-on-unmatched-pattern`

**Step 5: Commit**

```bash
git add src/app/[tenant]/checkout/page.tsx
git commit -m "feat: flatten bundle cart items into order items at checkout"
```

---

## Task 4: Pass `bundleName`/`slotName` Through Order Service

**Files:**
- Modify: `src/lib/orders-service.ts:532-544` (createOrderConvex item type)
- Modify: `src/lib/orders-service.ts:568-584` (item mapping)
- Modify: `src/app/actions/orders.ts:59-71` (createOrderAction item type)

**Step 1: Add fields to createOrderConvex parameter type**

In `src/lib/orders-service.ts`, add to the items array type (after `bundleId`):

```typescript
    bundleName?: string
    slotName?: string
```

**Step 2: Pass fields in item mapping**

In the items.map block around line 568-584, add after the `bundleId` spread:

```typescript
      ...(item.bundleName ? { bundleName: item.bundleName } : {}),
      ...(item.slotName ? { slotName: item.slotName } : {}),
```

**Step 3: Add fields to createOrderAction parameter type**

In `src/app/actions/orders.ts`, add to the items array type (after `bundleId`):

```typescript
    bundleName?: string
    slotName?: string
```

**Step 4: Commit**

```bash
git add src/lib/orders-service.ts src/app/actions/orders.ts
git commit -m "feat: pass bundleName/slotName through order creation pipeline"
```

---

## Task 5: Update Merchant App Order Detail — Interfaces & Data Grouping

**Files:**
- Modify: `webnegosyo-app/app/(main)/order/[orderId].tsx`

**Step 1: Update OrderItem interface**

Replace the `OrderItem` interface (lines 27-34) with:

```typescript
interface OrderItem {
  menuItemName: string;
  variation?: string;
  variationSelections?: { typeName: string; optionName: string; priceAdjustment: number }[];
  addons?: { name: string; price: number }[];
  specialInstructions?: string;
  quantity: number;
  subtotal: number;
  isBundleItem?: boolean;
  bundleId?: string;
  bundleName?: string;
  slotName?: string;
}

interface BundleGroup {
  bundleId: string;
  bundleName: string;
  items: OrderItem[];
  total: number;
}
```

**Step 2: Add grouping helper function**

Add before the `OrderDetailScreen` component:

```typescript
function groupBundleItems(items: OrderItem[]): { regularItems: OrderItem[]; bundles: BundleGroup[] } {
  const regularItems: OrderItem[] = [];
  const bundleMap = new Map<string, BundleGroup>();

  for (const item of items) {
    if (item.isBundleItem && item.bundleId) {
      const existing = bundleMap.get(item.bundleId);
      if (existing) {
        existing.items.push(item);
        existing.total += item.subtotal;
      } else {
        bundleMap.set(item.bundleId, {
          bundleId: item.bundleId,
          bundleName: item.bundleName ?? "Bundle",
          items: [item],
          total: item.subtotal,
        });
      }
    } else {
      regularItems.push(item);
    }
  }

  return { regularItems, bundles: Array.from(bundleMap.values()) };
}
```

**Step 3: Commit**

```bash
git add webnegosyo-app/app/\(main\)/order/\[orderId\].tsx
git commit -m "feat: add bundle grouping types and helper to order detail"
```

---

## Task 6: Update Merchant App Order Detail — Collapsible Bundle UI

**Files:**
- Modify: `webnegosyo-app/app/(main)/order/[orderId].tsx`

**Step 1: Add collapsible bundle component**

Add a `BundleCard` component before `OrderDetailScreen`:

```typescript
function BundleCard({ bundle }: { bundle: BundleGroup }) {
  const [expanded, setExpanded] = React.useState(true);

  return (
    <View style={bundleStyles.container}>
      <TouchableOpacity
        style={bundleStyles.header}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <View style={bundleStyles.headerLeft}>
          <Text style={bundleStyles.icon}>📦</Text>
          <View>
            <Text style={bundleStyles.bundleName}>{bundle.bundleName}</Text>
            <Text style={bundleStyles.itemCount}>
              {bundle.items.length} item{bundle.items.length !== 1 ? "s" : ""}
            </Text>
          </View>
        </View>
        <View style={bundleStyles.headerRight}>
          <Text style={bundleStyles.bundleTotal}>₱{bundle.total.toFixed(2)}</Text>
          <Text style={bundleStyles.chevron}>{expanded ? "▲" : "▼"}</Text>
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={bundleStyles.itemList}>
          {bundle.items.map((item, i) => (
            <View key={i} style={[bundleStyles.item, i < bundle.items.length - 1 && bundleStyles.itemBorder]}>
              <View style={{ flex: 1 }}>
                {item.slotName && (
                  <Text style={bundleStyles.slotLabel}>{item.slotName}</Text>
                )}
                <Text style={styles.itemName}>{item.menuItemName}</Text>
                {item.variationSelections && item.variationSelections.length > 0 ? (
                  item.variationSelections.map((v, vi) => (
                    <Text key={vi} style={styles.itemDetail}>{v.typeName}: {v.optionName}</Text>
                  ))
                ) : item.variation ? (
                  <Text style={styles.itemDetail}>Variation: {item.variation}</Text>
                ) : null}
                {item.addons && item.addons.length > 0 && (
                  <Text style={styles.itemDetail}>Add-ons: {item.addons.map(a => a.name).join(", ")}</Text>
                )}
                {item.specialInstructions && (
                  <Text style={styles.itemDetail}>Note: {item.specialInstructions}</Text>
                )}
              </View>
              <View style={styles.itemRight}>
                <Text style={styles.itemQty}>x{item.quantity}</Text>
                <Text style={styles.itemPrice}>₱{item.subtotal.toFixed(2)}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const bundleStyles = StyleSheet.create({
  container: {
    backgroundColor: `${colors.primary}08`,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: `${colors.primary}20`,
    marginVertical: spacing.xs,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.sm,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  icon: {
    fontSize: 20,
  },
  bundleName: {
    ...typography.body,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  itemCount: {
    ...typography.small,
    color: colors.textTertiary,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  bundleTotal: {
    ...typography.body,
    fontWeight: "600",
    color: colors.primary,
  },
  chevron: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  itemList: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    borderTopWidth: 0.5,
    borderTopColor: `${colors.primary}20`,
  },
  item: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    paddingLeft: spacing.md,
  },
  itemBorder: {
    borderBottomWidth: 0.5,
    borderBottomColor: colors.separator,
  },
  slotLabel: {
    ...typography.small,
    color: colors.primary,
    fontWeight: "600",
    marginBottom: 2,
    textTransform: "uppercase",
  },
});
```

**Step 2: Update Items card rendering**

Replace the existing Items card section (lines 215-238) with logic that separates regular and bundle items:

```typescript
      <Card title={`Items (${order.items?.length ?? 0})`} style={styles.section}>
        {(() => {
          const { regularItems, bundles } = groupBundleItems(order.items ?? []);
          return (
            <>
              {regularItems.map((item, i) => (
                <View key={i} style={[styles.itemRow, i < regularItems.length - 1 && styles.itemBorder]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{item.menuItemName}</Text>
                    {item.variationSelections && item.variationSelections.length > 0 ? (
                      item.variationSelections.map((v, vi) => (
                        <Text key={vi} style={styles.itemDetail}>{v.typeName}: {v.optionName}</Text>
                      ))
                    ) : item.variation ? (
                      <Text style={styles.itemDetail}>Variation: {item.variation}</Text>
                    ) : null}
                    {item.addons && item.addons.length > 0 && (
                      <Text style={styles.itemDetail}>Add-ons: {item.addons.map(a => a.name).join(", ")}</Text>
                    )}
                    {item.specialInstructions && (
                      <Text style={styles.itemDetail}>Note: {item.specialInstructions}</Text>
                    )}
                  </View>
                  <View style={styles.itemRight}>
                    <Text style={styles.itemQty}>x{item.quantity}</Text>
                    <Text style={styles.itemPrice}>₱{item.subtotal.toFixed(2)}</Text>
                  </View>
                </View>
              ))}
              {bundles.map((bundle) => (
                <BundleCard key={bundle.bundleId} bundle={bundle} />
              ))}
            </>
          );
        })()}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>₱{order.total.toFixed(2)}</Text>
        </View>
      </Card>
```

**Step 3: Commit**

```bash
git add webnegosyo-app/app/\(main\)/order/\[orderId\].tsx
git commit -m "feat: add collapsible bundle display in order detail screen"
```

---

## Task 7: Update Receipt Formatter for Bundle Grouping

**Files:**
- Modify: `webnegosyo-app/lib/receipt-formatter.ts`

**Step 1: Add bundle fields to ReceiptOrderItem interface**

Update the interface (lines 1-9):

```typescript
interface ReceiptOrderItem {
  menuItemName: string;
  quantity: number;
  subtotal: number;
  variation?: string;
  variationSelections?: { typeName: string; optionName: string }[];
  addons?: { name: string; price: number }[];
  specialInstructions?: string;
  isBundleItem?: boolean;
  bundleId?: string;
  bundleName?: string;
  slotName?: string;
}
```

**Step 2: Replace the items printing section**

Replace lines 73-111 (the `for (const item of order.items ?? [])` loop) with bundle-aware logic:

```typescript
  // Separate regular and bundle items
  const regularItems: ReceiptOrderItem[] = [];
  const bundleMap = new Map<string, { name: string; items: ReceiptOrderItem[]; total: number }>();

  for (const item of order.items ?? []) {
    if (item.isBundleItem && item.bundleId) {
      const existing = bundleMap.get(item.bundleId);
      if (existing) {
        existing.items.push(item);
        existing.total += item.subtotal;
      } else {
        bundleMap.set(item.bundleId, {
          name: item.bundleName ?? "Bundle",
          items: [item],
          total: item.subtotal,
        });
      }
    } else {
      regularItems.push(item);
    }
  }

  let subtotal = 0;

  // Print regular items
  for (const item of regularItems) {
    subtotal += item.subtotal;
    const qtyStr = ` ${item.quantity}`;
    const priceStr = `P${item.subtotal.toFixed(2)}`;
    const nameMaxLen = Math.max(0, w - qtyStr.length - priceStr.length - 3);
    let name: string;
    if (nameMaxLen === 0) {
      name = "";
    } else if (item.menuItemName.length > nameMaxLen) {
      name = nameMaxLen > 1 ? item.menuItemName.slice(0, nameMaxLen - 1) + "." : item.menuItemName.slice(0, nameMaxLen);
    } else {
      name = item.menuItemName;
    }

    lines.push(leftRight(`${qtyStr}  ${name}`, priceStr, w));

    if (item.variationSelections && item.variationSelections.length > 0) {
      for (const sel of item.variationSelections) {
        lines.push(`     - ${sel.optionName}`);
      }
    } else if (item.variation) {
      lines.push(`     - ${item.variation}`);
    }

    if (item.addons && item.addons.length > 0) {
      for (const addon of item.addons) {
        lines.push(`     + ${addon.name}`);
      }
    }

    if (item.specialInstructions) {
      lines.push(`     Note: ${item.specialInstructions}`);
    }
  }

  // Print bundle groups
  for (const [, bundle] of bundleMap) {
    subtotal += bundle.total;
    lines.push("");
    lines.push(`*** BUNDLE: ${bundle.name} ***`);

    for (const item of bundle.items) {
      const slotPrefix = item.slotName ? `[${item.slotName}] ` : "";
      const qtyStr = ` ${item.quantity}`;
      const priceStr = `P${item.subtotal.toFixed(2)}`;
      const fullName = `${slotPrefix}${item.menuItemName}`;
      const nameMaxLen = Math.max(0, w - qtyStr.length - priceStr.length - 3);
      let name: string;
      if (nameMaxLen === 0) {
        name = "";
      } else if (fullName.length > nameMaxLen) {
        name = nameMaxLen > 1 ? fullName.slice(0, nameMaxLen - 1) + "." : fullName.slice(0, nameMaxLen);
      } else {
        name = fullName;
      }

      lines.push(leftRight(`${qtyStr}  ${name}`, priceStr, w));

      if (item.variationSelections && item.variationSelections.length > 0) {
        for (const sel of item.variationSelections) {
          lines.push(`     - ${sel.optionName}`);
        }
      } else if (item.variation) {
        lines.push(`     - ${item.variation}`);
      }

      if (item.addons && item.addons.length > 0) {
        for (const addon of item.addons) {
          lines.push(`     + ${addon.name}`);
        }
      }

      if (item.specialInstructions) {
        lines.push(`     Note: ${item.specialInstructions}`);
      }
    }

    lines.push(leftRight("  Bundle Total:", `P${bundle.total.toFixed(2)}`, w));
  }
```

**Step 3: Commit**

```bash
git add webnegosyo-app/lib/receipt-formatter.ts
git commit -m "feat: group bundle items on thermal receipts"
```

---

## Task 8: Verify & Lint

**Step 1: Lint web code**

Run: `npm run lint`

Fix any errors.

**Step 2: Run web tests**

Run: `npm run test`

Verify existing tests still pass.

**Step 3: Final commit if fixes were needed**

```bash
git commit -m "fix: lint and test fixes for bundle order support"
```

---

## Summary of All Modified Files

| File | Change |
|------|--------|
| `convex-template/convex/schema.ts` | Add `bundleName`, `slotName` to orderItems |
| `convex-template/convex/orders.ts` | Accept new fields in createOrder args |
| `src/app/[tenant]/checkout/page.tsx` | Flatten bundleItems into order items |
| `src/lib/orders-service.ts` | Pass bundleName/slotName in Convex item mapping |
| `src/app/actions/orders.ts` | Add bundleName/slotName to item type |
| `webnegosyo-app/app/(main)/order/[orderId].tsx` | Collapsible bundle display |
| `webnegosyo-app/lib/receipt-formatter.ts` | Bundle grouping on receipts |
