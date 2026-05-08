# Insider Option – Instagram Auto-Poster Setup

## What This Stack Does

Every 15 minutes n8n polls your Insider Option backend for the latest Congress trade.
When a new trade is detected it:
1. Calls the image-generator microservice → produces a 1080×1080 PNG
2. Uploads the PNG to Cloudinary → gets a public URL
3. Posts to Instagram via the Graph API with a generated caption

---

## Step 1 – Deploy the Image Generator on Render

1. In the Render dashboard click **New → Web Service**
2. Connect this repo and set **Root Directory** to `image-generator`
3. Runtime: **Docker**
4. Set the following environment variables:

| Variable | Value |
|---|---|
| `CLOUDINARY_CLOUD_NAME` | your Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | your Cloudinary API key |
| `CLOUDINARY_API_SECRET` | your Cloudinary API secret |

5. Deploy. Note the service URL (e.g. `https://insider-option-image-gen.onrender.com`)

### Cloudinary free account setup
- Sign up at https://cloudinary.com (free tier is enough)
- Go to **Dashboard → API Keys** to find your credentials
- No configuration needed – the service creates the `insider-option` folder automatically

---

## Step 2 – Get Instagram API Credentials

### 2a. Create a Facebook Developer App
1. Go to https://developers.facebook.com → **My Apps → Create App**
2. Choose **Business** type
3. Add the **Instagram Graph API** product

### 2b. Connect your Instagram Business Account
1. Your Instagram account must be a **Business** or **Creator** account
2. In the app dashboard go to **Instagram → Basic Display** (or Instagram Graph API)
3. Add your Instagram account under **Instagram Testers** and accept the invite on Instagram

### 2c. Generate a Long-Lived Access Token
1. In Graph API Explorer select your app and request these permissions:
   - `instagram_basic`
   - `instagram_content_publish`
   - `pages_read_engagement`
2. Generate the token, then extend it to a long-lived token:
   ```
   GET https://graph.facebook.com/v19.0/oauth/access_token
     ?grant_type=fb_exchange_token
     &client_id={APP_ID}
     &client_secret={APP_SECRET}
     &fb_exchange_token={SHORT_LIVED_TOKEN}
   ```
3. Long-lived tokens last 60 days – set a reminder to refresh

### 2d. Get your Instagram User ID
```
GET https://graph.facebook.com/me?fields=id,name&access_token={YOUR_TOKEN}
```
The `id` in the response is your `IG_USER_ID`.

---

## Step 3 – Configure n8n Environment Variables

In your n8n Render service add these env vars:

| Variable | Value |
|---|---|
| `INSIDER_OPTION_API_URL` | e.g. `https://insider-option.onrender.com` |
| `IMAGE_GENERATOR_URL` | URL from Step 1 |
| `IG_USER_ID` | from Step 2d |
| `IG_ACCESS_TOKEN` | long-lived token from Step 2c |

---

## Step 4 – Import the Workflow into n8n

1. Open your n8n instance
2. Go to **Workflows → Import from File**
3. Select `workflows/instagram-congress-trades.json`
4. Click **Activate** (toggle top-right)

---

## Step 5 – Add the API Endpoint to Insider Option

The workflow polls:
```
GET /api/trades/congress/latest
```

This endpoint must return a single JSON object (the most recent trade):
```json
{
  "id": "unique-string-or-number",
  "ticker": "NVDA",
  "politician": "Nancy Pelosi",
  "party": "Democrat",
  "type": "Purchase",
  "amount_min": 500000,
  "amount_max": 1000000,
  "trade_date": "2024-01-10",
  "filed_date": "2024-01-15",
  "asset_description": "NVIDIA Corporation"
}
```

`id` is the deduplication key – n8n won't re-post the same trade twice.

---

## Testing End-to-End

Test the image generator directly:
```bash
curl -X POST https://your-image-gen.onrender.com/generate \
  -H 'Content-Type: application/json' \
  -d '{
    "ticker": "AAPL",
    "politician": "Nancy Pelosi",
    "party": "Democrat",
    "type": "Purchase",
    "amount_min": 500000,
    "amount_max": 1000000,
    "trade_date": "2024-01-10",
    "filed_date": "2024-01-15",
    "asset_description": "Apple Inc.",
    "id": "test-1"
  }'
```

Returns `{"imageUrl": "https://res.cloudinary.com/..."}`.

Then in n8n open the workflow and click **Execute Workflow** manually to do a full test run.

---

## Token Refresh Reminder

Instagram long-lived tokens expire after 60 days. Refresh before they expire:
```
GET https://graph.facebook.com/v19.0/refresh_access_token
  ?grant_type=ig_refresh_token
  &access_token={CURRENT_TOKEN}
```
Update `IG_ACCESS_TOKEN` in your n8n Render env vars with the new token.
