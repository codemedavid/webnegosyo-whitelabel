# Cloudinary Setup for Image Uploads

## Required Environment Variable

To enable image uploads (for logos, QR codes, etc.), you need to set up Cloudinary:

### 1. Get Your Cloudinary Upload Preset

1. Go to [Cloudinary Dashboard](https://cloudinary.com/console)
2. Navigate to **Settings** → **Upload**
3. Scroll to **Upload presets**
4. Create a new preset or use an existing one
5. Set it to **Unsigned** (for client-side uploads)
6. Copy the preset name

### 2. Add to Environment Variables

Add this to your `.env.local` file:

```bash
# Cloudinary Upload (Required for image uploads)
NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET=your_preset_name_here
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your_cloud_name_here
```

**Example:**
```bash
NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET=ml_default
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=dxyz123abc
```

### 3. Restart Your Dev Server

```bash
npm run dev
```

## What This Enables

Once configured, admins can upload:
- ✅ Tenant logos
- ✅ Menu item images
- ✅ Payment method QR codes
- ✅ Any other images in the admin panel

## If Not Configured

The app will:
- Show a warning message where upload buttons should be
- Still function normally for all other features
- Allow manual entry of image URLs

## Security Note

The upload preset should be set to:
- ✅ **Unsigned** for client-side uploads
- ✅ Set folder restrictions if needed
- ✅ Set file size limits (recommended: 5MB)
- ✅ Set allowed formats (PNG, JPG, WEBP, GIF)

