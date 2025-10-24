# Azure Face API Setup Guide

## You Need Azure Face API for:

- Facial recognition to prevent duplicate voting
- Face detection to ensure valid selfies
- Duplicate face detection within voting sessions

## Quick Setup Steps:

### Option 1: Get Free Azure Account (Recommended for Testing)

1. Go to: https://azure.microsoft.com/free/
2. Sign up for free account (requires credit card but won't charge)
3. You get $200 free credit for 30 days
4. Free tier includes 30,000 Face API calls per month

### Option 2: Create Face API Resource

1. Go to Azure Portal: https://portal.azure.com
2. Click "Create a resource"
3. Search for "Face"
4. Click "Create" on Face service
5. Fill in:
   - Subscription: Your subscription
   - Resource group: Create new "univote-resources"
   - Region: Choose closest (e.g., "East US", "West Europe")
   - Name: "univote-face-api"
   - Pricing tier: "Free F0" (30,000 calls/month free)
6. Click "Review + Create" → "Create"
7. Wait for deployment (1-2 minutes)

### Option 3: Get Your Credentials

1. Go to your Face resource in Azure Portal
2. Click on "Keys and Endpoint" in left menu
3. Copy:
   - **Endpoint**: Something like `https://eastus.api.cognitive.microsoft.com/face/v1.0`
   - **Key 1**: A long string like `abc123def456...`

### Option 4: Update Your .env File

Replace these lines in your `.env`:

```env
AZURE_FACE_ENDPOINT=https://eastus.api.cognitive.microsoft.com/face/v1.0
AZURE_FACE_KEY=your_actual_key_from_azure
```

## Alternative for Testing Without Azure:

If you want to test the system **without Azure Face API** (voting will work but without face verification):

1. Comment out or modify the face detection in `src/services/azureService.js`
2. Or set a flag to skip face verification in development mode

Would you like me to create a development mode that skips Azure Face API for testing?

## Free Tier Limits:

- **30,000 transactions per month** (Free F0 tier)
- Good for testing and small elections
- Upgrade to Standard S0 if you need more:
  - $1.00 per 1,000 transactions for 0-1M
  - $0.80 per 1,000 for 1M-10M
  - $0.60 per 1,000 for 10M-100M

## What Happens if You Don't Set It Up:

- Face detection will fail
- Votes will be rejected with error: "Face detection failed"
- You won't be able to test the voting flow completely

## Need Help?

Let me know if you want me to:

1. Create a mock/test mode that skips Azure
2. Help you set up Azure account
3. Show you how to test with real Azure Face API
