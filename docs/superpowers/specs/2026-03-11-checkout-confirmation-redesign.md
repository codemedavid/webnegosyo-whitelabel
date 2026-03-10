# Checkout Confirmation Screen Redesign

## Problem

The checkout confirmation screen exists but has UX polish issues:
1. The existing confirmation view is basic — plain text, small checkmark, no visual hierarchy
2. "Pending" badge undermines order confidence
3. Popup blockers silently swallow the Messenger redirect with only a toast as fallback
4. The order message is copyable but not visible — user must blindly trust clipboard
5. No clear visual separation between "order placed" and "what to do next"

Note: Core architecture is sound — `completedOrderData` snapshot, `checkoutCompleteRef` race condition fix, and fire-and-forget webhook are all working correctly. This is a **visual redesign and UX enhancement**, not a structural fix.

## Solution

Redesign the confirmation view within the existing checkout page. No new routes or architectural changes.

## Design Decisions

- **Order confidence first**: Prominent animated checkmark, "Order Placed!", full order summary — before any Messenger actions
- **Universal success theme**: Green/neutral colors, not tenant-branded, so it reads as a "receipt" phase. Replace all orange (`text-orange-600`, `bg-orange-500`, `border-orange-300`) with green equivalents.
- **Same Messenger format**: Reuse `generateMessengerMessage()` output for the copyable text
- **Messenger opens in new tab**: `window.open('_blank')` fires via `useEffect` on `checkoutComplete`, confirmation screen stays

## Out of Scope

- Payment Details Dialog (`showPaymentDetails` state, QR code dialog) — remains unchanged
- Order creation logic (Phases 1-3 of `handleCheckout`)
- `generateMessengerMessage()` function
- Cart context and `clearCart()` logic
- Proactive webhook to `/api/messenger/send-order-public` (conditional on `!useDirectMode && isFacebookPageConnected && orderCreated`)
- All four Messenger URL generation paths (`generateMessengerDirectUrl`, `generateMessengerCombinedUrl`, `generateMessengerUrl`, null fallback)

## Confirmation Screen Layout (top to bottom)

### 1. Success Hero
- Animated green checkmark using Tailwind `animate-` class with custom `@keyframes` (scale-in + fade effect, defined inline via Tailwind arbitrary values — no config change needed)
- Replace current `CheckCircle2` icon (static, small) with a larger animated version
- **"Order Placed!"** heading replaces "Thank You!"
- "Your order has been sent to [Restaurant Name]" subtitle
- **Remove** the yellow "Pending" badge — it undermines order confidence
- Green/white color scheme throughout

### 2. Order Summary Card
- "Order Summary" header
- Each item: name, quantity, variation/addons, unit price, line total
- Subtotal line
- Delivery fee (if applicable)
- Service charge (if applicable)
- Bold grand total in **green** (replacing `text-orange-600`)

### 3. Customer Info Card
- Order type shown as text label (e.g., "Dine In", "Delivery") — no icon mapping needed since `completedOrderData` only stores `orderTypeName` string
- Customer name, phone, address (rendered from form fields)
- Payment method name and details

### 4. Messenger Action Section
- **If Messenger URL exists:**
  - Primary "Go to Messenger" button (green, full-width, prominent) — `<a href={messengerUrl} target="_blank" rel="noopener noreferrer">` for reliable cross-browser behavior
  - Helper text: "Tap to confirm your order with the restaurant"
  - If popup was auto-blocked: amber banner "We couldn't open Messenger automatically. Tap the button below."
- **If Messenger URL is empty/null:**
  - Yellow info banner: "Copy the order message below and send it to the restaurant."

### 5. Order Message Box
- Collapsible section using Shadcn `Collapsible` component
- **Auto-expanded** if Messenger URL is empty OR popup was blocked; **collapsed** otherwise
- Full `generateMessengerMessage()` text in a styled `whitespace-pre-wrap` container
- "Copy Order Message" button with "Copied!" feedback (reuse existing clipboard logic, but move it to confirmation scope instead of payment dialog scope)
- Helper text: "Paste this in Messenger or any chat app"

### 6. Footer
- "Back to Menu" ghost/link button

## State Changes

### New state:
- `popupBlocked: boolean` — set to true if `window.open` returns null/closed

### Timing fix:
- Replace the current `setTimeout(() => { window.open(...) }, 500)` with a `useEffect` that triggers on `checkoutComplete` becoming true
- The `useEffect` calls `window.open`, checks the return value, and sets `popupBlocked` if null
- This ensures the DOM has painted before the popup attempt, and avoids the arbitrary 500ms delay

### Toast changes:
- Keep `toast.success('Order placed!')`
- Remove `toast.info("Messenger popup was blocked...")` — replaced by in-page banner on confirmation screen
- No "Redirecting to Messenger..." toast (doesn't exist in current code, confirming)

## Files to modify

- `src/app/[tenant]/checkout/page.tsx` — Confirmation view UI redesign, `popupBlocked` state, `useEffect` for `window.open`, remove popup toast, Collapsible import
- No new files, no new dependencies (Shadcn `Collapsible` already in project)
