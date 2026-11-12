# MAZ

A chat app that puts several AI models behind one interface, with a small backend that keeps the API keys on the server, syncs conversations across devices and runs scheduled AI agents that stop and ask before they write anything to the outside world.

Live app: https://mazen-create11.github.io/mzai/mzai-v2.html (an access code is required).

## What is in this repository

| Path | What it is |
|---|---|
| `mzai-v2.html` | The app. One self-contained file: chat, model picker, image/video/voice generation, agents screen, settings. Served by GitHub Pages. |
| `maz-proxy/` | The backend, a Cloudflare Worker with a D1 database and a KV store. |
| `maz-proxy/worker.js` | Access codes, conversation sync, media storage, usage tracking, alerts, admin routes. |
| `maz-proxy/atelier.js` | The agent engine ("l'atelier"): jobs, runs, steps, deliverables and approval checkpoints. |
| `maz-proxy/migrations/` | D1 schema, one numbered SQL file per change. |
| `kling-proxy/` | A separate Worker for Kling video generation. Not deployed yet. |
| `index.html` | The previous version of the app, kept for reference. Do not edit. |
| `AUDIT-2026-07-12.md`, `FIXES-2026-07-12.md` | A full audit of the app and the log of what was fixed, with what was left open and why. |

## How it works

**Keys never reach the browser.** The Worker holds the provider keys as secrets and forwards only the requests it recognises. The Mistral route, for example, goes through an allow-list of paths (`MI_CHEMINS` in `atelier.js`) so the proxy cannot be used to call anything else with the real key.

**One access code per person.** The app asks for the code once. Codes are stored hashed (SHA-256); a dump of the database reveals none of them. An admin can create, rename, disable or delete an account.

**Conversations follow the account.** They are stored in D1, isolated per account, and synced with a last-write-wins rule per conversation.

**Generated media is kept.** Images, videos and voice clips are copied to KV on the server, so their links do not expire.

**Usage is counted per account.** Requests per day on the server, tokens and cost as reported by the app, and a monthly spending cap per account.

**Agents stop at a checkpoint.** A job is given to a model with a set of tools, launched by hand or on a schedule. Every run leaves its steps and a deliverable. Any write to the outside world pauses the run until a human approves it. A paused run holds no resource: the provider keeps the conversation, the Worker keeps only its identifier, and a fresh invocation picks it up after approval. An alert is sent when an agent fails.

## Run it

Frontend: open `mzai-v2.html` in a browser, or serve the folder with any static server.

Backend:

```bash
cd maz-proxy
npx wrangler d1 migrations apply maz-db   # apply the SQL files in migrations/
npx wrangler deploy
```

The provider keys and the admin key are Worker secrets (`npx wrangler secret put ...`). Nothing secret is committed: `keys.local.js` and `CODES.local.md` are in `.gitignore`.

Account management commands are in [`maz-proxy/README.md`](maz-proxy/README.md).

## Tests

```bash
cd maz-proxy
npm test
```

No dependency to install: the tests use Node's built-in runner (Node 20 or later) and call the Worker's `fetch` handler directly, with an in-memory stand-in for the database. They cover access control: personal codes (format, hashing, case, revocation), admin routes (key or admin account), rules for custom codes, account deletion, and the origin check.

## Known limits

- Files attached by the user (PDFs, source images) stay on the device. The text of the conversation syncs, the source file does not.
- Sync is last-write-wins: editing the same conversation on two devices at once keeps the most recent version.
- The app is a single 6,000-line file. It works, and it is the main thing to break up.

## What is next

Taken from the open items of the July audit:

- **Media proxy in the Worker** (API-02). Some generated media is still saved as a remote URL that expires. A client-side fix was tried and reverted: the delivery CDNs send no CORS headers. The fetch has to happen in the Worker.
- **Abort in-flight media requests** (API-06). The Stop button stops the interface and the polling, but the request to the provider keeps running and keeps billing.
- **Remove duplicated code** (ARCH-04/05). The message bubble is rendered in four places and the chat request is written out four times although one helper already exists.
- **More tests for the Worker.** Access control is covered (see below). Next targets: the provider path and model allow-lists, then conversation sync.
- **Split `mzai-v2.html`** into modules once the tests above protect the backend contract.
