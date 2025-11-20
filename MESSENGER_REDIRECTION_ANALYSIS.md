# Messenger Redirection Analysis

## Overview

The application implements messenger redirection functionality in two main contexts:
1. **Tenant Checkout Flow** - Redirects customers to Messenger after completing checkout
2. **Landing Page Checkout Form** - Opens Messenger for plan purchases

## Implementation Details

### 1. Tenant Checkout Flow (`src/app/[tenant]/checkout/page.tsx`)

#### Flow
1. User completes checkout form (order type, customer info, payment method)
2. System optionally creates order in database (if `enable_order_management` is enabled)
3. Generates formatted messenger message with order details
4. Creates messenger URL with pre-filled message
5. Redirects user to Messenger after 1 second delay

#### Key Code Sections

```348:363:src/app/[tenant]/checkout/page.tsx
      const messengerUrl = generateMessengerUrl(
        tenant.messenger_username || tenant.messenger_page_id,
        message,
        !tenant.messenger_username
      )

      // Clear cart
      clearCart()

      // Show success message
      toast.success('Redirecting to Messenger...')

      // Redirect to Messenger
      setTimeout(() => {
        window.location.href = messengerUrl
      }, 1000)
```

#### Messenger URL Generation

```191:201:src/lib/cart-utils.ts
export function generateMessengerUrl(
  pageIdOrUsername: string,
  message: string,
  usePageId = false
): string {
  const encodedMessage = encodeURIComponent(message)
  if (usePageId) {
    return `https://m.me/${pageIdOrUsername}?text=${encodedMessage}`
  }
  return `https://m.me/${pageIdOrUsername}?text=${encodedMessage}`
}
```

**Note**: The `usePageId` parameter appears to be unused - both branches return the same URL format. This might be a bug or legacy code.

#### Message Generation

```93:186:src/lib/cart-utils.ts
export function generateMessengerMessage(
  items: CartItem[],
  restaurantName: string,
  orderCreated: boolean = true,
  orderType?: { name: string; type: string } | null,
  customerData?: Record<string, string>,
  paymentMethod?: { name: string; details?: string } | null
): string {
  const lines = [
    `🍽️ New Order from ${restaurantName}`,
    '',
  ]

  // Add order type information
  if (orderType) {
    const orderTypeEmoji = {
      dine_in: '🍽️',
      pickup: '📦',
      delivery: '🚚',
    }
    lines.push(`📋 Order Type: ${orderTypeEmoji[orderType.type as keyof typeof orderTypeEmoji] || '📋'} ${orderType.name}`)
    lines.push('')
  }

  // Add customer information
  if (customerData) {
    const customerInfo = []
    if (customerData.customer_name) customerInfo.push(`👤 Name: ${customerData.customer_name}`)
    if (customerData.customer_phone) customerInfo.push(`📞 Phone: ${customerData.customer_phone}`)
    if (customerData.customer_email) customerInfo.push(`📧 Email: ${customerData.customer_email}`)
    if (customerData.delivery_address) customerInfo.push(`📍 Address: ${customerData.delivery_address}`)
    if (customerData.table_number) customerInfo.push(`🪑 Table: ${customerData.table_number}`)
    
    if (customerInfo.length > 0) {
      lines.push('👤 Customer Information:')
      lines.push(...customerInfo)
      lines.push('')
    }
  }

  lines.push('📋 Order Details:')

  items.forEach((item, index) => {
    // Handle both new and legacy variation formats
    let variationText = ''
    if (item.selected_variations) {
      // New format: multiple variations
      const variations = Object.entries(item.selected_variations)
        .map(([, option]) => option.name)
        .join(', ')
      variationText = variations ? ` (${variations})` : ''
    } else if (item.selected_variation) {
      // Legacy format: single variation
      variationText = ` (${item.selected_variation.name})`
    }
    
    lines.push(`${index + 1}. ${item.menu_item.name}${variationText} x${item.quantity}`)

    if (item.selected_addons.length > 0) {
      const addonsText = item.selected_addons.map((a) => a.name).join(', ')
      lines.push(`   Add-ons: ${addonsText}`)
    }

    if (item.special_instructions) {
      lines.push(`   Special: ${item.special_instructions}`)
    }

    lines.push(`   Price: ${formatPrice(item.subtotal)}`)
    lines.push('')
  })

  const total = calculateCartTotal(items)
  lines.push(`💰 Total: ${formatPrice(total)}`)
  lines.push('')

  // Add payment method information
  if (paymentMethod) {
    lines.push('💳 Payment Method:')
    lines.push(`   ${paymentMethod.name}`)
    if (paymentMethod.details) {
      lines.push(`   ${paymentMethod.details}`)
    }
    lines.push('')
  }
  
  if (!orderCreated) {
    lines.push('⚠️ Note: Order was not saved to system - please create manually in admin panel')
    lines.push('')
  }
  
  lines.push('📍 Please confirm your order!')

  return lines.join('\n')
}
```

### 2. Landing Page Checkout Form (`src/components/landing/checkout-form.tsx`)

#### Flow
1. User fills out plan purchase form
2. Validates form data
3. Generates formatted message
4. Opens Messenger in new tab (not redirect)

#### Key Code Sections

```130:169:src/components/landing/checkout-form.tsx
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    setIsSubmitting(true)

    try {
      const message = formatMessage(formData)
      const encodedMessage = encodeURIComponent(message)
      const messengerUrl = `https://m.me/${FACEBOOK_PAGE_USERNAME}?text=${encodedMessage}`

      // Open Messenger in new tab
      window.open(messengerUrl, '_blank')

      // Show success message
      toast.success('Opening Messenger... Please send the pre-filled message to complete your order.')

      // Reset form after a delay
      setTimeout(() => {
        setFormData({
          name: '',
          email: '',
          phone: '',
          businessName: '',
          plan: 'starter',
          paymentMethod: 'gcash',
          notes: '',
        })
        setErrors({})
      }, 2000)
    } catch (error) {
      console.error('Error submitting form:', error)
      toast.error('Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }
```

**Note**: Uses hardcoded `FACEBOOK_PAGE_USERNAME = 'WebNegosyoOfficial'` instead of tenant-specific configuration.

## Configuration

### Tenant Messenger Settings

Tenants can configure:
- **`messenger_page_id`** (required): Facebook Page ID
- **`messenger_username`** (optional): Facebook Page username

**Priority Logic**:
- If `messenger_username` exists → uses `m.me/{username}`
- Otherwise → uses `m.me/{page_id}`

```348:352:src/app/[tenant]/checkout/page.tsx
      const messengerUrl = generateMessengerUrl(
        tenant.messenger_username || tenant.messenger_page_id,
        message,
        !tenant.messenger_username
      )
```

## Potential Issues & Edge Cases

### 1. **Missing Messenger Configuration**
- **Issue**: If both `messenger_username` and `messenger_page_id` are missing/null, the URL will be invalid
- **Current Behavior**: No validation - will generate `https://m.me/null?text=...` or `https://m.me/undefined?text=...`
- **Impact**: User redirected to broken Messenger link
- **Recommendation**: Add validation before redirect

### 2. **Unused Parameter in `generateMessengerUrl`**
- **Issue**: The `usePageId` parameter doesn't change behavior
- **Current Behavior**: Both branches return identical URL format
- **Impact**: Code confusion, potential future bug if logic is expected
- **Recommendation**: Remove parameter or implement different URL format for page IDs

### 3. **No Error Handling for Redirect**
- **Issue**: If `window.location.href` fails (e.g., popup blocked), no fallback
- **Current Behavior**: Silent failure or browser error
- **Impact**: Poor user experience
- **Recommendation**: Add try-catch and fallback (e.g., show URL for manual copy)

### 4. **Landing Form Uses Hardcoded Username**
- **Issue**: Landing page checkout form doesn't use tenant configuration
- **Current Behavior**: Always redirects to `WebNegosyoOfficial`
- **Impact**: Not flexible for multi-tenant scenarios
- **Recommendation**: Make it configurable or tenant-aware

### 5. **Message Length Limits**
- **Issue**: Facebook Messenger URLs have character limits for pre-filled messages
- **Current Behavior**: No truncation or validation
- **Impact**: Very long orders might fail to redirect properly
- **Recommendation**: Add message length validation/truncation

### 6. **Different Redirect Behaviors**
- **Issue**: Checkout page uses `window.location.href` (same tab), landing form uses `window.open` (new tab)
- **Current Behavior**: Inconsistent UX
- **Impact**: User confusion
- **Recommendation**: Standardize behavior or make it configurable

## Order Management Integration

The checkout flow respects the `enable_order_management` setting:

```256:343:src/app/[tenant]/checkout/page.tsx
      // Check if order management is enabled for this tenant
      let orderCreated = false
      
      // Get selected order type for messenger message
      const selectedOrderType = orderTypes.find(ot => ot.id === orderType)
      
      // Get selected payment method details for snapshot
      const selectedPayment = paymentMethods.find(pm => pm.id === selectedPaymentMethod)
      
      if (tenant.enable_order_management) {
        // Only save to database if order management is enabled
        const orderItems = items.map(item => {
          // Calculate price including variations
          let itemPrice = item.menu_item.price
          
          // Handle legacy single variation
          if (item.selected_variation) {
            itemPrice += item.selected_variation.price_modifier
          }
          
          // Handle new grouped variations
          if (item.selected_variations) {
            const modifierSum = Object.values(item.selected_variations).reduce(
              (sum, option) => sum + option.price_modifier, 
              0
            )
            itemPrice += modifierSum
          }
          
          // Format variation text
          let variationText = ''
          if (item.selected_variation) {
            variationText = item.selected_variation.name
          } else if (item.selected_variations) {
            variationText = Object.values(item.selected_variations)
              .map(opt => opt.name)
              .join(', ')
          }
          
          return {
            menu_item_id: item.menu_item.id,
            menu_item_name: item.menu_item.name,
            variation: variationText || undefined,
            addons: item.selected_addons.map(a => a.name),
            quantity: item.quantity,
            price: itemPrice,
            subtotal: item.subtotal,
            special_instructions: item.special_instructions,
          }
        })

        const customerInfo = {
          name: customerData.customer_name || undefined,
          contact: customerData.customer_phone || customerData.customer_email || undefined,
        }

        try {
          // Only use delivery fee if it matches the current address
          const validDeliveryFee = (deliveryFee && deliveryFeeAddress === customerData.delivery_address) ? deliveryFee : undefined
          const validQuotationId = (quotationId && deliveryFeeAddress === customerData.delivery_address) ? quotationId : undefined
          
          const result = await createOrderAction(
            tenant.id, 
            orderItems, 
            customerInfo, 
            orderType, 
            customerData,
            validDeliveryFee,
            validQuotationId,
            selectedPaymentMethod || undefined,
            selectedPayment?.name || undefined,
            selectedPayment?.details || undefined,
            selectedPayment?.qr_code_url || undefined
          )
          orderCreated = result.success

          if (result.success) {
            toast.success('Order created successfully!')
          } else {
            console.warn('Order creation failed:', result.error)
            toast.warning('Order creation failed, but proceeding to Messenger...')
          }
        } catch (error) {
          console.warn('Order creation error:', error)
          toast.warning('Order creation failed, but proceeding to Messenger...')
        }
      }
```

**Key Points**:
- Order creation is optional (based on `enable_order_management`)
- Messenger redirect **always happens** regardless of order management setting
- If order creation fails, user still gets redirected to Messenger
- Message includes a note if order wasn't saved: `⚠️ Note: Order was not saved to system - please create manually in admin panel`

## Recommendations

### High Priority
1. **Add validation** for messenger configuration before redirect
2. **Fix or remove** unused `usePageId` parameter in `generateMessengerUrl`
3. **Add error handling** for redirect failures

### Medium Priority
4. **Standardize redirect behavior** (same tab vs new tab)
5. **Add message length validation** for very long orders
6. **Make landing form** tenant-aware or configurable

### Low Priority
7. **Add analytics** to track redirect success/failure
8. **Consider fallback** UI if Messenger is unavailable
9. **Add loading state** during redirect delay

## Testing Scenarios

### Test Cases to Verify
1. ✅ Redirect with `messenger_username` configured
2. ✅ Redirect with only `messenger_page_id` configured
3. ⚠️ Redirect with missing configuration (should fail gracefully)
4. ✅ Message includes all order details correctly
5. ✅ Message includes customer information
6. ✅ Message includes payment method details
7. ✅ Order creation success → redirect works
8. ✅ Order creation failure → redirect still works
9. ✅ `enable_order_management = false` → redirect works, no order saved
10. ⚠️ Very long order message → verify URL length limits

## Related Files

- `src/app/[tenant]/checkout/page.tsx` - Main checkout page with redirect
- `src/lib/cart-utils.ts` - Message and URL generation utilities
- `src/components/landing/checkout-form.tsx` - Landing page form (different implementation)
- `src/lib/messenger/` - Messenger bot webhook handlers (separate from redirect)
- `src/middleware.ts` - Skips auth for messenger webhook routes

