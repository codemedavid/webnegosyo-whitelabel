# Tenant Settings - Comprehensive Analysis

## 📋 Table of Contents
1. [Overview](#overview)
2. [Database Schema](#database-schema)
3. [Settings Categories](#settings-categories)
4. [Architecture](#architecture)
5. [Access Control](#access-control)
6. [Migration History](#migration-history)
7. [Recommendations](#recommendations)

---

## Overview

The tenant settings system manages multi-tenant configuration for restaurant menu systems. Each tenant (restaurant) has comprehensive settings covering branding, features, integrations, and delivery options.

### Key Characteristics
- **Multi-tenant**: Each restaurant has isolated settings
- **Comprehensive**: 50+ configurable fields
- **Hierarchical Access**: SuperAdmin has full control, Tenant Admins have limited access
- **Migration-based**: Schema evolves through migrations
- **Type-safe**: Full TypeScript support with Zod validation

---

## Database Schema

### Core Table: `public.tenants`

The tenants table stores all settings in a single table without normalization (denormalized for simplicity).

#### Initial Fields (Migration 0001)
```sql
CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  domain text,
  logo_url text NOT NULL DEFAULT '',
  primary_color text NOT NULL DEFAULT '#111111',
  secondary_color text NOT NULL DEFAULT '#666666',
  accent_color text,
  messenger_page_id text NOT NULL DEFAULT '',
  messenger_username text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

#### Extended Fields (Added via Migrations)

**Migration 0004**: Extended Branding Colors
- `background_color`, `header_color`, `header_font_color`
- `cards_color`, `cards_border_color`
- `button_primary_color`, `button_primary_text_color`
- `button_secondary_color`, `button_secondary_text_color`
- `text_primary_color`, `text_secondary_color`, `text_muted_color`
- `border_color`, `success_color`, `warning_color`, `error_color`
- `link_color`, `shadow_color`

**Migration 0005**: Mapbox Feature Toggle
- `mapbox_enabled` (boolean) - Enable/disable address autocomplete

**Migration 0006**: Order Management Toggle
- `enable_order_management` (boolean) - Save orders to database vs Messenger-only

**Migration 0007**: Hero Customization
- `hero_title`, `hero_description`
- `hero_title_color`, `hero_description_color`

**Migration 0010**: Lalamove Delivery Integration
- `lalamove_enabled`, `lalamove_api_key`, `lalamove_secret_key`
- `lalamove_market`, `lalamove_service_type`, `lalamove_sandbox`
- `restaurant_address`, `restaurant_latitude`, `restaurant_longitude`

**Migration 0014**: Card Text Colors
- `card_title_color`, `card_price_color`, `card_description_color`

**Migration 0015**: Modal Branding
- `modal_background_color`, `modal_title_color`
- `modal_price_color`, `modal_description_color`

**Migration 0016**: Card Template Selection
- `card_template` - Select from preset card designs

---

## Settings Categories

### 1. **Basic Information** 🏢
**Location**: SuperAdmin only
**Database Fields**:
- `name` - Restaurant name (required)
- `slug` - URL-safe identifier (required, unique)
- `domain` - Custom domain (optional)
- `logo_url` - Logo image URL
- `is_active` - Enable/disable tenant

**Editing**:
- SuperAdmin: Full control via `/superadmin/tenants/[id]`
- Tenant Admin: Read-only display

---

### 2. **Branding & Colors** 🎨
**Location**: Both SuperAdmin and Tenant Admin
**Breakdown**:

#### Core Brand Colors (3 fields)
- `primary_color` - Main brand color
- `secondary_color` - Secondary brand color
- `accent_color` - Highlight color

#### Layout & Background (4 fields)
- `background_color` - Page background
- `header_color` - Navigation bar background
- `header_font_color` - Navigation text color
- `border_color` - General borders

#### Menu Cards (5 fields)
- `cards_color` - Card background
- `cards_border_color` - Card outline
- `card_title_color` - Item name on cards
- `card_price_color` - Price on cards
- `card_description_color` - Description text

#### Item Detail Modal (4 fields)
- `modal_background_color` - Modal popup background
- `modal_title_color` - Item name in modal
- `modal_price_color` - Price in modal
- `modal_description_color` - Description in modal

#### Buttons (4 fields)
- `button_primary_color` - Main action buttons
- `button_primary_text_color` - Text on primary buttons
- `button_secondary_color` - Secondary actions
- `button_secondary_text_color` - Text on secondary buttons

#### Text Colors (3 fields)
- `text_primary_color` - Main content text
- `text_secondary_color` - Less prominent text
- `text_muted_color` - Subtle, disabled text

#### Status & State Colors (4 fields)
- `success_color` - Success messages
- `warning_color` - Warning messages
- `error_color` - Error messages
- `link_color` - Clickable links

#### Effects (1 field)
- `shadow_color` - Shadow effects (supports rgba)

**Total Branding Fields**: 28 color fields

**Editing**:
- SuperAdmin: Full access via Tenant Form
- Tenant Admin: Can edit via `/[tenant]/admin/settings` (limited to branding only)

---

### 3. **Hero Customization** 🖼️
**Location**: SuperAdmin only
**Database Fields**:
- `hero_title` - Custom hero section title
- `hero_description` - Custom hero section description
- `hero_title_color` - Title text color
- `hero_description_color` - Description text color

**Use Case**: Customize the main banner on the menu page

---

### 4. **Card Template** 🃏
**Location**: SuperAdmin only
**Database Fields**:
- `card_template` - Template style selection

**Options**:
- `classic` - Traditional card layout
- `minimal` - Clean, minimal design
- `modern` - Contemporary styling
- `elegant` - Sophisticated look
- `compact` - Space-efficient
- `bold` - Eye-catching design

---

### 5. **Messenger Integration** 💬
**Location**: SuperAdmin and Tenant Admin (read-only)
**Database Fields**:
- `messenger_page_id` - Facebook Page ID (required)
- `messenger_username` - Facebook username (optional)

**Purpose**: Enable Facebook Messenger ordering button

---

### 6. **Feature Toggles** ⚙️
**Location**: SuperAdmin only
**Database Fields**:

#### Mapbox Address Autocomplete
- `mapbox_enabled` (boolean) - Enable/disable address autocomplete

**Impact**: Shows/hides address search in checkout

#### Order Management System
- `enable_order_management` (boolean) - Save orders to database

**Impact**:
- `true`: Orders saved to database, visible in admin panel
- `false`: Orders redirect to Messenger only (no backend tracking)

---

### 7. **Restaurant Address** 📍
**Location**: SuperAdmin only
**Database Fields**:
- `restaurant_address` - Physical address (text)
- `restaurant_latitude` - Latitude coordinate (numeric)
- `restaurant_longitude` - Longitude coordinate (numeric)

**Purpose**: Used as pickup location for Lalamove delivery

---

### 8. **Lalamove Delivery Integration** 🚚
**Location**: SuperAdmin only
**Database Fields**:

#### Configuration
- `lalamove_enabled` (boolean) - Enable delivery option
- `lalamove_api_key` - Public API key
- `lalamove_secret_key` - Secret API key
- `lalamove_market` - Market code (e.g., HK, SG, TH, PH)
- `lalamove_service_type` - Service type (MOTORCYCLE, VAN, CAR)
- `lalamove_sandbox` (boolean) - Use sandbox environment

**Security Note**: API keys stored in database (not ideal for production)

**Recommendation**: Move to environment variables per tenant

---

## Architecture

### Data Flow

```
┌──────────────────┐
│  SuperAdmin UI   │
│   Tenant Form    │
└────────┬─────────┘
         │
         ▼
┌────────────────────────┐
│  Server Actions        │
│  createTenantAction    │
│  updateTenantAction    │
└────────┬───────────────┘
         │
         ▼
┌────────────────────────┐
│  Validation (Zod)      │
│  tenantSchema          │
└────────┬───────────────┘
         │
         ▼
┌────────────────────────┐
│  Supabase Client       │
│  createClient()        │
└────────┬───────────────┘
         │
         ▼
┌────────────────────────┐
│  Database              │
│  public.tenants        │
└────────────────────────┘
```

### Key Files

#### Type Definitions
- `src/types/database.ts` - TypeScript interfaces
  - `Tenant` interface (50+ fields)
  - `Database` schema definition

#### Validation Schema
- `src/lib/tenants-service.ts` - Zod schema
  - `tenantSchema` - Input validation
  - `TenantInput` type inference

#### Server Actions
- `src/actions/tenants.ts`
  - `createTenantAction()` - Create new tenant
  - `updateTenantAction()` - Update existing tenant
  - `updateTenantBrandingForAdminAction()` - Limited update for tenant admins

#### Client Components
- `src/components/superadmin/tenant-form.tsx` - Full tenant form
- `src/components/superadmin/tenant-form-wrapper.tsx` - Wrapper with sections
- `src/app/[tenant]/admin/settings/page.tsx` - Tenant admin settings page

#### Server Queries
- `src/lib/queries/tenants-server.ts` - Server-side fetching
  - `getTenants()` - List all tenants (cached)
- `src/lib/admin-service.ts`
  - `getTenantBySlug()` - Fetch by slug

#### Client Queries (React Query)
- `src/lib/queries/tenants.ts`
  - `useTenants()` - List tenants
  - `useTenant()` - Get single tenant
  - `useCreateTenant()` - Create mutation
  - `useUpdateTenant()` - Update mutation

---

## Access Control

### Role-Based Permissions

#### SuperAdmin 👑
**Full Access**:
- Create new tenants
- Edit all tenant settings
- Delete/deactivate tenants
- View all tenant data

**UI Locations**:
- `/superadmin/tenants` - List all tenants
- `/superadmin/tenants/new` - Create tenant
- `/superadmin/tenants/[id]` - Edit tenant

#### Tenant Admin 🔧
**Limited Access**:
- View basic information (read-only)
- Edit branding colors only
- View Messenger integration (read-only)

**UI Locations**:
- `/[tenant]/admin/settings` - Settings page

**Restrictions**:
- Cannot change name, slug, domain
- Cannot toggle features (Mapbox, Order Management)
- Cannot configure Lalamove
- Cannot set hero customization
- Cannot select card template

#### Customer 👤
**No Access**: Customers cannot view or edit tenant settings

### Row Level Security (RLS)

#### Tenants Table Policies

**Read Policy**: `tenants_read_active`
```sql
CREATE POLICY tenants_read_active ON public.tenants
  FOR SELECT USING (is_active = true);
```
- Anyone can read active tenants

**Write Policy**: `tenants_write_superadmin`
```sql
CREATE POLICY tenants_write_superadmin ON public.tenants
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.app_users au 
    WHERE au.user_id = auth.uid() AND au.role = 'superadmin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.app_users au 
    WHERE au.user_id = auth.uid() AND au.role = 'superadmin'
  ));
```
- Only superadmins can insert/update/delete

#### Tenant Admin Branding Updates

**Special Action**: `updateTenantBrandingForAdminAction()`
- Uses superadmin service account to bypass RLS
- Only allows updating branding fields
- Validates user is admin of the tenant

**File**: `src/actions/tenants.ts`

---

## Migration History

### Chronological Evolution

| Migration | Description | Fields Added |
|-----------|-------------|--------------|
| 0001 | Initial schema | Basic tenant info, core colors |
| 0004 | Extended branding | 16 branding colors |
| 0005 | Mapbox toggle | `mapbox_enabled` |
| 0006 | Order management toggle | `enable_order_management` |
| 0007 | Hero customization | Hero title/description/colors |
| 0010 | Lalamove integration | Delivery config, restaurant address |
| 0014 | Card text colors | Card-specific text colors |
| 0015 | Modal branding | Modal-specific colors |
| 0016 | Card templates | Template selection |

### Migration Best Practices
✅ **Good**:
- Each migration is atomic
- Includes default values
- Updates existing rows
- Adds documentation comments

⚠️ **Areas for Improvement**:
- No rollback scripts
- Sensitive data (API keys) in database
- No audit logging for setting changes

---

## Recommendations

### 1. **Security Improvements** 🔒

#### Move Sensitive Data to Environment Variables
**Problem**: API keys stored in database
```typescript
// Current: In database
lalamove_api_key: "pk_123456789"
lalamove_secret_key: "sk_987654321"
```

**Solution**: Use environment variables per tenant
```typescript
// Better: In environment
LALAMOVE_API_KEY_TENANT_ABC="pk_123456789"
LALAMOVE_SECRET_KEY_TENANT_ABC="sk_987654321"

// Or use a secrets management service
// Vault, AWS Secrets Manager, etc.
```

#### Encrypt Sensitive Fields
- Use PostgreSQL `pgcrypto` extension
- Encrypt API keys at rest
- Decrypt only when needed

---

### 2. **Schema Improvements** 🗄️

#### Normalize Settings into Separate Tables
**Current**: 50+ fields in one table
```sql
-- Denormalized (current)
tenants (id, name, slug, primary_color, secondary_color, ...)
```

**Proposed**: Separate concerns
```sql
-- Normalized (proposed)
tenants (id, name, slug, is_active, ...)
tenant_branding (tenant_id, primary_color, secondary_color, ...)
tenant_features (tenant_id, mapbox_enabled, enable_order_management, ...)
tenant_integrations (tenant_id, messenger_page_id, lalamove_api_key, ...)
tenant_delivery (tenant_id, restaurant_address, restaurant_latitude, ...)
```

**Benefits**:
- Cleaner schema
- Easier to add features
- Better query performance
- Separate access control per category

---

### 3. **Feature Improvements** ⚡

#### Add Audit Logging
Track who changed what and when:
```sql
CREATE TABLE tenant_settings_audit (
  id uuid PRIMARY KEY,
  tenant_id uuid REFERENCES tenants(id),
  changed_by uuid REFERENCES auth.users(id),
  field_name text,
  old_value text,
  new_value text,
  changed_at timestamptz DEFAULT now()
);
```

#### Add Setting Groups/Profiles
- Save branding presets
- Quick theme switching
- Import/export settings

#### Add Validation Rules
- Color contrast checking (WCAG compliance)
- Required field validation
- Domain verification

---

### 4. **UI/UX Improvements** 🎨

#### Settings Page Enhancements
**Current**: Single long form
**Proposed**: Tabbed interface

```
┌──────────────────────────────────────┐
│ Tenant Settings                       │
├──────────────────────────────────────┤
│ [Basic] [Branding] [Features] [...]  │
├──────────────────────────────────────┤
│                                       │
│   Active Tab Content Here            │
│                                       │
└──────────────────────────────────────┘
```

#### Live Preview
- Show color changes in real-time
- Preview card templates before saving
- Side-by-side comparison

#### Better Color Management
- Color palette suggestions
- Accessibility checking
- Preset themes (Light/Dark/Custom)

---

### 5. **Performance Optimizations** ⚡

#### Caching Strategy
**Current**: React cache for server components
```typescript
export const getTenants = cache(async () => { ... })
```

**Proposed**: Multi-layer caching
```typescript
// 1. React cache (per-request)
export const getTenants = cache(async () => { ... })

// 2. Redis cache (cross-request)
const cached = await redis.get('tenants')
if (cached) return JSON.parse(cached)

// 3. Database query
const data = await db.query(...)
await redis.setex('tenants', 3600, JSON.stringify(data))
```

#### Selective Field Loading
**Current**: Always fetch all fields
```typescript
.select('*')
```

**Proposed**: Only fetch needed fields
```typescript
// For list view
.select('id, name, slug, is_active, logo_url')

// For settings page
.select('*')
```

---

### 6. **Developer Experience** 👨‍💻

#### Setting Documentation
- Add tooltips to each field
- Link to feature documentation
- Show example values

#### TypeScript Improvements
```typescript
// Current: Optional fields
interface Tenant {
  primary_color?: string
  secondary_color?: string
}

// Proposed: Required with defaults
interface Tenant {
  primary_color: string // Always present (has default)
  secondary_color: string
  // Optional fields explicitly marked
  accent_color?: string
}
```

#### Zod Schema Refinements
```typescript
// Add custom validators
tenantSchema.refine((data) => {
  // Ensure contrast between colors
  const contrast = calculateContrast(data.primary_color, data.text_primary_color)
  return contrast >= 4.5 // WCAG AA standard
}, {
  message: "Insufficient color contrast for accessibility"
})
```

---

## Summary

### Current State ✅
- **Comprehensive**: 50+ configurable settings
- **Functional**: Supports multi-tenant operations
- **Type-safe**: Full TypeScript + Zod validation
- **Access-controlled**: Role-based permissions

### Areas for Improvement 🚀
1. **Security**: Move API keys to environment variables
2. **Schema**: Normalize into separate tables
3. **Audit**: Track setting changes
4. **UX**: Tabbed interface, live preview
5. **Performance**: Multi-layer caching
6. **Validation**: Accessibility checking

### Field Count Summary
- **Basic Information**: 5 fields
- **Branding & Colors**: 28 fields
- **Hero Customization**: 4 fields
- **Card Template**: 1 field
- **Messenger Integration**: 2 fields
- **Feature Toggles**: 2 fields
- **Restaurant Address**: 3 fields
- **Lalamove Integration**: 6 fields
- **System Fields**: 3 fields (id, created_at, updated_at)

**Total**: 54 fields in `tenants` table

---

## Quick Reference

### Editing Settings by Role

| Setting Category | SuperAdmin | Tenant Admin | Customer |
|------------------|------------|--------------|----------|
| Basic Info | ✅ Edit | 👁️ View | ❌ No Access |
| Branding | ✅ Edit | ✅ Edit | ❌ No Access |
| Hero | ✅ Edit | ❌ No Access | ❌ No Access |
| Card Template | ✅ Edit | ❌ No Access | ❌ No Access |
| Messenger | ✅ Edit | 👁️ View | ❌ No Access |
| Features | ✅ Edit | ❌ No Access | ❌ No Access |
| Restaurant Address | ✅ Edit | ❌ No Access | ❌ No Access |
| Lalamove | ✅ Edit | ❌ No Access | ❌ No Access |

### UI Locations

| Role | Page | Path |
|------|------|------|
| SuperAdmin | Tenant List | `/superadmin/tenants` |
| SuperAdmin | Create Tenant | `/superadmin/tenants/new` |
| SuperAdmin | Edit Tenant | `/superadmin/tenants/[id]` |
| Tenant Admin | Settings | `/[tenant]/admin/settings` |

---

**Last Updated**: November 9, 2025
**Version**: 1.0
**Status**: Complete ✅

