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
| `index.html` | A redirect to `mzai-v2.html`. |
| `AUDIT-2026-07-12.md`, `FIXES-2026-07-12.md` | A full audit of the app and the log of what was fixed, with what was left open and why. |

## How it works

**Keys stay on the server.** In the deployed app the Worker holds the provider keys as secrets. For the two providers the browser talks to, it relays only `POST` requests on an allow-list of paths (`CHEMINS_OK` in `worker.js`), and only for a model on the allow-list: the model is read from the JSON body or from the multipart form, a body it cannot read is refused, and the fields through which a provider accepts alternative models are refused too. Mistral, which runs the agents, is never relayed: only the Worker calls it. All accounts share one provider key, so a browser route to it would expose every account's agent conversations.

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

No dependency to install: the tests use Node's built-in runner (Node 20 or later) and call the Worker's handlers directly, with an in-memory stand-in for the database and for the providers. 46 tests cover:

- access control: personal codes (format, hashing, case, revocation), admin routes, rules for custom codes, account deletion, the origin check;
- the provider relay: which paths, methods and models pass, which key leaves the server, that an uploaded file is relayed byte for byte, and that every model the app sends is on the server's list;
- the scheduler: one job with an unreadable time zone does not stop the others, and jobs of a revoked account no longer run;
- job settings: budget, automatic writes, time zone and schedule are checked before anything is written, and a job cannot be attached to another account's resources;
- sync: updating a conversation at the 400 limit no longer evicts another one.

## Known limits

- Files attached by the user (PDFs, source images) stay on the device. The text of the conversation syncs, the source file does not.
- Sync is last-write-wins: editing the same conversation on two devices at once keeps the most recent version.
- The app is a single 6,000-line file. It works, and it is the main thing to break up.

## What is next

- **A stricter schedule parser.** An unreadable field in a cron expression is read as "every", so a typo can turn a weekly job into one that runs every minute. Only the wrong number of fields is refused today.
- **Deleted conversations still count toward the 400 limit**, and the sync list is not paginated. Both need one rule for purging deleted rows.
- **Abort in-flight media requests** (API-06). The Stop button stops the interface and the polling, but the request to the provider keeps running and keeps billing.
- **Remove duplicated code** (ARCH-04/05). The message bubble is rendered in four places and the chat request is written out four times although one helper already exists.
- **Split `worker.js` and `mzai-v2.html`** into modules, now that tests protect the backend contract.

## How this is built

I build this project with an AI coding assistant (Claude Code). Most commits are co-authored with it, and `CLAUDE.md` holds the standing instructions I give it. I decide what gets built and why, read what it produces, and test it in the running app. The audit and fix logs in this repository were produced with the assistant as well.

## License

All rights reserved. The code is public to be read and reviewed; see [`LICENSE`](LICENSE).
