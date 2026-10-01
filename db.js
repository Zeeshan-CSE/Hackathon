'use strict';
// Storage adapter: PostgreSQL when DATABASE_URL is set, otherwise a local SQLite file.
const path = require('path'), fs = require('fs');
let impl;
if (process.env.DATABASE_URL) {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined });
  impl = {
    kind: 'postgres',
    async init() { await pool.query('CREATE TABLE IF NOT EXISTS app_state (id INT PRIMARY KEY, json TEXT NOT NULL, version BIGINT NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())'); },
    async get() { const r = await pool.query('SELECT json, version, updated_at FROM app_state WHERE id=1'); return r.rows[0] ? { json: r.rows[0].json, version: Number(r.rows[0].version), updatedAt: r.rows[0].updated_at } : null; },
    async put(json) { const r = await pool.query('INSERT INTO app_state (id,json,version) VALUES (1,$1,1) ON CONFLICT (id) DO UPDATE SET json=EXCLUDED.json, version=app_state.version+1, updated_at=now() RETURNING version', [json]); return Number(r.rows[0].version); },
    async ping() { await pool.query('SELECT 1'); },
    async close() { await pool.end(); }
  };
} else {
  const Database = require('better-sqlite3');
  const dir = process.env.DATA_DIR || path.join(__dirname, 'data');
  fs.mkdirSync(dir, { recursive: true });
  const db = new Database(path.join(dir, 'lifelink.db'));
  db.pragma('journal_mode = WAL');
  impl = {
    kind: 'sqlite',
    async init() { db.exec("CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY, json TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT (datetime('now')))"); },
    async get() { const r = db.prepare('SELECT json, version, updated_at FROM app_state WHERE id=1').get(); return r ? { json: r.json, version: r.version, updatedAt: r.updated_at } : null; },
    async put(json) { return db.prepare("INSERT INTO app_state (id,json,version) VALUES (1,?,1) ON CONFLICT(id) DO UPDATE SET json=excluded.json, version=version+1, updated_at=datetime('now') RETURNING version").get(json).version; },
    async ping() { db.prepare('SELECT 1').get(); },
    async close() { db.close(); }
  };
}
module.exports = impl;
