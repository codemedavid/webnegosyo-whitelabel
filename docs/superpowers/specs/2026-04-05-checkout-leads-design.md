# Checkout Leads System — Design Spec

**Date:** 2026-04-05
**Status:** Approved

## Overview

Capture platform-level checkout initiations from the landing page (people buying the Smart Menu product at ₱3,899) as trackable leads with payment proof upload. Separate dashboard from existing booking/demo leads.

## Current State

- Landing page checkout form collects name, email, phone, business name, payment method (GCash/BPI dropdown), notes
- On submit: opens Facebook Messenger with pre-filled message — no database record saved
- No way to track checkout initiations, payment status, or conversion to live tenants

## Data Model

### `platform_payment_methods` table

| Column | Type | Notes |
|--------|------|-------|
| id | uuid, PK | |
| name | text, not null | e.g. "GCash", "BPI Bank Transfer" |
| type | text, not null | `qr_code` \| `bank_transfer` \| `other` |
| details | text | Account number, account name, instructions |
| qr_code_url | text, nullable | Cloudinary URL for QR code image |
| is_active | boolean, default true | |
| order_index | integer, default 0 | Display ordering |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `checkout_leads` table

| Column | Type | Notes |
|--------|------|-------|
| id | uuid, PK | |
| reference_number | text, unique, not null | Format: `WN-YYYYMMDD-XXXX` |
| name | text, not null | |
| email | text, not null | |
| phone | text, not null | |
| business_name | text, not null | |
| notes | text, nullable | Customer's additional notes |
| selected_payment_method_id | uuid, FK → platform_payment_methods | |
| status | text, not null, default 'initiated' | `initiated` \| `paid` \| `setup_in_progress` \| `live` \| `cancelled` |
| payment_proof_url | text, nullable | Cloudinary URL of uploaded screenshot |
| payment_proof_uploaded_at | timestamptz, nullable | |
| amount | numeric, not null | ₱3,899 (stored for historical accuracy) |
| created_at | timestamptz | |
| updated_at | timestamptz | |

Indices: status, reference_number, email, created_at.

### `checkout_lead_status_history` table

| Column | Type | Notes |
|--------|------|-------|
| id | uuid, PK | |
| checkout_lead_id | uuid, FK → checkout_leads, on delete cascade | |
| old_status | text | |
| new_status | text, not null | |
| changed_by | uuid, FK → auth.users | |
| note | text, nullable | |
| created_at | timestamptz | |

### RLS Policies

- All three tables: superadmin-only read/write
- Checkout form submission uses service-role client (server action) so unauthenticated customers can insert into `checkout_leads`
- Confirmation page reads lead by reference number via service-role client (public access by ref number)

## Reference Number Generation

Format: `WN-YYYYMMDD-XXXX`

- `WN` — WebNegosyo prefix
- `YYYYMMDD` — date of initiation
- `XXXX` — 4 random alphanumeric uppercase characters (excluding ambiguous: O, 0, I, 1)

Example: `WN-20260405-K7M3`

Collision handling: retry with new random chars if exists (extremely unlikely per day).

## Checkout Page Revamp

### Form (`/checkout`)

Same fields as today plus:
- **Payment method selector** — radio cards showing all active `platform_payment_methods` (icon + name + type)
- Zod validation

On submit:
1. Server action creates `checkout_leads` record with generated reference number
2. Redirect to `/checkout/confirmation/[referenceNumber]`

### Confirmation Page (`/checkout/confirmation/[ref]`)

Loads lead by reference number via service-role client (no auth required — ref number acts as access token).

Four sections:
1. **Reference Number Banner** — prominent display with copy-to-clipboard button
2. **Payment Instructions** — selected payment method's QR code (if applicable), account details, amount (₱3,899). Step-by-step: "1. Scan QR / Transfer → 2. Upload proof below → 3. We set you up within 48 hours"
3. **Payment Proof Upload** — drag-and-drop or click-to-upload for screenshot. Uploads to Cloudinary, updates lead record via server action. Shows success state after upload.
4. **Messenger Link** — "Have questions? Chat with us on Messenger" as secondary action

## Superadmin Dashboard

### Navigation

New sidebar item: **"Checkout Leads"** with ShoppingCart icon at `/superadmin/checkout-leads`, placed after existing "Leads" item.

### Stats Cards Row

- Total Leads (all time)
- This Week (new initiated)
- Paid (awaiting setup)
- Live (completed)
- Conversion Rate (initiated → live)

### Table View

| Ref # | Name | Business | Payment Method | Status | Proof | Date |
|-------|------|----------|---------------|--------|-------|------|

- Search by name, email, business name, reference number
- Filter by status (tabs or dropdown)
- Sort by date (newest first default)
- Status as colored badges
- Proof column: thumbnail icon if uploaded, empty if not — click to view full image

### Detail Panel (slide-in from right)

- Lead info: name, email, phone, business name, notes
- Reference number + amount
- Payment method selected
- Payment proof: full image preview
- **Status changer:** dropdown for `initiated → paid → setup_in_progress → live` (or `cancelled` from any state)
- Status history timeline
- Optional note when changing status

### Payment Methods Settings

Page at `/superadmin/checkout-leads/payment-methods` (or tab within dashboard):
- List of platform payment methods with drag-to-reorder
- Add/edit form: name, type (QR code / bank transfer / other), details text, QR code image upload, active toggle
- Delete with confirmation

## Technical Approach

### Service Layer
- `src/lib/checkout-leads/checkout-leads-service.ts` — CRUD operations, status transitions, analytics
- `src/lib/checkout-leads/reference-number.ts` — reference number generation
- `src/lib/checkout-leads/platform-payment-methods-service.ts` — payment method CRUD

### Server Actions
- `src/app/actions/checkout-leads.ts` — form submission (service role), status change, proof upload, payment method management

### Components
- `src/components/landing/checkout-form.tsx` — revamp existing form
- `src/app/checkout/confirmation/[ref]/page.tsx` — new confirmation page
- `src/app/superadmin/checkout-leads/page.tsx` — dashboard page
- `src/components/superadmin/checkout-leads/` — table, detail panel, stats, payment methods settings

### Image Upload
- Payment proof: upload to Cloudinary via existing `src/lib/cloudinary-utils.ts`
- QR code images for payment methods: same Cloudinary upload flow
