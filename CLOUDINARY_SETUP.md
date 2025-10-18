# Cloudinary Setup Guide

This guide explains how to set up Cloudinary for image uploads in your white-label restaurant platform.

## 📋 Prerequisites

- A Cloudinary account (free tier available)
- Access to your project's environment variables

## 🚀 Step-by-Step Setup

### 1. Create a Cloudinary Account

1. Go to [https://cloudinary.com](https://cloudinary.com)
2. Sign up for a free account
3. Verify your email address

### 2. Get Your Cloud Name

1. After logging in, go to your **Dashboard**
2. You'll see your **Cloud Name** at the top
3. Copy this value - you'll need it for `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`

### 3. Create an Upload Preset

An upload preset defines how your images are processed and stored.

1. Navigate to **Settings** (gear icon in top right)
2. Click on the **Upload** tab
3. Scroll down to **Upload presets**
4. Click **Add upload preset**

#### Configure the Preset:

**Basic Settings:**
- **Preset name**: `whitelabel-uploads` (or your preferred name)
- **Signing mode**: Select **Unsigned** (allows client-side uploads)
- **Folder**: `tenants` (optional, organizes your uploads)

**Media Analysis:**
- Keep defaults or adjust based on your needs

**Upload Manipulations:**
- **Transformations** (optional):
  - Format: Auto (optimizes format automatically)
  - Quality: Auto (balances quality and file size)
  - Resize mode: Limit (prevents oversized images)
  - Max width: 2000px
  - Max height: 2000px

**Upload Control:**
- **Allowed formats**: `jpg, png, webp, gif`
- **Max file size**: `5 MB` (5000000 bytes)

5. Click **Save** at the bottom

### 4. Configure Environment Variables

Create or update your `.env.local` file:

```bash
# Cloudinary Configuration
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your_cloud_name_here
NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET=whitelabel-uploads
```

**Replace:**
- `your_cloud_name_here` with your actual Cloud Name from step 2
- `whitelabel-uploads` with your preset name from step 3

### 5. Restart Your Development Server

```bash
npm run dev
```

## ✅ Testing the Integration

1. Navigate to `/superadmin/tenants/new`
2. Click on the "Upload Image" button in the Logo section
3. You should see the Cloudinary upload widget
4. Try uploading a test image

### Expected Behavior:
- Image upload widget opens
- You can crop the image (square crop for logos)
- After upload, preview appears
- Image URL is automatically saved to the form

## 🎨 Features Implemented

### Current Features:
- ✅ Tenant logo upload
- ✅ Automatic cropping (1:1 ratio for logos)
- ✅ Image preview
- ✅ File size limit (5MB)
- ✅ Format restrictions (PNG, JPG, WEBP, GIF)
- ✅ Organized folder structure (`tenants/logos`)

### Future Extensions:
- Menu item images
- Category icons
- Restaurant banner images
- Order receipts/attachments

## 📁 Image Organization

Images are automatically organized in Cloudinary:

```
your-cloudinary-account/
└── tenants/
    └── logos/
        ├── tenant-logo-1.jpg
        ├── tenant-logo-2.png
        └── ...
```

## 🔒 Security Considerations

### Why "Unsigned" Upload Preset?

- **Client-side uploads**: Images are uploaded directly from the browser to Cloudinary
- **No server bottleneck**: Faster uploads, reduced server load
- **Secure enough for user-generated content**: You control allowed formats, sizes, and folders

### Recommended Settings:

1. **Limit upload sources** in Cloudinary settings
2. **Enable moderation** if you need to review images before they go live
3. **Set up transformations** to automatically optimize images
4. **Use folders** to organize content by tenant

## 🐛 Troubleshooting

### Widget Not Opening
- Check browser console for errors
- Verify environment variables are set correctly
- Ensure you restarted the dev server after adding env vars

### Upload Fails
- Check upload preset is set to "Unsigned"
- Verify file size is under 5MB
- Confirm file format is allowed (PNG, JPG, WEBP, GIF)

### Image Not Displaying
- Check the returned URL in browser console
- Verify Cloudinary cloud name is correct
- Ensure image was successfully uploaded to Cloudinary dashboard

## 💰 Pricing & Limits

### Cloudinary Free Tier:
- 25 credits/month (includes storage, bandwidth, transformations)
- 25 GB storage
- 25 GB bandwidth
- More than enough for most small to medium restaurants

### When to Upgrade:
- High traffic restaurants with many images
- Need advanced features (AI-based cropping, video support)
- Require higher bandwidth/storage

## 📚 Additional Resources

- [Cloudinary Documentation](https://cloudinary.com/documentation)
- [Next-Cloudinary Docs](https://next-cloudinary.dev/)
- [Upload Widget Reference](https://cloudinary.com/documentation/upload_widget)

## 🔄 Component Reusability

The `ImageUpload` component is reusable and can be used for other image uploads:

```tsx
import { ImageUpload } from '@/components/shared/image-upload'

<ImageUpload
  value={imageUrl}
  onChange={(url) => setImageUrl(url)}
  label="Menu Item Image"
  description="Upload a photo of your dish"
  folder="menu-items"
/>
```

Perfect for future features like menu item images!

## ✨ Next Steps

Once Cloudinary is set up, you can:
1. Create or edit tenants with logo uploads
2. Extend the component for menu item images
3. Add image transformations for different sizes
4. Implement automatic image optimization

