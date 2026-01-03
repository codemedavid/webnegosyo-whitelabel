# Tenant Creation - Comprehensive Analysis

## 📋 Table of Contents
1. [Overview](#overview)
2. [User Flow](#user-flow)
3. [Architecture & Components](#architecture--components)
4. [Data Flow](#data-flow)
5. [Validation & Security](#validation--security)
6. [Form Structure](#form-structure)
7. [Post-Creation Actions](#post-creation-actions)
8. [Potential Issues & Improvements](#potential-issues--improvements)

---

## Overview

The tenant creation system allows superadmins to create new restaurant tenants (multi-tenant instances) with comprehensive configuration including branding, integrations, and delivery settings.

### Key Characteristics
- **Access Control**: Only superadmins can create tenants
- **Comprehensive Form**: 8 major sections with 50+ configurable fields
- **Validation**: Zod schema validation + database constraints
- **Uniqueness Checks**: Slug and domain uniqueness validation
- **Auto-redirect**: Redirects to new tenant's menu after creation

---

## User Flow

```
1. Superadmin navigates to /superadmin/tenants/new
   ↓
2. Fills out TenantFormWrapper with 8 sections:
   - Basic Information
   - Branding
   - Extended Branding
   - Messenger Integration
   - Mapbox Settings
   - Order Management
   - Restaurant Address
   - Lalamove Configuration
   ↓
3. Clicks "Create Tenant" button
   ↓
4. Form submission triggers createTenantAction (server action)
   ↓
5. Validation & uniqueness checks
   ↓
6. Database insert
   ↓
7. Cache revalidation
   ↓
8. Redirect to /{slug}/menu
```

---

## Architecture & Components

### 1. Page Component
**File**: `src/app/superadmin/tenants/new/page.tsx`

```4:26:src/app/superadmin/tenants/new/page.tsx
// Force dynamic rendering to avoid Cloudinary prerendering issues
export const dynamic = 'force-dynamic'

export default function NewTenantPage() {
  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: '/superadmin' },
          { label: 'Tenants', href: '/superadmin/tenants' },
          { label: 'New Tenant' },
        ]}
      />

      <div>
        <h1 className="text-3xl font-bold">Add Tenant</h1>
        <p className="text-muted-foreground">Create a new restaurant tenant</p>
      </div>

      <TenantFormWrapper />
    </div>
  )
}
```

**Key Points**:
- Server Component (no 'use client')
- Forces dynamic rendering (for Cloudinary)
- Simple layout with breadcrumbs

---

### 2. Form Component
**File**: `src/components/superadmin/tenant-form-wrapper.tsx`

**Structure**: Client component with 8 modular sections

```745:928:src/components/superadmin/tenant-form-wrapper.tsx
export function TenantFormWrapper({ tenant }: TenantFormWrapperProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  
  const [formData, setFormData] = useState<TenantFormData>({
    name: tenant?.name || '',
    slug: tenant?.slug || '',
    domain: tenant?.domain || '',
    logo_url: tenant?.logo_url || '',
    primary_color: tenant?.primary_color || '#c41e3a',
    secondary_color: tenant?.secondary_color || '#009246',
    accent_color: tenant?.accent_color || '',
    // Extended branding colors
    background_color: tenant?.background_color || '',
    header_color: tenant?.header_color || '',
    header_font_color: tenant?.header_font_color || '',
    cards_color: tenant?.cards_color || '',
    cards_border_color: tenant?.cards_border_color || '',
    button_primary_color: tenant?.button_primary_color || '',
    button_primary_text_color: tenant?.button_primary_text_color || '',
    button_secondary_color: tenant?.button_secondary_color || '',
    button_secondary_text_color: tenant?.button_secondary_text_color || '',
    text_primary_color: tenant?.text_primary_color || '',
    text_secondary_color: tenant?.text_secondary_color || '',
    text_muted_color: tenant?.text_muted_color || '',
    border_color: tenant?.border_color || '',
    success_color: tenant?.success_color || '',
    warning_color: tenant?.warning_color || '',
    error_color: tenant?.error_color || '',
    link_color: tenant?.link_color || '',
    shadow_color: tenant?.shadow_color || '',
    messenger_page_id: tenant?.messenger_page_id || '',
    messenger_username: tenant?.messenger_username || '',
    is_active: tenant?.is_active ?? true,
    mapbox_enabled: tenant?.mapbox_enabled ?? true,
    enable_order_management: tenant?.enable_order_management ?? true,
    // Restaurant address
    restaurant_address: tenant?.restaurant_address || '',
    restaurant_latitude: tenant?.restaurant_latitude?.toString() || '',
    restaurant_longitude: tenant?.restaurant_longitude?.toString() || '',
    // Lalamove configuration
    lalamove_enabled: tenant?.lalamove_enabled ?? false,
    lalamove_api_key: tenant?.lalamove_api_key || '',
    lalamove_secret_key: tenant?.lalamove_secret_key || '',
    lalamove_market: tenant?.lalamove_market || 'HK',
    lalamove_service_type: tenant?.lalamove_service_type || 'MOTORCYCLE',
    lalamove_sandbox: tenant?.lalamove_sandbox ?? true,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const input = {
      name: formData.name,
      slug: formData.slug,
      domain: formData.domain || null,
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
      enable_order_management: formData.enable_order_management,
      // Restaurant address
      restaurant_address: formData.restaurant_address || undefined,
      restaurant_latitude: formData.restaurant_latitude ? parseFloat(formData.restaurant_latitude) : undefined,
      restaurant_longitude: formData.restaurant_longitude ? parseFloat(formData.restaurant_longitude) : undefined,
      // Lalamove configuration
      lalamove_enabled: formData.lalamove_enabled,
      lalamove_api_key: formData.lalamove_api_key || undefined,
      lalamove_secret_key: formData.lalamove_secret_key || undefined,
      lalamove_market: formData.lalamove_market || undefined,
      lalamove_service_type: formData.lalamove_service_type || undefined,
      lalamove_sandbox: formData.lalamove_sandbox,
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

      <OrderManagementSection 
        formData={formData} 
        setFormData={setFormData} 
        isPending={isPending} 
      />

      <RestaurantAddressSection 
        formData={formData} 
        setFormData={setFormData} 
        isPending={isPending} 
      />

      <LalamoveSection 
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

**Key Features**:
- Uses `useTransition` for optimistic UI updates
- Modular section components for maintainability
- Comprehensive form state management
- Error handling with toast notifications

---

### 3. Server Action
**File**: `src/actions/tenants.ts`

```14:110:src/actions/tenants.ts
export async function createTenantAction(input: TenantInput) {
  const supabase = await createClient()
  
  // Validate input
  const parsed = tenantSchema.parse(input)
  
  // Check if slug is taken
  const { data: existing } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', parsed.slug)
    .maybeSingle()
  
  if (existing) {
    return { error: 'Slug is already taken' }
  }
  
  const insertPayload: TenantsInsert = {
    name: parsed.name,
    slug: parsed.slug,
    domain: parsed.domain || undefined,
    logo_url: parsed.logo_url || '',
    primary_color: parsed.primary_color,
    secondary_color: parsed.secondary_color,
    accent_color: parsed.accent_color || undefined,
    // Extended branding colors
    background_color: parsed.background_color || undefined,
    header_color: parsed.header_color || undefined,
    header_font_color: parsed.header_font_color || undefined,
    cards_color: parsed.cards_color || undefined,
    cards_border_color: parsed.cards_border_color || undefined,
    card_title_color: parsed.card_title_color || undefined,
    card_price_color: parsed.card_price_color || undefined,
    card_description_color: parsed.card_description_color || undefined,
    modal_background_color: parsed.modal_background_color || undefined,
    modal_title_color: parsed.modal_title_color || undefined,
    modal_price_color: parsed.modal_price_color || undefined,
    modal_description_color: parsed.modal_description_color || undefined,
    button_primary_color: parsed.button_primary_color || undefined,
    button_primary_text_color: parsed.button_primary_text_color || undefined,
    button_secondary_color: parsed.button_secondary_color || undefined,
    button_secondary_text_color: parsed.button_secondary_text_color || undefined,
    text_primary_color: parsed.text_primary_color || undefined,
    text_secondary_color: parsed.text_secondary_color || undefined,
    text_muted_color: parsed.text_muted_color || undefined,
    border_color: parsed.border_color || undefined,
    success_color: parsed.success_color || undefined,
    warning_color: parsed.warning_color || undefined,
    error_color: parsed.error_color || undefined,
    link_color: parsed.link_color || undefined,
    shadow_color: parsed.shadow_color || undefined,
    // Menu hero customization
    hero_title: parsed.hero_title || undefined,
    hero_description: parsed.hero_description || undefined,
    hero_title_color: parsed.hero_title_color || undefined,
    hero_description_color: parsed.hero_description_color || undefined,
    messenger_page_id: parsed.messenger_page_id,
    messenger_username: parsed.messenger_username || undefined,
    is_active: parsed.is_active,
    mapbox_enabled: parsed.mapbox_enabled,
    enable_order_management: parsed.enable_order_management,
    // Restaurant address
    restaurant_address: parsed.restaurant_address || undefined,
    restaurant_latitude: parsed.restaurant_latitude || undefined,
    restaurant_longitude: parsed.restaurant_longitude || undefined,
    // Lalamove configuration
    lalamove_enabled: parsed.lalamove_enabled,
    lalamove_api_key: parsed.lalamove_api_key || undefined,
    lalamove_secret_key: parsed.lalamove_secret_key || undefined,
    lalamove_market: parsed.lalamove_market || undefined,
    lalamove_service_type: parsed.lalamove_service_type || undefined,
    lalamove_sandbox: parsed.lalamove_sandbox,
  }
  
  const query = supabase
    .from('tenants')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert(insertPayload as any)
    .select('*')
    .single()
  
  const { data, error } = await query
  
  if (error) {
    return { error: error.message }
  }
  
  // Revalidate cached data
  revalidatePath('/superadmin')
  revalidatePath('/superadmin/tenants')
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenant = data as any
  
  // Redirect to the new tenant's menu
  redirect(`/${tenant.slug}/menu`)
}
```

**Key Points**:
- Server action (marked with 'use server')
- Zod schema validation
- Slug uniqueness check
- Database insert with error handling
- Cache revalidation
- Auto-redirect to new tenant's menu

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. CLIENT: TenantFormWrapper                                │
│    • User fills form                                         │
│    • handleSubmit() called                                  │
│    • startTransition() wraps async call                     │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. SERVER ACTION: createTenantAction()                      │
│    • Receives TenantInput                                   │
│    • Validates with tenantSchema.parse()                    │
│    • Checks slug uniqueness                                  │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. DATABASE: Supabase Insert                                │
│    • RLS policy checks (superadmin only)                    │
│    • Insert into tenants table                              │
│    • Database triggers: set_updated_at()                    │
│    • Returns created tenant                                  │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. CACHE REVALIDATION                                       │
│    • revalidatePath('/superadmin')                          │
│    • revalidatePath('/superadmin/tenants')                  │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. REDIRECT                                                  │
│    • redirect(`/${tenant.slug}/menu`)                        │
│    • User sees new tenant's menu                            │
└─────────────────────────────────────────────────────────────┘
```

---

## Validation & Security

### 1. Zod Schema Validation
**File**: `src/lib/tenants-service.ts`

```28:84:src/lib/tenants-service.ts
export const tenantSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9\-]+$/),
  domain: domainSchema,
  logo_url: z.string().url().optional().or(z.literal('')).optional(),
  primary_color: z.string().min(1),
  secondary_color: z.string().min(1),
  accent_color: z.string().optional().or(z.literal('')).optional(),
  // Extended branding colors
  background_color: z.string().optional().or(z.literal('')).optional(),
  header_color: z.string().optional().or(z.literal('')).optional(),
  header_font_color: z.string().optional().or(z.literal('')).optional(),
  cards_color: z.string().optional().or(z.literal('')).optional(),
  cards_border_color: z.string().optional().or(z.literal('')).optional(),
  card_title_color: z.string().optional().or(z.literal('')).optional(),
  card_price_color: z.string().optional().or(z.literal('')).optional(),
  card_description_color: z.string().optional().or(z.literal('')).optional(),
  modal_background_color: z.string().optional().or(z.literal('')).optional(),
  modal_title_color: z.string().optional().or(z.literal('')).optional(),
  modal_price_color: z.string().optional().or(z.literal('')).optional(),
  modal_description_color: z.string().optional().or(z.literal('')).optional(),
  button_primary_color: z.string().optional().or(z.literal('')).optional(),
  button_primary_text_color: z.string().optional().or(z.literal('')).optional(),
  button_secondary_color: z.string().optional().or(z.literal('')).optional(),
  button_secondary_text_color: z.string().optional().or(z.literal('')).optional(),
  text_primary_color: z.string().optional().or(z.literal('')).optional(),
  text_secondary_color: z.string().optional().or(z.literal('')).optional(),
  text_muted_color: z.string().optional().or(z.literal('')).optional(),
  border_color: z.string().optional().or(z.literal('')).optional(),
  success_color: z.string().optional().or(z.literal('')).optional(),
  warning_color: z.string().optional().or(z.literal('')).optional(),
  error_color: z.string().optional().or(z.literal('')).optional(),
  link_color: z.string().optional().or(z.literal('')).optional(),
  shadow_color: z.string().optional().or(z.literal('')).optional(),
  // Menu hero customization
  hero_title: z.string().optional().or(z.literal('')).optional(),
  hero_description: z.string().optional().or(z.literal('')).optional(),
  hero_title_color: z.string().optional().or(z.literal('')).optional(),
  hero_description_color: z.string().optional().or(z.literal('')).optional(),
  messenger_page_id: z.string().min(1),
  messenger_username: z.string().optional().or(z.literal('')).optional(),
  is_active: z.boolean().default(true),
  mapbox_enabled: z.boolean().default(true),
  enable_order_management: z.boolean().default(true),
  // Restaurant address for Lalamove pickup
  restaurant_address: z.string().optional().or(z.literal('')).optional(),
  restaurant_latitude: z.number().optional(),
  restaurant_longitude: z.number().optional(),
  // Lalamove configuration
  lalamove_enabled: z.boolean().default(false),
  lalamove_api_key: z.string().optional().or(z.literal('')).optional(),
  lalamove_secret_key: z.string().optional().or(z.literal('')).optional(),
  lalamove_market: z.string().optional().or(z.literal('')).optional(),
  lalamove_service_type: z.string().optional().or(z.literal('')).optional(),
  lalamove_sandbox: z.boolean().default(true),
})
```

**Validation Rules**:
- `name`: Minimum 2 characters
- `slug`: Minimum 2 characters, lowercase alphanumeric + hyphens only
- `domain`: Optional, validated format with normalization
- `logo_url`: Optional, must be valid URL if provided
- `messenger_page_id`: Required (minimum 1 character)
- Colors: Required for primary/secondary, optional for others
- Booleans: Default values provided

### 2. Domain Validation
```11:26:src/lib/tenants-service.ts
// Domain validation: must be a valid domain format (not necessarily a URL)
const domainSchema = z
  .string()
  .optional()
  .or(z.literal(''))
  .transform((val) => {
    if (!val || val === '') return null
    return normalizeDomain(val)
  })
  .refine(
    (val) => {
      if (!val) return true // Empty is valid
      // Basic domain validation: must contain at least one dot and valid characters
      return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,}$/i.test(val)
    },
    { message: 'Invalid domain format' }
  )
```

### 3. Uniqueness Checks

**Slug Uniqueness**:
```20:29:src/actions/tenants.ts
  // Check if slug is taken
  const { data: existing } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', parsed.slug)
    .maybeSingle()
  
  if (existing) {
    return { error: 'Slug is already taken' }
  }
```

**Domain Uniqueness** (in tenants-service.ts):
```148:150:src/lib/tenants-service.ts
  if (parsed.domain && (await isDomainTaken(parsed.domain))) {
    throw new Error('Domain is already taken')
  }
```

### 4. Row Level Security (RLS)

**Database Policy**: Only superadmins can insert tenants
- Policy: `tenants_write_superadmin`
- Checks: `app_users.role = 'superadmin'`

---

## Form Structure

### Section 1: Basic Information
- **Restaurant Name** (required)
- **URL Slug** (required, with auto-generate button)
- **Custom Domain** (optional)
- **Restaurant Logo** (ImageUpload component)
- **Active** (checkbox, default: true)

**Features**:
- Slug auto-generation from name
- Domain validation hints
- Cloudinary image upload

### Section 2: Branding
- **Primary Color** (required)
- **Secondary Color** (required)
- **Accent Color** (optional)

**UI**: Color picker + text input

### Section 3: Extended Branding
- 20+ color fields for comprehensive theming
- Background, header, cards, buttons, text, borders, etc.

### Section 4: Messenger Integration
- **Facebook Page ID** (required)
- **Messenger Username** (optional)

### Section 5: Mapbox Settings
- **Enable Mapbox** (toggle, default: true)
- Warning when disabled

### Section 6: Order Management
- **Enable Order Tracking** (toggle, default: true)
- Info about database storage

### Section 7: Restaurant Address
- **Address** (MapboxAddressAutocomplete)
- **Latitude** (number input)
- **Longitude** (number input)
- Required for Lalamove pickup

### Section 8: Lalamove Configuration
- **Enable Lalamove** (toggle, default: false)
- **API Key** (password input)
- **Secret Key** (password input)
- **Market** (text, e.g., "HK")
- **Service Type** (text, e.g., "MOTORCYCLE")
- **Sandbox Mode** (toggle, default: true)

---

## Post-Creation Actions

### 1. Cache Revalidation
```101:103:src/actions/tenants.ts
  // Revalidate cached data
  revalidatePath('/superadmin')
  revalidatePath('/superadmin/tenants')
```

### 2. Auto-Redirect
```108:109:src/actions/tenants.ts
  // Redirect to the new tenant's menu
  redirect(`/${tenant.slug}/menu`)
```

**Note**: The redirect happens automatically, so the user immediately sees the new tenant's menu page.

### 3. Database Triggers
- `set_updated_at()` trigger automatically sets `updated_at` timestamp

---

## Potential Issues & Improvements

### 🔴 Issues Found

#### 1. Missing Domain Uniqueness Check in Server Action
**Location**: `src/actions/tenants.ts:14-29`

**Issue**: The server action only checks slug uniqueness, not domain uniqueness.

**Current Code**:
```typescript
// Check if slug is taken
const { data: existing } = await supabase
  .from('tenants')
  .select('id')
  .eq('slug', parsed.slug)
  .maybeSingle()

if (existing) {
  return { error: 'Slug is already taken' }
}
```

**Problem**: Domain uniqueness is checked in `createTenantSupabase()` but not in `createTenantAction()`. Since the action uses direct Supabase client, it should also check domain.

**Recommendation**: Add domain uniqueness check:
```typescript
// Check if domain is taken (if provided)
if (parsed.domain) {
  const { data: existingDomain } = await supabase
    .from('tenants')
    .select('id')
    .eq('domain', parsed.domain)
    .maybeSingle()
  
  if (existingDomain) {
    return { error: 'Domain is already taken' }
  }
}
```

#### 2. Error Handling Inconsistency
**Issue**: `createTenantAction` returns `{ error: string }` on validation failure, but throws/redirects on success. The form handler doesn't check for error return value.

**Current Code**:
```typescript
// createTenantAction redirects on success
await createTenantAction(input)
```

**Problem**: If `createTenantAction` returns `{ error: ... }`, the redirect still happens, or the error is silently ignored.

**Recommendation**: Check for error return:
```typescript
const result = await createTenantAction(input)
if (result?.error) {
  toast.error(result.error)
  return
}
// Redirect only happens inside createTenantAction on success
```

#### 3. Missing Validation for Lalamove Fields
**Issue**: When `lalamove_enabled` is true, required fields (API key, secret key, market, service type) are not validated.

**Recommendation**: Add conditional validation:
```typescript
if (parsed.lalamove_enabled) {
  if (!parsed.lalamove_api_key || !parsed.lalamove_secret_key || !parsed.lalamove_market || !parsed.lalamove_service_type) {
    return { error: 'Lalamove API key, secret key, market, and service type are required when Lalamove is enabled' }
  }
}
```

#### 4. Missing Restaurant Address Validation
**Issue**: Restaurant address fields are required for Lalamove but not validated.

**Recommendation**: Add validation:
```typescript
if (parsed.lalamove_enabled) {
  if (!parsed.restaurant_address || !parsed.restaurant_latitude || !parsed.restaurant_longitude) {
    return { error: 'Restaurant address, latitude, and longitude are required when Lalamove is enabled' }
  }
}
```

### 🟡 Improvements

#### 1. Slug Auto-Generation UX
**Current**: Button to generate slug from name
**Improvement**: Auto-generate on blur or as user types (debounced)

#### 2. Form Validation Feedback
**Current**: Basic HTML5 validation
**Improvement**: Real-time validation with error messages below fields

#### 3. Progress Indicator
**Current**: Simple "Saving..." text
**Improvement**: Multi-step progress indicator for the 8 sections

#### 4. Draft Saving
**Improvement**: Auto-save form data to localStorage as user fills it out

#### 5. Slug Availability Check
**Improvement**: Real-time slug availability check (debounced API call)

#### 6. Default Values
**Improvement**: Pre-fill form with sensible defaults or templates

---

## Summary

The tenant creation system is **well-structured** with:
- ✅ Comprehensive form with 8 sections
- ✅ Zod schema validation
- ✅ Slug uniqueness checking
- ✅ Modular component architecture
- ✅ Server actions for security
- ✅ Auto-redirect after creation

**Areas for improvement**:
- ⚠️ Add domain uniqueness check in server action
- ⚠️ Fix error handling in form submission
- ⚠️ Add conditional validation for Lalamove fields
- ⚠️ Add restaurant address validation for Lalamove
- 💡 Enhance UX with real-time validation and slug checking

