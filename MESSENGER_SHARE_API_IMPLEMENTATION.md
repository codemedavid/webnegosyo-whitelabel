# Messenger Share API Implementation

## Overview
Implemented Web Share API for more reliable pre-filled messages in Messenger, especially on mobile devices.

## Problem
The previous `m.me` URL approach with `?text=` parameter sometimes doesn't pre-fill the message reliably, especially on mobile devices.

## Solution
Use the **Web Share API** which:
- Uses the device's native sharing capabilities
- More reliably pre-fills text in Messenger on mobile
- Falls back to URL redirect on desktop where Web Share API isn't available

## Implementation

### New Function: `shareToMessenger()`
Located in `src/lib/cart-utils.ts`

```typescript
export async function shareToMessenger(
  pageIdOrUsername: string | null | undefined,
  message: string,
  messengerUrl: string | null
): Promise<void>
```

**How it works:**
1. **Mobile devices**: Uses `navigator.share()` API
   - Opens native share sheet
   - User selects Messenger
   - Text is pre-filled in Messenger
   - More reliable than URL redirect

2. **Desktop devices**: Falls back to `window.location.href`
   - Uses the `m.me` URL with `?text=` parameter
   - Opens Messenger in browser

3. **Error handling**:
   - If user cancels share (AbortError), doesn't redirect
   - If share fails, falls back to URL redirect
   - If redirect fails, shows error with copy-to-clipboard option

### Updated Files

1. **`src/lib/cart-utils.ts`**
   - Added `shareToMessenger()` function
   - Fixed URL parameter from `?ref=` to `?text=` (was incorrect before)

2. **`src/app/[tenant]/checkout/page.tsx`**
   - Updated to use `shareToMessenger()` instead of direct redirect
   - Better error handling for user cancellation

3. **`src/components/landing/checkout-form.tsx`**
   - Updated to use `shareToMessenger()` instead of `window.open()`
   - Consistent behavior across the app

## User Experience

### Mobile (iOS/Android)
1. User completes checkout
2. Clicks "Send Order via Messenger"
3. Native share sheet appears
4. User selects Messenger
5. Messenger opens with text pre-filled
6. User just needs to tap "Send"

### Desktop
1. User completes checkout
2. Clicks "Send Order via Messenger"
3. Browser redirects to `m.me` URL
4. Messenger opens in browser with text pre-filled
5. User can send the message

## Benefits

✅ **More Reliable**: Web Share API uses native OS capabilities
✅ **Better UX**: Native share sheet feels more integrated
✅ **Cross-Platform**: Works on mobile and desktop
✅ **Graceful Fallback**: Falls back to URL if Web Share isn't available
✅ **Error Handling**: Handles user cancellation and errors gracefully

## Browser Support

- **Web Share API**: 
  - ✅ iOS Safari 12.1+
  - ✅ Chrome Android 61+
  - ✅ Samsung Internet 8.2+
  - ❌ Desktop browsers (falls back to URL)

- **URL Fallback**: Works on all platforms

## Testing

### Mobile Testing
1. Open checkout on mobile device
2. Complete order
3. Click "Send Order via Messenger"
4. Verify share sheet appears
5. Select Messenger
6. Verify text is pre-filled

### Desktop Testing
1. Open checkout on desktop
2. Complete order
3. Click "Send Order via Messenger"
4. Verify redirects to Messenger URL
5. Verify text is pre-filled in URL

## Notes

- The `messengerUrl` still uses `?text=` parameter for desktop fallback
- Web Share API requires HTTPS (works in production)
- User can cancel share without error (AbortError is handled)
- Clipboard fallback available if both methods fail

