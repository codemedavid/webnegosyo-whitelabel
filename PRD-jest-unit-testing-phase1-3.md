# Jest Unit Testing - Phase 1-3 PRD

## Overview
Create Jest unit tests for the whitelabel restaurant ordering system. This PRD covers setup, infrastructure, and first tests.

---

## Tasks

### Phase 1: Test Folder Structure
- [ ] Create tests directory
- [ ] Create tests/utils directory
- [ ] Create tests/fixtures directory
- [ ] Create tests/mocks directory
- [ ] Create tests/seeders directory
- [ ] Create tests/unit/lib directory
- [ ] Create tests/unit/app directory
- [ ] Create tests/unit/hooks directory
- [ ] Create tests/integration directory
- [ ] Create tests/setup.ts file

### Phase 2: Test Setup File
- [ ] Create tests/setup.ts with global jest-dom mocks
- [ ] Configure localStorage mock
- [ ] Configure console mock (silent in tests)
- [ ] Add cleanup in afterEach

### Phase 3: First Basic Test - Cart Utils
- [ ] Create tests/fixtures/menu-item.fixture.ts
- [ ] Create tests/fixtures/order.fixture.ts
- [ ] Create tests/__tests__/unit/lib/cart-utils.test.ts
- [ ] Test calculateCartItemSubtotal() with basic price
- [ ] Test calculateCartItemSubtotal() with addons
- [ ] Test calculateCartTotal() with multiple items
- [ ] Test getCartItemCount()
- [ ] Test formatPrice()
- [ ] Verify test runs successfully with npm test

---

## Success Criteria
1. All test directories created
2. Global test setup file works
3. First test file created and passes
4. npm test command runs without errors
