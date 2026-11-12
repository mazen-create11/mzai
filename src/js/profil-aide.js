  /* profile popover (app 100% locale — contenu honnête) */
  const SET_GEAR='<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>';
  const SUN_IC='<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';
  const pfIco=p=>`<div class="pi-i"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg></div>`;
  function themeLabel(){const c=DB.get('theme','dark');
    return c==='auto'?'Auto':(c==='dark'?'Sombre':'Clair')}   /* le libellé dit le CHOIX, pas son résultat du moment */
  function renderProfilePop(){
    const email=(USER.email&&USER.email.trim())?USER.email:'Compte local';
    const ini=((USER.name||'').trim()[0]||'M').toUpperCase();
    const items=[
      ['set','Paramètres',SET_GEAR],
      ['persona','Mon IA',GLYPH.persona],
      ['theme','Thème',SUN_IC],
      ['export','Exporter mes données',GLYPH.export],
      ['help','Aide',GLYPH.help]
    ];
    $('#popProfile').innerHTML=
      `<div class="pi sel"><div class="pi-i" style="background:var(--accent);color:var(--ink-on-accent);border-color:transparent;font-family:var(--font-display);font-weight:600">${esc(ini)}</div><div class="pi-main"><div class="pi-t">${esc(USER.name||'Mon espace')}</div><div class="pi-d">${esc(email)}</div></div></div><div class="sep"></div>`
      +items.map(([pf,t,svg])=>`<div class="pi" data-pf="${pf}">${pfIco(svg)}<div class="pi-main"><div class="pi-t">${t}</div></div>${pf==='theme'?`<span class="pi-tail">${themeLabel()}</span>`:''}</div>`).join('')
      +'<div class="sep"></div>'
      +(VIA_PROXY?`<div class="pi" data-pf="logout">${pfIco('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>')}<div class="pi-main"><div class="pi-t">Se déconnecter</div></div></div>`:'')
      +`<div class="pi danger" data-pf="clear">${pfIco(GLYPH.trash)}<div class="pi-main"><div class="pi-t">Effacer les données locales</div></div></div>`;
    $$('#popProfile .pi[data-pf]').forEach(p=>p.addEventListener('click',()=>{
      const a=p.dataset.pf;
      if(a==='theme'){toggleTheme();const tl=p.querySelector('.pi-tail');if(tl)tl.textContent=themeLabel();return}
      closePop();
      if(a==='set')openSettings();
      else if(a==='persona')openPersona();
      else if(a==='export')$('#setExport').click();
      else if(a==='help')openHelp();
      else if(a==='logout')logout();
      else if(a==='clear')clearLocalData();
    }));
  }
  renderProfilePop();
  $('#profileBtn').setAttribute('data-popanchor','');
  $('#profileBtn').addEventListener('click',()=>{
    if(openPop===$('#popProfile')){closePop();return}
    const tl=$('#popProfile .pi[data-pf="theme"] .pi-tail');if(tl)tl.textContent=themeLabel();   // reflète l'état courant à l'ouverture
    showPop($('#popProfile'),$('#profileBtn'),'left',$('#profileBtn'));
  });

  /* ===== utilisateur ===== */
  function applyUser(){
    const ini=((USER.name||'').trim()[0]||'M').toUpperCase();
    const av=$('.profile .avatar');if(av){const _m=av.querySelector('.av-m');if(_m)_m.textContent=ini;else av.textContent=ini;av.style.background=USER.avColor}
    const nm=$('.profile .name');if(nm)nm.textContent=USER.name;
    const sb=$('.profile .sub');if(sb)sb.textContent=USER.role;
    majGreet();majHomeEtat();
    const hp=$('#popProfile .pi.sel');if(hp){const i=hp.querySelector('.pi-i');i.textContent=ini;i.style.background=USER.avColor;hp.querySelector('.pi-t').textContent=USER.name;hp.querySelector('.pi-d').textContent=USER.email}
  }
  /* profil */
  let pfColor=USER.avColor;
  function openProfile(){
    pfColor=USER.avColor;$('#pfName').value=USER.name;$('#pfEmail').value=USER.email;$('#pfRole').value=USER.role;
    $('#pfAv').textContent=((USER.name||'').trim()[0]||'M').toUpperCase();$('#pfAv').style.background=USER.avColor;
    $('#pfNameP').textContent=USER.name;$('#pfEmailP').textContent=USER.email;
    $('#pfColors').innerHTML=PCOLORS.map(c=>`<div class="swatch${c===pfColor?' on':''}" data-c="${c}" style="background:${c}"></div>`).join('');
    $$('#pfColors .swatch').forEach(s=>s.onclick=()=>{$$('#pfColors .swatch').forEach(x=>x.classList.remove('on'));s.classList.add('on');pfColor=s.dataset.c;$('#pfAv').style.background=pfColor});
    $('#profileModal').classList.add('show');
  }
  $('#pfName').addEventListener('input',e=>{const v=e.target.value||'M';$('#pfAv').textContent=v.trim()[0].toUpperCase();$('#pfNameP').textContent=v});
  $('#pfEmail').addEventListener('input',e=>$('#pfEmailP').textContent=e.target.value);
  $('#pfClose').addEventListener('click',()=>$('#profileModal').classList.remove('show'));
  $('#pfCancel').addEventListener('click',()=>$('#profileModal').classList.remove('show'));
  $('#profileModal').addEventListener('click',e=>{if(e.target.id==='profileModal')$('#profileModal').classList.remove('show')});
  $('#pfSave').addEventListener('click',()=>{USER.name=$('#pfName').value.trim();USER.email=$('#pfEmail').value.trim();USER.role=$('#pfRole').value.trim()||'Compte';USER.avColor=pfColor;DB.set('user',USER);applyUser();$('#profileModal').classList.remove('show');toast('Profil enregistré')});
  /* activité — données réelles locales (pas de quota/facture fictifs) */
  function openBilling(){
    let msgTotal=0; CONVOS.forEach(c=>msgTotal+=(c.msgs?c.msgs.length:0));
    let bytes=0; try{for(const k in localStorage){if(Object.prototype.hasOwnProperty.call(localStorage,k)&&k.indexOf('mzai:')===0)bytes+=(localStorage[k]||'').length+k.length;}}catch(e){}
    const ko=bytes>1048576?(bytes/1048576).toFixed(1)+' Mo':(bytes/1024).toFixed(0)+' Ko';
    const stats=[['Conversations',CONVOS.length.toLocaleString('fr-FR')],['Messages échangés',msgTotal.toLocaleString('fr-FR')],['Modèle par défaut',currentModel],['Stockage local',ko]];
    $('#usageList').innerHTML=stats.map(([l,v])=>`<div class="usage"><span class="usage-l">${l}</span><b class="usage-v">${esc(String(v))}</b></div>`).join('');
    $('#billingModal').classList.add('show');
  }
  $('#blClose').addEventListener('click',()=>$('#billingModal').classList.remove('show'));
  $('#billingModal').addEventListener('click',e=>{if(e.target.id==='billingModal')$('#billingModal').classList.remove('show')});
  $('#blUpgrade').addEventListener('click',()=>$('#billingModal').classList.remove('show'));
  /* aide */
  const HELP_LINKS=JSON.parse(`[["Documentation","Guides de prise en main, outils, modèles et réglages, pas à pas avec captures.","note"],["Raccourcis clavier","⌘J (Mon IA), / pour les commandes, ⌘K recherche et plus pour aller plus vite.","keyboard"],["Nous contacter","Une question, un bug, une idée ? Écris-nous à support@mzai.app, réponse rapide.","mail"],["Statut des services","Disponibilité en temps réel des modèles et fournisseurs (OpenRouter, SiliconFlow, Kling).","globe"],["Confidentialité","Tout reste en local sur ton appareil. Détail de ce qui est stocké et jamais envoyé.","shield"]]`);
  const FAQ=JSON.parse(`[["Comment changer de modèle ?","Clique sur la pastille du modèle en haut à droite (« MAZ Auto » par défaut), ou sur le bouton Modèles sous le champ de saisie, puis choisis ton modèle texte, image, vidéo ou voix."],["C'est quoi MAZ Auto ?","MAZ Auto est le routeur intelligent : il choisit automatiquement le meilleur modèle selon ta tâche (raisonnement, code, rapidité…). Laisse-le sélectionné, ou force un modèle précis dans le sélecteur si tu veux garder la main."],["Où ajouter mes clés API ?","Menu Plus › Connexions API (ou Réglages › Clés API). Colle OpenRouter pour le texte, SiliconFlow pour image, voix et transcription, et Kling (Access Key + Secret Key) pour la vidéo. Les clés restent sur ton appareil."],["Mes données sont-elles privées ?","Oui. Conversations, projets, persona et clés sont stockés en local (localStorage) sur ton appareil. Rien ne part vers un serveur, sauf l'appel direct au modèle quand tu envoies un message avec ta propre clé."],["Comment personnaliser Mon IA ?","Ouvre Mon IA via le raccourci ⌘J (ou le menu latéral). Définis le nom, le ton, la longueur des réponses, les traits et les instructions système : c'est appliqué à toutes tes conversations."],["À quoi servent les Projets ?","Un Projet est un espace de travail avec un Contexte permanent (marque, ton, cible, contraintes) injecté dans chaque réponse. Va dans Projets › Nouveau projet, remplis le contexte ; les conversations s'y rattachent automatiquement."],["Quels outils propose MAZ ?","10 outils : Assistant, Image, Vidéo, Voix (TTS), Code/Canvas (aperçu live HTML), Documents (PDF/DOCX/XLSX), Traduction, Transcription, Recherche web sourcée et Réflexion. Sélectionne-les dans la barre d'outils sous le champ de saisie."],["Comment utiliser les commandes /prompt ?","Tape « / » au début du champ de saisie pour afficher les commandes (traduire, résumer, coder, image…). Choisis-en une pour pré-remplir un prompt prêt à compléter."],["Comment exporter mes données ?","Réglages › Exporter mes données pour tout récupérer en JSON (conversations + réglages). Pour une seule conversation, survole-la dans la Bibliothèque et clique sur l'icône Exporter (.md)."],["Puis-je installer MAZ comme une app (PWA) ?","Oui. Sur Chrome/Edge, clique sur l'icône d'installation dans la barre d'adresse ; sur iPhone (Safari), Partager › Sur l'écran d'accueil. MAZ s'ouvre alors en fenêtre dédiée, hors navigateur."],["Pourquoi un outil me demande une clé API ?","Chaque type de génération passe par son fournisseur : texte (OpenRouter), image/voix/transcription (SiliconFlow), vidéo (Kling). Si la clé correspondante manque, ajoute-la dans Connexions API et réessaie."]]`);
  function openHelp(){showView('help')}            // ex-modale → vue in-place
  function renderHelp(){
    // Mode hébergé : rien sur les fournisseurs, les clés ou le « statut des services » (infra interne).
    const hl=HELP_LINKS.filter(l=>!(VIA_PROXY&&l[0]==='Statut des services')).map(l=>{
      if(VIA_PROXY&&l[0]==='Confidentialité')return[l[0],'Tes conversations te suivent sur tous tes appareils, chiffrées en transit. Personne d’autre n’y a accès.',l[2]];
      return l;});
    const faq=FAQ.filter(([q,a])=>!/cl[ée]s?\s*api/i.test(q)&&!((VIA_PROXY||!SHOW_API_SETTINGS)&&(/cl[ée]|openrouter|siliconflow|kling/i.test(q)||/openrouter|siliconflow|kling|ta propre clé/i.test(a)))).map(([q,a])=>{
      if(VIA_PROXY&&/priv[ée]e?s?\b/i.test(q))return[q,'Oui. Tes conversations, projets et persona sont synchronisés de façon chiffrée sur ton espace privé et te suivent sur tous tes appareils. Personne d’autre n’y a accès.'];
      return[q,a];});
    $('#helpLinks').innerHTML=hl.map((l,i)=>`<div class="help-link" data-h="${i}"><div class="hl-ic"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GLYPH[l[2]]||GLYPH.spark}</svg></div><div style="min-width:0"><div class="hl-t">${l[0]}</div><div class="hl-d">${l[1]}</div></div></div>`).join('');
    $('#faqList').innerHTML='<button class="help-cta" id="helpAssistant"><span class="hc-ic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-12.5 7.5L3 21l2-5.5A8.5 8.5 0 1 1 21 11.5z"/></svg></span><div class="min0"><div class="hc-t">Demander à l\'assistant MAZ</div><div class="hc-d">Une question précise ? L\'IA te guide pas à pas, en direct.</div></div><svg class="hc-go" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg></button>'
      +faq.map(([q,a])=>`<div class="faq"><div class="faq-q">${q}<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m6 9 6 6 6-6"/></svg></div><div class="faq-a"><div>${a}</div></div></div>`).join('');
    $('#helpAssistant').onclick=launchAide;
    $$('#helpLinks .help-link').forEach(el=>el.onclick=()=>{const i=+el.dataset.h,t=hl[i][0];if(t==='Raccourcis clavier'){$('#shortcuts').classList.add('show')}else toast(t==='Statut des services'?'Tous les systèmes sont opérationnels ✓':hl[i][1])});
    $$('#faqList .faq-q').forEach(q=>q.onclick=()=>q.parentElement.classList.toggle('open'));
  }
  $('#hpBack').addEventListener('click',()=>showView(activeId?'chat':'home'));
  function logout(){
    if(!window.confirm('Se déconnecter de MAZ ? Tes conversations restent sur ton espace privé et reviennent à la reconnexion.'))return;
    // purge locale AVANT de retirer l'identité (sinon les données resteraient visibles pour le prochain compte sur cet appareil)
    try{CONVOS.length=0;TRASH.length=0;PROJECTS.length=0;activeId=null;
      saveConvosSync&&saveConvosSync();saveTrash&&saveTrash();saveProjects&&saveProjects();setMemory&&setMemory('');
    }catch(e){}
    // retirer AUSSI identité + persona : sinon, cloud_uid supprimé, la purge cross-compte de onAuthed est sautée et le prochain compte hériterait du nom/avatar/persona du précédent
    try{['mzai:acode','mzai:cloud_uid','mzai:user','mzai:persona'].forEach(k=>localStorage.removeItem(k));}catch(e){}
    location.reload();   // au boot, plus de code → écran d'accès (gate) ; user/persona repartent par défaut
  }
  /* Aide : lance l'assistant « Aide MAZ » dans une nouvelle conversation */
  function launchAide(){const a=ASSISTANTS.find(x=>x.id==='aide');if(!a){openHelp();return}const c=createConvo();c.title=a.name;c.assistant=a.id;saveConvos();openConvo(c.id);if(window.innerWidth<=1024){$('#sidebar').classList.remove('open');$('#scrim').classList.remove('show')}}
  /* Efface toutes les données locales puis recharge */
  function clearLocalData(){const scope=SHOW_API_SETTINGS?'conversations, réglages, mémoire et clés API':'conversations, réglages et mémoire';if(!window.confirm('Effacer toutes les données locales ('+scope+') ? Cette action est irréversible.'))return;try{Object.keys(localStorage).filter(k=>k.indexOf('mzai:')===0).forEach(k=>localStorage.removeItem(k))}catch(e){}try{MEDIA.clear&&MEDIA.clear()}catch(e){}try{indexedDB.deleteDatabase('maz-media')}catch(e){}setTimeout(()=>location.reload(),60)}

  /* comparateur de modèles retiré (V2) — voir renderModelPicker pour le choix du modèle */

  /* nouveautés */
  const NEWS=[
    {v:'1.0',d:'Juin 2026',items:[
      {tag:'new',t:'Modèles chinois en direct',d:'DeepSeek V4 Pro/Flash, Qwen3, Kimi K2.7 et GLM-5.2 via OpenRouter & SiliconFlow. MAZ Auto choisit le bon modèle selon ta tâche.'},
      {tag:'new',t:'Raisonnement visible',d:'La chaîne de pensée du modèle s\'affiche en direct dans un bloc dépliable.'},
      {tag:'new',t:'Recherche web réelle',d:'Réponses sourcées avec citations cliquables quand la recherche est activée.'},
      {tag:'new',t:'Mon IA — Persona Studio',d:'Définis nom, ton, longueur, traits et instructions système.'},
      {tag:'new',t:'Projets & Bibliothèque',d:'Organise tes conversations par espace de travail, avec type et contexte dédiés.'},
      {tag:'imp',t:'Blocs de code',d:'Coloration syntaxique, copie en un clic et aperçu live des artefacts HTML.'},
      {tag:'imp',t:'Recherche universelle ⌘K',d:'Navigation, actions et conversations au clavier en une frappe.'},
      {tag:'imp',t:'Usage réel',d:'Temps, tokens et coût affichés sous chaque réponse.'}
    ]}
  ];
  const ROADMAP=[['bolt','Application mobile','Planifié'],['brain','Mémoire longue durée','Exploré'],['chip','Kling I2V · Wan I2V · FLUX edit','Branché']];
  function openNews(){
    $('#newsLog').innerHTML=NEWS.map(r=>`<div class="nw-rel"><div class="nw-rel-h"><span class="nw-rel-v">Version ${r.v}</span><span class="nw-rel-d">${r.d}</span></div>${r.items.map(it=>`<div class="nw-item"><span class="nw-tag ${it.tag}">${it.tag==='new'?'Nouveau':it.tag==='imp'?'Amélioré':'Corrigé'}</span><div style="min-width:0"><div class="nw-it-t">${it.t}</div><div class="nw-it-d">${it.d}</div></div></div>`).join('')}</div>`).join('');
    $('#newsRoad').innerHTML=ROADMAP.map(([g,t,s])=>`<div class="nw-road"><span class="nr-ic"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GLYPH[g]}</svg></span>${t}<span class="nr-soon">${s}</span></div>`).join('');
    $('#newsModal').classList.add('show');
  }
  $('#nwClose').addEventListener('click',()=>$('#newsModal').classList.remove('show'));
  $('#newsModal').addEventListener('click',e=>{if(e.target.id==='newsModal')$('#newsModal').classList.remove('show')});

  /* more popover */
  $('#popMore').innerHTML='<div class="ph">Plus</div>'+
    [['Modèles','chip'],['Bibliothèque de prompts','wand'],['Raccourcis clavier','keyboard'],['Importer une conversation','import'],['Exporter mes données','export'],['Corbeille','trash'],['Nouveautés','spark'],['Conditions & confidentialité','shield']]
    .map(([t,g])=>`<div class="pi" data-more="${t}"><div class="pi-i"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GLYPH[g]}</svg></div><div class="pi-main"><div class="pi-t">${t}</div></div></div>`).join('');
  $$('#popMore .pi').forEach(p=>p.addEventListener('click',e=>{e.stopPropagation();closePop();if(window.innerWidth<=1024){$('#sidebar').classList.remove('open');$('#scrim').classList.remove('show')}const a=p.dataset.more;
    if(a==='Modèles')setTimeout(()=>openModel($('#modelPill')),0);
    else if(a==='Bibliothèque de prompts')openPrompts();
    else if(a==='Raccourcis clavier')$('#shortcuts').classList.add('show');
    else if(a==='Importer une conversation'){importMode=true;$('#fileInput').multiple=false;$('#fileInput').click()}
    else if(a==='Exporter mes données'){buildExport().then(data=>{const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const u=URL.createObjectURL(blob),link=document.createElement('a');link.href=u;link.download='mzai-export.json';link.click();URL.revokeObjectURL(u);toast('Données exportées')}).catch(()=>toast('Export impossible — réessaie'))}
    else if(a==='Nouveautés')openNews();
    else if(a==='Corbeille')openTrash();
    else if(a==='Conditions & confidentialité')openHelp();
    else toast(a);
  }));

