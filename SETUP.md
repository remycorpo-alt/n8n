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

## Step 5 – The API Endpoints the Workflow Reads

All three are already public on the app; nothing needs deploying.

| Endpoint | What it supplies |
|---|---|
| `GET /api/quiver/transactions?limit=300` | recent filings, **with** `performance` |
| `GET /api/sp500/historical?months=18` | SPY daily closes for the benchmark |
| `GET /api/quiver/politicians` | resolves `politicianId` → name |

The first call is already ordered by disclosure date descending and filtered
server-side to rows that have both a transaction price and a current price —
which is exactly the set for which `performance` is computed.

The last two carry `executeOnce`, so they fire once per run rather than once per
filing in the pool.

## Only trades that worked

**Select Best Winner** publishes a filing only when all of these hold:

| Threshold | Default | Meaning |
|---|---|---|
| `MIN_FILER_RESULT_PCT` | 5 | the trade went their way by at least this much |
| `MIN_EDGE_VS_INDEX_PCT` | 2 | and beat the S&P over the same window |
| `MAX_FILING_AGE_DAYS` | 90 | and is recent enough to still be news |

Tune them at the top of that node. When nothing clears, the run ends at
*Skip — Nothing Qualifies* and logs a per-reason breakdown
(`below_result_floor`, `lost_to_index`, `too_old`, `duplicate`, …).

It reads a **pool** of filings rather than only the newest one, and that is not
incidental. Filtering a single newest filing cannot work: when that filing is a
loser there is nothing to fall back to, and `lastTradeId` marks it seen, so the
account goes dark until a new filing happens to land green.

### A winning sale is a red number

After a sale, the stock **falling** is the good outcome. The bars stay literal —
CHRW −22%, S&P 500 +5.4% — while the badge states the outcome
(`▲ 22.0% DROP AVOIDED`, green) and the strip caption says which direction was
the good one. Colouring the badge by the stock's direction painted a successful
sale red.

A filing row looks like this:
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

Both the `id` and the ticker are remembered in workflow static data after a
successful post, so a standout filing is not re-picked while it is still inside
the freshness window.

### The one thing not to change: `performance` means two things

`transactions.performance` answers **"did this go the filer's way?"**.
`server/updatePerformance.ts` computes it as:

```
buy  → (currentPrice − txPrice) / txPrice     positive = the stock rose after buying
sell → (txPrice − currentPrice) / txPrice     positive = the stock FELL after selling
```

So it is the right field for the **filter** in both directions — one
`performance > 0` test — and the wrong number for the **card**, which shows what
the stock did and therefore negates sales.

Both halves matter:

- filter on the card's number instead, and you keep exactly the wrong sales —
  the ones where the stock rose after they got out;
- print the filter's number instead, and a sale that saved the filer 22% posts
  as a green "+22%" when the stock in fact fell.

---

## Testing End-to-End

Test the image generator directly:
```bash
# the performance card the workflow posts
curl -X POST https://your-image-gen.onrender.com/generate-performance \
  -H 'Content-Type: application/json' \
  -d '{
    "ticker": "AAPL",
    "politician": "Nancy Pelosi",
    "party": "Democrat",
    "type": "achat",
    "stock_move_pct": 30.0,
    "benchmark_pct": 8.0,
    "benchmark_label": "S&P 500",
    "amount_min": 500000,
    "amount_max": 1000000,
    "trade_date": "2026-01-15",
    "filed_date": "2026-02-24",
    "id": "test-1"
  }'
```

Returns `{"imageUrl": "https://res.cloudinary.com/..."}`.

`stock_move_pct` and `benchmark_pct` are both required and the route returns 400
without them — it will not render a bare return with nothing to compare it
against. `/generate` (the old trade card) and `/generate-story` are untouched and
still work.

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
