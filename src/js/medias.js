  /* ===== helpers media ===== */
  async function blobToB64(blobUrl){const r=await fetch(blobUrl),b=await r.blob();return new Promise((res,rej)=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.onerror=rej;fr.readAsDataURL(b)})}
  let _kJwt=null,_kExp=0,_kKeys='';   // cache du JWT Kling (valide 30min) — évite 40-80 signatures crypto par vidéo
  async function klingJWT(){
    const proxy=(Relais.cle('kling_proxy')||'').trim();
    const now=Math.floor(Date.now()/1000);
    if(proxy){   // signature côté serveur (Cloudflare Worker) : la clé secrète ne touche JAMAIS le navigateur
      if(_kJwt && _kKeys==='px:'+proxy && _kExp-now>120) return _kJwt;
      const r=await fetch(proxy,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
      if(!r.ok)throw new Error('Proxy Kling indisponible ('+r.status+')');
      const d=await r.json();
      if(!d||!d.token)throw new Error('Proxy Kling : réponse invalide');
      _kJwt=d.token;_kExp=d.exp||(now+1800);_kKeys='px:'+proxy;
      return _kJwt;
    }
    const ak=Relais.cle('kling_ak')||'',sk=Relais.cle('kling_sk')||'';
    if(!ak||!sk)throw new Error('Clés Kling manquantes — configure Access Key + Secret Key dans Paramètres › Connexions API (kling.ai), ou renseigne kling_proxy (recommandé).');
    if(_kJwt && _kKeys===ak+'|'+sk && _kExp-now>120) return _kJwt;   // réutilise tant qu'il reste >2min
    const b64u=obj=>btoa(JSON.stringify(obj)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    const exp=now+1800;
    const hdr=b64u({alg:'HS256',typ:'JWT'}),pay=b64u({iss:ak,exp,nbf:now-5}),data=hdr+'.'+pay;
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(sk),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    const sig=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(data));
    const tok=data+'.'+btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    _kJwt=tok;_kExp=exp;_kKeys=ak+'|'+sk;
    return tok;
  }
  /* ===== génération média (image / vidéo) ===== */
  let mediaUID=0;
  function hashColors(str){let h=0;for(let i=0;i<str.length;i++)h=(h*31+str.charCodeAt(i))>>>0;const hue=h%360;return[`hsl(${hue} 78% 62%)`,`hsl(${(hue+38)%360} 72% 46%)`,`hsl(${(hue+205)%360} 68% 52%)`,`hsl(${(hue+150)%360} 70% 40%)`]}
  /* ===== médias lourds (audio voix) → IndexedDB, hors localStorage ~5 Mo ===== */
  const MEDIA=(()=>{
    let p=null;const cache=new Map();const CAP=16;   // cache RAM borné (LRU) : la persistance reste en IndexedDB, on ne garde que les derniers blobs en mémoire
    function keep(k,v){cache.delete(k);cache.set(k,v);while(cache.size>CAP)cache.delete(cache.keys().next().value);}
    function db(){if(p)return p;p=new Promise((res,rej)=>{let r;try{r=indexedDB.open('maz-media',1)}catch(e){return rej(e)}r.onupgradeneeded=()=>{try{r.result.createObjectStore('m')}catch(e){}};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});return p;}
    async function st(mode){const d=await db();return d.transaction('m',mode).objectStore('m');}
    return {cache,
      async put(k,v){keep(k,v);try{const s=await st('readwrite');return await new Promise(res=>{const q=s.put(v,k);q.onsuccess=()=>res(true);q.onerror=()=>res(false)})}catch(e){return false}},
      async get(k){if(cache.has(k)){const v=cache.get(k);keep(k,v);return v;}try{const s=await st('readonly');const v=await new Promise(res=>{const q=s.get(k);q.onsuccess=()=>res(q.result||null);q.onerror=()=>res(null)});if(v)keep(k,v);return v;}catch(e){return null}},
      async del(k){cache.delete(k);try{const s=await st('readwrite');s.delete(k)}catch(e){}},
      async clear(){cache.clear();try{const s=await st('readwrite');s.clear()}catch(e){}}};
  })();
  function hydrateMedia(scope){(scope||document).querySelectorAll('[data-mid]').forEach(el=>{if(el.dataset._hy)return;el.dataset._hy='1';MEDIA.get(el.dataset.mid).then(u=>{if(u)el.src=u})});}
  async function stashRemoteMedia(media){   // le média généré (URL de livraison qui expire en ~2 min) est rapatrié PAR LE SERVEUR dans le stockage permanent → suit l'utilisateur sur tous ses appareils, pour toujours
    if(!media||!media.url||media.r2||/^data:/.test(media.url)||!Relais.viaProxy)return;
    try{
      const r=await fetch(Relais.base+'/media/stash',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:media.url})});
      if(!r.ok)return;
      const d=await r.json();
      if(d.mid){media.r2=d.mid;saveConvos();}   // mediaBubbleHTML sert /media/<r2> (permanent) en priorité sur l'URL expirante
    }catch(e){/* best-effort : on garde l'URL distante */}
  }
  function mediaBubbleHTML(m){
    const badge=`<span class="gm-badge"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">${GLYPH.spark}</svg>${esc(m.model||currentModel)}</span>`;
    const acts=`<div class="gm-acts"><span class="gm-b" data-gm="dl"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GLYPH.import}</svg>Télécharger</span><span class="gm-b" data-gm="regen"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7M21 4v4h-4"/></svg>Régénérer</span></div>`;
    if(m.type==='audio'){
      return `<div class="gen-audio"><span class="ga-ic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14"/></svg></span><audio controls ${m.mid?`data-mid="${esc(m.mid)}"`:''} src="${esc(m.r2?Relais.base+'/media/'+encodeURIComponent(m.r2):safeMediaUrl(m.url))}"></audio></div><div class="gm-cap">« ${esc(m.prompt)} »</div>${acts}`;
    }
    const vid=m.type==='video';
    let art;
    const demo=(!m.url&&!m.mid&&!m.r2)?'<span class="gm-demo">Démo — ajoute ta clé pour générer</span>':'';
    const _md=m.mid?`data-mid="${esc(m.mid)}"`:'';const _src=m.r2?Relais.base+'/media/'+encodeURIComponent(m.r2):safeMediaUrl(m.url);   // r2 = stockage permanent (prioritaire) ; sinon URL fournisseur ; data-mid = repli IndexedDB local
    if(vid&&(_src||m.mid)) art=`<video class="gm-art" ${_md} ${_src?`src="${esc(_src)}"`:''} controls playsinline style="width:100%;height:100%;object-fit:cover;background:#000"></video>`;
    else if(_src||m.mid) art=`<img ${_md} ${_src?`src="${esc(_src)}"`:''} alt="${esc(m.prompt||'Image générée')}" loading="lazy" decoding="async" class="gm-art" style="width:100%;height:100%;object-fit:cover">`;
    else{const [a,b,d,e]=hashColors(m.prompt+'·'+(m.seed||0)),uid='gm'+(mediaUID++);art=`<svg class="gm-art" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice"><defs><radialGradient id="${uid}" cx="32%" cy="28%" r="90%"><stop offset="0%" stop-color="${a}"/><stop offset="100%" stop-color="${b}"/></radialGradient></defs><rect width="100" height="100" fill="url(#${uid})"/><circle cx="74" cy="66" r="42" fill="${d}" opacity=".5"/><circle cx="22" cy="82" r="30" fill="${e}" opacity=".45"/><circle cx="58" cy="30" r="16" fill="${a}" opacity=".5"/></svg><div class="gm-grain"></div>`}
    return `<div class="gen-media ${vid?'vid':'img'}">${art}${badge}${demo}</div><div class="gm-cap">« ${esc(m.prompt)} »</div>${acts}`;
  }
  function wireMedia(bubble,m,node){
    bubble.querySelector('.gm-play')&&bubble.querySelector('.gm-play').addEventListener('click',()=>toast('Lecture de la vidéo (aperçu)'));
    bubble.querySelector('[data-gm=dl]').addEventListener('click',()=>{const dl=(href)=>{const ext=m.type==='video'?'mp4':m.type==='audio'?'mp3':'png';const a=document.createElement('a');a.href=href;a.download='maz-'+m.type+'-'+(m.seed||'')+'.'+ext;a.target='_blank';a.click();toast('Téléchargement')};if(m.r2){dl(Relais.base+'/media/'+encodeURIComponent(m.r2));return;}if(m.url){dl(m.url);return;}if(m.mid){MEDIA.get(m.mid).then(u=>u?dl(u):toast('Audio indisponible'));return;}const svg=bubble.querySelector('.gm-art');if(!svg)return;const s=new XMLSerializer().serializeToString(svg),blob=new Blob([s],{type:'image/svg+xml'}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='mzai-'+m.type+'-'+m.seed+'.svg';a.click();URL.revokeObjectURL(u);toast('Visuel téléchargé')});
    bubble.querySelector('[data-gm=regen]').addEventListener('click',()=>{if(generating)return;const c=convoById(activeId);if(!c)return;for(let k=c.msgs.length-1;k>=0;k--){if(c.msgs[k].role==='ai'){c.msgs.splice(k,1);break}}node&&node.remove();if(m.type==='audio')genVoice(c,m.prompt);else genMedia(c,m.prompt,m.type)});
  }
  async function genMedia(c,promptText,type){
    setGenerating(true);showView('chat');
    const model=currentModel,node=addAINode(model),bubble=node.querySelector('.bubble');
    bubble.innerHTML='<div class="gen-loading"><div class="gl-ring"></div>'+(type==='video'?'Génération de la vidéo…':'Génération de l\'image…')+'</div>';
    let done=false;
    curStop=()=>{done=true;node.remove();setGenerating(false);curStop=null};
    
    const place=(media)=>{bubble.classList.add('media-b');bubble.innerHTML=mediaBubbleHTML(media);wireMedia(bubble,media,node);c.msgs.push({role:'ai',media,model});c.ts=now();saveConvos();renderRecents();setGenerating(false);curStop=null;scrollDown();stashRemoteMedia(media);};   // rapatrie en IndexedDB (survit à l'expiration de l'URL)
    const seed=()=>Math.floor(performance.now()*1000)%99999;
    const H={'Authorization':'Bearer '+Relais.cle('siliconflow'),'Content-Type':'application/json'};
    try {
      const mm=modelById(model);
      // Image source = b64 persistant du dernier message user (ATTACH est déjà vidé/révoqué par send())
      const _lu=[...c.msgs].reverse().find(m=>m.role==='user');
      const srcImgB64=(_lu&&(_lu.files||[]).find(f=>f.isImg&&f.b64)||{}).b64||null;
      if(type==='image' && hasKey('siliconflow')){
        const imgModel=(mm.provider==='siliconflow'&&mm.kind==='image')?mm.api:'Qwen/Qwen-Image';
        const body={model:imgModel,prompt:promptText,image_size:'1024x1024',batch_size:1};
        if(mm.editImg){if(srcImgB64){body.image=srcImgB64}else throw new Error('Ce modèle édite une image existante.\nAttache une image source via le trombone 📎 avant de générer.')}
        const res = await fetch(Relais.sfHost+'/v1/images/generations',{method:'POST',headers:H,body:JSON.stringify(body)});
        if(!res.ok) throw new Error('HTTP '+res.status+' · '+(await res.text().catch(()=>'')).slice(0,200));
        const data = await res.json();const url = data.images?.[0]?.url || data.data?.[0]?.url;
        if(!url) throw new Error("Aucune image renvoyée par l'API");
        if(done)return;place({type,prompt:promptText,seed:seed(),model:imgModel.split('/').pop(),url});return;
      }
      if(type==='video' && mm.provider==='kling'){
        if(!hasKey('kling'))throw new Error('Clés Kling manquantes — configure Access Key + Secret Key dans Paramètres › Connexions API (inscription gratuite sur kling.ai)');
        if(mm.needImg && !srcImgB64)throw new Error('Kling I2V nécessite une image source.\nAttache une image via le trombone 📎');
        const jwt=await klingJWT();
        const kH={'Authorization':'Bearer '+jwt,'Content-Type':'application/json'};
        const isI2V=mm.needImg;
        const kBody={model_name:mm.api,prompt:promptText,duration:'5',aspect_ratio:'16:9',mode:'std'};
        if(isI2V){kBody.image=srcImgB64.replace(/^data:[^,]+,/,'')}   // Kling attend du base64 brut, sans préfixe data:
        const kUrl='https://api.klingai.com/v1/videos/'+(isI2V?'image2video':'text2video');
        const sub=await fetch(kUrl,{method:'POST',headers:kH,body:JSON.stringify(kBody)});
        if(!sub.ok)throw new Error('Kling HTTP '+sub.status+' · '+(await sub.text().catch(()=>'')).slice(0,200));
        const sj=await sub.json();
        const taskId=sj.data?.task_id;if(!taskId)throw new Error('Kling: pas de task_id → '+JSON.stringify(sj).slice(0,200));
        let url=null;
        for(let i=0;i<120 && !done;i++){
          await new Promise(r=>setTimeout(r,3000));if(done)return;
          bubble.innerHTML='<div class="gen-loading"><div class="gl-ring"></div>Kling génère… '+((i+1)*3)+'s <span style="opacity:.6">(2-4 min)</span></div>';
          const jwt2=await klingJWT();
          const stRes=await fetch(kUrl+'/'+taskId,{headers:{'Authorization':'Bearer '+jwt2}});
          const stj=await stRes.json().catch(()=>({}));
          if(stj.data?.task_status==='succeed'){url=stj.data.task_result?.videos?.[0]?.url;break}
          if(stj.data?.task_status==='failed')throw new Error('Kling: génération échouée — '+( stj.data?.task_status_msg||'erreur serveur'));
        }
        if(!url){if(done)return;throw new Error('Kling: délai dépassé — réessaie')}
        if(done)return;place({type,prompt:promptText,seed:seed(),model:mm.id||'Kling',url});return;
      }
      if(type==='video' && hasKey('siliconflow')){
        const vidModel=(mm.provider==='siliconflow'&&mm.kind==='video')?mm.api:'Wan-AI/Wan2.2-T2V-A14B';
        if(mm.needImg && !srcImgB64)throw new Error('Wan I2V nécessite une image source.\nAttache une image via le trombone 📎');
        const vBody={model:vidModel,prompt:promptText,image_size:'1280x720'};
        if(mm.needImg){vBody.image=srcImgB64}
        const sub=await fetch(Relais.sfHost+'/v1/video/submit',{method:'POST',headers:H,body:JSON.stringify(vBody)});
        if(!sub.ok) throw new Error('HTTP '+sub.status+' · '+(await sub.text().catch(()=>'')).slice(0,200));
        const reqId=(await sub.json()).requestId;if(!reqId)throw new Error('Pas de requestId renvoyé');
        let url=null;
        for(let i=0;i<100 && !done;i++){
          await new Promise(r=>setTimeout(r,3000));if(done)return;
          bubble.innerHTML='<div class="gen-loading"><div class="gl-ring"></div>Vidéo en cours… '+((i+1)*3)+'s <span style="opacity:.6">(Wan met 2-5 min)</span></div>';
          const st=await fetch(Relais.sfHost+'/v1/video/status',{method:'POST',headers:H,body:JSON.stringify({requestId:reqId})});
          const sj=await st.json().catch(()=>({}));
          if(sj.status==='Succeed'){url=sj.results?.videos?.[0]?.url||sj.videos?.[0]?.url;break}
          if(sj.status==='Failed')throw new Error('Génération vidéo échouée côté serveur');
        }
        if(!url){if(done)return;throw new Error('Délai dépassé — réessaie avec un prompt plus court')}
        if(done)return;place({type,prompt:promptText,seed:seed(),model:vidModel.split('/').pop(),url});return;
      }
      if(done)return;
      place({type,prompt:promptText,seed:seed(),model});
    } catch(e) {
      if(!done){bubble.classList.remove('media-b');bubble.innerHTML="<div class='api-err'><b>Erreur génération</b><br>"+esc(friendlyErr(e))+"</div>";setGenerating(false);curStop=null;scrollDown();}
    }
  }
  async function genVoice(c,text){
    setGenerating(true);showView('chat');
    const model='CosyVoice 2',node=addAINode(model),bubble=node.querySelector('.bubble');
    bubble.innerHTML='<div class="gen-loading"><div class="gl-ring"></div>Génération de la voix off…</div>';
    let done=false;curStop=()=>{done=true;node.remove();setGenerating(false);curStop=null};
    try{
      if(!hasKey('siliconflow'))throw new Error('Clé SiliconFlow manquante');
      if(text.length>2000){text=text.slice(0,2000);toast('Texte long : seuls les 2000 premiers caractères sont lus.');}   // garde-fou CosyVoice
      const res=await fetch(Relais.sfHost+'/v1/audio/speech',{method:'POST',headers:{'Authorization':'Bearer '+Relais.cle('siliconflow'),'Content-Type':'application/json'},body:JSON.stringify({model:'FunAudioLLM/CosyVoice2-0.5B',input:text,voice:'FunAudioLLM/CosyVoice2-0.5B:alex',response_format:'mp3'})});
      if(!res.ok)throw new Error('HTTP '+res.status+' · '+(await res.text().catch(()=>'')).slice(0,200));
      const _blob=await res.blob();if(done)return;
      let media=null;
      if(Relais.viaProxy){try{const up=await fetch(Relais.base+'/media/upload',{method:'PUT',headers:{'Content-Type':'audio/mpeg'},body:_blob});if(up.ok){const d=await up.json();if(d.mid)media={type:'audio',prompt:text,model,r2:d.mid};}}catch(e){}}   // hébergé : audio dans le stockage permanent → suit l'utilisateur partout
      if(!media){
        const url=await new Promise((rs,rj)=>{const fr=new FileReader();fr.onload=()=>rs(fr.result);fr.onerror=()=>rj(new Error('lecture audio'));fr.readAsDataURL(_blob)});
        const mid='m'+newId();const okIdb=await MEDIA.put(mid,url);   // local : audio en IndexedDB (hors localStorage), persiste au reload
        media=okIdb?{type:'audio',prompt:text,model,mid}:{type:'audio',prompt:text,model,url};  // repli inline si IDB indisponible
      }
      bubble.classList.add('media-b');bubble.innerHTML=mediaBubbleHTML(media);wireMedia(bubble,media,node);hydrateMedia(bubble);
      c.msgs.push({role:'ai',media,model});c.ts=now();saveConvos();renderRecents();setGenerating(false);curStop=null;scrollDown();
    }catch(e){if(!done){bubble.innerHTML="<div class='api-err'><b>Erreur voix</b><br>"+esc(friendlyErr(e))+"</div>";setGenerating(false);curStop=null}}
  }
  let ttsBtn=null;   // bouton « lecture » actuellement actif (on suit le bouton, pas le texte)
  function stopTTS(){try{window.speechSynthesis.cancel()}catch(e){}if(ttsBtn){ttsBtn.classList.remove('on','speaking');ttsBtn.setAttribute('data-tip','Lecture');ttsBtn=null}}
  function playTTS(text, btn){
    if(!('speechSynthesis'in window)){toast('Lecture vocale non supportée par ce navigateur');return}
    const wasThis=(ttsBtn===btn);
    stopTTS();                                   // coupe toute lecture en cours + nettoie SON bouton
    if(wasThis)return;                           // re-clic sur le même bouton = arrêt
    // on retire le markdown/asterisques pour ne pas les lire à voix haute
    const clean=String(text||'').replace(/[*_`#>#]/g,'').replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').replace(/\s+/g,' ').trim();
    if(!clean){toast('Rien à lire');return}
    const u=new SpeechSynthesisUtterance(clean);u.lang='fr-FR';
    const done=()=>{if(ttsBtn===btn){btn.classList.remove('on','speaking');btn.setAttribute('data-tip','Lecture');ttsBtn=null}};
    u.onend=done;u.onerror=done;                 // sur iOS, cancel() déclenche onerror (pas toujours onend) → même nettoyage
    ttsBtn=btn;btn.classList.add('on','speaking');btn.setAttribute('data-tip','Arrêter la lecture');
    try{window.speechSynthesis.speak(u)}catch(e){done();toast('Lecture impossible')}
  }

  async function genSuggestions(col,aiText,userText){
    if(!Relais.cle('openrouter'))return;
    try{
      const res=await fetch(Relais.orHost+'/api/v1/chat/completions',{method:'POST',
        headers:{'Authorization':'Bearer '+Relais.cle('openrouter'),'Content-Type':'application/json','HTTP-Referer':location.origin||'https://mzai.app','X-Title':'MAZ'},
        body:JSON.stringify({model:'deepseek/deepseek-v4-flash',max_tokens:80,temperature:0.7,
          messages:[{role:'system',content:'Génère exactement 3 questions de suivi courtes (max 8 mots chacune) basées sur cette conversation. Retourne UNIQUEMENT les 3 questions séparées par des sauts de ligne, sans numérotation ni ponctuation finale.'},
            {role:'user',content:'Question : '+userText.slice(0,200)+'\nRéponse : '+aiText.slice(0,300)}]})});
      if(!res.ok)return;
      const d=await res.json();
      const lines=(d.choices?.[0]?.message?.content||'').trim().split('\n').map(l=>l.replace(/^[\d\-\.\)]+\s*/,'').trim()).filter(l=>l.length>3&&l.length<80).slice(0,3);
      if(!lines.length)return;
      const wrap=document.createElement('div');wrap.className='suggestions';
      lines.forEach(q=>{const b=document.createElement('button');b.className='sug-chip rip';b.textContent=q;b.onclick=()=>{$('#prompt').value=q;autoGrow();updateCount();$('#prompt').focus();wrap.remove()};wrap.appendChild(b)});
      col.appendChild(wrap);
    }catch(e){}
  }
  // l'aiguillage de secours : quand un modèle casse, en proposer un d'une AUTRE famille (une panne fournisseur ne se répare pas en réessayant pareil)
  const ALT_MODELE=m=>({'DeepSeek V4 Flash':'MiniMax M3','DeepSeek V4 Pro':'GLM-5.2','Qwen3 Max Thinking':'DeepSeek V4 Pro','Qwen3 Coder Plus':'Kimi K2.7 Code','Kimi K2.7 Code':'Qwen3 Coder Plus','GLM-5.2':'DeepSeek V4 Pro','MiniMax M3':'DeepSeek V4 Flash'}[m]||'MiniMax M3');
  function addActions(col,text,node,isError,failedModel){
    const a=document.createElement('div');a.className='actions';
    // Une bulle d'erreur n'est pas une vraie réponse : ses seules actions sont ses issues — et elles s'affichent d'office.
    if(isError){
      const alt=ALT_MODELE(failedModel||currentModel);
      a.className='actions err';
      a.innerHTML='<div class="reroute"><button type="button" class="rr" data-a="retry">Réessayer</button><button type="button" class="rr" data-a="reroute">Essayer avec <b>'+esc(alt)+'</b></button></div>';
      col.appendChild(a);
      const relance=model=>{
        if(generating||!node)return;const c=convoById(activeId);if(!c)return;
        node.remove();const reason=isOn('Réflexion'),search=isOn('Recherche'),nn=addAINode(model);   // l'erreur n'est pas dans c.msgs → on ne supprime aucune réponse existante
        runGen(nn,REPLIES[ri++%REPLIES.length],{reason,search,model,onDone:(t,meta)=>{if(meta.error)return;c.msgs.push({role:'ai',text:t,model:meta.resolved||model,auto:!!meta.auto,reason,search,reasonText:meta.reasonText||'',sources:meta.sources||[],usage:meta.usage||null,ms:meta.ms||0});c.model=model;c.ts=now();saveConvos();renderRecents();fsHandle(nn,c,t)}});
      };
      a.querySelector('[data-a=retry]').addEventListener('click',()=>relance(currentModel));
      a.querySelector('[data-a=reroute]').addEventListener('click',()=>relance(alt));
      return;
    }
    a.innerHTML='<div class="act" data-a="copy" data-tip="Copier"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg></div><div class="act" data-a="speak" data-tip="Lecture"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg></div><div class="act" data-a="redo" data-tip="Régénérer ('+currentModel+')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-3-6.7M21 4v4h-4"/></svg></div><div class="act" data-a="like" data-tip="J\'aime"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 11v9M2 13v6a2 2 0 0 0 2 2h13.3a2 2 0 0 0 2-1.6l1.4-7A2 2 0 0 0 19.7 10H14V5a2 2 0 0 0-3.7-1L7 11"/></svg></div>';
    col.appendChild(a);
    a.querySelector('[data-a=copy]').addEventListener('click',e=>{navigator.clipboard?.writeText(text);flashCopie(e.currentTarget)});
    a.querySelector('[data-a=speak]').addEventListener('click',(e)=>playTTS(text, e.currentTarget));
    a.querySelector('[data-a=redo]').addEventListener('click',()=>{
      if(generating||!node)return;const c=convoById(activeId);if(!c)return;
      for(let k=c.msgs.length-1;k>=0;k--){if(c.msgs[k].role==='ai'){c.msgs.splice(k,1);break}}
      node.remove();const model=currentModel,reason=isOn('Réflexion'),search=isOn('Recherche'),nn=addAINode(model);
      runGen(nn,REPLIES[ri++%REPLIES.length],{reason,search,model,onDone:(t,meta)=>{if(meta.error)return;c.msgs.push({role:'ai',text:t,model:meta.resolved||model,auto:!!meta.auto,reason,search,reasonText:meta.reasonText||'',sources:meta.sources||[],usage:meta.usage||null,ms:meta.ms||0});c.model=model;c.ts=now();saveConvos();renderRecents();fsHandle(nn,c,t)}});
      toast('Régénéré avec '+model);
    });
    a.querySelector('[data-a=like]').addEventListener('click',e=>{e.currentTarget.classList.toggle('on');toast('Merci pour le retour')});
  }
  function injBadge(used,total){  // badge de transparence : combien de caractères du document ont réellement été injectés
    if(!total)return null;const trunc=used<total,el=document.createElement('div');
    el.style.cssText='margin-top:6px;font-size:11px;color:var(--ink-soft);display:flex;align-items:center;gap:5px';
    el.innerHTML=(trunc?'<span style="color:var(--warning-strong)">⚠️</span> ':'<span style="opacity:.6">📄</span> ')+used.toLocaleString('fr-FR')+' / '+total.toLocaleString('fr-FR')+' caractères injectés'+(trunc?' — document tronqué (choisis un modèle à plus grande fenêtre pour tout couvrir)':'');
    return el;
  }
  function addJsonDownload(col,text){  // action Extraction → bouton « Télécharger .json » (parse défensif du JSON renvoyé)
    let raw=(text||'').trim();const fence=raw.match(/```(?:json)?\s*([\s\S]*?)```/i);if(fence)raw=fence[1].trim();
    let obj;try{obj=JSON.parse(raw)}catch(e){return}
    const btn=document.createElement('button');btn.className='sug-chip';btn.style.marginTop='8px';btn.textContent='Télécharger .json';
    btn.onclick=()=>{const b=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download='extraction.json';a.click();URL.revokeObjectURL(u)};
    col.appendChild(btn);
  }
