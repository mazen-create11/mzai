# MAZ — Backend (proxy + comptes + sync + médias)

Worker : **https://maz-proxy.maz-chaban.workers.dev** · D1 `maz-db` · KV `MEDIA`

## Ce que ça fait

- **Clés API invisibles** : OpenRouter + SiliconFlow en secrets serveur ; le navigateur ne les voit jamais.
- **Un code d'accès par personne** : l'app en ligne demande le code une fois ; sans code valide, le proxy refuse tout (`REQUIRE_CODE=true`).
- **Historique qui suit chacun** : conversations synchronisées en D1, isolées par compte, sur tous ses appareils.
- **Médias permanents** : images/vidéos/voix générées rapatriées côté serveur en KV — plus jamais d'URL expirée.
- **Conso par compte** : requêtes/jour (serveur) + tokens/coût (rapportés) — prêt pour la facturation.

Les codes sont stockés **hashés** (SHA-256, ~80 bits d'entropie). Un dump de la base ne révèle aucun code.

## Créer un code pour un nouveau collègue/client

```bash
cd ~/Desktop/mzai/maz-proxy
# ADMIN_KEY est dans CODES.local.md (gitignoré)
curl -s -X POST https://maz-proxy.maz-chaban.workers.dev/admin/user \
  -H "X-Admin-Key: $ADMIN_KEY" -H "Content-Type: application/json" \
  -d '{"name":"Prénom Client"}'
# → renvoie {"code":"maz-XXXX-…"} — montré UNE SEULE FOIS : note-le dans CODES.local.md
```
(Si curl a un souci TLS sur ce Mac, la même requête marche depuis la console du navigateur sur la page de l'app.)

## Gérer

```bash
# lister les comptes + conso
curl -s https://maz-proxy.maz-chaban.workers.dev/admin/users -H "X-Admin-Key: $ADMIN_KEY"
# révoquer un accès (le code cesse de marcher immédiatement)
curl -s -X POST https://maz-proxy.maz-chaban.workers.dev/admin/disable \
  -H "X-Admin-Key: $ADMIN_KEY" -H "Content-Type: application/json" -d '{"id":"<uid>"}'
```

## Redéployer après modification

```bash
cd ~/Desktop/mzai/maz-proxy && npx wrangler deploy
```

## Quand le volume grossit

- **KV → R2** : KV gratuit ≈ 1 Go de médias. Au-delà : activer R2 dans le dashboard Cloudflare (1 clic), `wrangler r2 bucket create maz-media`, remplacer le binding — l'interface du Worker ne change pas.
- **D1** : 5 Go gratuits ≈ des années d'historique texte.

## Limites connues (v1, assumées)

- Les **pièces jointes** uploadées par l'utilisateur (PDF, images sources) restent locales à l'appareil — le texte de la conversation se synchronise, pas le fichier source.
- Sync **last-write-wins** par conversation : éditer la même conversation sur 2 appareils en même temps garde la version la plus récente.
- La vidéo **Kling** a son propre proxy (`../kling-proxy/`, non déployé — modèles masqués dans l'app tant que non configuré).
