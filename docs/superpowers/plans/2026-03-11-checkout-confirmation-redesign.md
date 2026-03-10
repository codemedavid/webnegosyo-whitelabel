# Checkout Confirmation Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the checkout confirmation view to give customers clear order confidence, visible order text for manual copy, and reliable Messenger access via a button instead of auto-redirect.

**Architecture:** Single-file enhancement of the existing confirmation view in `src/app/[tenant]/checkout/page.tsx`. No new routes, no new components, no new dependencies. The existing `completedOrderData` snapshot and `checkoutCompleteRef` race condition fix remain untouched. We add a `popupBlocked` state, replace the `setTimeout` + `window.open` with a `useEffect`, and redesign the confirmation JSX.

**Tech Stack:** Next.js 15, React 18, Tailwind CSS, Lucide icons, Sonner toasts

**Spec:** `docs/superpowers/specs/2026-03-11-checkout-confirmation-redesign.md`

**Important notes:**
- The spec uses Shadcn `Collapsible` but it's not installed in this project. We use a simple `messageExpanded` state toggle instead — same UX, zero new dependencies.
- The `useEffect` + `window.open` will almost certainly be blocked by popup blockers (not a user-initiated event). The "Go to Messenger" `<a>` button is the **primary** path for customers; the auto-open is a best-effort bonus.
- After the redesign, `Badge` import becomes unused (the "Pending" badge is removed). Lint will catch it — remove it in the cleanup task.
- All line numbers reference the **original** file state before any edits. Use code pattern matching (search for the exact strings) rather than relying on line numbers after Task 1 modifies the file.

---

## Chunk 1: All Changes (Single Task)

### Task 1: Add state, replace setTimeout, and redesign confirmation view

This is a single atomic change. We do all modifications together and commit once.

**Files:**
- Modify: `src/app/[tenant]/checkout/page.tsx`

#### Part A: Add new state variables

- [ ] **Step 1: Add `popupBlocked` and `messageExpanded` state**

Find this line (currently line 64):
```tsx
const [copiedText, setCopiedText] = useState<string | null>(null)
```

Add after it:
```tsx
const [popupBlocked, setPopupBlocked] = useState(false)
const [messageExpanded, setMessageExpanded] = useState(false)
```

#### Part B: Add useEffect for Messenger popup

- [ ] **Step 2: Add useEffect for Messenger window.open**

Find the cart-empty-redirect useEffect (search for `// Redirect to menu if cart is empty`). After that entire useEffect block ends (after the closing `}, [items.length, router, tenantSlug, isLoading, isProcessing, checkoutComplete])`), add:

```tsx
  // Attempt to open Messenger in new tab when checkout completes
  // Note: this will likely be blocked by popup blockers since it's not user-initiated.
  // The "Go to Messenger" <a> button is the primary path for customers.
  useEffect(() => {
    if (!checkoutComplete || !completedOrderData?.messengerUrl) {
      if (checkoutComplete && !completedOrderData?.messengerUrl) {
        setMessageExpanded(true)
      }
      return
    }
    requestAnimationFrame(() => {
      try {
        const newWindow = window.open(completedOrderData.messengerUrl, '_blank', 'noopener,noreferrer')
        if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
          setPopupBlocked(true)
          setMessageExpanded(true)
        }
      } catch {
        setPopupBlocked(true)
        setMessageExpanded(true)
      }
    })
  }, [checkoutComplete, completedOrderData?.messengerUrl])
```

#### Part C: Remove the old setTimeout block

- [ ] **Step 3: Remove setTimeout window.open from handleCheckout**

Find this block inside `handleCheckout()` (search for `// Try to open Messenger in new tab after a short delay`):

```tsx
      // Try to open Messenger in new tab after a short delay
      setTimeout(() => {
        if (!messengerUrl) return
        try {
          const newWindow = window.open(messengerUrl, '_blank', 'noopener,noreferrer')
          if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
            toast.info("Messenger popup was blocked. Tap 'Open Messenger' on the screen below.")
          }
        } catch {
          // Silently fail — user can use the button on confirmation screen
        }
      }, 500)
```

Replace with:
```tsx
      // Messenger window.open is handled by useEffect triggered by checkoutComplete state
```

**Important:** Verify that `toast.success('Order placed! 🎉')` on the line above (inside Phase 4) is preserved. Do NOT remove it.

#### Part D: Add keyframe animation to globals.css

- [ ] **Step 4: Add scale-in keyframe to global CSS**

Find `src/app/globals.css`. Add the following at the end of the file:

```css
@keyframes scale-in {
  0% { transform: scale(0); opacity: 0; }
  60% { transform: scale(1.2); }
  100% { transform: scale(1); opacity: 1; }
}
```

#### Part E: Replace the confirmation view JSX

- [ ] **Step 5: Replace the entire confirmation view**

Find the block starting with `// Order Confirmation / Thank You view` (search for this exact comment). Replace everything from that comment through the matching closing `}` of the if-block (the line that is just `  }` before `return (` for the main checkout form) with:

```tsx
  // Order Confirmation / Thank You view
  if (checkoutComplete && completedOrderData) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50/40 to-white">
        <main className="container mx-auto px-4 py-8">
          <div className="mx-auto max-w-2xl space-y-6">

            {/* Success Hero */}
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center w-24 h-24 bg-green-100 rounded-full mb-5">
                <CheckCircle2 className="h-14 w-14 text-green-600 animate-[scale-in_0.4s_ease-out]" />
              </div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Order Placed!</h1>
              <p className="text-gray-500 text-lg">Your order has been sent to {tenant.name}</p>
            </div>

            {/* Order Summary */}
            <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
              <h2 className="text-lg font-bold text-gray-900 mb-1">Order Summary</h2>
              {completedOrderData.orderTypeName && (
                <p className="text-sm text-gray-500 mb-4">{completedOrderData.orderTypeName}</p>
              )}

              <div className="space-y-3">
                {completedOrderData.items.map((item, index) => (
                  <div key={item.id}>
                    {index > 0 && <Separator className="my-3" />}
                    <div className="flex justify-between">
                      <div className="flex-1 mr-4">
                        <span className="font-medium text-sm">{item.menu_item.name}</span>
                        {item.selected_variation && (
                          <span className="text-xs text-muted-foreground"> ({item.selected_variation.name})</span>
                        )}
                        {item.selected_variations && Object.keys(item.selected_variations).length > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {' '}({Object.values(item.selected_variations).map(opt => opt.name).join(', ')})
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground"> x{item.quantity}</span>
                        {item.selected_addons.length > 0 && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Add-ons: {item.selected_addons.map(a => a.name).join(', ')}
                          </p>
                        )}
                        {item.special_instructions && (
                          <p className="text-xs italic text-muted-foreground mt-0.5">
                            Note: {item.special_instructions}
                          </p>
                        )}
                      </div>
                      <span className="font-semibold text-sm flex-shrink-0">{formatPrice(item.subtotal)}</span>
                    </div>
                  </div>
                ))}

                <Separator className="my-3" />

                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="font-medium">{formatPrice(completedOrderData.total)}</span>
                </div>

                {completedOrderData.deliveryFee !== null && completedOrderData.deliveryFee > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Delivery Fee</span>
                    <span className="font-medium">{formatPrice(completedOrderData.deliveryFee)}</span>
                  </div>
                )}

                {completedOrderData.serviceChargeAmount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Service Charge</span>
                    <span className="font-medium">{formatPrice(completedOrderData.serviceChargeAmount)}</span>
                  </div>
                )}

                <Separator className="my-2" />

                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span className="text-green-700">
                    {formatPrice(completedOrderData.total + (completedOrderData.deliveryFee ?? 0) + completedOrderData.serviceChargeAmount)}
                  </span>
                </div>
              </div>
            </div>

            {/* Customer Information */}
            {completedOrderData.formFields.length > 0 && (
              <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
                <h2 className="text-lg font-bold text-gray-900 mb-4">Customer Information</h2>
                <div className="space-y-2">
                  {completedOrderData.formFields.map(field => {
                    const value = completedOrderData.customerData[field.field_name]
                    if (!value) return null
                    return (
                      <div key={field.field_name} className="flex justify-between text-sm">
                        <span className="text-gray-600">{field.field_label}</span>
                        <span className="font-medium text-right ml-4 max-w-[60%] break-words">{value}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Payment Method */}
            {completedOrderData.paymentMethodName && (
              <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
                <h2 className="text-lg font-bold text-gray-900 mb-2">Payment Method</h2>
                <p className="font-medium text-gray-900">{completedOrderData.paymentMethodName}</p>
                {completedOrderData.paymentMethodDetails && (
                  <p className="text-sm text-gray-600 mt-1">{completedOrderData.paymentMethodDetails}</p>
                )}
              </div>
            )}

            {/* Messenger Action Section */}
            <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100 space-y-4">
              {popupBlocked && completedOrderData.messengerUrl && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  We couldn&apos;t open Messenger automatically. Tap the button below to open it.
                </div>
              )}

              {completedOrderData.messengerUrl ? (
                <a
                  href={completedOrderData.messengerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center w-full h-12 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-full transition-colors text-base"
                >
                  <ExternalLink className="mr-2 h-5 w-5" />
                  Go to Messenger
                </a>
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  Copy the order message below and send it to the restaurant via Messenger or any chat app.
                </div>
              )}

              <p className="text-xs text-gray-400 text-center">
                Tap to confirm your order with the restaurant
              </p>
            </div>

            {/* Order Message Box (collapsible) */}
            <div className="rounded-2xl bg-white shadow-sm border border-gray-100 overflow-hidden">
              <button
                onClick={() => setMessageExpanded(!messageExpanded)}
                className="w-full flex items-center justify-between p-6 text-left hover:bg-gray-50 transition-colors"
              >
                <h2 className="text-lg font-bold text-gray-900">Order Message</h2>
                <span className="text-sm text-gray-400">{messageExpanded ? 'Hide' : 'Show'}</span>
              </button>

              {messageExpanded && (
                <div className="px-6 pb-6 space-y-3">
                  <div className="bg-gray-50 rounded-xl p-4 max-h-64 overflow-y-auto">
                    <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
                      {completedOrderData.messengerMessage}
                    </pre>
                  </div>

                  <Button
                    size="lg"
                    variant="outline"
                    className="w-full h-12 rounded-full border-green-300 text-green-700 hover:bg-green-50"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(completedOrderData.messengerMessage)
                        toast.success('Order message copied to clipboard!')
                      } catch {
                        toast.error('Failed to copy message')
                      }
                    }}
                  >
                    <Copy className="mr-2 h-5 w-5" />
                    Copy Order Message
                  </Button>

                  <p className="text-xs text-gray-400 text-center">
                    Paste this in Messenger or any chat app
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="pb-8">
              <Button
                size="lg"
                variant="ghost"
                className="w-full h-12 rounded-full text-gray-600 hover:text-gray-900"
                onClick={() => router.push(`/${tenantSlug}/menu`)}
              >
                <ArrowLeft className="mr-2 h-5 w-5" />
                Back to Menu
              </Button>
            </div>

          </div>
        </main>
      </div>
    )
  }
```

#### Part F: Clean up unused imports

- [ ] **Step 6: Remove unused `Badge` import**

The `Badge` import (line 9) is no longer used in the confirmation view. Check if `Badge` is used anywhere else in the file (search for `<Badge`). If it's used in the checkout form (e.g., the order type selection), keep it. If not, remove it from the import line.

Also check if `MessageCircle` (line 5) is used anywhere in the file — if not, remove it too.

#### Part G: Lint, verify, commit

- [ ] **Step 7: Run lint**

```bash
npm run lint
```

Fix any errors. Common issues: unused imports, missing `key` props, `&apos;` vs `'`.

- [ ] **Step 8: Commit all changes**

```bash
git add src/app/[tenant]/checkout/page.tsx src/app/globals.css
git commit -m "feat(checkout): redesign confirmation screen with order confidence, collapsible message, and Go to Messenger button

- Replace 'Thank You!' with 'Order Placed!' animated hero
- Green universal success theme (not tenant-branded)
- Collapsible order message box with copy-to-clipboard
- 'Go to Messenger' as <a> tag for reliable cross-browser behavior
- Popup blocked banner replaces toast for better visibility
- Auto-expand message section when Messenger unavailable"
```

---

## Chunk 2: Manual Testing Checklist

### Task 2: Verify all scenarios work

- [ ] **Step 1: Start dev server and test with a tenant that has Messenger configured**

```bash
npm run dev
```

Navigate to a tenant's checkout, add items, complete checkout. Verify:
1. Green confirmation screen with animated checkmark scale-in effect
2. "Order Placed!" heading (not "Thank You!")
3. No "Pending" badge
4. Order summary shows all items with correct prices/quantities
5. Total in green (not orange)
6. "Go to Messenger" green button opens Messenger in new tab
7. "Order Message" section is collapsible — starts collapsed if popup opened, expanded if blocked
8. "Copy Order Message" works and shows success toast
9. "Back to Menu" navigates back

- [ ] **Step 2: Test with a tenant that does NOT have Messenger configured**

1. Amber info banner shows asking to copy message
2. "Order Message" section auto-expanded
3. No "Go to Messenger" button visible
4. Copy button works

- [ ] **Step 3: Test popup blocker scenario**

1. Enable popup blocker in browser
2. Complete checkout
3. Amber "couldn't open automatically" banner appears
4. "Go to Messenger" button still works (user click bypasses blocker)
5. "Order Message" section auto-expanded
