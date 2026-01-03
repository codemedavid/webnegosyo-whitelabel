# Menu Items Per Tenant - Comprehensive Analysis

## Executive Summary

This document provides a comprehensive analysis of how menu items are structured, managed, and displayed per tenant in the multi-tenant white-label restaurant platform. The system implements strict tenant isolation at the database level with Row Level Security (RLS) policies, ensuring data privacy and security.

---

## 1. Database Architecture

### 1.1 Schema Structure

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

**Key Design Decisions:**
- **Tenant Isolation**: Every menu item is tied to a `tenant_id` with a foreign key constraint
- **Cascade Delete**: When a tenant is deleted, all their menu items are automatically deleted
- **Category Relationship**: Optional category assignment (can be null)
- **JSONB Flexibility**: Variations and addons stored as JSONB for rapid iteration
- **Ordering Support**: Custom ordering per tenant/category via `order` field
- **Availability Control**: `is_available` flag controls public visibility
- **Featured Items**: `is_featured` flag for highlighting special items

### 1.2 Database Indexes

```sql
-- Tenant-based queries (most common)
create index menu_items_tenant_idx on public.menu_items(tenant_id);

-- Category filtering
create index menu_items_category_idx on public.menu_items(category_id);

-- Composite index for ordering (tenant + category + order)
create index menu_items_order_idx on public.menu_items(tenant_id, category_id, "order");
```

**Performance Optimization:**
- All queries filter by `tenant_id` first, making the tenant index critical
- Composite index supports efficient ordering queries
- Category index supports filtering within tenant scope

### 1.3 Row Level Security (RLS)

**Read Policy (Public Access):**
```sql
create policy menu_items_read_available on public.menu_items
  for select using (
    is_available = true and exists (
      select 1 from public.tenants t
      where t.id = tenant_id and t.is_active = true
    )
  );
```

**Write Policy (Admin Only):**
```sql
create policy menu_items_write_admin on public.menu_items
  for all
  using (exists (
    select 1 from public.app_users au
    where au.user_id = auth.uid() and (
      au.role = 'superadmin' 
      or (au.role = 'admin' and au.tenant_id = menu_items.tenant_id)
    )
  ))
  with check (exists (
    select 1 from public.app_users au
    where au.user_id = auth.uid() and (
      au.role = 'superadmin' 
      or (au.role = 'admin' and au.tenant_id = menu_items.tenant_id)
    )
  ));
```

**Security Features:**
- Public users can only see `is_available = true` items
- Only active tenants' items are visible
- Admins can only modify items within their tenant
- Superadmins have global access
- All operations verify tenant ownership

---

## 2. Service Layer

### 2.1 Core Functions (`src/lib/admin-service.ts`)

#### Read Operations

**`getMenuItemsByTenant(tenantId, params?)`**
- **Purpose**: Fetch menu items for a specific tenant
- **Parameters**:
  - `tenantId`: UUID of the tenant
  - `params?`: Optional pagination and filtering
- **Returns**: `MenuItem[]` or `PaginatedMenuItemsResult`
- **Features**:
  - Supports pagination (default: 24 items per page)
  - Category filtering
  - Search by name/description
  - Availability filtering
  - Includes category relationship
  - Ordered by `order` field

**`getMenuItemById(itemId, tenantId)`**
- **Purpose**: Fetch a single menu item with tenant verification
- **Security**: Ensures item belongs to the specified tenant
- **Returns**: `MenuItem`

**`getPublicMenuByTenant(tenantId)`**
- **Purpose**: Fetch public-facing menu (available items only)
- **Returns**: Categories with nested available menu items
- **Use Case**: Customer-facing menu display

#### Write Operations

**`createMenuItem(tenantId, input)`**
- **Purpose**: Create a new menu item
- **Security**: Verifies admin access via `verifyTenantAdmin()`
- **Validation**: Uses Zod schema (`menuItemSchema`)
- **Returns**: Created `MenuItem`

**`updateMenuItem(itemId, tenantId, input)`**
- **Purpose**: Update existing menu item
- **Security**: Verifies tenant ownership in WHERE clause
- **Validation**: Uses Zod schema
- **Returns**: Updated `MenuItem`

**`deleteMenuItem(itemId, tenantId)`**
- **Purpose**: Delete a menu item
- **Security**: Verifies tenant ownership before deletion
- **Cascade**: Related order_items are preserved (soft reference)

**`toggleMenuItemAvailability(itemId, tenantId, isAvailable)`**
- **Purpose**: Toggle item visibility without deletion
- **Use Case**: Temporarily hide items without losing data

### 2.2 Query Patterns

**All queries follow this pattern:**
```typescript
.eq('tenant_id', tenantId)  // Always filter by tenant first
.order('order', { ascending: true })  // Consistent ordering
```

**Example with filters:**
```typescript
let query = supabase
  .from('menu_items')
  .select('*, category:categories(*)')
  .eq('tenant_id', tenantId)  // Tenant isolation

if (params.categoryId) {
  query = query.eq('category_id', params.categoryId)
}

if (params.searchQuery) {
  query = query.or(`name.ilike.%${params.searchQuery}%,description.ilike.%${params.searchQuery}%`)
}

if (params.isAvailable !== undefined) {
  query = query.eq('is_available', params.isAvailable)
}
```

---

## 3. UI Components

### 3.1 Admin Interface

**Location:** `src/app/[tenant]/admin/menu/page.tsx`

**Features:**
- List all menu items for the tenant
- Search and filter by category
- Toggle availability (show/hide)
- Edit and delete items
- View statistics (total items, available items)

**Component Structure:**
```
AdminMenuPage
  └── MenuContent (Server Component)
      └── MenuItemsList (Client Component)
          ├── SearchBar
          ├── CategoryFilter
          └── MenuItemCard (grid)
              ├── Image
              ├── Name/Description
              ├── Price
              ├── Availability Toggle
              └── Edit/Delete Actions
```

**Data Flow:**
1. Server component fetches tenant data
2. `getMenuItemsByTenant(tenantId)` fetches all items
3. Client component handles filtering and interactions
4. Actions refresh via `router.refresh()`

### 3.2 Public Menu Interface

**Location:** `src/app/[tenant]/menu/page.tsx`

**Features:**
- Display available menu items only
- Category-based filtering
- Search functionality
- Item detail modal
- Shopping cart integration

**Data Flow:**
1. Client component loads tenant by slug
2. Fetches categories and menu items via Supabase client
3. Filters items client-side (available only)
4. Groups by category for display

**Query Pattern:**
```typescript
const [{ data: cats }, { data: items }] = await Promise.all([
  supabase.from('categories')
    .select('*')
    .eq('tenant_id', tenantData.id)
    .order('order'),
  supabase.from('menu_items')
    .select('*')
    .eq('tenant_id', tenantData.id)
    .order('order'),
])
```

### 3.3 Dashboard Statistics

**Location:** `src/app/[tenant]/admin/page.tsx`

**Menu Item Metrics:**
- **Total Menu Items**: Count of all items (available + unavailable)
- **Available Items**: Count of `is_available = true` items
- **Categories**: Count of active categories

**Implementation:**
```typescript
const menuItems = await getMenuItemsByTenant(tenantId)
const availableItems = menuItems.filter((item) => item.is_available).length

const stats = [
  {
    title: 'Total Menu Items',
    value: menuItems.length,
    description: `${availableItems} available`,
  },
  // ...
]
```

---

## 4. Data Flow Diagrams

### 4.1 Admin Menu Management Flow

```
Admin User
    ↓
[tenant]/admin/menu
    ↓
getCachedTenantBySlug(slug)
    ↓
getMenuItemsByTenant(tenantId)
    ↓
Supabase Query: .eq('tenant_id', tenantId)
    ↓
RLS Policy Check (admin write access)
    ↓
Return MenuItem[]
    ↓
MenuItemsList Component
    ↓
Display Grid with Actions
```

### 4.2 Public Menu Display Flow

```
Customer
    ↓
[tenant]/menu
    ↓
getTenantBySlugSupabase(slug)
    ↓
Supabase Client Query
    ├── Categories: .eq('tenant_id', tenantId)
    └── Menu Items: .eq('tenant_id', tenantId)
    ↓
RLS Policy Check (public read - available only)
    ↓
Filter: is_available = true
    ↓
Display Menu Grid
```

### 4.3 Create/Update Flow

```
Admin Action
    ↓
Menu Item Form
    ↓
createMenuItem(tenantId, input) / updateMenuItem(id, tenantId, input)
    ↓
verifyTenantAdmin(tenantId)  // Security check
    ↓
menuItemSchema.parse(input)  // Validation
    ↓
Supabase Insert/Update
    ├── .eq('tenant_id', tenantId)  // Always include tenant
    └── RLS Policy Check
    ↓
Return MenuItem
    ↓
router.refresh()  // Update UI
```

---

## 5. Tenant Isolation Mechanisms

### 5.1 Database Level

1. **Foreign Key Constraint**: `tenant_id` references `tenants(id)`
2. **Cascade Delete**: Deleting tenant removes all menu items
3. **Indexes**: Optimized for tenant-based queries
4. **RLS Policies**: Enforce tenant boundaries at query time

### 5.2 Application Level

1. **Service Functions**: All functions require `tenantId` parameter
2. **Query Filtering**: Every query includes `.eq('tenant_id', tenantId)`
3. **Authorization**: `verifyTenantAdmin()` checks user permissions
4. **Type Safety**: TypeScript ensures `tenant_id` is always present

### 5.3 Security Layers

```
Layer 1: RLS Policies (Database)
    ↓
Layer 2: Service Function Verification (Application)
    ↓
Layer 3: UI Route Protection (Middleware)
    ↓
Layer 4: Component-Level Checks (Client)
```

---

## 6. Statistics and Analytics

### 6.1 Available Metrics

**Per Tenant:**
- Total menu items count
- Available items count
- Unavailable items count
- Items per category
- Featured items count
- Items with discounts

**Current Implementation:**
```typescript
// Dashboard statistics
const menuItems = await getMenuItemsByTenant(tenantId)
const availableItems = menuItems.filter(item => item.is_available).length
const featuredItems = menuItems.filter(item => item.is_featured).length
const discountedItems = menuItems.filter(item => item.discounted_price).length
```

### 6.2 Potential Enhancements

**Missing Analytics:**
- Items by category distribution
- Average price per category
- Most popular items (by order count)
- Items never ordered
- Price range analysis
- Availability trends over time

---

## 7. Performance Considerations

### 7.1 Query Optimization

**Current Optimizations:**
- ✅ Tenant index for fast filtering
- ✅ Composite index for ordering
- ✅ Category index for filtering
- ✅ Pagination support (24 items per page)

**Potential Improvements:**
- Consider materialized views for statistics
- Cache menu items per tenant (Redis/Supabase cache)
- Lazy load images
- Virtual scrolling for large menus

### 7.2 Caching Strategy

**Current:**
- `getCachedTenantBySlug()` - Caches tenant data
- `getCachedCategoriesByTenant()` - Caches categories

**Missing:**
- Menu items cache (could be large)
- Public menu cache (TTL-based)

---

## 8. Data Relationships

### 8.1 Entity Relationships

```
Tenant (1)
  └── Menu Items (N)
      └── Category (1) [optional]
      └── Order Items (N) [via orders]
```

### 8.2 Join Patterns

**Admin Queries:**
```sql
SELECT menu_items.*, categories.*
FROM menu_items
LEFT JOIN categories ON menu_items.category_id = categories.id
WHERE menu_items.tenant_id = ?
ORDER BY menu_items.order
```

**Public Queries:**
```sql
SELECT categories.*, menu_items.*
FROM categories
LEFT JOIN menu_items ON categories.id = menu_items.category_id
WHERE categories.tenant_id = ?
  AND categories.is_active = true
  AND menu_items.is_available = true
ORDER BY categories.order, menu_items.order
```

---

## 9. Common Patterns and Best Practices

### 9.1 Tenant ID Verification

**Always verify tenant ownership:**
```typescript
// ✅ Good
const item = await getMenuItemById(itemId, tenantId)
if (item.tenant_id !== tenantId) {
  throw new Error('Unauthorized')
}

// ✅ Better (handled by service)
await updateMenuItem(itemId, tenantId, input)
// Service includes .eq('tenant_id', tenantId) in query
```

### 9.2 Query Consistency

**Always filter by tenant first:**
```typescript
// ✅ Good
.eq('tenant_id', tenantId)
.eq('category_id', categoryId)

// ❌ Bad (missing tenant filter)
.eq('category_id', categoryId)
```

### 9.3 Error Handling

**Tenant-specific errors:**
```typescript
try {
  const items = await getMenuItemsByTenant(tenantId)
} catch (error) {
  // Handle tenant not found, unauthorized, etc.
}
```

---

## 10. Testing Considerations

### 10.1 Unit Tests Needed

- `getMenuItemsByTenant()` - Returns only items for specified tenant
- `createMenuItem()` - Associates item with correct tenant
- `updateMenuItem()` - Cannot update items from other tenants
- `deleteMenuItem()` - Cannot delete items from other tenants
- RLS policies - Public can only see available items

### 10.2 Integration Tests Needed

- Admin can manage their tenant's items
- Admin cannot access other tenant's items
- Public menu shows only available items
- Tenant deletion cascades to menu items

---

## 11. Migration and Data Management

### 11.1 Tenant Migration

**Moving items between tenants:**
- Currently not supported (would require manual SQL)
- Consider adding `moveMenuItemToTenant()` function

### 11.2 Bulk Operations

**Missing Features:**
- Bulk import menu items
- Bulk update availability
- Bulk category assignment
- Export menu items (CSV/JSON)

---

## 12. Recommendations

### 12.1 Immediate Improvements

1. **Add Menu Items Cache**: Cache menu items per tenant with TTL
2. **Enhanced Statistics**: Add category distribution, price analytics
3. **Bulk Operations**: Support bulk import/export
4. **Search Optimization**: Add full-text search index on name/description

### 12.2 Long-term Enhancements

1. **Menu Versioning**: Track changes to menu items over time
2. **Menu Templates**: Allow copying menu items between tenants
3. **Analytics Dashboard**: Visualize menu performance metrics
4. **A/B Testing**: Test different menu item presentations

---

## 13. Code References

### Key Files

- **Database Schema**: `supabase/migrations/0001_initial.sql` (lines 56-83)
- **Service Layer**: `src/lib/admin-service.ts` (lines 251-443)
- **Admin UI**: `src/app/[tenant]/admin/menu/page.tsx`
- **Public UI**: `src/app/[tenant]/menu/page.tsx`
- **Components**: `src/components/admin/menu-items-list.tsx`
- **Types**: `src/types/database.ts` (lines 110-129)

### Key Functions

- `getMenuItemsByTenant()` - Primary read function
- `createMenuItem()` - Create with tenant association
- `updateMenuItem()` - Update with tenant verification
- `deleteMenuItem()` - Delete with tenant verification
- `toggleMenuItemAvailability()` - Quick visibility toggle
- `getPublicMenuByTenant()` - Public-facing menu

---

## Conclusion

The menu items per tenant system is well-architected with:
- ✅ Strong tenant isolation at database level
- ✅ Comprehensive security via RLS policies
- ✅ Efficient querying with proper indexes
- ✅ Clear separation between admin and public interfaces
- ✅ Type-safe service layer

**Areas for improvement:**
- Enhanced analytics and reporting
- Caching strategy for menu items
- Bulk operations support
- Performance optimizations for large menus

The system follows Next.js App Router best practices and maintains strict tenant boundaries throughout the application stack.

