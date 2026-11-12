  /* Clés chargées depuis keys.local.js (gitignored) → "toujours connecté" en local,
     sans aucun secret dans index.html. Fichier absent (ex: hébergé) → saisie dans Paramètres. */
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
  // messages d'erreur propres pour l'utilisateur (le détail technique va en console) — un hoquet réseau ne doit pas ressembler à une app cassée
  function friendlyErr(e){const m=((e&&e.message)||String(e||'')).trim();try{console.warn('[MAZ]',e);}catch(_){}
    if(/Failed to fetch|NetworkError|Load failed|ERR_/i.test(m))return 'Connexion au service impossible — vérifie ta connexion et réessaie.';
    if(/ISO-8859-1|code point/i.test(m))return 'Clé API invalide (caractère non autorisé) — elle a été nettoyée, réessaie.';
    if(/Abort/i.test(m))return 'Requête annulée.';
    if(/timeout|délai|timed?.?out/i.test(m))return 'Le service met trop de temps à répondre — réessaie.';
    if(/quota|exceeded|insufficient|402|balance/i.test(m))return 'Crédit API épuisé côté serveur.';
    return m.length>160?m.slice(0,160)+'…':(m||'Erreur inconnue');}
  // Proxy actif dès qu'il n'y a PAS de fichier keys.local.js (= app hébergée), MÊME si l'utilisateur a saisi des clés dans Réglages : le proxy prime, ses clés sont ignorées. Le Worker fournit les vraies. En local (keys.local.js présent) → appels directs.
  const _keyFile=!!(window.MZAI_KEYS && ((window.MZAI_KEYS.openrouter||'').trim()||(window.MZAI_KEYS.siliconflow||'').trim()));
  const VIA_PROXY=!!PROXY_URL && !_keyFile;
  const SHOW_API_SETTINGS=!!window.MZAI_DEV_SETTINGS;
  if(VIA_PROXY){KEYS.openrouter='via-proxy';KEYS.siliconflow='via-proxy';}  // placeholders ASCII : le Worker remplace l'Authorization par la vraie clé
  const _PB=(PROXY_URL||'').replace(/\/$/,'');
  const OR_HOST=VIA_PROXY?_PB+'/or':'https://openrouter.ai';
  const SF_HOST=VIA_PROXY?_PB+'/sf':'https://api.siliconflow.com';

