# Lalamove Philippines Setup Guide

## Current Status

The **retiro** restaurant is configured with:
- Market: **PH** (Philippines) ✅
- Restaurant Address: Lucena, Philippines ✅
- Credentials: **HK credentials** ❌

## Issue

You have **Hong Kong (HK) credentials** but the restaurant is in **Philippines (PH)**.
Each Lalamove market requires its own separate credentials.

## Solution

You need to get **Philippines Lalamove credentials** from your Lalamove account.

### Steps to Fix

1. **Log in to Lalamove Dashboard**
   - Go to https://developers.lalamove.com
   - Navigate to your API Keys section

2. **Create Philippines Credentials**
   - Select market: **Philippines (PH)**
   - Generate new API Key and Secret Key
   - Make sure they're for **PH** market, not HK

3. **Update Tenant Configuration**
   - Go to Super Admin → Tenants → Edit retiro
   - Scroll to "Lalamove Delivery Integration"
   - Update:
     - Market: **PH** ✅ (already set)
     - API Key: Enter your PH API key
     - Secret Key: Enter your PH secret key
     - Sandbox Mode: Choose based on credential type
   - Click "Update Tenant"

4. **Test the Configuration**
   ```bash
   node scripts/test-lalamove-connection.mjs retiro
   ```

### Credential Types

**Production Credentials**:
- API Key: `pk_prod_...`
- Secret Key: `sk_prod_...`
- Sandbox Mode: **OFF**

**Sandbox Credentials**:
- API Key: `pk_sandbox_...`
- Secret Key: `sk_sandbox_...`
- Sandbox Mode: **ON**

### Current Configuration Check

Run this command to verify your setup:
```bash
node scripts/check-tenant-lalamove.mjs retiro
```

### Testing

Once you have PH credentials configured:

1. **Test Connection**:
   ```bash
   node scripts/test-lalamove-connection.mjs retiro
   ```

2. **Test in Checkout**:
   - Add items to cart
   - Select "Delivery" order type
   - Enter a delivery address in Philippines
   - Should get delivery fee quote

## Multi-Market Support

If you have restaurants in multiple countries, you need:
- Separate credentials for each market (HK, PH, SG, etc.)
- Configure each tenant with the correct market code
- Each market has its own pricing and service area

## Supported Markets

- HK - Hong Kong
- SG - Singapore  
- TH - Thailand
- PH - Philippines ← **You need this for retiro**
- TW - Taiwan
- MY - Malaysia
- VN - Vietnam
- ID - Indonesia
- IN - India

## Getting Help

If you don't have Philippines credentials:
- Contact Lalamove support
- Request Philippines market access
- Provide your account details
