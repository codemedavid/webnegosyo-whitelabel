# Booking & Leads Management System — Design Spec

**Date:** 2026-03-26
**Status:** Approved
**Scope:** Landing page booking popup, PostHog email notifications, superadmin leads CRM

---

## 1. Problem

All landing page CTAs redirect to Facebook Messenger. Leads are lost in unstructured conversations with no tracking, no confirmation emails, and no visibility into conversion funnel. There is no system to capture, manage, or analyze inbound leads.

## 2. Solution Overview

Three subsystems built as modular, independently testable units:

1. **Booking Popup** — 2-step centered modal replacing all Messenger CTAs on the landing page
2. **PostHog Email Notification** — `booking_created` event triggers a PostHog Workflow that sends confirmation email to the customer
3. **Superadmin Leads Dashboard** — CRM-lite with filterable table, lead detail panel, notes, status history, conversion tracking, and analytics

### Architecture

```
Landing Page CTA (click)
  → Booking Popup Step 1 (name, email, phone)
  → Booking Popup Step 2 (calendar + time chips)
  → Server Action: createBooking()
    → Zod validation
    → Supabase INSERT (leads table)
    → PostHog capture('booking_created')
      → PostHog Workflow → confirmation email to customer
  → Confirmation Screen

Superadmin /leads
  → Analytics cards (total, conversion rate, pending, avg response time)
  → Filterable table (status, search, date)
  → Lead detail side panel (status change, notes, history, convert to tenant)
```

## 3. Data Model

### `leads` table

> **Note:** This is a platform-level table (no `tenant_id`). Leads are pre-tenant sales prospects
> captured from the platform landing page, not scoped to any tenant.

```sql
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

-- Platform-level table: no tenant_id. These are pre-tenant sales leads.
-- No public RLS policy needed — server action uses admin client (service role) which bypasses RLS.
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "superadmin_all" ON leads
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' = 'superadmin'
    )
  );

-- Race condition prevention: only one booking per date+time slot
CREATE UNIQUE INDEX idx_leads_unique_slot ON leads(booking_date, booking_time)
  WHERE status != 'lost';

-- Auto-update updated_at on row changes (uses existing set_updated_at() from 0001_initial.sql)
CREATE TRIGGER leads_set_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

### `lead_status_history` table

```sql
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
```

### `lead_notes` table

```sql
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
```

> **Note:** All service layer operations on `leads`, `lead_status_history`, and `lead_notes` use the
> Supabase admin client (service role), which bypasses RLS. RLS policies exist as a safety net for
> any future direct-access patterns.

### Indexes

```sql
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_booking_date ON leads(booking_date);
CREATE INDEX idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX idx_leads_email ON leads(email);
CREATE INDEX idx_lead_status_history_lead_id ON lead_status_history(lead_id);
CREATE INDEX idx_lead_notes_lead_id ON lead_notes(lead_id);
```

## 4. Module Structure

```
src/
├── lib/booking/
│   ├── slots.ts          # Pure functions: generateTimeSlots, getAvailableSlots, isWeekday
│   ├── validation.ts     # Zod schemas: bookingStepOneSchema, bookingStepTwoSchema, bookingSchema
│   └── types.ts          # TimeSlot, BookingFormData, BookingStep
│
├── lib/leads/
│   ├── leads-service.ts  # CRUD: createLead, updateLeadStatus, getLeads, getLeadById, addNote, convertToTenant
│   ├── leads-analytics.ts # Queries: getLeadStats, getConversionRate, getLeadsByWeek, getAvgResponseTime
│   └── types.ts          # Lead, LeadStatus, LeadNote, LeadStats
│
├── lib/posthog.ts        # Add captureBookingCreated() alongside existing captureOrderCreated()
│
├── app/actions/
│   └── bookings.ts       # Server action: createBooking()
│
├── components/landing/booking-popup/
│   ├── booking-popup.tsx  # Main dialog container, step state machine
│   ├── step-one.tsx       # Name, email, phone form
│   ├── step-two.tsx       # Calendar + time chips
│   └── confirmation.tsx   # Success screen
│
└── app/superadmin/leads/
    ├── page.tsx           # Dashboard: analytics + table
    ├── loading.tsx        # Skeleton loading state (matches existing superadmin pattern)
    └── components/
        ├── leads-table.tsx       # Filterable, sortable table
        ├── lead-detail-panel.tsx # Side sheet: status, notes, history, convert
        ├── lead-analytics.tsx    # Stats cards
        └── lead-status-badge.tsx # Colored status pills
```

## 5. Booking Popup

### UI Design

**Style:** Centered modal (shadcn Dialog), dark theme matching landing page.

**Step 1 — Contact Info:**
- Fields: Full Name (text), Email (email), Phone (tel with +63 default)
- Validation: Zod, inline error messages
- CTA: "Next: Choose Your Time →"
- Step indicator: "Step 1 of 2 ●○"

**Step 2 — Time Selection:**
- Mini calendar grid (Mon-Fri only, weekends disabled, past dates disabled)
- Time chips below calendar: 30-min slots from 9:00 AM to 4:30 PM PHT
- Booked slots shown as struck-through/disabled
- Selected slot highlighted in amber
- CTA: "Confirm Booking"
- Back button to return to Step 1

**Confirmation Screen:**
- Success checkmark animation
- "We'll see you on [date] at [time]!"
- "Check your email for confirmation"
- Auto-closes after 5 seconds or on click

### Trigger Points

All existing Messenger CTAs on the landing page are replaced:
- Navigation bar button
- Hero section CTA
- Final section CTA

Each opens the same `BookingPopup` component via shared state (React state or URL hash).

## 6. Slot Availability

### Pure Functions (`src/lib/booking/slots.ts`)

```typescript
generateTimeSlots(date: Date): TimeSlot[]
// Returns 30-min slots for 9:00-16:30 PHT on weekdays.
// Excludes past times if date is today.
// Returns empty array for weekends.

getBookedSlots(date: Date): Promise<string[]>
// Queries leads table for bookings on the given date.
// Returns array of time strings like ['09:00', '10:30'].

getAvailableSlots(date: Date): Promise<TimeSlot[]>
// Calls generateTimeSlots(), filters out getBookedSlots().
// Returns only open slots.

isWeekday(date: Date): boolean
// Returns true for Mon-Fri.
```

### TimeSlot Type

```typescript
interface TimeSlot {
  time: string;       // '09:00', '09:30', etc.
  label: string;      // '9:00 AM', '9:30 AM', etc.
  available: boolean;
}
```

## 7. Server Action

### `createBooking()` (`src/app/actions/bookings.ts`)

```
Input: { name, email, phone, bookingDate, bookingTime }

1. Validate with bookingSchema (Zod)
2. Insert into leads table using Supabase admin client (service role, no auth required)
   - The unique index `idx_leads_unique_slot` on (booking_date, booking_time) WHERE status != 'lost'
     prevents double-booking atomically at the database level.
   - On unique violation (code '23505'), return { success: false, error: 'slot_taken' }
3. Call captureBookingCreated() → PostHog
4. Return { success: true, lead: { id, name, bookingDate, bookingTime } }

Error cases:
- Validation failure → return { success: false, errors: ZodErrors }
- Slot taken (unique violation) → return { success: false, error: 'slot_taken' }
- DB error → return { success: false, error: 'server_error' }
```

Uses `src/lib/supabase/admin.ts` since booking is a public action (no authentication required).

## 8. PostHog Integration

### New Function in `src/lib/posthog.ts`

```typescript
captureBookingCreated(lead: {
  name: string;
  email: string;
  phone: string;
  bookingDate: string;
  bookingTime: string;
  leadId: string;
  source: string;
})
```

Event: `booking_created`
Distinct ID: `lead_${email}` — uses email as the person identifier so PostHog Workflows can target them

Properties:
- `lead_id`, `name`, `email`, `phone`
- `booking_date`, `booking_time`
- `source` ('landing_page')

Person properties (`$set`):
- `email`, `name`, `phone` — identifies the person in PostHog for Workflow targeting

Follows existing pattern: graceful degradation if `POSTHOG_API_KEY` or `POSTHOG_HOST` are missing. Immediate flush (`flushAt: 1, flushInterval: 0`).

### PostHog Workflow (configured in PostHog dashboard, not code)

- **Trigger:** `booking_created` event
- **Action:** Send email to the person's `email`
- **Template:** Confirmation with name, date, time, and what to expect on the call

## 9. Superadmin Leads Dashboard

### Route: `/superadmin/leads`

**Analytics Cards (top row):**
- Total Leads (with weekly new count)
- Conversion Rate (percentage, vs last month delta)
- Pending Calls (upcoming bookings count, today's count)
- Avg Response Time (derived from `lead_status_history`: time from `leads.created_at` to the first non-`new` status entry)

**Leads Table:**
- Columns: Name (+ business hint if in notes), Contact (email + phone), Booking (date/time), Status (badge), Submitted (relative time), Actions (View →)
- Filters: Status pills (All, New, Contacted, Qualified, Converted, Lost)
- Search: Name or email
- Export: CSV download
- Pagination: 20 per page

**Lead Detail Panel (shadcn Sheet, slides from right):**
- Avatar with initials + contact info
- Status changer: clickable pill buttons, changes status immediately
- Booking info card: date, time, call type
- Notes: textarea + save button, inserts into `lead_notes` table with timestamp and `created_by`
- Status history: vertical timeline from `lead_status_history` table with timestamps and who changed it
- "Convert to Tenant" button: navigates to `/superadmin/tenants/new?lead_id={id}&name={name}&email={email}`
  - `TenantFormWrapper` reads `searchParams` and pre-fills name/email fields
  - On tenant creation success, the `convertToTenant()` service function updates the lead:
    sets `status` to `'converted'`, `converted_tenant_id` to the new tenant's ID,
    and inserts a `lead_status_history` entry recording the conversion

### Analytics Queries (`src/lib/leads/leads-analytics.ts`)

```typescript
getLeadStats(): Promise<LeadStats>
// Total leads, new this week, conversion rate, pending calls, avg response time

getLeadsByWeek(weeks: number): Promise<WeeklyLeadData[]>
// Leads per week for trend display

getConversionRate(): Promise<{ rate: number; delta: number }>
// Current month rate vs previous month
```

## 10. Testing Strategy

### Unit Tests (Jest + jsdom)

| Module | Test File | Coverage |
|--------|-----------|----------|
| `lib/booking/slots.ts` | `tests/unit/lib/booking/slots.test.ts` | Slot generation for each day type (weekday, weekend, today with past times), boundary times (9:00, 16:30), empty results for weekends |
| `lib/booking/validation.ts` | `tests/unit/lib/booking/validation.test.ts` | Valid/invalid name, email formats, PH phone formats (+63, 09xx), date validation (no past, no weekends), time format |
| `lib/leads/leads-service.ts` | `tests/unit/lib/leads/leads-service.test.ts` | CRUD operations with mocked Supabase, status transition validation, note appending |
| `lib/leads/leads-analytics.ts` | `tests/unit/lib/leads/leads-analytics.test.ts` | Stats calculation with fixture data, conversion rate math, empty state handling |
| `lib/posthog.ts` | `tests/unit/lib/posthog.test.ts` | Add tests for `captureBookingCreated()`: event name, properties, person $set, graceful degradation |
| `app/actions/bookings.ts` | `tests/unit/actions/bookings.test.ts` | Full flow: valid input → insert → PostHog. Validation errors. Slot-taken scenario. DB error handling. |
| `components/landing/booking-popup/` | `tests/unit/components/booking-popup.test.ts` | Step navigation (1→2, 2→1), form validation display, submit calls server action, confirmation shows on success |

### Testing Principles

- **Pure logic** (slots.ts, validation.ts, analytics.ts): tested without mocking — input → output
- **Service layer** (leads-service.ts, bookings.ts): uses existing Supabase mocks from `jest.setup.js`
- **PostHog**: mock `posthog-node` module (existing pattern in test file)
- **Components**: React Testing Library via jsdom, test user interactions not implementation

## 11. Validation Schemas

### Step One Schema

```typescript
const bookingStepOneSchema = z.object({
  name: z.string().min(2, 'Name is required').max(100),
  email: z.string().email('Invalid email address'),
  phone: z.string()
    .transform(val => val.replace(/[\s\-()]/g, ''))  // strip spaces, dashes, parens
    .pipe(z.string().regex(/^(\+63|0)\d{9,11}$/, 'Invalid Philippine phone number')),
});
```

### Step Two Schema

```typescript
const bookingStepTwoSchema = z.object({
  bookingDate: z.string().refine(isValidBookingDate, 'Must be a future weekday'),
  bookingTime: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format'),
});
```

### Combined Schema

```typescript
const bookingSchema = bookingStepOneSchema.merge(bookingStepTwoSchema);
```

## 12. Error Handling

- **Form validation**: Inline errors below each field (React Hook Form + Zod resolver)
- **Slot conflict**: If slot is taken between Step 2 load and submit, show toast "This slot was just booked. Please choose another time." and refresh available slots
- **Network error**: Toast with "Something went wrong. Please try again."
- **PostHog failure**: Silent — booking still succeeds, just no email. Logged to console in dev.

## 13. Security

- Booking form is **public** (no auth) — uses Supabase admin client for insert
- Rate limiting: Consider adding Upstash rate limiter on the server action (e.g., 5 bookings per IP per hour) as a future enhancement. Not in initial scope.
- Leads dashboard: **superadmin only** — RLS enforces this, plus existing superadmin route protection
- Input sanitization: Zod validation prevents injection. No raw SQL.
- Phone/email: Stored as-is, rendered safely via React's default escaping (no raw HTML injection)

## 14. Integration Points

- **Superadmin sidebar**: Add "Leads" nav item to `sidebarItems` in `src/components/superadmin/superadmin-sidebar.tsx`
- **TypeScript types**: After migration, update `src/types/database.ts` to include `leads`, `lead_status_history`, and `lead_notes` table types. If using auto-generated types, re-run `npx supabase gen types`.
- **`updateLeadStatus()`** in `leads-service.ts` sets `status` on the lead AND inserts a `lead_status_history` row in the same operation (both via admin client)

## 15. Out of Scope

- Calendar integration (Google Calendar, Calendly)
- Configurable availability (hardcoded Mon-Fri 9-5)
- Email template customization (handled in PostHog dashboard)
- SMS notifications
- Rate limiting on booking endpoint
- Recurring/rescheduling bookings
