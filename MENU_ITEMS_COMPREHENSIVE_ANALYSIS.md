# Complete Menu Items Management & Creation Analysis

## 📋 Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Managing Existing Menu Items](#managing-existing-menu-items)
4. [Adding New Menu Items](#adding-new-menu-items)
5. [Variation Systems (Legacy vs New)](#variation-systems)
6. [Image Management](#image-management)
7. [Data Flow & State Management](#data-flow)
8. [Best Practices](#best-practices)
9. [Common Issues & Solutions](#common-issues)
10. [Technical Implementation Details](#technical-details)

---

## Overview

This document provides a complete analysis of the menu items management system, covering both **managing existing menu items** and **adding new menu items** in your multi-tenant white-label restaurant platform.

### Key Features
- ✅ Full CRUD operations (Create, Read, Update, Delete)
- ✅ Two variation systems (Legacy + New enhanced with images)
- ✅ Category management integration
- ✅ Cloudinary image upload
- ✅ Real-time search & filtering
- ✅ Availability toggling
- ✅ Multi-tenant isolation
- ✅ Server-side validation with Zod
- ✅ Responsive UI with Shadcn components

---

## System Architecture

### File Structure

```
src/
├── app/
│   ├── actions/
│   │   └── menu-items.ts              # Server actions (API layer)
│   └── [tenant]/admin/menu/
│       ├── page.tsx                   # List/Manage page
│       ├── loading.tsx                # Loading skeleton
│       ├── new/
│       │   └── page.tsx               # Add new item page
│       └── [id]/
│           └── page.tsx               # Edit existing item page
├── components/
│   ├── admin/
│   │   ├── menu-items-list.tsx        # List component with search/filter
│   │   ├── menu-item-form.tsx         # Universal form (create/edit)
│   │   └── menu-skeleton.tsx          # Loading state
│   └── shared/
│       └── image-upload.tsx           # Cloudinary upload widget
└── lib/
    └── admin-service.ts               # Database service layer
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 14 App Router, React Server Components |
| **UI Components** | Shadcn UI, Tailwind CSS, Radix UI |
| **State Management** | React useState, Server Actions |
| **Database** | Supabase (PostgreSQL) |
| **Validation** | Zod |
| **Image Storage** | Cloudinary |
| **Icons** | Lucide React |
| **Notifications** | Sonner (Toast) |

---

## Managing Existing Menu Items

### 1. Accessing Menu Management

**Route:** `/{tenant-slug}/admin/menu`

**Page Component:** `src/app/[tenant]/admin/menu/page.tsx`

```typescript
// Server Component - fetches data on the server
export default async function AdminMenuPage({ params }) {
  const { tenant: tenantSlug } = await params
  const tenantData = await getCachedTenantBySlug(tenantSlug)
  const tenant: Tenant = tenantData

  return (
    <div className="space-y-6">
      {/* Breadcrumbs navigation */}
      <Breadcrumbs items={[...]} />
      
      {/* Header with "Add Item" button */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Menu Management</h1>
        <Link href={`/${tenantSlug}/admin/menu/new`}>
          <Button>Add Item</Button>
        </Link>
      </div>

      {/* Menu items list with Suspense boundary */}
      <Suspense fallback={<MenuSkeleton />}>
        <MenuContent tenantSlug={tenantSlug} tenantId={tenant.id} />
      </Suspense>
    </div>
  )
}
```

### 2. List View Features

**Component:** `MenuItemsList` (`src/components/admin/menu-items-list.tsx`)

#### Search Functionality

```typescript
const filteredItems = items.filter((item) => {
  const matchesSearch =
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.description.toLowerCase().includes(searchQuery.toLowerCase())
  const matchesCategory = categoryFilter === 'all' || item.category_id === categoryFilter
  return matchesSearch && matchesCategory
})
```

**Features:**
- ✅ Real-time search by name or description
- ✅ Category filter dropdown
- ✅ Case-insensitive matching
- ✅ Client-side filtering (instant results)

#### Grid Display

```typescript
<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
  {filteredItems.map((item) => (
    <Card key={item.id}>
      {/* Image with aspect-video ratio */}
      <div className="relative aspect-video bg-muted">
        <Image
          src={item.image_url}
          alt={item.name}
          fill
          className="object-cover"
          loading="lazy"
        />
        {/* Badges */}
        {item.is_featured && <Badge>Featured</Badge>}
        {item.discounted_price && <Badge variant="destructive">Sale</Badge>}
      </div>
      
      {/* Content */}
      <CardContent>
        <h3>{item.name}</h3>
        <p className="text-muted-foreground line-clamp-2">
          {item.description}
        </p>
        
        {/* Price display */}
        <div className="flex items-center gap-2">
          {item.discounted_price && (
            <span className="line-through">{formatPrice(item.price)}</span>
          )}
          <span className="font-bold">
            {formatPrice(item.discounted_price || item.price)}
          </span>
        </div>
        
        {/* Actions */}
        <div className="flex items-center justify-between">
          <Button onClick={() => toggleAvailability(item.id)}>
            {item.is_available ? 'Available' : 'Hidden'}
          </Button>
          <div className="flex gap-1">
            <Link href={`/${tenantSlug}/admin/menu/${item.id}`}>
              <Button variant="ghost"><Edit /></Button>
            </Link>
            <Button variant="ghost" onClick={() => handleDelete(item.id)}>
              <Trash2 />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  ))}
</div>
```

**UI Features:**
- ✅ Responsive grid (1 col mobile, 2 tablet, 3 desktop)
- ✅ Lazy-loaded images for performance
- ✅ Visual badges (Featured, Sale)
- ✅ Price with discount strikethrough
- ✅ Quick availability toggle
- ✅ Edit and delete actions

### 3. Quick Actions

#### Toggle Availability

**Purpose:** Quickly show/hide items from customer menu without deleting

```typescript
const handleToggleAvailability = async (itemId: string, currentAvailability: boolean) => {
  const result = await toggleAvailabilityAction(itemId, tenantId, tenantSlug, !currentAvailability)
  
  if (result.success) {
    toast.success(`Menu item ${!currentAvailability ? 'enabled' : 'disabled'}`)
    router.refresh() // Revalidate server cache
  } else {
    toast.error(result.error || 'Failed to update availability')
  }
}
```

**Flow:**
1. User clicks Eye/EyeOff icon button
2. Client calls `toggleAvailabilityAction` server action
3. Server verifies admin permissions
4. Updates `is_available` field in database
5. Revalidates cache paths
6. UI refreshes automatically
7. Toast notification confirms success

**Benefits:**
- ⚡ Instant toggle (optimized for speed)
- 🔄 No page reload needed
- 🎨 Visual feedback (icon changes)
- 📊 Reflected immediately in customer menu

#### Delete Item

**Purpose:** Permanently remove menu item

```typescript
const handleDelete = async () => {
  if (!itemToDelete) return
  
  setIsDeleting(true)
  const result = await deleteMenuItemAction(itemToDelete, tenantId, tenantSlug)
  
  if (result.success) {
    toast.success('Menu item deleted successfully')
    setDeleteDialogOpen(false)
    router.refresh()
  } else {
    toast.error(result.error || 'Failed to delete menu item')
  }
  setIsDeleting(false)
}
```

**Flow:**
1. User clicks Trash icon
2. Confirmation dialog appears
3. User confirms deletion
4. Server action executes
5. Database cascade deletes related data
6. Cache revalidated
7. Item removed from list
8. Success toast shown

**Safety Features:**
- ⚠️ Confirmation dialog (prevents accidental deletion)
- 🔒 Admin authorization check
- 🗑️ Cascade deletion (cleans up related data)
- 📝 Error handling with user-friendly messages

### 4. Edit Existing Item

**Route:** `/{tenant-slug}/admin/menu/{item-id}`

**Page Component:** `src/app/[tenant]/admin/menu/[id]/page.tsx`

```typescript
export default async function EditMenuItemPage({ params }) {
  const { tenant: tenantSlug, id: itemId } = await params
  const tenantData = await getTenantBySlug(tenantSlug)
  const tenant: Tenant = tenantData

  // Fetch item and categories in parallel
  const [item, categories] = await Promise.all([
    getMenuItemById(itemId, tenant.id).catch(() => null),
    getCategoriesByTenant(tenant.id),
  ])

  if (!item) {
    return <div>Item not found</div>
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[...]} />
      <h1>Edit Menu Item</h1>
      <MenuItemForm
        item={item}                    // Pre-populated with existing data
        categories={categories}
        tenantId={tenant.id}
        tenantSlug={tenantSlug}
      />
    </div>
  )
}
```

**Features:**
- ✅ Pre-populated form fields
- ✅ Same form component as create (reusable)
- ✅ Shows existing image
- ✅ Preserves variations and addons
- ✅ 404 handling if item not found

---

## Adding New Menu Items

### 1. Prerequisites

**Required Before Adding Items:**
- ✅ At least one category must exist
- ✅ Cloudinary configured (for images)
- ✅ User must be tenant admin or superadmin

**Validation Check:**

```typescript
// In new/page.tsx
const categories = await getCategoriesByTenant(tenant.id)

if (categories.length === 0) {
  return (
    <div className="text-center py-12">
      <h2>No categories found</h2>
      <p>You need to create at least one category before adding menu items.</p>
      <a href={`/${tenantSlug}/admin/categories`}>Go to Categories</a>
    </div>
  )
}
```

### 2. Accessing Create Form

**Route:** `/{tenant-slug}/admin/menu/new`

**Entry Points:**
1. "Add Item" button in menu list header
2. "Add Item" button in empty state
3. Direct URL navigation

### 3. Form Structure

**Component:** `MenuItemForm` (`src/components/admin/menu-item-form.tsx`)

The form is divided into **4 main sections:**

#### Section 1: Basic Information

```typescript
<Card>
  <CardHeader>
    <CardTitle>Basic Information</CardTitle>
  </CardHeader>
  <CardContent className="space-y-4">
    {/* Item Name */}
    <div className="space-y-2">
      <Label htmlFor="name">Item Name *</Label>
      <Input
        id="name"
        value={formData.name}
        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        placeholder="e.g., Margherita Pizza"
        required
      />
      {errors.name && <p className="text-destructive">{errors.name}</p>}
    </div>

    {/* Description */}
    <div className="space-y-2">
      <Label htmlFor="description">Description *</Label>
      <Textarea
        id="description"
        value={formData.description}
        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
        placeholder="Describe your dish... (at least 10 characters)"
        rows={3}
        required
      />
      {errors.description && <p className="text-destructive">{errors.description}</p>}
      <p className="text-xs text-muted-foreground">
        {formData.description.length}/10 characters
      </p>
    </div>

    {/* Price and Discounted Price */}
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="price">Price ($) *</Label>
        <Input
          id="price"
          type="number"
          step="0.01"
          value={formData.price}
          onChange={(e) => setFormData({ ...formData, price: e.target.value })}
          placeholder="14.99"
          required
        />
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="discounted_price">Discounted Price ($)</Label>
        <Input
          id="discounted_price"
          type="number"
          step="0.01"
          value={formData.discounted_price}
          placeholder="Optional"
        />
      </div>
    </div>

    {/* Category Selection */}
    <div className="space-y-2">
      <Label htmlFor="category">Category *</Label>
      <Select
        value={formData.category_id}
        onValueChange={(value) => setFormData({ ...formData, category_id: value })}
      >
        <SelectTrigger>
          <SelectValue placeholder="Select category" />
        </SelectTrigger>
        <SelectContent>
          {categories.map((category) => (
            <SelectItem key={category.id} value={category.id}>
              {category.icon} {category.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>

    {/* Image Upload */}
    <div className="space-y-2">
      <ImageUpload
        currentImageUrl={formData.image_url}
        onImageUploaded={(url) => setFormData({ ...formData, image_url: url })}
        label="Dish Image *"
        description="Upload a photo of your dish (horizontal/landscape recommended)"
        folder="menu-items"
      />
    </div>

    {/* Checkboxes */}
    <div className="flex gap-4">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={formData.is_available}
          onChange={(e) => setFormData({ ...formData, is_available: e.target.checked })}
        />
        <span>Available</span>
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={formData.is_featured}
          onChange={(e) => setFormData({ ...formData, is_featured: e.target.checked })}
        />
        <span>Featured</span>
      </label>
    </div>
  </CardContent>
</Card>
```

**Field Validations:**

| Field | Validation | Error Message |
|-------|-----------|---------------|
| `name` | Min 2 characters | "Name must be at least 2 characters" |
| `description` | Min 10 characters | "Description must be at least 10 characters" |
| `price` | Positive number | "Price must be a positive number" |
| `discounted_price` | Positive number (optional) | "Discounted price must be a positive number" |
| `image_url` | Valid URL | "Must be a valid URL" |
| `category_id` | Valid UUID | "Must select a category" |

#### Section 2: Variation System Selector

```typescript
<Card>
  <CardHeader>
    <CardTitle>Variation System</CardTitle>
  </CardHeader>
  <CardContent>
    <div className="flex items-center gap-4">
      {/* Legacy System */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="radio"
          checked={!useNewVariations}
          onChange={() => setUseNewVariations(false)}
        />
        <span>Simple Variations (Legacy)</span>
      </label>
      
      {/* New Enhanced System */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="radio"
          checked={useNewVariations}
          onChange={() => setUseNewVariations(true)}
        />
        <span>Grouped Variations with Images (New)</span>
      </label>
    </div>
    <p className="text-xs text-muted-foreground mt-2">
      {useNewVariations 
        ? 'Create organized variation groups (Size, Spice Level, etc.) with optional images for each option.'
        : 'Simple flat list of variations for basic size options.'}
    </p>
  </CardContent>
</Card>
```

**When to Use Each:**

**Legacy System** - Best for:
- ✅ Simple size variations only
- ✅ No need for images
- ✅ Quick setup
- ✅ Single variation category

**New Enhanced System** - Best for:
- ✅ Multiple variation categories (Size + Spice + Protein)
- ✅ Visual selection with images
- ✅ Required vs optional selections
- ✅ Better organization and UX

#### Section 3A: Legacy Variations (if selected)

```typescript
{!useNewVariations && (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between">
      <CardTitle>Variations</CardTitle>
      <Button type="button" onClick={addVariation}>
        <Plus className="mr-2 h-4 w-4" />
        Add Variation
      </Button>
    </CardHeader>
    <CardContent>
      {variations.length === 0 ? (
        <p className="text-muted-foreground">
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
)}
```

**Example Usage:**
```
Name: Small          Price Modifier: 0
Name: Medium         Price Modifier: 4.00
Name: Large          Price Modifier: 7.00
```

#### Section 3B: New Variation Types (if selected)

```typescript
{useNewVariations && (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between">
      <CardTitle>Variation Types</CardTitle>
      <Button type="button" onClick={addVariationType}>
        <Plus className="mr-2 h-4 w-4" />
        Add Variation Type
      </Button>
    </CardHeader>
    <CardContent>
      {variationTypes.length === 0 ? (
        <p className="text-muted-foreground">
          No variation types. Add groups like Size, Spice Level, Protein Type, etc.
        </p>
      ) : (
        <div className="space-y-6">
          {variationTypes.map((variationType, typeIndex) => (
            <div key={variationType.id} className="border rounded-lg p-4 space-y-4">
              {/* Type Header */}
              <div className="flex items-start gap-3">
                <div className="flex-1 space-y-3">
                  <Input
                    placeholder="Type Name (e.g., Size, Spice Level)"
                    value={variationType.name}
                    onChange={(e) => updateVariationType(typeIndex, 'name', e.target.value)}
                  />
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={variationType.is_required}
                      onChange={(e) => updateVariationType(typeIndex, 'is_required', e.target.checked)}
                    />
                    <span>Required (customer must select)</span>
                  </label>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => removeVariationType(typeIndex)}
                >
                  <Trash2 />
                </Button>
              </div>

              {/* Options for this Type */}
              <div className="ml-4 space-y-3 border-l-2 pl-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">Options</h4>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addVariationOption(typeIndex)}
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    Add Option
                  </Button>
                </div>

                {variationType.options.map((option, optionIndex) => (
                  <div key={option.id} className="border rounded-md p-3 space-y-3 bg-gray-50">
                    {/* Option Name and Price */}
                    <div className="flex gap-2">
                      <Input
                        placeholder="Option name (e.g., Small)"
                        value={option.name}
                        onChange={(e) =>
                          updateVariationOption(typeIndex, optionIndex, 'name', e.target.value)
                        }
                      />
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Price modifier"
                        value={option.price_modifier}
                        onChange={(e) =>
                          updateVariationOption(typeIndex, optionIndex, 'price_modifier', parseFloat(e.target.value))
                        }
                        className="w-32"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => removeVariationOption(typeIndex, optionIndex)}
                      >
                        <Trash2 />
                      </Button>
                    </div>

                    {/* Image Upload for Option */}
                    <div className="space-y-2">
                      <Label className="text-xs">Option Image (Optional)</Label>
                      <ImageUpload
                        currentImageUrl={option.image_url || ''}
                        onImageUploaded={(url) =>
                          updateVariationOption(typeIndex, optionIndex, 'image_url', url)
                        }
                        description="Upload an image for this option"
                        folder="variation-options"
                      />
                    </div>

                    {/* Default checkbox */}
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={option.is_default || false}
                        onChange={(e) =>
                          updateVariationOption(typeIndex, optionIndex, 'is_default', e.target.checked)
                        }
                      />
                      <span className="text-xs">Default option</span>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </CardContent>
  </Card>
)}
```

**Example Structure:**

```
Variation Type 1: "Size" (Required)
  ├── Option 1: Small (10") - +$0.00 - [image] - (default)
  ├── Option 2: Medium (12") - +$4.00 - [image]
  └── Option 3: Large (14") - +$7.00 - [image]

Variation Type 2: "Spice Level" (Optional)
  ├── Option 1: Mild - +$0.00 - (default)
  ├── Option 2: Spicy - +$0.00
  └── Option 3: Extra Hot - +$1.50
```

#### Section 4: Add-ons

```typescript
<Card>
  <CardHeader className="flex flex-row items-center justify-between">
    <CardTitle>Add-ons</CardTitle>
    <Button type="button" onClick={addAddon}>
      <Plus className="mr-2 h-4 w-4" />
      Add Add-on
    </Button>
  </CardHeader>
  <CardContent>
    {addons.length === 0 ? (
      <p className="text-muted-foreground">
        No add-ons. Add extras like Extra Cheese, No Onions.
      </p>
    ) : (
      <div className="space-y-3">
        {addons.map((addon, index) => (
          <div key={addon.id} className="flex gap-2">
            <Input
              placeholder="Name (e.g., Extra Cheese)"
              value={addon.name}
              onChange={(e) => updateAddon(index, 'name', e.target.value)}
            />
            <Input
              type="number"
              step="0.01"
              placeholder="Price"
              value={addon.price}
              onChange={(e) => updateAddon(index, 'price', parseFloat(e.target.value))}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeAddon(index)}
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

**Example:**
```
Name: Extra Cheese     Price: 2.50
Name: Mushrooms        Price: 2.00
Name: Olives           Price: 1.50
```

### 4. Form Submission Flow

```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault()
  
  // 1. Client-side validation
  if (!validateForm()) {
    return // Errors displayed inline
  }

  setIsSubmitting(true)
  
  try {
    // 2. Import server actions
    const { createMenuItemAction, updateMenuItemAction } = await import('@/app/actions/menu-items')
    
    // 3. Prepare input data
    const input = {
      name: formData.name,
      description: formData.description,
      price: parseFloat(formData.price),
      discounted_price: formData.discounted_price ? parseFloat(formData.discounted_price) : null,
      image_url: formData.image_url,
      category_id: formData.category_id,
      // Include variations based on selected system
      variation_types: useNewVariations ? variationTypes : [],
      variations: useNewVariations ? [] : variations,
      addons,
      is_available: formData.is_available,
      is_featured: formData.is_featured,
      order: item?.order || 0,
    }

    // 4. Call appropriate server action
    const result = item
      ? await updateMenuItemAction(item.id, tenantId, tenantSlug, input)
      : await createMenuItemAction(tenantId, tenantSlug, input)

    // 5. Handle success
    if (result.success) {
      toast.success(item ? 'Menu item updated!' : 'Menu item created!')
      router.push(`/${tenantSlug}/admin/menu`)
      router.refresh()
    } else {
      // 6. Handle errors
      // Parse server validation errors or show general error
      toast.error(result.error || 'Failed to save menu item')
    }
  } catch (error) {
    toast.error('An unexpected error occurred')
  } finally {
    setIsSubmitting(false)
  }
}
```

**Flow Diagram:**

```
User fills form
    ↓
Clicks "Create Item"
    ↓
validateForm() - Client-side Zod validation
    ↓ (if valid)
createMenuItemAction() - Server action
    ↓
verifyTenantAdmin() - Authorization check
    ↓
menuItemSchema.parse() - Server-side Zod validation
    ↓
Supabase insert
    ↓
revalidatePath() - Clear cache
    ↓
Return { success: true, data: item }
    ↓
router.push() - Navigate to list
    ↓
toast.success() - Show success message
```

### 5. Validation Schema

**Client & Server:** Both use the same Zod schema for consistency

```typescript
const menuItemSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  price: z.number().positive('Price must be positive'),
  discounted_price: z.number().positive().optional().nullable(),
  image_url: z.string().url('Must be a valid URL'),
  category_id: z.string().uuid('Must select a category'),
  variation_types: z.array(variationTypeSchema).optional().default([]),
  variations: z.array(z.object({
    id: z.string(),
    name: z.string(),
    price_modifier: z.number(),
    is_default: z.boolean().optional(),
  })).optional().default([]),
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

---

## Variation Systems

### Legacy System (Simple Variations)

**Structure:**

```json
{
  "variations": [
    {
      "id": "var-1",
      "name": "Small",
      "price_modifier": 0,
      "is_default": true
    },
    {
      "id": "var-2",
      "name": "Medium",
      "price_modifier": 4.00,
      "is_default": false
    },
    {
      "id": "var-3",
      "name": "Large",
      "price_modifier": 7.00,
      "is_default": false
    }
  ]
}
```

**Pros:**
- ✅ Simple and fast to set up
- ✅ Good for basic size options
- ✅ Minimal data structure

**Cons:**
- ❌ No grouping/organization
- ❌ No images per option
- ❌ No required/optional control
- ❌ Limited to one variation category

### New Enhanced System (Variation Types)

**Structure:**

```json
{
  "variation_types": [
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
          "image_url": "https://cloudinary.com/.../small.jpg",
          "is_default": true,
          "display_order": 0
        },
        {
          "id": "opt-2",
          "name": "Medium (12\")",
          "price_modifier": 4.00,
          "image_url": "https://cloudinary.com/.../medium.jpg",
          "is_default": false,
          "display_order": 1
        }
      ]
    },
    {
      "id": "type-2",
      "name": "Spice Level",
      "is_required": false,
      "display_order": 1,
      "options": [
        {
          "id": "opt-3",
          "name": "Mild",
          "price_modifier": 0,
          "is_default": true,
          "display_order": 0
        },
        {
          "id": "opt-4",
          "name": "Spicy",
          "price_modifier": 0,
          "display_order": 1
        }
      ]
    }
  ]
}
```

**Pros:**
- ✅ Multiple variation categories
- ✅ Images for visual selection
- ✅ Required vs optional control
- ✅ Better organization
- ✅ Enhanced UX for customers
- ✅ Display order control

**Cons:**
- ❌ More complex setup
- ❌ Requires more data

### Backward Compatibility

**Both systems coexist:**
- Items can use either system
- Database stores both fields
- Frontend auto-detects which to use
- No migration required for existing items

---

## Image Management

### Cloudinary Integration

**Component:** `ImageUpload` (`src/components/shared/image-upload.tsx`)

#### Setup Requirements

**Environment Variables:**

```bash
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your-cloud-name
NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET=your-preset
```

#### Upload Widget Configuration

```typescript
<CldUploadWidget
  uploadPreset={cloudinaryPreset}
  options={{
    folder,                               // 'menu-items' or 'variation-options'
    maxFiles: 1,
    resourceType: 'image',
    clientAllowedFormats: ['png', 'jpg', 'jpeg', 'webp', 'gif'],
    maxFileSize: 5000000,                 // 5MB
    sources: ['local', 'url', 'camera'],
    multiple: false,
  }}
  onSuccess={handleUploadSuccess}
>
  {({ open }) => (
    <Button onClick={open}>Upload Image</Button>
  )}
</CldUploadWidget>
```

#### Features

- ✅ Drag & drop upload
- ✅ URL input support
- ✅ Camera capture (mobile)
- ✅ Format validation (PNG, JPG, WEBP, GIF)
- ✅ Size limit (5MB)
- ✅ Preview before upload
- ✅ Remove uploaded image
- ✅ Loading states

#### Usage in Form

**Menu Item Image:**
```typescript
<ImageUpload
  currentImageUrl={formData.image_url}
  onImageUploaded={(url) => setFormData({ ...formData, image_url: url })}
  label="Dish Image *"
  description="Upload a photo of your dish (horizontal/landscape recommended)"
  folder="menu-items"
/>
```

**Variation Option Image:**
```typescript
<ImageUpload
  currentImageUrl={option.image_url || ''}
  onImageUploaded={(url) => updateVariationOption(typeIndex, optionIndex, 'image_url', url)}
  label="Option Image (Optional)"
  description="Upload an image for this option"
  folder="variation-options"
/>
```

#### Best Practices

**Image Specifications:**
- **Aspect Ratio:** 16:9 (landscape) for menu items
- **Aspect Ratio:** 1:1 (square) for variation options
- **Resolution:** 1920x1080 or higher
- **File Size:** Under 5MB
- **Format:** WebP (best), JPG (good), PNG (large)

**Optimization Tips:**
- Use Cloudinary auto-format transformation
- Enable lazy loading in Next.js Image component
- Compress images before upload
- Use descriptive filenames

---

## Data Flow & State Management

### Server Actions Architecture

**File:** `src/app/actions/menu-items.ts`

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  toggleMenuItemAvailability,
} from '@/lib/admin-service'

export async function createMenuItemAction(tenantId: string, tenantSlug: string, input: MenuItemInput) {
  try {
    const item = await createMenuItem(tenantId, input)
    
    // Revalidate cache
    revalidatePath(`/${tenantSlug}/admin/menu`)
    revalidatePath(`/${tenantSlug}/menu`)
    
    return { success: true, data: item }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { 
        success: false, 
        error: JSON.stringify(error.issues.map(err => ({
          path: err.path,
          message: err.message,
        })))
      }
    }
    return { success: false, error: error.message }
  }
}
```

### Database Service Layer

**File:** `src/lib/admin-service.ts`

```typescript
export async function createMenuItem(tenantId: string, input: MenuItemInput) {
  // 1. Verify admin permissions
  await verifyTenantAdmin(tenantId)
  
  // 2. Validate input
  const validated = menuItemSchema.parse(input)
  
  // 3. Get Supabase client
  const supabase = await createClient()

  // 4. Insert into database
  const { data, error } = await supabase
    .from('menu_items')
    .insert({
      tenant_id: tenantId,
      ...validated,
      variations: validated.variations as any,
      addons: validated.addons as any,
    } as any)
    .select()
    .single()

  if (error) throw error
  return data as MenuItem
}
```

### Authorization Flow

```typescript
export async function verifyTenantAdmin(tenantId: string) {
  const supabase = await createClient()
  
  // 1. Get authenticated user
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    throw new Error('Unauthorized: Not authenticated')
  }

  // 2. Get user role
  const { data: userRole, error: roleError } = await supabase
    .from('app_users')
    .select('role, tenant_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (roleError || !userRole) {
    throw new Error('Unauthorized: User role not found')
  }

  // 3. Check authorization
  const isAuthorized = 
    userRole.role === 'superadmin' || 
    (userRole.role === 'admin' && userRole.tenant_id === tenantId)

  if (!isAuthorized) {
    throw new Error('Unauthorized: Not admin of this tenant')
  }

  return { user, userRole }
}
```

### Cache Management

**Revalidation Strategy:**

```typescript
// After create/update/delete
revalidatePath(`/${tenantSlug}/admin/menu`)    // Admin list page
revalidatePath(`/${tenantSlug}/menu`)          // Customer menu page
```

**Benefits:**
- ✅ Instant updates across pages
- ✅ No manual cache clearing needed
- ✅ Automatic consistency
- ✅ Optimized performance

---

## Best Practices

### 1. Creating Menu Items

#### Naming Conventions

**Good:**
- ✅ "Margherita Pizza (10\")"
- ✅ "Classic Burger with Fries"
- ✅ "Chicken Tikka Masala (Spicy)"
- ✅ "Iced Caramel Latte - Large"

**Avoid:**
- ❌ "pizza" (not descriptive)
- ❌ "Item #123" (meaningless)
- ❌ "Best dish ever!!!" (unprofessional)
- ❌ "food" (too generic)

#### Description Writing

**Good:**
```
Fresh mozzarella, tomatoes, and basil on a thin crust with our 
signature marinara sauce. Baked to perfection in our wood-fired oven.
```

**Avoid:**
```
Pizza
```

**Tips:**
- ✅ Mention key ingredients
- ✅ Highlight unique features
- ✅ Include dietary info (vegan, gluten-free)
- ✅ Use sensory words (crispy, tender, savory)
- ✅ Keep it under 150 characters for readability

#### Pricing Strategy

**Base Price:**
- Set to the most common/default size
- Use .99 endings for psychology ($14.99 vs $15.00)

**Discounted Price:**
- Use for limited-time promotions
- Ensure discount is meaningful (at least 10%)
- Original price shows with strikethrough

**Price Modifiers:**
- First option usually +$0.00
- Incremental pricing for larger sizes
- Premium ingredients cost more

#### Image Guidelines

**Menu Item Main Image:**
- **Aspect ratio:** 16:9 (landscape)
- **Resolution:** 1920x1080 minimum
- **Focus:** Show the complete dish
- **Lighting:** Well-lit, natural colors
- **Background:** Clean, uncluttered
- **Angle:** 45° angle works best for food

**Variation Option Images:**
- **Aspect ratio:** 1:1 (square)
- **Resolution:** 800x800 minimum
- **Focus:** Show size difference or variation clearly
- **Consistency:** Same style across all options
- **Context:** Include reference objects for scale

### 2. Organizing Variations

#### When to Use Variation Types

**Required Variation Types:**
- Size (Small, Medium, Large)
- Protein choice (Chicken, Beef, Tofu)
- Temperature (Hot, Iced)
- Main ingredient (crucial to the dish)

**Optional Variation Types:**
- Spice level
- Bun type
- Toppings preferences
- Sauce selection

#### Naming Variation Options

**Good:**
- ✅ "Small (10\", Serves 1)"
- ✅ "Medium (12\", Serves 2)"
- ✅ "Extra Hot 🌶️🌶️🌶️"
- ✅ "Oat Milk (+$0.50)"

**Avoid:**
- ❌ "S" (unclear abbreviation)
- ❌ "Option 1" (meaningless)
- ❌ "Big one" (unprofessional)

### 3. Add-ons Strategy

**Good Add-ons:**
- ✅ Extra protein (bacon, avocado)
- ✅ Premium ingredients (truffle oil)
- ✅ Extra portions (double cheese)
- ✅ Customizations (no onions, extra sauce)

**Pricing:**
- Price add-ons appropriately (cost + margin)
- Keep add-on names short and clear
- Group related add-ons logically

### 4. Category Organization

**Categories should be:**
- ✅ Clear and intuitive (Pizza, Burgers, Drinks)
- ✅ Icon-enhanced for visual recognition
- ✅ Ordered by popularity or meal flow
- ✅ Limited to 5-10 categories max

### 5. Availability Management

**Use availability toggle for:**
- ✅ Sold-out items (temporary)
- ✅ Seasonal items (out of season)
- ✅ Time-based availability (lunch specials)
- ✅ Testing new items (gradual rollout)

**Don't:**
- ❌ Delete items that are temporarily unavailable
- ❌ Leave unavailable items hidden for months
- ❌ Use as a pricing test (confusing for customers)

### 6. Featured Items

**Mark as Featured:**
- ✅ Best sellers
- ✅ New menu items
- ✅ Promotional items
- ✅ Chef's specials

**Limit featured items:**
- Keep to 3-5 featured items max
- Rotate regularly to maintain interest
- Use for strategic promotion

---

## Common Issues & Solutions

### Issue 1: "No categories found" Error

**Problem:** Cannot add menu items

**Cause:** No categories exist for the tenant

**Solution:**
```
1. Navigate to /{tenant}/admin/categories
2. Create at least one category
3. Return to menu management
4. Try creating item again
```

### Issue 2: Image Upload Not Working

**Problem:** "Cloudinary is not configured" message

**Cause:** Missing environment variables

**Solution:**
```bash
# Add to .env.local
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your-cloud-name
NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET=your-preset
```

### Issue 3: Validation Errors on Submit

**Problem:** Form shows validation errors

**Common Causes & Solutions:**

| Error | Cause | Solution |
|-------|-------|----------|
| "Name must be at least 2 characters" | Name too short | Enter longer name |
| "Description must be at least 10 characters" | Description too short | Add more details |
| "Price must be positive" | Price is 0 or negative | Enter valid price |
| "Must be a valid URL" | Image not uploaded | Upload image first |
| "Must select a category" | No category selected | Select category |

### Issue 4: Items Not Showing in Customer Menu

**Possible Causes:**

1. **Item marked as unavailable**
   - Solution: Toggle availability on

2. **Category is inactive**
   - Solution: Activate category in category management

3. **Cache not cleared**
   - Solution: Wait a few seconds or hard refresh (Cmd/Ctrl + Shift + R)

4. **RLS policy issue**
   - Solution: Check Supabase RLS policies are correct

### Issue 5: Price Calculation Incorrect

**Problem:** Total price doesn't match expected

**Debugging Steps:**
```
1. Check base price
2. Add selected variation modifier
3. Add all addon prices
4. Multiply by quantity
5. Verify each step

Formula: (Base + Variation Modifier + Sum of Addons) × Quantity
```

### Issue 6: Variations Not Saving

**Problem:** Variations disappear after saving

**Cause:** Validation failed or empty variations

**Solution:**
- Ensure each variation has a name
- Check price modifiers are valid numbers
- At least one variation should be marked default

### Issue 7: Cannot Delete Menu Item

**Problem:** Delete action fails

**Possible Causes:**

1. **Permission issue**
   - Solution: Ensure you're admin of the tenant

2. **Database constraint**
   - Solution: Check if item is referenced in active orders

3. **Network error**
   - Solution: Check internet connection, try again

---

## Technical Implementation Details

### Database Schema

**Table:** `menu_items`

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
  variations jsonb not null default '[]'::jsonb,              -- Legacy system
  variation_types jsonb not null default '[]'::jsonb,         -- New system
  addons jsonb not null default '[]'::jsonb,
  is_available boolean not null default true,
  is_featured boolean not null default false,
  "order" integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  constraint menu_items_price_ck check (price >= 0),
  constraint menu_items_discount_ck check (discounted_price is null or discounted_price >= 0)
);
```

**Indexes:**

```sql
create index menu_items_tenant_idx on public.menu_items(tenant_id);
create index menu_items_category_idx on public.menu_items(category_id);
create index menu_items_order_idx on public.menu_items(tenant_id, "order");
```

### Row Level Security (RLS)

**Read Policy (Public):**

```sql
create policy "Public read access for available items"
on public.menu_items for select
using (
  is_available = true
);
```

**Write Policies (Admin only):**

```sql
create policy "Admin write access"
on public.menu_items for all
using (
  exists (
    select 1 from public.app_users
    where user_id = auth.uid()
    and (
      role = 'superadmin' 
      or (role = 'admin' and tenant_id = menu_items.tenant_id)
    )
  )
);
```

### TypeScript Types

**Database Types:**

```typescript
interface MenuItem {
  id: string
  tenant_id: string
  category_id: string
  name: string
  description: string
  price: number
  discounted_price: number | null
  image_url: string
  variations: Variation[]
  variation_types: VariationType[]
  addons: Addon[]
  is_available: boolean
  is_featured: boolean
  order: number
  created_at: string
  updated_at: string
  category?: Category  // Joined data
}

interface Variation {
  id: string
  name: string
  price_modifier: number
  is_default?: boolean
}

interface VariationType {
  id: string
  name: string
  is_required: boolean
  display_order: number
  options: VariationOption[]
}

interface VariationOption {
  id: string
  name: string
  price_modifier: number
  image_url?: string | null
  is_default?: boolean
  display_order: number
}

interface Addon {
  id: string
  name: string
  price: number
}
```

### Performance Optimizations

**1. Parallel Data Fetching:**

```typescript
const [item, categories] = await Promise.all([
  getMenuItemById(itemId, tenant.id),
  getCategoriesByTenant(tenant.id),
])
```

**2. Suspense Boundaries:**

```typescript
<Suspense fallback={<MenuSkeleton />}>
  <MenuContent tenantSlug={tenantSlug} tenantId={tenant.id} />
</Suspense>
```

**3. Lazy Image Loading:**

```typescript
<Image
  src={item.image_url}
  alt={item.name}
  fill
  loading="lazy"
  placeholder="blur"
  blurDataURL="data:image/svg+xml..."
/>
```

**4. Debounced Search:**

```typescript
// In MenuItemsList
const [searchQuery, setSearchQuery] = useState('')

// Client-side filtering (instant)
const filteredItems = items.filter(item => 
  item.name.toLowerCase().includes(searchQuery.toLowerCase())
)
```

**5. Path Revalidation:**

```typescript
revalidatePath(`/${tenantSlug}/admin/menu`)
revalidatePath(`/${tenantSlug}/menu`)
```

### Error Handling

**Layered Error Handling:**

```typescript
// 1. Client-side validation
if (!validateForm()) {
  return // Show inline errors
}

// 2. Server action try-catch
try {
  const result = await createMenuItemAction(...)
  
  // 3. Result success check
  if (result.success) {
    toast.success('Created!')
  } else {
    // 4. Parse server errors
    toast.error(result.error)
  }
} catch (error) {
  // 5. Unexpected errors
  toast.error('Unexpected error occurred')
} finally {
  setIsSubmitting(false)
}
```

---

## Summary

### Menu Management Workflow

```
Access Menu List → Search/Filter → View Item Details
    ↓                                       ↓
Edit Item ←─────────────────────────── Quick Toggle
    ↓
Update Form → Save → Revalidate → Success
```

### Adding New Items Workflow

```
Click "Add Item" → Check Prerequisites (categories exist)
    ↓
Fill Basic Info → Upload Image → Select Category
    ↓
Choose Variation System → Add Variations/Types → Add Options
    ↓
Add Add-ons → Review → Submit
    ↓
Validate → Authorize → Save to DB → Revalidate
    ↓
Redirect to List → Show Success Toast
```

### Key Takeaways

**For Managing Menu Items:**
- ✅ Search and filter for quick access
- ✅ Quick availability toggle for temporary changes
- ✅ Edit for full control
- ✅ Delete with confirmation for safety

**For Adding New Items:**
- ✅ Ensure categories exist first
- ✅ Choose appropriate variation system
- ✅ Use high-quality images
- ✅ Write clear descriptions
- ✅ Price strategically
- ✅ Validate before submitting

**Best Practices:**
- ✅ Use new variation system for complex items
- ✅ Add images to variation options for better UX
- ✅ Set default options for required variations
- ✅ Keep add-ons focused and priced appropriately
- ✅ Test items as customer before publishing
- ✅ Use availability toggle instead of deleting

---

## Quick Reference

### Important Routes

| Page | Route | Purpose |
|------|-------|---------|
| Menu List | `/{tenant}/admin/menu` | View and manage all items |
| Add New | `/{tenant}/admin/menu/new` | Create new menu item |
| Edit Item | `/{tenant}/admin/menu/{id}` | Edit existing item |
| Categories | `/{tenant}/admin/categories` | Manage categories |

### Key Components

| Component | File | Purpose |
|-----------|------|---------|
| MenuItemsList | `menu-items-list.tsx` | List with search/filter |
| MenuItemForm | `menu-item-form.tsx` | Create/edit form |
| ImageUpload | `image-upload.tsx` | Cloudinary upload |
| MenuSkeleton | `menu-skeleton.tsx` | Loading state |

### Server Actions

| Action | Purpose |
|--------|---------|
| `createMenuItemAction` | Create new item |
| `updateMenuItemAction` | Update existing item |
| `deleteMenuItemAction` | Delete item |
| `toggleAvailabilityAction` | Quick availability toggle |

### Environment Variables

```bash
# Required for image upload
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your-cloud-name
NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET=your-preset

# Supabase (should already exist)
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

---

*Last Updated: Based on current codebase analysis*


