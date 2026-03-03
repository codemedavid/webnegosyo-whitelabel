# Upsell Analytics Fix - Design

## Problem

1. `upsell_converted` only fires in the checkout upsell modal when "Continue to Checkout" is clicked — not when an order is actually placed
2. Suggestion, upgrade, and bundle upsell modals have zero analytics tracking
3. No way to attribute which order items came from upsells

## Solution: Tag-and-Track Full Funnel

### CartItem Extension

Add optional upsell metadata to `CartItem` in `src/types/database.ts`:

```typescript
upsellSource?: 'checkout_modal' | 'suggestion' | 'upgrade' | 'bundle';
upsellSourceItemId?: string;
```

### Event Tracking by Modal

| Modal | `upsell_shown` | `upsell_clicked` | Tags cart item |
|-------|----------------|-------------------|----------------|
| `checkout-upsell-modal.tsx` | Already works | Already works | Add `upsellSource: 'checkout_modal'` |
| `upsell-suggestion-modal.tsx` | Add on mount | Add on "Add" click | Add `upsellSource: 'suggestion'` |
| `upgrade-upsell-modal.tsx` | Add on mount | Add on "Upgrade" click | Add `upsellSource: 'upgrade'` |
| `bundle-upsell-modal.tsx` | Add on mount | Add on "Accept" click | Add `upsellSource: 'bundle'` |

### Conversion Tracking

Fire `upsell_converted` in `createOrderAction()` (server action) when:
- Order is successfully created
- Cart contains items with `upsellSource` set

Event payload:
```typescript
{
  orderId: string;
  upsellItemCount: number;
  upsellRevenue: number;
  sources: { checkout_modal: number, suggestion: number, upgrade: number, bundle: number };
}
```

### Remove Incorrect Tracking

Remove `upsell_converted` from checkout modal's "Continue to Checkout" button — that's a navigation action, not a conversion.

### Metadata in `upsell_shown` and `upsell_clicked`

All events include:
- `source`: which modal type
- `itemId`, `itemName`, `price` (for clicked)
- `itemCount` (for shown)
- `sourceItemId`: the item that triggered the upsell (for attribution)

### Files to Modify

1. `src/types/database.ts` — Add upsell fields to CartItem
2. `src/components/customer/checkout-upsell-modal.tsx` — Tag items, remove false converted event
3. `src/components/customer/upsell-suggestion-modal.tsx` — Add all 3 events
4. `src/components/customer/upgrade-upsell-modal.tsx` — Add all 3 events
5. `src/components/customer/bundle-upsell-modal.tsx` — Add all 3 events
6. `src/components/customer/product-detail-content.tsx` — Pass upsell tags when adding items
7. `src/app/actions/orders.ts` — Fire `upsell_converted` on order creation
8. `src/hooks/useCart.tsx` — Preserve upsell metadata through cart operations
