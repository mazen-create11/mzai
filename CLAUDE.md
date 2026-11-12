# MAZ (ex-MZai) — App chat IA premium (modèles chinois)

## ⛔ ON MODIFIE `src/`, JAMAIS `mzai-v2.html` (découpage du 12/11/2026)
- `mzai-v2.html` est le fichier publié, GÉNÉRÉ par `node build.mjs` depuis `src/app.html` + `src/css/*.css` + `src/js/*.js` (ordre et rôle de chaque fichier : listes en tête de `build.mjs`). Une modification faite à la main dans `mzai-v2.html` est écrasée au prochain assemblage.
- Après toute modification de `src/` : `node build.mjs`, puis `cd test-ui && npm test` (navigateur réel, faux serveur, aucune requête ne sort), puis commit de `src/` ET de `mzai-v2.html` ensemble. `node build.mjs --check` et les tests tournent aussi sur GitHub Actions.
- Les scripts partagent une seule portée globale et sont mis bout à bout : l'ordre de la liste compte, pas d'`import`.
- `index.html` n'est plus qu'une redirection vers `mzai-v2.html` (l'ancienne version reste dans l'historique git).
- Live : mazen-create11.github.io/mzai/mzai-v2.html · deploy = `git push origin main` (GitHub Pages).

## Règles
- `keys.local.js` = clés API réelles, gitignoré — jamais commité, copié ni affiché.
- DA « Encre & Crème » : crème + argile #B85335 · Fraunces + Hanken · logo MA blanc + Z argile. ⛔ Or et bleu REJETÉS.
- Garde-fous historiques intacts : préfixes `mzai:*`, `MZAI_KEYS`, `mzai.app`. Médias lourds → IndexedDB `maz-media` (réf `_mid`).
- SF_HOST = `https://api.siliconflow.com` (.cn = 401) · `max_tokens` adaptatif : 8192 si ctx ≥128k, sinon 4096 (voir `maxTok`, audit 12/07 — l'ancienne règle « 4096 toujours » est close).
- État : ~94-95/100 après audits 6 axes + audit 360 du 12/07 (`AUDIT-2026-07-12.md`), 0 P0/P1 — ne pas régresser. Reste ouvert : API-02, API-06, ARCH-03/04/05 (tests live ou refonte posée requis).
