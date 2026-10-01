'use strict';
// Smoke test: starts the server on a temp SQLite db and exercises the API. Run: npm test
const { spawn } = require('child_process'), os = require('os'), fs = require('fs'), path = require('path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'll-')), port = 3999, base = 'http://127.0.0.1:' + port;
const srv = spawn('node', ['server.js'], { env: { ...process.env, PORT: port, DATA_DIR: dir, DATABASE_URL: '' }, stdio: 'inherit' });
const J = (m, u, b) => fetch(base + u, { method: m, headers: { 'Content-Type': 'application/json' }, body: b && JSON.stringify(b) });
const ok = (c, n) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) process.exitCode = 1; };
const state = { users: [{ id: 'ua', role: 'admin', email: 'a@x.pk', pw: 'h' }], donors: [], hospitals: [], requests: [], notes: [], logs: [] };
(async () => {
  for (let i = 0; i < 40; i++) { try { if ((await fetch(base + '/healthz')).ok) break; } catch {} await new Promise(r => setTimeout(r, 150)); }
  ok((await (await J('GET', '/healthz')).json()).ok, 'health');
  ok((await (await J('GET', '/api/state')).json()).json === null, 'empty state on first run');
  const p = await (await J('PUT', '/api/state', { json: JSON.stringify(state) })).json(); ok(p.version === 1, 'save state -> v1');
  const g = await (await J('GET', '/api/state')).json(); ok(g.version === 1 && JSON.parse(g.json).users[0].id === 'ua', 'read state back');
  ok((await J('GET', '/api/state?since=1')).status === 204, 'unchanged -> 204');
  ok((await (await J('PUT', '/api/state', { json: JSON.stringify(state) })).json()).version === 2, 'second save -> v2');
  ok((await J('GET', '/api/state?since=1')).status === 200, 'changed -> 200');
  ok((await J('PUT', '/api/state', { json: 'nope' })).status === 400, 'reject invalid JSON');
  ok((await J('PUT', '/api/state', { json: JSON.stringify({ ...state, users: [] }) })).status === 400, 'reject state without admin');
  ok((await J('PUT', '/api/state', { x: 1 })).status === 400, 'reject wrong body');
  ok((await J('GET', '/api/nothing')).status === 404, 'unknown api -> 404');
  const h = await fetch(base + '/'); const t = await h.text(); ok(h.status === 200 && t.includes('LifeLink') && /content-security-policy/i.test([...h.headers.keys()].join()), 'serves site with CSP');
  srv.kill('SIGTERM');
})().catch(e => { console.error(e); process.exitCode = 1; srv.kill(); });
