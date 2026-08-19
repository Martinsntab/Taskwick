# Taskwick

See what's actually gotten done in a delegator → doer relationship, without
having to call and ask.

Passwordless email sign-in, one-directional "pairs" (delegator/doer) that
chain across people, a simple per-pair task board grouped by status, an
urgent flag, and a quiet stale-task badge when nothing's moved in a few days.

## Single-file edition

The entire app is in `server.js`. There are no folders, no build step, and
no npm packages to install — it runs on Node's built-in modules only
(`node:http`, `node:sqlite`, `node:crypto`). Deployment is literally
`node server.js`.

Requires **Node 22.5 or newer** (for `node:sqlite`).

## Running it

```bash
node server.js
```

Then open http://localhost:3000.

If no email provider is configured, sign-in links are printed to the server
console and — outside production — shown directly on screen, so you can
test the whole app without setting anything up.

## Settings (environment variables)

| Variable | Purpose |
|---|---|
| `PORT` | HTTP port (default 3000) |
| `BASE_URL` | Public URL, used to build sign-in links in emails |
| `SESSION_SECRET` | Signs login cookies — set this to a long random string |
| `RESEND_API_KEY` | Optional; send real emails via [Resend](https://resend.com) |
| `EMAIL_FROM` | Optional; the From address for outgoing email |
| `CRON_SECRET` | Required in production to call `/cron/weekly-digest` |
| `ENABLE_IN_PROCESS_DIGEST` | `true` to fire the weekly digest from this process (single instance only) |
| `DATABASE_PATH` | Where the SQLite file lives (default `./data/app.db`) |
| `NODE_ENV` | Set to `production` when deployed |

## Deploying

Any host that runs a long-lived Node 22.5+ process works. Attach a
persistent volume mounted at the app's `data/` directory (or point
`DATABASE_PATH` at one) so tasks survive restarts and redeploys.

## What it does

- **Passwordless sign-in** — email in, one-time link out, 15-minute expiry.
- **Pairs** — a one-directional delegator/doer relationship. Either side
  invites the other by email and picks the direction; the invite is pending
  until the other person confirms. One account can be a doer in one pair and
  a delegator in another, so chains like Natalie → Lisa → Maria → Martin
  work naturally. Every pair you're in shows on one dashboard.
- **Task board per pair** — a flat list grouped into To do / In progress /
  Done. Title required; description and due date optional. Both people can
  add tasks; only the doer changes status.
- **Automatic history** — created, every status change, note edits and
  urgent toggles are all timestamped and attributed automatically.
- **Urgent flag** — a single on/off toggle (not a priority scale). Urgent
  tasks are outlined in red and pinned to the top of their column.
- **Self-added tasks** — tasks the doer creates are tagged "Self-added" and
  appear on the delegator's board like any other.
- **Completion notes** — the doer can attach a short note when finishing.
- **Stale badge** — if a task's status hasn't changed in N days (default 3,
  adjustable per pair), a quiet badge appears for both people.
- **Permissions** — delegators can add and view everything but can't edit
  the doer's status or notes, keeping that record honest.
- **Weekly digest** — `GET/POST /cron/weekly-digest` emails each delegator a
  summary of what was completed that week.

Deliberately left out: kanban boards, labels, priority scales, subtasks,
attachments, comment threads, @mentions, custom workflows, admin views.

## Data model

```
users        id, email, created_at
login_tokens id, user_id, token, expires_at, used_at
pairs        id, delegator_user_id, doer_user_id, status (pending|active),
             invited_by_user_id, stale_days, label, created_at
tasks        id, pair_id, title, description, due_date, created_by_user_id,
             status (todo|in_progress|done), is_urgent,
             created_at, status_changed_at, done_at, done_note
task_events  id, task_id, actor_user_id, type, from_status, to_status,
             note, created_at
```
