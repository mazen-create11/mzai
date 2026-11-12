  $$('.nav-item[data-act]').forEach(n=>n.setAttribute('data-popanchor',''));
  $$('.nav-item[data-act]').forEach(n=>n.addEventListener('click',()=>{const a=n.dataset.act;if(a==='search')openPalette();else if(a==='persona')openPersona();else if(a==='more')openPop===$('#popMore')?closePop():showPop($('#popMore'),n,'left')}));

  /* ===== settings ===== */
  function openSettings(){renderThemePicker();$('#settings').classList.add('show')}
  function openSettingsAt(sec){openSettings();setTimeout(()=>{const el=$('#set-'+sec);el&&el.scrollIntoView({behavior:'smooth',block:'start'})},80)}
  $('#settingsBtn').addEventListener('click',openSettings);
  $('#themeBtn')?.addEventListener('click',toggleTheme);   // bouton topbar retiré (choix Mazen 21/07) — le thème vit dans Réglages
  $('#installBtn').addEventListener('click',installApp);
  $('#setClose').addEventListener('click',()=>$('#settings').classList.remove('show'));
  $('#settings').addEventListener('click',e=>{if(e.target.id==='settings')$('#settings').classList.remove('show')});
  $('#setUpgrade').addEventListener('click',()=>$('#settings').classList.remove('show'));
  /* Quelle version tourne ? Sans repère, « ça marche pas » chez un collègue ne
     dit pas s'il est sur la build du jour ou sur celle d'il y a trois semaines.
     document.lastModified EST la date du fichier servi : rien à maintenir, et
     ça ne peut pas mentir puisque la valeur vient du fichier lui-même. */
  (function(){const el=$('#setVersion');if(!el)return;
    const d=new Date(document.lastModified);
    el.textContent=isNaN(d)?'':'Version du '+d.toLocaleDateString('fr-FR',{day:'numeric',month:'long'})+' à '+d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
    el.title='Recharge la page pour prendre la dernière version.';})();
  $$('#segDensity .sg').forEach(b=>b.addEventListener('click',()=>{$$('#segDensity .sg').forEach(x=>x.classList.remove('on'));b.classList.add('on');SETTINGS.density=b.dataset.d;DB.set('settings',SETTINGS);applyDensity();toast('Densité : '+b.textContent)}));
  function applyDensity(){document.body.classList.toggle('dense',SETTINGS.density==='dense')}
  function applyAnim(){document.body.classList.toggle('no-anim',!SETTINGS.anim)}
  /* [data-set] est indispensable : les Réglages contiennent désormais des
     interrupteurs qui ne pilotent PAS une préférence locale (alertes serveur). */
  $$('.set-body .toggle[data-set]').forEach(t=>t.addEventListener('click',()=>{t.classList.toggle('on');const on=t.classList.contains('on');SETTINGS[t.dataset.set]=on;DB.set('settings',SETTINGS);if(t.dataset.set==='anim')applyAnim();toast(t.dataset.set+' '+(on?'activé':'désactivé'))}));
  /* thème : clair par défaut, dark via toggle explicite [data-theme="dark"] (plus de palettes fantaisie) */
  const THEME_LABELS={light:'Clair',dark:'Sombre'};
  function normTheme(t){return t==='dark'?'dark':t==='auto'?'auto':'light'}   /* ignore les valeurs legacy de palette → clair */
  /* Mode auto : clair de 7 h à 19 h, sombre le reste. Deux thèmes soignés
     existent et personne ne pense à en changer — autant que la journée le
     fasse. Les mêmes bornes que la lumière de fond, pour qu'ils s'accordent. */
  const themeDeLHeure=()=>{const h=new Date().getHours();return (h>=7&&h<19)?'light':'dark'};
  const themeEffectif=t=>normTheme(t)==='auto'?themeDeLHeure():normTheme(t);
  function applyTheme(c,silent){
    const choix=normTheme(c);
    const t=themeEffectif(choix);
    document.documentElement.dataset.theme=t;
    const dark=t==='dark';
    const sun=$('#themeBtn .ic-sun'),moon=$('#themeBtn .ic-moon');
    if(sun)sun.style.display=dark?'none':'';
    if(moon)moon.style.display=dark?'':'none';
    let tc=document.querySelector('meta[name="theme-color"]:not([media])');
    if(!tc){tc=document.createElement('meta');tc.setAttribute('name','theme-color');document.head.appendChild(tc)}
    tc.setAttribute('content',dark?'#1A1916':'#FAF8F3');
    DB.set('theme',choix);   // on garde le CHOIX ('auto'), pas son résultat du moment
    if(!silent)toast('Thème — '+(choix==='auto'?'Auto ('+THEME_LABELS[t].toLowerCase()+')':THEME_LABELS[t]));
  }
  function toggleTheme(){applyTheme(themeEffectif(DB.get('theme','dark'))==='dark'?'light':'dark');renderThemePicker()}
  function renderThemePicker(){
    const host=$('#segTheme');if(!host)return;const cur=normTheme(DB.get('theme','dark'));
    host.innerHTML=[['light','Clair'],['dark','Sombre'],['auto','Auto']].map(([k,n])=>`<button class="sg${k===cur?' on':''}" data-c="${k}" aria-label="Thème ${n}">${n}</button>`).join('');
    $$('#segTheme .sg').forEach(b=>b.onclick=()=>{$$('#segTheme .sg').forEach(x=>x.classList.remove('on'));b.classList.add('on');applyTheme(b.dataset.c)});
  }
  /* En auto, on revérifie régulièrement ET au retour sur l'onglet : une bascule
     qui n'arrive qu'au rechargement ne se produirait jamais, on laisse l'app
     ouverte toute la journée. `silent` : personne ne veut d'un toast à 19 h. */
  (function(){
    let dernier=themeEffectif(DB.get('theme','dark'));
    const verifier=()=>{
      if(normTheme(DB.get('theme','dark'))!=='auto')return;
      const v=themeDeLHeure();if(v===dernier)return;
      dernier=v;applyTheme('auto',true);renderThemePicker();
    };
    setInterval(verifier,10*60*1000);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)verifier()});
  })();

  /* modèle par défaut (select) */
  $('#setModelBtn').addEventListener('click',()=>{const b=$('#setModelBtn');openPop===$('#popModel')?closePop():showPop($('#popModel'),b,'left',b)});

  /* connexions API */
  function renderApiList(){
    // Mode hébergé (accès par code) : les clés vivent côté serveur (Worker). Un collègue/client
    // n'a rien à configurer ni à connaître des fournisseurs → on masque toute la section.
    if(!Relais.showApiSettings){const sa=$('#set-api');if(sa)sa.style.display='none';const pp=$('#privacyProviders');if(pp)pp.style.display='none';const st=$('#setSubtitle');if(st)st.textContent='Modèle et préférences';return;}
    const order=['openrouter','siliconflow'];
    let rows=order.map(pk=>{const pr=PROVIDERS[pk],ok=hasKey(pk);return `<div class="api-row" data-key="${pk}"><span class="api-logo" style="color:${pr.ac}">${pr.logo}</span><div class="api-meta"><div class="api-name">${pr.name}</div><div class="api-sub">${pr.site}</div></div><input class="api-in" name="api-${pk}" type="password" autocomplete="off" spellcheck="false" placeholder="Coller la clé API…" aria-label="Clé API ${pr.name}" value="${esc(Relais.cle(pk)||'')}"><span class="api-st${ok?' on':''}" data-tip="${ok?'Connecté':'Non connecté'}"></span></div>`}).join('');
    const klingOk=hasKey('kling');
    rows+=`<div class="api-row api-kling" data-key="kling"><span class="api-logo" style="color:#ff5c28">${PROVIDERS.kling.logo}</span><div class="api-meta"><div class="api-name">Kling AI</div><div class="api-sub">kling.ai · vidéo</div></div><div class="kling-fields"><input class="api-in" data-kf="kling_ak" name="kling_ak" type="password" autocomplete="off" placeholder="Access Key…" aria-label="Access Key Kling" value="${esc(Relais.cle('kling_ak')||'')}"><input class="api-in" data-kf="kling_sk" name="kling_sk" type="password" autocomplete="off" placeholder="Secret Key…" aria-label="Secret Key Kling" value="${esc(Relais.cle('kling_sk')||'')}"></div><span class="api-st${klingOk?' on':''}" data-tip="${klingOk?'Connecté':'2 clés requises'}"></span></div>`;
    $('#apiList').innerHTML=rows;
    $$('#apiList .api-row:not(.api-kling)').forEach(row=>{const pk=row.dataset.key,inp=row.querySelector('.api-in'),st=row.querySelector('.api-st');
      inp.addEventListener('input',()=>{Relais.poserCle(pk,inp.value);st.classList.toggle('on',hasKey(pk));st.setAttribute('data-tip',hasKey(pk)?'Connecté':'Non connecté');renderModelPicker();syncModel()});
    });
    $$('#apiList [data-kf]').forEach(inp=>{inp.addEventListener('input',()=>{Relais.poserCle(inp.dataset.kf,inp.value);const st=$('#apiList .api-kling .api-st'),ok=hasKey('kling');if(st){st.classList.toggle('on',ok);st.setAttribute('data-tip',ok?'Connecté':'2 clés requises')}renderModelPicker();syncModel()})});
  }
  renderApiList();
  $('#setExport').addEventListener('click',()=>{buildExport().then(data=>{const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='mzai-export.json';a.click();URL.revokeObjectURL(u);toast('Données exportées')}).catch(()=>toast('Export impossible — réessaie'))});
  /* Effacer n'effaçait QUE le local : le premier cloudPull() rapatriait tout
     depuis le serveur et les conversations « supprimées » réapparaissaient.
     On prévient donc le serveur, conversation par conversation, avant de vider. */
  $('#setClear').addEventListener('click',()=>{const keep=Relais.showApiSettings?'Tes clés API et réglages sont conservés.':'Tes préférences d’affichage sont conservées.';if(!window.confirm('Effacer TOUTES les conversations, la corbeille et la mémoire de l\'IA — ici ET sur le serveur ? ('+keep+') Action irréversible.'))return;
    const ids=[...CONVOS,...TRASH].map(c=>c.id);
    CONVOS=[];activeId=null;TRASH=[];saveTrash();setMemory('');MEDIA.clear&&MEDIA.clear();SESSION_TOKENS=0;SESSION_COST=0;try{localStorage.removeItem('mzai:stok');localStorage.removeItem('mzai:scost')}catch(e){}_renderTok(false);saveConvos();renderRecents();renderLibrary('');typeof renderTrash==='function'&&renderTrash();chat.innerHTML='';goHome();
    ids.forEach(id=>{try{cloudDelete(id)}catch(e){}});
    toast('Conversations, corbeille et mémoire effacées')});
  /* Nettoyer : le geste courant. On ne détruit rien — tout part à la corbeille,
     les épinglées restent. C'est réversible, donc pas de confirmation anxiogène. */
  $('#setTidy')&&$('#setTidy').addEventListener('click',()=>{
    const bouge=CONVOS.filter(c=>!c.pinned);
    if(!bouge.length){toast('Rien à nettoyer — tes récentes sont déjà propres');return}
    if(!window.confirm(bouge.length+' conversation'+(bouge.length>1?'s':'')+' vers la corbeille ? Les épinglées restent, et tu peux tout restaurer pendant 30 jours.'))return;
    const t=now();
    bouge.forEach(c=>{c._del=t;TRASH.unshift(c);try{cloudDelete(c.id)}catch(e){}});
    CONVOS=CONVOS.filter(c=>c.pinned);
    if(!CONVOS.some(c=>c.id===activeId)){activeId=null;chat.innerHTML='';goHome()}
    if(TRASH.length>50){const _drop=TRASH.slice(50);TRASH=TRASH.slice(0,50);_mediaPurge(_drop)}
    saveTrash();saveConvos();renderRecents();renderLibrary($('#libSearch')?.value||'');typeof renderTrash==='function'&&renderTrash();
    toast(bouge.length+' conversation'+(bouge.length>1?'s':'')+' dans la corbeille')});

