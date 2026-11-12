# MAZ

[![tests](https://github.com/mazen-create11/mzai/actions/workflows/tests.yml/badge.svg)](https://github.com/mazen-create11/mzai/actions/workflows/tests.yml)

A chat app that puts several AI models behind one interface, with a small backend that keeps the API keys on the server, syncs conversations across devices and runs scheduled AI agents whose final write step waits for approval by default.

Live app: https://mazen-create11.github.io/mzai/mzai-v2.html (an access code is required).

## What is in this repository

| Path | What it is |
|---|---|
| `src/` | The app's sources: `app.html` (the markup), 13 style sheets in `css/`, 26 scripts in `js/`, each named after the part of the app it holds. |
| `build.mjs` | Assembles `src/` into `mzai-v2.html`. About a hundred lines of Node, no dependency. The two lists at the top give the order and say what each file is. |
| `mzai-v2.html` | The app as published: one self-contained file with chat, model picker, image/video/voice generation, agents screen and settings. Generated, never edited by hand. Served by GitHub Pages. |
| `test-ui/` | Tests that drive the app in a real browser, against a stand-in for the backend. |
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

Frontend: edit the files in `src/`, run `node build.mjs`, then serve the folder with any static server. The backend only answers the origins listed in `ALLOWED_ORIGINS` (`maz-proxy/wrangler.toml`), so add yours there.

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

Both suites run on every push (see the badge above).

### Backend

```bash
cd maz-proxy
npm test
```

No dependency to install: the tests use Node's built-in runner (Node 20 or later) and call the Worker's handlers directly, with an in-memory stand-in for the database and for the providers. 65 tests cover:

- access control: personal codes (format, hashing, case, revocation), admin routes, rules for custom codes, account deletion, the origin check;
- the provider relay: which paths, methods and models pass, which key leaves the server, that an uploaded file is relayed byte for byte, and that every model the app sends is on the server's list;
- the schedule parser: every schedule the app offers keeps its exact next run, an unreadable or out-of-range field refuses the whole expression, and `7` means Sunday;
- the scheduler: one job with an unreadable time zone or schedule is paused and logged without stopping the others, and jobs of a revoked account no longer run;
- job settings: budget, automatic writes, time zone and schedule are checked before anything is written, and a job cannot be attached to another account's resources;
- sync: only live conversations count toward the 400 limit, updating one never evicts another, deletion markers are capped, and the list always returns every live conversation.

### Interface

```bash
cd test-ui
npm install
npx playwright install chromium   # once
npm test
```

23 tests. Eighteen open the published file in a headless browser and use it like a person would:

- the access gate: a wrong code, the right one, a code revoked in the meantime;
- the conversation: sending a message, switching model, a conversation that comes back after a reload, one that arrives from another device and one that was deleted there;
- attachments: a text file, a DOCX and an XLSX built by the test are read in the browser and sent with the question, a damaged archive is reported instead of breaking the app;
- the agents screen: it lists the account's jobs, a launched job stops at its checkpoint, and nothing is sent to the server but the decision the person clicks, approve or refuse.

No request leaves the machine: a stand-in answers for the backend, and a test fails on any JavaScript error. PDF reading is not covered, since it loads a library from a CDN. The five remaining tests check the assembly: `mzai-v2.html` is byte for byte what `src/` produces, every source file is assembled exactly once, and no file was cut in the middle of a statement or a rule.

## Known limits

- Files attached by the user (PDFs, source images) stay on the device. The text of the conversation syncs, the source file does not.
- A file in a format the browser cannot read (anything but text, DOCX, XLSX and PDF) shows in the message but is not mentioned to the model, which then answers as if nothing was attached.
- Sync is last-write-wins: editing the same conversation on two devices at once keeps the most recent version.
- A deleted conversation leaves a marker so other devices drop their copy. The 400 most recent markers are kept per account; a device that stayed offline through more deletions than that would bring an old conversation back.
- Schedules are five-field cron with numbers only (no `MON` or `JAN`). When both day-of-month and day-of-week are set, both must match, where classic cron accepts either.
- The app ships as one file on purpose (it also opens from disk, without a server), and its sources are split by area. But the scripts are joined end to end in a fixed order and share one global scope. Two of the 26 are closed modules that expose a small interface and hide the rest (`atelier.js`, `fichiers.js`); the other 24 are still plain files.

## What is next

- **Paginate the sync list.** It returns up to 400 conversations and 400 deletion markers in one response.
- **Make the 400 limit atomic.** Two devices writing at the same instant can leave 401 conversations.
- **Abort in-flight media requests** (API-06). The Stop button stops the interface and the polling, but the request to the provider keeps running and keeps billing.
- **Remove duplicated code** (ARCH-04/05). The message bubble is rendered in four places and the chat request is written out four times although one helper already exists.
- **Close the remaining scripts one by one**, the way `fichiers.js` was: a test first, then one public interface per file. `import` statements would need a bundler, which the single-file build does without so far. Split `worker.js` the same way.

## How this is built

I build this project with an AI coding assistant (Claude Code). Most commits are co-authored with it, and `CLAUDE.md` holds the standing instructions I give it. I decide what gets built and why, read what it produces, and test it in the running app. The audit and fix logs in this repository were produced with the assistant as well.

## License

All rights reserved. The code is public to be read and reviewed; see [`LICENSE`](LICENSE).
