# 🎨 Branding Customization System Analysis

## Overview

This whitelabel application features a **comprehensive branding customization system** that allows each tenant to have their own unique visual identity. The system is built with a multi-layered approach covering everything from database schema to UI components.

---

## 🏗️ Architecture

### 1. Database Layer

#### Tenants Table Schema

The branding system is stored in the `tenants` table with the following color fields:

**Core Branding (Legacy)**
- `logo_url` - Tenant logo image URL
- `primary_color` - Main brand color (default: `#111111`)
- `secondary_color` - Secondary brand color (default: `#666666`)
- `accent_color` - Accent/highlight color (optional)

**Extended Branding Colors** (Added in migration `0004_extended_branding.sql`)
**Card Text Colors** (Added in migration `0014_card_text_colors.sql`)

Layout Colors:
- `background_color` - Main background (default: `#ffffff`)
- `header_color` - Header/navigation background (default: `#ffffff`)
- `header_font_color` - Header text color (default: `#000000`)
- `cards_color` - Card background (default: `#ffffff`)
- `cards_border_color` - Card border (default: `#e5e7eb`)
- `card_title_color` - Menu card title text (default: `#111111`, fallback: `text_primary_color`)
- `card_price_color` - Menu card price text (default: `#111111`, fallback: `primary_color`)
- `card_description_color` - Menu card description text (default: `#6b7280`, fallback: `text_secondary_color`)
- `border_color` - General borders (default: `#e5e7eb`)

Button Colors:
- `button_primary_color` - Primary button background (default: `#111111`)
- `button_primary_text_color` - Primary button text (default: `#ffffff`)
- `button_secondary_color` - Secondary button background (default: `#f3f4f6`)
- `button_secondary_text_color` - Secondary button text (default: `#111111`)

Text Colors:
- `text_primary_color` - Main text (default: `#111111`)
- `text_secondary_color` - Secondary text (default: `#6b7280`)
- `text_muted_color` - Muted/subtle text (default: `#9ca3af`)

State Colors:
- `success_color` - Success states (default: `#10b981`)
- `warning_color` - Warning states (default: `#f59e0b`)
- `error_color` - Error states (default: `#ef4444`)
- `link_color` - Link color (default: `#3b82f6`)
- `shadow_color` - Shadow effects (default: `rgba(0, 0, 0, 0.1)`)

**Hero Section Customization** (Added in migration `0007_add_hero_title_and_description.sql`)
- `hero_title` - Custom hero title for menu page
- `hero_description` - Custom hero description
- `hero_title_color` - Hero title text color
- `hero_description_color` - Hero description text color

### 2. Type Definitions

Located in `/src/types/database.ts`:

```typescript
export interface Tenant {
  id: string;
  name: string;
  slug: string;
  logo_url: string;
  primary_color: string;
  secondary_color: string;
  accent_color?: string;
  // ... 21 extended branding color fields
  hero_title?: string;
  hero_description?: string;
  hero_title_color?: string;
  hero_description_color?: string;
  // ... other fields
}
```

### 3. Branding Utilities

Located in `/src/lib/branding-utils.ts`:

**BrandingColors Interface**
- Standardized interface for all branding colors
- Provides fallback values for optional fields
- Includes legacy color support for backward compatibility

**Key Functions:**

```typescript
// Extract tenant branding with intelligent fallbacks
getTenantBranding(tenant: Tenant | null): BrandingColors

// Generate CSS custom properties for React
generateBrandingCSS(branding: BrandingColors): React.CSSProperties

// Generate CSS class strings
generateBrandingClasses(branding: BrandingColors): string

// Color utility functions
getContrastColor(backgroundColor: string): string
lightenColor(color: string, amount: number): string
darkenColor(color: string, amount: number): string
isValidHexColor(color: string): boolean
hexToRgb(hex: string): { r, g, b } | null
rgbToHex(r, g, b): string
```

**Default Branding:**
The system provides comprehensive defaults when tenant colors are not specified, ensuring the UI always looks professional.

---

## 🎯 User Interfaces

### 1. Superadmin Management

**Location:** `/src/app/superadmin/tenants/[id]/page.tsx`

**Features:**
- Full access to all branding fields
- Comprehensive tenant form with tabbed interface
- Real-time preview of branding changes
- Visual color pickers with hex value display
- Organized into logical sections:
  - Core Colors
  - Layout Colors
  - Button Colors
  - Text Colors
  - State Colors
  - Hero Customization

**Components:**
- `TenantForm` - Main form component
- `TenantFormWrapper` - Optimized wrapper
- `EnhancedTenantForm` - Enhanced version with preview

### 2. Tenant Admin Settings

**Location:** `/src/app/[tenant]/admin/settings/page.tsx`

**Features:**
- Tenant admins can update their own branding
- Restricted to branding fields only (name, slug managed by superadmin)
- Same comprehensive color picker interface
- Server action validation via `updateTenantBrandingForAdminAction`
- Auto-revalidation of menu page after save

**Security:**
- Uses `verifyTenantAdmin()` to ensure user has permission
- RLS policies protect against unauthorized updates
- Separate schema validation for branding-only updates

### 3. Live Branding Editor

**Location:** `/src/components/admin/branding-editor-overlay.tsx`

**Features:**
- **Floating editor widget** (🎨 icon) visible on menu page
- Only visible to superadmins and tenant admins
- Real-time preview of changes without saving
- Quick access to most common branding fields
- Lightweight and non-intrusive

**How it works:**
1. Checks user role client-side
2. Displays floating button in bottom-right corner
3. Opens sliding panel with color pickers
4. Changes preview instantly on the page
5. "Save" button commits changes to database
6. "Close" button reverts to saved values

---

## 🎨 Application in UI

### Menu Page (`/src/app/[tenant]/menu/page.tsx`)

The menu page is the primary showcase for tenant branding:

**Dynamic Styling:**
```typescript
const branding = getTenantBranding(tenant)

// Background
style={{ backgroundColor: branding.background }}

// Header
style={{
  backgroundColor: branding.header,
  color: branding.headerFont,
  borderColor: branding.border
}}

// Buttons
style={{
  backgroundColor: branding.buttonPrimary,
  color: branding.buttonPrimaryText
}}

// Text
style={{ color: branding.textPrimary }}

// Hero Section
style={{ color: tenant?.hero_title_color || branding.textPrimary }}
```

**Branding Override System:**
The menu page supports live preview via state management:
```typescript
const [brandingOverride, setBrandingOverride] = useState(null)
const branding = useMemo(() => {
  if (!brandingOverride) return baseBranding
  return { ...baseBranding, ...brandingOverride }
}, [baseBranding, brandingOverride])
```

### Item Detail Modal (`/src/components/customer/item-detail-modal.tsx`)

Applies branding to:
- Variation selection borders
- Add-on checkboxes
- Action buttons
- Price displays
- Text colors

### Navbar (`/src/components/shared/navbar.tsx`)

- Displays tenant logo
- Uses CSS custom properties for primary color
- Cart badge inherits brand colors

---

## 📊 Data Flow

### Creating/Updating Tenant

**1. Superadmin Creates Tenant**
```
User Input (Form)
  ↓
tenantSchema validation (Zod)
  ↓
createTenantAction (Server Action)
  ↓
Supabase Insert with all branding fields
  ↓
RLS Policy Check (superadmin only)
  ↓
Database Insert
  ↓
Revalidate paths
  ↓
Redirect to tenant menu
```

**2. Admin Updates Branding**
```
Admin Settings Page
  ↓
Color Picker Changes
  ↓
updateTenantBrandingForAdminAction
  ↓
verifyTenantAdmin (auth check)
  ↓
brandingUpdateSchema validation
  ↓
Supabase Update (branding fields only)
  ↓
Revalidate settings & menu pages
  ↓
Success/Error Response
```

**3. Live Preview (Branding Editor)**
```
Editor Opens (checks role)
  ↓
User adjusts colors
  ↓
State update triggers preview
  ↓
onPreview callback to parent
  ↓
Menu page re-renders with new colors
  ↓
User clicks Save
  ↓
Direct Supabase update
  ↓
Editor closes
```

---

## 🔐 Security & Permissions

### Row Level Security (RLS)

**Tenant Table Policies:**

1. **Public Read** - Active tenants visible to all
   ```sql
   tenants_read_active: SELECT WHERE is_active = true
   ```

2. **Superadmin Write** - Only superadmin can create/update tenants
   ```sql
   tenants_write_superadmin: ALL 
   WHERE user is superadmin
   ```

3. **Admin Branding Update** - Tenant admins can update branding
   - Enforced via `verifyTenantAdmin()` function
   - Separate schema restricts fields to branding only
   - Cannot modify tenant name, slug, status, etc.

### Authentication Flow

```typescript
// Server-side verification
async function verifyTenantAdmin(tenantId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) throw new Error('Unauthorized')
  
  const { data: appUser } = await supabase
    .from('app_users')
    .select('role, tenant_id')
    .eq('user_id', user.id)
    .single()
  
  const isSuperadmin = appUser?.role === 'superadmin'
  const isOwnTenantAdmin = appUser?.role === 'admin' && 
                           appUser?.tenant_id === tenantId
  
  if (!isSuperadmin && !isOwnTenantAdmin) {
    throw new Error('Unauthorized')
  }
}
```

---

## 🎯 Key Features & Benefits

### 1. Comprehensive Customization
- **24+ color fields** cover every UI element
- Separate colors for different states (success, error, warning)
- Hero section text customization
- Logo upload support

### 2. Intelligent Fallbacks
- Default values ensure UI never breaks
- Primary color cascades to button colors if not specified
- Backward compatible with legacy 3-color system

### 3. Real-Time Preview
- Live branding editor with instant feedback
- No page refresh needed
- Safe preview (can cancel without saving)

### 4. Developer-Friendly
- Type-safe interfaces throughout
- Zod validation for all inputs
- Utility functions for color manipulation
- CSS custom properties support

### 5. Multi-Role Management
- Superadmin: Full control over all tenants
- Tenant Admin: Can customize their own branding
- Clear permission boundaries

### 6. Performance Optimized
- Colors stored as simple text fields
- No complex queries needed
- Efficient state management
- Memoized branding calculations

---

## 🔄 Backward Compatibility

The system maintains compatibility with the original 3-color system:

**Original Fields (Still Supported):**
- `primary_color`
- `secondary_color`  
- `accent_color`

**Fallback Chain:**
```typescript
buttonPrimary: tenant.button_primary_color || 
               tenant.primary_color || 
               DEFAULT_BRANDING.buttonPrimary
```

This means:
- Old tenants still work perfectly
- New fields enhance but don't replace
- Gradual migration path available

---

## 📝 Validation & Schema

### Tenant Schema (Zod)

Located in `/src/lib/tenants-service.ts`:

```typescript
export const tenantSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9\-]+$/),
  logo_url: z.string().url().optional().or(z.literal('')),
  primary_color: z.string().min(1),
  secondary_color: z.string().min(1),
  // All extended colors are optional
  background_color: z.string().optional().or(z.literal('')),
  // ... 20 more optional color fields
})
```

### Branding Update Schema

More restrictive schema for tenant admin updates:

```typescript
const brandingUpdateSchema = z.object({
  primary_color: z.string().min(1),
  secondary_color: z.string().min(1),
  // All branding colors allowed
  // Name, slug, etc. NOT allowed
})
```

---

## 🛠️ Implementation Examples

### Adding a New Branding Color

**Step 1: Update Database Migration**
```sql
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS my_new_color text DEFAULT '#hexvalue';
```

**Step 2: Update Type Definition**
```typescript
// src/types/database.ts
export interface Tenant {
  // ... existing fields
  my_new_color?: string;
}
```

**Step 3: Update Branding Interface**
```typescript
// src/lib/branding-utils.ts
export interface BrandingColors {
  // ... existing fields
  myNew: string;
}
```

**Step 4: Add to getTenantBranding()**
```typescript
export function getTenantBranding(tenant: Tenant | null): BrandingColors {
  return {
    // ... existing mappings
    myNew: tenant.my_new_color || DEFAULT_BRANDING.myNew,
  }
}
```

**Step 5: Update Forms**
Add color picker to tenant forms and branding editor.

**Step 6: Apply in UI**
```typescript
style={{ color: branding.myNew }}
```

### Using Branding in a Component

```typescript
import { getTenantBranding } from '@/lib/branding-utils'

function MyComponent({ tenant }: { tenant: Tenant }) {
  const branding = getTenantBranding(tenant)
  
  return (
    <div 
      style={{
        backgroundColor: branding.background,
        color: branding.textPrimary
      }}
    >
      <button
        style={{
          backgroundColor: branding.buttonPrimary,
          color: branding.buttonPrimaryText
        }}
      >
        Click Me
      </button>
    </div>
  )
}
```

---

## 🚀 Future Enhancements

### Potential Additions

1. **Font Customization**
   - Custom font family selection
   - Font weight variants
   - Line height customization

2. **Advanced Layout Options**
   - Border radius customization
   - Spacing scale customization
   - Container width options

3. **Dark Mode Support**
   - Separate dark mode color scheme
   - Auto-detection of system preference
   - Toggle in menu

4. **Preset Themes**
   - Pre-built color combinations
   - One-click theme application
   - Theme gallery

5. **Brand Asset Management**
   - Favicon upload
   - Multiple logo variants (light/dark)
   - Social media preview images

6. **Export/Import**
   - Export branding as JSON
   - Import from another tenant
   - Branding templates

7. **Advanced Color Tools**
   - Color palette generator
   - Contrast ratio checker
   - Accessibility validator

8. **Custom CSS**
   - Allow advanced users to add custom CSS
   - Scoped to their tenant
   - Syntax validation

---

## 📌 Best Practices

### For Developers

1. **Always use `getTenantBranding()`** - Don't access tenant colors directly
2. **Provide fallbacks** - UI should work even without tenant data
3. **Use semantic names** - `branding.buttonPrimary` not `tenant.button_primary_color`
4. **Test with defaults** - Ensure UI looks good with default colors
5. **Consider contrast** - Use `getContrastColor()` for dynamic text colors

### For Administrators

1. **Test on real content** - Preview branding with actual menu items
2. **Check contrast ratios** - Ensure text is readable
3. **Mobile testing** - Colors may appear different on mobile screens
4. **Brand consistency** - Use your actual brand colors
5. **Save frequently** - Use live editor to iterate quickly

---

## 🐛 Troubleshooting

### Issue: Colors not updating on menu page

**Solution:**
1. Check browser cache - Hard refresh (Cmd+Shift+R)
2. Verify database update succeeded
3. Check revalidatePath calls in actions
4. Ensure tenant slug is correct

### Issue: Branding editor not visible

**Solution:**
1. Verify user is logged in
2. Check user has admin or superadmin role
3. Confirm tenant_id matches for admin users
4. Check browser console for errors

### Issue: Invalid color values

**Solution:**
1. Use hex format: `#RRGGBB` or `#RGB`
2. For rgba, use full syntax: `rgba(255, 0, 0, 0.5)`
3. Validate with `isValidHexColor()`

---

## 📚 Related Files Reference

### Database
- `/supabase/migrations/0001_initial.sql` - Initial schema
- `/supabase/migrations/0004_extended_branding.sql` - Extended colors
- `/supabase/migrations/0007_add_hero_title_and_description.sql` - Hero customization
- `/supabase/migrations/0008_tenants_admin_update_policy.sql` - Admin permissions

### Types
- `/src/types/database.ts` - Tenant interface and all types

### Services
- `/src/lib/branding-utils.ts` - Branding utilities
- `/src/lib/tenants-service.ts` - Tenant CRUD operations
- `/src/lib/admin-service.ts` - Admin verification

### Actions
- `/src/actions/tenants.ts` - Server actions for tenant updates

### UI Components
- `/src/app/[tenant]/menu/page.tsx` - Main menu page (primary branding showcase)
- `/src/app/[tenant]/admin/settings/page.tsx` - Admin branding editor
- `/src/app/superadmin/tenants/[id]/page.tsx` - Superadmin tenant management
- `/src/components/admin/branding-editor-overlay.tsx` - Live editor
- `/src/components/superadmin/tenant-form.tsx` - Tenant creation form
- `/src/components/customer/item-detail-modal.tsx` - Branded modals
- `/src/components/shared/navbar.tsx` - Branded navigation

---

## 🎉 Summary

The branding customization system in this whitelabel application is:

✅ **Comprehensive** - 21+ color fields covering all UI elements  
✅ **Flexible** - Works with defaults, partial, or complete customization  
✅ **Secure** - RLS policies and role-based access control  
✅ **User-Friendly** - Visual editors, live preview, intuitive interfaces  
✅ **Developer-Friendly** - Type-safe, validated, well-documented  
✅ **Performance-Optimized** - Simple storage, efficient queries  
✅ **Future-Proof** - Extensible architecture, backward compatible  

This system enables true white-label functionality where each tenant can have a completely unique visual identity while maintaining a consistent, high-quality user experience.

## Recent Updates

### Card Text Colors (November 7, 2025)
Added three new fields for granular menu card customization:
- `card_title_color` - Customize menu item titles on cards
- `card_price_color` - Customize prices displayed on cards  
- `card_description_color` - Customize descriptions on cards

These fields provide intelligent fallbacks to maintain backward compatibility:
- card_title_color → text_primary_color → DEFAULT
- card_price_color → primary_color → DEFAULT
- card_description_color → text_secondary_color → DEFAULT

**Migration:** `0014_card_text_colors.sql`

---

**Last Updated:** November 7, 2025  
**Version:** 1.1  
**Author:** System Analysis

