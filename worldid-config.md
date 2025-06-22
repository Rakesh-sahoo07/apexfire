# World ID Configuration Guide for Mini Apps

## Setup Instructions

### 1. Create a World ID Mini App

1. Go to the [World ID Developer Portal](https://developer.worldcoin.org/)
2. Sign up or log in to your account
3. Click "Create New App"
4. **Important**: Choose **"Mini App"** as the integration type (not External)
5. Fill in your app details:
   - **App Name**: ApexFire (or your preferred name)
   - **App Description**: Human-only gaming with World ID verification
   - **Environment**: Choose "Staging" for testing, "Production" for live deployment

### 2. Configure Your App

After creating your app, you'll get an **App ID** that looks like: `app_staging_12345abcdef`

### 3. Create an Incognito Action

1. In your app dashboard, go to "Actions"
2. Click "Create Action"
3. Set up the incognito action:
   - **Action Name**: `login`
   - **Description**: Login to ApexFire game
   - **Action Type**: Incognito Action
   - **Max Verifications**: Unlimited (for login purposes)

### 4. Update Configuration

Open `js/worldIdAuth.js` and update the configuration object:

```javascript
this.config = {
    app_id: 'your_actual_app_id_here', // Replace with your App ID from step 2
    action: 'login', // The action name from step 3
    verification_level: 'device' // 'device' or 'orb'
};
```

### 5. Verification Levels

- **Device**: Allows verification through the World App on any device. Good for testing and broader accessibility.
- **Orb**: Requires verification through a World ID Orb. More secure but requires physical access to an Orb.

For your game, start with `device` level verification for easier testing.

### 6. Testing

**Important**: This mini app must be opened inside the World App to work properly.

1. Download the World App on your mobile device
2. Create a World ID (if you haven't already)
3. **Open your game URL inside the World App** (not in a regular browser)
4. Test the World ID verification flow

**Note**: The verification will only work when running inside the World App as a mini app. Regular browsers will show an error.

### 7. Production Deployment

For production deployment:

1. Switch to a "Production" app in the World ID Developer Portal
2. Update your `app_id` in the configuration
3. Consider implementing proper backend verification (see below)

### 8. Backend Verification (Recommended for Production)

The current implementation simulates verification for demo purposes. For production, implement proper backend verification:

```javascript
// In worldIdAuth.js, replace the handleVerify method with:
async handleVerify(result) {
    try {
        this.updateVerificationStatus('Verifying proof...', '⏳');
        
        const response = await fetch('/api/verify-worldid', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(result)
        });
        
        if (!response.ok) {
            throw new Error('Verification failed');
        }
        
        const verificationResult = await response.json();
        if (!verificationResult.success) {
            throw new Error('Invalid proof');
        }
        
        return true;
    } catch (error) {
        console.error('Verification failed:', error);
        throw new Error('Failed to verify World ID proof');
    }
}
```

Create a backend endpoint at `/api/verify-worldid` that uses the World ID API to verify proofs server-side.

## Features Implemented

✅ **World ID Authentication**: Users must verify with World ID before accessing the game  
✅ **Persistent Login**: Authentication is stored locally and persists across sessions  
✅ **Player Identification**: World ID nullifier hash is used as unique player identifier  
✅ **Human-Only Gaming**: Only verified humans can access the game  
✅ **Logout Functionality**: Users can logout and clear their authentication  
✅ **Beautiful UI**: Modern, responsive design for the authentication flow  

## Security Notes

- The nullifier hash is used as a unique identifier for each player
- Authentication expires after 24 hours for security
- All verification happens through the official World ID infrastructure
- For production, always verify proofs on your backend server

## Troubleshooting

1. **IDKit not loading**: Make sure the CDN link is accessible and not blocked
2. **Verification fails**: Check your app_id and action configuration
3. **World App not connecting**: Ensure you have the latest version of World App
4. **Mobile issues**: Test on different devices and browsers

## Next Steps

1. Set up your World ID app and get your credentials
2. Update the configuration in `js/worldIdAuth.js`
3. Test the authentication flow
4. Implement backend verification for production
5. Deploy your human-only gaming experience! 