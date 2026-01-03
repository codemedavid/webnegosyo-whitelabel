# Lalamove Delivery Integration

## ✅ Implementation Complete

The Lalamove delivery integration has been successfully implemented in the checkout flow. Customers can now see real-time delivery fees and the system stores Lalamove quotation and order information.

## 📋 Features Implemented

### 1. **Database Schema** (`supabase/migrations/0005_lalamove_delivery.sql`)
- Added Lalamove fields to `orders` table:
  - `delivery_fee` - Delivery fee charged by Lalamove
  - `lalamove_quotation_id` - Lalamove quotation ID
  - `lalamove_order_id` - Lalamove order ID
  - `lalamove_status` - Current status of Lalamove delivery
  - `lalamove_driver_id` - Lalamove driver ID
  - `lalamove_driver_name` - Lalamove driver name
  - `lalamove_driver_phone` - Lalamove driver phone
  - `lalamove_tracking_url` - Lalamove tracking URL
  
- Added Lalamove configuration to `tenants` table:
  - `lalamove_enabled` - Enable/disable Lalamove
  - `lalamove_api_key` - Lalamove public API key
  - `lalamove_secret_key` - Lalamove secret key
  - `lalamove_market` - Market code (HK, SG, TH, etc.)
  - `lalamove_service_type` - Service type (MOTORCYCLE, VAN, CAR, etc.)
  - `lalamove_sandbox` - Use sandbox environment
  
- Added restaurant address fields:
  - `restaurant_address` - Restaurant physical address
  - `restaurant_latitude` - Restaurant latitude
  - `restaurant_longitude` - Restaurant longitude

### 2. **Lalamove Service** (`src/lib/lalamove-service.ts`)
Core service for Lalamove API interactions:
- `createLalamoveQuotation()` - Get delivery fee quote
- `createLalamoveOrder()` - Place Lalamove delivery order
- `getLalamoveDriver()` - Retrieve driver information
- `getLalamoveOrder()` - Get order status
- `cancelLalamoveOrder()` - Cancel delivery order

### 3. **Server Actions** (`src/app/actions/lalamove.ts`)
- `createQuotationAction()` - Server action to fetch delivery quotation
- `validateDeliveryAddress()` - Validate delivery address coordinates

### 4. **Checkout UI** (`src/app/[tenant]/checkout/page.tsx`)
- Real-time delivery fee calculation when delivery address is entered
- Automatic quotation fetching with loading states
- Delivery fee displayed in order summary
- Total includes delivery fee
- Quotation ID stored with order

### 5. **Order Service** (`src/lib/orders-service.ts`)
- Updated `createOrder()` to accept delivery fee and quotation ID
- Orders now store Lalamove information for tracking

## 🔧 Configuration Steps

To enable Lalamove delivery for a restaurant:

1. **Run Database Migration**:
   ```bash
   # Apply the migration in Supabase
   # File: supabase/migrations/0005_lalamove_delivery.sql
   ```

2. **Configure Restaurant**:
   - Go to Super Admin → Edit Tenant
   - Fill in Lalamove credentials:
     - Lalamove API Key
     - Lalamove Secret Key
     - Market (e.g., "HK", "SG", "TH")
     - Service Type (e.g., "MOTORCYCLE", "VAN", "CAR")
     - Sandbox mode (true for testing)
   - Enable Lalamove delivery
   - Add restaurant address and coordinates

3. **Add Order Type**:
   - Ensure "Delivery" order type is created and enabled
   - Add "delivery_address" customer form field

4. **Test Flow**:
   - Add items to cart
   - Select "Delivery" order type
   - Enter delivery address
   - System will fetch delivery fee automatically
   - Complete checkout

## 📚 Documentation References

- **Lalamove SDK**: https://github.com/lalamove/delivery-nodejs-sdk
- **Lalamove API Docs**: https://developers.lalamove.com

## 🔍 How It Works

1. **Quotation Phase**:
   - Customer selects "Delivery" order type
   - Customer enters delivery address with Mapbox autocomplete
   - System automatically fetches delivery quotation from Lalamove
   - Delivery fee is displayed in real-time

2. **Checkout Phase**:
   - Delivery fee included in order total
   - Quotation ID saved with order
   - Customer completes payment/confirmation

3. **Order Creation** (Future):
   - When order is confirmed, create Lalamove order using quotation ID
   - Track driver and delivery status
   - Update customer on delivery progress

## 🎯 Next Steps (Optional Enhancements)

1. **Order Confirmation Flow**:
   - Add `createLalamoveOrder()` call on order confirmation
   - Store Lalamove order ID and tracking URL
   - Send tracking link to customer

2. **Driver Tracking**:
   - Implement driver status updates
   - Show driver information to customer
   - Real-time location updates

3. **Admin Dashboard**:
   - Display active Lalamove deliveries
   - Show driver details
   - Track delivery status
   - Cancel/change driver options

4. **Notifications**:
   - Email/SMS updates on delivery status
   - Push notifications for driver assignment
   - Delivery completion alerts

## ⚠️ Important Notes

- Quotations expire after a certain time period (configured by Lalamove)
- Sandbox mode should be used for testing
- Production API keys required for live orders
- Restaurant address must be accurate for routing
- Delivery address must be within Lalamove service area

## 🧪 Testing

Use Lalamove sandbox environment for testing:
1. Get sandbox API keys from Lalamove dashboard
2. Set `lalamove_sandbox = true` in tenant configuration
3. Test with sample addresses in service area
4. Verify quotations are calculated correctly
5. Switch to production when ready

## ✅ UI Configuration Complete

The Superadmin tenant management form now includes dedicated sections for configuring Lalamove delivery:

### New UI Sections Added

1. **Restaurant Address Section** (`RestaurantAddressSection`)
   - Restaurant physical address input
   - Latitude and longitude coordinates
   - Helpful tips for finding coordinates

2. **Lalamove Delivery Integration Section** (`LalamoveSection`)
   - Enable/disable toggle for Lalamove integration
   - API Key (password field)
   - Secret Key (password field)
   - Market code (HK, SG, TH, etc.)
   - Service type (MOTORCYCLE, VAN, CAR)
   - Sandbox mode toggle
   - Visual indicator when in testing mode

### How to Configure

1. Navigate to **Super Admin → Tenants → Edit Tenant**
2. Scroll to the **Restaurant Address** section
3. Enter your restaurant's physical address
4. Add latitude and longitude coordinates (use Google Maps)
5. Go to **Lalamove Delivery Integration** section
6. Toggle **Enable Lalamove Delivery** ON
7. Enter your Lalamove API credentials
8. Select market (e.g., "HK" for Hong Kong)
9. Choose service type (e.g., "MOTORCYCLE")
10. Enable **Sandbox Mode** for testing
11. Click **Update Tenant**

### Files Modified

- `src/components/superadmin/tenant-form-wrapper.tsx` - Added UI sections
- `src/lib/tenants-service.ts` - Updated schema validation
- `src/actions/tenants.ts` - Updated create/update actions
- `src/types/database.ts` - Added type definitions

All configuration is automatically saved and integrated with the checkout flow!

### Mapbox Integration for Restaurant Address

The Superadmin restaurant address field now uses Mapbox autocomplete to make entering the restaurant location easier:

#### Features
- **Map Picker**: Click the map icon to open an interactive map
- **Autocomplete Search**: Type to search for addresses with real-time suggestions
- **Current Location**: Use GPS to get your current location
- **Auto-Fill Coordinates**: Selecting an address automatically fills latitude and longitude
- **Drag Marker**: Adjust the exact pickup location by dragging the marker on the map

#### Usage
1. Click in the Address field
2. Type to search or click the map icon
3. Select an address from suggestions OR pick on the interactive map
4. Coordinates will be automatically filled in

The Mapbox integration uses the same component as customer checkout for consistency.
