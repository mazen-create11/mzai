# MAZ — Proxy API (clés jamais exposées)

But : l'app MAZ hébergée marche pour tes collègues **sans qu'ils tapent de clé**, et **sans que ta clé soit visible** dans le code public. Le Worker détient les clés et relaie les appels vers OpenRouter + SiliconFlow.

## Déploiement (une fois, ~5 min)

```bash
cd ~/Desktop/mzai/maz-proxy

# 1. Connexion Cloudflare (crée un compte gratuit si besoin, s'ouvre dans le navigateur)
npx wrangler login

# 2. Poser les clés en SECRETS (chiffrées, jamais dans le code) — colle la valeur quand c'est demandé
npx wrangler secret put OPENROUTER_KEY      # ta clé sk-or-v1-…
npx wrangler secret put SILICONFLOW_KEY     # ta clé sk-…

# 3. Déployer
npx wrangler deploy
```

À la fin, wrangler affiche l'URL du Worker, du type :
```
https://maz-proxy.TON-COMPTE.workers.dev
```

## Brancher l'app dessus

Copie cette URL et colle-la dans `mzai-v2.html`, ligne `const PROXY_URL='';` :
```js
const PROXY_URL='https://maz-proxy.TON-COMPTE.workers.dev';
```
Puis `git push`. C'est tout — l'app en ligne route désormais par le proxy, clés invisibles, et **tes collègues n'ont rien à configurer**.

En local (toi, avec `keys.local.js`), rien ne change : l'app utilise tes clés en direct (le proxy ne sert qu'en ligne, quand aucune clé locale n'est présente).

## Ce qui passe par le proxy

- Texte / chat / raisonnement / recherche web (OpenRouter)
- Image (SiliconFlow — FLUX, Qwen-Image, Z-Image)
- Vidéo Wan, voix CosyVoice, transcription (SiliconFlow)

La **vidéo Kling** garde son propre proxy (`../kling-proxy/`, signature JWT différente).

## Sécurité & abus

- Seules les origines de `ALLOWED_ORIGINS` (wrangler.toml) peuvent appeler le proxy → bloque les autres sites web.
- Ce n'est pas une auth par utilisateur : quelqu'un qui a le lookien de l'app peut consommer tes crédits. Tu as dit assumer le coût — OK pour des collègues.
- **Pour durcir** si besoin : pose un code d'accès partagé
  ```bash
  npx wrangler secret put MAZ_PASS
  ```
  puis décommente le bloc `MAZ_PASS` dans `worker.js` et ajoute l'en-tête `X-Maz-Pass` côté app (je peux le câbler sur demande).
- Surveille la conso sur les dashboards OpenRouter / SiliconFlow ; mets un plafond de dépense si dispo.
