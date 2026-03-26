# Booking & Leads Management System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Messenger CTAs with a 2-step booking popup, capture leads in Supabase, send confirmation emails via PostHog Workflows, and build a superadmin leads CRM dashboard.

**Architecture:** Three modular subsystems — booking logic (pure functions + validation), lead management (CRUD + analytics), and UI (popup + dashboard). Each module has clear boundaries and its own test file. Data flows: popup → server action → Supabase insert → PostHog event → email. Superadmin reads from the same tables via service layer.

**Tech Stack:** Next.js 15 App Router, Supabase (PostgreSQL + RLS), PostHog (posthog-node), shadcn/ui (Dialog, Sheet, Calendar), Zod, React Hook Form, Jest + React Testing Library

**Spec:** `docs/superpowers/specs/2026-03-26-booking-leads-system-design.md`

---

## File Structure

### New Files

```
supabase/migrations/
  20260326000001_leads_tables.sql           # leads, lead_status_history, lead_notes tables + RLS + indexes

src/lib/booking/
  types.ts                                   # TimeSlot, BookingFormData, BookingStep interfaces
  slots.ts                                   # generateTimeSlots, getBookedSlots, getAvailableSlots, isWeekday
  validation.ts                              # bookingStepOneSchema, bookingStepTwoSchema, bookingSchema

src/lib/leads/
  types.ts                                   # Lead, LeadStatus, LeadNote, LeadStats, WeeklyLeadData interfaces
  leads-service.ts                           # createLead, updateLeadStatus, getLeads, getLeadById, addNote, convertToTenant
  leads-analytics.ts                         # getLeadStats, getConversionRate, getLeadsByWeek

src/app/actions/
  bookings.ts                                # createBooking server action
  leads.ts                                   # fetchLeads, fetchLeadDetail, changeLeadStatus, addLeadNote server actions

src/app/api/booking/slots/
  route.ts                                   # GET endpoint for available slots (called by step-two.tsx)

src/components/landing/booking-popup/
  booking-popup.tsx                           # Main Dialog container, step state machine
  step-one.tsx                               # Name, email, phone form
  step-two.tsx                               # Calendar + time chips
  confirmation.tsx                           # Success screen

src/app/superadmin/leads/
  page.tsx                                   # Dashboard: analytics cards + table + detail panel
  loading.tsx                                # Skeleton loading state

src/app/superadmin/leads/components/
  leads-table.tsx                            # Filterable, sortable, searchable table
  lead-detail-panel.tsx                      # Side Sheet: status, notes, history, convert
  lead-analytics.tsx                         # Stats cards row
  lead-status-badge.tsx                      # Colored status pill component

tests/unit/lib/booking/
  slots.test.ts                              # Pure function tests for slot generation
  validation.test.ts                         # Zod schema validation tests

tests/unit/lib/leads/
  leads-service.test.ts                      # CRUD operations with mocked Supabase
  leads-analytics.test.ts                    # Stats calculation tests

tests/unit/actions/
  bookings.test.ts                           # Server action integration tests

tests/unit/components/
  booking-popup.test.ts                      # Component interaction tests
```

### Modified Files

```
src/lib/posthog.ts:101                       # Add captureBookingCreated() after captureOrderCreated()
src/types/database.ts:454                    # Add Lead, LeadNote, LeadStatusHistory interfaces
src/components/landing/landing-page.tsx:1,213-255,293-302,336-345,1461  # Replace Messenger CTAs with popup trigger
src/components/superadmin/superadmin-sidebar.tsx:33-54  # Add "Leads" nav item
tests/unit/lib/posthog.test.ts:92            # Add captureBookingCreated() tests
```

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260326000001_leads_tables.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- supabase/migrations/20260326000001_leads_tables.sql
-- Platform-level tables: no tenant_id. These are pre-tenant sales leads.

-- ============================================================
-- leads
-- ============================================================
CREATE TABLE leads (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  email               text NOT NULL,
  phone               text NOT NULL,
  booking_date        date NOT NULL,
  booking_time        time NOT NULL,
  status              text NOT NULL DEFAULT 'new'
                      CHECK (status IN ('new', 'contacted', 'qualified', 'converted', 'lost')),
  source              text DEFAULT 'landing_page',
  converted_tenant_id uuid REFERENCES tenants(id),
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "superadmin_all" ON leads
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' = 'superadmin'
    )
  );

CREATE UNIQUE INDEX idx_leads_unique_slot ON leads(booking_date, booking_time)
  WHERE status != 'lost';

CREATE TRIGGER leads_set_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_booking_date ON leads(booking_date);
CREATE INDEX idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX idx_leads_email ON leads(email);

-- ============================================================
-- lead_status_history
-- ============================================================
CREATE TABLE lead_status_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  old_status  text,
  new_status  text NOT NULL,
  changed_by  uuid REFERENCES auth.users(id),
  note        text,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE lead_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "superadmin_all" ON lead_status_history
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' = 'superadmin'
    )
  );

CREATE INDEX idx_lead_status_history_lead_id ON lead_status_history(lead_id);

-- ============================================================
-- lead_notes
-- ============================================================
CREATE TABLE lead_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  note        text NOT NULL,
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE lead_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "superadmin_all" ON lead_notes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' = 'superadmin'
    )
  );

CREATE INDEX idx_lead_notes_lead_id ON lead_notes(lead_id);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260326000001_leads_tables.sql
git commit -m "feat(db): add leads, lead_status_history, lead_notes tables with RLS"
```

---

## Task 2: TypeScript Types

**Files:**
- Create: `src/lib/booking/types.ts`
- Create: `src/lib/leads/types.ts`
- Modify: `src/types/database.ts:454` (append after `ComplementaryPairWithDetails`)

- [ ] **Step 1: Create booking types**

```typescript
// src/lib/booking/types.ts
export interface TimeSlot {
  time: string       // '09:00', '09:30', etc.
  label: string      // '9:00 AM', '9:30 AM', etc.
  available: boolean
}

export interface BookingFormData {
  name: string
  email: string
  phone: string
  bookingDate: string  // 'YYYY-MM-DD'
  bookingTime: string  // 'HH:mm'
}

export type BookingStep = 'contact' | 'time' | 'confirmation'
```

- [ ] **Step 2: Create leads types**

```typescript
// src/lib/leads/types.ts
export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'converted' | 'lost'

export interface Lead {
  id: string
  name: string
  email: string
  phone: string
  booking_date: string
  booking_time: string
  status: LeadStatus
  source: string
  converted_tenant_id: string | null
  created_at: string
  updated_at: string
}

export interface LeadNote {
  id: string
  lead_id: string
  note: string
  created_by: string | null
  created_at: string
}

export interface LeadStatusHistoryEntry {
  id: string
  lead_id: string
  old_status: string | null
  new_status: string
  changed_by: string | null
  note: string | null
  created_at: string
}

export interface LeadStats {
  totalLeads: number
  newThisWeek: number
  conversionRate: number
  conversionDelta: number
  pendingCalls: number
  pendingToday: number
  avgResponseTimeHours: number
}

export interface WeeklyLeadData {
  week: string  // 'YYYY-WW' or ISO date of week start
  count: number
}
```

- [ ] **Step 3: Add Lead types to database.ts**

Append after the last export in `src/types/database.ts` (after line ~454, the `ComplementaryPairWithDetails` interface):

```typescript
// Lead Management (platform-level, no tenant_id)
export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  booking_date: string;
  booking_time: string;
  status: 'new' | 'contacted' | 'qualified' | 'converted' | 'lost';
  source: string;
  converted_tenant_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadStatusHistory {
  id: string;
  lead_id: string;
  old_status: string | null;
  new_status: string;
  changed_by: string | null;
  note: string | null;
  created_at: string;
}

export interface LeadNote {
  id: string;
  lead_id: string;
  note: string;
  created_by: string | null;
  created_at: string;
}
```

- [ ] **Step 4: Update Supabase auto-generated types**

The `createAdminClient()` uses `createClient<Database>()` which references auto-generated types in `src/types/supabase.ts`. Without adding the new tables to the `Database` type, all `.from('leads')` calls will produce TypeScript errors.

If Supabase CLI is configured locally, run:
```bash
npx supabase gen types typescript --local > src/types/supabase.ts
```

If not (common in dev), manually add the table definitions to the `Tables` interface in `src/types/supabase.ts`. Add `leads`, `lead_status_history`, and `lead_notes` entries matching the migration columns. Follow the pattern of existing table entries in that file.

- [ ] **Step 5: Commit**

```bash
git add src/lib/booking/types.ts src/lib/leads/types.ts src/types/database.ts src/types/supabase.ts
git commit -m "feat(types): add booking and leads type definitions + Supabase table types"
```

---

## Task 3: Booking Slot Logic (TDD)

**Files:**
- Create: `src/lib/booking/slots.ts`
- Create: `tests/unit/lib/booking/slots.test.ts`

- [ ] **Step 1: Write failing tests for pure slot functions**

```typescript
// tests/unit/lib/booking/slots.test.ts
import { describe, test, expect } from '@jest/globals'
import { generateTimeSlots, isWeekday } from '@/lib/booking/slots'

describe('isWeekday', () => {
  test('returns true for Monday through Friday', () => {
    // Use explicit UTC dates to avoid timezone-dependent day shifts
    // 2026-03-30 is Monday, 2026-04-03 is Friday
    expect(isWeekday(new Date('2026-03-30T00:00:00Z'))).toBe(true)
    expect(isWeekday(new Date('2026-03-31T00:00:00Z'))).toBe(true) // Tue
    expect(isWeekday(new Date('2026-04-01T00:00:00Z'))).toBe(true) // Wed
    expect(isWeekday(new Date('2026-04-02T00:00:00Z'))).toBe(true) // Thu
    expect(isWeekday(new Date('2026-04-03T00:00:00Z'))).toBe(true) // Fri
  })

  test('returns false for Saturday and Sunday', () => {
    expect(isWeekday(new Date('2026-03-28T00:00:00Z'))).toBe(false) // Sat
    expect(isWeekday(new Date('2026-03-29T00:00:00Z'))).toBe(false) // Sun
  })
})

describe('generateTimeSlots', () => {
  test('returns 16 slots for a weekday (9:00-16:30, 30min intervals)', () => {
    const slots = generateTimeSlots(new Date('2026-04-01T00:00:00Z')) // Wed, future date
    expect(slots).toHaveLength(16)
    expect(slots[0]).toEqual({ time: '09:00', label: '9:00 AM', available: true })
    expect(slots[15]).toEqual({ time: '16:30', label: '4:30 PM', available: true })
  })

  test('returns empty array for weekends', () => {
    expect(generateTimeSlots(new Date('2026-03-28T00:00:00Z'))).toEqual([]) // Sat
    expect(generateTimeSlots(new Date('2026-03-29T00:00:00Z'))).toEqual([]) // Sun
  })

  test('slot times are 30 minutes apart', () => {
    const slots = generateTimeSlots(new Date('2026-04-01T00:00:00Z'))
    expect(slots[0].time).toBe('09:00')
    expect(slots[1].time).toBe('09:30')
    expect(slots[2].time).toBe('10:00')
  })

  test('slot labels use 12-hour format', () => {
    const slots = generateTimeSlots(new Date('2026-04-01T00:00:00Z'))
    expect(slots[0].label).toBe('9:00 AM')
    // 13:00 = 1:00 PM, index = (13-9)*2 = 8
    expect(slots[8].label).toBe('1:00 PM')
  })

  test('excludes past times when date is today', () => {
    // Mock "now" to 11:15 AM PHT
    const now = new Date('2026-04-01T03:15:00Z') // 11:15 AM PHT (UTC+8)
    jest.useFakeTimers()
    jest.setSystemTime(now)

    const slots = generateTimeSlots(new Date('2026-04-01'))
    // Should start at 11:30 (next slot after 11:15)
    expect(slots[0].time).toBe('11:30')
    expect(slots.every(s => s.time >= '11:30')).toBe(true)

    jest.useRealTimers()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --testPathPattern="booking/slots" --verbose`
Expected: FAIL — `Cannot find module '@/lib/booking/slots'`

- [ ] **Step 3: Implement slots.ts**

```typescript
// src/lib/booking/slots.ts
import type { TimeSlot } from './types'

const PHT_OFFSET = 8 // UTC+8
const START_HOUR = 9
const END_HOUR = 16
const END_MINUTE = 30
const SLOT_INTERVAL = 30

export function isWeekday(date: Date): boolean {
  // Use UTC day to avoid timezone-dependent day shifts
  // All date inputs should be constructed with 'T00:00:00+08:00' (PHT) or UTC
  const day = date.getUTCDay()
  return day >= 1 && day <= 5
}

function formatTime(hour: number, minute: number): string {
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
}

function formatLabel(hour: number, minute: number): string {
  const period = hour >= 12 ? 'PM' : 'AM'
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
  return `${displayHour}:${minute.toString().padStart(2, '0')} ${period}`
}

function getNowInPHT(): { hours: number; minutes: number; dateStr: string } {
  const now = new Date()
  const phtTime = new Date(now.getTime() + PHT_OFFSET * 60 * 60 * 1000)
  return {
    hours: phtTime.getUTCHours(),
    minutes: phtTime.getUTCMinutes(),
    dateStr: phtTime.toISOString().split('T')[0],
  }
}

export function generateTimeSlots(date: Date): TimeSlot[] {
  if (!isWeekday(date)) return []

  const dateStr = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
  const phtNow = getNowInPHT()
  const isToday = dateStr === phtNow.dateStr

  const slots: TimeSlot[] = []
  let hour = START_HOUR
  let minute = 0

  while (hour < END_HOUR || (hour === END_HOUR && minute <= END_MINUTE)) {
    const time = formatTime(hour, minute)
    const label = formatLabel(hour, minute)

    if (!isToday || hour > phtNow.hours || (hour === phtNow.hours && minute > phtNow.minutes)) {
      slots.push({ time, label, available: true })
    }

    minute += SLOT_INTERVAL
    if (minute >= 60) {
      hour += 1
      minute = 0
    }
  }

  return slots
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --testPathPattern="booking/slots" --verbose`
Expected: All PASS

- [ ] **Step 5: Add getBookedSlots and getAvailableSlots**

Add to `src/lib/booking/slots.ts` (append after `generateTimeSlots`):

```typescript
import { createAdminClient } from '@/lib/supabase/admin'

export async function getBookedSlots(date: Date): Promise<string[]> {
  const supabase = createAdminClient()
  const dateStr = date.toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('leads')
    .select('booking_time')
    .eq('booking_date', dateStr)
    .neq('status', 'lost')

  if (error) {
    console.error('[Booking] Failed to fetch booked slots:', error)
    return []
  }

  return (data || []).map(row => {
    // booking_time from DB is 'HH:mm:ss', we need 'HH:mm'
    const t = String(row.booking_time)
    return t.length > 5 ? t.slice(0, 5) : t
  })
}

export async function getAvailableSlots(date: Date): Promise<TimeSlot[]> {
  const allSlots = generateTimeSlots(date)
  const booked = await getBookedSlots(date)
  const bookedSet = new Set(booked)

  return allSlots.map(slot => ({
    ...slot,
    available: !bookedSet.has(slot.time),
  }))
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/booking/slots.ts tests/unit/lib/booking/slots.test.ts
git commit -m "feat(booking): add slot generation with TDD — pure functions + Supabase queries"
```

---

## Task 4: Booking Validation (TDD)

**Files:**
- Create: `src/lib/booking/validation.ts`
- Create: `tests/unit/lib/booking/validation.test.ts`

- [ ] **Step 1: Write failing validation tests**

```typescript
// tests/unit/lib/booking/validation.test.ts
import { describe, test, expect } from '@jest/globals'
import { bookingStepOneSchema, bookingStepTwoSchema } from '@/lib/booking/validation'

describe('bookingStepOneSchema', () => {
  test('accepts valid input', () => {
    const result = bookingStepOneSchema.safeParse({
      name: 'Maria Santos',
      email: 'maria@email.com',
      phone: '+639171234567',
    })
    expect(result.success).toBe(true)
  })

  test('accepts phone starting with 0', () => {
    const result = bookingStepOneSchema.safeParse({
      name: 'Maria Santos',
      email: 'maria@email.com',
      phone: '09171234567',
    })
    expect(result.success).toBe(true)
  })

  test('strips formatting characters from phone', () => {
    const result = bookingStepOneSchema.safeParse({
      name: 'Maria Santos',
      email: 'maria@email.com',
      phone: '+63 917-123-4567',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.phone).toBe('+639171234567')
    }
  })

  test('rejects name shorter than 2 chars', () => {
    const result = bookingStepOneSchema.safeParse({
      name: 'A',
      email: 'maria@email.com',
      phone: '+639171234567',
    })
    expect(result.success).toBe(false)
  })

  test('rejects invalid email', () => {
    const result = bookingStepOneSchema.safeParse({
      name: 'Maria Santos',
      email: 'not-an-email',
      phone: '+639171234567',
    })
    expect(result.success).toBe(false)
  })

  test('rejects invalid phone format', () => {
    const result = bookingStepOneSchema.safeParse({
      name: 'Maria Santos',
      email: 'maria@email.com',
      phone: '12345',
    })
    expect(result.success).toBe(false)
  })
})

describe('bookingStepTwoSchema', () => {
  test('accepts valid date and time', () => {
    const result = bookingStepTwoSchema.safeParse({
      bookingDate: '2026-04-01',
      bookingTime: '09:00',
    })
    expect(result.success).toBe(true)
  })

  test('rejects invalid time format', () => {
    const result = bookingStepTwoSchema.safeParse({
      bookingDate: '2026-04-01',
      bookingTime: '9am',
    })
    expect(result.success).toBe(false)
  })

  test('rejects weekend date', () => {
    const result = bookingStepTwoSchema.safeParse({
      bookingDate: '2026-03-28', // Saturday
      bookingTime: '09:00',
    })
    expect(result.success).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --testPathPattern="booking/validation" --verbose`
Expected: FAIL

- [ ] **Step 3: Implement validation.ts**

```typescript
// src/lib/booking/validation.ts
import { z } from 'zod'
import { isWeekday } from './slots'

function isValidBookingDate(dateStr: string): boolean {
  const date = new Date(dateStr + 'T00:00:00')
  if (isNaN(date.getTime())) return false
  if (!isWeekday(date)) return false

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const bookingDate = new Date(dateStr + 'T00:00:00')
  bookingDate.setHours(0, 0, 0, 0)

  return bookingDate >= today
}

export const bookingStepOneSchema = z.object({
  name: z.string().min(2, 'Name is required').max(100, 'Name is too long'),
  email: z.string().email('Invalid email address'),
  phone: z.string()
    .transform(val => val.replace(/[\s\-()]/g, ''))
    .pipe(z.string().regex(/^(\+63|0)\d{9,11}$/, 'Invalid Philippine phone number')),
})

export const bookingStepTwoSchema = z.object({
  bookingDate: z.string().refine(isValidBookingDate, 'Must be a future weekday'),
  bookingTime: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format'),
})

export const bookingSchema = bookingStepOneSchema.merge(bookingStepTwoSchema)

export type BookingStepOneData = z.infer<typeof bookingStepOneSchema>
export type BookingStepTwoData = z.infer<typeof bookingStepTwoSchema>
export type BookingData = z.infer<typeof bookingSchema>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --testPathPattern="booking/validation" --verbose`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/booking/validation.ts tests/unit/lib/booking/validation.test.ts
git commit -m "feat(booking): add Zod validation schemas with TDD — phone transform, date checks"
```

---

## Task 5: PostHog captureBookingCreated (TDD)

**Files:**
- Modify: `src/lib/posthog.ts:101` (append after `captureOrderCreated`)
- Modify: `tests/unit/lib/posthog.test.ts:92` (append after existing tests)

- [ ] **Step 1: Write failing test for captureBookingCreated**

Append to `tests/unit/lib/posthog.test.ts` inside the `describe('posthog client')` block, after the last `test()`:

```typescript
  test('captureBookingCreated no-ops when client is null', async () => {
    const { captureBookingCreated } = await import('@/lib/posthog')
    await expect(
      captureBookingCreated({
        name: 'Maria Santos',
        email: 'maria@email.com',
        phone: '+639171234567',
        bookingDate: '2026-04-01',
        bookingTime: '10:00',
        leadId: 'lead-1',
        source: 'landing_page',
      })
    ).resolves.toBeUndefined()
  })

  test('captureBookingCreated calls posthog.capture with correct event', async () => {
    process.env.POSTHOG_API_KEY = 'phc_test_key'
    process.env.POSTHOG_HOST = 'https://us.i.posthog.com'

    const mockCapture = jest.fn()

    jest.resetModules()
    jest.mock('posthog-node', () => ({
      PostHog: jest.fn().mockImplementation(() => ({
        capture: mockCapture,
        flush: jest.fn().mockResolvedValue(undefined),
        shutdown: jest.fn().mockResolvedValue(undefined),
      })),
    }))

    const { captureBookingCreated } = await import('@/lib/posthog')
    await captureBookingCreated({
      name: 'Maria Santos',
      email: 'maria@email.com',
      phone: '+639171234567',
      bookingDate: '2026-04-01',
      bookingTime: '10:00',
      leadId: 'lead-1',
      source: 'landing_page',
    })

    expect(mockCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        distinctId: 'lead_maria@email.com',
        event: 'booking_created',
        properties: expect.objectContaining({
          lead_id: 'lead-1',
          booking_date: '2026-04-01',
          booking_time: '10:00',
          $set: expect.objectContaining({
            email: 'maria@email.com',
            name: 'Maria Santos',
          }),
        }),
      })
    )
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --testPathPattern="posthog" --verbose`
Expected: FAIL — `captureBookingCreated is not a function`

- [ ] **Step 3: Implement captureBookingCreated**

Append to `src/lib/posthog.ts` after line 101 (after the closing `}` of `captureOrderCreated`):

```typescript
export interface BookingEventData {
  name: string
  email: string
  phone: string
  bookingDate: string
  bookingTime: string
  leadId: string
  source: string
}

export async function captureBookingCreated(data: BookingEventData): Promise<void> {
  const posthog = getPostHogClient()
  if (!posthog) return

  try {
    posthog.capture({
      distinctId: `lead_${data.email}`,
      event: 'booking_created',
      properties: {
        lead_id: data.leadId,
        name: data.name,
        email: data.email,
        phone: data.phone,
        booking_date: data.bookingDate,
        booking_time: data.bookingTime,
        source: data.source,
        $set: {
          email: data.email,
          name: data.name,
          phone: data.phone,
        },
      },
    })
    await posthog.flush()
  } catch (error) {
    console.error('[PostHog] Failed to capture booking_created event:', error)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --testPathPattern="posthog" --verbose`
Expected: All PASS (existing + new tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/posthog.ts tests/unit/lib/posthog.test.ts
git commit -m "feat(posthog): add captureBookingCreated with TDD — booking_created event + $set person"
```

---

## Task 6: Leads Service (TDD)

**Files:**
- Create: `src/lib/leads/leads-service.ts`
- Create: `tests/unit/lib/leads/leads-service.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/unit/lib/leads/leads-service.test.ts
import { describe, test, expect, jest, beforeEach } from '@jest/globals'

// Mock the admin client
const mockSelect = jest.fn()
const mockInsert = jest.fn()
const mockUpdate = jest.fn()
const mockEq = jest.fn()
const mockNeq = jest.fn()
const mockOrder = jest.fn()
const mockRange = jest.fn()
const mockIlike = jest.fn()
const mockSingle = jest.fn()

const mockChain = {
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate,
  eq: mockEq,
  neq: mockNeq,
  order: mockOrder,
  range: mockRange,
  ilike: mockIlike,
  single: mockSingle,
}

// Each method returns the chain for fluent calls
Object.values(mockChain).forEach(fn => {
  ;(fn as jest.Mock).mockReturnValue(mockChain)
})

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: jest.fn(() => mockChain),
  })),
}))

describe('leads-service', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    Object.values(mockChain).forEach(fn => {
      ;(fn as jest.Mock).mockReturnValue(mockChain)
    })
  })

  test('createLead inserts a lead and returns it', async () => {
    const mockLead = {
      id: 'lead-1',
      name: 'Maria Santos',
      email: 'maria@email.com',
      phone: '+639171234567',
      booking_date: '2026-04-01',
      booking_time: '10:00',
      status: 'new',
      source: 'landing_page',
    }

    mockSingle.mockResolvedValueOnce({ data: mockLead, error: null })

    const { createLead } = await import('@/lib/leads/leads-service')
    const result = await createLead({
      name: 'Maria Santos',
      email: 'maria@email.com',
      phone: '+639171234567',
      bookingDate: '2026-04-01',
      bookingTime: '10:00',
    })

    expect(result.data).toEqual(mockLead)
    expect(result.error).toBeNull()
  })

  test('createLead returns slot_taken error on unique violation', async () => {
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: { code: '23505', message: 'unique violation' },
    })

    const { createLead } = await import('@/lib/leads/leads-service')
    const result = await createLead({
      name: 'Maria Santos',
      email: 'maria@email.com',
      phone: '+639171234567',
      bookingDate: '2026-04-01',
      bookingTime: '10:00',
    })

    expect(result.data).toBeNull()
    expect(result.error).toBe('slot_taken')
  })

  test('updateLeadStatus updates the lead and inserts history', async () => {
    mockSingle.mockResolvedValueOnce({
      data: { id: 'lead-1', status: 'contacted' },
      error: null,
    })
    // Second call for history insert
    mockSingle.mockResolvedValueOnce({ data: {}, error: null })

    const { updateLeadStatus } = await import('@/lib/leads/leads-service')
    const result = await updateLeadStatus('lead-1', 'new', 'contacted', 'user-1')

    expect(result.error).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --testPathPattern="leads-service" --verbose`
Expected: FAIL

- [ ] **Step 3: Implement leads-service.ts**

```typescript
// src/lib/leads/leads-service.ts
import { createAdminClient } from '@/lib/supabase/admin'
import type { Lead, LeadStatus, LeadNote, LeadStatusHistoryEntry } from './types'

interface CreateLeadInput {
  name: string
  email: string
  phone: string
  bookingDate: string
  bookingTime: string
  source?: string
}

export async function createLead(input: CreateLeadInput): Promise<{ data: Lead | null; error: string | null }> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('leads')
    .insert({
      name: input.name,
      email: input.email,
      phone: input.phone,
      booking_date: input.bookingDate,
      booking_time: input.bookingTime,
      source: input.source || 'landing_page',
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return { data: null, error: 'slot_taken' }
    }
    console.error('[Leads] Failed to create lead:', error)
    return { data: null, error: 'server_error' }
  }

  return { data: data as Lead, error: null }
}

export async function updateLeadStatus(
  leadId: string,
  oldStatus: string,
  newStatus: LeadStatus,
  changedBy?: string,
  note?: string
): Promise<{ error: string | null }> {
  const supabase = createAdminClient()

  const { error: updateError } = await supabase
    .from('leads')
    .update({ status: newStatus })
    .eq('id', leadId)
    .select()
    .single()

  if (updateError) {
    console.error('[Leads] Failed to update status:', updateError)
    return { error: 'server_error' }
  }

  const { error: historyError } = await supabase
    .from('lead_status_history')
    .insert({
      lead_id: leadId,
      old_status: oldStatus,
      new_status: newStatus,
      changed_by: changedBy || null,
      note: note || null,
    })
    .select()
    .single()

  if (historyError) {
    console.error('[Leads] Failed to insert status history:', historyError)
  }

  return { error: null }
}

export async function getLeads(options?: {
  status?: LeadStatus
  search?: string
  page?: number
  pageSize?: number
}): Promise<{ data: Lead[]; count: number; error: string | null }> {
  const supabase = createAdminClient()
  const page = options?.page || 1
  const pageSize = options?.pageSize || 20
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from('leads')
    .select('*', { count: 'exact' })

  if (options?.status) {
    query = query.eq('status', options.status)
  }

  if (options?.search) {
    query = query.or(`name.ilike.%${options.search}%,email.ilike.%${options.search}%`)
  }

  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) {
    console.error('[Leads] Failed to fetch leads:', error)
    return { data: [], count: 0, error: 'server_error' }
  }

  return { data: (data || []) as Lead[], count: count || 0, error: null }
}

export async function getLeadById(id: string): Promise<{ data: Lead | null; error: string | null }> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    return { data: null, error: 'not_found' }
  }

  return { data: data as Lead, error: null }
}

export async function addNote(
  leadId: string,
  note: string,
  createdBy?: string
): Promise<{ data: LeadNote | null; error: string | null }> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('lead_notes')
    .insert({
      lead_id: leadId,
      note,
      created_by: createdBy || null,
    })
    .select()
    .single()

  if (error) {
    console.error('[Leads] Failed to add note:', error)
    return { data: null, error: 'server_error' }
  }

  return { data: data as LeadNote, error: null }
}

export async function getLeadNotes(leadId: string): Promise<LeadNote[]> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('lead_notes')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[Leads] Failed to fetch notes:', error)
    return []
  }

  return (data || []) as LeadNote[]
}

export async function getLeadHistory(leadId: string): Promise<LeadStatusHistoryEntry[]> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('lead_status_history')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[Leads] Failed to fetch history:', error)
    return []
  }

  return (data || []) as LeadStatusHistoryEntry[]
}

export async function convertToTenant(
  leadId: string,
  tenantId: string,
  changedBy?: string
): Promise<{ error: string | null }> {
  const supabase = createAdminClient()

  // Fetch current status before updating
  const { data: currentLead } = await supabase
    .from('leads')
    .select('status')
    .eq('id', leadId)
    .single()

  const oldStatus = (currentLead?.status as string) || 'unknown'

  const { error } = await supabase
    .from('leads')
    .update({
      status: 'converted' as LeadStatus,
      converted_tenant_id: tenantId,
    })
    .eq('id', leadId)

  if (error) {
    console.error('[Leads] Failed to convert lead:', error)
    return { error: 'server_error' }
  }

  await supabase
    .from('lead_status_history')
    .insert({
      lead_id: leadId,
      old_status: oldStatus,
      new_status: 'converted',
      changed_by: changedBy || null,
      note: `Converted to tenant ${tenantId}`,
    })

  return { error: null }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --testPathPattern="leads-service" --verbose`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/leads/leads-service.ts tests/unit/lib/leads/leads-service.test.ts
git commit -m "feat(leads): add leads service CRUD with TDD — create, status, notes, history, convert"
```

---

## Task 7: Leads Analytics (TDD)

**Files:**
- Create: `src/lib/leads/leads-analytics.ts`
- Create: `tests/unit/lib/leads/leads-analytics.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/unit/lib/leads/leads-analytics.test.ts
import { describe, test, expect, jest, beforeEach } from '@jest/globals'

const mockRpc = jest.fn()
const mockSelect = jest.fn()
const mockEq = jest.fn()
const mockGte = jest.fn()
const mockLte = jest.fn()
const mockNeq = jest.fn()
const mockSingle = jest.fn()

const mockChain = { select: mockSelect, eq: mockEq, gte: mockGte, lte: mockLte, neq: mockNeq, single: mockSingle }
Object.values(mockChain).forEach(fn => (fn as jest.Mock).mockReturnValue(mockChain))

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: jest.fn(() => mockChain),
    rpc: mockRpc,
  })),
}))

describe('leads-analytics', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    Object.values(mockChain).forEach(fn => (fn as jest.Mock).mockReturnValue(mockChain))
  })

  test('getLeadStats returns stats object with correct shape', async () => {
    // Mock: total leads
    mockSelect.mockReturnValueOnce({ count: 47, error: null })
    // Mock: new this week
    mockSelect.mockReturnValueOnce({ count: 12, error: null })
    // Mock: converted count (for rate)
    mockSelect.mockReturnValueOnce({ count: 11, error: null })
    // Mock: previous month converted
    mockSelect.mockReturnValueOnce({ count: 8, error: null })
    // Mock: previous month total
    mockSelect.mockReturnValueOnce({ count: 40, error: null })
    // Mock: pending calls
    mockSelect.mockReturnValueOnce({ data: [{ booking_date: '2026-04-01' }], count: 8, error: null })
    // Mock: pending today
    mockSelect.mockReturnValueOnce({ count: 3, error: null })
    // Mock: avg response time - first status change entries
    mockSelect.mockReturnValueOnce({ data: [], error: null })

    const { getLeadStats } = await import('@/lib/leads/leads-analytics')
    const stats = await getLeadStats()

    expect(stats).toHaveProperty('totalLeads')
    expect(stats).toHaveProperty('newThisWeek')
    expect(stats).toHaveProperty('conversionRate')
    expect(stats).toHaveProperty('pendingCalls')
    expect(stats).toHaveProperty('avgResponseTimeHours')
    expect(typeof stats.totalLeads).toBe('number')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --testPathPattern="leads-analytics" --verbose`
Expected: FAIL

- [ ] **Step 3: Implement leads-analytics.ts**

```typescript
// src/lib/leads/leads-analytics.ts
import { createAdminClient } from '@/lib/supabase/admin'
import type { LeadStats, WeeklyLeadData } from './types'

export async function getLeadStats(): Promise<LeadStats> {
  const supabase = createAdminClient()
  const now = new Date()

  // Total leads
  const { count: totalLeads } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })

  // New this week (last 7 days)
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { count: newThisWeek } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', weekAgo)

  // Conversion rate (current month)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const { count: convertedThisMonth } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'converted')
    .gte('created_at', monthStart)

  // Previous month for delta
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
  const prevMonthEnd = monthStart
  const { count: convertedPrevMonth } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'converted')
    .gte('created_at', prevMonthStart)
    .lte('created_at', prevMonthEnd)

  const { count: totalPrevMonth } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', prevMonthStart)
    .lte('created_at', prevMonthEnd)

  // Current month total for rate calculation
  const { count: totalThisMonth } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', monthStart)

  const conversionRate = (totalThisMonth || 0) > 0
    ? ((convertedThisMonth || 0) / (totalThisMonth || 1)) * 100
    : 0

  const prevRate = (totalPrevMonth || 0) > 0
    ? ((convertedPrevMonth || 0) / (totalPrevMonth || 1)) * 100
    : 0

  const conversionDelta = conversionRate - prevRate

  // Pending calls (future bookings with status new or contacted)
  const todayStr = now.toISOString().split('T')[0]
  const { count: pendingCalls } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .gte('booking_date', todayStr)
    .neq('status', 'lost')
    .neq('status', 'converted')

  const { count: pendingToday } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('booking_date', todayStr)
    .neq('status', 'lost')
    .neq('status', 'converted')

  // Avg response time: time from lead creation to first non-'new' status change
  const { data: historyData } = await supabase
    .from('lead_status_history')
    .select('lead_id, created_at')
    .neq('new_status', 'new')
    .order('created_at', { ascending: true })

  // Group by lead_id, take first entry per lead
  const firstResponseByLead = new Map<string, string>()
  for (const entry of historyData || []) {
    if (!firstResponseByLead.has(entry.lead_id)) {
      firstResponseByLead.set(entry.lead_id, entry.created_at)
    }
  }

  // Get lead creation times for those leads
  let avgResponseTimeHours = 0
  if (firstResponseByLead.size > 0) {
    const leadIds = Array.from(firstResponseByLead.keys())
    const { data: leadsData } = await supabase
      .from('leads')
      .select('id, created_at')
      .in('id', leadIds)

    if (leadsData && leadsData.length > 0) {
      let totalMs = 0
      let count = 0
      for (const lead of leadsData) {
        const responseTime = firstResponseByLead.get(lead.id)
        if (responseTime) {
          const diff = new Date(responseTime).getTime() - new Date(lead.created_at).getTime()
          totalMs += diff
          count++
        }
      }
      avgResponseTimeHours = count > 0 ? totalMs / count / (1000 * 60 * 60) : 0
    }
  }

  return {
    totalLeads: totalLeads || 0,
    newThisWeek: newThisWeek || 0,
    conversionRate: Math.round(conversionRate * 10) / 10,
    conversionDelta: Math.round(conversionDelta * 10) / 10,
    pendingCalls: pendingCalls || 0,
    pendingToday: pendingToday || 0,
    avgResponseTimeHours: Math.round(avgResponseTimeHours * 10) / 10,
  }
}

export async function getLeadsByWeek(weeks: number = 8): Promise<WeeklyLeadData[]> {
  const supabase = createAdminClient()
  const now = new Date()
  const startDate = new Date(now.getTime() - weeks * 7 * 24 * 60 * 60 * 1000)

  const { data, error } = await supabase
    .from('leads')
    .select('created_at')
    .gte('created_at', startDate.toISOString())
    .order('created_at', { ascending: true })

  if (error || !data) return []

  // Group by week
  const weekMap = new Map<string, number>()
  for (const lead of data) {
    const date = new Date(lead.created_at)
    const weekStart = new Date(date)
    weekStart.setDate(date.getDate() - date.getDay() + 1) // Monday
    const key = weekStart.toISOString().split('T')[0]
    weekMap.set(key, (weekMap.get(key) || 0) + 1)
  }

  return Array.from(weekMap.entries())
    .map(([week, count]) => ({ week, count }))
    .sort((a, b) => a.week.localeCompare(b.week))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --testPathPattern="leads-analytics" --verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/leads/leads-analytics.ts tests/unit/lib/leads/leads-analytics.test.ts
git commit -m "feat(leads): add leads analytics queries with TDD — stats, conversion rate, weekly trends"
```

---

## Task 8: Server Action — createBooking (TDD)

**Files:**
- Create: `src/app/actions/bookings.ts`
- Create: `tests/unit/actions/bookings.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/unit/actions/bookings.test.ts
import { describe, test, expect, jest, beforeEach } from '@jest/globals'

// Mock leads service
const mockCreateLead = jest.fn()
jest.mock('@/lib/leads/leads-service', () => ({
  createLead: (...args: unknown[]) => mockCreateLead(...args),
}))

// Mock PostHog
const mockCaptureBooking = jest.fn()
jest.mock('@/lib/posthog', () => ({
  captureBookingCreated: (...args: unknown[]) => mockCaptureBooking(...args),
}))

describe('createBooking server action', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('returns validation errors for invalid input', async () => {
    const { createBooking } = await import('@/app/actions/bookings')
    const result = await createBooking({
      name: '',
      email: 'not-an-email',
      phone: '123',
      bookingDate: '2026-03-28', // Saturday
      bookingTime: '9am',
    })

    expect(result.success).toBe(false)
    expect(result.errors).toBeDefined()
  })

  test('returns success and calls PostHog on valid input', async () => {
    mockCreateLead.mockResolvedValueOnce({
      data: {
        id: 'lead-1',
        name: 'Maria Santos',
        email: 'maria@email.com',
        booking_date: '2026-04-01',
        booking_time: '10:00',
      },
      error: null,
    })
    mockCaptureBooking.mockResolvedValueOnce(undefined)

    const { createBooking } = await import('@/app/actions/bookings')
    const result = await createBooking({
      name: 'Maria Santos',
      email: 'maria@email.com',
      phone: '+639171234567',
      bookingDate: '2026-04-01',
      bookingTime: '10:00',
    })

    expect(result.success).toBe(true)
    expect(result.lead).toBeDefined()
    expect(mockCaptureBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'maria@email.com',
        leadId: 'lead-1',
      })
    )
  })

  test('returns slot_taken error when slot is booked', async () => {
    mockCreateLead.mockResolvedValueOnce({ data: null, error: 'slot_taken' })

    const { createBooking } = await import('@/app/actions/bookings')
    const result = await createBooking({
      name: 'Maria Santos',
      email: 'maria@email.com',
      phone: '+639171234567',
      bookingDate: '2026-04-01',
      bookingTime: '10:00',
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('slot_taken')
    expect(mockCaptureBooking).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --testPathPattern="actions/bookings" --verbose`
Expected: FAIL

- [ ] **Step 3: Implement the server action**

```typescript
// src/app/actions/bookings.ts
'use server'

import { bookingSchema } from '@/lib/booking/validation'
import { createLead } from '@/lib/leads/leads-service'
import { captureBookingCreated } from '@/lib/posthog'

interface BookingResult {
  success: boolean
  lead?: { id: string; name: string; bookingDate: string; bookingTime: string }
  error?: string
  errors?: Record<string, string[]>
}

export async function createBooking(input: {
  name: string
  email: string
  phone: string
  bookingDate: string
  bookingTime: string
}): Promise<BookingResult> {
  // 1. Validate
  const parsed = bookingSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {}
    for (const issue of parsed.error.issues) {
      const field = issue.path[0]?.toString() || 'unknown'
      if (!fieldErrors[field]) fieldErrors[field] = []
      fieldErrors[field].push(issue.message)
    }
    return { success: false, errors: fieldErrors }
  }

  // 2. Insert (unique index prevents double-booking atomically)
  const { data: lead, error } = await createLead({
    name: parsed.data.name,
    email: parsed.data.email,
    phone: parsed.data.phone,
    bookingDate: parsed.data.bookingDate,
    bookingTime: parsed.data.bookingTime,
  })

  if (error) {
    return { success: false, error }
  }

  if (!lead) {
    return { success: false, error: 'server_error' }
  }

  // 3. PostHog event (fire-and-forget, booking still succeeds if this fails)
  try {
    await captureBookingCreated({
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      bookingDate: lead.booking_date,
      bookingTime: lead.booking_time,
      leadId: lead.id,
      source: lead.source || 'landing_page',
    })
  } catch {
    // Silent — booking succeeded, just no email
  }

  // 4. Return success
  return {
    success: true,
    lead: {
      id: lead.id,
      name: lead.name,
      bookingDate: lead.booking_date,
      bookingTime: lead.booking_time,
    },
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --testPathPattern="actions/bookings" --verbose`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/actions/bookings.ts tests/unit/actions/bookings.test.ts
git commit -m "feat(booking): add createBooking server action with TDD — validate, insert, PostHog"
```

---

## Task 9: Booking Popup UI Components

**Files:**
- Create: `src/components/landing/booking-popup/booking-popup.tsx`
- Create: `src/components/landing/booking-popup/step-one.tsx`
- Create: `src/components/landing/booking-popup/step-two.tsx`
- Create: `src/components/landing/booking-popup/confirmation.tsx`

- [ ] **Step 1: Create StepOne — contact form**

Create `src/components/landing/booking-popup/step-one.tsx`:
- React Hook Form + Zod resolver using `bookingStepOneSchema`
- Fields: name (Input), email (Input type="email"), phone (Input type="tel" with "+63" placeholder)
- Inline error messages below each field
- "Next: Choose Your Time →" submit button
- Step indicator "Step 1 of 2 ●○"
- Dark theme: `bg-zinc-900 border-zinc-800` inputs, `text-zinc-100` labels
- Use shadcn Input, Button, Label components

- [ ] **Step 2: Create StepTwo — calendar + time chips**

Create `src/components/landing/booking-popup/step-two.tsx`:
- Props: `stepOneData: BookingStepOneData`, `onBack: () => void`, `onSubmit: (data: BookingFormData) => void`
- State: `selectedDate`, `selectedTime`, `availableSlots`
- Mini calendar: custom grid (no library needed — just render Mon-Fri cells)
  - Weekends disabled (opacity-30, pointer-events-none)
  - Past dates disabled
  - Selected date: `bg-amber-500 text-zinc-900`
  - Month navigation: ‹ › arrows
- Time chips: `getAvailableSlots(selectedDate)` called on date change via API route
  - Available: `bg-zinc-950 border-zinc-800 text-zinc-100`
  - Booked: `line-through text-zinc-600 pointer-events-none`
  - Selected: `bg-amber-500/20 border-amber-500 text-amber-500`
- "← Back" button returns to step 1
- "Confirm Booking" button (disabled until time selected)
- Step indicator "Step 2 of 2 ○●"

**Note:** For fetching available slots client-side, create a small API route `src/app/api/booking/slots/route.ts` that calls `getAvailableSlots(date)` and returns JSON. The step-two component fetches from this route on date selection.

- [ ] **Step 3: Create API route for slots**

Create `src/app/api/booking/slots/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getAvailableSlots } from '@/lib/booking/slots'

export async function GET(request: NextRequest) {
  const dateParam = request.nextUrl.searchParams.get('date')
  if (!dateParam) {
    return NextResponse.json({ error: 'date parameter required' }, { status: 400 })
  }

  const date = new Date(dateParam + 'T00:00:00')
  if (isNaN(date.getTime())) {
    return NextResponse.json({ error: 'invalid date' }, { status: 400 })
  }

  const slots = await getAvailableSlots(date)
  return NextResponse.json({ slots })
}
```

- [ ] **Step 4: Create Confirmation screen**

Create `src/components/landing/booking-popup/confirmation.tsx`:
- Props: `lead: { name, bookingDate, bookingTime }`, `onClose: () => void`
- Animated checkmark (Framer Motion scale+rotate)
- "We'll see you on [formatted date] at [formatted time]!"
- "Check your email for confirmation details"
- Auto-close after 5 seconds via `useEffect` + `setTimeout`

- [ ] **Step 5: Create BookingPopup container**

Create `src/components/landing/booking-popup/booking-popup.tsx`:
- Uses shadcn `Dialog` (DialogContent, DialogTitle with `sr-only` for a11y)
- Props: `open: boolean`, `onOpenChange: (open: boolean) => void`
- State machine: `step: BookingStep` — `'contact'` | `'time'` | `'confirmation'`
- `stepOneData` held in state, passed to StepTwo
- On StepTwo submit: call `createBooking` server action, handle errors (toast on slot_taken), move to confirmation
- Dark overlay: `DialogOverlay` with `bg-black/80`
- Modal: `max-w-md rounded-2xl bg-zinc-900 border border-zinc-800`

- [ ] **Step 6: Commit**

```bash
git add src/components/landing/booking-popup/ src/app/api/booking/slots/route.ts
git commit -m "feat(ui): add 2-step booking popup — contact form, calendar, time chips, confirmation"
```

---

## Task 10: Replace Landing Page CTAs

**Files:**
- Modify: `src/components/landing/landing-page.tsx`

- [ ] **Step 1: Add booking popup state to LandingPage**

In `src/components/landing/landing-page.tsx`, modify the `LandingPage` component (line ~1511) to:
1. Add `bookingOpen` state
2. Listen for hash changes (`#book`) to open the popup — this avoids prop-drilling `onBook` through 5+ nested components
3. Render the `BookingPopup`

```typescript
import { BookingPopup } from './booking-popup/booking-popup'
import { useEffect } from 'react'

// Inside LandingPage:
const [bookingOpen, setBookingOpen] = useState(false)

useEffect(() => {
  const handleHash = () => {
    if (window.location.hash === '#book') {
      setBookingOpen(true)
      window.history.replaceState(null, '', window.location.pathname)
    }
  }
  window.addEventListener('hashchange', handleHash)
  handleHash() // Check on mount
  return () => window.removeEventListener('hashchange', handleHash)
}, [])

// Add before closing </div>:
<BookingPopup open={bookingOpen} onOpenChange={setBookingOpen} />
```

- [ ] **Step 2: Replace PrimaryCTA with hash link**

Modify the `PrimaryCTA` component (lines 213-256):
- Change from `<a href={MESSENGER_LINK} target="_blank" rel="noopener noreferrer">` to `<a href="#book">`
- Remove `target="_blank"` and `rel="noopener noreferrer"`
- This works for ALL 5 call sites (HeroSection, OfferSection, ProcessAndPricingSection, FinalCTASection) without any prop-drilling

- [ ] **Step 3: Replace Navigation Messenger links**

In `Navigation` (lines 293-302 and 336-345):
- Desktop nav button (line 294): change `<a href={MESSENGER_LINK}>` to `<a href="#book">`
- Mobile nav button (line 337): same change — also call `setIsOpen(false)` to close mobile menu

- [ ] **Step 4: Remove unused MESSENGER_LINK constant**

Delete the `MESSENGER_LINK` constant (lines 29-30) since all CTAs now use the popup.

- [ ] **Step 6: Run lint to verify**

Run: `npm run lint`
Expected: No new errors (may have pre-existing ones)

- [ ] **Step 7: Commit**

```bash
git add src/components/landing/landing-page.tsx
git commit -m "feat(landing): replace all Messenger CTAs with booking popup trigger"
```

---

## Task 11: Superadmin Sidebar + Leads Page Shell

**Files:**
- Modify: `src/components/superadmin/superadmin-sidebar.tsx:33-54`
- Create: `src/app/superadmin/leads/page.tsx`
- Create: `src/app/superadmin/leads/loading.tsx`
- Create: `src/app/superadmin/leads/components/lead-status-badge.tsx`

- [ ] **Step 1: Add Leads to sidebar**

In `src/components/superadmin/superadmin-sidebar.tsx`, add to the `sidebarItems` array (after Analytics, before Settings — line ~48):

```typescript
import { Users } from 'lucide-react'

// Add to sidebarItems array:
{
  label: 'Leads',
  href: '/superadmin/leads',
  icon: Users,
},
```

- [ ] **Step 2: Create lead-status-badge.tsx**

```typescript
// src/app/superadmin/leads/components/lead-status-badge.tsx
import type { LeadStatus } from '@/lib/leads/types'

const STATUS_CONFIG: Record<LeadStatus, { label: string; className: string }> = {
  new: { label: 'NEW', className: 'bg-blue-500/15 text-blue-500' },
  contacted: { label: 'CONTACTED', className: 'bg-amber-500/15 text-amber-500' },
  qualified: { label: 'QUALIFIED', className: 'bg-purple-500/15 text-purple-500' },
  converted: { label: 'CONVERTED', className: 'bg-green-500/15 text-green-500' },
  lost: { label: 'LOST', className: 'bg-zinc-500/15 text-zinc-400' },
}

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  const config = STATUS_CONFIG[status]
  return (
    <span className={`inline-flex rounded px-2 py-0.5 text-[10px] font-semibold ${config.className}`}>
      {config.label}
    </span>
  )
}
```

- [ ] **Step 3: Create loading.tsx**

```typescript
// src/app/superadmin/leads/loading.tsx
import { Card, CardContent, CardHeader } from '@/components/ui/card'

export default function LeadsLoading() {
  return (
    <div className="space-y-6">
      <div>
        <div className="h-8 w-32 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-4 w-64 animate-pulse rounded bg-muted" />
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <div className="h-3 w-20 animate-pulse rounded bg-muted" />
            </CardHeader>
            <CardContent>
              <div className="h-7 w-12 animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-14 w-full animate-pulse rounded bg-muted" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 4: Create page.tsx shell**

Create `src/app/superadmin/leads/page.tsx` — server component that fetches initial data and renders child components:

```typescript
import { Suspense } from 'react'
import { getLeadStats } from '@/lib/leads/leads-analytics'
import { getLeads } from '@/lib/leads/leads-service'
import { LeadAnalytics } from './components/lead-analytics'
import { LeadsTable } from './components/leads-table'

export default async function LeadsPage() {
  const [stats, leadsResult] = await Promise.all([
    getLeadStats(),
    getLeads({ page: 1, pageSize: 20 }),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Leads</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage growth call bookings and track conversions
        </p>
      </div>

      <LeadAnalytics stats={stats} />

      <Suspense fallback={<div className="h-96 animate-pulse rounded bg-muted" />}>
        <LeadsTable
          initialLeads={leadsResult.data}
          initialCount={leadsResult.count}
        />
      </Suspense>
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/superadmin/superadmin-sidebar.tsx src/app/superadmin/leads/
git commit -m "feat(superadmin): add leads page shell with sidebar nav, loading, status badge"
```

---

## Task 12: Lead Analytics Cards Component

**Files:**
- Create: `src/app/superadmin/leads/components/lead-analytics.tsx`

- [ ] **Step 1: Implement the analytics cards**

```typescript
// src/app/superadmin/leads/components/lead-analytics.tsx
'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { LeadStats } from '@/lib/leads/types'

export function LeadAnalytics({ stats }: { stats: LeadStats }) {
  return (
    <div className="grid gap-4 md:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Total Leads
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalLeads}</div>
          <p className="mt-1 text-xs text-green-500">
            ↑ {stats.newThisWeek} this week
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Conversion Rate
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.conversionRate}%</div>
          <p className={`mt-1 text-xs ${stats.conversionDelta >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {stats.conversionDelta >= 0 ? '↑' : '↓'} {Math.abs(stats.conversionDelta)}% vs last month
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Pending Calls
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-amber-500">{stats.pendingCalls}</div>
          <p className="mt-1 text-xs text-amber-500">
            {stats.pendingToday} today
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Avg Response Time
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.avgResponseTimeHours}h</div>
          <p className={`mt-1 text-xs ${stats.avgResponseTimeHours <= 2 ? 'text-green-500' : 'text-red-500'}`}>
            {stats.avgResponseTimeHours <= 2 ? 'On target' : '↑ slower than target'}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/superadmin/leads/components/lead-analytics.tsx
git commit -m "feat(superadmin): add lead analytics cards — total, conversion, pending, response time"
```

---

## Task 13: Leads Table Component

**Files:**
- Create: `src/app/superadmin/leads/components/leads-table.tsx`

- [ ] **Step 1: Implement the filterable leads table**

Create `src/app/superadmin/leads/components/leads-table.tsx`:
- `'use client'` component
- Props: `initialLeads: Lead[]`, `initialCount: number`
- State: `leads`, `count`, `status filter`, `search`, `page`, `selectedLeadId`
- Status filter pills: All, New, Contacted, Qualified, Converted, Lost
- Search input (debounced 300ms)
- Table with columns: Name, Contact, Booking, Status (LeadStatusBadge), Submitted (relative time), Actions
- Pagination: prev/next buttons, "Page X of Y"
- "Export CSV" button: generates CSV from current filtered leads
- "View →" button: opens lead detail panel (sets `selectedLeadId`)
- Fetches data via server action or API route on filter/search/page change
- Renders `LeadDetailPanel` when `selectedLeadId` is set

For data fetching on filter changes, create a server action in `src/app/actions/leads.ts`:

```typescript
// src/app/actions/leads.ts
'use server'

import { getLeads } from '@/lib/leads/leads-service'
import { updateLeadStatus, addNote, getLeadById, getLeadNotes, getLeadHistory } from '@/lib/leads/leads-service'
import type { LeadStatus } from '@/lib/leads/types'

export async function fetchLeads(options: {
  status?: LeadStatus
  search?: string
  page?: number
}) {
  return getLeads(options)
}

export async function fetchLeadDetail(id: string) {
  const [lead, notes, history] = await Promise.all([
    getLeadById(id),
    getLeadNotes(id),
    getLeadHistory(id),
  ])
  return { lead: lead.data, notes, history }
}

export async function changeLeadStatus(
  leadId: string,
  oldStatus: string,
  newStatus: LeadStatus,
  userId?: string
) {
  return updateLeadStatus(leadId, oldStatus, newStatus, userId)
}

export async function addLeadNote(leadId: string, note: string, userId?: string) {
  return addNote(leadId, note, userId)
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/superadmin/leads/components/leads-table.tsx src/app/actions/leads.ts
git commit -m "feat(superadmin): add leads table with filters, search, pagination, CSV export"
```

---

## Task 14: Lead Detail Panel

**Files:**
- Create: `src/app/superadmin/leads/components/lead-detail-panel.tsx`

- [ ] **Step 1: Implement the detail panel**

Create `src/app/superadmin/leads/components/lead-detail-panel.tsx`:
- Uses shadcn `Sheet` (SheetContent, SheetHeader, SheetTitle)
- Props: `leadId: string`, `open: boolean`, `onOpenChange: (open: boolean) => void`, `onStatusChange: () => void`
- Fetches lead detail via `fetchLeadDetail` server action on open
- Sections:
  1. **Header**: Avatar initials (first letter of first+last name, colored bg), name, email, phone
  2. **Status changer**: Row of clickable pill buttons for each status. Active status highlighted. On click: call `changeLeadStatus` server action, then `onStatusChange()` to refresh table
  3. **Booking info**: Card with date, time, "15-minute growth call"
  4. **Notes**: List of existing notes (from `lead_notes`), each with text + relative timestamp. Textarea + "Save Note" button to add new note via `addLeadNote`
  5. **Status history**: Vertical timeline (`border-l-2 border-zinc-800 pl-4`), each entry shows old→new status, who changed it, when
  6. **Convert to Tenant**: Green outlined button at bottom. Links to `/superadmin/tenants/new?lead_id={id}&name={name}&email={email}`

- [ ] **Step 2: Commit**

```bash
git add src/app/superadmin/leads/components/lead-detail-panel.tsx
git commit -m "feat(superadmin): add lead detail panel — status, notes, history, convert to tenant"
```

---

## Task 15: Convert to Tenant Integration

**Files:**
- Modify: `src/app/superadmin/tenants/new/page.tsx`

- [ ] **Step 1: Modify NewTenantPage to accept searchParams**

In `src/app/superadmin/tenants/new/page.tsx`, update the page component to read `searchParams` and pass prefill data to `TenantFormWrapper`:

```typescript
// Accept searchParams prop (Next.js 15 async params)
export default async function NewTenantPage({
  searchParams,
}: {
  searchParams: Promise<{ lead_id?: string; name?: string; email?: string }>
}) {
  const params = await searchParams
  const prefill = params.lead_id
    ? { leadId: params.lead_id, name: params.name || '', email: params.email || '' }
    : undefined

  return <TenantFormWrapper prefill={prefill} />
}
```

- [ ] **Step 2: Update TenantFormWrapper to use prefill data**

Read the existing `TenantFormWrapper` component and modify it to:
1. Accept optional `prefill` prop: `{ leadId: string; name: string; email: string }`
2. Use `prefill.name` as default value for the restaurant name field
3. Use `prefill.email` as default value for admin email field
4. On successful tenant creation, if `prefill.leadId` is set, call `convertToTenant(prefill.leadId, newTenantId)` from the leads service

- [ ] **Step 3: Commit**

```bash
git add src/app/superadmin/tenants/new/page.tsx
git commit -m "feat(superadmin): integrate Convert to Tenant with lead prefill + auto-conversion"
```

---

## Task 16: Component Tests

**Files:**
- Create: `tests/unit/components/booking-popup.test.ts`

- [ ] **Step 1: Write component tests**

```typescript
// tests/unit/components/booking-popup.test.ts
import { describe, test, expect, jest } from '@jest/globals'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

// Mock server action
jest.mock('@/app/actions/bookings', () => ({
  createBooking: jest.fn(),
}))

// Mock slots API
global.fetch = jest.fn()

describe('BookingPopup', () => {
  test('renders step 1 with name, email, phone fields', async () => {
    // Dynamic import to work with jest module mocking
    const { BookingPopup } = await import('@/components/landing/booking-popup/booking-popup')
    render(<BookingPopup open={true} onOpenChange={() => {}} />)

    expect(screen.getByPlaceholderText(/full name/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/email/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/phone/i)).toBeInTheDocument()
  })

  test('shows validation errors for empty fields', async () => {
    const { BookingPopup } = await import('@/components/landing/booking-popup/booking-popup')
    render(<BookingPopup open={true} onOpenChange={() => {}} />)

    const submitButton = screen.getByRole('button', { name: /next.*choose your time/i })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText(/name is required/i)).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 2: Run all tests**

Run: `npm test -- --verbose`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add tests/unit/components/booking-popup.test.ts
git commit -m "test: add booking popup component tests — step nav, validation display"
```

---

## Task 17: Lint + Final Verification

- [ ] **Step 1: Run lint**

Run: `npm run lint`
Fix any new lint errors introduced by the feature.

- [ ] **Step 2: Run all tests**

Run: `npm test -- --verbose`
Expected: All PASS

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds (or only pre-existing errors remain)

- [ ] **Step 4: Final commit if any fixes were needed**

Stage only the specific files that were fixed during lint/build resolution. Do not use `git add -A`.

```bash
git commit -m "fix: resolve lint and build errors in booking/leads feature"
```
