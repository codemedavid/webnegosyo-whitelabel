# 🚀 Vercel Deployment Guide

## How Your App Works on Vercel

### Route Structure:

Your app has **3 main areas**:

1. **Superadmin** - Platform management
   - URL: `https://your-app.vercel.app/superadmin`
   - Login required (superadmin role)

2. **Tenant/Restaurant pages** - Customer-facing
   - URL: `https://your-app.vercel.app/{tenant-slug}/menu`
   - Example: `https://your-app.vercel.app/bella-italia/menu`

3. **Tenant Admin** - Restaurant management
   - URL: `https://your-app.vercel.app/{tenant-slug}/admin`
   - Example: `https://your-app.vercel.app/bella-italia/admin`

---

## 🔍 Problem: No Tenants Yet

If you're getting 404 errors, it's because **you haven't created any tenants yet**.

### Solution: Access Superadmin First

1. **Go to Superadmin:**
   ```
   https://your-app.vercel.app/superadmin/login
   ```

2. **Login with superadmin credentials**
   - You need a user in `app_users` table with `role = 'superadmin'`

3. **Create your first tenant:**
   - Go to `/superadmin/tenants`
   - Click "Add Tenant"
   - Fill in the form (name, slug, etc.)

4. **Access the tenant:**
   ```
   https://your-app.vercel.app/{slug-you-created}/menu
   ```

---

## 🗄️ Check Your Database

You need to check if you have:

### 1. Superadmin User

Run this query in Supabase SQL Editor:

```sql
-- Check if you have a superadmin user
SELECT * FROM app_users WHERE role = 'superadmin';
```

**If empty, create one:**

```sql
-- First, create a user via Supabase Auth dashboard
-- Then insert into app_users:

INSERT INTO app_users (user_id, role)
VALUES (
  'your-user-id-from-auth-users',  -- Get from auth.users table
  'superadmin'
);
```

### 2. Check Tenants

```sql
-- Check existing tenants
SELECT id, name, slug, is_active FROM tenants;
```

**If empty, your database has no restaurants yet.**

---

## 🚀 Quick Setup Steps

### Step 1: Create Superadmin User

```sql
-- 1. Go to Supabase Dashboard → Authentication → Users
-- 2. Click "Add User" (or sign up via your app)
-- 3. Copy the User ID

-- 4. Run this in SQL Editor:
INSERT INTO app_users (user_id, role)
VALUES ('paste-user-id-here', 'superadmin');
```

### Step 2: Login to Superadmin

```
Visit: https://your-app.vercel.app/superadmin/login
Email: your-email@example.com
Password: your-password
```

### Step 3: Create Test Tenant

1. Go to `/superadmin/tenants`
2. Click "Add Tenant"
3. Fill in:
   - **Name**: Bella Italia
   - **Slug**: bella-italia
   - **Messenger Page ID**: 123456789 (any number for now)
   - **Colors**: Use defaults
4. Click "Create Tenant"

### Step 4: Visit Tenant Page

```
https://your-app.vercel.app/bella-italia/menu
```

---

## 🔧 Troubleshooting

### Issue: "Can't access /superadmin/login"

**Check middleware:**
- Middleware should allow `/superadmin/login` without auth
- Check `src/middleware.ts` line 57

**Solution:**
```typescript
const isPublicRoute =
  pathname.includes('/menu') ||
  pathname === '/' ||
  pathname.includes('/login') ||
  pathname.startsWith('/superadmin/login')  // ← This line
```

---

### Issue: "Getting 404 on tenant pages"

**Possible causes:**

1. **No tenant with that slug exists**
   ```sql
   -- Check in Supabase:
   SELECT slug FROM tenants WHERE slug = 'your-slug';
   ```

2. **Tenant is inactive**
   ```sql
   -- Check if active:
   SELECT slug, is_active FROM tenants;
   
   -- Activate if needed:
   UPDATE tenants SET is_active = true WHERE slug = 'your-slug';
   ```

3. **RLS (Row Level Security) blocking access**
   ```sql
   -- Check RLS policies are set up correctly
   -- Should allow public read for active tenants
   ```

---

### Issue: "Can't login to superadmin"

**Check:**

1. **User exists in auth.users**
   ```sql
   SELECT id, email FROM auth.users;
   ```

2. **User has superadmin role**
   ```sql
   SELECT user_id, role FROM app_users;
   ```

3. **RLS policy allows reading own role**
   ```sql
   -- Should exist from migration 0002:
   SELECT * FROM pg_policies 
   WHERE tablename = 'app_users' 
   AND policyname = 'app_users_select_self';
   ```

---

## 📝 Create Test Data Script

Save this as `scripts/create-test-data.mjs`:

```javascript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY // Admin key

const supabase = createClient(supabaseUrl, supabaseKey)

// Create test tenant
const { data: tenant, error } = await supabase
  .from('tenants')
  .insert({
    name: 'Bella Italia',
    slug: 'bella-italia',
    primary_color: '#c41e3a',
    secondary_color: '#009246',
    accent_color: '#ffd700',
    messenger_page_id: '123456789',
    is_active: true,
  })
  .select()
  .single()

if (error) {
  console.error('Error:', error)
} else {
  console.log('✅ Created tenant:', tenant.slug)
  console.log(`Visit: https://your-app.vercel.app/${tenant.slug}/menu`)
}
```

Run with:
```bash
node scripts/create-test-data.mjs
```

---

## 🌐 Your Vercel URLs

Once you have tenants, you can access:

### Public Pages (No Auth):
```
https://your-app.vercel.app/bella-italia/menu
https://your-app.vercel.app/bella-italia/cart
https://your-app.vercel.app/bella-italia/checkout
```

### Admin Pages (Auth Required):
```
https://your-app.vercel.app/superadmin/login
https://your-app.vercel.app/superadmin/tenants
https://your-app.vercel.app/bella-italia/admin
```

---

## ✅ Verification Checklist

Before accessing your app:

- [ ] Supabase project is linked to Vercel
- [ ] Environment variables are set in Vercel:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] Database migrations have run
- [ ] At least one superadmin user exists
- [ ] At least one tenant exists with `is_active = true`

---

## 🎯 Quick Test Flow

1. **Visit**: `https://your-app.vercel.app/superadmin/login`
2. **Login** with superadmin credentials
3. **Create tenant** at `/superadmin/tenants`
4. **Visit**: `https://your-app.vercel.app/{your-slug}/menu`
5. **Success!** 🎉

---

## 🆘 Still Not Working?

### Check Vercel Logs:

1. Go to Vercel Dashboard
2. Select your project
3. Go to "Deployments"
4. Click on latest deployment
5. Check "Functions" tab for errors

### Check Supabase Logs:

1. Go to Supabase Dashboard
2. Select "Logs" → "API"
3. Look for failed queries

### Common Errors:

| Error | Solution |
|-------|----------|
| "Module not found" | Missing dependencies - check `package.json` |
| "401 Unauthorized" | Check Supabase keys in Vercel env vars |
| "403 Forbidden" | RLS policies blocking - check policies |
| "404 Not Found" | No tenant exists with that slug |

---

## 📞 Need the Current Vercel URL?

To find your Vercel deployment URL:

```bash
# If you have Vercel CLI:
vercel ls

# Or check:
# - Vercel Dashboard
# - Git commit deployment comment
# - Vercel email notification
```

Your URL will be something like:
- `whitelabel-abc123.vercel.app`
- `your-project-name.vercel.app`
- Your custom domain if configured

