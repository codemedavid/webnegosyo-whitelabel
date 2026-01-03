# Cloudinary Quick Start (5 Minutes)

The absolute fastest way to get Cloudinary working:

## 1️⃣ Sign Up (2 minutes)
```
1. Go to https://cloudinary.com/users/register_free
2. Sign up with email
3. Verify email
```

## 2️⃣ Get Your Cloud Name (30 seconds)
```
1. Login to Cloudinary Dashboard
2. Copy your "Cloud Name" from the top
   Example: "dxyz123abc"
```

## 3️⃣ Create Upload Preset (1 minute)
```
1. Settings (gear icon) → Upload tab
2. Scroll to "Upload presets"
3. Click "Add upload preset"
4. Set:
   - Name: "whitelabel-uploads"
   - Signing Mode: "Unsigned" ⚠️ IMPORTANT!
5. Click Save
```

## 4️⃣ Add to .env.local (1 minute)
```bash
# Create or update .env.local file
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=dxyz123abc
NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET=whitelabel-uploads

# Keep your existing Supabase variables too!
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
PLATFORM_ROOT_DOMAIN=...
```

## 5️⃣ Restart Dev Server (30 seconds)
```bash
# Stop your dev server (Ctrl+C)
# Then restart:
npm run dev
```

## ✅ Test It!
```
1. Go to http://localhost:3000/superadmin/tenants/new
2. Click "Upload Image" in the Logo section
3. Upload a test image
4. See the preview appear!
```

## 🚨 Common Issues

**Widget doesn't open?**
- Did you restart the dev server?
- Check .env.local has NEXT_PUBLIC_ prefix

**Upload fails?**
- Preset must be "Unsigned"
- Check preset name matches exactly

**Still not working?**
- Open browser console (F12)
- Look for error messages
- Check the full CLOUDINARY_SETUP.md guide

That's it! You're ready to upload logos for your tenants. 🎉

