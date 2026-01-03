# Custom Domain Setup Guide

Complete guide for configuring custom domains for tenants in the multi-tenant platform.

---

## Overview

Custom domains allow each tenant (restaurant) to have their own branded domain (e.g., `retiro.com`, `bellaitalia.com`) instead of using subdomains or path-based URLs.

**How it works:**
- Tenant visits `retiro.com` → System detects custom domain → Routes to tenant's menu
- Automatically handles `www.retiro.com` and `retiro.com` (both work)
- Falls back to subdomain routing if no custom domain is configured

---

## Step 1: Add Domain in Admin Panel

### Via SuperAdmin UI

1. **Navigate to Tenant Management:**
   - Go to `/superadmin/tenants`
   - Click on the tenant you want to configure

2. **Enter Custom Domain:**
   - In the "Basic Information" section
   - Find the "Custom Domain" field
   - Enter your domain (e.g., `retiro.com` or `www.retiro.com`)
   - The system will automatically normalize it (removes www, protocol, etc.)

3. **Save Changes:**
   - Click "Save" or "Update Tenant"
   - Domain will be validated and stored in normalized format

### Domain Format Examples

| What You Enter | What Gets Stored | What Works |
|---------------|-----------------|------------|
| `retiro.com` | `retiro.com` | ✅ `retiro.com`, `www.retiro.com` |
| `www.retiro.com` | `retiro.com` | ✅ `retiro.com`, `www.retiro.com` |
| `https://retiro.com` | `retiro.com` | ✅ `retiro.com`, `www.retiro.com` |
| `https://www.retiro.com/` | `retiro.com` | ✅ `retiro.com`, `www.retiro.com` |

**Note:** The system automatically normalizes domains, so all variants work.

---

## Step 2: Configure DNS

After adding the domain in the admin panel, you need to point your domain's DNS to Vercel.

### Option A: Using Vercel's DNS (Recommended)

1. **Add Domain to Vercel:**
   - Go to your Vercel project → Settings → Domains
   - Click "Add Domain"
   - Enter your custom domain (e.g., `retiro.com`)
   - Vercel will provide DNS records

2. **Update Your Domain Registrar:**
   - Go to your domain registrar (GoDaddy, Namecheap, etc.)
   - Update nameservers to Vercel's nameservers:
     ```
     ns1.vercel-dns.com
     ns2.vercel-dns.com
     ```
   - Or add the DNS records Vercel provides

3. **Wait for DNS Propagation:**
   - Usually takes 5-60 minutes
   - Check with: `nslookup retiro.com` or use [dnschecker.org](https://dnschecker.org)

### Option B: Using Your Own DNS Provider

1. **Add Domain to Vercel:**
   - Go to Vercel project → Settings → Domains
   - Add your domain: `retiro.com`
   - Vercel will show you the required DNS records

2. **Add DNS Records at Your Provider:**
   - Go to your DNS provider (Cloudflare, Route53, etc.)
   - Add an A record:
     ```
     Type: A
     Name: @ (or retiro.com)
     Value: 76.76.21.21 (Vercel's IP - check Vercel dashboard for current IP)
     TTL: Auto (or 3600)
     ```

3. **Add CNAME for www (Optional but Recommended):**
   ```
   Type: CNAME
   Name: www
   Value: cname.vercel-dns.com
   TTL: Auto
   ```

4. **Wait for DNS Propagation:**
   - Check DNS propagation: [dnschecker.org](https://dnschecker.org)
   - Verify: `nslookup retiro.com`

---

## Step 3: Verify SSL Certificate

Vercel automatically provisions SSL certificates for custom domains:

1. **Check SSL Status:**
   - Go to Vercel project → Settings → Domains
   - Find your domain
   - Status should show "Valid" with a green checkmark

2. **Wait for Certificate:**
   - SSL certificates are automatically provisioned
   - Usually takes 1-5 minutes after DNS is configured
   - You'll see "Valid" status when ready

3. **Test HTTPS:**
   - Visit `https://retiro.com` in your browser
   - Should show a valid SSL certificate (lock icon)

---

## Step 4: Test Custom Domain

### Test Checklist

1. **Test Root Domain:**
   ```bash
   curl -I https://retiro.com
   # Should return 200 OK
   ```

2. **Test www Variant:**
   ```bash
   curl -I https://www.retiro.com
   # Should also work (automatically handled)
   ```

3. **Test in Browser:**
   - Visit `https://retiro.com`
   - Should redirect/rewrite to `https://retiro.com/menu`
   - Should show the tenant's menu with their branding

4. **Verify Tenant Resolution:**
   - Check browser console for any errors
   - Verify tenant branding is applied
   - Confirm menu items load correctly

---

## Troubleshooting

### Issue: Domain Not Resolving

**Symptoms:** `retiro.com` shows "This site can't be reached" or DNS error

**Solutions:**
1. **Check DNS Propagation:**
   ```bash
   nslookup retiro.com
   # Should return Vercel's IP address
   ```

2. **Verify DNS Records:**
   - Check your DNS provider has correct A record
   - Ensure nameservers are correct (if using Vercel DNS)

3. **Wait Longer:**
   - DNS can take up to 48 hours to fully propagate
   - Usually works within 1-2 hours

### Issue: SSL Certificate Not Valid

**Symptoms:** Browser shows "Not Secure" or SSL error

**Solutions:**
1. **Check Vercel Dashboard:**
   - Go to Settings → Domains
   - Verify domain shows "Valid" status
   - If "Pending", wait a few minutes

2. **Verify DNS:**
   - SSL requires DNS to be fully propagated
   - Check: `nslookup retiro.com`

3. **Force SSL Renewal:**
   - In Vercel dashboard, remove and re-add the domain
   - Wait for certificate to regenerate

### Issue: Domain Routes to Wrong Tenant

**Symptoms:** `retiro.com` shows a different tenant's content

**Solutions:**
1. **Check Domain in Database:**
   ```sql
   SELECT slug, domain FROM tenants WHERE domain = 'retiro.com';
   ```

2. **Verify Domain Normalization:**
   - Check admin panel shows correct domain
   - Ensure no typos in domain field

3. **Clear Cache:**
   - Domain cache expires after 5 minutes
   - Wait or restart the application

### Issue: www Variant Not Working

**Symptoms:** `www.retiro.com` doesn't work, but `retiro.com` does

**Solutions:**
1. **Add CNAME Record:**
   ```
   Type: CNAME
   Name: www
   Value: cname.vercel-dns.com
   ```

2. **Verify in Vercel:**
   - Vercel should automatically handle www
   - Check domain settings in Vercel dashboard

3. **Check Domain Storage:**
   - System stores domain without www
   - Both variants should work automatically

---

## Advanced Configuration

### Multiple Domains Per Tenant

Currently, each tenant can only have one custom domain. To support multiple domains:

1. **Option 1: Use DNS CNAME**
   - Point multiple domains to the same tenant domain
   - Example: `retiro-ph.com` → CNAME → `retiro.com`

2. **Option 2: Database Update (Future Feature)**
   - Would require schema change to support multiple domains
   - Not currently implemented

### Subdomain + Custom Domain

You can use both:
- Custom domain: `retiro.com` → Routes to tenant
- Subdomain: `retiro.yourdomain.com` → Also routes to same tenant

**Priority:** Custom domain is checked first, then subdomain.

### Domain Validation

The system validates domains:
- Must be valid domain format
- Must contain at least one dot
- Automatically normalized (removes protocol, www, trailing slashes)
- Uniqueness enforced (no two tenants can have same domain)

---

## Testing Locally

### Using /etc/hosts (macOS/Linux)

1. **Edit hosts file:**
   ```bash
   sudo nano /etc/hosts
   ```

2. **Add entry:**
   ```
   127.0.0.1  retiro.com
   127.0.0.1  www.retiro.com
   ```

3. **Test:**
   ```bash
   # Visit in browser:
   http://retiro.com:3000
   ```

### Using Localhost Subdomain

For local testing, you can still use subdomain routing:
```bash
http://retiro.localhost:3000
```

---

## Quick Reference

### Domain Configuration Checklist

- [ ] Domain added in admin panel (`/superadmin/tenants/[id]`)
- [ ] Domain normalized correctly (no www, protocol, etc.)
- [ ] DNS configured (A record or nameservers)
- [ ] DNS propagated (check with nslookup)
- [ ] Domain added to Vercel project
- [ ] SSL certificate valid (check Vercel dashboard)
- [ ] Test root domain (`retiro.com`)
- [ ] Test www variant (`www.retiro.com`)
- [ ] Verify tenant content loads correctly

### Common DNS Records

**For Root Domain:**
```
Type: A
Name: @
Value: 76.76.21.21 (or Vercel's current IP)
```

**For www:**
```
Type: CNAME
Name: www
Value: cname.vercel-dns.com
```

**Using Vercel Nameservers:**
```
ns1.vercel-dns.com
ns2.vercel-dns.com
```

---

## Support

If you encounter issues:

1. **Check DNS:** Use [dnschecker.org](https://dnschecker.org)
2. **Check SSL:** Verify in Vercel dashboard
3. **Check Logs:** Review Vercel deployment logs
4. **Verify Database:** Check domain is stored correctly
5. **Clear Cache:** Wait 5 minutes for cache to expire

---

*Last Updated: After custom domain implementation*
*Related Files: `src/lib/tenant.ts`, `src/middleware.ts`, `src/lib/tenants-service.ts`*

