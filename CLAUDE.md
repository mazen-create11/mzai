# MAZ (ex-MZai) — App chat IA premium (modèles chinois)

## ⛔ FICHIER ACTIF = `mzai-v2.html` — `index.html` est l'ANCIENNE version : ne JAMAIS l'éditer.
- Live : mazen-create11.github.io/mzai/mzai-v2.html · deploy = `git push origin main` (GitHub Pages).

## Règles
- `keys.local.js` = clés API réelles, gitignoré — jamais commité, copié ni affiché.
- DA « Encre & Crème » : crème + argile #B85335 · Fraunces + Hanken · logo MA blanc + Z argile. ⛔ Or et bleu REJETÉS.
- Garde-fous historiques intacts : préfixes `mzai:*`, `MZAI_KEYS`, `mzai.app`. Médias lourds → IndexedDB `maz-media` (réf `_mid`).
- SF_HOST = `https://api.siliconflow.com` (.cn = 401) · `max_tokens` adaptatif : 8192 si ctx ≥128k, sinon 4096 (voir `maxTok`, audit 12/07 — l'ancienne règle « 4096 toujours » est close).
- État : ~94-95/100 après audits 6 axes + audit 360 du 12/07 (`AUDIT-2026-07-12.md`), 0 P0/P1 — ne pas régresser. Reste ouvert : API-02, API-06, ARCH-03/04/05 (tests live ou refonte posée requis).
