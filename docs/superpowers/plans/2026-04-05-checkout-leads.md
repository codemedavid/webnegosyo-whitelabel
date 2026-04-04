# Checkout Leads System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture landing page Smart Menu purchases as trackable checkout leads with payment proof upload, a confirmation page, and a separate superadmin dashboard.

**Architecture:** New `checkout_leads`, `checkout_lead_status_history`, and `platform_payment_methods` tables in Supabase with superadmin-only RLS. Service layer + server actions pattern matching existing leads system. Revamped `/checkout` form saves a lead then redirects to `/checkout/confirmation/[ref]` for payment instructions and proof upload. Superadmin dashboard at `/superadmin/checkout-leads` with stats, pipeline, table, and detail panel.

**Tech Stack:** Next.js 15 App Router, Supabase PostgreSQL + RLS, Cloudinary (image uploads), Shadcn UI, Tailwind CSS 4, Zod, Sonner toasts.

**Spec:** `docs/superpowers/specs/2026-04-05-checkout-leads-design.md`

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260405000001_checkout_leads.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Platform payment methods (not tenant-scoped)
CREATE TABLE platform_payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('qr_code', 'bank_transfer', 'other')),
  details text,
  qr_code_url text,
  is_active boolean NOT NULL DEFAULT true,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE platform_payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "superadmin_all" ON platform_payment_methods
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' = 'superadmin'
    )
  );

-- Allow anonymous reads of active payment methods (for checkout form)
CREATE POLICY "public_read_active" ON platform_payment_methods
  FOR SELECT USING (is_active = true);

-- Checkout leads
CREATE TABLE checkout_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_number text UNIQUE NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  business_name text NOT NULL,
  notes text,
  selected_payment_method_id uuid REFERENCES platform_payment_methods(id),
  status text NOT NULL DEFAULT 'initiated'
    CHECK (status IN ('initiated', 'paid', 'setup_in_progress', 'live', 'cancelled')),
  payment_proof_url text,
  payment_proof_uploaded_at timestamptz,
  amount numeric NOT NULL DEFAULT 3899,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE checkout_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "superadmin_all" ON checkout_leads
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' = 'superadmin'
    )
  );

-- Checkout lead status history
CREATE TABLE checkout_lead_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_lead_id uuid NOT NULL REFERENCES checkout_leads(id) ON DELETE CASCADE,
  old_status text,
  new_status text NOT NULL,
  changed_by uuid REFERENCES auth.users(id),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE checkout_lead_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "superadmin_all" ON checkout_lead_status_history
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' = 'superadmin'
    )
  );

-- Indexes
CREATE INDEX idx_checkout_leads_status ON checkout_leads(status);
CREATE INDEX idx_checkout_leads_reference ON checkout_leads(reference_number);
CREATE INDEX idx_checkout_leads_email ON checkout_leads(email);
CREATE INDEX idx_checkout_leads_created_at ON checkout_leads(created_at DESC);
CREATE INDEX idx_checkout_lead_history_lead_id ON checkout_lead_status_history(checkout_lead_id);
CREATE INDEX idx_platform_payment_methods_active ON platform_payment_methods(is_active, order_index);
```

- [ ] **Step 2: Apply migration**

Run: `npx supabase db push` (or apply via Supabase dashboard if using hosted)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260405000001_checkout_leads.sql
git commit -m "feat: add checkout_leads and platform_payment_methods tables"
```

---

### Task 2: TypeScript Types

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Add checkout lead types**

Add these interfaces at the end of the file, before the closing of the file (follow the existing pattern of interfaces in this file):

```typescript
// Checkout Leads (platform-level, not tenant-scoped)
export type CheckoutLeadStatus = 'initiated' | 'paid' | 'setup_in_progress' | 'live' | 'cancelled'

export interface CheckoutLead {
  id: string
  reference_number: string
  name: string
  email: string
  phone: string
  business_name: string
  notes: string | null
  selected_payment_method_id: string | null
  status: CheckoutLeadStatus
  payment_proof_url: string | null
  payment_proof_uploaded_at: string | null
  amount: number
  created_at: string
  updated_at: string
}

export interface CheckoutLeadWithPaymentMethod extends CheckoutLead {
  platform_payment_methods: PlatformPaymentMethod | null
}

export interface CheckoutLeadStatusHistory {
  id: string
  checkout_lead_id: string
  old_status: string | null
  new_status: string
  changed_by: string | null
  note: string | null
  created_at: string
}

export interface PlatformPaymentMethod {
  id: string
  name: string
  type: 'qr_code' | 'bank_transfer' | 'other'
  details: string | null
  qr_code_url: string | null
  is_active: boolean
  order_index: number
  created_at: string
  updated_at: string
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/database.ts
git commit -m "feat: add CheckoutLead and PlatformPaymentMethod types"
```

---

### Task 3: Reference Number Generator

**Files:**
- Create: `src/lib/checkout-leads/reference-number.ts`
- Create: `tests/unit/reference-number.test.ts`

- [ ] **Step 1: Write the test**

```typescript
import { generateReferenceNumber, SAFE_CHARS } from '@/lib/checkout-leads/reference-number'

describe('generateReferenceNumber', () => {
  it('returns format WN-YYYYMMDD-XXXX', () => {
    const ref = generateReferenceNumber()
    expect(ref).toMatch(/^WN-\d{8}-[A-Z2-9]{4}$/)
  })

  it('uses the current date', () => {
    const ref = generateReferenceNumber()
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    expect(ref).toContain(today)
  })

  it('random part uses only safe characters', () => {
    for (let i = 0; i < 50; i++) {
      const ref = generateReferenceNumber()
      const randomPart = ref.split('-')[2]
      for (const char of randomPart) {
        expect(SAFE_CHARS).toContain(char)
      }
    }
  })

  it('generates unique values', () => {
    const refs = new Set<string>()
    for (let i = 0; i < 100; i++) {
      refs.add(generateReferenceNumber())
    }
    // With 22^4 = 234,256 possibilities per day, 100 should all be unique
    expect(refs.size).toBe(100)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --testPathPattern="reference-number"`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// Excludes ambiguous characters: O, 0, I, 1, L
export const SAFE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function generateReferenceNumber(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const datePart = `${y}${m}${d}`

  let random = ''
  for (let i = 0; i < 4; i++) {
    random += SAFE_CHARS[Math.floor(Math.random() * SAFE_CHARS.length)]
  }

  return `WN-${datePart}-${random}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- --testPathPattern="reference-number"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/checkout-leads/reference-number.ts tests/unit/reference-number.test.ts
git commit -m "feat: add reference number generator for checkout leads"
```

---

### Task 4: Platform Payment Methods Service

**Files:**
- Create: `src/lib/checkout-leads/platform-payment-methods-service.ts`

- [ ] **Step 1: Write the service**

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import type { PlatformPaymentMethod } from '@/types/database'

export async function getActivePlatformPaymentMethods(): Promise<PlatformPaymentMethod[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('platform_payment_methods')
    .select('*')
    .eq('is_active', true)
    .order('order_index', { ascending: true })

  if (error) {
    console.error('Failed to fetch platform payment methods:', error)
    return []
  }
  return (data ?? []) as PlatformPaymentMethod[]
}

export async function getAllPlatformPaymentMethods(): Promise<PlatformPaymentMethod[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('platform_payment_methods')
    .select('*')
    .order('order_index', { ascending: true })

  if (error) {
    console.error('Failed to fetch platform payment methods:', error)
    return []
  }
  return (data ?? []) as PlatformPaymentMethod[]
}

export async function createPlatformPaymentMethod(input: {
  name: string
  type: 'qr_code' | 'bank_transfer' | 'other'
  details?: string
  qr_code_url?: string
}): Promise<{ data: PlatformPaymentMethod | null; error: string | null }> {
  const supabase = createAdminClient()

  // Get next order_index
  const { data: last } = await supabase
    .from('platform_payment_methods')
    .select('order_index')
    .order('order_index', { ascending: false })
    .limit(1)
    .single()

  const nextIndex = (last?.order_index ?? -1) + 1

  const { data, error } = await supabase
    .from('platform_payment_methods')
    .insert({
      name: input.name,
      type: input.type,
      details: input.details ?? null,
      qr_code_url: input.qr_code_url ?? null,
      order_index: nextIndex,
    })
    .select()
    .single()

  if (error) return { data: null, error: error.message }
  return { data: data as PlatformPaymentMethod, error: null }
}

export async function updatePlatformPaymentMethod(
  id: string,
  input: {
    name?: string
    type?: 'qr_code' | 'bank_transfer' | 'other'
    details?: string
    qr_code_url?: string | null
    is_active?: boolean
  }
): Promise<{ error: string | null }> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('platform_payment_methods')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)

  return { error: error?.message ?? null }
}

export async function deletePlatformPaymentMethod(id: string): Promise<{ error: string | null }> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('platform_payment_methods')
    .delete()
    .eq('id', id)

  return { error: error?.message ?? null }
}

export async function reorderPlatformPaymentMethods(
  orderedIds: string[]
): Promise<{ error: string | null }> {
  const supabase = createAdminClient()
  const updates = orderedIds.map((id, index) =>
    supabase
      .from('platform_payment_methods')
      .update({ order_index: index, updated_at: new Date().toISOString() })
      .eq('id', id)
  )

  const results = await Promise.all(updates)
  const firstError = results.find((r) => r.error)
  return { error: firstError?.error?.message ?? null }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/checkout-leads/platform-payment-methods-service.ts
git commit -m "feat: add platform payment methods service layer"
```

---

### Task 5: Checkout Leads Service

**Files:**
- Create: `src/lib/checkout-leads/checkout-leads-service.ts`

- [ ] **Step 1: Write the service**

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import { generateReferenceNumber } from './reference-number'
import type {
  CheckoutLead,
  CheckoutLeadStatus,
  CheckoutLeadStatusHistory,
  CheckoutLeadWithPaymentMethod,
} from '@/types/database'

export interface CreateCheckoutLeadInput {
  name: string
  email: string
  phone: string
  business_name: string
  notes?: string
  selected_payment_method_id: string
  amount?: number
}

interface MutationResult {
  error: string | null
}

// Create a checkout lead with collision-safe reference number
export async function createCheckoutLead(
  input: CreateCheckoutLeadInput
): Promise<{ data: CheckoutLead | null; error: string | null }> {
  const supabase = createAdminClient()

  // Try up to 5 times to generate a unique reference number
  for (let attempt = 0; attempt < 5; attempt++) {
    const referenceNumber = generateReferenceNumber()

    const { data, error } = await supabase
      .from('checkout_leads')
      .insert({
        reference_number: referenceNumber,
        name: input.name,
        email: input.email,
        phone: input.phone,
        business_name: input.business_name,
        notes: input.notes ?? null,
        selected_payment_method_id: input.selected_payment_method_id,
        amount: input.amount ?? 3899,
      })
      .select()
      .single()

    if (error) {
      // Unique violation on reference_number — retry
      if (error.code === '23505' && error.message.includes('reference_number')) {
        continue
      }
      return { data: null, error: error.message }
    }

    return { data: data as CheckoutLead, error: null }
  }

  return { data: null, error: 'Failed to generate unique reference number' }
}

// Get checkout lead by reference number (for confirmation page)
export async function getCheckoutLeadByRef(
  ref: string
): Promise<{ data: CheckoutLeadWithPaymentMethod | null; error: string | null }> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('checkout_leads')
    .select('*, platform_payment_methods(*)')
    .eq('reference_number', ref)
    .single()

  if (error) return { data: null, error: error.message }
  return { data: data as CheckoutLeadWithPaymentMethod, error: null }
}

// Update payment proof
export async function uploadPaymentProof(
  referenceNumber: string,
  paymentProofUrl: string
): Promise<MutationResult> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('checkout_leads')
    .update({
      payment_proof_url: paymentProofUrl,
      payment_proof_uploaded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('reference_number', referenceNumber)

  return { error: error?.message ?? null }
}

// Update status (superadmin)
export async function updateCheckoutLeadStatus(
  leadId: string,
  oldStatus: CheckoutLeadStatus | null,
  newStatus: CheckoutLeadStatus,
  changedBy?: string,
  note?: string
): Promise<MutationResult> {
  const supabase = createAdminClient()

  // Update the lead
  const { error: updateError } = await supabase
    .from('checkout_leads')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', leadId)

  if (updateError) return { error: updateError.message }

  // Insert history record
  const { error: historyError } = await supabase
    .from('checkout_lead_status_history')
    .insert({
      checkout_lead_id: leadId,
      old_status: oldStatus,
      new_status: newStatus,
      changed_by: changedBy ?? null,
      note: note ?? null,
    })

  if (historyError) {
    console.error('Failed to insert status history:', historyError)
  }

  return { error: null }
}

// List checkout leads (superadmin, paginated)
export interface GetCheckoutLeadsOptions {
  status?: CheckoutLeadStatus
  search?: string
  page?: number
  pageSize?: number
}

export async function getCheckoutLeads(
  options: GetCheckoutLeadsOptions = {}
): Promise<{ data: CheckoutLeadWithPaymentMethod[]; count: number; error: string | null }> {
  const { status, search, page = 1, pageSize = 20 } = options
  const supabase = createAdminClient()

  let query = supabase
    .from('checkout_leads')
    .select('*, platform_payment_methods(*)', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }

  if (search) {
    query = query.or(
      `name.ilike.%${search}%,email.ilike.%${search}%,business_name.ilike.%${search}%,reference_number.ilike.%${search}%`
    )
  }

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  query = query.range(from, to)

  const { data, count, error } = await query

  if (error) return { data: [], count: 0, error: error.message }
  return {
    data: (data ?? []) as CheckoutLeadWithPaymentMethod[],
    count: count ?? 0,
    error: null,
  }
}

// Get single checkout lead by ID (superadmin)
export async function getCheckoutLeadById(
  id: string
): Promise<{ data: CheckoutLeadWithPaymentMethod | null; error: string | null }> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('checkout_leads')
    .select('*, platform_payment_methods(*)')
    .eq('id', id)
    .single()

  if (error) return { data: null, error: error.message }
  return { data: data as CheckoutLeadWithPaymentMethod, error: null }
}

// Get status history for a checkout lead
export async function getCheckoutLeadHistory(
  leadId: string
): Promise<{ data: CheckoutLeadStatusHistory[]; error: string | null }> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('checkout_lead_status_history')
    .select('*')
    .eq('checkout_lead_id', leadId)
    .order('created_at', { ascending: false })

  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as CheckoutLeadStatusHistory[], error: null }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/checkout-leads/checkout-leads-service.ts
git commit -m "feat: add checkout leads service layer"
```

---

### Task 6: Checkout Leads Analytics

**Files:**
- Create: `src/lib/checkout-leads/checkout-leads-analytics.ts`

- [ ] **Step 1: Write the analytics module**

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import type { CheckoutLeadStatus } from '@/types/database'

export interface CheckoutLeadStats {
  totalLeads: number
  newThisWeek: number
  paidCount: number
  liveCount: number
  conversionRate: number
  statusBreakdown: Record<CheckoutLeadStatus, number>
}

function round1dp(n: number): number {
  return Math.round(n * 10) / 10
}

export async function getCheckoutLeadStats(): Promise<CheckoutLeadStats> {
  const supabase = createAdminClient()

  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const [totalResult, newThisWeekResult, allLeadsResult] = await Promise.all([
    supabase.from('checkout_leads').select('id', { count: 'exact', head: true }),
    supabase
      .from('checkout_leads')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', sevenDaysAgo.toISOString()),
    supabase.from('checkout_leads').select('status'),
  ])

  const totalLeads = totalResult.count ?? 0
  const newThisWeek = newThisWeekResult.count ?? 0

  // Build status breakdown from all leads
  const statusBreakdown: Record<CheckoutLeadStatus, number> = {
    initiated: 0,
    paid: 0,
    setup_in_progress: 0,
    live: 0,
    cancelled: 0,
  }

  for (const row of allLeadsResult.data ?? []) {
    const s = row.status as CheckoutLeadStatus
    if (s in statusBreakdown) {
      statusBreakdown[s]++
    }
  }

  const paidCount = statusBreakdown.paid
  const liveCount = statusBreakdown.live

  // Conversion rate: leads that reached "live" out of total (excluding cancelled)
  const nonCancelled = totalLeads - statusBreakdown.cancelled
  const conversionRate = nonCancelled > 0 ? round1dp((liveCount / nonCancelled) * 100) : 0

  return {
    totalLeads,
    newThisWeek,
    paidCount,
    liveCount,
    conversionRate,
    statusBreakdown,
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/checkout-leads/checkout-leads-analytics.ts
git commit -m "feat: add checkout leads analytics"
```

---

### Task 7: Server Actions

**Files:**
- Create: `src/app/actions/checkout-leads.ts`

- [ ] **Step 1: Write the server actions**

```typescript
'use server'

import {
  createCheckoutLead,
  getCheckoutLeads,
  getCheckoutLeadById,
  getCheckoutLeadByRef,
  updateCheckoutLeadStatus,
  uploadPaymentProof,
  getCheckoutLeadHistory,
} from '@/lib/checkout-leads/checkout-leads-service'
import {
  getAllPlatformPaymentMethods,
  getActivePlatformPaymentMethods,
  createPlatformPaymentMethod,
  updatePlatformPaymentMethod,
  deletePlatformPaymentMethod,
  reorderPlatformPaymentMethods,
} from '@/lib/checkout-leads/platform-payment-methods-service'
import type { CheckoutLeadStatus } from '@/types/database'

// ---- Checkout Leads ----

export async function submitCheckoutForm(input: {
  name: string
  email: string
  phone: string
  business_name: string
  notes?: string
  selected_payment_method_id: string
}) {
  return createCheckoutLead(input)
}

export async function fetchCheckoutLeads(options: {
  status?: CheckoutLeadStatus
  search?: string
  page?: number
}) {
  return getCheckoutLeads(options)
}

export async function fetchCheckoutLeadDetail(id: string) {
  const [lead, history] = await Promise.all([
    getCheckoutLeadById(id),
    getCheckoutLeadHistory(id),
  ])
  return { lead: lead.data, history: history.data }
}

export async function fetchCheckoutLeadByRef(ref: string) {
  return getCheckoutLeadByRef(ref)
}

export async function changeCheckoutLeadStatus(
  leadId: string,
  oldStatus: string,
  newStatus: CheckoutLeadStatus,
  userId?: string,
  note?: string
) {
  return updateCheckoutLeadStatus(
    leadId,
    oldStatus as CheckoutLeadStatus,
    newStatus,
    userId,
    note
  )
}

export async function submitPaymentProof(referenceNumber: string, paymentProofUrl: string) {
  return uploadPaymentProof(referenceNumber, paymentProofUrl)
}

// ---- Platform Payment Methods ----

export async function fetchActivePlatformPaymentMethods() {
  return getActivePlatformPaymentMethods()
}

export async function fetchAllPlatformPaymentMethods() {
  return getAllPlatformPaymentMethods()
}

export async function addPlatformPaymentMethod(input: {
  name: string
  type: 'qr_code' | 'bank_transfer' | 'other'
  details?: string
  qr_code_url?: string
}) {
  return createPlatformPaymentMethod(input)
}

export async function editPlatformPaymentMethod(
  id: string,
  input: {
    name?: string
    type?: 'qr_code' | 'bank_transfer' | 'other'
    details?: string
    qr_code_url?: string | null
    is_active?: boolean
  }
) {
  return updatePlatformPaymentMethod(id, input)
}

export async function removePlatformPaymentMethod(id: string) {
  return deletePlatformPaymentMethod(id)
}

export async function savePlatformPaymentMethodOrder(orderedIds: string[]) {
  return reorderPlatformPaymentMethods(orderedIds)
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/actions/checkout-leads.ts
git commit -m "feat: add checkout leads and platform payment methods server actions"
```

---

### Task 8: Revamp Checkout Form

**Files:**
- Modify: `src/components/landing/checkout-form.tsx`

- [ ] **Step 1: Read the current file**

Read `src/components/landing/checkout-form.tsx` to get the exact current content.

- [ ] **Step 2: Rewrite the checkout form**

Replace the entire file with the updated version. Key changes:
- Replace hardcoded GCash/BPI dropdown with dynamic payment method radio cards fetched from `platform_payment_methods`
- On submit: call `submitCheckoutForm` server action instead of opening Messenger
- Redirect to `/checkout/confirmation/[referenceNumber]` after successful submission
- Keep the same visual style, field layout, and Zod validation

```typescript
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { z } from 'zod'
import { toast } from 'sonner'
import { Loader2, CreditCard, QrCode, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { submitCheckoutForm, fetchActivePlatformPaymentMethods } from '@/app/actions/checkout-leads'
import type { PlatformPaymentMethod } from '@/types/database'

const checkoutFormSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  phone: z
    .string()
    .min(10, 'Phone number must be at least 10 digits')
    .regex(/^[0-9]+$/, 'Phone number must contain only digits'),
  businessName: z.string().min(2, 'Business name must be at least 2 characters'),
  paymentMethodId: z.string().min(1, 'Please select a payment method'),
  notes: z.string().optional(),
})

type FormData = z.infer<typeof checkoutFormSchema>

const PAYMENT_TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  qr_code: QrCode,
  bank_transfer: Building2,
  other: CreditCard,
}

export function CheckoutForm() {
  const router = useRouter()
  const [paymentMethods, setPaymentMethods] = useState<PlatformPaymentMethod[]>([])
  const [isLoadingMethods, setIsLoadingMethods] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    phone: '',
    businessName: '',
    paymentMethodId: '',
    notes: '',
  })
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({})

  useEffect(() => {
    fetchActivePlatformPaymentMethods().then((methods) => {
      setPaymentMethods(methods)
      // Auto-select if only one method
      if (methods.length === 1) {
        setFormData((prev) => ({ ...prev, paymentMethodId: methods[0].id }))
      }
      setIsLoadingMethods(false)
    })
  }, [])

  const handleChange = (field: keyof FormData, value: string) => {
    const newValue = field === 'phone' ? value.replace(/\D/g, '') : value
    setFormData((prev) => ({ ...prev, [field]: newValue }))
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }))
    }
  }

  const validateForm = (): boolean => {
    const result = checkoutFormSchema.safeParse(formData)
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof FormData, string>> = {}
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof FormData
        if (!fieldErrors[field]) {
          fieldErrors[field] = issue.message
        }
      }
      setErrors(fieldErrors)
      return false
    }
    setErrors({})
    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) return

    setIsSubmitting(true)
    try {
      const result = await submitCheckoutForm({
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        business_name: formData.businessName,
        selected_payment_method_id: formData.paymentMethodId,
        notes: formData.notes || undefined,
      })

      if (result.error) {
        toast.error(result.error)
        return
      }

      if (result.data) {
        router.push(`/checkout/confirmation/${result.data.reference_number}`)
      }
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Name */}
      <div className="space-y-2">
        <Label htmlFor="name">Full Name</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => handleChange('name', e.target.value)}
          placeholder="Juan dela Cruz"
        />
        {errors.name && <p className="text-sm text-red-500">{errors.name}</p>}
      </div>

      {/* Email */}
      <div className="space-y-2">
        <Label htmlFor="email">Email Address</Label>
        <Input
          id="email"
          type="email"
          value={formData.email}
          onChange={(e) => handleChange('email', e.target.value)}
          placeholder="juan@example.com"
        />
        {errors.email && <p className="text-sm text-red-500">{errors.email}</p>}
      </div>

      {/* Phone */}
      <div className="space-y-2">
        <Label htmlFor="phone">Phone Number</Label>
        <Input
          id="phone"
          value={formData.phone}
          onChange={(e) => handleChange('phone', e.target.value)}
          placeholder="09XXXXXXXXX"
        />
        {errors.phone && <p className="text-sm text-red-500">{errors.phone}</p>}
      </div>

      {/* Business Name */}
      <div className="space-y-2">
        <Label htmlFor="businessName">Business Name</Label>
        <Input
          id="businessName"
          value={formData.businessName}
          onChange={(e) => handleChange('businessName', e.target.value)}
          placeholder="Juan's Kitchen"
        />
        {errors.businessName && <p className="text-sm text-red-500">{errors.businessName}</p>}
      </div>

      {/* Payment Method - Radio Cards */}
      <div className="space-y-2">
        <Label>Payment Method</Label>
        {isLoadingMethods ? (
          <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading payment methods...
          </div>
        ) : paymentMethods.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">
            No payment methods available. Please contact us on Messenger.
          </p>
        ) : (
          <div className="grid gap-3">
            {paymentMethods.map((method) => {
              const Icon = PAYMENT_TYPE_ICONS[method.type] ?? CreditCard
              const isSelected = formData.paymentMethodId === method.id
              return (
                <button
                  key={method.id}
                  type="button"
                  onClick={() => handleChange('paymentMethodId', method.id)}
                  className={`flex items-center gap-3 rounded-lg border-2 p-4 text-left transition-all ${
                    isSelected
                      ? 'border-orange-500 bg-orange-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                      isSelected ? 'bg-orange-100' : 'bg-gray-100'
                    }`}
                  >
                    <Icon
                      className={`h-5 w-5 ${isSelected ? 'text-orange-600' : 'text-gray-500'}`}
                    />
                  </div>
                  <div>
                    <p className="font-medium">{method.name}</p>
                    {method.details && (
                      <p className="text-sm text-muted-foreground">{method.details}</p>
                    )}
                  </div>
                  <div className="ml-auto">
                    <div
                      className={`h-5 w-5 rounded-full border-2 ${
                        isSelected
                          ? 'border-orange-500 bg-orange-500'
                          : 'border-gray-300'
                      }`}
                    >
                      {isSelected && (
                        <svg viewBox="0 0 20 20" fill="white" className="h-full w-full p-0.5">
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
        {errors.paymentMethodId && (
          <p className="text-sm text-red-500">{errors.paymentMethodId}</p>
        )}
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label htmlFor="notes">Additional Notes (Optional)</Label>
        <Textarea
          id="notes"
          value={formData.notes}
          onChange={(e) => handleChange('notes', e.target.value)}
          placeholder="Any special requests or questions..."
          rows={3}
        />
      </div>

      {/* Submit */}
      <Button
        type="submit"
        disabled={isSubmitting || isLoadingMethods}
        className="w-full bg-orange-500 py-6 text-lg font-bold text-white hover:bg-orange-600"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Processing...
          </>
        ) : (
          'Complete Purchase — P3,899'
        )}
      </Button>
    </form>
  )
}
```

- [ ] **Step 3: Run lint to check for errors**

Run: `npm run lint`

- [ ] **Step 4: Commit**

```bash
git add src/components/landing/checkout-form.tsx
git commit -m "feat: revamp checkout form with dynamic payment methods and lead capture"
```

---

### Task 9: Confirmation Page

**Files:**
- Create: `src/app/checkout/confirmation/[ref]/page.tsx`

- [ ] **Step 1: Write the confirmation page**

```typescript
import { notFound } from 'next/navigation'
import { fetchCheckoutLeadByRef } from '@/app/actions/checkout-leads'
import { ConfirmationContent } from './confirmation-content'

interface ConfirmationPageProps {
  params: Promise<{ ref: string }>
}

export default async function ConfirmationPage({ params }: ConfirmationPageProps) {
  const { ref } = await params
  const result = await fetchCheckoutLeadByRef(ref)

  if (!result.data) {
    notFound()
  }

  return <ConfirmationContent lead={result.data} />
}
```

- [ ] **Step 2: Create the client component**

Create: `src/app/checkout/confirmation/[ref]/confirmation-content.tsx`

```typescript
'use client'

import { useState } from 'react'
import { Check, Copy, Upload, Loader2, MessageCircle, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { submitPaymentProof } from '@/app/actions/checkout-leads'
import type { CheckoutLeadWithPaymentMethod } from '@/types/database'

const FACEBOOK_PAGE_USERNAME = 'WebNegosyoOfficial'

interface ConfirmationContentProps {
  lead: CheckoutLeadWithPaymentMethod
}

export function ConfirmationContent({ lead }: ConfirmationContentProps) {
  const [copied, setCopied] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [proofUploaded, setProofUploaded] = useState(!!lead.payment_proof_url)
  const [proofUrl, setProofUrl] = useState(lead.payment_proof_url ?? '')

  const paymentMethod = lead.platform_payment_methods

  const handleCopyRef = async () => {
    await navigator.clipboard.writeText(lead.reference_number)
    setCopied(true)
    toast.success('Reference number copied!')
    setTimeout(() => setCopied(false), 2000)
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const validTypes = ['image/png', 'image/jpg', 'image/jpeg', 'image/webp']
    if (!validTypes.includes(file.type)) {
      toast.error('Please upload a PNG, JPG, or WEBP image.')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File too large. Maximum size is 5MB.')
      return
    }

    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
    const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET

    if (!cloudName || !uploadPreset) {
      toast.error('Upload not configured. Please contact us on Messenger.')
      return
    }

    setIsUploading(true)
    setUploadProgress(0)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('upload_preset', uploadPreset)
    formData.append('folder', 'checkout-proofs')

    const xhr = new XMLHttpRequest()

    xhr.upload.addEventListener('progress', (ev) => {
      if (ev.lengthComputable) {
        setUploadProgress(Math.round((ev.loaded / ev.total) * 100))
      }
    })

    xhr.addEventListener('load', async () => {
      if (xhr.status === 200) {
        const response = JSON.parse(xhr.responseText)
        const url = response.secure_url as string

        // Save proof URL to the checkout lead
        const result = await submitPaymentProof(lead.reference_number, url)
        if (result.error) {
          toast.error('Failed to save payment proof. Please try again.')
        } else {
          setProofUrl(url)
          setProofUploaded(true)
          toast.success('Payment proof uploaded successfully!')
        }
      } else {
        toast.error('Upload failed. Please try again.')
      }
      setIsUploading(false)
      setUploadProgress(0)
    })

    xhr.addEventListener('error', () => {
      toast.error('Upload failed. Please check your connection.')
      setIsUploading(false)
      setUploadProgress(0)
    })

    xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`)
    xhr.send(formData)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-4">
          <Link href="/checkout" className="text-gray-500 hover:text-gray-700">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-lg font-bold">Order Confirmation</h1>
        </div>
      </header>

      <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
        {/* Reference Number Banner */}
        <div className="rounded-xl bg-white p-6 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
            <Check className="h-7 w-7 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">Order Submitted!</h2>
          <p className="mt-1 text-sm text-gray-500">Your reference number</p>
          <div className="mt-3 flex items-center justify-center gap-2">
            <span className="rounded-lg bg-gray-100 px-5 py-3 font-mono text-2xl font-bold tracking-wider text-gray-900">
              {lead.reference_number}
            </span>
            <button
              onClick={handleCopyRef}
              className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              {copied ? <Check className="h-5 w-5 text-green-500" /> : <Copy className="h-5 w-5" />}
            </button>
          </div>
          <p className="mt-2 text-sm text-gray-500">
            Amount: <span className="font-semibold text-gray-900">P{lead.amount.toLocaleString()}</span>
          </p>
        </div>

        {/* Payment Instructions */}
        {paymentMethod && (
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-gray-900">Payment Instructions</h3>
            <p className="mt-1 text-sm text-gray-500">
              Send payment to {paymentMethod.name}
            </p>

            <div className="mt-4 space-y-4">
              {/* QR Code */}
              {paymentMethod.qr_code_url && (
                <div className="flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={paymentMethod.qr_code_url}
                    alt={`${paymentMethod.name} QR Code`}
                    className="h-56 w-56 rounded-lg border object-contain p-2"
                  />
                </div>
              )}

              {/* Account Details */}
              {paymentMethod.details && (
                <div className="rounded-lg bg-gray-50 p-4 text-sm text-gray-700 whitespace-pre-line">
                  {paymentMethod.details}
                </div>
              )}

              {/* Steps */}
              <ol className="space-y-2 text-sm text-gray-600">
                <li className="flex gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-600">
                    1
                  </span>
                  {paymentMethod.qr_code_url
                    ? 'Scan the QR code or transfer to the account above'
                    : 'Transfer to the account above'}
                </li>
                <li className="flex gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-600">
                    2
                  </span>
                  Upload your payment proof below
                </li>
                <li className="flex gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-600">
                    3
                  </span>
                  We&apos;ll set you up within 48 hours
                </li>
              </ol>
            </div>
          </div>
        )}

        {/* Payment Proof Upload */}
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900">Upload Payment Proof</h3>
          <p className="mt-1 text-sm text-gray-500">
            Upload a screenshot of your payment confirmation
          </p>

          <div className="mt-4">
            {proofUploaded && proofUrl ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-700">
                  <Check className="h-4 w-4" />
                  Payment proof uploaded successfully!
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={proofUrl}
                  alt="Payment proof"
                  className="max-h-64 rounded-lg border object-contain"
                />
                {/* Allow re-upload */}
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-orange-600 hover:text-orange-700">
                  <Upload className="h-4 w-4" />
                  Upload a different screenshot
                  <input
                    type="file"
                    accept="image/png,image/jpg,image/jpeg,image/webp"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </label>
              </div>
            ) : (
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-8 transition-colors hover:border-orange-300 hover:bg-orange-50/50">
                {isUploading ? (
                  <>
                    <Loader2 className="mb-2 h-8 w-8 animate-spin text-orange-500" />
                    <p className="text-sm font-medium text-gray-700">Uploading {uploadProgress}%</p>
                    <div className="mt-2 h-2 w-48 overflow-hidden rounded-full bg-gray-200">
                      <div
                        className="h-full bg-orange-500 transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <Upload className="mb-2 h-8 w-8 text-gray-400" />
                    <p className="text-sm font-medium text-gray-700">
                      Click to upload or drag and drop
                    </p>
                    <p className="mt-1 text-xs text-gray-500">PNG, JPG, or WEBP up to 5MB</p>
                  </>
                )}
                <input
                  type="file"
                  accept="image/png,image/jpg,image/jpeg,image/webp"
                  onChange={handleFileSelect}
                  disabled={isUploading}
                  className="hidden"
                />
              </label>
            )}
          </div>
        </div>

        {/* Messenger Link */}
        <div className="rounded-xl bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-gray-500">Have questions or need help?</p>
          <a
            href={`https://m.me/${FACEBOOK_PAGE_USERNAME}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <MessageCircle className="h-4 w-4" />
            Chat with us on Messenger
          </a>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Run lint**

Run: `npm run lint`

- [ ] **Step 4: Commit**

```bash
git add src/app/checkout/confirmation/
git commit -m "feat: add checkout confirmation page with payment proof upload"
```

---

### Task 10: Superadmin Sidebar Update

**Files:**
- Modify: `src/components/superadmin/superadmin-sidebar.tsx`

- [ ] **Step 1: Read the current sidebar file**

Read `src/components/superadmin/superadmin-sidebar.tsx`.

- [ ] **Step 2: Add the Checkout Leads nav item**

Add the `ShoppingCart` icon import from `lucide-react` and insert a new item after the "Leads" entry:

```typescript
{ label: 'Checkout Leads', href: '/superadmin/checkout-leads', icon: ShoppingCart },
```

The full array should be:
```typescript
const sidebarItems: SidebarItem[] = [
  { label: 'Dashboard', href: '/superadmin', icon: LayoutDashboard },
  { label: 'Restaurants', href: '/superadmin/tenants', icon: Store },
  { label: 'Analytics', href: '/superadmin/analytics', icon: BarChart3 },
  { label: 'Leads', href: '/superadmin/leads', icon: Users },
  { label: 'Checkout Leads', href: '/superadmin/checkout-leads', icon: ShoppingCart },
  { label: 'Settings', href: '/superadmin/settings', icon: Settings },
]
```

- [ ] **Step 3: Commit**

```bash
git add src/components/superadmin/superadmin-sidebar.tsx
git commit -m "feat: add Checkout Leads to superadmin sidebar"
```

---

### Task 11: Checkout Leads Dashboard — Stats & Pipeline Components

**Files:**
- Create: `src/app/superadmin/checkout-leads/components/checkout-lead-analytics.tsx`
- Create: `src/app/superadmin/checkout-leads/components/checkout-lead-pipeline.tsx`

- [ ] **Step 1: Write the analytics (stats cards) component**

```typescript
import { Users, TrendingUp, CreditCard, Rocket } from 'lucide-react'
import type { CheckoutLeadStats } from '@/lib/checkout-leads/checkout-leads-analytics'

interface CheckoutLeadAnalyticsProps {
  stats: CheckoutLeadStats
}

export function CheckoutLeadAnalytics({ stats }: CheckoutLeadAnalyticsProps) {
  const cards = [
    {
      title: 'Total Leads',
      value: stats.totalLeads,
      icon: Users,
      iconBg: 'bg-blue-50',
      iconColor: 'text-blue-600',
      subtitle: `${stats.newThisWeek} this week`,
      subtitleColor: 'text-green-600',
      prefix: stats.newThisWeek > 0 ? '+ ' : '',
    },
    {
      title: 'Paid',
      value: stats.paidCount,
      icon: CreditCard,
      iconBg: 'bg-amber-50',
      iconColor: 'text-amber-600',
      subtitle: 'Awaiting setup',
      subtitleColor: 'text-amber-600',
    },
    {
      title: 'Live',
      value: stats.liveCount,
      icon: Rocket,
      iconBg: 'bg-green-50',
      iconColor: 'text-green-600',
      subtitle: 'Setup complete',
      subtitleColor: 'text-green-600',
    },
    {
      title: 'Conversion Rate',
      value: `${stats.conversionRate}%`,
      icon: TrendingUp,
      iconBg: 'bg-purple-50',
      iconColor: 'text-purple-600',
      subtitle: 'Initiated to live',
      subtitleColor: 'text-purple-600',
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map((card) => (
        <div key={card.title} className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">{card.title}</p>
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${card.iconBg}`}>
              <card.icon className={`h-4.5 w-4.5 ${card.iconColor}`} />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold">{card.prefix ?? ''}{card.value}</p>
          <p className={`mt-1 text-xs ${card.subtitleColor}`}>{card.subtitle}</p>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Write the pipeline component**

```typescript
import type { CheckoutLeadStatus } from '@/types/database'

interface CheckoutLeadPipelineProps {
  statusBreakdown: Record<CheckoutLeadStatus, number>
}

const PIPELINE_SEGMENTS: { status: CheckoutLeadStatus; label: string; color: string }[] = [
  { status: 'initiated', label: 'Initiated', color: 'bg-blue-500' },
  { status: 'paid', label: 'Paid', color: 'bg-amber-500' },
  { status: 'setup_in_progress', label: 'Setting Up', color: 'bg-purple-500' },
  { status: 'live', label: 'Live', color: 'bg-green-500' },
  { status: 'cancelled', label: 'Cancelled', color: 'bg-zinc-300' },
]

export function CheckoutLeadPipeline({ statusBreakdown }: CheckoutLeadPipelineProps) {
  const total = Object.values(statusBreakdown).reduce((sum, n) => sum + n, 0)

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Pipeline</h3>
        <span className="text-xs text-muted-foreground">{total} total</span>
      </div>

      {/* Bar */}
      <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
        {PIPELINE_SEGMENTS.map((seg) => {
          const count = statusBreakdown[seg.status]
          if (count === 0) return null
          return <div key={seg.status} className={seg.color} style={{ flex: count }} />
        })}
        {total === 0 && <div className="flex-1 bg-gray-100" />}
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
        {PIPELINE_SEGMENTS.map((seg) => (
          <div key={seg.status} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className={`h-2.5 w-2.5 rounded-full ${seg.color}`} />
            <span>{seg.label}</span>
            <span className="font-medium text-foreground">{statusBreakdown[seg.status]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/superadmin/checkout-leads/components/checkout-lead-analytics.tsx src/app/superadmin/checkout-leads/components/checkout-lead-pipeline.tsx
git commit -m "feat: add checkout lead analytics and pipeline components"
```

---

### Task 12: Checkout Leads Dashboard — Table Component

**Files:**
- Create: `src/app/superadmin/checkout-leads/components/checkout-leads-table.tsx`
- Create: `src/app/superadmin/checkout-leads/components/checkout-lead-status-badge.tsx`

- [ ] **Step 1: Write the status badge component**

```typescript
import type { CheckoutLeadStatus } from '@/types/database'

const STATUS_CONFIG: Record<CheckoutLeadStatus, { label: string; classes: string }> = {
  initiated: { label: 'Initiated', classes: 'bg-blue-50 text-blue-700 border-blue-200' },
  paid: { label: 'Paid', classes: 'bg-amber-50 text-amber-700 border-amber-200' },
  setup_in_progress: { label: 'Setting Up', classes: 'bg-purple-50 text-purple-700 border-purple-200' },
  live: { label: 'Live', classes: 'bg-green-50 text-green-700 border-green-200' },
  cancelled: { label: 'Cancelled', classes: 'bg-zinc-50 text-zinc-500 border-zinc-200' },
}

export function CheckoutLeadStatusBadge({ status }: { status: CheckoutLeadStatus }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.initiated
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${config.classes}`}>
      {config.label}
    </span>
  )
}
```

- [ ] **Step 2: Write the table component**

```typescript
'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, Download, ImageIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { fetchCheckoutLeads } from '@/app/actions/checkout-leads'
import { CheckoutLeadStatusBadge } from './checkout-lead-status-badge'
import { CheckoutLeadDetailPanel } from './checkout-lead-detail-panel'
import type { CheckoutLeadStatus, CheckoutLeadWithPaymentMethod } from '@/types/database'

const PAGE_SIZE = 20

const STATUS_TABS: { value: CheckoutLeadStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'initiated', label: 'Initiated' },
  { value: 'paid', label: 'Paid' },
  { value: 'setup_in_progress', label: 'Setting Up' },
  { value: 'live', label: 'Live' },
  { value: 'cancelled', label: 'Cancelled' },
]

interface CheckoutLeadsTableProps {
  initialLeads: CheckoutLeadWithPaymentMethod[]
  initialCount: number
}

export function CheckoutLeadsTable({ initialLeads, initialCount }: CheckoutLeadsTableProps) {
  const [leads, setLeads] = useState(initialLeads)
  const [count, setCount] = useState(initialCount)
  const [statusFilter, setStatusFilter] = useState<CheckoutLeadStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const loadLeads = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await fetchCheckoutLeads({
        status: statusFilter === 'all' ? undefined : statusFilter,
        search: debouncedSearch || undefined,
        page,
      })
      setLeads(result.data)
      setCount(result.count)
    } finally {
      setIsLoading(false)
    }
  }, [statusFilter, debouncedSearch, page])

  useEffect(() => {
    loadLeads()
  }, [loadLeads])

  const totalPages = Math.ceil(count / PAGE_SIZE)

  function handleExportCSV() {
    const headers = ['Reference', 'Name', 'Email', 'Phone', 'Business', 'Payment Method', 'Status', 'Amount', 'Date']
    const rows = leads.map((lead) => [
      lead.reference_number,
      `"${lead.name.replace(/"/g, '""')}"`,
      lead.email,
      lead.phone,
      `"${lead.business_name.replace(/"/g, '""')}"`,
      lead.platform_payment_methods?.name ?? '',
      lead.status,
      lead.amount,
      new Date(lead.created_at).toLocaleDateString(),
    ])
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `checkout-leads-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <div className="rounded-xl border bg-white shadow-sm">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, ref..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Export CSV
          </Button>
        </div>

        {/* Status Tabs */}
        <div className="flex gap-1 border-b px-4 pt-2">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => { setStatusFilter(tab.value); setPage(1) }}
              className={`rounded-t-md px-3 py-2 text-xs font-medium transition-colors ${
                statusFilter === tab.value
                  ? 'border-b-2 border-orange-500 text-orange-600'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                <th className="px-4 py-3">Ref #</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Business</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Proof</th>
                <th className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody className={isLoading ? 'opacity-50' : ''}>
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    No checkout leads found
                  </td>
                </tr>
              ) : (
                leads.map((lead) => (
                  <tr
                    key={lead.id}
                    onClick={() => setSelectedLeadId(lead.id)}
                    className="cursor-pointer border-b transition-colors hover:bg-muted/30"
                  >
                    <td className="px-4 py-3 font-mono text-xs font-medium">
                      {lead.reference_number}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{lead.name}</div>
                      <div className="text-xs text-muted-foreground">{lead.email}</div>
                    </td>
                    <td className="px-4 py-3">{lead.business_name}</td>
                    <td className="px-4 py-3 text-xs">
                      {lead.platform_payment_methods?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <CheckoutLeadStatusBadge status={lead.status} />
                    </td>
                    <td className="px-4 py-3">
                      {lead.payment_proof_url ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-600">
                          <ImageIcon className="h-3.5 w-3.5" />
                          Uploaded
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(lead.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, count)} of {count}
            </p>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Panel */}
      <CheckoutLeadDetailPanel
        leadId={selectedLeadId}
        open={!!selectedLeadId}
        onOpenChange={(open) => { if (!open) setSelectedLeadId(null) }}
        onStatusChange={loadLeads}
      />
    </>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/superadmin/checkout-leads/components/checkout-leads-table.tsx src/app/superadmin/checkout-leads/components/checkout-lead-status-badge.tsx
git commit -m "feat: add checkout leads table and status badge components"
```

---

### Task 13: Checkout Leads Dashboard — Detail Panel

**Files:**
- Create: `src/app/superadmin/checkout-leads/components/checkout-lead-detail-panel.tsx`

- [ ] **Step 1: Write the detail panel**

```typescript
'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Mail, Phone, Building2, FileText, Clock, ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { fetchCheckoutLeadDetail, changeCheckoutLeadStatus } from '@/app/actions/checkout-leads'
import { CheckoutLeadStatusBadge } from './checkout-lead-status-badge'
import type { CheckoutLeadStatus, CheckoutLeadWithPaymentMethod, CheckoutLeadStatusHistory } from '@/types/database'

const ALL_STATUSES: { value: CheckoutLeadStatus; label: string }[] = [
  { value: 'initiated', label: 'Initiated' },
  { value: 'paid', label: 'Paid' },
  { value: 'setup_in_progress', label: 'Setting Up' },
  { value: 'live', label: 'Live' },
  { value: 'cancelled', label: 'Cancelled' },
]

interface CheckoutLeadDetailPanelProps {
  leadId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onStatusChange: () => void
}

export function CheckoutLeadDetailPanel({
  leadId,
  open,
  onOpenChange,
  onStatusChange,
}: CheckoutLeadDetailPanelProps) {
  const [lead, setLead] = useState<CheckoutLeadWithPaymentMethod | null>(null)
  const [history, setHistory] = useState<CheckoutLeadStatusHistory[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isChangingStatus, setIsChangingStatus] = useState(false)
  const [statusNote, setStatusNote] = useState('')

  const loadDetail = useCallback(async () => {
    if (!leadId) return
    setIsLoading(true)
    try {
      const result = await fetchCheckoutLeadDetail(leadId)
      setLead(result.lead ?? null)
      setHistory(result.history ?? [])
    } finally {
      setIsLoading(false)
    }
  }, [leadId])

  useEffect(() => {
    if (open && leadId) {
      loadDetail()
    }
  }, [open, leadId, loadDetail])

  async function handleStatusChange(newStatus: CheckoutLeadStatus) {
    if (!lead || newStatus === lead.status || isChangingStatus) return
    setIsChangingStatus(true)
    try {
      const result = await changeCheckoutLeadStatus(
        lead.id,
        lead.status,
        newStatus,
        undefined,
        statusNote || undefined
      )
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(`Status changed to ${newStatus}`)
        setStatusNote('')
        await loadDetail()
        onStatusChange()
      }
    } finally {
      setIsChangingStatus(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Checkout Lead Details</SheetTitle>
        </SheetHeader>

        {isLoading || !lead ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {/* Reference & Amount */}
            <div className="rounded-lg bg-muted/50 p-4">
              <p className="text-xs text-muted-foreground">Reference Number</p>
              <p className="font-mono text-lg font-bold">{lead.reference_number}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Amount: <span className="font-medium text-foreground">P{lead.amount.toLocaleString()}</span>
              </p>
            </div>

            {/* Contact Info */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Contact Information</h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{lead.business_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-4 w-4 text-center text-muted-foreground">👤</span>
                  <span>{lead.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <a href={`mailto:${lead.email}`} className="text-blue-600 hover:underline">{lead.email}</a>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{lead.phone}</span>
                </div>
                {lead.notes && (
                  <div className="flex items-start gap-2">
                    <FileText className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">{lead.notes}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Payment Method */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Payment Method</h4>
              <p className="text-sm">
                {lead.platform_payment_methods?.name ?? 'Unknown'}
              </p>
            </div>

            {/* Payment Proof */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Payment Proof</h4>
              {lead.payment_proof_url ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-green-600">
                    <ImageIcon className="h-3.5 w-3.5" />
                    Uploaded {lead.payment_proof_uploaded_at
                      ? new Date(lead.payment_proof_uploaded_at).toLocaleString()
                      : ''}
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={lead.payment_proof_url}
                    alt="Payment proof"
                    className="max-h-64 rounded-lg border object-contain"
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No proof uploaded yet</p>
              )}
            </div>

            {/* Status Changer */}
            <div className="space-y-3 rounded-lg border p-4">
              <h4 className="text-sm font-semibold">Change Status</h4>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Current:</span>
                <CheckoutLeadStatusBadge status={lead.status} />
              </div>
              <Select
                value={lead.status}
                onValueChange={(val) => handleStatusChange(val as CheckoutLeadStatus)}
                disabled={isChangingStatus}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="space-y-1.5">
                <Label className="text-xs">Note (optional)</Label>
                <Textarea
                  value={statusNote}
                  onChange={(e) => setStatusNote(e.target.value)}
                  placeholder="Add a note about this status change..."
                  rows={2}
                  className="text-sm"
                />
              </div>

              {isChangingStatus && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Updating status...
                </div>
              )}
            </div>

            {/* Status History */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Status History</h4>
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">No status changes yet</p>
              ) : (
                <div className="space-y-2">
                  {history.map((entry) => (
                    <div key={entry.id} className="flex items-start gap-2 text-xs">
                      <Clock className="mt-0.5 h-3 w-3 text-muted-foreground" />
                      <div>
                        <span className="text-muted-foreground">
                          {entry.old_status ?? 'new'} → {entry.new_status}
                        </span>
                        {entry.note && (
                          <p className="mt-0.5 text-muted-foreground italic">&quot;{entry.note}&quot;</p>
                        )}
                        <p className="text-muted-foreground/70">
                          {new Date(entry.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Timestamps */}
            <div className="text-xs text-muted-foreground">
              <p>Created: {new Date(lead.created_at).toLocaleString()}</p>
              <p>Updated: {new Date(lead.updated_at).toLocaleString()}</p>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/superadmin/checkout-leads/components/checkout-lead-detail-panel.tsx
git commit -m "feat: add checkout lead detail panel with status management"
```

---

### Task 14: Checkout Leads Dashboard — Main Page

**Files:**
- Create: `src/app/superadmin/checkout-leads/page.tsx`

- [ ] **Step 1: Write the main dashboard page**

```typescript
import { Suspense } from 'react'
import { getCheckoutLeadStats } from '@/lib/checkout-leads/checkout-leads-analytics'
import { getCheckoutLeads } from '@/lib/checkout-leads/checkout-leads-service'
import { CheckoutLeadAnalytics } from './components/checkout-lead-analytics'
import { CheckoutLeadPipeline } from './components/checkout-lead-pipeline'
import { CheckoutLeadsTable } from './components/checkout-leads-table'

export default async function CheckoutLeadsPage() {
  const [stats, leadsResult] = await Promise.all([
    getCheckoutLeadStats(),
    getCheckoutLeads({ page: 1, pageSize: 20 }),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Checkout Leads</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Track Smart Menu purchases and payment status
        </p>
      </div>

      <CheckoutLeadAnalytics stats={stats} />
      <CheckoutLeadPipeline statusBreakdown={stats.statusBreakdown} />

      <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-muted" />}>
        <CheckoutLeadsTable
          initialLeads={leadsResult.data}
          initialCount={leadsResult.count}
        />
      </Suspense>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/superadmin/checkout-leads/page.tsx
git commit -m "feat: add checkout leads dashboard page"
```

---

### Task 15: Payment Methods Settings Page

**Files:**
- Create: `src/app/superadmin/checkout-leads/payment-methods/page.tsx`
- Create: `src/app/superadmin/checkout-leads/payment-methods/payment-methods-settings.tsx`

- [ ] **Step 1: Write the server page**

```typescript
import { getAllPlatformPaymentMethods } from '@/lib/checkout-leads/platform-payment-methods-service'
import { PaymentMethodsSettings } from './payment-methods-settings'

export default async function PaymentMethodsPage() {
  const methods = await getAllPlatformPaymentMethods()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Payment Methods</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage payment methods shown on the checkout page
        </p>
      </div>

      <PaymentMethodsSettings initialMethods={methods} />
    </div>
  )
}
```

- [ ] **Step 2: Write the settings client component**

```typescript
'use client'

import { useState } from 'react'
import { Plus, GripVertical, Pencil, Trash2, QrCode, Building2, CreditCard, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SimpleImageUpload } from '@/components/shared/simple-image-upload'
import {
  addPlatformPaymentMethod,
  editPlatformPaymentMethod,
  removePlatformPaymentMethod,
  savePlatformPaymentMethodOrder,
} from '@/app/actions/checkout-leads'
import type { PlatformPaymentMethod } from '@/types/database'

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  qr_code: QrCode,
  bank_transfer: Building2,
  other: CreditCard,
}

const TYPE_LABELS: Record<string, string> = {
  qr_code: 'QR Code',
  bank_transfer: 'Bank Transfer',
  other: 'Other',
}

interface PaymentMethodsSettingsProps {
  initialMethods: PlatformPaymentMethod[]
}

interface FormState {
  name: string
  type: 'qr_code' | 'bank_transfer' | 'other'
  details: string
  qr_code_url: string
}

const emptyForm: FormState = { name: '', type: 'qr_code', details: '', qr_code_url: '' }

export function PaymentMethodsSettings({ initialMethods }: PaymentMethodsSettingsProps) {
  const [methods, setMethods] = useState(initialMethods)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [isSaving, setIsSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null)

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  function openEdit(method: PlatformPaymentMethod) {
    setEditingId(method.id)
    setForm({
      name: method.name,
      type: method.type,
      details: method.details ?? '',
      qr_code_url: method.qr_code_url ?? '',
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error('Name is required')
      return
    }
    setIsSaving(true)
    try {
      if (editingId) {
        const result = await editPlatformPaymentMethod(editingId, {
          name: form.name,
          type: form.type,
          details: form.details || undefined,
          qr_code_url: form.qr_code_url || null,
        })
        if (result.error) { toast.error(result.error); return }
        setMethods((prev) =>
          prev.map((m) =>
            m.id === editingId
              ? { ...m, name: form.name, type: form.type, details: form.details, qr_code_url: form.qr_code_url || null }
              : m
          )
        )
        toast.success('Payment method updated')
      } else {
        const result = await addPlatformPaymentMethod({
          name: form.name,
          type: form.type,
          details: form.details || undefined,
          qr_code_url: form.qr_code_url || undefined,
        })
        if (result.error) { toast.error(result.error); return }
        if (result.data) {
          setMethods((prev) => [...prev, result.data!])
          toast.success('Payment method added')
        }
      }
      setDialogOpen(false)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      const result = await removePlatformPaymentMethod(id)
      if (result.error) { toast.error(result.error); return }
      setMethods((prev) => prev.filter((m) => m.id !== id))
      toast.success('Payment method deleted')
    } finally {
      setDeletingId(null)
    }
  }

  async function handleToggleActive(id: string, isActive: boolean) {
    const result = await editPlatformPaymentMethod(id, { is_active: isActive })
    if (result.error) { toast.error(result.error); return }
    setMethods((prev) => prev.map((m) => (m.id === id ? { ...m, is_active: isActive } : m)))
  }

  function handleDragStart(idx: number) {
    setDraggedIdx(idx)
  }

  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault()
    if (draggedIdx === null || draggedIdx === idx) return
    const reordered = [...methods]
    const [moved] = reordered.splice(draggedIdx, 1)
    reordered.splice(idx, 0, moved)
    setMethods(reordered)
    setDraggedIdx(idx)
  }

  async function handleDragEnd() {
    setDraggedIdx(null)
    const orderedIds = methods.map((m) => m.id)
    const result = await savePlatformPaymentMethodOrder(orderedIds)
    if (result.error) toast.error(result.error)
  }

  return (
    <>
      <div className="rounded-xl border bg-white shadow-sm">
        <div className="flex items-center justify-between border-b p-4">
          <h3 className="font-semibold">Payment Methods</h3>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Method
          </Button>
        </div>

        {methods.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No payment methods yet. Add one to show on the checkout page.
          </div>
        ) : (
          <div className="divide-y">
            {methods.map((method, idx) => {
              const Icon = TYPE_ICONS[method.type] ?? CreditCard
              return (
                <div
                  key={method.id}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center gap-3 px-4 py-3 ${
                    !method.is_active ? 'opacity-50' : ''
                  }`}
                >
                  <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground" />
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
                    <Icon className="h-5 w-5 text-gray-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{method.name}</p>
                    <p className="text-xs text-muted-foreground">{TYPE_LABELS[method.type]}</p>
                  </div>
                  {method.qr_code_url && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={method.qr_code_url} alt="" className="h-10 w-10 rounded border object-contain" />
                  )}
                  <Switch
                    checked={method.is_active}
                    onCheckedChange={(checked) => handleToggleActive(method.id, checked)}
                  />
                  <Button variant="ghost" size="icon" onClick={() => openEdit(method)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(method.id)}
                    disabled={deletingId === method.id}
                  >
                    {deletingId === method.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    )}
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Payment Method' : 'Add Payment Method'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. GCash, BPI Bank Transfer"
              />
            </div>

            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={form.type}
                onValueChange={(val) => setForm((f) => ({ ...f, type: val as FormState['type'] }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="qr_code">QR Code</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Account Details</Label>
              <Textarea
                value={form.details}
                onChange={(e) => setForm((f) => ({ ...f, details: e.target.value }))}
                placeholder="Account name, account number, instructions..."
                rows={3}
              />
            </div>

            {form.type === 'qr_code' && (
              <SimpleImageUpload
                currentImageUrl={form.qr_code_url}
                onImageUploaded={(url) => setForm((f) => ({ ...f, qr_code_url: url }))}
                folder="platform-payment-qr"
                label="QR Code Image"
                description="Upload the QR code image for this payment method"
              />
            )}

            <Button onClick={handleSave} disabled={isSaving} className="w-full">
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : editingId ? (
                'Save Changes'
              ) : (
                'Add Payment Method'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/superadmin/checkout-leads/payment-methods/
git commit -m "feat: add platform payment methods settings page"
```

---

### Task 16: Add Navigation Link to Payment Methods Settings

**Files:**
- Modify: `src/app/superadmin/checkout-leads/page.tsx`

- [ ] **Step 1: Add link to payment methods settings**

Add a settings button in the page header, after the description paragraph:

```typescript
import { Suspense } from 'react'
import Link from 'next/link'
import { Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getCheckoutLeadStats } from '@/lib/checkout-leads/checkout-leads-analytics'
import { getCheckoutLeads } from '@/lib/checkout-leads/checkout-leads-service'
import { CheckoutLeadAnalytics } from './components/checkout-lead-analytics'
import { CheckoutLeadPipeline } from './components/checkout-lead-pipeline'
import { CheckoutLeadsTable } from './components/checkout-leads-table'

export default async function CheckoutLeadsPage() {
  const [stats, leadsResult] = await Promise.all([
    getCheckoutLeadStats(),
    getCheckoutLeads({ page: 1, pageSize: 20 }),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Checkout Leads</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track Smart Menu purchases and payment status
          </p>
        </div>
        <Link href="/superadmin/checkout-leads/payment-methods">
          <Button variant="outline" size="sm">
            <Settings className="mr-1.5 h-3.5 w-3.5" />
            Payment Methods
          </Button>
        </Link>
      </div>

      <CheckoutLeadAnalytics stats={stats} />
      <CheckoutLeadPipeline statusBreakdown={stats.statusBreakdown} />

      <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-muted" />}>
        <CheckoutLeadsTable
          initialLeads={leadsResult.data}
          initialCount={leadsResult.count}
        />
      </Suspense>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/superadmin/checkout-leads/page.tsx
git commit -m "feat: add payment methods settings link to checkout leads dashboard"
```

---

### Task 17: Final Verification

- [ ] **Step 1: Run linter**

Run: `npm run lint`
Expected: No errors related to new files

- [ ] **Step 2: Run tests**

Run: `npm run test`
Expected: Reference number tests pass, no regressions

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds with no type errors

- [ ] **Step 4: Manual smoke test checklist**

Verify these flows work:
1. Visit `/checkout` — form loads, payment methods display from DB
2. Fill form and submit — redirects to `/checkout/confirmation/WN-XXXXXXXX-XXXX`
3. Confirmation page shows reference number, payment instructions, QR code
4. Upload payment proof — file appears, success message shown
5. Visit `/superadmin/checkout-leads` — stats cards, pipeline, table render
6. Click a lead row — detail panel slides in with all info
7. Change status — select new status, add note, confirm it saves
8. Visit `/superadmin/checkout-leads/payment-methods` — add/edit/delete/reorder methods
9. Messenger link on confirmation page opens correctly

- [ ] **Step 5: Final commit if any fixes needed**
