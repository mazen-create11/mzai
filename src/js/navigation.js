  /* ===== view router ===== */
  /* Déplace le nœud UNIQUE #composer entre #dockHome (accueil) et #dockChat (conversation).
     Un seul nœud → tous les handlers (#prompt/#sendBtn/#attachBtn/#dictateBtn/slash) restent branchés. */
  function moveComposer(v){
    const comp=$('#composer');if(!comp)return;
    const dest=(v==='chat')?$('#dockChat'):$('#dockHome');
    if(dest&&comp.parentElement!==dest)dest.appendChild(comp);
    if((v==='home'||v==='chat')&&matchMedia('(pointer: fine)').matches)setTimeout(()=>{try{$('#prompt').focus()}catch(e){}},0);
  }
  function showView(v){
    if(typeof stopTTS==='function')stopTTS();   // on ne laisse pas une lecture vocale continuer après un changement de vue
    // Mettre à jour la mémoire quand on quitte le chat
    if(v!=='chat'&&activeId){const c=convoById(activeId);if(c&&c.msgs.length>=4)updateMemory(c);}
    $$('.view').forEach(s=>s.classList.remove('active'));
    $('#view-'+v).classList.add('active');
    if(v==='persona')fillPersona();else if(v==='prompts')renderPromptsView();else if(v==='help')renderHelp();   // vues in-place (ex-modales)
    if(v==='atelier'&&typeof AT!=='undefined'){AT.peindre();AT.rafraichir()}
    else if(v==='controle'&&typeof AT!=='undefined')AT.peindreControle();
    if(typeof AT!=='undefined')AT.syncPont();
    $('#app').dataset.view=v;                 // pilote le dock (#dockChat visible seulement en chat) + le clavier mobile
    const navv=v==='project'?'projects':v;
    $$('.nav-item').forEach(n=>{const on=n.dataset.view===navv;n.classList.toggle('active',on);if(on)n.setAttribute('aria-current','page');else n.removeAttribute('aria-current')});
    moveComposer(v);                          // relog le composer dans le bon dock
    syncTopTitle();                           // titre de conv dans le topbar (chat) / masqué (home)
    if(window.innerWidth<=1024){$('#sidebar').classList.remove('open');$('#scrim').classList.remove('show')}
  }
  /* topbar épuré : titre de la conversation à gauche en mode chat, rien en home */
  function syncTopTitle(){const tt=$('#convTitle');if(!tt)return;const c=convoById(activeId);if($('#app').dataset.view==='chat'&&c){tt.textContent=c.title;tt.hidden=false}else{tt.textContent='';tt.hidden=true}}
  $$('.nav-item[data-view]').forEach(n=>n.addEventListener('click',()=>showView(n.dataset.view)));
  $('#brandHome').addEventListener('click',goHome);
  $('#brandHome').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();goHome()}});
  function goHome(){showView('home');$$('.nav-item').forEach(n=>n.classList.remove('active'));refreshSendBtn()}

  /* ===== popovers ===== */
  let openPop=null;
  function placePop(pop,anchor,align){
    const r=anchor.getBoundingClientRect(),ph=pop.offsetHeight||320,pw=pop.offsetWidth||260;
    const vh=(window.visualViewport&&window.visualViewport.height)||innerHeight;   // hauteur réelle clavier iOS ouvert
    let top=r.bottom+8;
    if(top+ph>vh-12){const above=r.top-8-ph;top=above>=12?above:Math.max(12,vh-12-ph);pop.style.transformOrigin='bottom'}
    else pop.style.transformOrigin='top';
    pop.style.top=Math.round(Math.max(12,top))+'px';
    // clamp horizontal : le popover ne sort jamais du viewport (débordait à droite sur iPhone)
    let left;
    if(align==='right')left=r.right-pw;else left=r.left;
    left=Math.min(left,innerWidth-pw-12);left=Math.max(12,left);
    pop.style.left=Math.round(left)+'px';pop.style.right='auto';
  }
  let _veilPop=false;   // le voile n'appartient au pop que s'il l'a ouvert (le sheet d'appui long a le sien)
  function showPop(pop,anchor,align,markEl){closePop();
    if(window.innerWidth<=640){   // ≤640 : le popover devient une feuille du bas — dans l'arc du pouce, plus jamais ancré au topbar
      pop.classList.add('pop--sheet');pop.style.top='';pop.style.left='';pop.style.right='';pop.style.transformOrigin='';
      const v=$('#sheetVeil');if(v){v.hidden=false;requestAnimationFrame(()=>v.classList.add('show'));_veilPop=true}
    }else{pop.classList.remove('pop--sheet');placePop(pop,anchor,align)}
    pop.classList.add('show');openPop=pop;markEl&&markEl.classList.add('pop-on')}
  function closePop(){if(openPop){openPop.classList.remove('show');openPop=null}
    if(_veilPop){_veilPop=false;const v=$('#sheetVeil');if(v){v.classList.remove('show');setTimeout(()=>{if(!v.classList.contains('show'))v.hidden=true},280)}}
    $$('.pop-on').forEach(e=>e.classList.remove('pop-on'));const tb=document.getElementById('toolsBtn');tb&&tb.setAttribute('aria-expanded','false')}
  document.addEventListener('click',e=>{if(openPop&&!openPop.contains(e.target)&&!e.target.closest('[data-popanchor]'))closePop()});

  /* model popover */
  $('#popModel').classList.add('wide');
  const spdDots=n=>`<span class="spd" data-tip="Vitesse">${[1,2,3,4].map(i=>`<i class="${i<=n?'on':''}"></i>`).join('')}</span>`;
  const CHK='<span class="pi-check"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M20 6 9 17l-5-5"/></svg></span>';
  function renderModelPicker(){
    const cats=[['auto',null,m=>m.provider==='mz'],['text','Texte',m=>m.provider!=='mz'&&!m.kind],['image','Image',m=>m.kind==='image'],['video','Vidéo',m=>m.kind==='video'&&(m.provider!=='kling'||klingUsable())],['voice','Voix',m=>m.kind==='audio']];
    let html='<div class="ph">Choisir un modèle</div>';
    cats.forEach(([key,label,test])=>{const ms=MODELS.filter(test);if(!ms.length)return;
      if(label)html+=`<div class="prov-h">${label}</div>`;
      ms.forEach(m=>{const pr=PROVIDERS[m.provider];const ok=hasKey(m.provider);html+=`<div class="pi${ok?'':' nokey'}" data-model="${m.id}" style="--ac:${pr.ac}"><div class="pi-i acc">${brandLogo(m)}</div><div class="pi-main"><div class="pi-t">${m.id}${m.tag?` <span class="tagm" style="background:var(--surface-2);color:var(--ink-soft);border:1px solid var(--line)">${m.tag}</span>`:''}${ok?'':'<span class="keyhint">clé requise</span>'}</div><div class="pi-d">${m.d}</div><div class="pi-cap">${spdDots(m.spd)}${m.ctx&&m.ctx!=='-'?`<span class="ctxchip">${m.ctx} ctx</span>`:''}</div></div>${CHK}</div>`})});
    html+=`<div class="pfoot"><button class="pf-btn" id="popPersona"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GLYPH.sliders}</svg>Personnaliser mon IA</button></div>`;
    $('#popModel').innerHTML=html;
    $$('#popModel .pi').forEach(p=>p.addEventListener('click',()=>{const id=p.dataset.model,m=modelById(id);const _cat=m&&m.kind?(m.kind==='audio'?'voice':m.kind):'text';if(typeof setMode==='function'&&_cat!==MODE_CAT[currentMode])setMode(_cat);currentModel=id;syncModel();closePop();if(!hasKey(m.provider)){if(Relais.viaProxy){toast('Modèle indisponible pour l\'instant')}else{toast('Ajoute ta clé '+PROVIDERS[m.provider].name);openSettingsAt('api')}}else{const mp=$('#modelPill');if(mp){mp.classList.remove('m-flash');void mp.offsetWidth;mp.classList.add('m-flash')}}}));   // le retour vit dans la pill elle-même, pas dans un toast à l'autre bout
    const _pk=$('#popKeys');if(_pk)_pk.addEventListener('click',()=>{closePop();openSettingsAt('api')});
    $('#popPersona').addEventListener('click',()=>{closePop();openPersona()});
  }
  renderModelPicker();
  function syncModel(){const m=modelById(currentModel);$$('#popModel .pi').forEach(p=>p.classList.toggle('sel',p.dataset.model===currentModel));$('.model-pill .lbl').textContent=currentModel;$('#toolModelLbl').textContent=currentModel;const hs=$('#homeStatus');if(hs)hs.textContent=currentModel==='MAZ Auto'?'MAZ Auto prêt':currentModel+' prêt';const live=$('.model-pill .live');if(live){live.style.background='';live.style.boxShadow='';live.style.border=''}/* le CSS pilote le point : aucun style inline n'écrase la règle [data-gen] */const sm=$('#setModelLbl');if(sm)sm.textContent=currentModel;const sd=$('#setModelDot');if(sd){sd.style.background='var(--accent)';sd.style.boxShadow=''}DB.set('model',currentModel)}
  syncModel();
  const openModel=a=>showPop($('#popModel'),a,'right',$('#modelPill'));
  $('#modelPill').setAttribute('data-popanchor','');$('#modelPill').addEventListener('click',()=>openPop===$('#popModel')?closePop():openModel($('#modelPill')));
  $('#toolModel').addEventListener('click',()=>openPop===$('#popModel')?closePop():showPop($('#popModel'),$('#toolModel'),'left'));

