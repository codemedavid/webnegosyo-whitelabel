# Fix: User Not Allowed Error

## Problem
When trying to add a new user, you're getting "user not allowed" error. This happens because the Auth Admin API requires a **service role key** with elevated privileges.

## Solution

I've updated the code to use a dedicated admin client with service role privileges. Now you need to add the service role key to your environment variables.

### Step 1: Get Your Supabase Service Role Key

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Go to **Settings** → **API**
4. Find the **"service_role" secret** key (not the anon key)
5. Copy it (it starts with `eyJ...`)

### Step 2: Add to Environment Variables

Create or update your `.env.local` file in the root of your project:

```bash
# Existing variables
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key

# Add this NEW variable with your service role key
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

⚠️ **IMPORTANT**: The service role key bypasses Row Level Security (RLS). NEVER expose this key to the client-side code or commit it to git.

### Step 3: Restart Your Development Server

After adding the environment variable, restart your Next.js dev server:

```bash
# Stop the current server (Ctrl+C)
# Then restart
npm run dev
```

### Step 4: Test Again

1. Go to `/superadmin/tenants`
2. Click "Edit" on any tenant
3. Click "Add User"
4. Enter email and password
5. It should work now! ✅

## What Changed

### New File: `src/lib/supabase/admin.ts`
Created a dedicated admin client that uses the service role key:

```typescript
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY // NEW!

  return createClient<Database>(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
```

### Updated: `src/actions/users.ts`
Now uses `createAdminClient()` for admin operations:

- ✅ Creating users
- ✅ Deleting users
- ✅ Listing users
- ✅ Inserting into app_users table

## Security Notes

### ✅ Safe to Use
The admin client is **only used in Server Actions** (`'use server'`), which run exclusively on the server. It's never exposed to the browser.

### 🔒 Best Practices
1. **Never** commit `.env.local` to git (it's in `.gitignore`)
2. **Never** import `createAdminClient()` in client components
3. **Only** use it in Server Actions or API Routes
4. Store the service role key in environment variables on Vercel/deployment platform

## Vercel Deployment

When deploying to Vercel, add the environment variable:

1. Go to your Vercel project settings
2. Navigate to **Environment Variables**
3. Add: `SUPABASE_SERVICE_ROLE_KEY` with your service role key
4. Set it for **Production**, **Preview**, and **Development**
5. Redeploy your app

## Troubleshooting

### Error: "Missing Supabase environment variables"
- Make sure `SUPABASE_SERVICE_ROLE_KEY` is set in `.env.local`
- Restart your dev server after adding it

### Error: "Invalid JWT"
- Double-check you copied the **service_role** key, not the anon key
- Make sure there are no extra spaces or line breaks

### Error: "User not allowed" (still)
- Verify the environment variable is loaded: Add a console.log in `admin.ts`
- Check if `.env.local` is in the root directory (same level as `package.json`)
- Make sure you restarted the dev server

### Check Environment Variable is Loaded
Add this temporarily to `src/actions/users.ts` to verify:

```typescript
console.log('Service key exists:', !!process.env.SUPABASE_SERVICE_ROLE_KEY)
console.log('Service key starts with:', process.env.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 20))
```

Then check your terminal output when you try to add a user.

## Example `.env.local` File

```bash
# Public variables (safe to expose to browser)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvdXItcHJvamVjdCIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNjc4ODg4ODg4LCJleHAiOjE5OTQ0NjQ4ODh9...

# Private variables (NEVER expose to browser)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvdXItcHJvamVjdCIsInJvbGUiOiJzZXJ2aWNlX3JvbGUiLCJpYXQiOjE2Nzg4ODg4ODgsImV4cCI6MTk5NDQ2NDg4OH0...
```

## Why This is Needed

The Supabase Auth Admin API allows you to:
- Create users without sending verification emails
- Delete users
- List all users
- Update user metadata
- Bypass Row Level Security (RLS)

These operations require elevated permissions that the regular `anon` key doesn't have. That's why we need the `service_role` key.

## Summary

✅ **Created**: `src/lib/supabase/admin.ts` - Admin client with service role  
✅ **Updated**: `src/actions/users.ts` - Uses admin client for user operations  
📝 **Required**: Add `SUPABASE_SERVICE_ROLE_KEY` to `.env.local`  
🔄 **Action**: Restart dev server after adding the key  

After following these steps, user management should work perfectly!

