#!/usr/bin/env node
/**
 * Taskwick — single-file edition.
 *
 * The entire app lives in this one file on purpose: there are no folders to
 * preserve when uploading, and no npm packages to install. It runs on Node's
 * built-in modules only (node:http, node:sqlite, node:crypto), so the whole
 * deployment is literally "node server.js".
 *
 * Requires Node 22.5 or newer (for node:sqlite).
 *
 * Configuration is via environment variables — see README.md:
 *   PORT, BASE_URL, SESSION_SECRET, RESEND_API_KEY, EMAIL_FROM,
 *   CRON_SECRET, ENABLE_IN_PROCESS_DIGEST, DATABASE_PATH, NODE_ENV
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { URL } from 'node:url';
import { fileURLToPath } from 'node:url';

// =====================================================================
// Stylesheet (inlined so this file has no external assets)
// =====================================================================

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const STYLE_CSS = ":root {\n  --bg: #f6f7f9;\n  --card-bg: #ffffff;\n  --text: #1c1f26;\n  --muted: #6b7280;\n  --border: #e5e7eb;\n  --primary: #2563eb;\n  --primary-dark: #1d4ed8;\n  --urgent: #dc2626;\n  --urgent-bg: #fef2f2;\n  --stale-bg: #fffbeb;\n  --stale-text: #92400e;\n  --self-bg: #eef2ff;\n  --self-text: #4338ca;\n  --done-bg: #f0fdf4;\n  --radius: 12px;\n}\n\n* { box-sizing: border-box; }\n\nhtml, body {\n  margin: 0;\n  padding: 0;\n  background: var(--bg);\n  color: var(--text);\n  font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif;\n  -webkit-text-size-adjust: 100%;\n}\n\na { color: var(--primary); text-decoration: none; }\na:hover { text-decoration: underline; }\n\n.topbar {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  padding: 14px 16px;\n  background: var(--card-bg);\n  border-bottom: 1px solid var(--border);\n  position: sticky;\n  top: 0;\n  z-index: 10;\n}\n.brand { font-weight: 700; font-size: 1.05rem; color: var(--text); }\n.topbar .me { color: var(--muted); font-size: 0.85rem; margin-right: 8px; }\n.topbar .inline-form { display: flex; align-items: center; }\n\n.container {\n  max-width: 640px;\n  margin: 0 auto;\n  padding: 16px 16px 80px;\n}\n.container.wide { max-width: 900px; }\n\n.card {\n  background: var(--card-bg);\n  border: 1px solid var(--border);\n  border-radius: var(--radius);\n  padding: 18px;\n  margin-bottom: 16px;\n}\n\nh1 { font-size: 1.4rem; margin: 0 0 8px; }\nh2 { font-size: 1.05rem; margin: 0 0 12px; }\n.muted { color: var(--muted); }\n.small { font-size: 0.82rem; }\n\n.auth-card { margin-top: 10vh; text-align: center; }\n.auth-card h1 { font-size: 1.6rem; }\n\n.stacked-form { display: flex; flex-direction: column; gap: 6px; text-align: left; }\n.stacked-form.tight { margin-top: 10px; }\n.stacked-form label { font-size: 0.85rem; font-weight: 600; margin-top: 8px; }\n.stacked-form input[type=\"text\"],\n.stacked-form input[type=\"email\"],\n.stacked-form input[type=\"date\"],\n.stacked-form input[type=\"number\"],\n.stacked-form textarea {\n  padding: 12px;\n  border: 1px solid var(--border);\n  border-radius: 10px;\n  font-size: 1rem;\n  width: 100%;\n  background: #fff;\n  color: var(--text);\n}\n.stacked-form textarea { min-height: 70px; resize: vertical; font-family: inherit; }\n\n.radio-group { border: none; padding: 0; margin: 8px 0 0; }\n.radio-group legend { font-size: 0.85rem; font-weight: 600; padding: 0; }\n.radio-option, .checkbox-option {\n  display: flex; align-items: center; gap: 8px;\n  font-size: 0.95rem; padding: 6px 0;\n}\n\n.btn {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  min-height: 44px;\n  padding: 10px 16px;\n  border-radius: 10px;\n  border: 1px solid transparent;\n  font-size: 1rem;\n  font-weight: 600;\n  cursor: pointer;\n  background: #fff;\n}\n.btn-block { width: 100%; margin-top: 12px; }\n.btn-primary { background: var(--primary); color: #fff; }\n.btn-primary:hover { background: var(--primary-dark); }\n.btn-ghost { background: #fff; border-color: var(--border); color: var(--text); }\n.btn-small { min-height: 36px; padding: 6px 12px; font-size: 0.85rem; }\n.link-btn {\n  background: none; border: none; color: var(--primary);\n  font-size: 0.85rem; cursor: pointer; padding: 4px;\n}\n\n.inline-form { display: inline-block; margin: 4px 4px 0 0; }\n\n.alert { padding: 12px 14px; border-radius: 10px; margin-bottom: 14px; font-size: 0.9rem; }\n.alert-error { background: var(--urgent-bg); color: #991b1b; border: 1px solid #fecaca; }\n.alert-notice { background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe; }\n.dev-box { background: #fefce8; border: 1px dashed #ca8a04; border-radius: 10px; padding: 12px; margin-top: 10px; font-size: 0.85rem; word-break: break-all; }\n\n.pair-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }\n.pair-row {\n  border: 1px solid var(--border); border-radius: 10px; padding: 12px;\n  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;\n}\n.pair-row.pending { background: #fafafa; }\n.pair-link { flex: 1; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; color: var(--text); }\n.pair-arrow { font-weight: 600; }\n.pair-label { color: var(--muted); font-size: 0.85rem; }\n\n.badge {\n  display: inline-block; padding: 2px 8px; border-radius: 999px;\n  font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.02em;\n}\n.badge-role { background: #f3f4f6; color: #374151; }\n.badge-delegator { background: #ede9fe; color: #5b21b6; }\n.badge-doer { background: #dcfce7; color: #166534; }\n.badge-urgent { background: var(--urgent-bg); color: var(--urgent); }\n.badge-stale { background: var(--stale-bg); color: var(--stale-text); }\n.badge-overdue { background: #fee2e2; color: #991b1b; }\n.badge-self { background: var(--self-bg); color: var(--self-text); }\n\n.back-link { display: inline-block; margin-bottom: 10px; font-size: 0.9rem; }\n\n.pair-header { margin-bottom: 14px; }\n.settings-details { margin-top: 8px; }\n.settings-details summary { cursor: pointer; color: var(--primary); font-size: 0.85rem; }\n\n.add-task-details { margin-bottom: 18px; }\n.add-task-details summary {\n  list-style: none; cursor: pointer;\n}\n.add-task-details summary::-webkit-details-marker { display: none; }\n.add-task-details[open] summary { margin-bottom: 10px; background: var(--primary-dark); }\n.add-task-details form { background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; }\n\n.board {\n  display: grid;\n  grid-template-columns: 1fr;\n  gap: 18px;\n}\n@media (min-width: 720px) {\n  .board { grid-template-columns: repeat(3, 1fr); align-items: start; }\n}\n\n.board-col h2 { display: flex; align-items: center; gap: 8px; }\n.board-col .count {\n  background: var(--border); color: var(--muted); border-radius: 999px;\n  font-size: 0.75rem; padding: 1px 8px; font-weight: 700;\n}\n.empty-col { padding: 10px 0; }\n\n.task-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }\n.task-card {\n  background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius);\n  padding: 14px;\n}\n.task-card.urgent { border-color: var(--urgent); box-shadow: 0 0 0 1px var(--urgent); }\n.task-card.stale { background: var(--stale-bg); }\n\n.task-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; flex-wrap: wrap; }\n.task-title { font-weight: 700; font-size: 1rem; }\n.task-badges { display: flex; gap: 6px; flex-wrap: wrap; }\n.task-desc { margin: 6px 0; font-size: 0.9rem; }\n.task-meta { margin: 4px 0; }\n.done-note {\n  background: var(--done-bg); border-radius: 8px; padding: 8px 10px;\n  font-size: 0.88rem; font-style: italic; margin: 8px 0;\n}\n.task-actions { display: flex; flex-wrap: wrap; margin-top: 8px; }\n\n.note-details, .history-details { margin-top: 8px; }\n.note-details summary, .history-details summary {\n  cursor: pointer; color: var(--primary); font-size: 0.82rem;\n}\n.history-list { list-style: none; margin: 8px 0 0; padding: 0; font-size: 0.82rem; display: flex; flex-direction: column; gap: 6px; }\n.history-list li { border-top: 1px solid var(--border); padding-top: 6px; }\n.history-when { color: var(--muted); margin-right: 6px; }\n.history-note { font-style: italic; margin-top: 2px; }\n\nfooter { text-align: center; padding: 20px; color: var(--muted); font-size: 0.8rem; }\n";

// ====================================================================
// src/util.js
// ====================================================================

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function toDate(iso) {
  if (!iso) return null;
  // SQLite datetime('now') gives "YYYY-MM-DD HH:MM:SS" (UTC, no offset marker).
  const normalized = iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z';
  return new Date(normalized);
}

function fmtDateTime(iso) {
  const d = toDate(iso);
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = iso.length <= 10 ? new Date(iso + 'T00:00:00Z') : toDate(iso);
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function daysSince(iso) {
  const d = toDate(iso);
  if (!d) return Infinity;
  return (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
}

function isOverdue(dueDate, status) {
  if (!dueDate || status === 'done') return false;
  const d = new Date(dueDate + 'T23:59:59Z');
  return Date.now() > d.getTime();
}

const STATUS_LABELS = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
};

const STATUS_ORDER = ['todo', 'in_progress', 'done'];

// ====================================================================
// src/auth.js
// ====================================================================

// Signed, stateless session cookies (HMAC-SHA256) and one-time magic-link
// tokens. No external JWT library needed.
const SECRET = process.env.SESSION_SECRET || 'dev-insecure-secret-change-me';
if (process.env.NODE_ENV === 'production' && SECRET === 'dev-insecure-secret-change-me') {
  console.warn('[auth] WARNING: SESSION_SECRET is not set. Set it before running in production.');
}

const SESSION_COOKIE = 'ctt_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const LOGIN_TOKEN_TTL_MS = 1000 * 60 * 15; // 15 minutes

function hmac(input) {
  return crypto.createHmac('sha256', SECRET).update(input).digest('base64url');
}

function sign(payloadObj) {
  const json = JSON.stringify(payloadObj);
  const b64 = Buffer.from(json, 'utf8').toString('base64url');
  const sig = hmac(b64);
  return `${b64}.${sig}`;
}

function verify(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [b64, sig] = token.split('.');
  if (!b64 || !sig) return null;
  const expected = hmac(b64);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const obj = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
    if (obj.exp && Date.now() > obj.exp) return null;
    return obj;
  } catch {
    return null;
  }
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

// ====================================================================
// src/db.js
// ====================================================================

// Storage layer. Uses Node's built-in node:sqlite (available from Node 22.5+),
// so the app runs with zero external dependencies.

const defaultDataDir = path.join(__dirname, 'data');
if (!fs.existsSync(defaultDataDir)) fs.mkdirSync(defaultDataDir, { recursive: true });

const dbPath = process.env.DATABASE_PATH && process.env.DATABASE_PATH.trim()
  ? process.env.DATABASE_PATH
  : path.join(defaultDataDir, 'app.db');

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS login_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  token TEXT UNIQUE NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pairs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  delegator_user_id INTEGER NOT NULL REFERENCES users(id),
  doer_user_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending', -- pending | active
  invited_by_user_id INTEGER NOT NULL REFERENCES users(id),
  stale_days INTEGER NOT NULL DEFAULT 3,
  label TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(delegator_user_id, doer_user_id)
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pair_id INTEGER NOT NULL REFERENCES pairs(id),
  title TEXT NOT NULL,
  description TEXT,
  due_date TEXT,
  created_by_user_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'todo', -- todo | in_progress | done
  is_urgent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  status_changed_at TEXT NOT NULL DEFAULT (datetime('now')),
  done_at TEXT,
  done_note TEXT
);

CREATE TABLE IF NOT EXISTS task_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id),
  actor_user_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL, -- created | status_change | note | urgent_on | urgent_off
  from_status TEXT,
  to_status TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_pair ON tasks(pair_id);
CREATE INDEX IF NOT EXISTS idx_events_task ON task_events(task_id);
CREATE INDEX IF NOT EXISTS idx_pairs_delegator ON pairs(delegator_user_id);
CREATE INDEX IF NOT EXISTS idx_pairs_doer ON pairs(doer_user_id);
`);

function nowIso() {
  return new Date().toISOString();
}

// ====================================================================
// src/models.js
// ====================================================================

// Data-access helpers built on top of src/db.js. Keeping all SQL here keeps
// the route handlers focused on request/response and permission logic.
// ---- users -----------------------------------------------------------

function findUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
}

function findUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function findOrCreateUser(email) {
  const existing = findUserByEmail(email);
  if (existing) return existing;
  const info = db.prepare('INSERT INTO users (email) VALUES (?)').run(email);
  return findUserById(Number(info.lastInsertRowid));
}

// ---- login tokens ------------------------------------------------------

function createLoginToken(userId, token, ttlMs) {
  const expiresAt = new Date(Date.now() + ttlMs).toISOString().slice(0, 19).replace('T', ' ');
  db.prepare('INSERT INTO login_tokens (user_id, token, expires_at) VALUES (?, ?, ?)')
    .run(userId, token, expiresAt);
}

function consumeLoginToken(token) {
  const row = db.prepare('SELECT * FROM login_tokens WHERE token = ?').get(token);
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.used_at) return { ok: false, reason: 'used' };
  const expiresAtMs = new Date(row.expires_at.replace(' ', 'T') + 'Z').getTime();
  if (Date.now() > expiresAtMs) return { ok: false, reason: 'expired' };
  db.prepare("UPDATE login_tokens SET used_at = datetime('now') WHERE id = ?").run(row.id);
  return { ok: true, userId: row.user_id };
}

// ---- pairs ---------------------------------------------------------------

function createPair({ delegatorUserId, doerUserId, invitedByUserId, label }) {
  return db.prepare(`
    INSERT INTO pairs (delegator_user_id, doer_user_id, invited_by_user_id, label, status)
    VALUES (?, ?, ?, ?, 'pending')
  `).run(delegatorUserId, doerUserId, invitedByUserId, label || null);
}

function findPairBetween(delegatorUserId, doerUserId) {
  return db.prepare('SELECT * FROM pairs WHERE delegator_user_id = ? AND doer_user_id = ?')
    .get(delegatorUserId, doerUserId);
}

function getPairById(id) {
  return db.prepare(`
    SELECT p.*, ud.email AS delegator_email, uo.email AS doer_email
    FROM pairs p
    JOIN users ud ON ud.id = p.delegator_user_id
    JOIN users uo ON uo.id = p.doer_user_id
    WHERE p.id = ?
  `).get(id);
}

function listPairsForUser(userId) {
  return db.prepare(`
    SELECT p.*, ud.email AS delegator_email, uo.email AS doer_email
    FROM pairs p
    JOIN users ud ON ud.id = p.delegator_user_id
    JOIN users uo ON uo.id = p.doer_user_id
    WHERE p.delegator_user_id = ? OR p.doer_user_id = ?
    ORDER BY p.created_at DESC
  `).all(userId, userId);
}

function setPairStatus(id, status) {
  db.prepare('UPDATE pairs SET status = ? WHERE id = ?').run(status, id);
}

function deletePair(id) {
  db.prepare('DELETE FROM pairs WHERE id = ?').run(id);
}

function updatePairSettings(id, { staleDays, label }) {
  db.prepare('UPDATE pairs SET stale_days = ?, label = ? WHERE id = ?')
    .run(staleDays, label || null, id);
}

function roleInPair(pair, userId) {
  if (pair.delegator_user_id === userId) return 'delegator';
  if (pair.doer_user_id === userId) return 'doer';
  return null;
}

// ---- tasks -----------------------------------------------------------

function createTask({ pairId, title, description, dueDate, createdByUserId, isUrgent }) {
  const info = db.prepare(`
    INSERT INTO tasks (pair_id, title, description, due_date, created_by_user_id, is_urgent)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(pairId, title, description || null, dueDate || null, createdByUserId, isUrgent ? 1 : 0);
  const taskId = Number(info.lastInsertRowid);
  addTaskEvent({ taskId, actorUserId: createdByUserId, type: 'created', toStatus: 'todo' });
  if (isUrgent) {
    addTaskEvent({ taskId, actorUserId: createdByUserId, type: 'urgent_on' });
  }
  return taskId;
}

function getTaskById(id) {
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
}

function listTasksForPair(pairId) {
  return db.prepare('SELECT * FROM tasks WHERE pair_id = ? ORDER BY created_at DESC').all(pairId);
}

function updateTaskStatus(taskId, { toStatus, actorUserId, note }) {
  const task = getTaskById(taskId);
  const fromStatus = task.status;
  const isDone = toStatus === 'done';
  db.prepare(`
    UPDATE tasks
    SET status = ?, status_changed_at = datetime('now'),
        done_at = CASE WHEN ? = 1 THEN datetime('now') ELSE NULL END,
        done_note = CASE WHEN ? = 1 THEN COALESCE(?, done_note) ELSE done_note END
    WHERE id = ?
  `).run(toStatus, isDone ? 1 : 0, isDone ? 1 : 0, note || null, taskId);
  addTaskEvent({ taskId, actorUserId, type: 'status_change', fromStatus, toStatus, note: note || null });
}

function updateTaskNote(taskId, { note, actorUserId }) {
  db.prepare('UPDATE tasks SET done_note = ? WHERE id = ?').run(note || null, taskId);
  addTaskEvent({ taskId, actorUserId, type: 'note', note: note || null });
}

function setTaskUrgent(taskId, { isUrgent, actorUserId }) {
  db.prepare('UPDATE tasks SET is_urgent = ? WHERE id = ?').run(isUrgent ? 1 : 0, taskId);
  addTaskEvent({ taskId, actorUserId, type: isUrgent ? 'urgent_on' : 'urgent_off' });
}

function addTaskEvent({ taskId, actorUserId, type, fromStatus, toStatus, note }) {
  db.prepare(`
    INSERT INTO task_events (task_id, actor_user_id, type, from_status, to_status, note)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(taskId, actorUserId, type, fromStatus || null, toStatus || null, note || null);
}

function listTaskEvents(taskId) {
  return db.prepare(`
    SELECT e.*, u.email AS actor_email
    FROM task_events e
    JOIN users u ON u.id = e.actor_user_id
    WHERE e.task_id = ?
    ORDER BY e.created_at ASC, e.id ASC
  `).all(taskId);
}

// ---- reporting (weekly digest) ---------------------------------------

function listTasksDoneSince(pairId, sinceIso) {
  return db.prepare(`
    SELECT * FROM tasks WHERE pair_id = ? AND status = 'done' AND done_at >= ?
    ORDER BY done_at ASC
  `).all(pairId, sinceIso);
}

function listActivePairs() {
  return db.prepare(`
    SELECT p.*, ud.email AS delegator_email, uo.email AS doer_email
    FROM pairs p
    JOIN users ud ON ud.id = p.delegator_user_id
    JOIN users uo ON uo.id = p.doer_user_id
    WHERE p.status = 'active'
  `).all();
}

// ====================================================================
// src/email.js
// ====================================================================

// Email delivery abstraction. Uses Resend's HTTP API via the built-in
// `fetch` (no SDK dependency needed) when RESEND_API_KEY is set. Otherwise
// falls back to logging the email to the server console, which is enough
// to develop and test the whole app without any email provider.
async function sendEmail({ to, subject, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || 'Taskwick <onboarding@resend.dev>';

  if (apiKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from, to, subject, text }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.error(`[email] Resend API error ${res.status}: ${body}`);
      }
      return { delivered: res.ok, dev: false };
    } catch (err) {
      console.error('[email] failed to send via Resend:', err.message);
      return { delivered: false, dev: false };
    }
  }

  console.log('\n----- DEV EMAIL (set RESEND_API_KEY to send real emails) -----');
  console.log('To:', to);
  console.log('Subject:', subject);
  console.log(text);
  console.log('----------------------------------------------------------------\n');
  return { delivered: false, dev: true };
}

// ====================================================================
// src/views.js
// ====================================================================

function layout({ title, user, body, wide }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escapeHtml(title)} · Taskwick</title>
<link rel="stylesheet" href="/style.css">
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>✅</text></svg>">
</head>
<body>
<header class="topbar">
  <a class="brand" href="${user ? '/dashboard' : '/login'}">Taskwick</a>
  ${user ? `<form method="post" action="/auth/logout" class="inline-form">
      <span class="me">${escapeHtml(user.email)}</span>
      <button class="link-btn" type="submit">Sign out</button>
    </form>` : ''}
</header>
<main class="${wide ? 'container wide' : 'container'}">
${body}
</main>
</body>
</html>`;
}

function alertBox(query) {
  let out = '';
  if (query.error) out += `<div class="alert alert-error">${escapeHtml(query.error)}</div>`;
  if (query.notice) out += `<div class="alert alert-notice">${escapeHtml(query.notice)}</div>`;
  return out;
}

function loginPage({ query }) {
  const sent = query.sent === '1';
  const devLink = query.devlink;
  return {
    title: 'Sign in',
    body: `
<div class="card auth-card">
  <h1>Taskwick</h1>
  <p class="muted">See what's actually gotten done — without making a call.</p>
  ${alertBox(query)}
  ${sent ? `
    <div class="alert alert-notice">
      Check <strong>${escapeHtml(query.email || 'your email')}</strong> for a sign-in link. It expires in 15 minutes.
    </div>
    ${devLink ? `<div class="dev-box">
      <p><strong>Dev mode</strong> — no email provider is configured, so here is the link directly:</p>
      <p><a href="${escapeHtml(devLink)}">${escapeHtml(devLink)}</a></p>
    </div>` : ''}
  ` : `
    <form method="post" action="/auth/request" class="stacked-form">
      <label for="email">Email address</label>
      <input id="email" name="email" type="email" inputmode="email" autocomplete="email" required placeholder="you@example.com">
      <button type="submit" class="btn btn-primary btn-block">Send sign-in link</button>
    </form>
    <p class="muted small">No password needed — we'll email you a one-time link.</p>
  `}
</div>`,
  };
}

function pairRoleLabel(pair, userId) {
  if (pair.delegator_user_id === userId) {
    return { arrow: `You → ${pair.doer_email}`, role: 'delegator', otherEmail: pair.doer_email };
  }
  return { arrow: `${pair.delegator_email} → You`, role: 'doer', otherEmail: pair.delegator_email };
}

function dashboardPage({ user, active, pendingIncoming, pendingOutgoing, query }) {
  const pairRow = (p) => {
    const { arrow, role } = pairRoleLabel(p, user.id);
    return `<li class="pair-row">
      <a class="pair-link" href="/pairs/${p.id}">
        <span class="pair-arrow">${escapeHtml(arrow)}</span>
        <span class="badge badge-role badge-${role}">${role === 'delegator' ? 'you delegate' : 'you do'}</span>
        ${p.label ? `<span class="pair-label">${escapeHtml(p.label)}</span>` : ''}
      </a>
    </li>`;
  };

  const incomingRow = (p) => {
    const { arrow } = pairRoleLabel(p, user.id);
    return `<li class="pair-row pending">
      <span class="pair-arrow">${escapeHtml(arrow)}</span>
      <span class="muted small">wants to connect</span>
      <form method="post" action="/pairs/${p.id}/accept" class="inline-form">
        <button class="btn btn-small btn-primary" type="submit">Accept</button>
      </form>
      <form method="post" action="/pairs/${p.id}/decline" class="inline-form">
        <button class="btn btn-small btn-ghost" type="submit">Decline</button>
      </form>
    </li>`;
  };

  const outgoingRow = (p) => {
    const { arrow } = pairRoleLabel(p, user.id);
    return `<li class="pair-row pending">
      <span class="pair-arrow">${escapeHtml(arrow)}</span>
      <span class="muted small">waiting for them to confirm</span>
    </li>`;
  };

  return {
    title: 'Dashboard',
    body: `
${alertBox(query)}
<section class="card">
  <h2>Invite someone</h2>
  <form method="post" action="/pairs" class="stacked-form">
    <label for="email">Their email</label>
    <input id="email" name="email" type="email" required placeholder="colleague@example.com">
    <fieldset class="radio-group">
      <legend>Direction</legend>
      <label class="radio-option"><input type="radio" name="direction" value="i_delegate" checked> I give them tasks</label>
      <label class="radio-option"><input type="radio" name="direction" value="i_do"> They give me tasks</label>
    </fieldset>
    <label for="label">Label <span class="muted small">(optional, e.g. "Marketing")</span></label>
    <input id="label" name="label" type="text" maxlength="60" placeholder="Optional name for this pair">
    <button type="submit" class="btn btn-primary btn-block">Send invite</button>
  </form>
</section>

${pendingIncoming.length ? `
<section class="card">
  <h2>Pending invites for you</h2>
  <ul class="pair-list">${pendingIncoming.map(incomingRow).join('')}</ul>
</section>` : ''}

${pendingOutgoing.length ? `
<section class="card">
  <h2>Waiting on their confirmation</h2>
  <ul class="pair-list">${pendingOutgoing.map(outgoingRow).join('')}</ul>
</section>` : ''}

<section class="card">
  <h2>Your pairs</h2>
  ${active.length ? `<ul class="pair-list">${active.map(pairRow).join('')}</ul>` : `<p class="muted">No active pairs yet — invite someone above.</p>`}
</section>
`,
  };
}

function statusHistoryList(events) {
  const label = (e) => {
    if (e.type === 'created') return `Created`;
    if (e.type === 'status_change') return `${STATUS_LABELS[e.from_status] || e.from_status} → ${STATUS_LABELS[e.to_status] || e.to_status}`;
    if (e.type === 'note') return `Note updated`;
    if (e.type === 'urgent_on') return `Marked urgent`;
    if (e.type === 'urgent_off') return `Unmarked urgent`;
    return e.type;
  };
  return `<ul class="history-list">
    ${events.map((e) => `<li>
      <span class="history-when">${fmtDateTime(e.created_at)}</span>
      <span class="history-what">${escapeHtml(label(e))}</span>
      <span class="history-who muted small">— ${escapeHtml(e.actor_email)}</span>
      ${e.note ? `<div class="history-note">"${escapeHtml(e.note)}"</div>` : ''}
    </li>`).join('')}
  </ul>`;
}

function taskCard({ task, role, user, pair, events }) {
  const isCreator = task.created_by_user_id === user.id;
  const isDoer = role === 'doer';
  const selfAdded = task.created_by_user_id === pair.doer_user_id;
  const stale = task.status !== 'done' && daysSince(task.status_changed_at) >= pair.stale_days;
  const overdue = isOverdue(task.due_date, task.status);

  const statusButtons = [];
  if (isDoer) {
    if (task.status === 'todo') {
      statusButtons.push(`<form method="post" action="/pairs/${pair.id}/tasks/${task.id}/status" class="inline-form">
        <input type="hidden" name="status" value="in_progress">
        <button class="btn btn-small btn-primary" type="submit">Start</button>
      </form>`);
    }
    if (task.status === 'in_progress') {
      statusButtons.push(`<form method="post" action="/pairs/${pair.id}/tasks/${task.id}/status" class="inline-form">
        <input type="hidden" name="status" value="done">
        <button class="btn btn-small btn-primary" type="submit">Mark done</button>
      </form>`);
      statusButtons.push(`<form method="post" action="/pairs/${pair.id}/tasks/${task.id}/status" class="inline-form">
        <input type="hidden" name="status" value="todo">
        <button class="btn btn-small btn-ghost" type="submit">Back to to-do</button>
      </form>`);
    }
    if (task.status === 'todo') {
      statusButtons.push(`<form method="post" action="/pairs/${pair.id}/tasks/${task.id}/status" class="inline-form">
        <input type="hidden" name="status" value="done">
        <button class="btn btn-small btn-ghost" type="submit">Mark done</button>
      </form>`);
    }
    if (task.status === 'done') {
      statusButtons.push(`<form method="post" action="/pairs/${pair.id}/tasks/${task.id}/status" class="inline-form">
        <input type="hidden" name="status" value="in_progress">
        <button class="btn btn-small btn-ghost" type="submit">Reopen</button>
      </form>`);
    }
  }

  const urgentToggle = isCreator ? `<form method="post" action="/pairs/${pair.id}/tasks/${task.id}/urgent" class="inline-form">
      <button class="btn btn-small btn-ghost" type="submit">${task.is_urgent ? 'Unmark urgent' : 'Mark urgent'}</button>
    </form>` : '';

  const noteForm = (isDoer && task.status !== 'todo') ? `<details class="note-details">
      <summary>${task.done_note ? 'Edit note' : 'Add a note'}</summary>
      <form method="post" action="/pairs/${pair.id}/tasks/${task.id}/note" class="stacked-form tight">
        <textarea name="note" maxlength="500" placeholder="e.g. handled this over email, see attached">${escapeHtml(task.done_note || '')}</textarea>
        <button class="btn btn-small btn-primary" type="submit">Save note</button>
      </form>
    </details>` : '';

  const cardClasses = ['task-card', task.is_urgent ? 'urgent' : '', stale ? 'stale' : ''].filter(Boolean).join(' ');
  return `<li class="${cardClasses}" data-task-id="${task.id}">
    <div class="task-head">
      <span class="task-title">${escapeHtml(task.title)}</span>
      <span class="task-badges">
        ${task.is_urgent ? '<span class="badge badge-urgent">Urgent</span>' : ''}
        ${stale ? `<span class="badge badge-stale">Stale ${Math.floor(daysSince(task.status_changed_at))}d</span>` : ''}
        ${overdue ? '<span class="badge badge-overdue">Overdue</span>' : ''}
        ${selfAdded ? '<span class="badge badge-self">Self-added</span>' : ''}
      </span>
    </div>
    ${task.description ? `<p class="task-desc">${escapeHtml(task.description)}</p>` : ''}
    <div class="task-meta muted small">
      Created ${fmtDate(task.created_at)} by ${task.created_by_user_id === pair.delegator_user_id ? 'delegator' : 'doer'}
      ${task.due_date ? ` · Due ${fmtDate(task.due_date)}` : ''}
      ${task.status === 'done' && task.done_at ? ` · Done ${fmtDate(task.done_at)}` : ''}
    </div>
    ${task.done_note ? `<div class="done-note">"${escapeHtml(task.done_note)}"</div>` : ''}
    <div class="task-actions">
      ${statusButtons.join('')}
      ${urgentToggle}
    </div>
    ${noteForm}
    <details class="history-details">
      <summary>History (${events.length})</summary>
      ${statusHistoryList(events)}
    </details>
  </li>`;
}

function pairPage({ user, pair, role, columns, query }) {
  const otherEmail = role === 'delegator' ? pair.doer_email : pair.delegator_email;
  const colOrder = ['todo', 'in_progress', 'done'];

  return {
    title: pair.label || otherEmail,
    wide: true,
    body: `
<a class="back-link" href="/dashboard">&larr; Dashboard</a>
${alertBox(query)}
<div class="pair-header">
  <h1>${escapeHtml(pair.label || otherEmail)}</h1>
  <p class="muted">${role === 'delegator' ? `You → ${escapeHtml(pair.doer_email)}` : `${escapeHtml(pair.delegator_email)} → You`} · stale after ${pair.stale_days}d</p>
  <details class="settings-details">
    <summary>Pair settings</summary>
    <form method="post" action="/pairs/${pair.id}/settings" class="stacked-form tight">
      <label for="label">Label</label>
      <input id="label" name="label" type="text" maxlength="60" value="${escapeHtml(pair.label || '')}">
      <label for="stale_days">Flag as stale after (days)</label>
      <input id="stale_days" name="stale_days" type="number" min="1" max="60" value="${pair.stale_days}">
      <button type="submit" class="btn btn-small btn-primary">Save settings</button>
    </form>
  </details>
</div>

<details class="add-task-details" ${query.opened === 'add' ? 'open' : ''}>
  <summary class="btn btn-primary btn-block">+ Add task</summary>
  <form method="post" action="/pairs/${pair.id}/tasks" class="stacked-form">
    <label for="title">Title</label>
    <input id="title" name="title" type="text" required maxlength="200" placeholder="What needs doing?">
    <label for="description">Description <span class="muted small">(optional)</span></label>
    <textarea id="description" name="description" maxlength="1000" placeholder="Any extra detail"></textarea>
    <label for="due_date">Due date <span class="muted small">(optional)</span></label>
    <input id="due_date" name="due_date" type="date">
    <label class="checkbox-option"><input type="checkbox" name="is_urgent" value="1"> Mark urgent</label>
    <button type="submit" class="btn btn-primary btn-block">Save task</button>
  </form>
</details>

<div class="board">
  ${colOrder.map((status) => `
    <section class="board-col">
      <h2>${STATUS_LABELS[status]} <span class="count">${columns[status].length}</span></h2>
      ${columns[status].length ? `<ul class="task-list">${columns[status].map((t) => taskCard(t)).join('')}</ul>` : `<p class="muted small empty-col">Nothing here.</p>`}
    </section>
  `).join('')}
</div>
`,
  };
}

// ====================================================================
// src/router.js
// ====================================================================

// A tiny dependency-free HTTP router with an Express-ish ctx API. Built on
// node:http directly so the app has zero npm dependencies.
function compilePattern(pattern) {
  const keys = [];
  const regexStr = pattern
    .split('/')
    .map((segment) => {
      if (segment.startsWith(':')) {
        keys.push(segment.slice(1));
        return '([^/]+)';
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { regex: new RegExp(`^${regexStr}/?$`), keys };
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  }
  return out;
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  const limit = 1024 * 1024; // 1MB, plenty for this app's forms
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('Request body too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function parseBody(raw, contentType) {
  if (!raw) return {};
  if (contentType && contentType.includes('application/json')) {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  // default: application/x-www-form-urlencoded
  const out = {};
  for (const [key, val] of new URLSearchParams(raw)) out[key] = val;
  return out;
}

function createRouter() {
  const routes = [];
  const middlewares = [];

  function add(method, pattern, handler) {
    routes.push({ method, ...compilePattern(pattern), handler });
  }

  const router = {
    use(fn) { middlewares.push(fn); },
    get(pattern, handler) { add('GET', pattern, handler); },
    post(pattern, handler) { add('POST', pattern, handler); },
    async handle(req, res) {
      const host = req.headers.host || 'localhost';
      const url = new URL(req.url, `http://${host}`);
      const query = Object.fromEntries(url.searchParams.entries());
      const cookies = parseCookies(req.headers.cookie);

      let body = {};
      if (req.method === 'POST') {
        try {
          const raw = await readBody(req);
          body = parseBody(raw, req.headers['content-type']);
        } catch (err) {
          res.writeHead(413, { 'Content-Type': 'text/plain' });
          res.end('Payload too large');
          return;
        }
      }

      const ctx = {
        req, res, url, query, cookies, body,
        method: req.method,
        pathname: url.pathname,
        params: {},
        user: null,
        setCookie(name, value, opts = {}) {
          const parts = [`${name}=${encodeURIComponent(value)}`];
          parts.push(`Path=${opts.path || '/'}`);
          parts.push('HttpOnly');
          parts.push(`SameSite=${opts.sameSite || 'Lax'}`);
          if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`);
          if (process.env.NODE_ENV === 'production') parts.push('Secure');
          const existing = res.getHeader('Set-Cookie');
          const cookieStr = parts.join('; ');
          if (existing) {
            res.setHeader('Set-Cookie', Array.isArray(existing) ? [...existing, cookieStr] : [existing, cookieStr]);
          } else {
            res.setHeader('Set-Cookie', cookieStr);
          }
        },
        clearCookie(name) {
          ctx.setCookie(name, '', { maxAge: 0 });
        },
        redirect(location, status = 303) {
          res.writeHead(status, { Location: location });
          res.end();
        },
        html(content, status = 200) {
          res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(content);
        },
        json(obj, status = 200) {
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(obj));
        },
        text(str, status = 200) {
          res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end(str);
        },
        notFound() { ctx.html('<h1>404</h1><p>Not found.</p><p><a href="/">Home</a></p>', 404); },
      };

      for (const mw of middlewares) {
        await mw(ctx);
      }

      for (const route of routes) {
        if (route.method !== req.method) continue;
        const match = route.regex.exec(url.pathname);
        if (!match) continue;
        route.keys.forEach((key, i) => { ctx.params[key] = decodeURIComponent(match[i + 1]); });
        try {
          await route.handler(ctx);
        } catch (err) {
          console.error(`[router] error handling ${req.method} ${url.pathname}:`, err);
          if (!res.writableEnded) {
            res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<h1>500</h1><p>Something went wrong.</p>');
          }
        }
        return;
      }

      ctx.notFound();
    },
  };

  return router;
}

// ====================================================================
// src/routes/auth.js
// ====================================================================

function baseUrl(ctx) {
  return process.env.BASE_URL || `http://${ctx.req.headers.host}`;
}

function registerAuthRoutes(router) {
  router.get('/login', (ctx) => {
    if (ctx.user) return ctx.redirect('/dashboard');
    const { title, body } = loginPage({ query: ctx.query });
    ctx.html(layout({ title, user: null, body }));
  });

  router.post('/auth/request', async (ctx) => {
    const emailRaw = ctx.body.email || '';
    if (!isValidEmail(emailRaw)) {
      return ctx.redirect(`/login?error=${encodeURIComponent('Please enter a valid email address.')}`);
    }
    const email = normalizeEmail(emailRaw);
    const user = findOrCreateUser(email);
    const token = randomToken();
    createLoginToken(user.id, token, LOGIN_TOKEN_TTL_MS);
    const link = `${baseUrl(ctx)}/auth/verify?token=${token}`;

    const result = await sendEmail({
      to: email,
      subject: 'Your Taskwick sign-in link',
      text: `Click this link to sign in (expires in 15 minutes):\n\n${link}\n\nIf you didn't request this, you can ignore this email.`,
    });

    const params = new URLSearchParams({ sent: '1', email });
    if (result.dev && process.env.NODE_ENV !== 'production') {
      params.set('devlink', link);
    }
    ctx.redirect(`/login?${params.toString()}`);
  });

  router.get('/auth/verify', (ctx) => {
    const token = ctx.query.token;
    const result = consumeLoginToken(token);
    if (!result.ok) {
      const messages = {
        not_found: 'That sign-in link is invalid.',
        used: 'That sign-in link has already been used. Request a new one.',
        expired: 'That sign-in link has expired. Request a new one.',
      };
      return ctx.redirect(`/login?error=${encodeURIComponent(messages[result.reason] || 'Sign-in failed.')}`);
    }
    const user = findUserById(result.userId);
    const session = sign({ uid: user.id, exp: Date.now() + SESSION_TTL_MS });
    ctx.setCookie(SESSION_COOKIE, session, { maxAge: Math.floor(SESSION_TTL_MS / 1000) });
    ctx.redirect('/dashboard');
  });

  router.post('/auth/logout', (ctx) => {
    ctx.clearCookie(SESSION_COOKIE);
    ctx.redirect('/login');
  });
}

function sessionMiddleware(ctx) {
  const token = ctx.cookies[SESSION_COOKIE];
  const payload = verify(token);
  if (payload && payload.uid) {
    const user = findUserById(payload.uid);
    if (user) ctx.user = user;
  }
}

function requireAuth(handler) {
  return (ctx) => {
    if (!ctx.user) return ctx.redirect('/login');
    return handler(ctx);
  };
}

// ====================================================================
// src/routes/pairs.js
// ====================================================================

function loadPairForMember(ctx) {
  const pair = getPairById(Number(ctx.params.id));
  if (!pair) return { error: 'not_found' };
  const role = roleInPair(pair, ctx.user.id);
  if (!role) return { error: 'forbidden' };
  return { pair, role };
}

function registerPairRoutes(router) {
  router.get('/dashboard', requireAuth((ctx) => {
    const all = listPairsForUser(ctx.user.id);
    const active = all.filter((p) => p.status === 'active');
    const pendingIncoming = all.filter((p) => p.status === 'pending' && p.invited_by_user_id !== ctx.user.id);
    const pendingOutgoing = all.filter((p) => p.status === 'pending' && p.invited_by_user_id === ctx.user.id);
    const { title, body } = dashboardPage({ user: ctx.user, active, pendingIncoming, pendingOutgoing, query: ctx.query });
    ctx.html(layout({ title, user: ctx.user, body }));
  }));

  router.post('/pairs', requireAuth(async (ctx) => {
    const emailRaw = ctx.body.email || '';
    const direction = ctx.body.direction === 'i_do' ? 'i_do' : 'i_delegate';
    const label = (ctx.body.label || '').trim().slice(0, 60);

    if (!isValidEmail(emailRaw)) {
      return ctx.redirect(`/dashboard?error=${encodeURIComponent('Please enter a valid email address.')}`);
    }
    const otherEmail = normalizeEmail(emailRaw);
    if (otherEmail === ctx.user.email) {
      return ctx.redirect(`/dashboard?error=${encodeURIComponent("You can't form a pair with yourself.")}`);
    }
    const other = findOrCreateUser(otherEmail);
    const delegatorId = direction === 'i_delegate' ? ctx.user.id : other.id;
    const doerId = direction === 'i_delegate' ? other.id : ctx.user.id;

    if (findPairBetween(delegatorId, doerId)) {
      return ctx.redirect(`/dashboard?error=${encodeURIComponent('That pair already exists.')}`);
    }

    createPair({ delegatorUserId: delegatorId, doerUserId: doerId, invitedByUserId: ctx.user.id, label });

    // Best-effort notification; the invitee still needs to sign in with
    // their own email to see and confirm the invite (passwordless auth).
    sendEmail({
      to: otherEmail,
      subject: `${ctx.user.email} invited you on Taskwick`,
      text: `${ctx.user.email} wants to connect with you on Taskwick (${direction === 'i_delegate' ? 'they will give you tasks' : 'you will give them tasks'}).\n\nSign in at ${process.env.BASE_URL || `http://${ctx.req.headers.host}`}/login with this email address to accept.`,
    }).catch(() => {});

    ctx.redirect(`/dashboard?notice=${encodeURIComponent(`Invite sent to ${otherEmail}.`)}`);
  }));

  router.post('/pairs/:id/accept', requireAuth((ctx) => {
    const { pair, role, error } = loadPairForMember(ctx);
    if (error) return ctx.redirect('/dashboard');
    if (pair.status !== 'pending' || pair.invited_by_user_id === ctx.user.id) return ctx.redirect('/dashboard');
    setPairStatus(pair.id, 'active');
    ctx.redirect('/dashboard?notice=' + encodeURIComponent('Pair confirmed.'));
  }));

  router.post('/pairs/:id/decline', requireAuth((ctx) => {
    const { pair, error } = loadPairForMember(ctx);
    if (error) return ctx.redirect('/dashboard');
    if (pair.status !== 'pending' || pair.invited_by_user_id === ctx.user.id) return ctx.redirect('/dashboard');
    deletePair(pair.id);
    ctx.redirect('/dashboard?notice=' + encodeURIComponent('Invite declined.'));
  }));

  router.post('/pairs/:id/settings', requireAuth((ctx) => {
    const { pair, role, error } = loadPairForMember(ctx);
    if (error) return ctx.redirect('/dashboard');
    const staleDays = Math.min(60, Math.max(1, parseInt(ctx.body.stale_days, 10) || 3));
    const label = (ctx.body.label || '').trim().slice(0, 60);
    updatePairSettings(pair.id, { staleDays, label });
    ctx.redirect(`/pairs/${pair.id}?notice=${encodeURIComponent('Settings saved.')}`);
  }));

  router.get('/pairs/:id', requireAuth((ctx) => {
    const { pair, role, error } = loadPairForMember(ctx);
    if (error === 'not_found') return ctx.notFound();
    if (error === 'forbidden') return ctx.html(layout({ title: 'Forbidden', user: ctx.user, body: '<div class="alert alert-error">You are not part of this pair.</div>' }), 403);

    const tasks = listTasksForPair(pair.id);
    const columns = { todo: [], in_progress: [], done: [] };
    for (const task of tasks) {
      const events = listTaskEvents(task.id);
      columns[task.status].push({ task, role, user: ctx.user, pair, events });
    }
    // Urgent-first, then (for open tasks) oldest status-change first so the
    // most-gone-quiet items surface near the top; done tasks newest first.
    for (const status of Object.keys(columns)) {
      columns[status].sort((a, b) => {
        if (a.task.is_urgent !== b.task.is_urgent) return a.task.is_urgent ? -1 : 1;
        if (status === 'done') return new Date(b.task.done_at || 0) - new Date(a.task.done_at || 0);
        return new Date(a.task.status_changed_at) - new Date(b.task.status_changed_at);
      });
    }

    const { title, body, wide } = pairPage({ user: ctx.user, pair, role, columns, query: ctx.query });
    ctx.html(layout({ title, user: ctx.user, body, wide }));
  }));

  router.post('/pairs/:id/tasks', requireAuth((ctx) => {
    const { pair, error } = loadPairForMember(ctx);
    if (error) return ctx.redirect('/dashboard');
    const title = (ctx.body.title || '').trim().slice(0, 200);
    if (!title) return ctx.redirect(`/pairs/${pair.id}?error=${encodeURIComponent('Title is required.')}&opened=add`);
    const description = (ctx.body.description || '').trim().slice(0, 1000);
    const dueDate = (ctx.body.due_date || '').trim();
    const isUrgent = ctx.body.is_urgent === '1';
    createTask({ pairId: pair.id, title, description, dueDate: dueDate || null, createdByUserId: ctx.user.id, isUrgent });
    ctx.redirect(`/pairs/${pair.id}?notice=${encodeURIComponent('Task added.')}`);
  }));

  function loadTaskInPair(ctx, pair) {
    const task = getTaskById(Number(ctx.params.taskId));
    if (!task || task.pair_id !== pair.id) return null;
    return task;
  }

  router.post('/pairs/:id/tasks/:taskId/status', requireAuth((ctx) => {
    const { pair, role, error } = loadPairForMember(ctx);
    if (error) return ctx.redirect('/dashboard');
    const task = loadTaskInPair(ctx, pair);
    if (!task) return ctx.notFound();
    if (role !== 'doer') {
      return ctx.redirect(`/pairs/${pair.id}?error=${encodeURIComponent('Only the doer can change task status.')}`);
    }
    const toStatus = ctx.body.status;
    if (!['todo', 'in_progress', 'done'].includes(toStatus)) {
      return ctx.redirect(`/pairs/${pair.id}?error=${encodeURIComponent('Invalid status.')}`);
    }
    updateTaskStatus(task.id, { toStatus, actorUserId: ctx.user.id, note: null });
    ctx.redirect(`/pairs/${pair.id}`);
  }));

  router.post('/pairs/:id/tasks/:taskId/note', requireAuth((ctx) => {
    const { pair, role, error } = loadPairForMember(ctx);
    if (error) return ctx.redirect('/dashboard');
    const task = loadTaskInPair(ctx, pair);
    if (!task) return ctx.notFound();
    if (role !== 'doer') {
      return ctx.redirect(`/pairs/${pair.id}?error=${encodeURIComponent('Only the doer can add completion notes.')}`);
    }
    const note = (ctx.body.note || '').trim().slice(0, 500);
    updateTaskNote(task.id, { note, actorUserId: ctx.user.id });
    ctx.redirect(`/pairs/${pair.id}?notice=${encodeURIComponent('Note saved.')}`);
  }));

  router.post('/pairs/:id/tasks/:taskId/urgent', requireAuth((ctx) => {
    const { pair, error } = loadPairForMember(ctx);
    if (error) return ctx.redirect('/dashboard');
    const task = loadTaskInPair(ctx, pair);
    if (!task) return ctx.notFound();
    if (task.created_by_user_id !== ctx.user.id) {
      return ctx.redirect(`/pairs/${pair.id}?error=${encodeURIComponent('Only the person who created a task can toggle urgent.')}`);
    }
    setTaskUrgent(task.id, { isUrgent: !task.is_urgent, actorUserId: ctx.user.id });
    ctx.redirect(`/pairs/${pair.id}`);
  }));
}

// ====================================================================
// src/routes/cron.js
// ====================================================================

async function runWeeklyDigest() {
  const sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  const pairs = listActivePairs();

  // Group by delegator so someone in several pairs gets one email, not several.
  const byDelegator = new Map();
  for (const pair of pairs) {
    const done = listTasksDoneSince(pair.id, sinceIso);
    if (!done.length) continue;
    const list = byDelegator.get(pair.delegator_user_id) || { email: pair.delegator_email, sections: [] };
    list.sections.push({ pair, done });
    byDelegator.set(pair.delegator_user_id, list);
  }

  const results = [];
  for (const [, entry] of byDelegator) {
    const text = [
      `Here's what got marked done this week:`,
      '',
      ...entry.sections.flatMap(({ pair, done }) => [
        `${pair.label || pair.doer_email} (${pair.doer_email}):`,
        ...done.map((t) => `  - ${t.title} (done ${fmtDate(t.done_at)})`),
        '',
      ]),
    ].join('\n');

    await sendEmail({ to: entry.email, subject: 'Your weekly Taskwick digest', text });
    results.push({ to: entry.email, taskCount: entry.sections.reduce((n, s) => n + s.done.length, 0) });
  }
  return results;
}

function registerCronRoutes(router) {
  const handler = async (ctx) => {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const provided = ctx.query.secret || ctx.req.headers['x-cron-secret'];
      if (provided !== secret) return ctx.text('Forbidden', 403);
    } else if (process.env.NODE_ENV === 'production') {
      return ctx.text('CRON_SECRET is not configured', 500);
    }
    const results = await runWeeklyDigest();
    ctx.json({ ok: true, sent: results.length, results });
  };
  router.get('/cron/weekly-digest', handler);
  router.post('/cron/weekly-digest', handler);
}

// ====================================================================
// src/app.js
// ====================================================================


const MIME = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

function createApp() {
  const router = createRouter();
  router.use(sessionMiddleware);

  router.get('/', (ctx) => ctx.redirect(ctx.user ? '/dashboard' : '/login'));

  router.get('/style.css', (ctx) => {
    ctx.res.writeHead(200, { 'Content-Type': MIME['.css'], 'Cache-Control': 'public, max-age=300' });
    ctx.res.end(STYLE_CSS);
  });

  router.get('/healthz', (ctx) => ctx.text('ok'));

  registerAuthRoutes(router);
  registerPairRoutes(router);
  registerCronRoutes(router);

  maybeScheduleInProcessDigest();

  return router;
}

// Optional convenience for single-instance deployments that don't have an
// external scheduler available: check once an hour and fire the digest the
// first time we see Monday 08:00 (server-local time) each week. Off by
// default — see .env.example.
function maybeScheduleInProcessDigest() {
  if (process.env.ENABLE_IN_PROCESS_DIGEST !== 'true') return;
  let lastRunWeekKey = null;
  const check = async () => {
    const now = new Date();
    const isMondayMorning = now.getDay() === 1 && now.getHours() === 8;
    const weekKey = `${now.getFullYear()}-${Math.floor(now.getTime() / (7 * 24 * 60 * 60 * 1000))}`;
    if (isMondayMorning && weekKey !== lastRunWeekKey) {
      lastRunWeekKey = weekKey;
      console.log('[digest] firing in-process weekly digest');
      try { await runWeeklyDigest(); } catch (err) { console.error('[digest] failed', err); }
    }
  };
  setInterval(check, 60 * 60 * 1000);
}

// ====================================================================
// server.js
// ====================================================================

const router = createApp();
const port = Number(process.env.PORT) || 3000;

const server = http.createServer((req, res) => {
  router.handle(req, res);
});

server.listen(port, () => {
  console.log(`Taskwick listening on http://localhost:${port}`);
  if (!process.env.RESEND_API_KEY) {
    console.log('[email] No RESEND_API_KEY set — emails will be logged to this console.');
  }
});
