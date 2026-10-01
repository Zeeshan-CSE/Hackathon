'use strict';
const path = require('path'), express = require('express'), helmet = require('helmet'), compression = require('compression'), rateLimit = require('express-rate-limit');
const store = require('./db');
const PORT = +process.env.PORT || 3000, MAX_JSON = 5_000_000;
const app = express();
app.set('trust proxy', process.env.TRUST_PROXY === undefined ? 1 : (isNaN(+process.env.TRUST_PROXY) ? process.env.TRUST_PROXY : +process.env.TRUST_PROXY));
app.disable('x-powered-by');
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: { useDefaults: false, directives: {
    'default-src': ["'self'"],
    // the page compiles JSX in the browser (Babel standalone) and loads Tailwind's CDN build, hence unsafe-eval / unsafe-inline
    'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://cdnjs.cloudflare.com', 'https://cdn.tailwindcss.com'],
    'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    'font-src': ['https://fonts.gstatic.com'],
    'img-src': ["'self'", 'data:', 'blob:'], 'media-src': ["'self'", 'blob:'], 'worker-src': ["'self'", 'blob:'],
    'connect-src': ["'self'"], 'object-src': ["'none'"], 'base-uri': ["'self'"], 'frame-ancestors': ["'none'"], 'form-action': ["'self'"] } }
}));
app.use((req, res, next) => { res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()'); next(); });
app.use(compression());

const lim = (limit, msg) => rateLimit({ windowMs: 15 * 60 * 1000, limit, standardHeaders: true, legacyHeaders: false, message: { error: msg } });
const readLimit = lim(+process.env.READ_LIMIT || 4000, 'Too many requests, slow down.');
const writeLimit = lim(+process.env.WRITE_LIMIT || 1000, 'Too many updates, slow down.');

function check(js) {
  let d; try { d = JSON.parse(js); } catch { return 'Invalid JSON'; }
  if (!d || typeof d !== 'object' || Array.isArray(d)) return 'Invalid state';
  for (const k of ['users', 'donors', 'hospitals', 'requests', 'notes', 'logs']) if (!Array.isArray(d[k])) return 'Missing ' + k;
  if (!d.users.every(u => u && u.id && u.role && u.email)) return 'Invalid users';
  if (!d.users.some(u => u.role === 'admin')) return 'State must keep an administrator account';
  return null;
}

app.get('/healthz', async (req, res) => { try { await store.ping(); res.json({ ok: true, db: store.kind }); } catch { res.status(503).json({ ok: false }); } });

app.get('/api/state', readLimit, async (req, res, next) => {
  try {
    const row = await store.get(), since = +req.query.since || 0;
    res.set('Cache-Control', 'no-store');
    if (!row) return res.json({ version: 0, json: null });
    if (since && since === row.version) return res.status(204).end();
    res.json(row);
  } catch (e) { next(e); }
});

app.put('/api/state', writeLimit, express.json({ limit: '6mb' }), async (req, res, next) => {
  try {
    const js = req.body && req.body.json;
    if (typeof js !== 'string' || js.length > MAX_JSON) return res.status(400).json({ error: 'Body must be {json: string} under 5 MB' });
    const bad = check(js); if (bad) return res.status(400).json({ error: bad });
    res.json({ version: await store.put(js) });
  } catch (e) { next(e); }
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h', setHeaders: (res, p) => { if (p.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache'); } }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Payload too large' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
  console.error(err); res.status(500).json({ error: 'Server error' });
});

let server;
store.init().then(() => {
  server = app.listen(PORT, () => console.log('LifeLink running on port ' + PORT + ' (' + store.kind + ')'));
}).catch(e => { console.error('Database init failed:', e.message); process.exit(1); });
const stop = () => { if (!server) process.exit(0); server.close(async () => { await store.close().catch(() => {}); process.exit(0); }); setTimeout(() => process.exit(1), 8000).unref(); };
process.on('SIGTERM', stop); process.on('SIGINT', stop);
