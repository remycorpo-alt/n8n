'use strict';

const http = require('http');
const { createCanvas } = require('canvas');
const cloudinary = require('cloudinary').v2;

const PORT = process.env.PORT || 3000;

const C = {
  bg0:     '#060B18',
  bg1:     '#0D1427',
  card:    '#111827',
  border:  '#1F2937',
  dim:     '#374151',
  gray:    '#9CA3AF',
  white:   '#F9FAFB',
  green:   '#10B981',
  red:     '#EF4444',
  blue:    '#3B82F6',
  gold:    '#F59E0B',
};

function hex(color, alpha) {
  // append 2-digit hex alpha to a #rrggbb string
  return color + Math.round(alpha * 255).toString(16).padStart(2, '0');
}

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
  const fmt = n => {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
    if (n >= 1_000)     return `$${Math.round(n / 1_000)}K`;
    return `$${n}`;
  };
  if (!min && !max) return 'Undisclosed';
  if (!max)         return `${fmt(min)}+`;
  return `${fmt(min)} – ${fmt(max)}`;
}

function formatDate(str) {
  if (!str) return 'Unknown';
  try {
    return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return str;
  }
}

function drawTradeCard(trade) {
  const W = 1080, H = 1080;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Background gradient
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, C.bg0);
  bgGrad.addColorStop(1, C.bg1);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Subtle grid
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

  // Card background
  const cx = 60, cy = 72, cw = W - 120, ch = H - 144;
  roundRect(ctx, cx, cy, cw, ch, 24);
  ctx.fillStyle = C.card;
  ctx.fill();
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Top accent bar
  const isBuy = /purchase|buy/i.test(trade.type || '');
  const accentColor = isBuy ? C.green : C.red;
  const accentGrad = ctx.createLinearGradient(cx, cy, cx + cw, cy);
  accentGrad.addColorStop(0, accentColor);
  accentGrad.addColorStop(0.6, hex(accentColor, 0.4));
  accentGrad.addColorStop(1, 'rgba(0,0,0,0)');
  roundRect(ctx, cx, cy, cw, 6, 3);
  ctx.fillStyle = accentGrad;
  ctx.fill();

  // Brand: INSIDER OPTION
  ctx.font = 'bold 30px sans-serif';
  ctx.fillStyle = C.gold;
  ctx.fillText('INSIDER', cx + 40, cy + 64);
  ctx.fillStyle = C.white;
  ctx.fillText(' OPTION', cx + 40 + ctx.measureText('INSIDER').width, cy + 64);

  // CONGRESS TRADE ALERT badge
  ctx.font = 'bold 20px sans-serif';
  const badgeLabel = 'CONGRESS TRADE ALERT';
  const badgeW = ctx.measureText(badgeLabel).width + 32;
  const badgeX = cx + cw - badgeW - 40;
  const badgeY = cy + 40;
  roundRect(ctx, badgeX, badgeY, badgeW, 36, 7);
  ctx.fillStyle = hex(C.gold, 0.15);
  ctx.fill();
  ctx.strokeStyle = C.gold;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = C.gold;
  ctx.fillText(badgeLabel, badgeX + 16, badgeY + 24);

  // Divider
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx + 40, cy + 88); ctx.lineTo(cx + cw - 40, cy + 88); ctx.stroke();

  // Ticker — giant
  ctx.font = 'bold 180px sans-serif';
  ctx.fillStyle = C.white;
  ctx.fillText(trade.ticker || '???', cx + 40, cy + 300);

  // Asset description
  const desc = trade.asset_description || '';
  if (desc) {
    ctx.font = '30px sans-serif';
    ctx.fillStyle = C.gray;
    // truncate if too long
    const maxW = cw - 80;
    let text = desc;
    while (ctx.measureText(text).width > maxW && text.length > 0) text = text.slice(0, -1);
    if (text.length < desc.length) text += '…';
    ctx.fillText(text, cx + 40, cy + 348);
  }

  // BUY / SELL badge
  const typeLabel = isBuy ? 'BUY' : 'SELL';
  ctx.font = 'bold 34px sans-serif';
  const typeBW = ctx.measureText(typeLabel).width + 48;
  roundRect(ctx, cx + 40, cy + 375, typeBW, 56, 10);
  ctx.fillStyle = hex(accentColor, 0.15);
  ctx.fill();
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = accentColor;
  ctx.fillText(typeLabel, cx + 40 + 24, cy + 413);

  // Amount
  const amount = formatAmount(trade.amount_min, trade.amount_max);
  ctx.font = 'bold 72px sans-serif';
  ctx.fillStyle = C.white;
  ctx.fillText(amount, cx + 40, cy + 530);

  ctx.font = '28px sans-serif';
  ctx.fillStyle = C.gray;
  ctx.fillText('Estimated Trade Value', cx + 40, cy + 572);

  // Divider
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx + 40, cy + 610); ctx.lineTo(cx + cw - 40, cy + 610); ctx.stroke();

  // Politician
  const partyColor = /democrat/i.test(trade.party || '') ? C.blue : /republican/i.test(trade.party || '') ? C.red : C.gray;
  ctx.beginPath();
  ctx.arc(cx + 56, cy + 668, 10, 0, Math.PI * 2);
  ctx.fillStyle = partyColor;
  ctx.fill();

  ctx.font = 'bold 46px sans-serif';
  ctx.fillStyle = C.white;
  ctx.fillText(trade.politician || 'Unknown', cx + 78, cy + 678);

  ctx.font = '28px sans-serif';
  ctx.fillStyle = partyColor;
  ctx.fillText(trade.party || '', cx + 78, cy + 718);

  // Dates row
  ctx.font = '26px sans-serif';
  ctx.fillStyle = C.gray;
  const tradeDateLabel = 'Trade:';
  ctx.fillText(tradeDateLabel, cx + 40, cy + 790);
  ctx.fillStyle = C.white;
  ctx.fillText(' ' + formatDate(trade.trade_date), cx + 40 + ctx.measureText(tradeDateLabel).width, cy + 790);

  if (trade.filed_date) {
    ctx.fillStyle = C.gray;
    const filedLabel = 'Disclosed:';
    ctx.fillText(filedLabel, cx + 40, cy + 830);
    ctx.fillStyle = C.white;
    ctx.fillText(' ' + formatDate(trade.filed_date), cx + 40 + ctx.measureText(filedLabel).width, cy + 830);
  }

  // Bottom brand watermark
  ctx.font = 'bold 24px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillText('@InsiderOption', cx + cw - 220, cy + ch - 24);

  return canvas.toBuffer('image/png');
}

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
          // dev fallback: return raw PNG
          res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': png.length });
          res.end(png);
        }
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => console.log(`image-generator listening on :${PORT}`));
