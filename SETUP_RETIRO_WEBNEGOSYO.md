 # 🚀 Setup retiro.webnegosyo.com

## Your Setup
- ✅ Domain: `webnegosyo.com` (in Vercel)
- ✅ Tenant: `retiro` (in database)
- ❌ Not working: `retiro.webnegosyo.com`

---

## 🔍 Checklist to Fix

### Step 1: Add Wildcard Domain in Vercel

1. **Go to Vercel Dashboard**
2. **Select your project**
3. **Settings → Domains**
4. **Add this domain:**
   ```
   *.webnegosyo.com
   ```

**Important:** You need the wildcard (`*`) to handle all subdomains!

Current domains should show:
```
✅ webnegosyo.com
✅ www.webnegosyo.com
✅ *.webnegosyo.com          ← Add this!
```

---

### Step 2: Check DNS Configuration

Go to your domain registrar (where you bought webnegosyo.com) and verify:

```
Type    Name    Value                       TTL
────────────────────────────────────────────────
A       @       76.76.21.21                Auto
A       *       76.76.21.21                Auto  ← WILDCARD!
```

**The `*` A record is CRITICAL for subdomains!**

---

### Step 3: Set Environment Variable in Vercel

1. **Vercel Dashboard → Your Project**
2. **Settings → Environment Variables**
3. **Add or verify:**

```
Name:  PLATFORM_ROOT_DOMAIN
Value: webnegosyo.com
```

**Important:** 
- Use `webnegosyo.com` (no https://, no www)
- Apply to: Production, Preview, Development
- After adding: **Redeploy your app!**

---

### Step 4: Redeploy

After setting environment variable:

1. **Go to Deployments tab**
2. **Click "..." on latest deployment**
3. **Click "Redeploy"**

Or trigger new deployment:
```bash
git commit --allow-empty -m "Trigger redeploy"
git push
```

---

## 🧪 Test Your Setup

### Check DNS Propagation:

```bash
# Check if DNS is working:
nslookup retiro.webnegosyo.com

# Should return Vercel's IP (76.76.21.21)
```

**Or use online tool:**
https://dnschecker.org/#A/retiro.webnegosyo.com

---

### Test the URL:

After DNS propagates (can take 5-60 minutes):

```
https://retiro.webnegosyo.com
```

Should redirect to:
```
https://retiro.webnegosyo.com/menu
```

---

## 🔍 Debugging Steps

### If still not working, check:

#### 1. Environment Variable Set?

In Vercel terminal (or add to test page):
```bash
# Check in Vercel Functions logs:
echo $PLATFORM_ROOT_DOMAIN
```

Should output: `webnegosyo.com`

#### 2. Wildcard Domain Added?

Vercel Domains page should show:
- ✅ `webnegosyo.com`
- ✅ `*.webnegosyo.com`

#### 3. DNS Configured?

Check at your domain registrar:
- ✅ A record for `*` pointing to `76.76.21.21`

#### 4. Deployed After Changes?

- Environment variable changes require redeploy
- Check deployment logs for errors

---

## 🎯 Quick Verification Commands

### Check if tenant exists:
```sql
-- In Supabase SQL Editor:
SELECT slug, name, is_active 
FROM tenants 
WHERE slug = 'retiro';
```

Should return:
```
slug    name     is_active
retiro  retiro   true
```

### Check environment variable locally:
```bash
# In .env.local (for local testing):
PLATFORM_ROOT_DOMAIN=webnegosyo.com
```

### Test middleware logic:
Visit these and check browser console/network tab:
```
https://webnegosyo.com/retiro/menu     ← Path-based (should work)
https://retiro.webnegosyo.com          ← Subdomain (fixing)
```

---

## 📊 How It Should Work

```
User visits: retiro.webnegosyo.com
       ↓
DNS resolves to: Vercel (76.76.21.21)
       ↓
Vercel routes to your app
       ↓
Middleware extracts: "retiro"
       ↓
Checks PLATFORM_ROOT_DOMAIN: "webnegosyo.com"
       ↓
Matches! Extract subdomain
       ↓
Rewrite to: /retiro/menu
       ↓
Serve tenant page ✅
```

---

## 🚨 Common Issues

### Issue: "Too Many Redirects"

**Solution:** Check middleware isn't rewriting already-rewritten URLs.

Current middleware should have:
```typescript
if (tenantSlug && !pathname.startsWith(`/${tenantSlug}/`)) {
  // Only rewrite if not already /tenant/...
}
```

### Issue: "Invalid Host Header"

**Solution:** Vercel needs to know about the domain. Add `*.webnegosyo.com` to Vercel Domains.

### Issue: DNS Not Resolving

**Wait time:** DNS can take up to 48 hours to propagate globally.

**Quick test:** Add to `/etc/hosts`:
```
76.76.21.21  retiro.webnegosyo.com
```

---

## ✅ Final Checklist

Before `retiro.webnegosyo.com` works:

- [ ] Wildcard domain `*.webnegosyo.com` added in Vercel
- [ ] DNS has A record for `*` → `76.76.21.21`
- [ ] Environment variable `PLATFORM_ROOT_DOMAIN=webnegosyo.com` set
- [ ] App redeployed after env var change
- [ ] DNS propagated (wait 5-60 min)
- [ ] Tenant `retiro` exists and is active in database

---

## 🎯 Test Both Methods

### Path-Based (Should work NOW):
```
https://webnegosyo.com/retiro/menu
```

### Subdomain (Should work after setup):
```
https://retiro.webnegosyo.com
```

Both should show the same content!

---

## 📞 What to Check Right Now

1. **Vercel Domains:** Does it show `*.webnegosyo.com`?
2. **DNS Settings:** Is there an A record for `*`?
3. **Environment Variables:** Is `PLATFORM_ROOT_DOMAIN` set?
4. **Deployment:** Did you redeploy after setting env var?

Tell me which of these is missing and I'll help fix it!
