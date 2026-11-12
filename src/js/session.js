  if(VIA_PROXY)(async()=>{
    const saved=_acode();
    if(saved){try{const r=await fetch(_PB+'/auth/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:saved})});
      if(r.ok){onAuthed(await r.json());return}
      if(r.status===401){try{localStorage.removeItem('mzai:acode')}catch(e){}}   // code révoqué → on redemande
      else{CLOUD_ON=false;toast&&toast('Service momentanément indisponible — mode hors-ligne');return}   // 5xx : le code est connu, on laisse l'app en local (pas de mur), la sync reprendra
    }catch(e){CLOUD_ON=false;toast&&toast('Hors-ligne — tes conversations locales restent accessibles');return}   // panne réseau + code déjà validé : accès local dégradé, jamais le mur d'entrée
    }
    _gateEl();
  })();
  /* Le profil par défaut ne porte plus l'identité de Mazen : sur un navigateur
     neuf, un invité qui entrait son code voyait « Mazen » et l'adresse mail de
     Mazen dans SON profil tant que le serveur n'avait pas répondu. Le vrai nom
     arrive de /auth/verify (onAuthed), le reste se règle dans Profil. */
  const USER=DB.get('user',{name:'',email:'',role:'Espace privé',avColor:ARGILE_AV});
  if(/#7fa9dc|#5e86c9|#6ba3ff|#b6c4d8|#6b7e97|#2c4a8f|#d08b5c|#a85e2e|#b85335|#9e4a2b|#a4472b|#c76b4a/i.test(USER.avColor||'')){USER.avColor=ARGILE_AV;DB.set('user',USER)}   /* migration : avatars bleus ET argile hérités → émeraude Damas */
  const firstName=()=>(USER.name||'').trim().split(' ')[0];
  const modelById=id=>MODELS.find(m=>m.id===id)||MODELS[0];
  {const _bm=modelById(currentModel);if(_bm&&/image|video|audio/.test(_bm.kind||''))currentModel='MAZ Auto';}  // au boot on démarre en conversation texte : un modèle média persisté (FLUX/Wan/voix) retombe sur l'assistant, sinon le 1er message texte partirait en réponse simulée
  const VISION_DOC='qwen/qwen3-vl-8b-instruct';  // modèle vision OpenRouter (OCR docs scannés / photos en mode Documents)
  function injCap(id){const ctx=(modelById(id).ctx||'').toLowerCase();  // budget de caractères injectés dérivé de la fenêtre de contexte du modèle
    return (ctx.includes('m')||ctx.includes('auto'))?400000:parseInt(ctx)>=256?240000:parseInt(ctx)>=128?140000:60000;}
  const provOf=m=>PROVIDERS[(typeof m==='string'?modelById(m):m||{}).provider||'mz'];
  const acOf=m=>provOf(m).ac;
  const hasKey=p=>p==='mz'||(p==='kling'?(!!(KEYS.kling_ak&&KEYS.kling_ak.trim())&&!!(KEYS.kling_sk&&KEYS.kling_sk.trim())):!!(KEYS[p]&&KEYS[p].trim()));
  const klingUsable=()=>hasKey('kling')||!!(KEYS.kling_proxy&&KEYS.kling_proxy.trim());   // Kling ne marche qu'avec ses 2 clés OU son proxy → sinon on masque ses modèles (pas de menu mort)

  const LIC={chat:'<path d="M21 11.5a8.5 8.5 0 0 1-12.5 7.5L3 21l2-5.5A8.5 8.5 0 1 1 21 11.5z"/>',code:'<path d="m8 6-6 6 6 6M16 6l6 6-6 6"/>',doc:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',img:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>'};
  /* jeu d'icônes vectorielles (remplace les emojis) */
  const GLYPH={
    spark:'<path d="M12 2.5l2.4 6.1 6.1 2.4-6.1 2.4L12 19.5l-2.4-6.1L3.5 11l6.1-2.4z"/>',
    bolt:'<path d="M13 2 4 14h6l-1 8 9-12h-6z"/>',
    target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.6"/>',
    bag:'<path d="M6 8h12l-1 12H7z"/><path d="M9 8a3 3 0 0 1 6 0"/>',
    drive:'<path d="M3 8a2 2 0 0 1 2-2h3.5l2 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    branch:'<circle cx="6.5" cy="6" r="2.2"/><circle cx="6.5" cy="18" r="2.2"/><circle cx="17.5" cy="8" r="2.2"/><path d="M6.5 8.2v7.6M17.5 10.2c0 4.3-7 1.8-7 5.6"/>',
    figma:'<rect x="8" y="2.5" width="5" height="6" rx="2.5"/><rect x="8" y="8.5" width="5" height="6" rx="2.5"/><rect x="8" y="14.5" width="5" height="6" rx="2.5"/><circle cx="15.5" cy="11.5" r="2.7"/>',
    note:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
    hash:'<path d="M9 3 7 21M17 3l-2 18M4 8.5h16M3 15.5h16"/>',
    code:'<path d="M16 18l6-6-6-6M8 6l-6 6 6 6"/>',
    search:'<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/>',
    pen:'<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>',
    chart:'<path d="M18 20V10M12 20V4M6 20v-6"/>',
    user:'<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    chip:'<rect x="7" y="7" width="10" height="10" rx="2"/><path d="M10 2v3M14 2v3M10 19v3M14 19v3M2 10h3M2 14h3M19 10h3M19 14h3"/>',
    keyboard:'<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M11 10h.01M15 10h.01M8 14h8"/>',
    import:'<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
    export:'<path d="M12 21V9M7 14l5-5 5 5M5 3h14"/>',
    shield:'<path d="M12 3 5 6v6c0 4 3 6.5 7 9 4-2.5 7-5 7-9V6z"/>',
    core:'<path d="M12 2.5l2.4 6.1 6.1 2.4-6.1 2.4L12 19.5l-2.4-6.1L3.5 11l6.1-2.4z"/>',
    atom:'<circle cx="12" cy="12" r="2"/><ellipse cx="12" cy="12" rx="10" ry="4.2"/><ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(120 12 12)"/>',
    globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/>',
    eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
    brain:'<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>',
    persona:'<path d="M12 2a5 5 0 0 1 5 5c0 1.6-.7 2.6-1.5 3.5C16.3 11.4 18 12.5 18 15a6 6 0 0 1-12 0c0-2.5 1.7-3.6 2.5-4.5C7.7 9.6 7 8.6 7 7a5 5 0 0 1 5-5z"/><path d="M9.5 8.5h.01M14.5 8.5h.01"/>',
    sliders:'<path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    wand:'<path d="M15 4V2M15 10V8M11 6H9M21 6h-2M18 9l-1.5-1.5M18 3l-1.5 1.5M4 20l9-9M13.5 7.5l3 3"/>',
    code:'<path d="m9 8-4 4 4 4M15 8l4 4-4 4M13.5 6l-3 12"/>',
    card:'<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 9.5h19M6 14.5h4"/>',
    mail:'<rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/><path d="M3 6.5l9 6.5 9-6.5"/>',
    pin:'<path d="M9 4h6l-1 6 3 3v2H7v-2l3-3-1-6zM12 15v5"/>',
    tag:'<path d="M3 11.5V5a2 2 0 0 1 2-2h6.5L21 12.5a2 2 0 0 1 0 2.8l-5.7 5.7a2 2 0 0 1-2.8 0L3 11.5z"/><circle cx="7.5" cy="7.5" r="1.3"/>',
    trash:'<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
    restore:'<path d="M3 12a9 9 0 1 0 3-6.7M3 4v4h4"/>',
    help:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.6"/><path d="M5.6 5.6l3.9 3.9M14.5 14.5l3.9 3.9M18.4 5.6l-3.9 3.9M9.5 14.5l-3.9 3.9"/>'
  };

