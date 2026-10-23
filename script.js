require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const Database = require('better-sqlite3');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- Database ----------
const db = new Database(path.join(__dirname, 'kalu.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, email TEXT NOT NULL, subject TEXT, message TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK (type IN ('music','video')),
    title TEXT NOT NULL, url TEXT NOT NULL, cover TEXT, description TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS gallery (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    image_url TEXT NOT NULL, caption TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE IF NOT EXISTS subscribers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

// ---------- Email (optional) ----------
const mailer = process.env.SMTP_PASS
  ? nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  : null;

async function notify(subject, text) {
  if (!mailer) return;
  try {
    await mailer.sendMail({
      from: process.env.SMTP_USER,
      to: process.env.NOTIFY_TO || process.env.SMTP_USER,
      subject, text,
    });
  } catch (e) { console.error('Email failed:', e.message); }
}

// ---------- Middleware ----------
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));
app.use(express.json({ limit: '20kb' }));
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 50 }));
app.use(express.static(path.join(__dirname, 'public')));

const isEmail = (s) => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;
const clean = (s, max) => String(s || '').trim().slice(0, max);

function requireAdmin(req, res, next) {
  const key = req.get('x-admin-key');
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY)
    return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// ---------- Routes ----------
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Contact form
app.post('/api/contact', async (req, res) => {
  const name = clean(req.body.name, 100);
  const email = clean(req.body.email, 254);
  const subject = clean(req.body.subject, 150);
  const message = clean(req.body.message, 3000);
  if (req.body.website) return res.json({ ok: true }); // honeypot for bots
  if (!name || !message || !isEmail(email))
    return res.status(400).json({ error: 'Name, valid email and message are required.' });

  db.prepare('INSERT INTO messages (name,email,subject,message) VALUES (?,?,?,?)')
    .run(name, email, subject, message);
  notify(`New message from ${name}`, `${name} <${email}>\n${subject}\n\n${message}`);
  res.status(201).json({ ok: true, message: 'Thanks! Your message was sent.' });
});

// Newsletter / fan list
app.post('/api/subscribe', (req, res) => {
  const email = clean(req.body.email, 254).toLowerCase();
  if (!isEmail(email)) return res.status(400).json({ error: 'Enter a valid email.' });
  const r = db.prepare('INSERT OR IGNORE INTO subscribers (email) VALUES (?)').run(email);
  res.status(r.changes ? 201 : 200).json({ ok: true, message: "You're in! 🎶" });
});

// Admin: view data (send header  x-admin-key: YOUR_KEY)
app.get('/api/admin/messages', requireAdmin, (_req, res) =>
  res.json(db.prepare('SELECT * FROM messages ORDER BY id DESC').all()));
app.get('/api/admin/subscribers', requireAdmin, (_req, res) =>
  res.json(db.prepare('SELECT * FROM subscribers ORDER BY id DESC').all()));
app.delete('/api/admin/messages/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM messages WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Media (music & videos): public list, admin manages
const isUrl = (u) => /^https?:\/\//i.test(u) && u.length <= 500;

app.get('/api/media', (req, res) => {
  const t = req.query.type;
  const rows = (t === 'music' || t === 'video')
    ? db.prepare('SELECT * FROM media WHERE type=? ORDER BY id DESC').all(t)
    : db.prepare('SELECT * FROM media ORDER BY id DESC').all();
  res.json(rows);
});
app.post('/api/admin/media', requireAdmin, (req, res) => {
  const type = req.body.type;
  const title = clean(req.body.title, 150);
  const url = clean(req.body.url, 500);
  const cover = clean(req.body.cover, 500);
  const description = clean(req.body.description, 500);
  if (!['music', 'video'].includes(type) || !title || !isUrl(url) || (cover && !isImg(cover)))
    return res.status(400).json({ error: 'Type, title and a valid http(s) link are required.' });
  const r = db.prepare('INSERT INTO media (type,title,url,cover,description) VALUES (?,?,?,?,?)')
    .run(type, title, url, cover, description);
  res.status(201).json({ ok: true, id: r.lastInsertRowid });
});
app.delete('/api/admin/media/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM media WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- Image uploads ----------
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, crypto.randomBytes(12).toString('hex') + EXT[file.mimetype]),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(EXT[file.mimetype] ? null : new Error('Only JPG, PNG, WEBP or GIF images.'), !!EXT[file.mimetype]),
});

app.post('/api/admin/upload', requireAdmin, (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No image received.' });
    res.status(201).json({ ok: true, url: '/uploads/' + req.file.filename });
  });
});

// Allow our own uploaded paths as well as full links
const isImg = (u) => /^\/uploads\/[a-f0-9]+\.(jpg|png|webp|gif)$/.test(u) || isUrl(u);

// ---------- Gallery ----------
app.get('/api/gallery', (_req, res) => res.json(db.prepare('SELECT * FROM gallery ORDER BY id DESC').all()));
app.post('/api/admin/gallery', requireAdmin, (req, res) => {
  const image_url = clean(req.body.image_url, 500);
  const caption = clean(req.body.caption, 200);
  if (!isImg(image_url)) return res.status(400).json({ error: 'A valid image is required.' });
  const r = db.prepare('INSERT INTO gallery (image_url,caption) VALUES (?,?)').run(image_url, caption);
  res.status(201).json({ ok: true, id: r.lastInsertRowid });
});
app.delete('/api/admin/gallery/:id', requireAdmin, (req, res) => {
  const row = db.prepare('SELECT image_url FROM gallery WHERE id = ?').get(req.params.id);
  db.prepare('DELETE FROM gallery WHERE id = ?').run(req.params.id);
  if (row && row.image_url.startsWith('/uploads/'))
    fs.unlink(path.join(UPLOAD_DIR, path.basename(row.image_url)), () => {});
  res.json({ ok: true });
});

// ---------- About ----------
const DEFAULT_ABOUT = 'Music • Life • Vibes. Just being me, one day at a time. Based in Kampala, Uganda.';
app.get('/api/about', (_req, res) => {
  const row = db.prepare("SELECT value FROM settings WHERE key='about'").get();
  const photo = db.prepare("SELECT value FROM settings WHERE key='about_photo'").get();
  res.json({ text: row ? row.value : DEFAULT_ABOUT, photo: photo ? photo.value : '' });
});
app.put('/api/admin/about', requireAdmin, (req, res) => {
  const text = clean(req.body.text, 3000);
  const photo = clean(req.body.photo, 500);
  if (!text) return res.status(400).json({ error: 'Write something for the About section.' });
  if (photo && !isImg(photo)) return res.status(400).json({ error: 'Invalid photo.' });
  const up = db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  up.run('about', text); up.run('about_photo', photo);
  res.json({ ok: true });
});

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: 'Server error' }); });

app.listen(PORT, () => console.log(`KALU backend running on http://localhost:${PORT}`));
