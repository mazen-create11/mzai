  /* Clés et chemin des appels.
     Clés chargées depuis keys.local.js (gitignored) → "toujours connecté" en local,
     sans aucun secret dans index.html. Fichier absent (ex: hébergé) → les appels passent par le Worker.
     Module fermé : le magasin de clés n'est visible de personne. Le reste de l'app lit une clé
     par `Relais.cle(nom)` et l'écrit par `Relais.poserCle(nom,valeur)`, qui la nettoie et
     l'enregistre à chaque fois : aucune écriture ne peut plus oublier l'un des deux. */
  const Relais=(function(){
    if(!window.MZAI_KEYS)console.info('[MAZ] keys.local.js absent — ajoute tes clés API dans Réglages › Clés API (stockées uniquement sur cet appareil).');
    const DEFAULT_KEYS=Object.assign({openrouter:'',siliconflow:'',kling_ak:'',kling_sk:'',kling_proxy:''},window.MZAI_KEYS||{});
    const KEYS=Object.assign({},DEFAULT_KEYS,DB.get('apikeys',{}));
    Object.keys(DEFAULT_KEYS).forEach(k=>{if(DEFAULT_KEYS[k]&&!KEYS[k])KEYS[k]=DEFAULT_KEYS[k]});
    // Les clés fournies par keys.local.js restent EN MÉMOIRE : on ne les recopie pas dans localStorage (un XSS/CDN compromis ne peut pas les exfiltrer). Seules les clés saisies par l'utilisateur sont persistées.
    function persistKeys(){const o={};for(const k in KEYS){if(!(window.MZAI_KEYS&&window.MZAI_KEYS[k]))o[k]=KEYS[k]}DB.set('apikeys',o)}
    persistKeys();
    // ── Proxy API optionnel : app HÉBERGÉE + aucune clé locale + Worker configuré → les appels passent par lui
    //    (il détient les clés) → clés jamais exposées, marche pour tout le monde. En local (keys.local.js), appels directs. Voir maz-proxy/README.md.
    const PROXY_URL='https://maz-proxy.maz-chaban.workers.dev';   // Worker déployé (clés OpenRouter+SiliconFlow en secrets Cloudflare). En ligne sans clé locale → passe par lui.
    // une clé mal collée (espace, retour à la ligne, caractère non-ASCII) casserait l'en-tête HTTP (« non ISO-8859-1 ») → on ne garde que l'ASCII imprimable. Appliqué au boot ET à chaque saisie.
    const cleanKey=v=>(typeof v==='string'?v:'').replace(/[^\x21-\x7E]/g,'');
    ['openrouter','siliconflow','kling_ak','kling_sk'].forEach(k=>{KEYS[k]=cleanKey(KEYS[k]);});
    // Proxy actif dès qu'il n'y a PAS de fichier keys.local.js (= app hébergée), MÊME si l'utilisateur a saisi des clés dans Réglages : le proxy prime, ses clés sont ignorées. Le Worker fournit les vraies. En local (keys.local.js présent) → appels directs.
    const _keyFile=!!(window.MZAI_KEYS && ((window.MZAI_KEYS.openrouter||'').trim()||(window.MZAI_KEYS.siliconflow||'').trim()));
    const VIA_PROXY=!!PROXY_URL && !_keyFile;
    if(VIA_PROXY){KEYS.openrouter='via-proxy';KEYS.siliconflow='via-proxy';}  // placeholders ASCII : le Worker remplace l'Authorization par la vraie clé
    const _PB=(PROXY_URL||'').replace(/\/$/,'');
    return Object.freeze({
      viaProxy:VIA_PROXY,                       // vrai : tout passe par le Worker, qui détient les clés
      base:_PB,                                 // adresse du Worker (comptes, synchro, agents)
      orHost:VIA_PROXY?_PB+'/or':'https://openrouter.ai',
      sfHost:VIA_PROXY?_PB+'/sf':'https://api.siliconflow.com',
      showApiSettings:!!window.MZAI_DEV_SETTINGS,   // saisie des clés visible dans les réglages
      cle:nom=>Object.prototype.hasOwnProperty.call(KEYS,nom)&&typeof KEYS[nom]==='string'?KEYS[nom]:'',
      poserCle(nom,valeur){KEYS[String(nom)]=cleanKey(valeur);persistKeys()},
      nettoyerCle:cleanKey,
    });
  })();

