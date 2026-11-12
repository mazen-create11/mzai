  /* ===== persona studio ("Mon IA") ===== */
  const PRESETS=[
    {n:'Stratège',g:'target',d:'Cadre, priorise, décide',tone:'Direct',length:'Équilibré',traits:['Structuré','Honnête'],sys:'Tu es un stratège. Tu cadres le problème, tu priorises, tu donnes une recommandation claire puis les étapes. Pas de jargon.'},
    {n:'Dev senior',g:'code',d:'Code propre, pragmatique',tone:'Technique',length:'Concis',traits:['Pragmatique','Rigoureux'],sys:'Tu es un développeur senior. Code idiomatique, tu expliques le pourquoi en une ligne, tu signales les pièges. Tu ne réécris pas les tests sans demande.'},
    {n:'Copywriter',g:'wand',d:'Vend, accroche, convertit',tone:'Persuasif',length:'Équilibré',traits:['Créatif','Vif'],sys:'Tu es copywriter conversion. Accroche forte, bénéfices avant features, concret avant abstrait. Tu bannis les clichés IA.'},
    {n:'Mentor',g:'persona',d:'Explique, fait progresser',tone:'Pédagogue',length:'Détaillé',traits:['Patient','Clair'],sys:'Tu es un mentor. Tu expliques pas à pas, tu donnes des exemples, tu vérifies la compréhension avant d\'avancer.'},
    {n:'Analyste',g:'globe',d:'Données, sources, preuves',tone:'Neutre',length:'Détaillé',traits:['Factuel','Rigoureux'],sys:'Tu es analyste. Tu raisonnes par preuves, tu cites tes sources, tu distingues fait, hypothèse et opinion.'},
    {n:'Brut',g:'bolt',d:'Zéro filtre, ultra-rapide',tone:'Cash',length:'Concis',traits:['Cash','Vif'],sys:'Tu vas droit au but. Pas d\'introduction, pas de récap. Réponse, puis next step. Une phrase si une phrase suffit.'},
    {n:'Growth',g:'spark',d:'Acquisition, tests, scale',tone:'Direct',length:'Équilibré',traits:['Pragmatique','Vif'],sys:'Tu es growth marketer. Tu proposes des leviers actionnables, tu chiffres l\'impact attendu, tu penses test & itération. Quick wins d\'abord.'},
    {n:'Closer',g:'card',d:'Vend, négocie, conclut',tone:'Persuasif',length:'Concis',traits:['Vif','Cash'],sys:'Tu es closer B2B. Tu qualifies, tu traites l\'objection, tu pousses vers la décision sans être lourd. Toujours un CTA clair.'},
    {n:'Juriste',g:'shield',d:'Cadre, risques, conformité',tone:'Neutre',length:'Détaillé',traits:['Rigoureux','Clair'],sys:'Tu es juriste. Tu signales les risques, tu cites le cadre applicable, tu distingues obligation et recommandation. Tu n\'inventes jamais une règle.'},
    {n:'Chercheur',g:'atom',d:'Explore, vérifie, synthétise',tone:'Neutre',length:'Détaillé',traits:['Factuel','Curieux'],sys:'Tu es chercheur. Tu explores plusieurs hypothèses, tu vérifies, tu cites, tu conclus avec un niveau de confiance.'},
    {n:'Designer',g:'figma',d:'UI, hiérarchie, détail',tone:'Direct',length:'Équilibré',traits:['Créatif','Clair'],sys:'Tu es designer produit. Tu penses hiérarchie, espacement, états, accessibilité. Tu évites le générique et tu justifies tes choix esthétiques.'},
    {n:'Coach',g:'brain',d:'Motive, structure, fait agir',tone:'Chaleureux',length:'Équilibré',traits:['Patient','Clair'],sys:'Tu es coach. Tu reformules l\'objectif, tu découpes en actions réalistes, tu encourages sans flagornerie. Tu finis par une prochaine étape.'}
  ];
  const TONES=['Direct','Technique','Persuasif','Pédagogue','Neutre','Cash','Chaleureux'];
  const LENGTHS=['Concis','Équilibré','Détaillé'];
  const TRAITS=['Structuré','Honnête','Pragmatique','Rigoureux','Créatif','Vif','Patient','Clair','Factuel','Cash','Chaleureux','Curieux'];
  /* le nom du persona sert d'identité de style — il ne renomme JAMAIS l'app (qui reste MAZ) */
  function applyPersona(){const nm=PERSONA.name||'MAZ';const av=$('#psAv');if(av)av.textContent=nm.trim()[0].toUpperCase()}
  function fillChipset(host,opts,sel,multi){$(host).innerHTML=opts.map(o=>`<div class="chip${(multi?sel.includes(o):sel===o)?' on':''}" data-v="${o}">${o}</div>`).join('')}
  function openPersona(){showView('persona')}     // ex-modale → vue in-place
  function fillPersona(){
    $('#psName').value=PERSONA.name;$('#psSys').value=PERSONA.sys;$('#psAv').textContent=(PERSONA.name||'M').trim()[0].toUpperCase();
    $('#memProfile').value=getProfile();$('#memAuto').value=getMemory();
    $('#psPresets').innerHTML=PRESETS.map((p,i)=>`<div class="ps-preset" data-p="${i}"><div class="pp-ic"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GLYPH[p.g]}</svg></div><div class="pp-t">${p.n}</div><div class="pp-d">${p.d}</div></div>`).join('');
    fillChipset('#psTone',TONES,PERSONA.tone,false);fillChipset('#psLength',LENGTHS,PERSONA.length,false);fillChipset('#psTraits',TRAITS,PERSONA.traits,true);
    bindChips();
    $$('#psPresets .ps-preset').forEach(el=>el.addEventListener('click',()=>{const p=PRESETS[el.dataset.p];$('#psSys').value=p.sys;PERSONA.tone=p.tone;PERSONA.length=p.length;PERSONA.traits=[...p.traits];fillChipset('#psTone',TONES,PERSONA.tone,false);fillChipset('#psLength',LENGTHS,PERSONA.length,false);fillChipset('#psTraits',TRAITS,PERSONA.traits,true);bindChips();toast('Modèle « '+p.n+' » appliqué')}));
  }
  function bindChips(){
    $$('#psTone .chip').forEach(c=>c.onclick=()=>{$$('#psTone .chip').forEach(x=>x.classList.remove('on'));c.classList.add('on');PERSONA.tone=c.dataset.v});
    $$('#psLength .chip').forEach(c=>c.onclick=()=>{$$('#psLength .chip').forEach(x=>x.classList.remove('on'));c.classList.add('on');PERSONA.length=c.dataset.v});
    $$('#psTraits .chip').forEach(c=>c.onclick=()=>{c.classList.toggle('on');const v=c.dataset.v,i=PERSONA.traits.indexOf(v);i<0?PERSONA.traits.push(v):PERSONA.traits.splice(i,1)});
  }
  $('#psName').addEventListener('input',e=>$('#psAv').textContent=(e.target.value||'M').trim()[0].toUpperCase());
  $('#psBack').addEventListener('click',()=>showView(activeId?'chat':'home'));
  $('#psSave').addEventListener('click',()=>{PERSONA.name=($('#psName').value.trim()||'MAZ');PERSONA.sys=$('#psSys').value.trim();DB.set('persona',PERSONA);setProfile($('#memProfile').value.trim());setMemory($('#memAuto').value.trim());applyPersona();syncModel();toast(PERSONA.name+' est prête ✦')});
  $('#memClear').addEventListener('click',()=>{setMemory('');$('#memAuto').value='';toast('Mémoire auto effacée')});
  $('#psReset').addEventListener('click',()=>{Object.assign(PERSONA,{name:'MAZ',tone:'Direct',length:'Équilibré',sys:'',traits:[]});DB.set('persona',PERSONA);fillPersona();applyPersona();toast('Persona réinitialisée')});

  /* ===== command palette ===== */
  const COMMANDS=[
    {s:'Navigation',items:[
      {t:'Accueil',d:'Retour à l’écran principal',ic:'<path d="M3 12l9-9 9 9M5 10v10h14V10"/>',run:goHome},
      {t:'Discussions',d:'Toutes tes conversations',ic:'<path d="M21 11.5a8.5 8.5 0 0 1-12.5 7.5L3 21l2-5.5A8.5 8.5 0 1 1 21 11.5z"/>',run:()=>showView('library')},
      {t:'Projets',d:'Espaces de travail',ic:'<path d="M4.5 16.5 12 21l7.5-4.5M12 3 4.5 7.5 12 12l7.5-4.5z"/>',run:()=>showView('projects')},
      {t:'Intégrations',d:'Outils connectés',ic:'<path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7"/>',run:()=>showView('integrations')}
    ]},
    {s:'Actions',items:[
      {t:'Nouvelle conversation',d:'Repartir de zéro',ic:'<path d="M12 5v14M5 12h14"/>',run:newChat},
      {t:'Paramètres',d:'Préférences et compte',ic:'<circle cx="12" cy="12" r="3"/>',run:openSettings},
      {t:'Changer de modèle',d:currentModel,ic:'<path d="M12 2.5l2.4 6.1 6.1 2.4-6.1 2.4L12 19.5l-2.4-6.1L3.5 11z"/>',run:()=>openModel($('#modelPill'))}
    ]}
  ];
  function openPalette(){$('#palette').classList.add('show');$('#cpInput').value='';renderCP('');setTimeout(()=>$('#cpInput').focus(),60)}
  function closePalette(){$('#palette').classList.remove('show')}
  function renderCP(q){
    q=q.toLowerCase();let html='',idx=0;cpFlat=[];
    const recHits=q?CONVOS.filter(c=>c.title.toLowerCase().includes(q)):[];
    COMMANDS.forEach(sec=>{
      const hits=sec.items.filter(it=>it.t.toLowerCase().includes(q)||it.d.toLowerCase().includes(q));
      if(!hits.length)return;html+=`<div class="cp-sec">${sec.s}</div>`;
      hits.forEach(it=>{cpFlat.push(it);html+=`<div class="cp-item${idx===0?' k':''}" data-i="${idx}"><div class="ci2"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${it.ic}</svg></div><div><div class="ct2">${it.t}</div><div class="cd2">${it.d}</div></div><span class="cgo">↵</span></div>`;idx++});
    });
    if(recHits.length){html+='<div class="cp-sec">Conversations</div>';recHits.forEach(c=>{const it={run:()=>openConvo(c.id)};cpFlat.push(it);html+=`<div class="cp-item" data-i="${idx}"><div class="ci2"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.5 8.5 0 0 1-12.5 7.5L3 21l2-5.5A8.5 8.5 0 1 1 21 11.5z"/></svg></div><div><div class="ct2">${esc(c.title)}</div><div class="cd2">${c.msgs.length} message${c.msgs.length>1?'s':''} · ${ago(c.ts)}</div></div><span class="cgo">↵</span></div>`;idx++})}
    $('#cpList').innerHTML=html||'<div class="cp-empty">Aucun résultat</div>';
    $$('#cpList .cp-item').forEach(el=>el.addEventListener('click',()=>{closePalette();cpFlat[el.dataset.i].run()}));
  }
  let cpFlat=[];
  $('#cpInput').addEventListener('input',e=>renderCP(e.target.value));
  $('#cpInput').addEventListener('keydown',e=>{
    const items=$$('#cpList .cp-item');if(!items.length)return;
    let k=items.findIndex(i=>i.classList.contains('k'));
    if(e.key==='ArrowDown'){e.preventDefault();k=Math.min(k+1,items.length-1)}
    else if(e.key==='ArrowUp'){e.preventDefault();k=Math.max(k-1,0)}
    else if(e.key==='Enter'){e.preventDefault();const sel=items[k<0?0:k];sel&&sel.click();return}
    else return;
    items.forEach(i=>i.classList.remove('k'));items[k].classList.add('k');items[k].scrollIntoView({block:'nearest'})
  });
  $('#palette').addEventListener('click',e=>{if(e.target.id==='palette')closePalette()});

  /* global keys */
  document.addEventListener('keydown',e=>{
    if((e.metaKey||e.ctrlKey)&&e.key==='k'){e.preventDefault();openPalette()}
    if((e.metaKey||e.ctrlKey)&&(e.key==='j'||e.key==='J')){e.preventDefault();openPersona()}
    if((e.metaKey||e.ctrlKey)&&(e.key==='n'||e.key==='N')){e.preventDefault();newChat()}
    if(e.key==='Escape'){if($('#onboard')&&$('#onboard').classList.contains('show')){typeof obFinish==='function'&&obFinish();return;}closePalette();['#settings','#persona','#shortcuts','#projModal','#profileModal','#billingModal','#helpModal','#newsModal','#trashModal','#artifactModal','#promptsModal','#prPrev'].forEach(s=>$(s)&&$(s).classList.remove('show'));closeSlash();closePop()}
  });
  const SHORTCUTS=[['Palette de commandes','⌘ K'],['Personnaliser mon IA','⌘ J'],['Nouvelle conversation','⌘ N'],['Envoyer le message','⏎'],['Nouvelle ligne','⇧ ⏎'],['Réduire la barre latérale','clic ▢'],['Tout fermer','Esc']];
  $('#scList').innerHTML='<div class="set-group" style="margin-top:4px">'+SHORTCUTS.map(([t,k])=>`<div class="set-row"><div class="sr-main"><div class="sr-t">${t}</div></div><kbd style="font-family:var(--font-mono);font-size:12px;color:var(--txt-dim);border:1px solid var(--line-2);border-radius:7px;padding:4px 9px;background:var(--elev)">${k}</kbd></div>`).join('')+'</div>';
  $('#scClose').addEventListener('click',()=>$('#shortcuts').classList.remove('show'));
  $('#shortcuts').addEventListener('click',e=>{if(e.target.id==='shortcuts')$('#shortcuts').classList.remove('show')});

