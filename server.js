require('dotenv').config();
const express = require('express');
const cors = require('cors');

// Node < 18 has no global fetch — fall back to node-fetch if needed.
const fetch = globalThis.fetch || require('node-fetch');

const app = express();

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN || !CHAT_ID) {
  console.error('Missing BOT_TOKEN or CHAT_ID in .env — see .env.example');
  process.exit(1);
}

app.use(express.json());
app.use(cors({ origin: ALLOWED_ORIGIN }));

// Very small in-memory rate limiter: max 5 requests per minute per IP.
const hits = new Map();
function isRateLimited(ip) {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const max = 5;
  const arr = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > max;
}

app.post('/api/lead', async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ ok: false, error: 'Too many requests' });
  }

  const { name, contact } = req.body || {};

  if (!name || !contact || typeof name !== 'string' || typeof contact !== 'string') {
    return res.status(400).json({ ok: false, error: 'name and contact are required' });
  }
  if (name.length > 100 || contact.length > 100) {
    return res.status(400).json({ ok: false, error: 'Input too long' });
  }

  const text =
    'Заявка с лендинга\n' +
    'Имя: ' + name.trim() + '\n' +
    'Контакт: ' + contact.trim();

  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text }),
    });
    const data = await tgRes.json();

    if (!data.ok) {
      console.error('Telegram API error:', data);
      return res.status(502).json({ ok: false, error: 'Telegram API error' });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('Failed to reach Telegram:', err);
    return res.status(502).json({ ok: false, error: 'Failed to reach Telegram' });
  }
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Lead server listening on port ${PORT}`);
});
