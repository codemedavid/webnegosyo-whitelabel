# Facebook Messenger Integration Setup

## Required Environment Variables

Add these to your `.env.local` file:

```env
# Facebook App Configuration
FACEBOOK_APP_ID=your_facebook_app_id
FACEBOOK_APP_SECRET=your_facebook_app_secret
FACEBOOK_VERIFY_TOKEN=your_custom_verify_token_here
FACEBOOK_REDIRECT_URI=https://yourdomain.com/api/auth/facebook/callback
```

## How to Get These Values

### 1. Create Facebook App

1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Click "My Apps" → "Create App"
3. Choose "Business" as app type
4. Fill in app details:
   - App Name: "Smart Menu Platform" (or your choice)
   - Contact Email: your email
5. Click "Create App"

### 2. Get App ID and App Secret

1. In your app dashboard, go to **Settings** → **Basic**
2. Copy **App ID** → This is your `FACEBOOK_APP_ID`
3. Copy **App Secret** → This is your `FACEBOOK_APP_SECRET`
   - Click "Show" to reveal it
   - Keep this secret! Never commit it to git.

### 3. Add Products to Your App

1. In app dashboard, click **"Add Product"**
2. Add these products:
   - **Facebook Login** - For OAuth authentication
   - **Messenger** - For sending messages

### 4. Configure Facebook Login

1. Go to **Facebook Login** → **Settings**
2. Add **Valid OAuth Redirect URIs**:
   ```
   https://yourdomain.com/api/auth/facebook/callback
   ```
   (Replace with your actual domain)
3. Click **Save Changes**

### 5. Configure Messenger Webhook

1. Go to **Messenger** → **Settings**
2. Under **Webhooks**, click **"Add Callback URL"**
3. Enter:
   - **Callback URL**: `https://yourdomain.com/api/webhook`
   - **Verify Token**: Create a random string (e.g., `my_secure_token_12345`)
     - Save this as your `FACEBOOK_VERIFY_TOKEN`
4. Click **"Verify and Save"**
5. Under **Webhook Fields**, subscribe to:
   - `messages`
   - `messaging_postbacks`
   - `messaging_referrals` (IMPORTANT - for ref parameter)

### 6. Set Redirect URI

Set `FACEBOOK_REDIRECT_URI` to match your OAuth callback URL:
```
FACEBOOK_REDIRECT_URI=https://yourdomain.com/api/auth/facebook/callback
```

## Security Notes

- **Never commit** `.env.local` to git (it's in `.gitignore`)
- **App Secret** must be kept secure
- **Verify Token** should be a strong random string
- Use HTTPS for all callback URLs in production

## Testing

After setup:
1. Restaurant owner clicks "Connect Facebook Page" in admin
2. They log in with Facebook
3. They select their Page
4. Orders will automatically send to Messenger when customers complete checkout

## Troubleshooting

### Webhook Verification Fails
- Check that `FACEBOOK_VERIFY_TOKEN` matches what you set in Facebook dashboard
- Ensure webhook URL is accessible (not behind firewall)
- Check that route handles GET requests correctly

### OAuth Redirect Error
- Verify `FACEBOOK_REDIRECT_URI` matches exactly what's in Facebook app settings
- Ensure redirect URI uses HTTPS in production
- Check that route handles GET requests correctly

### Messages Not Sending
- Verify page is subscribed to webhook
- Check page access token is valid
- Ensure webhook is receiving `messaging_referrals` events

