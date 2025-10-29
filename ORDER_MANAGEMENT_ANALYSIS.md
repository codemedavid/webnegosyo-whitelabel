# Order Management Analysis

## Executive Summary

This document provides a comprehensive analysis of the order management system in both the tenant admin interface and the superadmin tenant management system.

---

## 1. Tenant Admin Order Management

### 1.1 Architecture Overview

The tenant admin order management follows a clean, layered architecture:

**Components:**
- `src/app/[tenant]/admin/orders/page.tsx` - Server component page
- `src/components/admin/orders-list.tsx` - Client component for displaying orders
- `src/lib/orders-service.ts` - Service layer for order operations
- `src/app/actions/orders.ts` - Server actions for mutations

### 1.2 Order Display Features

#### Dashboard Integration
The admin dashboard (`src/app/[tenant]/admin/page.tsx`) displays:
- **Today's Orders**: Total count with pending orders breakdown
- **Today's Revenue**: Real-time revenue calculation
- **Order Status Overview**: Quick view of pending, confirmed, preparing, and ready orders

```24:68:src/app/[tenant]/admin/page.tsx
  const [menuItems, categories, orderStats] = await Promise.all([
    getMenuItemsByTenant(tenant.id),
    getCategoriesByTenant(tenant.id),
    getOrderStats(tenant.id).catch(() => ({ 
      todayOrders: 0, 
      todayRevenue: 0, 
      pendingOrders: 0,
      confirmedOrders: 0,
      preparingOrders: 0,
      readyOrders: 0,
    })),
  ])

  const availableItems = menuItems.filter((item) => item.is_available).length

  const stats = [
    {
      title: 'Total Menu Items',
      value: menuItems.length,
      description: `${availableItems} available`,
      icon: UtensilsCrossed,
      color: 'text-blue-600',
    },
    {
      title: 'Categories',
      value: categories.length,
      description: 'Active categories',
      icon: FolderTree,
      color: 'text-green-600',
    },
    {
      title: 'Today\'s Orders',
      value: orderStats.todayOrders,
      description: `${orderStats.pendingOrders} pending`,
      icon: ShoppingBag,
      color: 'text-purple-600',
    },
    {
      title: 'Today\'s Revenue',
      value: `$${orderStats.todayRevenue.toFixed(2)}`,
      description: 'Total sales today',
      icon: DollarSign,
      color: 'text-red-600',
    },
  ]
```

#### Orders List Features
The orders page provides comprehensive order management:

**Key Features:**
1. **Status Filtering**: Filter orders by status (all, pending, confirmed, preparing, ready, delivered, cancelled)
2. **Order Cards**: Display key order information in card format
3. **Order Details Modal**: Click to view full order details
4. **Status Updates**: Update order status directly from the details modal

```95:112:src/components/admin/orders-list.tsx
  return (
    <>
      <div className="flex gap-4 mb-6">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Orders</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="preparing">Preparing</SelectItem>
            <SelectItem value="ready">Ready</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>
```

### 1.3 Order Status Workflow

**Status Flow:**
```
pending → confirmed → preparing → ready → delivered
   ↓
cancelled
```

**Status Icons:**
- ⏰ Pending (Clock)
- ✓ Confirmed (CheckCircle)
- 🛍️ Preparing (ShoppingBag)
- ✓ Ready (CheckCircle)
- ✓ Delivered (CheckCircle)
- ✗ Cancelled (XCircle)

### 1.4 Order Details Display

The order details modal shows:
1. **Customer Information**
   - Customer name
   - Contact information
   - Order type (dine-in, pickup, delivery)
   - Additional customer data (stored in JSON format)

2. **Order Items**
   - Menu item name
   - Size/variation
   - Add-ons list
   - Special instructions
   - Quantity
   - Subtotal

3. **Financial Summary**
   - Total order amount

4. **Status Management**
   - Dropdown to update order status
   - Loading state during updates

```179:268:src/components/admin/orders-list.tsx
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Order Details</DialogTitle>
            <DialogDescription>
              Order #{selectedOrder?.id.slice(0, 8)} • {selectedOrder && formatDistance(new Date(selectedOrder.created_at), new Date(), { addSuffix: true })}
            </DialogDescription>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold mb-2">Customer Information</h3>
                <div className="space-y-1 text-sm">
                  {selectedOrder.customer_name && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Name:</span>
                      <span>{selectedOrder.customer_name}</span>
                    </div>
                  )}
                  {selectedOrder.customer_contact && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Contact:</span>
                      <span>{selectedOrder.customer_contact}</span>
                    </div>
                  )}
                  {selectedOrder.order_type && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Order Type:</span>
                      <span>{selectedOrder.order_type}</span>
                    </div>
                  )}
                  {selectedOrder.customer_data && Object.keys(selectedOrder.customer_data).length > 0 && (
                    <div className="mt-3">
                      <h4 className="font-medium mb-2">Additional Information:</h4>
                      {Object.entries(selectedOrder.customer_data).map(([key, value]) => (
                        <div key={key} className="flex justify-between">
                          <span className="text-muted-foreground capitalize">{key.replace('_', ' ')}:</span>
                          <span>{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Order Items</h3>
                <div className="space-y-2">
                  {selectedOrder.order_items.map((item, index) => (
                    <div key={index} className="flex justify-between items-start p-3 bg-muted rounded-lg">
                      <div className="flex-1">
                        <p className="font-medium">{item.menu_item_name}</p>
                        {item.variation && (
                          <p className="text-sm text-muted-foreground">Size: {item.variation}</p>
                        )}
                        {item.addons.length > 0 && (
                          <p className="text-sm text-muted-foreground">
                            Add-ons: {item.addons.join(', ')}
                          </p>
                        )}
                        {item.special_instructions && (
                          <p className="text-sm text-muted-foreground italic">
                            Note: {item.special_instructions}
                          </p>
                        )}
                        <p className="text-sm text-muted-foreground">Qty: {item.quantity}</p>
                      </div>
                      <p className="font-semibold">{formatPrice(Number(item.subtotal))}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-between items-center pt-4 border-t">
                <span className="text-lg font-semibold">Total</span>
                <span className="text-2xl font-bold">{formatPrice(Number(selectedOrder.total))}</span>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Update Status</h3>
                <Select
                  value={selectedOrder.status}
                  onValueChange={(value) => handleStatusUpdate(selectedOrder.id, value)}
                  disabled={updatingStatus === selectedOrder.id}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                    <SelectItem value="preparing">Preparing</SelectItem>
                    <SelectItem value="ready">Ready</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
```

### 1.5 Data Flow

**Order Fetching:**
1. Server component fetches orders via `getOrdersByTenant()`
2. Service layer verifies admin access
3. Supabase query with proper joins to get order items
4. Data passed to client component

```7:44:src/app/[tenant]/admin/orders/page.tsx
export default async function OrdersPage({
  params,
}: {
  params: Promise<{ tenant: string }>
}) {
  const { tenant: tenantSlug } = await params
  
  const tenantData = await getTenantBySlug(tenantSlug)

  if (!tenantData) {
    return <div>Tenant not found</div>
  }

  const tenant: Tenant = tenantData

  const orders = await getOrdersByTenant(tenant.id).catch(() => [])

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: `/${tenantSlug}/admin` },
          { label: 'Orders' },
        ]}
      />

      <div>
        <h1 className="text-3xl font-bold">Orders</h1>
        <p className="text-muted-foreground">Manage customer orders</p>
      </div>

      <OrdersList
        orders={orders}
        tenantSlug={tenantSlug}
        tenantId={tenant.id}
      />
    </div>
  )
}
```

**Status Updates:**
1. User selects new status in dropdown
2. `updateOrderStatusAction` is called
3. Service layer updates database
4. Revalidation of relevant paths
5. UI updates with toast notification

```30:44:src/app/actions/orders.ts
export async function updateOrderStatusAction(
  orderId: string,
  tenantId: string,
  tenantSlug: string,
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled'
) {
  try {
    const order = await updateOrderStatus(orderId, tenantId, status)
    revalidatePath(`/${tenantSlug}/admin/orders`)
    revalidatePath(`/${tenantSlug}/admin`)
    return { success: true, data: order }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update order status' }
  }
}
```

### 1.6 Security & Authorization

**Access Control:**
- All order operations require tenant admin verification
- `verifyTenantAdmin()` ensures user has access to the tenant
- Supports both `admin` and `superadmin` roles

```26:42:src/lib/orders-service.ts
export async function getOrdersByTenant(tenantId: string) {
  await verifyTenantAdmin(tenantId)
  
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      order_items(*)
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data as OrderWithItems[]
}
```

**Database Policies:**
```169:189:supabase/migrations/0001_initial.sql
create policy orders_select_by_tenant on public.orders
  for select using (
    -- superadmin can read all; admin only their tenant
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid() and (
        au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = tenant_id)
      )
    )
  );

create policy order_items_select_by_order on public.order_items
  for select using (
    exists (
      select 1 from public.orders o
      join public.app_users au on au.user_id = auth.uid()
      where o.id = order_id and (
        au.role = 'superadmin' or (au.role = 'admin' and au.tenant_id = o.tenant_id)
      )
    )
  );
```

### 1.7 Order Statistics Service

```88:118:src/lib/orders-service.ts
export async function getOrderStats(tenantId: string) {
  await verifyTenantAdmin(tenantId)
  
  const supabase = await createClient()
  
  // Get today's orders
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  const { data: orders, error } = await supabase
    .from('orders')
    .select('status, total, created_at')
    .eq('tenant_id', tenantId)
    .gte('created_at', today.toISOString())

  if (error) throw error

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ordersData = orders as any[] || []

  const stats = {
    todayOrders: ordersData.length || 0,
    todayRevenue: ordersData.reduce((sum, order) => sum + Number(order.total), 0) || 0,
    pendingOrders: ordersData.filter(o => o.status === 'pending').length || 0,
    confirmedOrders: ordersData.filter(o => o.status === 'confirmed').length || 0,
    preparingOrders: ordersData.filter(o => o.status === 'preparing').length || 0,
    readyOrders: ordersData.filter(o => o.status === 'ready').length || 0,
  }

  return stats
}
```

---

## 2. Superadmin Tenant Management

### 2.1 Overview

The superadmin tenant management focuses on CRUD operations for tenants, NOT direct order management. However, superadmins have the ability to view orders across ALL tenants due to database RLS policies.

### 2.2 Tenant Management Features

#### Tenant List Page
```14:34:src/app/superadmin/tenants/page.tsx
async function TenantList() {
  const tenants = await getTenants()

  if (tenants.length === 0) {
    return (
      <EmptyState
        icon={Plus}
        title="No tenants found"
        description="Get started by adding your first restaurant tenant"
        actionLabel="Add Tenant"
        onAction={() => {}}
      />
    )
  }

  return (
    <>
      <TenantSearch initialTenants={tenants} />
    </>
  )
}
```

#### Tenant Form (Create/Edit)
The tenant form includes:
1. **Basic Information**
   - Restaurant name
   - URL slug
   - Custom domain
   - Logo upload
   - Active status

2. **Branding Colors**
   - Primary, secondary, accent colors
   - Extended branding (17 additional color fields)

3. **Messenger Integration**
   - Facebook Page ID
   - Messenger username

4. **Mapbox Settings**
   - Enable/disable address autocomplete

```453:594:src/components/superadmin/tenant-form-wrapper.tsx
export function TenantFormWrapper({ tenant }: TenantFormWrapperProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  
  const [formData, setFormData] = useState({
    name: tenant?.name || '',
    slug: tenant?.slug || '',
    domain: tenant?.domain || '',
    logo_url: tenant?.logo_url || '',
    primary_color: tenant?.primary_color || '#c41e3a',
    secondary_color: tenant?.secondary_color || '#009246',
    accent_color: tenant?.accent_color || '#ffd700',
    // Extended branding colors
    background_color: tenant?.background_color || '#ffffff',
    header_color: tenant?.header_color || '#ffffff',
    header_font_color: tenant?.header_font_color || '#000000',
    cards_color: tenant?.cards_color || '#ffffff',
    cards_border_color: tenant?.cards_border_color || '#e5e7eb',
    button_primary_color: tenant?.button_primary_color || tenant?.primary_color || '#c41e3a',
    button_primary_text_color: tenant?.button_primary_text_color || '#ffffff',
    button_secondary_color: tenant?.button_secondary_color || '#f3f4f6',
    button_secondary_text_color: tenant?.button_secondary_text_color || '#111111',
    text_primary_color: tenant?.text_primary_color || '#111111',
    text_secondary_color: tenant?.text_secondary_color || '#6b7280',
    text_muted_color: tenant?.text_muted_color || '#9ca3af',
    border_color: tenant?.border_color || '#e5e7eb',
    success_color: tenant?.success_color || '#10b981',
    warning_color: tenant?.warning_color || '#f59e0b',
    error_color: tenant?.error_color || '#ef4444',
    link_color: tenant?.link_color || '#3b82f6',
    shadow_color: tenant?.shadow_color || 'rgba(0, 0, 0, 0.1)',
    messenger_page_id: tenant?.messenger_page_id || '',
    messenger_username: tenant?.messenger_username || '',
    is_active: tenant?.is_active ?? true,
    mapbox_enabled: tenant?.mapbox_enabled ?? true,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const input = {
      name: formData.name,
      slug: formData.slug,
      domain: formData.domain || undefined,
      logo_url: formData.logo_url || undefined,
      primary_color: formData.primary_color,
      secondary_color: formData.secondary_color,
      accent_color: formData.accent_color || undefined,
      // Extended branding colors
      background_color: formData.background_color || undefined,
      header_color: formData.header_color || undefined,
      header_font_color: formData.header_font_color || undefined,
      cards_color: formData.cards_color || undefined,
      cards_border_color: formData.cards_border_color || undefined,
      button_primary_color: formData.button_primary_color || undefined,
      button_primary_text_color: formData.button_primary_text_color || undefined,
      button_secondary_color: formData.button_secondary_color || undefined,
      button_secondary_text_color: formData.button_secondary_text_color || undefined,
      text_primary_color: formData.text_primary_color || undefined,
      text_secondary_color: formData.text_secondary_color || undefined,
      text_muted_color: formData.text_muted_color || undefined,
      border_color: formData.border_color || undefined,
      success_color: formData.success_color || undefined,
      warning_color: formData.warning_color || undefined,
      error_color: formData.error_color || undefined,
      link_color: formData.link_color || undefined,
      shadow_color: formData.shadow_color || undefined,
      messenger_page_id: formData.messenger_page_id,
      messenger_username: formData.messenger_username || undefined,
      is_active: formData.is_active,
      mapbox_enabled: formData.mapbox_enabled,
    }

    startTransition(async () => {
      try {
        if (tenant) {
          const result = await updateTenantAction(tenant.id, input)
          if (result?.error) {
            toast.error(result.error)
            return
          }
          toast.success('Tenant updated!')
          router.push('/superadmin/tenants')
        } else {
          // createTenantAction redirects on success
          await createTenantAction(input)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to save tenant'
        toast.error(message)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <BasicInfoSection 
        formData={formData} 
        setFormData={setFormData} 
        isPending={isPending} 
      />
      
      <BrandingSection 
        formData={formData} 
        setFormData={setFormData} 
        isPending={isPending} 
      />
      
      <ExtendedBrandingSection 
        formData={formData} 
        setFormData={setFormData} 
        isPending={isPending} 
      />
      
      <MessengerSection 
        formData={formData} 
        setFormData={setFormData} 
        isPending={isPending} 
      />

      <MapboxSection 
        formData={formData} 
        setFormData={setFormData} 
        isPending={isPending} 
      />

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/superadmin/tenants')}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving...' : tenant ? 'Update Tenant' : 'Create Tenant'}
        </Button>
      </div>
    </form>
  )
}
```

### 2.3 Cross-Tenant Order Access

While superadmins don't have a dedicated order management UI in the superadmin interface, they CAN access orders from any tenant through the tenant admin interface by virtue of the RLS policies.

**Key Point:** Superadmins can view and manage orders for any tenant through the regular tenant admin URLs (e.g., `/{tenantSlug}/admin/orders`).

---

## 3. Key Findings & Recommendations

### 3.1 Strengths

✅ **Well-Architected**
- Clear separation of concerns (components, services, actions)
- Proper use of Server Components and Client Components
- Server Actions for mutations with proper error handling

✅ **Security**
- Comprehensive RLS policies
- Tenant isolation enforced at the database level
- Admin verification on all operations

✅ **User Experience**
- Intuitive order status workflow
- Rich order details display
- Real-time statistics on dashboard
- Toast notifications for actions

✅ **Performance**
- Parallel data fetching with `Promise.all`
- Proper caching and revalidation
- Optimistic updates where appropriate

### 3.2 Areas for Improvement

⚠️ **Missing Superadmin Order Management**
- **Issue:** Superadmins cannot view orders across all tenants from a centralized interface
- **Recommendation:** Add a "Superadmin Orders" page that shows all orders across tenants with tenant filtering

⚠️ **Order Search & Filtering**
- **Issue:** Limited filtering options (only by status)
- **Recommendations:**
  - Add date range filtering
  - Add customer name/contact search
  - Add order amount range filter
  - Add order type filter

⚠️ **Order Export**
- **Issue:** No ability to export orders to CSV/Excel
- **Recommendation:** Add export functionality for reporting and accounting

⚠️ **Order History & Audit Trail**
- **Issue:** No visibility into who changed status and when
- **Recommendation:** Add an audit log for order status changes

⚠️ **Real-time Updates**
- **Issue:** Orders don't update in real-time (requires manual refresh)
- **Recommendation:** Consider adding WebSocket or Server-Sent Events for real-time order updates

⚠️ **Order Statistics Enhancement**
- **Issue:** Statistics are limited to "today"
- **Recommendations:**
  - Add weekly/monthly statistics
  - Add revenue trends/charts
  - Add average order value
  - Add most popular items

⚠️ **Print Receipt**
- **Issue:** No print functionality for orders
- **Recommendation:** Add a printable receipt view for kitchen operations

### 3.3 Technical Recommendations

🔧 **Database Indexing**
```sql
-- Consider adding indexes for common queries
CREATE INDEX IF NOT EXISTS idx_orders_tenant_status 
  ON orders(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_orders_created_at 
  ON orders(created_at DESC);
```

🔧 **Pagination**
- Current implementation loads all orders at once
- Consider implementing pagination for tenants with large order volumes

🔧 **Order Archival**
- Implement an archival strategy for old orders
- Move old orders to a separate table to maintain performance

---

## 4. Database Schema Summary

### Orders Table
```sql
- id: uuid (PK)
- tenant_id: uuid (FK)
- order_type_id: uuid (FK)
- order_type: text
- customer_name: text
- customer_contact: text
- customer_data: jsonb
- total: numeric(10,2)
- status: enum (pending, confirmed, preparing, ready, delivered, cancelled)
- created_at: timestamptz
- updated_at: timestamptz
```

### Order Items Table
```sql
- id: uuid (PK)
- order_id: uuid (FK)
- menu_item_id: uuid (FK)
- menu_item_name: text
- variation: text
- addons: text[]
- quantity: integer
- price: numeric(10,2)
- subtotal: numeric(10,2)
- special_instructions: text
```

---

## 5. Conclusion

The order management system is well-implemented with good separation of concerns, security, and user experience. The tenant admin interface provides comprehensive order management capabilities. However, adding a centralized order management interface for superadmins and enhancing filtering/export capabilities would significantly improve the system's utility for operational oversight.
