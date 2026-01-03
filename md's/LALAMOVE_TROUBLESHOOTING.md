# Lalamove Integration Troubleshooting Guide

## Common Error: "Please verify if you have made the request with the right credentials"

This error typically occurs due to one of the following issues:

### 1. **Sandbox vs Production Credentials Mismatch**

**Problem**: Using sandbox credentials with production environment or vice versa.

**Solution**:
- **Sandbox Mode** must use **Sandbox API Keys**
- **Production Mode** must use **Production API Keys**
- Check your tenant configuration:
  - If `lalamove_sandbox = true` → Use sandbox credentials
  - If `lalamove_sandbox = false` → Use production credentials

**How to Check**:
1. Go to Super Admin → Tenants → Edit Tenant
2. Scroll to "Lalamove Delivery Integration"
3. Check "Sandbox Mode" toggle
4. Get matching credentials from Lalamove dashboard

### 2. **Wrong Market Code**

**Problem**: Market code doesn't match the credentials' region.

**Solution**:
- Ensure the market code (HK, SG, TH, etc.) matches your Lalamove account region
- Example: If you have HK credentials, set market to "HK"

### 3. **Incorrect API Key Format**

**Problem**: Copy/paste errors or extra spaces in API keys.

**Solution**:
- Remove any leading/trailing spaces
- Ensure no line breaks in the keys
- Copy keys directly from Lalamove dashboard without formatting

### 4. **Credentials Not Saved Properly**

**Problem**: Credentials not persisted to database.

**Solution**:
1. Verify credentials are saved:
   - Edit tenant → Lalamove section
   - Enter credentials
   - Click "Update Tenant"
   - Verify the page reloads without errors
2. Check database:
   - Verify `lalamove_api_key` and `lalamove_secret_key` fields are populated
   - Ensure `lalamove_enabled = true`

### 5. **Missing Restaurant Address**

**Problem**: Restaurant coordinates not configured.

**Solution**:
- Ensure restaurant address, latitude, and longitude are entered
- Use the Mapbox picker to auto-fill coordinates

## Debugging Steps

### Enable Logging

The system now logs detailed information. Check your server logs for:

```
[Lalamove] Initializing client: {
  environment: 'sandbox',
  hasApiKey: true,
  hasSecretKey: true,
  apiKeyPrefix: 'XXXXXXXX...',
  market: 'HK'
}

[Lalamove] Creating quotation: {
  market: 'HK',
  service: 'MOTORCYCLE',
  pickupAddress: '...',
  deliveryAddress: '...'
}
```

### Test with Sandbox

1. **Get Sandbox Credentials**:
   - Log in to Lalamove Developer Portal
   - Navigate to API Keys
   - Generate sandbox credentials

2. **Configure Tenant**:
   - Set `lalamove_sandbox = true`
   - Enter sandbox API key and secret
   - Set correct market (e.g., HK for Hong Kong)
   - Set service type (MOTORCYCLE, VAN, CAR, etc.)

3. **Test Quotation**:
   - Go to checkout with delivery order type
   - Enter delivery address
   - Check console logs for errors

### Common Configuration Issues

#### Issue 1: API Key Format
**Wrong**: `pk_live_1234567890`
**Right**: `pk_sandbox_1234567890` (for sandbox)

#### Issue 2: Secret Key Format
**Wrong**: `sk_live_abcdefghijk`
**Right**: `sk_sandbox_abcdefghijk` (for sandbox)

#### Issue 3: Market Mismatch
If your credentials are for Hong Kong but you set market to "SG", it will fail.

## Getting Help

If you continue to experience issues:

1. **Check Lalamove Documentation**:
   - https://developers.lalamove.com
   - API Reference: https://developers.lalamove.com/api/v2/#reference

2. **Verify Your Account**:
   - Log in to Lalamove dashboard
   - Check your API keys are active
   - Verify account status

3. **Contact Lalamove Support**:
   - Provide your API key prefix (first 8 characters)
   - Include error messages from logs
   - Mention you're using the Node.js SDK

## Testing Checklist

- [ ] Restaurant address configured with coordinates
- [ ] Lalamove enabled for tenant
- [ ] Sandbox mode matches credential type
- [ ] API key is correct format
- [ ] Secret key is correct format
- [ ] Market code matches account region
- [ ] Service type is valid
- [ ] Order type "Delivery" exists and enabled
- [ ] Delivery address form field exists

## Environment-Specific Notes

### Sandbox
- Use sandbox API keys
- Set `lalamove_sandbox = true`
- No real charges
- Limited to test addresses

### Production
- Use production API keys
- Set `lalamove_sandbox = false`
- Real charges apply
- Full address coverage

## ✅ Issue Resolved: Credentials and Configuration

The test scripts identified and fixed the following issues:

### Problems Found

1. **❌ Sandbox Mode Mismatch**: 
   - Tenant had `lalamove_sandbox = true` 
   - But credentials were PRODUCTION type (`pk_prod_...`, `sk_prod_...`)
   - **Fixed**: Updated to `lalamove_sandbox = false`

2. **❌ Language Code Issue**:
   - Code was using `en_US` for all markets
   - Lalamove requires market-specific language codes
   - **Fixed**: Added `getLanguageForMarket()` function with proper mappings

3. **❌ Service Area**:
   - Restaurant address in Philippines but market is HK
   - Lalamove only supports addresses within the market's service area
   - **Note**: For Philippines restaurants, set market to "PH" or use a delivery service that operates in PH

### Test Results

✅ **Credentials Valid**: Production credentials work correctly  
✅ **Language Codes**: Now using market-specific languages (en_HK for HK, en_PH for PH, etc.)  
✅ **Quotation Success**: Tested with HK addresses - quotation created successfully  

### Recommended Actions

For **retiro** restaurant (Philippines address):

**Option 1**: Change market to PH
1. Edit tenant in Super Admin
2. Set `lalamove_market = "PH"`
3. Use PH-compatible credentials

**Option 2**: Keep market as HK but verify service coverage
1. Check if Lalamove HK serves delivery addresses in Philippines
2. If not, consider changing market or using different delivery provider

### Test Scripts Available

```bash
# Check tenant Lalamove configuration
node scripts/check-tenant-lalamove.mjs <tenant-slug>

# Test Lalamove connection
node scripts/test-lalamove-connection.mjs <tenant-slug>

# Show all tenants' Lalamove config
node scripts/show-all-lalamove-config.mjs

# Auto-fix sandbox mode mismatch
node scripts/manual-fix-sandbox.mjs <tenant-slug>
```

### Language Code Mappings

- HK (Hong Kong): `en_HK`
- SG (Singapore): `en_SG`
- TH (Thailand): `th_TH`
- PH (Philippines): `en_PH`
- TW (Taiwan): `zh_TW`
- MY (Malaysia): `ms_MY`
- VN (Vietnam): `vi_VN`
