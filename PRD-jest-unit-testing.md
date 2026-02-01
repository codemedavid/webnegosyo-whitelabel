# Jest Unit Testing PRD

## Overview
Create comprehensive Jest unit tests for all functionality in the whitelabel multi-tenant restaurant ordering system. Ensure all features are tested with proper seeders, mocks, and expected output validation.

## Goals
- Achieve high test coverage (>80%) across all modules
- Test all business logic, utilities, and helper functions
- Create reusable test utilities and fixtures
- Ensure tests are fast, reliable, and maintainable

---

## Tasks

### Phase 1: Setup and Configuration
- [ ] Install Jest and testing dependencies (@jest/globals, ts-jest, @testing-library/react, @testing-library/jest-dom)
- [ ] Configure Jest for TypeScript and Next.js environment
- [ ] Set up test environment variables
- [ ] Configure test scripts in package.json (test, test:watch, test:coverage)
- [ ] Set up code coverage reporting

### Phase 2: Testing Infrastructure
- [ ] Create test folder structure: `tests/` directory
- [ ] Create test utilities directory: `tests/utils/`
- [ ] Create test fixtures directory: `tests/fixtures/`
- [ ] Create test mocks directory: `tests/mocks/`
- [ ] Create database seeders: `tests/seeders/`
- [ ] Create global test setup file: `tests/setup.ts`

### Phase 3: Test Utilities and Helpers
- [ ] Create Supabase mock factory with all query methods
- [ ] Create test data generators (tenants, menu items, orders, etc.)
- [ ] Create authentication helpers for tests (mock superadmin/admin user)
- [ ] Create request/response mockers for API routes
- [ ] Create wrapper components for React tests

### Phase 4: Database Seeders
- [ ] Create tenant seeder with varied configurations
- [ ] Create category seeder (active/inactive, different orders)
- [ ] Create menu item seeder with variations, addons, featured flags
- [ ] Create order seeder with all statuses (pending, confirmed, preparing, ready, delivered, cancelled)
- [ ] Create order items seeder
- [ ] Create user/role seeder (superadmin, tenant admins)
- [ ] Create payment method seeder
- [ ] Create order type seeder
- [ ] Create customer form field seeder
- [ ] Create Facebook page seeder
- [ ] Create database cleanup utility

### Phase 5: Cart Utilities Tests (src/lib/cart-utils.ts)
- [ ] Test calculateCartItemSubtotal() with legacy single variation format
- [ ] Test calculateCartItemSubtotal() with new grouped variations format
- [ ] Test calculateCartItemSubtotal() with addons
- [ ] Test calculateCartItemSubtotal() with combinations (variations + addons)
- [ ] Test calculateCartTotal() with various cart configurations
- [ ] Test calculateCartTotal() with empty cart
- [ ] Test getCartItemCount()
- [ ] Test generateCartItemId() with legacy format
- [ ] Test generateCartItemId() with new grouped variations format
- [ ] Test generateCartItemId() with addons sorting
- [ ] Test formatPrice() with different amounts
- [ ] Test generateMessengerMessage() with dine_in order type
- [ ] Test generateMessengerMessage() with pickup order type
- [ ] Test generateMessengerMessage() with delivery order type
- [ ] Test generateMessengerMessage() with customer data
- [ ] Test generateMessengerMessage() with payment method
- [ ] Test generateMessengerUrl() with normal message
- [ ] Test generateMessengerUrl() with truncated long message
- [ ] Test generateMessengerUrl() with invalid/empty pageId
- [ ] Test generateMessengerRefUrl() with valid inputs
- [ ] Test generateMessengerRefUrl() with invalid inputs
- [ ] Test generateMessengerCombinedUrl() with both parameters
- [ ] Test generateMessengerCombinedUrl() message length calculation
- [ ] Test generateMessengerDirectUrl()

### Phase 6: Order Token Tests (src/lib/order-token.ts)
- [ ] Test createOrderToken() generates unique tokens
- [ ] Test createOrderToken() stores token hash in database
- [ ] Test createOrderToken() sets expiration
- [ ] Test createOrderToken() throws error for nonexistent order
- [ ] Test verifyOrderToken() returns true for valid token
- [ ] Test verifyOrderToken() returns false for invalid token
- [ ] Test verifyOrderToken() returns false for expired token
- [ ] Test verifyOrderToken() returns false for missing token
- [ ] Test verifyOrderToken() timing-safe comparison works correctly
- [ ] Test clearOrderToken() removes token hash and expiry

### Phase 7: Tenant Resolution Tests (src/lib/tenant.ts)
- [ ] Test normalizeDomain() removes http:// protocol
- [ ] Test normalizeDomain() removes https:// protocol
- [ ] Test normalizeDomain() removes www. prefix
- [ ] Test normalizeDomain() removes trailing slashes
- [ ] Test normalizeDomain() converts to lowercase
- [ ] Test normalizeDomain() handles null/undefined/empty
- [ ] Test normalizeDomain() validates basic domain format
- [ ] Test extractSubdomain() with reserved subdomains (www, superadmin, admin, app)
- [ ] Test extractSubdomain() with localhost domains
- [ ] Test extractSubdomain() with production domains
- [ ] Test extractSubdomain() returns null for root domain
- [ ] Test extractSubdomain() handles multi-level subdomains
- [ ] Test getHost() extracts from x-forwarded-host header
- [ ] Test getHost() extracts from host header
- [ ] Test getHost() removes port numbers
- [ ] Test getHost() removes paths and query strings
- [ ] Test validateTenantExists() with cache hit
- [ ] Test validateTenantExists() with cache miss
- [ ] Test validateTenantExists() with inactive tenant
- [ ] Test clearDomainCache() removes cache entries
- [ ] Test clearTenantExistenceCache() removes cache entries
- [ ] Test cleanupCache() removes expired entries
- [ ] Test cleanupCache() enforces max size limit
- [ ] Test resolveTenantSlugFromRequest() with custom domain
- [ ] Test resolveTenantSlugFromRequest() with subdomain
- [ ] Test resolveTenantSlugFromRequest() returns null when no match

### Phase 8: Admin Service Tests (src/lib/admin-service.ts)
- [ ] Test verifyTenantAdmin() throws error for unauthenticated user
- [ ] Test verifyTenantAdmin() throws error for missing user role
- [ ] Test verifyTenantAdmin() allows superadmin
- [ ] Test verifyTenantAdmin() allows tenant admin
- [ ] Test verifyTenantAdmin() rejects non-admin
- [ ] Test verifyTenantAdmin() rejects admin from different tenant
- [ ] Test getCurrentUserRole() returns null for unauthenticated
- [ ] Test getCurrentUserRole() returns user role data
- [ ] Test getCategoriesByTenant() returns ordered categories
- [ ] Test createCategory() validates input with Zod schema
- [ ] Test createCategory() creates category with admin verification
- [ ] Test updateCategory() validates input
- [ ] Test updateCategory() updates category with admin verification
- [ ] Test deleteCategory() deletes with admin verification
- [ ] Test reorderCategories() updates all orders
- [ ] Test getMenuItemById() returns item with tenant validation
- [ ] Test createMenuItem() validates with Zod schema
- [ ] Test createMenuItem() creates with variations and addons
- [ ] Test createMenuItem() supports new variation types
- [ ] Test updateMenuItem() updates all fields
- [ ] Test deleteMenuItem() deletes with admin verification
- [ ] Test toggleMenuItemAvailability() updates is_available
- [ ] Test getMenuItemsByTenant() returns all without pagination
- [ ] Test getMenuItemsByTenant() with pagination parameters
- [ ] Test getMenuItemsByTenant() filters by category
- [ ] Test getMenuItemsByTenant() filters by search query
- [ ] Test getMenuItemsByTenant() filters by availability
- [ ] Test getMenuItemsByTenant() returns correct pagination metadata
- [ ] Test getPublicMenuByTenant() returns active categories with available items
- [ ] Test getTenantBySlug() returns active tenant
- [ ] Test getTenantBySlug() returns null for inactive tenant
- [ ] Test getTenantBySlug() returns null for not found

### Phase 9: Orders Service Tests (src/lib/orders-service.ts)
- [ ] Test getOrdersByTenant() returns all orders without params
- [ ] Test getOrdersByTenant() with pagination
- [ ] Test getOrdersByTenant() filters by status
- [ ] Test getOrdersByTenant() filters by orderType
- [ ] Test getOrdersByTenant() filters by date range (from)
- [ ] Test getOrdersByTenant() filters by date range (to)
- [ ] Test getOrdersByTenant() returns correct pagination result
- [ ] Test getOrderById() returns single order with items
- [ ] Test updateOrderStatus() updates to pending
- [ ] Test updateOrderStatus() updates to confirmed
- [ ] Test updateOrderStatus() updates to preparing
- [ ] Test updateOrderStatus() updates to ready
- [ ] Test updateOrderStatus() updates to delivered
- [ ] Test updateOrderStatus() updates to cancelled
- [ ] Test updateOrderStatus() triggers Lalamove order creation when confirmed
- [ ] Test updateOrderStatus() skips Lalamove if already created
- [ ] Test updateOrderStatus() handles race condition for Lalamove
- [ ] Test getOrderStats() returns today's orders count
- [ ] Test getOrderStats() returns today's revenue
- [ ] Test getOrderStats() returns status counts
- [ ] Test createOrder() creates order with all fields
- [ ] Test createOrder() includes delivery fee in total
- [ ] Test createOrder() creates order items
- [ ] Test createOrder() generates order token
- [ ] Test createOrder() handles token generation failure gracefully

### Phase 10: Tenants Service Tests (src/lib/tenants-service.ts)
- [ ] Test tenantSchema validates required fields
- [ ] Test domainSchema validates domain format
- [ ] Test domainSchema allows null/empty
- [ ] Test domainSchema normalizes domain
- [ ] Test getTenantBySlugSupabase() returns tenant or null
- [ ] Test getTenantByIdSupabase() returns tenant or null
- [ ] Test listTenantsSupabase() returns all tenants ordered
- [ ] Test isSlugTaken() returns true for existing slug
- [ ] Test isSlugTaken() returns false for unique slug
- [ ] Test isSlugTaken() excludes provided id
- [ ] Test isDomainTaken() returns false for null domain
- [ ] Test isDomainTaken() returns true for existing domain
- [ ] Test isDomainTaken() normalizes domain before checking
- [ ] Test createTenantSupabase() validates with schema
- [ ] Test createTenantSupabase() checks slug availability
- [ ] Test createTenantSupabase() checks domain availability
- [ ] Test createTenantSupabase() creates tenant with all fields
- [ ] Test updateTenantSupabase() validates slug uniqueness
- [ ] Test updateTenantSupabase() validates domain uniqueness
- [ ] Test updateTenantSupabase() clears old domain cache
- [ ] Test updateTenantSupabase() clears new domain cache
- [ ] Test deleteTenantSupabase() deletes tenant
- [ ] Test deleteTenantSupabase() clears domain cache

### Phase 11: Payment Methods Tests (src/lib/payment-methods-service.ts)
- [ ] Test getPaymentMethodsByTenant() returns ordered methods
- [ ] Test getPaymentMethodsByTenant() filters by order type
- [ ] Test createPaymentMethod() with validation
- [ ] Test updatePaymentMethod() with validation
- [ ] Test deletePaymentMethod()

### Phase 12: Order Types Tests (src/lib/order-types-service.ts)
- [ ] Test getOrderTypesByTenant() returns ordered types
- [ ] Test createOrderType() with validation
- [ ] Test updateOrderType() with validation
- [ ] Test deleteOrderType() with validation
- [ ] Test getCustomerFormFieldsByOrderType() returns ordered fields
- [ ] Test createCustomerFormField() with validation
- [ ] Test updateCustomerFormField() with validation
- [ ] Test deleteCustomerFormField() with validation

### Phase 13: Server Actions Tests - Menu Items
- [ ] Test getMenuItemsAction() returns success with data
- [ ] Test getMenuItemsAction() returns error on failure
- [ ] Test getMenuItemAction() returns single item
- [ ] Test getMenuItemAction() returns error on failure
- [ ] Test createMenuItemAction() creates item and revalidates paths
- [ ] Test createMenuItemAction() returns Zod validation errors
- [ ] Test createMenuItemAction() returns error on failure
- [ ] Test updateMenuItemAction() updates item and revalidates paths
- [ ] Test updateMenuItemAction() returns Zod validation errors
- [ ] Test deleteMenuItemAction() deletes item and revalidates paths
- [ ] Test deleteMenuItemAction() returns error on failure
- [ ] Test toggleAvailabilityAction() toggles availability

### Phase 14: Server Actions Tests - Categories
- [ ] Test all category server actions
- [ ] Test error handling
- [ ] Test revalidation paths

### Phase 15: Server Actions Tests - Orders
- [ ] Test order creation action
- [ ] Test order status update action
- [ ] Test error handling

### Phase 16: Server Actions Tests - Payment Methods
- [ ] Test payment method CRUD actions
- [ ] Test error handling
- [ ] Test revalidation paths

### Phase 17: Server Actions Tests - Order Types
- [ ] Test order type CRUD actions
- [ ] Test customer form field actions
- [ ] Test error handling

### Phase 18: Cart Hook Tests (src/hooks/useCart.tsx)
- [ ] Test CartProvider initializes from localStorage
- [ ] Test CartProvider handles corrupted localStorage data
- [ ] Test CartProvider initializes orderType from localStorage
- [ ] Test CartProvider initializes messengerPsid from localStorage
- [ ] Test CartProvider initializes tenantContext from localStorage
- [ ] Test CartProvider invalid tenantContext clears key
- [ ] Test items persist to localStorage on change
- [ ] Test orderType persists to localStorage on change
- [ ] Test messengerPsid persists to localStorage on change
- [ ] Test addItem() creates new cart item
- [ ] Test addItem() with legacy variation format
- [ ] Test addItem() with new grouped variations format
- [ ] Test addItem() merges existing item by incrementing quantity
- [ ] Test addItem() with special instructions
- [ ] Test addItem() with addons
- [ ] Test removeItem() removes item
- [ ] Test updateQuantity() updates quantity and recalculates subtotal
- [ ] Test updateQuantity() removes item when quantity <= 0
- [ ] Test clearCart() clears all items and orderType
- [ ] Test getItem() returns item by id
- [ ] Test getItem() returns undefined for nonexistent item
- [ ] Test total is calculated correctly
- [ ] Test item_count is calculated correctly
- [ ] Test setOrderType() updates state and persists
- [ ] Test setMessengerPsid() updates state and persists
- [ ] Test setTenantContext() updates state and persists
- [ ] Test debounced Messenger sync schedules timeout
- [ ] Test Messenger sync skips when prerequisites missing
- [ ] Test Messenger sync sends correct data
- [ ] Test Messenger sync handles success response
- [ ] Test Messenger sync handles error response
- [ ] Test Messenger sync debounces rapid changes
- [ ] Test cleanup clears timeout on unmount

### Phase 19: Client Utility Tests
- [ ] Test order-types-client.ts functions (fetch, create, update, delete)
- [ ] Test payment-methods-client.ts functions
- [ ] Test tenants-client.ts functions

### Phase 20: Cache Tests (src/lib/cache.ts)
- [ ] Test cache get() returns undefined for nonexistent key
- [ ] Test cache set() stores value
- [ ] Test cache expires after TTL
- [ ] Test cache cleanup removes expired entries
- [ ] Test cache cleanup enforces max size

### Phase 21: Branding Utils Tests (src/lib/branding-utils.ts)
- [ ] Test brand color utility functions
- [ ] Test card template functions

### Phase 22: Messenger Message Formatter Tests (src/lib/messenger-message-formatter.ts)
- [ ] Test message field formatting
- [ ] Test emoji generation

### Phase 23: Rate Limit Tests (src/lib/rate-limit.ts)
- [ ] Test rate limiting allows requests under limit
- [ ] Test rate limiting blocks requests over limit
- [ ] Test sliding window implementation

### Phase 24: Mocks Configuration
- [ ] Create Supabase mock with select(), insert(), update(), delete(), rpc()
- [ ] Mock Supabase auth.getUser()
- [ ] Mock Facebook API responses
- [ ] Mock Lalamove API responses
- [ ] Mock Cloudinary upload responses
- [ ] Mock Mapbox search responses
- [ ] Mock localStorage for React Hook tests
- [ ] Mock Next.js revalidatePath()

### Phase 25: Integration Tests (API Routes)
- [ ] Test /api/webhook webhook endpoint
- [ ] Test /api/auth/facebook/login route
- [ ] Test /api/auth/facebook/callback route
- [ ] Test /api/auth/facebook/disconnect route
- [ ] Test /api/auth/facebook/connect route
- [ ] Test /api/messenger/send-cart route
- [ ] Test /api/messenger/send-order route
- [ ] Test /api/messenger/send-order-public route
- [ ] Test /api/facebook/pages route
- [ ] Test /api/ai/parse-menu route
- [ ] Test /api/tenants/[id]/bulk-menu-import route

### Phase 26: Test Documentation
- [ ] Create README.md in tests/ directory
- [ ] Document test file naming conventions
- [ ] Document how to write test cases
- [ ] Document how to use fixtures
- [ ] Document how to run tests (npm test, npm test:watch, npm test:coverage)
- [ ] Document how to add new tests
- [ ] Document mocking patterns

---

## Test Structure

```
tests/
├── fixtures/
│   ├── tenant.fixture.ts
│   ├── category.fixture.ts
│   ├── menu-item.fixture.ts
│   ├── order.fixture.ts
│   ├── user.fixture.ts
│   ├── payment-method.fixture.ts
│   └── index.ts (exports all fixtures)
├── mocks/
│   ├── supabase.mock.ts
│   ├── facebook-api.mock.ts
│   ├── lalamove-api.mock.ts
│   ├── local-storage.mock.ts
│   ├── next-cache.mock.ts
│   └── index.ts (exports all mocks)
├── seeders/
│   ├── tenant.seeder.ts
│   ├── category.seeder.ts
│   ├── menu-item.seeder.ts
│   ├── order.seeder.ts
│   ├── user.seeder.ts
│   ├── payment-method.seeder.ts
│   ├── order-type.seeder.ts
│   └── database-cleanup.ts
├── utils/
│   ├── test-helpers.ts
│   ├── supabase-client.ts
│   ├── auth-helpers.ts
│   └── index.ts (exports all utilities)
├── unit/
│   ├── lib/
│   │   ├── cart-utils.test.ts
│   │   ├── order-token.test.ts
│   │   ├── tenant.test.ts
│   │   ├── admin-service.test.ts
│   │   ├── orders-service.test.ts
│   │   ├── tenants-service.test.ts
│   │   ├── payment-methods-service.test.ts
│   │   ├── order-types-service.test.ts
│   │   ├── cache.test.ts
│   │   ├── branding-utils.test.ts
│   │   ├── messenger-message-formatter.test.ts
│   │   └── rate-limit.test.ts
│   ├── app/
│   │   └── actions/
│   │       ├── menu-items.test.ts
│   │       ├── categories.test.ts
│   │       ├── orders.test.ts
│   │       ├── payment-methods.test.ts
│   │       └── order-types.test.ts
│   └── hooks/
│       └── useCart.test.tsx
├── integration/
│   └── api/
│       ├── webhook.test.ts
│       ├── auth-facebook.test.ts
│       ├── messenger.test.ts
│       ├── facebook-pages.test.ts
│       ├── ai-parse-menu.test.ts
│       └── tenants-bulk-import.test.ts
├── setup.ts
└── README.md
```

---

## Success Criteria
1. All core business logic has unit tests
2. Tests provide clear expected output validation
3. Seeders work reliably for creating test data
4. External services are properly mocked
5. Tests run quickly (< 30 seconds typical)
6. Code coverage meets target (>80%)
7. Tests are well-documented and maintainable
8. All existing features are covered
9. No functionality is left uncovered

---

## Notes
- Focus on unit tests for pure functions first
- Use mocking for external dependencies (Supabase, Facebook, Lalamove, Mapbox, Cloudinary)
- Tests should be deterministic (no reliance on real-time timing)
- Use afterEach/beforeEach for test cleanup
- Describe test cases clearly with descriptive test names
- Follow existing code style and conventions
- Ensure tests are isolated and don't depend on each other
