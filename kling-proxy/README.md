# Proxy signeur JWT Kling — MAZ

Sort ta **clé secrète Kling** du navigateur. Le Worker signe le jeton côté serveur ; MAZ ne reçoit qu'un JWT de 30 min. Gratuit (plan free Cloudflare Workers : 100 000 requêtes/jour).

## Déploiement (5 min, une seule fois)

Depuis ce dossier (`~/Desktop/mzai/kling-proxy/`), tape dans le terminal avec `!` devant :

```bash
# 1. Connexion Cloudflare (ouvre le navigateur)
npx wrangler login

# 2. Poser les 2 clés Kling en secrets chiffrés (jamais dans le code)
npx wrangler secret put KLING_AK      # colle ton Access Key
npx wrangler secret put KLING_SK      # colle ton Secret Key

# 3. Déployer
npx wrangler deploy
```

`wrangler deploy` affiche l'URL publique, du type :
`https://maz-kling-proxy.<ton-sous-domaine>.workers.dev`

## Brancher MAZ dessus

Dans `keys.local.js`, ajoute la ligne `kling_proxy` avec l'URL du Worker :

```js
window.MZAI_KEYS = {
  openrouter: '...',
  siliconflow: '...',
  kling_proxy: 'https://maz-kling-proxy.<ton-sous-domaine>.workers.dev'
};
```

Une fois le proxy branché : **retire `kling_ak` et `kling_sk` du navigateur** (keys.local.js ET Réglages › Clés API de l'app). Elles ne servent plus que dans le Worker. C'est tout l'intérêt.

## Comment ça marche

- Sans `kling_proxy` → MAZ signe en local comme avant (repli, pour le dev). Rien ne casse.
- Avec `kling_proxy` → MAZ fait `POST` au Worker, reçoit `{token, exp}`, s'en sert pour appeler `api.klingai.com`. Le secret reste dans le Worker.

## Limite honnête

L'`ALLOWED_ORIGINS` bloque les **autres sites**, mais un client non-navigateur peut usurper l'en-tête `Origin`. Pour un usage perso c'est suffisant. Si tu ouvres MAZ à des inconnus, ajoute une vraie authentification (Cloudflare Access, ou un jeton par utilisateur) — voir les commentaires du `worker.js`.
