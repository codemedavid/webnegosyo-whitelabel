# Enhanced Variations System - Implementation Plan

## Overview

Upgrading the variations system from a flat list to a **grouped variation types** system with images for each option.

### Current System (Flat)
```typescript
variations: [
  { id: '1', name: 'Small', price_modifier: 0 },
  { id: '2', name: 'Medium', price_modifier: 3 },
  { id: '3', name: 'Large', price_modifier: 5 }
]
```

### New System (Grouped with Images)
```typescript
variation_types: [
  {
    id: '1',
    name: 'Size',
    is_required: true,
    options: [
      { id: 'opt-1', name: 'Small', price_modifier: 0, image_url: 'small.jpg' },
      { id: 'opt-2', name: 'Medium', price_modifier: 3, image_url: 'medium.jpg' },
      { id: 'opt-3', name: 'Large', price_modifier: 5, image_url: 'large.jpg' }
    ]
  },
  {
    id: '2',
    name: 'Spice Level',
    is_required: false,
    options: [
      { id: 'opt-4', name: 'Mild', price_modifier: 0 },
      { id: 'opt-5', name: 'Spicy', price_modifier: 0 },
      { id: 'opt-6', name: 'Extra Hot', price_modifier: 1 }
    ]
  }
]
```

---

## New Data Structure

### TypeScript Types

```typescript
export interface VariationType {
  id: string
  name: string // "Size", "Spice Level", "Protein Type"
  is_required: boolean // Must customer select from this group?
  display_order: number
  options: VariationOption[]
}

export interface VariationOption {
  id: string
  name: string // "Small", "Medium", "Large"
  price_modifier: number
  image_url?: string // Optional image for this specific option
  is_default?: boolean
  display_order: number
}

export interface MenuItem {
  // ... existing fields
  variation_types: VariationType[] // NEW: Replaces flat variations array
  variations: Variation[] // DEPRECATED: Keep for backward compatibility
  addons: Addon[] // Unchanged
}

export interface CartItem {
  id: string
  menu_item: MenuItem
  selected_variations: { [variatonTypeId: string]: VariationOption } // NEW: Map of type -> option
  selected_variation?: Variation // DEPRECATED: Keep for backward compatibility
  selected_addons: Addon[]
  quantity: number
  special_instructions?: string
  subtotal: number
}
```

### Database Schema

```sql
-- Update menu_items table (JSONB field, no migration needed for data structure)
-- variation_types will be stored as JSONB with this structure:
/*
[
  {
    "id": "type-1",
    "name": "Size",
    "is_required": true,
    "display_order": 0,
    "options": [
      {
        "id": "opt-1",
        "name": "Small (10\")",
        "price_modifier": 0,
        "image_url": "https://cloudinary.com/.../small-pizza.jpg",
        "is_default": true,
        "display_order": 0
      },
      {
        "id": "opt-2",
        "name": "Large (14\")",
        "price_modifier": 5.00,
        "image_url": "https://cloudinary.com/.../large-pizza.jpg",
        "is_default": false,
        "display_order": 1
      }
    ]
  },
  {
    "id": "type-2",
    "name": "Crust Type",
    "is_required": false,
    "display_order": 1,
    "options": [
      {
        "id": "opt-3",
        "name": "Thin Crust",
        "price_modifier": 0,
        "is_default": true,
        "display_order": 0
      },
      {
        "id": "opt-4",
        "name": "Thick Crust",
        "price_modifier": 2.00,
        "display_order": 1
      }
    ]
  }
]
*/
```

---

## Implementation Steps

### 1. Update Database Types

**File:** `src/types/database.ts`

Add new interfaces, keep old ones for backward compatibility during transition.

### 2. Update Validation Schema

**File:** `src/lib/admin-service.ts`

```typescript
export const variationTypeSchema = z.object({
  id: z.string(),
  name: z.string().min(1, 'Type name is required'),
  is_required: z.boolean(),
  display_order: z.number().int().min(0),
  options: z.array(z.object({
    id: z.string(),
    name: z.string().min(1, 'Option name is required'),
    price_modifier: z.number(),
    image_url: z.string().url().optional().nullable(),
    is_default: z.boolean().optional(),
    display_order: z.number().int().min(0),
  })).min(1, 'At least one option is required'),
})

export const menuItemSchema = z.object({
  // ... existing fields
  variation_types: z.array(variationTypeSchema).default([]),
  // Keep old variations for backward compatibility
  variations: z.array(/* old schema */).optional(),
})
```

### 3. Admin Form UI

**File:** `src/components/admin/menu-item-form.tsx`

New UI Structure:
```
┌─────────────────────────────────────────┐
│ Variation Types                    [+]  │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ Size ⚙️                         [×] │ │
│ │ ☑ Required                          │ │
│ │                                      │ │
│ │ Options:                        [+]  │ │
│ │ ┌────────────────────────────────┐  │ │
│ │ │ Small (10")              [×]   │  │ │
│ │ │ Price: +$0.00                  │  │ │
│ │ │ [Upload Image] 📷              │  │ │
│ │ │ [preview thumbnail]            │  │ │
│ │ └────────────────────────────────┘  │ │
│ │ ┌────────────────────────────────┐  │ │
│ │ │ Large (14")              [×]   │  │ │
│ │ │ Price: +$5.00                  │  │ │
│ │ │ [Upload Image] 📷              │  │ │
│ │ │ [preview thumbnail]            │  │ │
│ │ └────────────────────────────────┘  │ │
│ └─────────────────────────────────────┘ │
│                                          │
│ ┌─────────────────────────────────────┐ │
│ │ Spice Level ⚙️                  [×] │ │
│ │ ☐ Required                          │ │
│ │                                      │ │
│ │ Options:                        [+]  │ │
│ │ ... (similar structure)             │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

Key Features:
- Collapsible variation type cards
- Drag-and-drop reordering
- Image upload per option
- Required/optional toggle
- Default option selection per type

### 4. Customer Item Detail Modal

**File:** `src/components/customer/item-detail-modal.tsx`

New UI Structure:
```
┌──────────────────────────────────────┐
│ [Item Hero Image]                    │
│                                      │
│ Pizza Margherita          $14.99    │
├──────────────────────────────────────┤
│ Select Size *                        │
│ ┌────────┐ ┌────────┐ ┌────────┐   │
│ │  📷    │ │  📷    │ │  📷    │   │
│ │ Small  │ │ Medium │ │ Large  │   │
│ │ $14.99 │ │ $18.99 │ │ $21.99 │   │
│ └────────┘ └────────┘ └────────┘   │
│   (selected)                         │
│                                      │
│ Choose Spice Level (Optional)        │
│ ○ Mild    ● Spicy    ○ Extra Hot    │
│   +$0       +$0        +$1.50        │
│                                      │
│ Add-ons                              │
│ ☑ Extra Cheese +$2.50               │
│ ☐ Mushrooms +$2.00                  │
├──────────────────────────────────────┤
│ [-] 1 [+]  [Add to Cart • $24.49]  │
└──────────────────────────────────────┘
```

Key Features:
- Image thumbnails for each variation option
- Visual indication of required vs optional types
- Selected state highlighting
- Real-time price updates

### 5. Cart Item ID Generation

**File:** `src/lib/cart-utils.ts`

Update to handle multiple variation selections:

```typescript
export function generateCartItemId(
  menuItemId: string,
  selectedVariations: { [typeId: string]: VariationOption },
  addonIds?: string[]
): string {
  const parts = [menuItemId]
  
  // Sort by type ID for consistency
  const sortedTypeIds = Object.keys(selectedVariations).sort()
  
  sortedTypeIds.forEach(typeId => {
    const option = selectedVariations[typeId]
    parts.push(`${typeId}:${option.id}`)
  })
  
  if (addonIds && addonIds.length > 0) {
    parts.push(addonIds.sort().join('-'))
  }
  
  return parts.join('_')
}

// Example result:
// "item-123_type-size:opt-large_type-spice:opt-hot_addon-cheese-addon-mushroom"
```

### 6. Price Calculation

**File:** `src/lib/cart-utils.ts`

Update to sum all variation modifiers:

```typescript
export function calculateCartItemSubtotal(
  basePrice: number,
  selectedVariations: { [typeId: string]: VariationOption },
  addons: Addon[],
  quantity: number
): number {
  // Sum all variation modifiers
  const variationPrice = Object.values(selectedVariations).reduce(
    (sum, option) => sum + option.price_modifier,
    0
  )
  
  const addonsPrice = addons.reduce((sum, addon) => sum + addon.price, 0)
  const itemTotal = basePrice + variationPrice + addonsPrice
  return itemTotal * quantity
}
```

### 7. Order Storage

**File:** `src/types/database.ts`

Update OrderItem to store variation selections:

```typescript
export interface OrderItem {
  menu_item_id: string
  menu_item_name: string
  variation?: string // DEPRECATED
  variations?: { [typeName: string]: string } // NEW: e.g., { "Size": "Large", "Spice": "Hot" }
  addons: string[]
  quantity: number
  price: number
  subtotal: number
  special_instructions?: string
}
```

---

## Migration Strategy

### Phase 1: Backward Compatible (Week 1)
- Add new `variation_types` field alongside existing `variations`
- Both systems work in parallel
- Admin can choose which system to use

### Phase 2: Encourage Migration (Week 2-3)
- Show benefits of new system in admin UI
- Provide "Convert to Variation Types" button
- New menu items default to new system

### Phase 3: Deprecation (Week 4+)
- Hide old system UI (but still support in backend)
- All new items use new system
- Old orders still display correctly

---

## Example Use Cases

### Restaurant: Coffee Shop

**Variation Types:**
1. **Size** (Required)
   - Small (12oz) - +$0
   - Medium (16oz) - +$1
   - Large (20oz) - +$2

2. **Milk Type** (Optional)
   - Regular - +$0
   - Oat Milk - +$0.50
   - Almond Milk - +$0.50

3. **Temperature** (Required)
   - Hot - +$0
   - Iced - +$0

### Restaurant: Burger Joint

**Variation Types:**
1. **Patty Count** (Required)
   - Single - +$0 (image: 1 patty)
   - Double - +$3 (image: 2 patties)
   - Triple - +$5 (image: 3 patties)

2. **Bun Type** (Optional)
   - Regular - +$0
   - Whole Wheat - +$1
   - Gluten Free - +$2

---

## Benefits

✅ **Better Organization**: Group related options together
✅ **Visual Selection**: Images help customers choose
✅ **Multiple Categories**: Mix size, type, spice level, etc.
✅ **Required/Optional**: Enforce business rules
✅ **Flexible Pricing**: Each option can have its own modifier
✅ **Better UX**: Clear sections, visual feedback
✅ **Scalability**: Add more variation types without cluttering

---

## Files to Modify

### Core Types
- [ ] `src/types/database.ts` - Add new interfaces

### Validation
- [ ] `src/lib/admin-service.ts` - Add schemas

### Admin Interface
- [ ] `src/components/admin/menu-item-form.tsx` - Rebuild variation section
- [ ] `src/components/admin/variation-type-form.tsx` - NEW: Sub-component

### Customer Interface
- [ ] `src/components/customer/item-detail-modal.tsx` - Update selection UI
- [ ] `src/components/customer/variation-option-selector.tsx` - NEW: Reusable component

### Cart System
- [ ] `src/lib/cart-utils.ts` - Update ID generation and calculation
- [ ] `src/hooks/useCart.tsx` - Update cart item structure

### Display Components
- [ ] `src/components/customer/cart-drawer.tsx` - Show multiple variations
- [ ] `src/app/[tenant]/cart/page.tsx` - Show multiple variations

### Database
- [ ] `supabase/migrations/0012_variation_types.sql` - NEW: Add notes/examples

---

## Testing Checklist

- [ ] Create menu item with multiple variation types
- [ ] Each type has 2-3 options with images
- [ ] Mark one type as required, another as optional
- [ ] Customer can select one option per type
- [ ] Price updates correctly
- [ ] Add to cart with multiple variations
- [ ] Cart displays all selected variations
- [ ] Order is created with correct variation data
- [ ] Messenger message shows all variations
- [ ] Backward compatibility: Old items still work

---

*Implementation Plan - November 6, 2025*

