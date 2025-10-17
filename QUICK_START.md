# 🚀 Quick Start - Accessing Your Vercel Deployment

## Problem: Can't Access Deployed App?

Here's how to fix it and access your tenants:

---

## 📋 Step-by-Step Solution

### 1. Find Your Vercel URL

Your app is deployed at one of these:
- `https://whitelabel-[random].vercel.app`
- `https://your-project-name.vercel.app`
- Your custom domain (if configured)

**To find it:**
```bash
# Check your Vercel dashboard
# Or run (if Vercel CLI installed):
vercel ls

# Or check your git commit for deployment comment
```

---

### 2. Access Superadmin First

**You MUST start here:**

```
https://your-domain.vercel.app/superadmin/login
```

**Why?** Because you need to create tenants before visiting tenant pages.

---

### 3. Login Issues?

If you can't login, you need a superadmin user:

#### Option A: Check Database Directly

Go to your Supabase Dashboard → SQL Editor and run:

```sql
-- Check if you have superadmin user
SELECT 
  u.email,
  au.role 
FROM auth.users u
JOIN app_users au ON au.user_id = u.id
WHERE au.role = 'superadmin';
```

#### Option B: Create Superadmin User

1. **First, create a user in Supabase:**
   - Go to Supabase Dashboard
   - Authentication → Users
   - Click "Add user"
   - Enter email and password
   - Copy the User ID

2. **Then make them superadmin:**
   ```sql
   -- In Supabase SQL Editor:
   INSERT INTO app_users (user_id, role)
   VALUES (
     'paste-your-user-id-here',
     'superadmin'
   );
   ```

3. **Now login:**
   - Go to `/superadmin/login`
   - Use the email/password you created

---

### 4. Create Your First Tenant

Once logged in:

1. Click "Tenants" in sidebar
2. Click "Add Tenant" button
3. Fill in the form:

```
Name: Bella Italia
Slug: bella-italia (URL-friendly)
Messenger Page ID: 123456789 (any number for testing)
Colors: (use defaults or customize)
Active: ✓ checked
```

4. Click "Create Tenant"

---

### 5. Visit Your Tenant!

Now you can access:

```
Customer Menu:
https://your-domain.vercel.app/bella-italia/menu

Admin Panel:
https://your-domain.vercel.app/bella-italia/admin
```

---

## 🔍 Verify Database Setup

### Quick Database Check

Run this SQL in Supabase SQL Editor:

```sql
-- 1. Check users
SELECT 
  'Users' as table_name,
  COUNT(*) as count
FROM auth.users
UNION ALL
-- 2. Check superadmins
SELECT 
  'Superadmins',
  COUNT(*)
FROM app_users
WHERE role = 'superadmin'
UNION ALL
-- 3. Check tenants
SELECT 
  'Tenants',
  COUNT(*)
FROM tenants
UNION ALL
-- 4. Check active tenants
SELECT 
  'Active Tenants',
  COUNT(*)
FROM tenants
WHERE is_active = true;
```

### List All Tenants

```sql
SELECT 
  name,
  slug,
  is_active,
  created_at
FROM tenants
ORDER BY created_at DESC;
```

---

## 🌐 URL Structure

Once you have tenants, here are all the URLs:

### Public (No Login Required):
```
/                              → Root (redirects)
/{slug}/menu                   → Customer menu
/{slug}/cart                   → Shopping cart
/{slug}/checkout               → Checkout page
```

### Admin (Login Required):
```
/superadmin/login              → Superadmin login
/superadmin                    → Platform dashboard
/superadmin/tenants            → Manage tenants
/superadmin/tenants/new        → Create tenant
/superadmin/tenants/{id}       → Edit tenant

/{slug}/admin                  → Restaurant admin
/{slug}/admin/menu             → Menu management
/{slug}/admin/categories       → Category management
/{slug}/admin/orders           → Orders
```

---

## ⚠️ Common Issues

### Issue: "Page Not Found" on tenant URL

**Cause:** Tenant doesn't exist or is inactive

**Solution:**
```sql
-- Check in Supabase:
SELECT slug, is_active FROM tenants;

-- If exists but inactive:
UPDATE tenants 
SET is_active = true 
WHERE slug = 'your-slug';
```

---

### Issue: Can't Login to Superadmin

**Cause:** No superadmin user exists

**Solution:** Follow Step 3 above to create superadmin user

---

### Issue: Middleware Redirecting Everything

**Cause:** Middleware might be blocking routes

**Check:** `src/middleware.ts` should have:
```typescript
const isPublicRoute =
  pathname.includes('/menu') ||
  pathname === '/' ||
  pathname.includes('/login') ||
  pathname.startsWith('/superadmin/login')
```

---

## 🎯 Quick Test Checklist

Before accessing your app:

- [ ] Vercel deployment successful
- [ ] Environment variables set in Vercel:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] Supabase migrations applied
- [ ] At least 1 superadmin user exists
- [ ] At least 1 tenant exists with `is_active = true`
- [ ] Can access `/superadmin/login`

---

## 📞 Your Deployment Info

Fill this in for reference:

```
Vercel URL: ___________________________
Supabase Project: ______________________

Superadmin Email: ______________________
First Tenant Slug: _____________________

Customer URL: /[slug]/menu
Admin URL: /superadmin
```

---

## 🆘 Still Stuck?

### Check Vercel Deployment Logs:

1. Go to Vercel Dashboard
2. Click your project
3. Go to "Deployments" tab
4. Click latest deployment
5. Check "Functions" tab for errors

### Check Supabase Logs:

1. Go to Supabase Dashboard
2. Click "Logs"
3. Select "API" logs
4. Look for failed queries or 401/403 errors

### Environment Variables:

Make sure these are set in **Vercel** (not just locally):
- Settings → Environment Variables
- Add both `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Redeploy after adding

---

## ✅ Success!

Once you can access:
1. ✅ `/superadmin/login` - Login page loads
2. ✅ `/superadmin/tenants` - Can see/create tenants
3. ✅ `/{slug}/menu` - Customer menu works

**You're all set!** 🎉

