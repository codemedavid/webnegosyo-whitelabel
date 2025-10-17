# 🌐 Subdomain Setup Guide for Vercel

## Your Goal

You want:
- Local: `retiro.localhost:3000` ✅ (works)
- Vercel: `retiro.yourdomain.com` ❌ (not working yet)

---

## 🔍 Current Issues

### Issue 1: `/{slug}/menu` gives 404

**Why?** The URL should be:
```
✅ Correct: /retiro/menu
❌ Wrong:    /slugs/menu
```

Try visiting:
```
https://your-app.vercel.app/retiro/menu
```

If this works, your app is fine - you just need subdomain setup!

---

### Issue 2: Subdomain doesn't work on Vercel

**Why?** Subdomains require:
1. A custom domain
2. Wildcard DNS records
3. Vercel domain configuration

**You can't use subdomains with `.vercel.app` domains!**

---

## 🎯 Two Options

### Option A: Use Path-Based Routing (Easy, Works Now)

```
https://your-app.vercel.app/retiro/menu
https://your-app.vercel.app/bella-italia/menu
```

**No setup needed** - works immediately!

---

### Option B: Use Subdomain Routing (Requires Custom Domain)

```
https://retiro.yourdomain.com
https://bella-italia.yourdomain.com
```

**Requires:**
- Own a domain (e.g., from Namecheap, GoDaddy)
- Configure DNS
- Add to Vercel

---

## 🚀 Setup Subdomain Routing (Step-by-Step)

### Step 1: Get a Custom Domain

You need to own a domain. Examples:
- `myrestaurants.com`
- `foodhub.io`
- `dining.app`

**Where to buy:**
- Namecheap: ~$10/year
- GoDaddy: ~$12/year
- Cloudflare: ~$9/year

---

### Step 2: Add Domain to Vercel

1. **Go to Vercel Dashboard**
2. **Select your project**
3. **Go to Settings → Domains**
4. **Add your domain:**
   ```
   yourdomain.com
   ```
5. **Vercel will show DNS records to add**

---

### Step 3: Configure DNS (Wildcard)

In your domain registrar (Namecheap, GoDaddy, etc.):

#### Add These DNS Records:

```
Type    Name    Value                           TTL
────────────────────────────────────────────────────
A       @       76.76.21.21                    Auto
A       *       76.76.21.21                    Auto
CNAME   www     cname.vercel-dns.com.          Auto
```

**Important:** The `*` (wildcard) record is crucial! It handles all subdomains.

---

### Step 4: Add Wildcard Domain to Vercel

1. **In Vercel → Settings → Domains**
2. **Add wildcard domain:**
   ```
   *.yourdomain.com
   ```
3. **Vercel will verify it**
4. **Wait for DNS propagation** (5-60 minutes)

---

### Step 5: Set Environment Variable

Add this to Vercel environment variables:

```
PLATFORM_ROOT_DOMAIN=yourdomain.com
```

**How:**
1. Vercel Dashboard → Settings → Environment Variables
2. Add new variable:
   - Name: `PLATFORM_ROOT_DOMAIN`
   - Value: `yourdomain.com` (without https://)
3. **Redeploy** your app

---

### Step 6: Update Middleware (If Needed)

Your middleware already supports this! Check that `src/lib/tenant.ts` has:

```typescript
function getRootDomain(): string | null {
  return process.env.PLATFORM_ROOT_DOMAIN || null
}
```

And `src/middleware.ts` should handle subdomain rewrites.

---

### Step 7: Test It!

After DNS propagation:

```bash
# Test subdomain (should work)
https://retiro.yourdomain.com

# Should redirect to menu
https://retiro.yourdomain.com/
→ https://retiro.yourdomain.com/menu

# Main domain (superadmin)
https://yourdomain.com/superadmin
```

---

## 🧪 Testing Before DNS Propagation

### Test with hosts file:

**macOS/Linux:**
```bash
sudo nano /etc/hosts
```

**Add:**
```
76.76.21.21  retiro.yourdomain.com
76.76.21.21  bella-italia.yourdomain.com
```

**Save and test** in browser!

---

## 📋 Complete DNS Configuration Example

For domain: `myrestaurants.com`

### At Your Domain Registrar:

```
Type     Host      Value                        TTL
─────────────────────────────────────────────────────
A        @         76.76.21.21                  Auto
A        *         76.76.21.21                  Auto
CNAME    www       cname.vercel-dns.com.        Auto
```

### In Vercel Domains:

```
✅ myrestaurants.com               (Primary)
✅ www.myrestaurants.com           (Redirect to primary)
✅ *.myrestaurants.com             (Wildcard for tenants)
```

### In Vercel Environment Variables:

```
PLATFORM_ROOT_DOMAIN=myrestaurants.com
```

---

## 🔍 How It Works

### Your Middleware Logic:

```
User visits: retiro.myrestaurants.com
     ↓
Middleware extracts subdomain: "retiro"
     ↓
Checks if in RESERVED_SUBDOMAINS (www, admin, etc.)
     ↓
Not reserved? Treat as tenant slug
     ↓
Rewrite to: /retiro/menu
     ↓
Next.js serves: app/[tenant]/menu/page.tsx
```

---

## 🚦 Troubleshooting

### Issue: Subdomain shows 404

**Check:**
1. Wildcard domain added to Vercel?
   - Go to Settings → Domains
   - Should see `*.yourdomain.com`

2. DNS propagated?
   ```bash
   # Check DNS:
   nslookup retiro.yourdomain.com
   
   # Should return Vercel's IP
   ```

3. Environment variable set?
   ```bash
   # In Vercel:
   PLATFORM_ROOT_DOMAIN=yourdomain.com
   ```

---

### Issue: Works locally but not on Vercel

**Difference:**
- Local: Uses `.localhost` (automatic)
- Vercel: Needs actual DNS setup

**Solution:**
- Use path-based URLs until DNS is ready
- `/retiro/menu` should work immediately

---

### Issue: "Too Many Redirects"

**Cause:** Middleware might be in infinite loop

**Check:** `src/middleware.ts` should have:
```typescript
// Don't rewrite if already /[tenant]/...
if (tenantSlug && !pathname.startsWith(`/${tenantSlug}/`)) {
  // Rewrite here
}
```

---

## ⚡ Quick Test Right Now

### Without subdomain setup:

Try these URLs on Vercel:

```bash
# List your tenants in DB first:
# Go to Supabase SQL Editor:
SELECT slug FROM tenants WHERE is_active = true;

# Then try:
https://your-vercel-app.vercel.app/retiro/menu
https://your-vercel-app.vercel.app/[your-slug]/menu
```

**If these work**, your app is perfect! You just need domain setup.

**If these give 404**, let me know - different issue.

---

## 📊 Comparison

### Path-Based (Works Now):
```
✅ No custom domain needed
✅ Works immediately
✅ Example: myapp.vercel.app/retiro/menu
❌ Less branded
❌ Longer URLs
```

### Subdomain (Requires Setup):
```
✅ Cleaner URLs
✅ More professional (retiro.myapp.com)
✅ Better branding per tenant
❌ Requires custom domain
❌ DNS setup needed
❌ Costs money (domain)
```

---

## 🎯 Recommended Approach

### For Development/Testing:
Use path-based: `yourapp.vercel.app/retiro/menu`

### For Production:
1. Buy domain
2. Configure DNS
3. Add to Vercel
4. Enable subdomains

---

## 📝 Step-by-Step Checklist

### Phase 1: Test Path-Based (Now)
- [ ] Find your Vercel URL
- [ ] Check tenant slugs in database
- [ ] Visit: `https://your-app.vercel.app/{slug}/menu`
- [ ] Confirm it works

### Phase 2: Domain Setup (Later)
- [ ] Buy domain
- [ ] Add domain to Vercel
- [ ] Configure DNS (A record)
- [ ] Add wildcard DNS (* record)
- [ ] Add wildcard domain to Vercel
- [ ] Set PLATFORM_ROOT_DOMAIN env var
- [ ] Redeploy
- [ ] Wait for DNS propagation
- [ ] Test: `https://retiro.yourdomain.com`

---

## 💡 Quick Commands

### Check your tenants:
```sql
-- In Supabase SQL Editor:
SELECT slug, name, is_active 
FROM tenants 
WHERE is_active = true;
```

### Check DNS propagation:
```bash
# Check if DNS is ready:
nslookup retiro.yourdomain.com

# Or use online tool:
https://dnschecker.org
```

### Test locally with real domain:
```bash
# Add to /etc/hosts (macOS/Linux):
127.0.0.1  retiro.yourdomain.com

# Then visit in browser
```

---

## 🆘 What's Your Current Step?

Tell me:

1. **Do you have a custom domain?**
   - Yes → I'll guide you through DNS setup
   - No → Use path-based URLs for now

2. **Does `/retiro/menu` work on Vercel?**
   - Yes → Just need domain setup
   - No → Different issue, I'll debug

3. **What's your Vercel URL?**
   - I can test and see what's wrong

4. **What's in your database?**
   ```sql
   SELECT slug FROM tenants;
   ```
   - Tell me the slugs so I can help test

