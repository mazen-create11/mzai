# MAZ

A chat app that puts several AI models behind one interface, with a small backend that keeps the API keys on the server, syncs conversations across devices and runs scheduled AI agents whose final write step waits for approval by default.

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

**Keys stay on the server.** In the deployed app the Worker holds the provider keys as secrets. It relays only an allow-list of paths per provider (`CHEMINS_OK` in `worker.js`, `MI_CHEMINS` in `atelier.js`) and checks the requested model against an allow-list. The checks are on the path and on the `model` field of a JSON body; they are not yet per HTTP method.

**One access code per person.** The app asks for the code once. Codes are stored hashed (SHA-256, unsalted). Generated codes carry about 80 bits of entropy; a custom code chosen by the admin is only as strong as what was typed. An admin can create, rename or disable an account, and delete one that was never used.

**Conversations follow the account.** They are stored in D1, isolated per account, and synced with a last-write-wins rule per conversation.

**Generated media is kept.** When the app runs through the backend, images, videos and voice clips are copied to KV on the server (`/media/stash`), so their links do not expire.

**Usage is counted per account.** Proxy requests per day are counted on the server; tokens and cost are reported by the app. Agent runs have a monthly spending cap per account, which the account owner sets.

**Agents stop at a checkpoint.** A job is given to a model with a set of tools, launched by hand or on a schedule. Every run records its steps. Tools marked as writes (today there is one: filing the run's deliverable) pause the run until a human approves, unless the job owner has switched automatic writes on for that job. A paused run holds no resource: the provider keeps the conversation, the Worker keeps only its identifier, and a fresh invocation picks it up after approval. If the account has set an e-mail address or a webhook, an alert is sent when an agent fails.

## Run it

This repository is the source of one deployed instance, not a one-command install. To run your own copy:

Frontend: serve the folder with any static server. The backend only answers the origins listed in `ALLOWED_ORIGINS` (`maz-proxy/wrangler.toml`), so add yours there.

Backend:

```bash
cd maz-proxy
# first put the ids of your own D1 database and KV namespace in wrangler.toml
npx wrangler d1 migrations apply maz-db --remote   # without --remote it runs on an empty local database
npx wrangler deploy
```

Secrets are set with `npx wrangler secret put <NAME>`: `OPENROUTER_KEY`, `SILICONFLOW_KEY`, `MISTRAL_KEY`, `ADMIN_KEY`, and `RESEND_KEY` / `RESEND_FROM` if you want e-mail alerts. Nothing secret is committed: `keys.local.js`, `CODES.local.md` and `.dev.vars` are in `.gitignore`.

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

- **Abort in-flight media requests** (API-06). The Stop button stops the interface and the polling, but the request to the provider keeps running and keeps billing.
- **Remove duplicated code** (ARCH-04/05). The message bubble is rendered in four places and the chat request is written out four times although one helper already exists.
- **More tests for the Worker.** Access control is covered (see below). Next targets: the provider path and model allow-lists, then conversation sync.
- **Split `mzai-v2.html`** into modules once the tests above protect the backend contract.
