// Stelix guide funnel: serves the website from /public and saves leads to MongoDB.
require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const mongoose = require('mongoose');

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || '';
const ADMIN_KEY = process.env.ADMIN_KEY || '';

const app = express();
app.set('trust proxy', 1); // Render sits behind a proxy; needed for the real visitor IP
app.disable('x-powered-by');
app.use(express.json({ limit: '10kb' }));

/* ---------- Database ---------- */
const leadSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 160, unique: true },
    phone: { type: String, trim: true, maxlength: 40, default: '' },
    source: { type: String, trim: true, maxlength: 60, default: 'stelix-guide' },
    signups: { type: Number, default: 0 }, // how many times this email filled the form
    ip: { type: String, default: '' },
  },
  { timestamps: true }
);
// stored in its own collection so Stelix leads never mix with Amayra leads
const Lead = mongoose.model('Lead', leadSchema, 'stelix_leads');

/* ---------- Simple rate limit: 10 form sends per IP per 10 minutes ---------- */
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || entry.reset < now) {
    hits.set(ip, { count: 1, reset: now + 10 * 60 * 1000 });
    return false;
  }
  entry.count += 1;
  return entry.count > 10;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, e] of hits) if (e.reset < now) hits.delete(ip);
}, 15 * 60 * 1000).unref();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/* ---------- API ---------- */
app.post('/api/lead', async (req, res) => {
  const body = req.body || {};

  // spam trap: the hidden "website" field is only filled in by bots
  if (clean(body.website, 200)) return res.json({ ok: true });

  if (rateLimited(req.ip)) {
    return res.status(429).json({ ok: false, error: 'Too many tries. Please wait a few minutes.' });
  }

  const name = clean(body.name, 80);
  const email = clean(body.email, 160).toLowerCase();
  const phone = clean(body.phone, 40);
  const source = clean(body.source, 60) || 'stelix-guide';

  if (!name) return res.status(400).json({ ok: false, error: 'Name is required.' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ ok: false, error: 'Email is not valid.' });

  if (mongoose.connection.readyState !== 1) {
    console.error('Lead not saved, database not connected:', email);
    return res.status(503).json({ ok: false, error: 'Database not connected.' });
  }

  try {
    const update = { $set: { name, source, ip: req.ip || '' }, $inc: { signups: 1 } };
    if (phone) update.$set.phone = phone; // keep an older phone if they leave it blank this time
    await Lead.findOneAndUpdate({ email }, update, { upsert: true, setDefaultsOnInsert: true });
    return res.json({ ok: true });
  } catch (err) {
    console.error('Lead save failed:', err.message);
    return res.status(500).json({ ok: false, error: 'Could not save. Please try again.' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, database: mongoose.connection.readyState === 1 ? 'connected' : 'not connected' });
});

/* ---------- Admin: see your leads ----------
   Open in the browser:
     /admin/leads?key=YOUR_ADMIN_KEY        -> list as JSON
     /admin/leads.csv?key=YOUR_ADMIN_KEY    -> download for Excel / Google Sheets */
function isAdmin(req) {
  if (!ADMIN_KEY) return false;
  const given = Buffer.from(String(req.query.key || req.get('x-admin-key') || ''));
  const real = Buffer.from(ADMIN_KEY);
  return given.length === real.length && crypto.timingSafeEqual(given, real);
}
const csvCell = (v) => {
  let s = String(v ?? '');
  if (/^[=+\-@]/.test(s)) s = "'" + s; // stop spreadsheet formula injection
  return '"' + s.replace(/"/g, '""') + '"';
};

app.get(['/admin/leads', '/admin/leads.csv'], async (req, res) => {
  if (!isAdmin(req)) return res.status(404).send('Not found');
  if (mongoose.connection.readyState !== 1) return res.status(503).send('Database not connected');
  const leads = await Lead.find().sort({ createdAt: -1 }).lean();
  if (req.path.endsWith('.csv')) {
    const rows = [['Name', 'Email', 'Phone', 'Source', 'Signups', 'First signup', 'Last signup']];
    for (const l of leads) {
      rows.push([l.name, l.email, l.phone, l.source, l.signups,
        new Date(l.createdAt).toISOString(), new Date(l.updatedAt).toISOString()]);
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="stelix-leads.csv"');
    return res.send('﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n'));
  }
  res.setHeader('Cache-Control', 'no-store');
  res.json({ total: leads.length, leads: leads.map(({ _id, __v, ip, ...l }) => l) });
});

/* ---------- Website ---------- */
app.use(
  express.static(path.join(__dirname, 'public'), {
    maxAge: '7d',
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    },
  })
);
app.use((req, res) => res.status(404).sendFile(path.join(__dirname, 'public', 'index.html')));

/* ---------- Start ---------- */
app.listen(PORT, () => console.log(`Stelix funnel running on port ${PORT}`));

if (!MONGODB_URI) {
  console.warn('MONGODB_URI is not set. The site works, but leads will NOT be saved.');
} else {
  mongoose
    .connect(MONGODB_URI)
    .then(() => console.log('MongoDB connected'))
    .catch((err) => console.error('MongoDB connection failed:', err.message));
}
