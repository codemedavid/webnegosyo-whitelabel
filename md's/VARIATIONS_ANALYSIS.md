# Item Variations System - Comprehensive Analysis

## Overview

The variations system in this multi-tenant restaurant ordering platform allows menu items to have multiple sizes/options (variations) and additional extras (add-ons). This document provides a complete analysis of how variations work throughout the application.

---

## 🔄 System Flow Diagram

### Customer Journey: From Selection to Order

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. ADMIN: Create Menu Item                                          │
│    - Set base price: $10.00                                         │
│    - Add variations: Small (+$0), Medium (+$3), Large (+$5)        │
│    - Add add-ons: Extra Cheese (+$1.50), Mushrooms (+$2.00)       │
│    - Save to database as JSONB                                      │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 2. CUSTOMER: Browse Menu                                            │
│    - View menu item card                                            │
│    - See base price: $10.00                                         │
│    - Click to view details                                          │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 3. CUSTOMER: Item Detail Modal                                      │
│    - Auto-select default variation (Medium: $13.00)                │
│    - Customer changes to Large (+$5): $15.00                       │
│    - Customer selects Extra Cheese (+$1.50): $16.50               │
│    - Customer selects Mushrooms (+$2.00): $18.50                  │
│    - Customer sets quantity: 2                                      │
│    - Shows total: $37.00                                            │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 4. CART: Add Item                                                    │
│    - Generate cart item ID:                                         │
│      "item-123_var-large_addon-cheese-addon-mushroom"              │
│    - Calculate subtotal: ($10 + $5 + $1.50 + $2.00) × 2 = $37.00 │
│    - Check if exact same configuration exists in cart:             │
│        If YES: merge quantities                                     │
│        If NO: create new cart entry                                 │
│    - Save to localStorage                                           │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 5. CART: Display Items                                              │
│    - Show: "Pizza Bowl (Large) x2"                                 │
│    - Show: "Add-ons: Extra Cheese, Mushrooms"                     │
│    - Show: "$37.00"                                                 │
│    - Calculate cart total                                           │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 6. CHECKOUT: Create Order                                           │
│    - Transform cart items to order items:                          │
│      {                                                               │
│        menu_item_id: "item-123",                                   │
│        menu_item_name: "Pizza Bowl",                               │
│        variation: "Large",              ← Store name, not ID       │
│        addons: ["Extra Cheese", "Mushrooms"],  ← Store names      │
│        quantity: 2,                                                 │
│        price: 18.50,                    ← Unit price              │
│        subtotal: 37.00                  ← Line total              │
│      }                                                               │
│    - Save to database                                               │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 7. MESSENGER: Send Notification                                     │
│    - Format message:                                                │
│      "1. Pizza Bowl (Large) x2"                                    │
│      "   Add-ons: Extra Cheese, Mushrooms"                         │
│      "   Price: $37.00"                                             │
│    - Send to restaurant's Facebook Messenger                       │
└─────────────────────────────────────────────────────────────────────┘
```

### Price Calculation Flow

```
Base Price: $10.00
    ↓
+ Variation Modifier: $5.00 (Large)
    ↓
= Item Base: $15.00
    ↓
+ Add-on 1: $1.50 (Extra Cheese)
+ Add-on 2: $2.00 (Mushrooms)
    ↓
= Item Total: $18.50
    ↓
× Quantity: 2
    ↓
= Subtotal: $37.00
```

### Cart Item Identification Flow

```
Menu Item ID: "item-123"
    ↓
Selected Variation ID: "var-large"
    ↓
Selected Add-on IDs: ["addon-cheese", "addon-mushroom"] (sorted)
    ↓
Generated Cart Item ID: "item-123_var-large_addon-cheese-addon-mushroom"
    ↓
Purpose: Distinguishes different configurations of the same menu item
```

**Why This Matters:**
- Same pizza with Small size = different cart item
- Same pizza with different toppings = different cart item
- Same pizza with same configuration = merged quantities

---

## 📊 Database Schema

### Storage Format

Variations and add-ons are stored as **JSONB** fields in the `menu_items` table:

```sql
create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  description text not null,
  price numeric(10,2) not null,
  discounted_price numeric(10,2),
  image_url text not null,
  variations jsonb not null default '[]'::jsonb,  -- 👈 Variations stored as JSONB
  addons jsonb not null default '[]'::jsonb,       -- 👈 Add-ons stored as JSONB
  is_available boolean not null default true,
  is_featured boolean not null default false,
  "order" integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

**Design Decision:**
- Uses JSONB for flexibility and quick iteration
- Comment in migration suggests this could be normalized later if needed
- Default empty arrays ensure data consistency

---

## 🏗️ TypeScript Type Definitions

### Variation Interface

```typescript
export interface Variation {
  id: string;                    // Unique identifier (can be temporary like "temp-123456")
  name: string;                  // Display name: "Small", "Medium", "Large"
  price_modifier: number;        // Price adjustment: +0, +2.50, +5.00
  is_default?: boolean;          // Optional: marks default selection
}
```

### Addon Interface

```typescript
export interface Addon {
  id: string;                    // Unique identifier
  name: string;                  // Display name: "Extra Cheese", "No Onions"
  price: number;                 // Fixed price (not a modifier)
  is_default?: boolean;          // Optional: pre-selected by default
}
```

### MenuItem Interface

```typescript
export interface MenuItem {
  id: string;
  tenant_id: string;
  category_id: string;
  name: string;
  description: string;
  price: number;                 // Base price
  discounted_price?: number;     // Optional sale price
  image_url: string;
  variations: Variation[];       // 👈 Array of variations
  addons: Addon[];               // 👈 Array of add-ons
  is_available: boolean;
  is_featured?: boolean;
  order: number;
  created_at: string;
  updated_at: string;
}
```

### CartItem Interface

```typescript
export interface CartItem {
  id: string;                        // Generated unique cart item ID
  menu_item: MenuItem;               // Full menu item object
  selected_variation?: Variation;    // 👈 Selected variation (optional)
  selected_addons: Addon[];          // 👈 Selected add-ons (can be empty)
  quantity: number;
  special_instructions?: string;
  subtotal: number;                  // Calculated total for this cart item
}
```

---

## 🎨 Admin Interface (Menu Item Form)

### Creating/Editing Variations

**Location:** `src/components/admin/menu-item-form.tsx`

#### State Management

```typescript
const [variations, setVariations] = useState(item?.variations || [])
const [addons, setAddons] = useState(item?.addons || [])
```

#### Adding a New Variation

```typescript
const addVariation = () => {
  setVariations([
    ...variations,
    { 
      id: `temp-${Date.now()}`,        // Temporary ID using timestamp
      name: '', 
      price_modifier: 0, 
      is_default: variations.length === 0  // First variation is default
    },
  ])
}
```

**Key Features:**
- Generates temporary IDs using `temp-${Date.now()}`
- First variation is automatically set as default
- Empty name and zero price modifier by default

#### Updating a Variation

```typescript
const updateVariation = (index: number, field: string, value: string | number | boolean) => {
  const updated = [...variations]
  updated[index] = { ...updated[index], [field]: value }
  setVariations(updated)
}
```

#### Removing a Variation

```typescript
const removeVariation = (index: number) => {
  setVariations(variations.filter((_, i) => i !== index))
}
```

#### UI Layout

```tsx
<Card>
  <CardHeader className="flex flex-row items-center justify-between">
    <CardTitle>Variations</CardTitle>
    <Button type="button" variant="outline" size="sm" onClick={addVariation}>
      <Plus className="mr-2 h-4 w-4" />
      Add Variation
    </Button>
  </CardHeader>
  <CardContent>
    {variations.length === 0 ? (
      <p className="text-center text-sm text-muted-foreground">
        No variations. Add sizes like Small, Medium, Large.
      </p>
    ) : (
      <div className="space-y-3">
        {variations.map((variation, index) => (
          <div key={variation.id} className="flex gap-2">
            <Input
              placeholder="Name (e.g., Small)"
              value={variation.name}
              onChange={(e) => updateVariation(index, 'name', e.target.value)}
            />
            <Input
              type="number"
              step="0.01"
              placeholder="Price modifier"
              value={variation.price_modifier}
              onChange={(e) => updateVariation(index, 'price_modifier', parseFloat(e.target.value))}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeVariation(index)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    )}
  </CardContent>
</Card>
```

**UX Features:**
- Simple inline form with name and price modifier
- Trash icon button for deletion
- Empty state with helpful guidance
- Similar pattern for add-ons

---

## 🛍️ Customer Interface

### Item Detail Modal

**Location:** `src/components/customer/item-detail-modal.tsx`

This is where customers select variations and add-ons before adding items to cart.

#### State Management

```typescript
const [selectedVariation, setSelectedVariation] = useState<Variation | undefined>()
const [selectedAddons, setSelectedAddons] = useState<Addon[]>([])
const [quantity, setQuantity] = useState(1)
const [specialInstructions, setSpecialInstructions] = useState('')
```

#### Auto-Selecting Default Variation

```typescript
useEffect(() => {
  if (item && item.variations.length > 0 && !selectedVariation) {
    const defaultVar = item.variations.find((v) => v.is_default) || item.variations[0]
    setSelectedVariation(defaultVar)
  }
}, [item, selectedVariation])
```

**Logic:**
1. Checks if item has variations
2. Looks for variation with `is_default: true`
3. Falls back to first variation if no default set
4. Only runs when modal opens or item changes

#### Variation Selection UI

```tsx
{hasVariations && (
  <div>
    <h3 className="text-sm font-semibold mb-2.5 text-gray-700">
      Choose Size
    </h3>
    <div className="flex flex-wrap gap-2">
      {item.variations.map((variation) => {
        const isSelected = selectedVariation?.id === variation.id
        const price = basePrice + variation.price_modifier

        return (
          <button
            key={variation.id}
            onClick={() => setSelectedVariation(variation)}
            className={`
              px-3 py-2 rounded-lg text-sm font-medium transition-all min-w-[80px]
              ${isSelected 
                ? 'text-white shadow-sm' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }
            `}
            style={isSelected ? { 
              backgroundColor: branding.primary,
            } : {}}
          >
            <div className="text-center">
              <div className="font-semibold">{variation.name}</div>
              <div className="text-xs opacity-90 mt-0.5">
                {variation.price_modifier === 0
                  ? formatPrice(price)
                  : `+${formatPrice(variation.price_modifier)}`}
              </div>
            </div>
          </button>
        )
      })}
    </div>
  </div>
)}
```

**Design Features:**
- Button-style selection (radio button behavior)
- Shows full price if modifier is 0, otherwise shows "+$2.50" format
- Dynamic branding colors for selected state
- Mobile-responsive with min-width constraint

#### Add-ons Selection UI

```typescript
const toggleAddon = (addon: Addon) => {
  setSelectedAddons((prev) => {
    const exists = prev.find((a) => a.id === addon.id)
    if (exists) {
      return prev.filter((a) => a.id !== addon.id)  // Remove if exists
    }
    return [...prev, addon]  // Add if doesn't exist
  })
}
```

**UI Features:**
- Checkbox-style multi-select
- Custom styled checkbox with checkmark animation
- Shows "Free" for zero-price add-ons
- Shows "+$1.50" format for paid add-ons
- Branded colors when selected

---

## 💰 Price Calculation System

### Cart Item Subtotal Calculation

**Location:** `src/lib/cart-utils.ts`

```typescript
export function calculateCartItemSubtotal(
  basePrice: number,
  variation: Variation | undefined,
  addons: Addon[],
  quantity: number
): number {
  const variationPrice = variation?.price_modifier || 0
  const addonsPrice = addons.reduce((sum, addon) => sum + addon.price, 0)
  const itemTotal = basePrice + variationPrice + addonsPrice
  return itemTotal * quantity
}
```

**Formula:**
```
Item Total = (Base Price + Variation Modifier + Sum of Add-on Prices) × Quantity
```

**Example:**
```
Pizza (Base): $10.00
Variation (Large): +$3.00
Add-on (Extra Cheese): +$1.50
Add-on (Mushrooms): +$2.00
Quantity: 2

Calculation:
($10.00 + $3.00 + $1.50 + $2.00) × 2 = $33.00
```

### Cart Total Calculation

```typescript
export function calculateCartTotal(items: CartItem[]): number {
  return items.reduce((total, item) => total + item.subtotal, 0)
}
```

### Real-time Price Display

In the modal footer:

```typescript
const totalPrice = calculateCartItemSubtotal(
  basePrice,
  selectedVariation,
  selectedAddons,
  quantity
)
```

Shown in the "Add to Cart" button:
```tsx
<Button>
  Add to Cart • {formatPrice(totalPrice)}
</Button>
```

---

## 🛒 Cart System Integration

### Adding Items to Cart

**Location:** `src/hooks/useCart.tsx`

#### Unique Cart Item ID Generation

```typescript
export function generateCartItemId(
  menuItemId: string,
  variationId?: string,
  addonIds?: string[]
): string {
  const parts = [menuItemId]
  if (variationId) parts.push(variationId)
  if (addonIds && addonIds.length > 0) {
    parts.push(addonIds.sort().join('-'))  // Sort for consistency
  }
  return parts.join('_')
}
```

**Examples:**
```
Pizza without variations/add-ons:
  "uuid-123"

Pizza with Large variation:
  "uuid-123_var-456"

Pizza with Large + Extra Cheese + Mushrooms:
  "uuid-123_var-456_addon-789-addon-012"
```

**Why This Matters:**
- Same item with different variations = different cart entries
- Same item with different add-ons = different cart entries
- Enables proper quantity tracking per configuration

#### Add to Cart Logic

```typescript
const addItem = useCallback(
  (
    menuItem: MenuItem,
    variation: Variation | undefined,
    addons: Addon[],
    quantity: number,
    specialInstructions?: string
  ) => {
    const subtotal = calculateCartItemSubtotal(
      menuItem.price,
      variation,
      addons,
      quantity
    )

    const cartItemId = generateCartItemId(
      menuItem.id,
      variation?.id,
      addons.map((a) => a.id)
    )

    setItems((prevItems) => {
      const existingItemIndex = prevItems.findIndex((item) => item.id === cartItemId)

      if (existingItemIndex > -1) {
        // Update existing item - merge quantities
        const updatedItems = [...prevItems]
        const existingItem = updatedItems[existingItemIndex]
        const newQuantity = existingItem.quantity + quantity
        const newSubtotal = calculateCartItemSubtotal(
          menuItem.price,
          variation,
          addons,
          newQuantity
        )

        updatedItems[existingItemIndex] = {
          ...existingItem,
          quantity: newQuantity,
          subtotal: newSubtotal,
          special_instructions: specialInstructions || existingItem.special_instructions,
        }

        return updatedItems
      }

      // Add new item
      const newItem: CartItem = {
        id: cartItemId,
        menu_item: menuItem,
        selected_variation: variation,
        selected_addons: addons,
        quantity,
        special_instructions: specialInstructions,
        subtotal,
      }

      return [...prevItems, newItem]
    })
  },
  []
)
```

**Key Behaviors:**
- Checks if exact same configuration already exists in cart
- If exists: merges quantities and recalculates subtotal
- If new: creates new cart entry
- Persists to localStorage automatically

### Displaying Cart Items

**Location:** `src/components/customer/cart-drawer.tsx` and `src/app/[tenant]/cart/page.tsx`

#### Showing Selected Variation

```tsx
{item.selected_variation && (
  <Badge 
    variant="outline" 
    className="mt-1 text-xs"
    style={{ 
      borderColor: `${branding.primary}40`,
      color: branding.primary,
      backgroundColor: `${branding.primary}10`
    }}
  >
    {item.selected_variation.name}
  </Badge>
)}
```

#### Showing Selected Add-ons

```tsx
{item.selected_addons.length > 0 && (
  <div className="text-xs text-gray-500">
    Add-ons: {item.selected_addons.map((a) => a.name).join(', ')}
  </div>
)}
```

---

## 📦 Order System Integration

### Order Item Structure

**Location:** `src/types/database.ts`

```typescript
export interface OrderItem {
  menu_item_id: string;
  menu_item_name: string;
  variation?: string;              // 👈 Stored as string name
  addons: string[];                // 👈 Stored as array of names
  quantity: number;
  price: number;                   // Unit price with modifiers
  subtotal: number;                // Total for this line item
  special_instructions?: string;
}
```

**Important Note:**
- Orders store variation/addon **names** (not full objects)
- This ensures historical accuracy if admin changes menu item later
- Price is locked at order time

### Creating Orders from Cart

Cart items are transformed to order items when checkout completes:

```typescript
// In checkout process
const orderItems = cartItems.map((cartItem) => ({
  menu_item_id: cartItem.menu_item.id,
  menu_item_name: cartItem.menu_item.name,
  variation: cartItem.selected_variation?.name,  // Store name only
  addons: cartItem.selected_addons.map((a) => a.name),  // Store names only
  quantity: cartItem.quantity,
  price: calculateUnitPrice(cartItem),
  subtotal: cartItem.subtotal,
  special_instructions: cartItem.special_instructions
}))
```

---

## 📧 Messenger Integration

### Generating Order Messages

**Location:** `src/lib/cart-utils.ts`

```typescript
export function generateMessengerMessage(
  items: CartItem[],
  restaurantName: string,
  orderCreated: boolean = true,
  orderType?: { name: string; type: string } | null,
  customerData?: Record<string, string>
): string {
  const lines = ['🍽️ New Order from ${restaurantName}', '']

  // ... customer info ...

  lines.push('📋 Order Details:')

  items.forEach((item, index) => {
    const variationText = item.selected_variation
      ? ` (${item.selected_variation.name})`
      : ''
    lines.push(`${index + 1}. ${item.menu_item.name}${variationText} x${item.quantity}`)

    if (item.selected_addons.length > 0) {
      const addonsText = item.selected_addons.map((a) => a.name).join(', ')
      lines.push(`   Add-ons: ${addonsText}`)
    }

    if (item.special_instructions) {
      lines.push(`   Special: ${item.special_instructions}`)
    }

    lines.push(`   Price: ${formatPrice(item.subtotal)}`)
    lines.push('')
  })

  const total = calculateCartTotal(items)
  lines.push(`💰 Total: ${formatPrice(total)}`)
  
  return lines.join('\n')
}
```

**Example Output:**

```
🍽️ New Order from Pizza Palace

📋 Order Type: 🚚 Delivery

👤 Customer Information:
👤 Name: John Doe
📞 Phone: +63 912 345 6789
📍 Address: 123 Main St, Manila

📋 Order Details:
1. Margherita Pizza (Large) x2
   Add-ons: Extra Cheese, Mushrooms
   Price: ₱660.00

2. Caesar Salad (Regular) x1
   Price: ₱180.00

💰 Total: ₱840.00

📍 Please confirm your order!
```

---

## 📋 Real-World Examples from Mock Data

### Example 1: Pizza with Multiple Size Variations

**Margherita Pizza:**
```typescript
{
  name: 'Margherita Pizza',
  price: 14.99,  // Base price for Small
  variations: [
    { id: 'var-3', name: 'Small (10")', price_modifier: 0, is_default: true },
    { id: 'var-4', name: 'Medium (12")', price_modifier: 4.00 },
    { id: 'var-5', name: 'Large (14")', price_modifier: 7.00 },
    { id: 'var-6', name: 'Extra Large (16")', price_modifier: 10.00 },
  ],
  addons: [
    { id: 'addon-5', name: 'Extra Cheese', price: 2.50 },
    { id: 'addon-6', name: 'Fresh Basil', price: 1.00 },
    { id: 'addon-7', name: 'Olives', price: 1.50 },
    { id: 'addon-8', name: 'Mushrooms', price: 2.00 },
  ],
}
```

**Price Examples:**
- Small (10") = $14.99
- Medium (12") = $18.99 ($14.99 + $4.00)
- Large (14") = $21.99 ($14.99 + $7.00)
- Extra Large (16") = $24.99 ($14.99 + $10.00)
- Large with Extra Cheese + Olives = $26.49 ($21.99 + $2.50 + $1.50)

### Example 2: Salad with Simple Variations

**Caprese Salad:**
```typescript
{
  name: 'Caprese Salad',
  price: 10.99,  // Base price for Small
  variations: [
    { id: 'var-1', name: 'Small', price_modifier: 0, is_default: true },
    { id: 'var-2', name: 'Large', price_modifier: 4.00 },
  ],
  addons: [
    { id: 'addon-3', name: 'Add Prosciutto', price: 3.00 },
  ],
}
```

**Price Examples:**
- Small = $10.99
- Large = $14.99 ($10.99 + $4.00)
- Large with Prosciutto = $17.99 ($14.99 + $3.00)

### Example 3: Item Without Variations

**Garlic Bread:**
```typescript
{
  name: 'Garlic Bread',
  price: 5.99,
  variations: [],  // No size options
  addons: [
    { id: 'addon-4', name: 'With Cheese', price: 2.00 },
  ],
}
```

**Price Examples:**
- Regular = $5.99
- With Cheese = $7.99 ($5.99 + $2.00)

### Example 4: Complex Order Calculation

**Customer Order:**
1. Margherita Pizza - Large (14") × 2
   - Add-ons: Extra Cheese, Mushrooms
   - Calculation: ($14.99 + $7.00 + $2.50 + $2.00) × 2 = $52.98

2. Caprese Salad - Large × 1
   - Add-ons: Add Prosciutto
   - Calculation: ($10.99 + $4.00 + $3.00) × 1 = $17.99

3. Garlic Bread - Regular × 1
   - Add-ons: With Cheese
   - Calculation: ($5.99 + $2.00) × 1 = $7.99

**Total Order: $78.96**

---

## 🔒 Validation & Business Rules

### Server-Side Validation

**Location:** `src/lib/admin-service.ts`

```typescript
export const menuItemSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  price: z.number().positive('Price must be positive'),
  discounted_price: z.number().positive().optional().nullable(),
  image_url: z.string().url('Must be a valid URL'),
  category_id: z.string().uuid('Must select a category'),
  variations: z.array(z.object({
    id: z.string(),
    name: z.string(),
    price_modifier: z.number(),
    is_default: z.boolean().optional(),
  })).default([]),
  addons: z.array(z.object({
    id: z.string(),
    name: z.string(),
    price: z.number(),
  })).default([]),
  is_available: z.boolean().default(true),
  is_featured: z.boolean().default(false),
  order: z.number().int().min(0).default(0),
})
```

**Validation Rules:**
- Variations array can be empty (optional)
- Each variation must have id, name, and price_modifier
- Add-ons array can be empty (optional)
- Each add-on must have id, name, and price
- No minimum/maximum array length enforced

---

## 💡 Best Practices & Recommendations

### Current Strengths

1. **Flexible Storage**: JSONB allows quick iteration without schema changes
2. **Unique Identification**: Cart item IDs properly distinguish configurations
3. **Price Calculation**: Centralized, consistent, and well-tested
4. **Historical Accuracy**: Orders store names, not references
5. **User Experience**: Intuitive selection interface with visual feedback
6. **Auto-selection**: Smart defaults for first-time selections

### Potential Improvements

#### 1. **Validation Enhancements**

**Current Issue**: No validation for empty variation/add-on names

**Recommendation**:
```typescript
variations: z.array(z.object({
  id: z.string(),
  name: z.string().min(1, 'Variation name is required'),  // Add min length
  price_modifier: z.number(),
  is_default: z.boolean().optional(),
})).default([]),
addons: z.array(z.object({
  id: z.string(),
  name: z.string().min(1, 'Add-on name is required'),  // Add min length
  price: z.number().min(0, 'Price cannot be negative'),  // Ensure non-negative
})).default([]),
```

#### 2. **Default Variation Enforcement**

**Current Issue**: Multiple variations could be marked as default

**Recommendation**:
```typescript
const validateVariations = (variations: Variation[]) => {
  const defaults = variations.filter(v => v.is_default)
  if (defaults.length > 1) {
    throw new Error('Only one variation can be marked as default')
  }
  return true
}
```

#### 3. **Add Required Variation Option**

**Use Case**: Some items MUST have a size selection (e.g., drinks)

**Recommendation**: Add field to menu item:
```typescript
export interface MenuItem {
  // ... existing fields
  variation_required?: boolean;  // If true, customer must select variation
}
```

#### 4. **Add-on Categories/Groups**

**Use Case**: Group add-ons like "Toppings", "Sauces", "Sides"

**Recommendation**:
```typescript
export interface AddonGroup {
  id: string;
  name: string;
  min_selections?: number;  // Minimum selections required
  max_selections?: number;  // Maximum selections allowed
  addons: Addon[];
}

export interface MenuItem {
  // ... existing fields
  addon_groups: AddonGroup[];  // Replace simple addons array
}
```

#### 5. **Inventory Tracking**

**Current Issue**: No stock management for variations

**Future Enhancement**:
```typescript
export interface Variation {
  id: string;
  name: string;
  price_modifier: number;
  is_default?: boolean;
  stock_quantity?: number;  // Optional inventory
  low_stock_threshold?: number;
}
```

#### 6. **Price History**

**Use Case**: Track price changes for analytics

**Recommendation**: Separate table:
```sql
create table menu_item_price_history (
  id uuid primary key,
  menu_item_id uuid references menu_items(id),
  price numeric(10,2),
  discounted_price numeric(10,2),
  changed_at timestamptz,
  changed_by uuid references auth.users(id)
);
```

#### 7. **Variation Display Order**

**Current Issue**: No explicit ordering for variations

**Recommendation**:
```typescript
export interface Variation {
  id: string;
  name: string;
  price_modifier: number;
  is_default?: boolean;
  display_order: number;  // Add ordering field
}
```

Then sort in UI:
```typescript
item.variations.sort((a, b) => a.display_order - b.display_order)
```

#### 8. **Normalize Data Structure (Future)**

**When to Consider**: If you reach ~10,000+ orders

**Benefits**:
- Better indexing and query performance
- Referential integrity
- Easier analytics

**Migration Path**:
```sql
-- Create normalized tables
create table variations (
  id uuid primary key,
  menu_item_id uuid references menu_items(id),
  name text not null,
  price_modifier numeric(10,2) not null,
  is_default boolean default false,
  display_order int not null,
  created_at timestamptz default now()
);

create table addons (
  id uuid primary key,
  menu_item_id uuid references menu_items(id),
  name text not null,
  price numeric(10,2) not null,
  display_order int not null,
  created_at timestamptz default now()
);

-- Migrate data from JSONB to tables
-- Keep JSONB fields for backward compatibility during transition
```

---

## 🧪 Testing Recommendations

### Unit Tests

```typescript
describe('calculateCartItemSubtotal', () => {
  it('calculates base price with no variations or addons', () => {
    const result = calculateCartItemSubtotal(10, undefined, [], 2)
    expect(result).toBe(20)
  })

  it('includes variation price modifier', () => {
    const variation = { id: '1', name: 'Large', price_modifier: 3 }
    const result = calculateCartItemSubtotal(10, variation, [], 1)
    expect(result).toBe(13)
  })

  it('includes addon prices', () => {
    const addons = [
      { id: '1', name: 'Extra Cheese', price: 1.5 },
      { id: '2', name: 'Mushrooms', price: 2 }
    ]
    const result = calculateCartItemSubtotal(10, undefined, addons, 1)
    expect(result).toBe(13.5)
  })

  it('multiplies by quantity correctly', () => {
    const variation = { id: '1', name: 'Large', price_modifier: 3 }
    const addons = [{ id: '1', name: 'Extra Cheese', price: 1.5 }]
    const result = calculateCartItemSubtotal(10, variation, addons, 2)
    expect(result).toBe(29) // (10 + 3 + 1.5) * 2
  })
})
```

### Integration Tests

```typescript
describe('Cart with Variations', () => {
  it('creates separate cart items for different variations', () => {
    const item = mockMenuItem
    const smallVar = { id: '1', name: 'Small', price_modifier: 0 }
    const largeVar = { id: '2', name: 'Large', price_modifier: 3 }
    
    addItem(item, smallVar, [], 1)
    addItem(item, largeVar, [], 1)
    
    expect(cart.items.length).toBe(2)
  })

  it('merges quantities for identical configurations', () => {
    const item = mockMenuItem
    const variation = { id: '1', name: 'Large', price_modifier: 3 }
    const addons = [{ id: '1', name: 'Cheese', price: 1.5 }]
    
    addItem(item, variation, addons, 1)
    addItem(item, variation, addons, 2)
    
    expect(cart.items.length).toBe(1)
    expect(cart.items[0].quantity).toBe(3)
  })
})
```

---

## 📝 Summary

The variations system is well-designed for the current scale and provides:

✅ **Flexibility**: JSONB storage allows rapid iteration
✅ **User Experience**: Intuitive selection interface
✅ **Price Accuracy**: Centralized calculation logic
✅ **Cart Intelligence**: Smart ID generation and deduplication
✅ **Historical Integrity**: Orders preserve selection names
✅ **Multi-tenant Support**: Works seamlessly across tenants

**When to Evolve:**
- **10,000+ orders**: Consider normalizing to relational tables
- **Complex rules**: Add validation for min/max selections
- **Inventory needs**: Add stock tracking
- **Advanced features**: Implement addon groups and dependencies

The current architecture provides a solid foundation that can scale with strategic enhancements as business needs grow.

---

## 🔗 Related Files

### Core Logic
- `src/types/database.ts` - Type definitions
- `src/lib/cart-utils.ts` - Price calculations
- `src/hooks/useCart.tsx` - Cart state management

### Admin Interface
- `src/components/admin/menu-item-form.tsx` - Create/edit variations
- `src/lib/admin-service.ts` - Server-side validation

### Customer Interface
- `src/components/customer/item-detail-modal.tsx` - Variation selection
- `src/components/customer/cart-drawer.tsx` - Cart display
- `src/app/[tenant]/cart/page.tsx` - Full cart view

### Database
- `supabase/migrations/0001_initial.sql` - Schema definition

---

## 📊 Quick Reference Table

### Variation vs Add-on: When to Use Which?

| Aspect | Variations | Add-ons |
|--------|-----------|---------|
| **Purpose** | Size/Type options (mutually exclusive) | Extra items/modifications (multi-select) |
| **Selection** | Customer must pick ONE | Customer can pick ZERO or MORE |
| **Examples** | Small, Medium, Large<br>Regular, Spicy<br>12", 14", 16" | Extra Cheese<br>No Onions<br>Add Bacon |
| **Price Type** | Price Modifier (can be $0) | Fixed Price |
| **Default** | First or marked as `is_default` | None selected by default |
| **Required** | Optional (can have none) | Optional (can have none) |
| **UI Pattern** | Radio buttons / Button group | Checkboxes |
| **Use Case** | When item comes in different sizes | When customer wants extras |

### Common Patterns in Food Industry

| Item Type | Typical Variations | Typical Add-ons |
|-----------|-------------------|-----------------|
| **Pizza** | Small, Medium, Large, XL<br>(price modifiers: +$0, +$4, +$7, +$10) | Extra Cheese, Pepperoni, Mushrooms, Olives<br>(prices: $1.50 - $3.00 each) |
| **Coffee** | Small (12oz), Medium (16oz), Large (20oz)<br>(price modifiers: +$0, +$1, +$2) | Extra Shot, Oat Milk, Whipped Cream<br>(prices: $0.50 - $1.50 each) |
| **Burger** | Single Patty, Double Patty, Triple Patty<br>(price modifiers: +$0, +$3, +$5) | Bacon, Cheese, Avocado, Extra Pickles<br>(prices: $1.00 - $2.50 each) |
| **Salad** | Small, Large<br>(price modifiers: +$0, +$4) | Grilled Chicken, Feta Cheese, Avocado<br>(prices: $2.00 - $4.00 each) |
| **Pasta** | Regular, Family Size<br>(price modifiers: +$0, +$6) | Meatballs, Extra Sauce, Garlic Bread<br>(prices: $2.00 - $3.50 each) |

### State Management Overview

| Location | State Variables | Storage Method | Persistence |
|----------|----------------|----------------|-------------|
| **Admin Form** | `variations[]`, `addons[]` | Component state | Database (JSONB) |
| **Item Modal** | `selectedVariation`, `selectedAddons[]` | Component state | Session only |
| **Cart** | `items[].selected_variation`, `items[].selected_addons[]` | Context + localStorage | Survives refresh |
| **Order** | `items[].variation`, `items[].addons[]` | Database (JSONB) | Permanent |

### Price Calculation Reference

| Component | Calculation Method | When Calculated |
|-----------|-------------------|-----------------|
| **Item Modal** | `calculateCartItemSubtotal()` | Real-time as user selects |
| **Add to Cart** | `calculateCartItemSubtotal()` | On "Add to Cart" click |
| **Cart Display** | Pre-calculated `item.subtotal` | Already stored |
| **Cart Total** | `calculateCartTotal(items)` | On each cart update |
| **Order** | Locked values from cart | At checkout time |

### File Location Quick Reference

| Functionality | Primary File | Secondary Files |
|--------------|-------------|-----------------|
| **Type Definitions** | `src/types/database.ts` | - |
| **Admin UI** | `src/components/admin/menu-item-form.tsx` | `src/lib/admin-service.ts` |
| **Customer Selection** | `src/components/customer/item-detail-modal.tsx` | `src/components/customer/menu-item-card.tsx` |
| **Cart Logic** | `src/hooks/useCart.tsx` | `src/lib/cart-utils.ts` |
| **Price Calculations** | `src/lib/cart-utils.ts` | Used throughout |
| **Database Schema** | `supabase/migrations/0001_initial.sql` | - |
| **Validation** | `src/lib/admin-service.ts` | Client-side in form components |

---

## 🎯 Key Takeaways

1. **JSONB Storage**: Variations and add-ons are stored as JSONB for flexibility
2. **Price Modifiers vs Fixed Prices**: Variations use modifiers, add-ons use fixed prices
3. **Unique Cart IDs**: Different configurations = different cart entries
4. **Default Selection**: First variation auto-selected for better UX
5. **Historical Accuracy**: Orders store names, not IDs (resilient to menu changes)
6. **Real-time Calculation**: Prices update instantly as customers select options
7. **Quantity Merging**: Same configuration added again merges quantities
8. **Multi-tenant Safe**: All operations scoped to tenant_id

---

*Last Updated: November 6, 2025*

