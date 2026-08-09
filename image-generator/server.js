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

/* ─── story card renderer (1080 × 1920) ─────────────────── */

function drawStoryCard(trade) {
  const W = 1080, H = 1920;
  const cx = W / 2;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  // Radial glow in the centre for drama
  const glow = ctx.createRadialGradient(cx, H * 0.42, 80, cx, H * 0.42, 680);
  glow.addColorStop(0, 'rgba(74,222,128,0.07)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Vignette
  const vig = ctx.createRadialGradient(cx, H * 0.5, H * 0.2, cx, H * 0.5, H * 0.75);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  // Header label (inside story safe zone ~y=280)
  const tradeDate = formatDate(trade.trade_date || trade.filed_date);
  const headerText = tradeDate ? `NEW CONGRESS TRADE · ${tradeDate}` : 'NEW CONGRESS TRADE';
  ctx.font = `500 26px ${FONT}`;
  ctx.fillStyle = C.green;
  ctx.textAlign = 'center';
  ctx.letterSpacing = '3px';
  ctx.fillText(headerText, cx, 310);
  ctx.letterSpacing = '0px';

  // Giant ticker
  const ticker = (trade.ticker || '???').toUpperCase();
  const tickerSize = fitText(ctx, ticker, 960, 260, '900');
  ctx.font = `900 ${tickerSize}px ${FONT}`;
  ctx.fillStyle = C.green;
  ctx.textAlign = 'center';
  ctx.fillText(ticker, cx, 310 + tickerSize * 1.08);

  // BUY / SELL badge
  const isBuy = /purchase|buy/i.test(trade.type || '');
  const badgeLabel = isBuy ? '▲  BUY ORDER' : '▼  SELL ORDER';
  ctx.font = `600 30px ${FONT}`;
  const badgeW = ctx.measureText(badgeLabel).width + 60;
  const badgeH = 56;
  const badgeX = cx - badgeW / 2;
  const badgeY = 660;
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 10);
  ctx.strokeStyle = C.green;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = 'rgba(74,222,128,0.08)';
  ctx.fill();
  ctx.fillStyle = C.green;
  ctx.textAlign = 'center';
  ctx.fillText(badgeLabel, cx, badgeY + 37);

  // Table card
  const rows = buildRows(trade);
  const rowH = 80;
  const tableY = 756;
  const tableX = 55;
  const tableW = W - 110;
  const tableH = rows.length * rowH + 2;

  roundRect(ctx, tableX, tableY, tableW, tableH, 20);
  ctx.fillStyle = C.card;
  ctx.fill();
  ctx.strokeStyle = C.cardBorder;
  ctx.lineWidth = 1;
  ctx.stroke();

  rows.forEach((row, i) => {
    const y = tableY + i * rowH;
    if (i > 0) {
      ctx.strokeStyle = C.rowLine;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tableX + 32, y);
      ctx.lineTo(tableX + tableW - 32, y);
      ctx.stroke();
    }
    const midY = y + rowH / 2 + 11;

    ctx.font = `500 19px ${FONT}`;
    ctx.fillStyle = C.dimGreen;
    ctx.textAlign = 'left';
    ctx.letterSpacing = '2px';
    ctx.fillText(row.label, tableX + 44, midY);
    ctx.letterSpacing = '0px';

    ctx.font = `700 32px ${FONT}`;
    ctx.fillStyle = row.green ? C.green : C.white;
    ctx.textAlign = 'left';
    ctx.fillText(row.value, tableX + 300, midY);
  });

  // Tagline (inside safe zone bottom ~y=1670)
  const tagline = trade.tagline || 'Trade like an insider.';
  const tagY = tableY + tableH + 100;
  const tagSize = fitText(ctx, tagline, 960, 72, 'bold');
  ctx.font = `bold ${tagSize}px ${FONT}`;
  ctx.fillStyle = C.white;
  ctx.textAlign = 'center';
  ctx.fillText(tagline, cx, tagY);

  // Sub-caption
  const politician = trade.politician || '';
  const pronoun = guessPronoun(politician);
  ctx.font = `400 27px ${FONT}`;
  ctx.fillStyle = C.subGreen;
  ctx.textAlign = 'center';
  ctx.fillText(`Track ${pronoun} next trade · insideroption.com ↗`, cx, tagY + 60);

  return canvas.toBuffer('image/png');
}


/* ─── performance card ───────────────────────────────────── */

const PERF_C = {
  red:  '#F87171',   // downward move
  gold: '#D9BD63',   // benchmark bar, neutral against the brand green
};

function formatPct(n) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  const v = Number(n);
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
}

/*
 * Performance card, same visual language as drawTradeCard.
 *
 * `stock_move_pct` is the SIGNED move of the stock since the disclosed transaction
 * price — not the DB `performance` column, which is inverted for sells. The n8n
 * workflow sign-corrects before calling this. One consistent number in both cases:
 *
 *   buy  → what the position gained/lost since they bought
 *   sell → what the stock did after they sold
 *
 * It is the filer's window, NOT a follower's: the filing became public up to 45
 * days later. That is why the strip is captioned with the price basis and the lag
 * is its own table row. Do not relabel those to imply a follower's return.
 */
function drawPerformanceCard(p) {
  const W = 1080, H = 1080;
  const cx = W / 2;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Number(null), Number(undefined via '') and Number('') all coerce to 0, and 0
  // is finite — so a bare Number.isFinite() guard lets a missing figure through
  // and renders it as a confident "+0.0%". Reject the empty cases first.
  const numeric = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
  if (!numeric(p.stock_move_pct)) throw new Error('stock_move_pct is required and must be numeric');
  if (!numeric(p.benchmark_pct)) throw new Error('benchmark_pct is required — a return with no benchmark is not a measurement');

  const move  = Number(p.stock_move_pct);
  const bench = Number(p.benchmark_pct);

  const isBuy = /purchase|buy|achat/i.test(p.type || '');

  // Background + vignette
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  const vignette = ctx.createRadialGradient(cx, H * 0.5, H * 0.15, cx, H * 0.5, H * 0.72);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);

  // Header kicker
  const filed = formatDate(p.filed_date || p.trade_date);
  ctx.font = `500 22px ${FONT}`;
  ctx.fillStyle = C.green;
  ctx.textAlign = 'center';
  ctx.letterSpacing = '3px';
  ctx.fillText(filed ? `TRADE PERFORMANCE · FILED ${filed}` : 'TRADE PERFORMANCE', cx, 96);
  ctx.letterSpacing = '0px';

  // Giant ticker
  const ticker = (p.ticker || '???').toUpperCase();
  const tickerSize = fitText(ctx, ticker, 920, 190, '900');
  ctx.font = `900 ${tickerSize}px ${FONT}`;
  ctx.fillStyle = C.green;
  ctx.textAlign = 'center';
  ctx.fillText(ticker, cx, 88 + tickerSize * 1.06);

  // Badge — the filer's outcome, which is not the same as the stock's direction.
  //
  // After a SALE the stock falling IS the good result: they got out before the
  // drop. Colouring the badge by the stock's direction painted a successful sale
  // red and read as a loss — wrong, and self-defeating on a card that was chosen
  // precisely because the trade worked. So the badge states the outcome and takes
  // its colour from that, while the bars below stay strictly literal about what
  // the stock and the index did.
  const up = move >= 0;
  const wentTheirWay = isBuy ? move >= 0 : move <= 0;
  const badgeLabel = isBuy
    ? `${up ? '▲' : '▼'}  ${formatPct(move)} SINCE BUY`
    : wentTheirWay
      ? `▲  ${Math.abs(move).toFixed(1)}% DROP AVOIDED`
      : `▼  ${formatPct(move)} MISSED AFTER SELLING`;
  ctx.font = `600 26px ${FONT}`;
  const badgeW = ctx.measureText(badgeLabel).width + 52;
  const badgeY = 344;
  const accent = wentTheirWay ? C.green : PERF_C.red;
  roundRect(ctx, cx - badgeW / 2, badgeY, badgeW, 48, 8);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = wentTheirWay ? 'rgba(74,222,128,0.08)' : 'rgba(248,113,113,0.08)';
  ctx.fill();
  ctx.fillStyle = accent;
  ctx.textAlign = 'center';
  ctx.fillText(badgeLabel, cx, badgeY + 31);

  // Two bars: the stock and the index over the same window
  const bars = [
    { label: ticker, value: move, color: up ? C.green : PERF_C.red },
    { label: (p.benchmark_label || 'S&P 500').toUpperCase(), value: bench, color: PERF_C.gold },
  ];

  const stripX = 55, stripW = W - 110, stripY = 424, barH = 40, barGap = 26;
  const stripH = bars.length * barH + (bars.length - 1) * barGap + 84;
  roundRect(ctx, stripX, stripY, stripW, stripH, 16);
  ctx.fillStyle = C.card;
  ctx.fill();
  ctx.strokeStyle = C.cardBorder;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Shared scale and a common zero, so a loss reads as a loss
  const labelW = 200;
  const plotX = stripX + 32 + labelW;
  const plotW = stripW - 64 - labelW - 120;
  const maxAbs = Math.max(...bars.map(b => Math.abs(b.value)), 1);
  const hasNeg = bars.some(b => b.value < 0);
  const zeroX = hasNeg ? plotX + plotW / 2 : plotX;
  const scale = hasNeg ? plotW / (maxAbs * 2) : plotW / maxAbs;

  bars.forEach((b, i) => {
    const y = stripY + 30 + i * (barH + barGap);
    ctx.font = `700 26px ${FONT}`;
    ctx.fillStyle = C.white;
    ctx.textAlign = 'left';
    ctx.fillText(b.label, stripX + 32, y + barH / 2 + 9);

    const len = Math.abs(b.value) * scale;
    roundRect(ctx, b.value >= 0 ? zeroX : zeroX - len, y, Math.max(len, 3), barH, 5);
    ctx.fillStyle = b.color;
    ctx.fill();

    ctx.fillStyle = b.color;
    ctx.textAlign = 'left';
    ctx.fillText(formatPct(b.value), zeroX + (hasNeg ? plotW / 2 : plotW) + 22, y + barH / 2 + 9);
  });

  if (hasNeg) {
    ctx.strokeStyle = C.rowLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(zeroX, stripY + 22);
    ctx.lineTo(zeroX, stripY + stripH - 54);
    ctx.stroke();
  }

  // Price basis, inside the image rather than only in the caption
  ctx.font = `500 19px ${FONT}`;
  ctx.fillStyle = C.dimGreen;
  ctx.textAlign = 'center';
  ctx.letterSpacing = '1px';
  // The bars are literal, so on a sale the reader needs telling which direction
  // was the good one — otherwise a red stock bar next to a green badge looks
  // like a contradiction rather than the point.
  ctx.fillText(
    isBuy
      ? 'MEASURED FROM THE DISCLOSED TRANSACTION PRICE'
      : 'FROM THE DISCLOSED SALE PRICE · AFTER SELLING, LOWER IS BETTER',
    cx,
    stripY + stripH - 22,
  );
  ctx.letterSpacing = '0px';

  // Detail table
  const lagDays = p.trade_date && p.filed_date
    ? Math.round((new Date(p.filed_date) - new Date(p.trade_date)) / 86400000)
    : null;

  const rows = [];
  if (p.politician) rows.push({ label: 'NAME', value: p.politician });
  rows.push({ label: 'ORDER', value: isBuy ? 'Buy' : 'Sell' });
  if (p.amount_min || p.amount_max) {
    rows.push({ label: 'AMOUNT', value: formatAmount(p.amount_min, p.amount_max), green: true });
  }
  if (lagDays !== null && lagDays >= 0) {
    rows.push({ label: 'REPORTING LAG', value: `${lagDays} days`, green: true });
  }

  const rowH = 58;
  const tableY = stripY + stripH + 26;
  const tableX = 55, tableW = W - 110, tableH = rows.length * rowH + 2;
  roundRect(ctx, tableX, tableY, tableW, tableH, 16);
  ctx.fillStyle = C.card;
  ctx.fill();
  ctx.strokeStyle = C.cardBorder;
  ctx.lineWidth = 1;
  ctx.stroke();

  rows.forEach((row, i) => {
    const y = tableY + i * rowH;
    if (i > 0) {
      ctx.strokeStyle = C.rowLine;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tableX + 32, y);
      ctx.lineTo(tableX + tableW - 32, y);
      ctx.stroke();
    }
    const midY = y + rowH / 2 + 9;
    ctx.font = `500 17px ${FONT}`;
    ctx.fillStyle = C.dimGreen;
    ctx.textAlign = 'left';
    ctx.letterSpacing = '2px';
    ctx.fillText(row.label, tableX + 40, midY);
    ctx.letterSpacing = '0px';
    ctx.font = `700 26px ${FONT}`;
    ctx.fillStyle = row.green ? C.green : C.white;
    ctx.fillText(row.value, tableX + 270, midY);
  });

  // Tagline — describes the data, never the filer's state of mind
  const tagline = p.tagline || (lagDays !== null ? `Filed ${lagDays} days after the trade.` : 'Disclosed weeks late.');
  const tagSize = fitText(ctx, tagline, 900, 50, 'bold');
  const taglineY = tableY + tableH + 62;
  ctx.font = `bold ${tagSize}px ${FONT}`;
  ctx.fillStyle = C.white;
  ctx.textAlign = 'center';
  ctx.fillText(tagline, cx, taglineY);

  // Footer
  ctx.font = `400 23px ${FONT}`;
  ctx.fillStyle = C.subGreen;
  ctx.textAlign = 'center';
  ctx.fillText(`Track ${guessPronoun(p.politician || '')} next trade · insideroption.com ↗`, cx, taglineY + 46);

  return canvas.toBuffer('image/png');
}

/* ─── HTTP server ────────────────────────────────────────── */

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  if (req.method === 'POST' && req.url === '/generate-performance') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const png = drawPerformanceCard(JSON.parse(body));
        if (process.env.CLOUDINARY_CLOUD_NAME) {
          const imageUrl = await uploadToCloudinary(png);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ imageUrl }));
        } else {
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

  if (req.method === 'POST' && req.url === '/generate-story') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const trade = JSON.parse(body);
        const png   = drawStoryCard(trade);

        if (process.env.CLOUDINARY_CLOUD_NAME) {
          const imageUrl = await uploadToCloudinary(png);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ imageUrl }));
        } else {
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
