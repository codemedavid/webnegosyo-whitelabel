# Product Detail Page Fix PRD

## Current Issues
1. **Variations not showing** - Data fetching issues in `getCachedMenuItemById`
2. **Add-ons not showing** - Same data fetching issue
3. **Related items not showing** - Data fetching issues in `getCachedRelatedItems`
4. **Customization/branding not working** - CSS variables not properly applied or theme merging issues
5. **Console errors** - Column mismatches in category query
6. **Accessibility issues** - Nested buttons in dialog

## Root Cause Analysis

### Data Fetching Issues
- The `getCachedMenuItemById` function is trying to fetch related data (variations, variation_types, addons) but there may be:
  - Column name mismatches
  - Missing foreign key relationships
  - Query errors being silently caught

### CSS Variables Issues
- The CSS variables are being applied via inline `style` prop
- Some variables may be undefined due to theme merging issues
- Default values not properly falling back

### Category Query Issues
- Already fixed: removed non-existent columns `slug` and `image_url`

## Fix Plan

### 1. Fix Data Fetching Functions

#### `src/lib/product-detail-data.ts`
- Fix `getCachedMenuItemById` to properly fetch and combine variations, variation_types, and addons
- Ensure proper error logging
- Add validation for returned data structure

#### `getCachedRelatedItems`
- Verify column names match database schema
- Ensure proper error handling

### 2. Fix Theme/CSS Variables

#### `src/lib/product-detail-theme.ts`
- Ensure all default values are properly defined
- Fix mergeSettingsWithBranding to handle null/undefined properly
- Ensure CSS variables are always strings

#### `src/components/customer/product-detail-content.tsx`
- Add fallback values for all CSS variable usages
- Ensure dynamicStyles are computed correctly

### 3. Fix Accessibility
- Fix nested button issue in DialogClose

### 4. Add Unit Tests
- Test data fetching functions
- Test theme merging
- Test component rendering with various prop combinations

## Implementation Steps

1. Fix `getCachedMenuItemById` query
2. Fix `getCachedRelatedItems` query  
3. Fix theme merging and CSS variable generation
4. Fix CSS variable fallbacks in component
5. Fix accessibility issues
6. Write comprehensive unit tests
7. Verify all features work

## Success Criteria
- [ ] Variations display correctly for items with variations
- [ ] Add-ons display correctly for items with add-ons
- [ ] Related items display in "You might also like" section
- [ ] Customization colors apply correctly
- [ ] Branding colors merge with customization correctly
- [ ] No console errors
- [ ] All unit tests pass
- [ ] No accessibility violations
