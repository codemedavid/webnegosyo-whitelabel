# 🎨 Branding Customization - Quick Reference

> **Quick reference for developers and administrators working with tenant branding**

---

## 📋 All Branding Fields (24 Colors + Logo + Hero)

### Core (Required)
- `logo_url` - Tenant logo image
- `primary_color` - Main brand color (#111111)
- `secondary_color` - Secondary color (#666666)

### Layout (Optional)
- `accent_color` - Accent highlights
- `background_color` - Page background (#ffffff)
- `header_color` - Header bar (#ffffff)
- `header_font_color` - Header text (#000000)
- `cards_color` - Card background (#ffffff)
- `cards_border_color` - Card borders (#e5e7eb)
- `card_title_color` - Card title text (#111111)
- `card_price_color` - Card price text (#111111)
- `card_description_color` - Card description text (#6b7280)
- `border_color` - General borders (#e5e7eb)

### Buttons (Optional)
- `button_primary_color` - Primary button BG (#111111)
- `button_primary_text_color` - Primary button text (#ffffff)
- `button_secondary_color` - Secondary button BG (#f3f4f6)
- `button_secondary_text_color` - Secondary button text (#111111)

### Text (Optional)
- `text_primary_color` - Main text (#111111)
- `text_secondary_color` - Secondary text (#6b7280)
- `text_muted_color` - Muted text (#9ca3af)

### States (Optional)
- `success_color` - Success messages (#10b981)
- `warning_color` - Warnings (#f59e0b)
- `error_color` - Errors (#ef4444)
- `link_color` - Links (#3b82f6)
- `shadow_color` - Shadows (rgba(0,0,0,0.1))

### Hero Section (Optional)
- `hero_title` - Custom hero title text
- `hero_description` - Custom hero description text
- `hero_title_color` - Title color
- `hero_description_color` - Description color

---

## 🚀 Common Tasks

### Get Tenant Branding

```typescript
import { getTenantBranding } from '@/lib/branding-utils'

const branding = getTenantBranding(tenant)
// Returns BrandingColors object with all fields populated (fallbacks applied)
```

### Apply Branding in Component

```tsx
// Inline styles (recommended for dynamic colors)
<div style={{ 
  backgroundColor: branding.background,
  color: branding.textPrimary 
}}>
  <button style={{
    backgroundColor: branding.buttonPrimary,
    color: branding.buttonPrimaryText
  }}>
    Click Me
  </button>
</div>
```

### Use CSS Custom Properties

```typescript
import { generateBrandingCSS } from '@/lib/branding-utils'

<div style={generateBrandingCSS(branding)}>
  {/* Can use var(--brand-primary), var(--brand-background), etc. */}
</div>
```

### Update Tenant Branding (Server Action)

```typescript
// From admin settings
import { updateTenantBrandingForAdminAction } from '@/actions/tenants'

await updateTenantBrandingForAdminAction(tenantId, {
  primary_color: '#c41e3a',
  secondary_color: '#009246',
  // ... other color fields
})
```

---

## 🎯 Where to Edit Branding

### Superadmin (Full Access)
**Path:** `/superadmin/tenants/[id]`
- Create new tenants
- Edit all tenant fields
- Full branding control
- Preview changes

### Tenant Admin (Branding Only)
**Path:** `/[tenant]/admin/settings`
- Edit colors only
- Cannot change name, slug, status
- Limited to own tenant
- Saves via server action

### Live Editor (Quick Changes)
**Location:** Floating button on menu page (🎨)
- Real-time preview
- Most common colors
- Hero customization
- Only visible to admins

---

## 💡 Color Best Practices

### Contrast Ratios (WCAG)
```
Text on Background:
- Normal text: 4.5:1 minimum
- Large text (18pt+): 3:1 minimum
- Use getContrastColor() to auto-calculate
```

### Recommended Combinations
```typescript
// Light Theme (most common)
{
  background_color: '#ffffff',
  text_primary_color: '#111111',
  button_primary_color: '#your-brand-color',
  button_primary_text_color: '#ffffff',
}

// Dark Header with Light Content
{
  header_color: '#1a1a1a',
  header_font_color: '#ffffff',
  background_color: '#ffffff',
  text_primary_color: '#111111',
}
```

### Color Palette Harmony
```
Option 1: Monochromatic
- Primary: #c41e3a
- Secondary: #8a1529 (darker)
- Accent: #e05670 (lighter)

Option 2: Complementary
- Primary: #c41e3a (red)
- Secondary: #1ec467 (green)
- Accent: #ffffff (neutral)

Option 3: Analogous
- Primary: #c41e3a (red)
- Secondary: #c4481e (orange-red)
- Accent: #c41e98 (pink-red)
```

---

## 🔧 Utility Functions

### Color Manipulation

```typescript
import { 
  getContrastColor,
  lightenColor,
  darkenColor,
  isValidHexColor,
  hexToRgb,
  rgbToHex 
} from '@/lib/branding-utils'

// Auto-determine text color
const textColor = getContrastColor('#c41e3a') // Returns '#ffffff'

// Create lighter shade for hover
const hoverColor = lightenColor('#c41e3a', 0.1) // 10% lighter

// Create darker shade
const activeColor = darkenColor('#c41e3a', 0.1) // 10% darker

// Validate color
if (isValidHexColor('#c41e3a')) { /* valid */ }

// Convert formats
const rgb = hexToRgb('#c41e3a') // { r: 196, g: 30, b: 58 }
const hex = rgbToHex(196, 30, 58) // '#c41e3a'
```

---

## 🗂️ File Locations

### Database
```
📁 supabase/migrations/
  ├─ 0001_initial.sql             (Initial schema)
  ├─ 0004_extended_branding.sql   (Extended colors)
  └─ 0007_add_hero_title_and_description.sql
```

### Types & Services
```
📁 src/
  ├─ types/database.ts            (Tenant interface)
  ├─ lib/
  │  ├─ branding-utils.ts         (Utilities)
  │  ├─ tenants-service.ts        (CRUD operations)
  │  └─ admin-service.ts          (Auth checks)
  └─ actions/tenants.ts           (Server actions)
```

### UI Components
```
📁 src/
  ├─ app/
  │  ├─ [tenant]/
  │  │  ├─ menu/page.tsx                    (Main showcase)
  │  │  └─ admin/settings/page.tsx          (Admin editor)
  │  └─ superadmin/tenants/[id]/page.tsx   (Superadmin)
  └─ components/
     ├─ admin/branding-editor-overlay.tsx  (Live editor)
     └─ customer/item-detail-modal.tsx     (Branded modal)
```

---

## 🔐 Permissions

### RLS Policies

```sql
-- Public can read active tenants (for menu display)
tenants_read_active: SELECT WHERE is_active = true

-- Only superadmin can create/update all fields
tenants_write_superadmin: ALL WHERE role = 'superadmin'

-- Tenant admins can update branding via server action
-- (Enforced in application code, not direct SQL)
```

### Role Check (Client-Side)

```typescript
// Check if user can edit branding
const { data: { user } } = await supabase.auth.getUser()
const { data: appUser } = await supabase
  .from('app_users')
  .select('role, tenant_id')
  .eq('user_id', user.id)
  .single()

const canEdit = 
  appUser.role === 'superadmin' || 
  (appUser.role === 'admin' && appUser.tenant_id === tenant.id)
```

### Server-Side Verification

```typescript
import { verifyTenantAdmin } from '@/lib/admin-service'

// In server action/API route
await verifyTenantAdmin(tenantId) // Throws if unauthorized
```

---

## 🐛 Troubleshooting

### Issue: Colors Not Updating

```bash
✓ Check browser cache (hard refresh: Cmd+Shift+R)
✓ Verify database updated (check Supabase dashboard)
✓ Check console for errors
✓ Ensure revalidatePath() called
✓ Verify correct tenant loaded
```

### Issue: Branding Editor Not Visible

```bash
✓ User must be logged in
✓ User must have admin/superadmin role
✓ For admins: tenant_id must match
✓ Check browser console for errors
✓ Verify app_users table has correct role
```

### Issue: Poor Color Contrast

```typescript
// Use contrast checker
import { getContrastColor } from '@/lib/branding-utils'

const bg = '#c41e3a'
const text = getContrastColor(bg) // Auto-calculates best contrast

// Or manually check
// Light backgrounds: use dark text (#111111)
// Dark backgrounds: use light text (#ffffff)
```

---

## 📊 Database Queries

### Get Tenant with Branding

```typescript
const { data: tenant } = await supabase
  .from('tenants')
  .select('*')
  .eq('slug', 'restaurant-slug')
  .single()
```

### Update Branding Only

```typescript
const { data, error } = await supabase
  .from('tenants')
  .update({
    primary_color: '#c41e3a',
    secondary_color: '#009246',
    button_primary_color: '#c41e3a',
  })
  .eq('id', tenantId)
```

### Bulk Update All Tenants (Superadmin)

```typescript
// Set default values for existing tenants
const { data, error } = await supabase
  .from('tenants')
  .update({
    background_color: '#ffffff',
    button_primary_color: supabase.raw('primary_color'),
  })
  .is('background_color', null)
```

---

## 🎨 Example Color Schemes

### Italian Restaurant
```typescript
primary: '#c41e3a'      // Italian red
secondary: '#009246'    // Italian green
accent: '#ffd700'       // Gold
background: '#faf8f5'   // Warm off-white
button_primary: '#c41e3a'
```

### Coffee Shop
```typescript
primary: '#6f4e37'      // Coffee brown
secondary: '#d4a574'    // Latte
accent: '#f8f4e8'       // Cream
background: '#f8f4e8'   
button_primary: '#6f4e37'
```

### Sushi Bar
```typescript
primary: '#c20026'      // Sushi red
secondary: '#1a1a1a'    // Black
accent: '#f4f4f4'       // Off-white
background: '#ffffff'
button_primary: '#c20026'
```

### Modern Tech
```typescript
primary: '#667eea'      // Purple
secondary: '#764ba2'    // Deep purple
accent: '#f093fb'       // Pink
background: '#ffffff'
button_primary: '#667eea'
```

---

## 🚦 Component Mapping

| Component | Primary Colors Used |
|-----------|-------------------|
| **Navbar** | `header_color`, `header_font_color`, `primary_color` (badge) |
| **Menu Cards** | `cards_color`, `cards_border_color`, `text_primary_color`, `text_secondary_color` |
| **Buttons** | `button_primary_color`, `button_primary_text_color` |
| **Hero** | `hero_title_color`, `hero_description_color` (or text colors) |
| **Modal** | All colors (comprehensive showcase) |
| **Forms** | `border_color`, `primary_color` (focus), `error_color` |
| **Badges** | `primary_color`, `success_color`, `warning_color` |

---

## 📱 Testing Checklist

```
Device Testing:
☐ Desktop (1920x1080)
☐ Laptop (1366x768)
☐ Tablet (768x1024)
☐ Mobile (375x667)

Browser Testing:
☐ Chrome
☐ Firefox
☐ Safari
☐ Mobile Safari
☐ Mobile Chrome

Color Testing:
☐ Light mode readable
☐ Buttons have good contrast
☐ Links are distinguishable
☐ Success/Error/Warning visible
☐ Disabled states clear

Functionality:
☐ Live editor opens/closes
☐ Changes preview correctly
☐ Save persists to database
☐ Page refreshes show changes
☐ Other pages use branding
```

---

## 🔗 Related Resources

- **[BRANDING_CUSTOMIZATION_ANALYSIS.md](./BRANDING_CUSTOMIZATION_ANALYSIS.md)** - Complete technical docs
- **[BRANDING_VISUAL_GUIDE.md](./BRANDING_VISUAL_GUIDE.md)** - Visual examples
- **[WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)** - Test color contrast
- **[Coolors.co](https://coolors.co/)** - Generate color palettes
- **[Adobe Color](https://color.adobe.com/)** - Color wheel tool

---

## 💻 Code Snippets

### Full Example: Branded Component

```tsx
import { getTenantBranding } from '@/lib/branding-utils'
import type { Tenant } from '@/types/database'

interface BrandedMenuCardProps {
  tenant: Tenant
  title: string
  description: string
  price: number
  onAddToCart: () => void
}

export function BrandedMenuCard({
  tenant,
  title,
  description,
  price,
  onAddToCart
}: BrandedMenuCardProps) {
  const branding = getTenantBranding(tenant)
  
  return (
    <div 
      style={{
        backgroundColor: branding.cards,
        borderColor: branding.cardsBorder,
        borderWidth: '1px',
        borderRadius: '12px',
        padding: '16px'
      }}
    >
      <h3 style={{ color: branding.textPrimary }}>
        {title}
      </h3>
      <p style={{ color: branding.textSecondary }}>
        {description}
      </p>
      <div style={{ 
        color: branding.textPrimary,
        fontWeight: 'bold',
        marginTop: '8px'
      }}>
        ₱{price.toFixed(2)}
      </div>
      <button
        onClick={onAddToCart}
        style={{
          backgroundColor: branding.buttonPrimary,
          color: branding.buttonPrimaryText,
          border: 'none',
          borderRadius: '8px',
          padding: '12px 24px',
          marginTop: '12px',
          cursor: 'pointer',
          width: '100%'
        }}
      >
        Add to Cart
      </button>
    </div>
  )
}
```

---

**Last Updated:** November 7, 2025  
**Quick Reference Version:** 1.0

