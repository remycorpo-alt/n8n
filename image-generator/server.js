'use strict';

const http = require('http');
const { createCanvas, registerFont } = require('canvas');
const cloudinary = require('cloudinary').v2;
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 3000;

// Register bundled fonts if present
const fontsDir = path.join(__dirname, 'fonts');
const fontFiles = [
  ['Inter-Black.otf',   { family: 'Inter', weight: '900' }],
  ['Inter-Black.ttf',   { family: 'Inter', weight: '900' }],
  ['Inter-Bold.otf',    { family: 'Inter', weight: '700' }],
  ['Inter-Bold.ttf',    { family: 'Inter', weight: '700' }],
  ['Inter-Regular.otf', { family: 'Inter', weight: '400' }],
  ['Inter-Regular.ttf', { family: 'Inter', weight: '400' }],
];
for (const [file, opts] of fontFiles) {
  const p = path.join(fontsDir, file);
  if (fs.existsSync(p)) { try { registerFont(p, opts); } catch {} }
}

const FONT = 'Inter, sans-serif';

const C = {
  bg:         '#060E09',   // near-black dark green
  card:       '#0C1C10',   // slightly lighter for table card
  cardBorder: '#173322',   // table card border
  rowLine:    '#132B18',   // row separator
  green:      '#4ADE80',   // brand green (text, ticker, amount, badges)
  dimGreen:   '#2E5E3A',   // label text
  white:      '#FFFFFF',
  subGreen:   '#3DAD5E',   // website subtext
};

/* ─── helpers ─────────────────────────────────────────────── */

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function formatAmount(min, max) {
  const fmt = n => n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
                                   : `$${Math.round(n / 1_000)}K`;
  if (!min && !max) return 'Undisclosed';
  if (!max)         return `${fmt(min)}+`;
  return `${fmt(min)} – ${fmt(max)}`;
}

function formatDate(str) {
  if (!str) return '';
  try {
    return new Date(str).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    }).toUpperCase();
  } catch { return str.toUpperCase(); }
}

// Shrink font until text fits within maxWidth
function fitText(ctx, text, maxWidth, maxSize, weight = 'bold') {
  let size = maxSize;
  do {
    ctx.font = `${weight} ${size}px ${FONT}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 4;
  } while (size > 20);
  return size;
}

/* ─── card renderer ──────────────────────────────────────── */

function drawTradeCard(trade) {
  const W = 1080, H = 1080;
  const cx = W / 2; // horizontal center
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // ── Background ──────────────────────────────────────────
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle vignette (darkened edges)
  const vignette = ctx.createRadialGradient(cx, H * 0.5, H * 0.15, cx, H * 0.5, H * 0.72);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);

  // ── Header label: "NEW CONGRESS TRADE · DATE" ───────────
  const tradeDate = formatDate(trade.trade_date || trade.filed_date);
  const headerText = tradeDate ? `NEW CONGRESS TRADE · ${tradeDate}` : 'NEW CONGRESS TRADE';
  ctx.font        = `500 22px ${FONT}`;
  ctx.fillStyle   = C.green;
  ctx.textAlign   = 'center';
  ctx.letterSpacing = '3px';
  ctx.fillText(headerText, cx, 108);
  ctx.letterSpacing = '0px';

  // ── Ticker (giant, centered, scaled to fit) ─────────────
  const ticker = (trade.ticker || '???').toUpperCase();
  const tickerSize = fitText(ctx, ticker, 920, 220, '900');
  ctx.font      = `900 ${tickerSize}px ${FONT}`;
  ctx.fillStyle = C.green;
  ctx.textAlign = 'center';
  ctx.fillText(ticker, cx, 100 + tickerSize * 1.08);

  // ── BUY / SELL badge ────────────────────────────────────
  const isBuy = /purchase|buy/i.test(trade.type || '');
  const badgeLabel = isBuy ? '▲  BUY ORDER' : '▼  SELL ORDER';
  ctx.font = `600 26px ${FONT}`;
  const badgeW = ctx.measureText(badgeLabel).width + 52;
  const badgeH = 48;
  const badgeX = cx - badgeW / 2;
  const badgeY = 380;
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 8);
  ctx.strokeStyle = C.green;
  ctx.lineWidth   = 1.5;
  ctx.stroke();
  ctx.fillStyle = 'rgba(74,222,128,0.08)';
  ctx.fill();
  ctx.fillStyle = C.green;
  ctx.textAlign = 'center';
  ctx.fillText(badgeLabel, cx, badgeY + 31);

  // ── Table card ──────────────────────────────────────────
  const rows = buildRows(trade);
  const rowH  = 62;
  const tableY = 454;
  const tableX = 55;
  const tableW = W - 110;
  const tableH = rows.length * rowH + 2; // +2 padding

  roundRect(ctx, tableX, tableY, tableW, tableH, 16);
  ctx.fillStyle   = C.card;
  ctx.fill();
  ctx.strokeStyle = C.cardBorder;
  ctx.lineWidth   = 1;
  ctx.stroke();

  rows.forEach((row, i) => {
    const y = tableY + i * rowH;

    // Row separator (skip first)
    if (i > 0) {
      ctx.strokeStyle = C.rowLine;
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(tableX + 32, y);
      ctx.lineTo(tableX + tableW - 32, y);
      ctx.stroke();
    }

    const midY = y + rowH / 2 + 9; // text baseline ~center of row

    // Label
    ctx.font      = `500 17px ${FONT}`;
    ctx.fillStyle = C.dimGreen;
    ctx.textAlign = 'left';
    ctx.letterSpacing = '2px';
    ctx.fillText(row.label, tableX + 40, midY);
    ctx.letterSpacing = '0px';

    // Value
    ctx.font      = `700 27px ${FONT}`;
    ctx.fillStyle = row.green ? C.green : C.white;
    ctx.textAlign = 'left';
    ctx.fillText(row.value, tableX + 270, midY);
  });

  // ── Tagline ─────────────────────────────────────────────
  const tagline = trade.tagline || 'Trade like an insider.';
  const tagSize = fitText(ctx, tagline, 900, 58, 'bold');
  const taglineY = tableY + tableH + 72;
  ctx.font      = `bold ${tagSize}px ${FONT}`;
  ctx.fillStyle = C.white;
  ctx.textAlign = 'center';
  ctx.fillText(tagline, cx, taglineY);

  // ── Sub-caption ─────────────────────────────────────────
  const politician = trade.politician || '';
  const pronoun    = guessPronoun(politician);
  ctx.font      = `400 23px ${FONT}`;
  ctx.fillStyle = C.subGreen;
  ctx.textAlign = 'center';
  ctx.fillText(`Track ${pronoun} next trade · insideroption.com ↗`, cx, taglineY + 52);

  return canvas.toBuffer('image/png');
}

function buildRows(trade) {
  const rows = [];

  if (trade.politician) rows.push({ label: 'NAME',      value: trade.politician });
  if (trade.age)        rows.push({ label: 'AGE',       value: String(trade.age) });

  rows.push({ label: 'JOB TITLE', value: trade.job_title || 'Member of Congress' });
  rows.push({ label: 'TICKER',    value: (trade.ticker || '').toUpperCase() });
  rows.push({
    label: 'AMOUNT',
    value: formatAmount(trade.amount_min, trade.amount_max),
    green: true,
  });

  return rows;
}

function guessPronoun(name) {
  // Simple heuristic — returns "his" as fallback; can extend as needed
  const female = ['nancy', 'pelosi', 'susan', 'elizabeth', 'alexandria', 'marjorie', 'virginia'];
  const lower  = name.toLowerCase();
  if (female.some(w => lower.includes(w))) return 'her';
  return 'their';
}

/* ─── Cloudinary upload ──────────────────────────────────── */

async function uploadToCloudinary(buffer) {
  cloudinary.config({
    cloud_name:  process.env.CLOUDINARY_CLOUD_NAME,
    api_key:     process.env.CLOUDINARY_API_KEY,
    api_secret:  process.env.CLOUDINARY_API_SECRET,
  });
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'insider-option', resource_type: 'image' },
      (err, result) => { if (err) reject(err); else resolve(result.secure_url); }
    );
    stream.end(buffer);
  });
}

/* ─── HTTP server ────────────────────────────────────────── */

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  if (req.method === 'POST' && req.url === '/generate') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const trade = JSON.parse(body);
        const png   = drawTradeCard(trade);

        if (process.env.CLOUDINARY_CLOUD_NAME) {
          const imageUrl = await uploadToCloudinary(png);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ imageUrl }));
        } else {
          // dev mode: return raw PNG
          res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': png.length });
          res.end(png);
        }
      } catch (e) {
        console.error(e);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => console.log(`image-generator on :${PORT}`));
