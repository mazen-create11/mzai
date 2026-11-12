  const prompt=$('#prompt');
  function autoGrow(){prompt.style.height='auto';prompt.style.height=Math.min(prompt.scrollHeight,160)+'px'}
  function updateCount(){
    const text = prompt.value.trim();
    const words = text ? text.split(/\s+/).length : 0;
    $('#counter').textContent = words + ' mot' + (words > 1 ? 's' : '');
    const sb=$('#sendBtn');
    if(sb&&!generating) sb.classList.toggle('idle', !(text.length || (typeof ATTACH!=='undefined' && ATTACH.length)));
  }
  prompt.addEventListener('input',()=>{autoGrow();updateCount()});

  /* gestion des conversations */
  function createConvo(){const c={id:newId(),title:'Nouvelle conversation',model:currentModel,ts:now(),msgs:[],pid:activeProject||null};CONVOS.push(c);activeId=c.id;saveConvos();return c}
  // recharge en mémoire les données lourdes (b64 image / pages OCR) déportées en IndexedDB, avant le rendu
  async function rehydrateFiles(c){
    const tasks=[];
    (c.msgs||[]).forEach(m=>(m.files||[]).forEach(f=>{ if(f&&f._mid&&f._txt){ if(!f.textContent) tasks.push(MEDIA.get(f._mid).then(v=>{if(v)f.textContent=v})); } else if(f&&f._mid&&!f.b64&&!f.ocrPages){ tasks.push(MEDIA.get(f._mid).then(v=>{if(!v)return;if(f._ocr){try{f.ocrPages=JSON.parse(v)}catch(e){}}else{f.b64=v}})); } }));
    if(tasks.length)await Promise.all(tasks);
  }
  async function openConvo(id){const c=convoById(id);if(!c)return;activeId=id;activeProject=c.pid||null;if(c.model&&MODELS.some(m=>m.id===c.model)){const _cm=modelById(c.model);currentModel=/image|video|audio/.test(_cm.kind||'')?'MAZ Auto':c.model;syncModel()}chat.innerHTML='';showView('chat');await rehydrateFiles(c);if(activeId!==id)return;c.msgs.forEach(m=>m.role==='user'?(m.fs?addFsNode(m):addUser(m.text,m.files)):renderAIStored(m));chat.querySelectorAll('.msg').forEach(x=>x.classList.add('settled'));refreshCtxBanner();renderChatHead(c);renderRecents();stickBottom=true;scrollDown(true);refreshSendBtn()}
  function renderChatHead(c){
    if(c&&c.id&&activeId&&c.id!==activeId)return;   // ne pas écrire l'en-tête d'une convo qui n'est plus affichée (titre auto résolu après bascule)
    let h=chat.querySelector('.conv-head');
    if(!c){if(h)h.remove();return}
    if(!h)h=document.createElement('div'),h.className='conv-head';
    chat.insertBefore(h,chat.firstChild);
    let assBadge='';if(c.assistant){const a=ASSISTANTS.find(x=>x.id===c.assistant);if(a)assBadge=`<span class="ptag" style="background:color-mix(in srgb,${a.color} 20%,transparent);color:${a.color};margin-left:8px;font-size:10px">${a.name}</span>`;}
    h.innerHTML=`<div style="display:flex;flex-direction:column;gap:2px;"><div style="display:flex;align-items:center"><span class="ch-t" data-tip="Renommer la conversation">${esc(c.title)}</span>${assBadge}</div><span style="font-size:11px;color:var(--txt-faint)">${c.msgs.length} message${c.msgs.length>1?'s':''}</span></div><div class="ch-acts"><span class="ch-act ch-edit" data-tip="Renommer"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg></span></div>`;
    
    const start=()=>{
      if(h.querySelector('.ch-in'))return;
      const inp=document.createElement('input');inp.className='ch-in';inp.value=c.title;inp.maxLength=80;
      h.innerHTML='';h.appendChild(inp);inp.focus();inp.select();
      const save=()=>{const v=inp.value.trim();if(v&&v!==c.title){c.title=v;saveConvos();renderRecents();renderLibrary($('#libSearch')?.value||'')}renderChatHead(c)};
      inp.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();save()}if(e.key==='Escape')renderChatHead(c)});
      inp.addEventListener('blur',save);
    };
    h.querySelector('.ch-t').onclick=start;h.querySelector('.ch-edit').onclick=start;
    if(c.id===activeId)syncTopTitle();
  }
  function projContextOf(c){if(!c||!c.pid)return null;const p=projById(c.pid);return p&&(p.context||(p.files&&p.files.length))?p:null}
  function refreshCtxBanner(){const ex=chat.querySelector('.ctx-banner');if(ex)ex.remove();const p=projContextOf(convoById(activeId));if(!p)return;const nf=(p.files||[]).length;const b=document.createElement('div');b.className='ctx-banner';b.innerHTML='<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+GLYPH.brain+'</svg>Contexte de <b>'+esc(p.name)+'</b> appliqué'+(nf?' · '+nf+' fichier'+(nf>1?'s':''):'');chat.insertBefore(b,chat.firstChild)}
  function renameConvo(id){const c=convoById(id);if(!c)return;const v=window.prompt('Renommer la conversation',c.title);if(v&&v.trim()){c.title=v.trim();saveConvos();renderRecents();renderLibrary($('#libSearch')?.value||'');if(activeId===id)renderChatHead(c)}}
  // libère les blobs IndexedDB des convos supprimées, s'ils ne sont plus référencés ailleurs
  function _collectMids(c){const ids=[];(c.msgs||[]).forEach(m=>{if(m.media&&m.media.mid)ids.push(m.media.mid);(m.files||[]).forEach(f=>{if(f&&f._mid)ids.push(f._mid)})});return ids;}
  function _mediaPurge(gone){const dead=new Set();(gone||[]).forEach(c=>_collectMids(c).forEach(id=>dead.add(id)));if(!dead.size)return;const alive=new Set();[...CONVOS,...TRASH].forEach(c=>_collectMids(c).forEach(id=>alive.add(id)));dead.forEach(id=>{if(!alive.has(id))MEDIA.del(id)});}
  function deleteConvo(id){const c=convoById(id);if(!c)return;if(id===genCid&&curStop){try{curStop()}catch(e){}}   /* sinon la génération finit dans une convo corbeillée et bloque le composer */
    CONVOS=CONVOS.filter(x=>x.id!==id);c._del=now();TRASH.unshift(c);let _drop=[];if(TRASH.length>50){_drop=TRASH.slice(50);TRASH=TRASH.slice(0,50);}saveTrash();if(activeId===id){activeId=null;chat.innerHTML='';goHome()}saveConvos();try{cloudDelete(id)}catch(e){}renderRecents();renderLibrary($('#libSearch')?.value||'');if(_drop.length)_mediaPurge(_drop);toastUndo('Déplacée vers la corbeille',()=>restoreConvo(id))}
  function restoreConvo(id){const i=TRASH.findIndex(c=>c.id===id);if(i<0)return;const c=TRASH.splice(i,1)[0];delete c._del;c.ts=now();CONVOS.push(c);saveTrash();saveConvos();renderRecents();renderLibrary($('#libSearch')?.value||'');renderTrash();toast('Conversation restaurée')}
  function purgeConvo(id){if(!window.confirm('Supprimer définitivement cette conversation ?'))return;const _gone=TRASH.find(c=>c.id===id);TRASH=TRASH.filter(c=>c.id!==id);saveTrash();if(_gone)_mediaPurge([_gone]);renderTrash();toast('Supprimée définitivement')}
  function emptyTrash(){if(!TRASH.length)return;if(!window.confirm('Vider la corbeille ? '+TRASH.length+' conversation(s) seront supprimées définitivement.'))return;const _gone=TRASH;TRASH=[];saveTrash();_mediaPurge(_gone);renderTrash();toast('Corbeille vidée')}
  function renderTrash(){
    $('#trashCount').textContent=TRASH.length+' élément'+(TRASH.length>1?'s':'');
    $('#trashEmpty').style.display=TRASH.length?'':'none';
    $('#trashList').innerHTML=TRASH.length?TRASH.map(c=>`<div class="lrow" data-id="${c.id}"><div class="lic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${LIC.chat}</svg></div><div style="min-width:0;flex:1"><div class="ln">${esc(c.title)}</div><div class="lmeta">${c.msgs.length} message${c.msgs.length>1?'s':''} · supprimée ${ago(c._del||c.ts)}</div></div><div class="lacts"><span class="la" data-tr="restore" data-tip="Restaurer"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GLYPH.restore}</svg></span><span class="la" data-tr="purge" data-tip="Supprimer définitivement"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GLYPH.trash}</svg></span></div></div>`).join(''):`<div class="cp-empty">La corbeille est vide.</div>`;
    $$('#trashList .lrow').forEach(r=>{const id=r.dataset.id;r.querySelector('[data-tr=restore]').onclick=()=>restoreConvo(id);r.querySelector('[data-tr=purge]').onclick=()=>purgeConvo(id)});
  }
  function openTrash(){renderTrash();$('#trashModal').classList.add('show')}
  $('#trClose').addEventListener('click',()=>$('#trashModal').classList.remove('show'));
  $('#trashEmpty').addEventListener('click',emptyTrash);
  $('#trashModal').addEventListener('click',e=>{if(e.target.id==='trashModal')$('#trashModal').classList.remove('show')});
  let _sending=false;
  async function send(){
    if(generating||_sending)return;   // verrou synchrone : empêche le double-envoi pendant l'extraction async des fichiers
    _sending=true;_fsRounds=0;   // chaque message utilisateur ré-arme le budget de lectures fichiers (3 tours max)
    try{
    if(currentMode==='transcribe'){  // Transcription : fichier audio → SF ; sinon micro live
      const af=ATTACH.find(f=>f.file&&(/^audio\//.test(f.file.type)||/\.(mp3|wav|m4a|ogg|flac|aac|webm|opus)$/i.test(f.name)));
      if(af){const file=af.file;if(af.url)URL.revokeObjectURL(af.url);ATTACH=ATTACH.filter(x=>x!==af);renderAttach();if(!activeId)createConvo();const c=convoById(activeId);showView('chat');genTranscribe(c,file);return}
      if(asrOn)asrRec&&asrRec.stop();   // on arrête le micro mais on n'abandonne pas le texte dicté
      if(!prompt.value.trim())return toast('Transcription : importe un audio ou dicte au micro (⫶⫶)');
      // sinon : du texte a été dicté → on l'envoie comme message normal (le « insérer comme message » demandé)
    }
    const v=prompt.value.trim();if(!v&&!ATTACH.length)return toast('Écris un message');
    const rawFiles=[...ATTACH];ATTACH=[];renderAttach();
    // Images → base64 persistant ; documents (txt/docx/xlsx/pdf) → texte extrait côté client
    const files=await Promise.all(rawFiles.map(async f=>{
      if(f.isImg&&f.url){try{const b64=await blobToB64(f.url);URL.revokeObjectURL(f.url);const o={name:f.name,isImg:true,b64};const id='f'+newId();if(await MEDIA.put(id,b64))o._mid=id;return o;}catch(e){return{name:f.name,isImg:false};}}
      if(!f.isImg&&f.file){try{const textContent=await Fichiers.extractFileText(f.file);
        // OCR/vision : PDF scanné (aucun texte sélectionnable) en mode Documents → rastériser les pages pour le modèle vision
        if(currentMode==='doc'&&/\.pdf$/i.test(f.name)&&/^\[PDF «/.test(textContent||'')){
          try{const pages=await Fichiers.pdfToImages(await f.file.arrayBuffer(),8);if(pages.length){const o={name:f.name,isImg:false,textContent,ocrPages:pages};const id='f'+newId();if(await MEDIA.put(id,JSON.stringify(pages))){o._mid=id;o._ocr=true;}return o;}}catch(e){toast("Lecture PDF indisponible (réseau ou intégrité)")}
        }
        if(textContent){const o={name:f.name,isImg:false,textContent};if(textContent.length>20000){const id='f'+newId();if(await MEDIA.put(id,textContent)){o._mid=id;o._txt=true;}}return o;}}catch(e){}}
      return{name:f.name,isImg:false};
    }));
    if(!activeId)createConvo();const c=convoById(activeId);
    const ut=v||'(fichiers joints)';c.msgs.push({role:'user',text:ut,files});
    if(c.msgs.filter(m=>m.role==='user').length===1)c.title=makeTitle(ut);
    c.model=currentModel;c.ts=now();saveConvos();renderRecents();
    showView('chat');addUser(ut,files);refreshCtxBanner();renderChatHead(c);prompt.value='';autoGrow();updateCount();
    if(currentMode==='doc'){const hasDoc=files.some(f=>f.textContent||f.b64||(f.ocrPages&&f.ocrPages.length))||c.msgs.some(m=>(m.files||[]).some(f=>f.textContent||f.b64||(f.ocrPages&&f.ocrPages.length)));if(!hasDoc)toast('Astuce : joins un document (📎) pour que l\'outil l\'analyse');}
    if(currentMode==='voice')genVoice(c,ut);else if(currentMode==='image'||currentMode==='video')genMedia(c,ut,currentMode);else genReply(c);
    }finally{_sending=false;}
  }
  $('#sendBtn').addEventListener('click',()=>{if(genCid!==null){if(genCid===activeId){if(performance.now()-_genStart<450)return;curStop&&curStop()}else{toast('Une génération est en cours dans une autre conversation — patiente qu\'elle finisse')}}else send()});   // 450ms de grâce : un double-tap n'annule pas la requête à peine partie
  prompt.addEventListener('keydown',e=>{
    if(slashOpen()&&slashItems.length){
      if(e.key==='ArrowDown'){e.preventDefault();slashK=(slashK+1)%slashItems.length;renderSlash();return}
      if(e.key==='ArrowUp'){e.preventDefault();slashK=(slashK-1+slashItems.length)%slashItems.length;renderSlash();return}
      if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();pickPrompt(slashItems[slashK]);return}
      if(e.key==='Tab'){e.preventDefault();pickPrompt(slashItems[slashK]);return}
      if(e.key==='Escape'){e.preventDefault();closeSlash();return}
    }
    // Sur écran tactile, Retour = saut de ligne (on écrit à plusieurs lignes) ; l'envoi passe par le bouton. Sur desktop, Entrée envoie.
    let _coarse=false;try{_coarse=matchMedia('(pointer:coarse)').matches}catch(_){}
    if(e.key==='Enter'&&!e.shiftKey&&SETTINGS.enter&&!_coarse){e.preventDefault();send()}
  });
  function openConversation(text){newChat();prompt.value=text;send()}
  function newChat(){if(generating&&curStop)curStop();activeId=null;activeProject=null;chat.innerHTML='';goHome();prompt.value='';autoGrow();updateCount();renderRecents();try{if(matchMedia('(pointer:fine)').matches)prompt.focus()}catch(e){prompt.focus()}}   /* annule la génération en cours : le modèle n'a qu'un genCid global, laisser tourner en fond bloquerait le nouveau chat */
  $('#newChat').addEventListener('click',newChat);

  /* suggestions d'accueil — pré-remplit le champ SANS envoyer */
  $$('#homeSuggest .sug').forEach(s=>s.addEventListener('click',()=>{
    if(s.dataset.mode){if(currentMode!==s.dataset.mode)setMode(s.dataset.mode);prompt.focus();return}
    if(s.dataset.toggle){const k=s.dataset.toggle;if(MODE_CAT[currentMode]!=='text'){toast('Disponible avec l\'Assistant');return}opts[k]=!opts[k];renderModeChip();syncToolUI();toast((k==='search'?'Recherche web':'Réflexion')+(opts[k]?' activée':' désactivée'));prompt.focus();return}
    prompt.value=s.dataset.prompt||s.textContent;autoGrow();updateCount();prompt.focus();prompt.setSelectionRange(prompt.value.length,prompt.value.length);
  }));
  $$('.quick-card[data-prompt]').forEach(card=>card.addEventListener('click',()=>{
    if(currentMode!=='text')setMode('text');
    prompt.value=card.dataset.prompt||'';autoGrow();updateCount();prompt.focus();prompt.setSelectionRange(prompt.value.length,prompt.value.length);
    toast('Canevas prêt — complète les éléments entre crochets');
  }));

