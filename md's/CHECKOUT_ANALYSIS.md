# Checkout System Analysis

## Overview
The checkout system is a comprehensive, multi-stage order processing flow that integrates with Lalamove delivery, Mapbox address autocomplete, Facebook Messenger order confirmation, and flexible order type configurations.

## Architecture

### Core Components

#### 1. **Checkout Page** (`src/app/[tenant]/checkout/page.tsx`)
- **Type**: Client Component (`'use client'`)
- **Lines**: 558 lines
- **Primary Responsibilities**:
  - Order type selection
  - Customer information collection
  - Order summary display
  - Lalamove delivery fee calculation
  - Messenger integration

#### 2. **Cart Management** (`src/hooks/useCart.tsx`)
- **Type**: React Context + Hook
- **Lines**: 252 lines
- **Features**:
  - Cart state management with localStorage persistence
  - Order type tracking
  - Add/remove/update item operations
  - Cart calculations (subtotal, total, item count)

#### 3. **Order Processing** (`src/lib/orders-service.ts`)
- **Type**: Server-side service
- **Lines**: 290 lines
- **Features**:
  - Order creation with items
  - Order status management
  - Automatic Lalamove order creation on confirmation
  - Order statistics

---

## Checkout Flow

### Stage 1: Order Type Selection

**Location**: Lines 292-330 in checkout page

```typescript
// Features:
- Dynamic order types from Supabase (dine-in, pickup, delivery)
- Visual card-based selection UI
- Icons for each order type
- Persisted in cart context
```

**Order Types Configuration**:
- Loaded from `order_types` table
- Filtered by `is_enabled` flag
- Sorted by `order_index`
- Tenant-specific

### Stage 2: Customer Information Form

**Location**: Lines 332-450 in checkout page

**Dynamic Form Fields**:
- Loaded based on selected order type
- Supports multiple field types:
  - `text` - Standard text input
  - `email` - Email validation
  - `phone` - Phone number with Philippines formatting (+63)
  - `number` - Numeric input
  - `textarea` - Multi-line text
  - `select` - Dropdown with options

**Special Features**:

1. **Delivery Address Autocomplete** (Lines 346-363):
   - Mapbox-powered address search
   - Coordinates capture (lat/lng)
   - Fallback to regular input if Mapbox disabled

2. **Philippines Phone Number Handling** (Lines 383-436):
   - Auto-formatting with +63 prefix
   - 10-digit validation
   - Prevents leading zeros
   - Character counter
   - Market-specific (only for PH market)

3. **Required Field Validation** (Lines 169-176):
   - Client-side validation before submission
   - Toast error messages for missing fields

### Stage 3: Lalamove Delivery Fee Calculation

**Location**: Lines 100-164 in checkout page

**Workflow**:
```
1. Check if order type is "delivery"
2. Verify Lalamove is enabled for tenant
3. Confirm restaurant address is configured
4. Wait for customer delivery address with coordinates
5. Create quotation via API
6. Display delivery fee in order summary
7. Store quotation ID for later order creation
```

**Key Features**:
- Real-time fee calculation as user types address
- Loading state indicator
- Error handling with user feedback
- Quotation caching for order creation
- Restaurant coordinates required

**Quotation Validity**:
- Expires after 5 minutes per Lalamove API
- Validity check before order creation
- Sandbox mode more lenient (allows retries)

### Stage 4: Order Summary

**Location**: Lines 452-518 in checkout page

**Display Elements**:
- Cart items with variations and add-ons
- Quantity per item
- Special instructions
- Individual item subtotals
- Delivery fee (if applicable)
- Grand total

**Price Calculation**:
```typescript
Base Price + Variation Modifier + Add-ons Price × Quantity = Item Subtotal
Sum of all Item Subtotals + Delivery Fee = Grand Total
```

### Stage 5: Order Submission

**Location**: Lines 166-252 in checkout page

**Submission Flow**:
```
1. Validate required form fields
2. Check if order management is enabled
3. If enabled: Save order to database
   - Create order record
   - Create order items
   - Store customer data
   - Store quotation ID
4. Generate Messenger message
5. Generate Messenger URL
6. Clear cart
7. Redirect to Messenger
```

**Messenger Integration**:
- Pre-filled message with order details
- Customer information included
- Order type specified
- Formatted for readability
- Uses tenant's Messenger username or page ID

**Order Management Toggle**:
- If enabled: Orders saved to database
- If disabled: Only Messenger notification
- Graceful degradation (continues if save fails)

---

## Data Flow

### Input Sources

1. **Tenant Data**:
   - Loaded via `getTenantBySlugSupabase()`
   - Includes: branding, Messenger config, Lalamove settings

2. **Order Types**:
   - Loaded via `getEnabledOrderTypesByTenantClient()`
   - Filtered by tenant and enabled status

3. **Form Fields**:
   - Loaded via `getCustomerFormFieldsByOrderTypeClient()`
   - Dynamic based on selected order type

4. **Cart State**:
   - From `useCart()` hook
   - Persisted in localStorage

### Output Destinations

1. **Database** (if order management enabled):
   - `orders` table: Main order record
   - `order_items` table: Individual items
   - Includes: customer data, order type, delivery fee, quotation ID

2. **Messenger**:
   - Pre-formatted message
   - Customer and order details
   - URL with `text` parameter

3. **Lalamove** (for delivery orders):
   - Quotation created during checkout
   - Order created on confirmation (server-side)

---

## Integration Points

### 1. Mapbox Integration

**Component**: `MapboxAddressAutocomplete`
**Features**:
- Address search with autocomplete
- Coordinate capture
- Map picker dialog
- Current location detection
- POI snapping
- Geocode caching

**Fallback**:
- Regular input if Mapbox disabled
- Can be toggled per tenant
- Environment variable: `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`

### 2. Lalamove Integration

**Key Actions**:
- `createQuotationAction()`: Get delivery fee
- `createLalamoveOrderAction()`: Create actual delivery order

**Workflow**:
```
Checkout:
├── Create Quotation (get price)
├── Store quotation ID
└── Complete checkout

Order Confirmation:
├── Trigger on status change to "confirmed"
├── Automatic Lalamove order creation
├── Phone number normalization (+63)
├── Update order with Lalamove details
└── Store tracking URL
```

**Phone Normalization**:
- Handles various formats: 09xxxxxxxxx, 9xxxxxxxxx, 639xxxxxxxxx
- Converts to E.164 format: +639xxxxxxxxx
- Market-specific rules

### 3. Facebook Messenger Integration

**Message Format**:
```
🍽️ New Order from {Restaurant Name}

📋 Order Type: {Icon} {Order Type Name}

👤 Customer Information:
👤 Name: {Customer Name}
📞 Phone: {Phone}
📧 Email: {Email}
📍 Address: {Delivery Address}

📋 Order Details:
1. {Item Name} ({Variation}) x{Quantity}
   Add-ons: {Add-on 1, Add-on 2}
   Special: {Special Instructions}
   Price: ₱XXX.XX

💰 Total: ₱XXX.XX

📍 Please confirm your order!
```

**URL Generation**:
- Uses `m.me/{username}` or `m.me/{pageId}`
- Message URL-encoded in `text` parameter
- Opens Messenger app or web interface

---

## State Management

### Cart Context State

```typescript
interface CartContextType {
  items: CartItem[]              // Cart items
  total: number                  // Calculated total
  item_count: number             // Total item quantity
  orderType: string | null       // Selected order type ID
  setOrderType: (id) => void     // Update order type
  addItem: (...) => void         // Add to cart
  removeItem: (id) => void       // Remove from cart
  updateQuantity: (...) => void  // Update quantity
  clearCart: () => void          // Clear all items
  getItem: (id) => CartItem      // Get specific item
}
```

### Local Component State

**Checkout Page State Variables**:
- `tenant`: Tenant data
- `orderTypes`: Available order types
- `formFields`: Dynamic form fields
- `customerData`: Form input values
- `deliveryFee`: Calculated Lalamove fee
- `quotationId`: Lalamove quotation reference
- `isProcessing`: Submission in progress
- `isFetchingDeliveryFee`: Loading delivery fee

### Persistence Strategy

1. **Cart Items**: localStorage (`restaurant_cart`)
2. **Order Type**: localStorage (`restaurant_order_type`)
3. **Customer Data**: Component state only (cleared on submission)
4. **Form Progress**: Not persisted (lost on page refresh)

---

## Validation & Error Handling

### Client-Side Validation

1. **Required Fields** (Lines 169-176):
   - Checks all fields marked `is_required`
   - Shows toast with missing field names
   - Prevents submission

2. **Phone Number** (Lines 406-424):
   - Digit-only validation
   - Length limit (10 digits for PH)
   - Prevents leading zeros

3. **Empty Cart** (Lines 94-98):
   - Redirects to menu if cart empty
   - Prevents checkout with no items

### Error Scenarios & Handling

1. **Tenant Not Found**:
   - Shows error toast
   - Redirects to home page

2. **Order Creation Fails**:
   - Logs warning
   - Shows warning toast
   - **Still continues to Messenger** (graceful degradation)

3. **Delivery Fee Calculation Fails**:
   - Shows error toast
   - Sets fee to null
   - Allows checkout without fee

4. **Mapbox API Fails**:
   - Falls back to Google Places API
   - Final fallback: regular text input

5. **Lalamove Quotation Expires**:
   - User must re-enter address
   - New quotation created
   - Production blocks, sandbox allows

---

## Performance Considerations

### Optimization Strategies

1. **Lazy Loading**:
   - Mapbox library loaded only when needed
   - Google Places API loaded on mount
   - Map initialization delayed until dialog opens

2. **Debouncing**:
   - Marker drag end events (500ms)
   - Search input (automatic via useEffect dependencies)

3. **Caching**:
   - Geocode results cached (4 decimal precision)
   - Reduces redundant API calls
   - Memory-based (cleared on page refresh)

4. **Conditional Rendering**:
   - Form fields only shown when order type selected
   - Map only initialized when dialog opens
   - Delivery fee only fetched for delivery orders

### Loading States

- Initial page load: Full-screen spinner
- Delivery fee: "calculating..." text with animated dots
- Current location: Pulsing icon
- Processing order: Spinner in button with disabled state

---

## Security Considerations

### Authentication

- No authentication required for checkout
- Orders can be placed by anyone
- Customer info stored in order record

### Data Validation

**Client-Side**:
- Required field checks
- Phone format validation
- Empty cart prevention

**Server-Side** (in `orders-service.ts`):
- Tenant verification for admin operations
- Order ownership validation
- Status update permissions

### API Key Exposure

**Public Keys** (Safe):
- `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

**Private Keys** (Server-only):
- Lalamove API credentials
- Supabase service role key

---

## Database Schema Interactions

### Tables Used

1. **tenants**:
   - Read: Configuration, branding, Lalamove settings
   - Fields: `lalamove_enabled`, `messenger_username`, `mapbox_enabled`

2. **order_types**:
   - Read: Available order types
   - Filter: `is_enabled = true`

3. **customer_form_fields**:
   - Read: Dynamic form configuration
   - Filter: By order type and tenant

4. **orders**:
   - Write: Create new order
   - Fields: All order data, customer info, delivery fee

5. **order_items**:
   - Write: Create order items
   - Fields: Item details, variations, add-ons

### Automatic Behaviors

**Order Confirmation Trigger** (in `orders-service.ts` lines 94-162):
```typescript
When order status changes to "confirmed":
├── Check if Lalamove quotation exists
├── Check if Lalamove order not yet created
├── Extract customer info from order
├── Get tenant details for sender info
├── Normalize phone numbers
└── Asynchronously create Lalamove order
```

---

## Configuration Options

### Tenant-Level Settings

1. **enable_order_management** (boolean):
   - `true`: Save orders to database
   - `false`: Only send to Messenger

2. **lalamove_enabled** (boolean):
   - `true`: Show delivery fee, create orders
   - `false`: No delivery fee calculation

3. **mapbox_enabled** (boolean):
   - `true`: Show address autocomplete
   - `false`: Regular text input

4. **messenger_username** (string):
   - If set: Use username in URL
   - Fallback: Use `messenger_page_id`

5. **lalamove_market** (string):
   - Determines phone format
   - Example: "PH" → +63 prefix

### Order Type Configuration

Each order type can have:
- Custom form fields
- Field types and validation
- Required/optional fields
- Placeholder text
- Field ordering

---

## User Experience Flow

### Happy Path

1. User clicks "Checkout" from cart
2. **Order Type Selection**: 
   - Sees 2-3 order type cards
   - Clicks preferred type (e.g., Delivery)
3. **Customer Information**:
   - Form appears with dynamic fields
   - For delivery: Sees address autocomplete
   - Clicks location button or types address
   - Address suggestions appear
   - Selects address from list
   - Delivery fee appears (if Lalamove enabled)
4. **Order Summary**:
   - Reviews items and total
   - Sees delivery fee included
5. **Submit**:
   - Clicks "Send Order via Messenger"
   - Brief loading state
   - Success toast
   - Redirected to Messenger with pre-filled message
6. **Messenger**:
   - Reviews message
   - Sends to restaurant
   - Order appears in admin panel (if enabled)

### Error Recovery

**Address not found**:
- Can use map picker instead
- Can manually type address
- Can use current location

**Delivery fee fails**:
- Order continues without fee
- Can still complete checkout
- Fee calculated manually by restaurant

**Order save fails**:
- Warning shown but continues
- Message sent to Messenger
- Restaurant can create manually

---

## Testing Scenarios

### Functional Tests

1. **Order Type Selection**:
   - [ ] Multiple order types display correctly
   - [ ] Selected type is highlighted
   - [ ] Form fields update when type changes

2. **Form Validation**:
   - [ ] Required fields prevent submission
   - [ ] Optional fields can be empty
   - [ ] Phone number formats correctly
   - [ ] Email validation works

3. **Address Autocomplete**:
   - [ ] Search returns relevant results
   - [ ] Selecting result fills address
   - [ ] Coordinates are captured
   - [ ] Map picker works
   - [ ] Current location works
   - [ ] Fallback input works if Mapbox disabled

4. **Delivery Fee**:
   - [ ] Fee calculates when address entered
   - [ ] Fee updates if address changes
   - [ ] Loading state shows during calculation
   - [ ] Error handling if API fails

5. **Order Submission**:
   - [ ] Order saves to database (if enabled)
   - [ ] Messenger URL generates correctly
   - [ ] Cart clears after submission
   - [ ] Redirect to Messenger happens

### Edge Cases

1. **Empty cart** → Should redirect to menu
2. **No order types enabled** → Should show error or empty state
3. **Lalamove quotation expires** → Should show error, require new address
4. **Network failure during submission** → Should show error, allow retry
5. **Very long special instructions** → Should handle gracefully
6. **Multiple rapid form submissions** → Should prevent with `isProcessing` state

### Browser Compatibility

- **localStorage** required for cart persistence
- **Geolocation API** for current location
- **Fetch API** for all network requests
- **Modern JavaScript** (async/await, optional chaining)

---

## Potential Improvements

### User Experience

1. **Form Progress Saving**:
   - Save customer data to localStorage
   - Restore if user navigates away
   - Clear after successful submission

2. **Address History**:
   - Remember previous addresses
   - Quick select from history
   - Per-device storage

3. **Estimated Delivery Time**:
   - Show Lalamove ETA
   - Display in order summary

4. **Order Confirmation Page**:
   - Instead of immediate redirect
   - Show order number
   - Show Messenger link as option
   - Provide QR code for easy access

5. **Guest Checkout Optimization**:
   - Pre-fill form from previous orders (via localStorage)
   - Remember order type preference

### Technical Improvements

1. **Form State Management**:
   - Use React Hook Form for validation
   - Better error messages per field
   - Real-time validation feedback

2. **Error Boundaries**:
   - Catch component errors
   - Graceful degradation
   - Error reporting

3. **Analytics**:
   - Track checkout funnel
   - Monitor drop-off points
   - A/B testing for UI variations

4. **Optimistic Updates**:
   - Show success immediately
   - Background order creation
   - Rollback if fails

5. **Progressive Enhancement**:
   - Work without JavaScript
   - Server-side form submission
   - Enhanced with client-side features

### Performance

1. **Code Splitting**:
   - Lazy load Mapbox components
   - Split checkout into steps
   - Reduce initial bundle size

2. **Image Optimization**:
   - Menu item images in order summary
   - WebP format with fallbacks
   - Lazy loading

3. **API Request Optimization**:
   - Batch form field requests
   - Cache order type data
   - Prefetch on cart page

### Security

1. **Rate Limiting**:
   - Limit order submissions per IP
   - Prevent abuse
   - Protect API quotas

2. **Input Sanitization**:
   - Server-side validation
   - SQL injection prevention
   - XSS protection

3. **CSRF Protection**:
   - Add CSRF tokens
   - Validate on server

---

## Monitoring & Observability

### Key Metrics to Track

1. **Conversion Metrics**:
   - Cart to checkout rate
   - Checkout to order completion rate
   - Average time in checkout

2. **Error Rates**:
   - Delivery fee calculation failures
   - Order creation failures
   - Messenger redirect issues

3. **API Usage**:
   - Mapbox API calls
   - Lalamove API calls
   - Cost per order

4. **User Behavior**:
   - Most popular order types
   - Most used payment methods
   - Common addresses

### Logging Points

1. Order submission attempts
2. Order creation failures
3. Delivery fee calculation errors
4. Mapbox/Lalamove API errors
5. Form validation failures

---

## Maintenance Considerations

### Regular Updates Needed

1. **Mapbox Library**:
   - Keep version updated
   - Check for breaking changes
   - Monitor deprecations

2. **Lalamove SDK**:
   - API version updates
   - Market-specific changes
   - Pricing model changes

3. **Phone Number Formats**:
   - Update for new markets
   - Validate E.164 compliance
   - Test international numbers

### Backwards Compatibility

- Old orders in database remain accessible
- Form field schema changes need migration
- Order type changes don't break existing orders

---

## Dependencies

### NPM Packages

- `@lalamove/lalamove-js`: Delivery integration
- `mapbox-gl`: Map and geocoding
- `sonner`: Toast notifications
- `next`: Framework
- `react`: UI library
- `lucide-react`: Icons

### External Services

- **Mapbox**: Geocoding, mapping, address search
- **Google Places**: Fallback address search
- **Lalamove**: Delivery logistics
- **Facebook Messenger**: Order communication
- **Supabase**: Database, authentication

### Environment Variables Required

```bash
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=pk_xxx
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIza_xxx
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ_xxx
```

---

## Conclusion

The checkout system is a robust, feature-rich implementation that:

✅ **Strengths**:
- Flexible order type configuration
- Real-time delivery fee calculation
- Excellent address autocomplete UX
- Graceful error handling
- Multiple integration points
- Messenger integration for easy communication

⚠️ **Areas for Improvement**:
- Form state not persisted
- No order confirmation page
- Limited error recovery options
- Could benefit from form library
- Analytics not implemented

🎯 **Overall Assessment**: 
The checkout flow is well-architected with good separation of concerns, comprehensive error handling, and excellent user experience considerations. The integration with Lalamove and Mapbox is sophisticated and handles edge cases well. The main areas for improvement are around state persistence and user feedback after order submission.

