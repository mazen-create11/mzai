  /* ===== render data ===== */
  function renderRecents(){
    const list=sortedConvos();
    if(!list.length){$('#recentList').innerHTML='<div style="font-size:12px;color:var(--txt-faint);padding:8px 12px;line-height:1.5">Aucune conversation.<br>Lance-toi ✦</div>';return}
    $('#recentList').innerHTML=list.map(c=>{const act=c.id===activeId;return `<div class="chat-pill${act?' active':''}" data-id="${c.id}" data-tip="${esc(c.title)}"><span class="pill-ic">${act?'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-12.5 7.5L3 21l2-5.5A8.5 8.5 0 1 1 21 11.5z"/></svg>':'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-12.5 7.5L3 21l2-5.5A8.5 8.5 0 1 1 21 11.5z"/></svg>'}</span><span class="t">${esc(c.title)}</span>${c.pinned?'<span class="pill-pin" data-tip="Épinglée"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">'+GLYPH.pin+'</svg></span>':''}${act?'<span class="pill-live"></span>':''}<span class="ago">${ago(c.ts)}</span><span class="pill-acts"><span class="pa" data-act="pin" data-tip="${c.pinned?'Désépingler':'Épingler'}"><svg width="13" height="13" viewBox="0 0 24 24" fill="${c.pinned?'currentColor':'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GLYPH.pin}</svg></span><span class="pa" data-act="rename" data-tip="Renommer"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></span><span class="pa" data-act="del" data-tip="Corbeille"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GLYPH.trash}</svg></span></span></div>`}).join('');
    $$('#recentList .chat-pill').forEach(p=>{
      p.addEventListener('click',e=>{if(e.target.closest('.pa'))return;openConvo(p.dataset.id)});
      p.querySelector('[data-act=pin]').addEventListener('click',e=>{e.stopPropagation();togglePin(p.dataset.id)});
      p.querySelector('[data-act=rename]').addEventListener('click',e=>{e.stopPropagation();renameConvo(p.dataset.id)});
      p.querySelector('[data-act=del]').addEventListener('click',e=>{e.stopPropagation();deleteConvo(p.dataset.id)});
    });
  }
  function renderLibrary(filter=''){
    const raw=filter.trim(),tagF=raw.startsWith('#')?raw.slice(1).toLowerCase():null,q=raw.toLowerCase();
    const f=sortedConvos().filter(c=>tagF?(c.tags||[]).some(t=>t.toLowerCase()===tagF):((c.title||'').toLowerCase().includes(q)||c.msgs.some(m=>(m.text||'').toLowerCase().includes(q))||(c.tags||[]).some(t=>t.toLowerCase().includes(q))));
    $('#libList').innerHTML=f.length?f.map(c=>{const tags=(c.tags||[]).map(t=>`<span class="ltag" data-tag="${esc(t)}">${esc(t)}</span>`).join('');return `<div class="lrow" data-id="${c.id}"><div class="lic">${c.pinned?'<span class="lic-pin"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">'+GLYPH.pin+'</svg></span>':''}<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${LIC.chat}</svg></div><div style="min-width:0;flex:1"><div class="ln">${esc(c.title)}</div>${tags?`<div class="ltags">${tags}</div>`:''}</div><div class="lacts"><span class="la" data-la="pin" data-tip="${c.pinned?'Désépingler':'Épingler'}"><svg width="14" height="14" viewBox="0 0 24 24" fill="${c.pinned?'currentColor':'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GLYPH.pin}</svg></span><span class="la" data-la="tag" data-tip="Tags"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GLYPH.tag}</svg></span><span class="la" data-la="export" data-tip="Exporter"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GLYPH.export}</svg></span><span class="la" data-la="del" data-tip="Corbeille"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GLYPH.trash}</svg></span></div><div class="lright">${ago(c.ts)}</div></div>`}).join(''):`<div class="cp-empty">${raw?'Aucun résultat pour « '+esc(raw)+' »':'Aucune conversation pour le moment.'}</div>`;
    if(!f.length&&!raw){const empty=$('#libList .cp-empty');if(empty){empty.className='empty-state library-empty';empty.innerHTML='<div class="es-ic"><svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.5 8.5 0 1 1-4.4-7.5"/><path d="M21 4v5h-5"/><path d="M7.5 11.5h.01M12 11.5h.01M16.5 11.5h.01"/></svg></div><div class="es-t">Ta prochaine bonne idée est ici.</div><div class="es-d">Lance une conversation et garde chaque échange important à portée de main.</div><button type="button" class="vbtn library-empty-cta">Nouvelle conversation</button>';empty.querySelector('.library-empty-cta').addEventListener('click',newChat)}}
    $$('#libList .lrow').forEach(r=>{const id=r.dataset.id;
      r.addEventListener('click',e=>{if(e.target.closest('.la')||e.target.closest('.ltag'))return;openConvo(id)});
      r.querySelector('[data-la=pin]').addEventListener('click',e=>{e.stopPropagation();togglePin(id)});
      r.querySelector('[data-la=tag]').addEventListener('click',e=>{e.stopPropagation();editTags(id)});
      r.querySelector('[data-la=export]').addEventListener('click',e=>{e.stopPropagation();exportConvo(id)});
      r.querySelector('[data-la=del]').addEventListener('click',e=>{e.stopPropagation();deleteConvo(id)});
      r.querySelectorAll('.ltag').forEach(t=>t.addEventListener('click',e=>{e.stopPropagation();$('#libSearch').value='#'+t.dataset.tag;renderLibrary('#'+t.dataset.tag)}));
    });
  }
  function togglePin(id){const c=convoById(id);if(!c)return;c.pinned=!c.pinned;saveConvos();renderRecents();renderLibrary($('#libSearch')?.value||'');toast(c.pinned?'Conversation épinglée':'Désépinglée')}
  function editTags(id){const c=convoById(id);if(!c)return;const v=window.prompt('Tags (séparés par des virgules)',(c.tags||[]).join(', '));if(v===null)return;c.tags=v.split(',').map(s=>s.trim()).filter(Boolean).slice(0,6);saveConvos();renderLibrary($('#libSearch')?.value||'');toast('Tags mis à jour')}
  // export portable : réhydrate images/OCR + inline l'audio depuis IndexedDB pour que la sauvegarde fonctionne sur un autre appareil
  async function buildExport(){
    const convs=[];
    for(const c of CONVOS){
      await rehydrateFiles(c);
      const cc=Object.assign({},c);
      cc.msgs=await Promise.all((c.msgs||[]).map(async m=>{
        const mm=Object.assign({},m);
        if(m.media&&m.media.mid&&!m.media.url){const u=await MEDIA.get(m.media.mid);if(u)mm.media=Object.assign({},m.media,{url:u});}
        if(Array.isArray(m.files))mm.files=m.files.map(f=>{const ff=Object.assign({},f);delete ff.file;return ff;});
        return mm;
      }));
      convs.push(cc);
    }
    return {version:2,model:currentModel,persona:PERSONA,settings:SETTINGS,conversations:convs,projects:PROJECTS,prompts:PROMPTS,memory:getMemory(),exportedAt:new Date().toISOString()};
  }
  function exportConvo(id){const c=convoById(id);if(!c)return;const md='# '+c.title+'\n\n'+c.msgs.map(m=>(m.role==='user'?'**Toi**\n\n':'**'+(m.model||'MAZ')+'**\n\n')+(m.text||(m.media?'_['+m.media.type+' généré : '+(m.media.prompt||'')+']_':''))).join('\n\n---\n\n')+'\n';const blob=new Blob([md],{type:'text/markdown'}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=(c.title||'conversation').replace(/[^\wÀ-ſ-]+/g,'_').slice(0,50)+'.md';a.click();URL.revokeObjectURL(u);toast('Conversation exportée (.md)')}
  const ASSISTANTS = [
    { id: 'aide', name: 'Aide MAZ', desc: 'Prise en main, fonctions & réglages', color: '#16B87A', icon: 'help', prompt: "Tu es l'assistant d'aide intégré de MAZ, une application de chat IA premium. Tu connais parfaitement l'app et tu guides l'utilisateur pas à pas dans l'interface. Fonctions clés : le sélecteur de modèle en haut à droite (DeepSeek, Qwen, Kimi, GLM, MiniMax — et « MAZ Auto » qui choisit automatiquement le meilleur modèle selon la demande) ; les modes Image, Vidéo et Voix dans la barre d'outils sous le champ de saisie ; les Projets (espaces avec contexte permanent) ; la Bibliothèque (historique et recherche) ; « Mon IA » (⌘J) pour définir nom, ton, longueur et instructions système ; et les clés API à coller dans Réglages › Clés API (OpenRouter pour le texte, SiliconFlow pour l'image/voix, Kling pour la vidéo). Réponds de façon claire, concrète et bienveillante, en indiquant toujours où cliquer. Si une fonction nécessite une clé API non renseignée, explique calmement où l'ajouter." },
    { id: 'dev', name: 'Développeur Senior', desc: 'Code propre, architecture & debug', color: '#9E6B8A', icon: 'code', prompt: 'Tu es un développeur senior expert. Tu fournis du code propre, moderne, testé et optimisé, et tu expliques brièvement tes choix techniques. Tu repères les bugs et proposes le correctif minimal. Tu privilégies la lisibilité et la robustesse.' },
    { id: 'copy', name: 'Copywriter', desc: 'Textes qui vendent, emails & hooks', color: '#f43f5e', icon: 'pen', prompt: 'Tu es un copywriter professionnel. Tu écris des textes persuasifs, vivants et orientés conversion, avec des accroches fortes. Tu utilises les structures éprouvées (AIDA, PAS, BAB) sans jargon ni clichés IA, et tu proposes plusieurs variantes quand c\'est utile.' },
    { id: 'seo', name: 'Expert SEO', desc: 'Mots-clés, structure & contenu Google', color: '#10b981', icon: 'search', prompt: 'Tu es un expert SEO. Tu trouves des mots-clés pertinents avec intention de recherche, tu structures les pages (titres, balises, maillage) et tu rédiges un contenu lisible qui plaît à Google comme aux IA génératives (EEAT, citabilité).' },
    { id: 'data', name: 'Analyste Data', desc: 'SQL, Excel & lecture de chiffres', color: '#C15D3C', icon: 'chart', prompt: 'Tu es un analyste data pointu. Tu interprètes des données, tu écris des requêtes SQL et des formules Excel/Sheets, et tu transformes les chiffres en décisions claires. Tu signales les biais et les limites des données.' },
    { id: 'strat', name: 'Stratège Business', desc: 'Offres, pricing & go-to-market', color: '#A85E2E', icon: 'target', prompt: 'Tu es un stratège business orienté résultats. Tu construis des offres irrésistibles, un pricing à la valeur, et des plans de lancement actionnables. Tu raisonnes ICP, pain points et canaux, et tu finis toujours par 3 prochaines actions concrètes.' },
    { id: 'coach', name: 'Coach Perso', desc: 'Organisation, focus & motivation', color: '#8A6D5A', icon: 'brain', prompt: "Tu es un coach personnel bienveillant mais exigeant. Tu reformules l'objectif, tu le découpes en actions réalistes, tu aides à rester concentré et motivé, et tu termines par une prochaine étape précise." }
  ];
  function renderAssistants(){
    $('#assGrid').innerHTML=ASSISTANTS.map(a=>`<div class="pcard" data-ass="${a.id}" style="--ax:${a.color}"><div class="pcard-top"><div class="pic" style="background:${a.color}"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.95)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GLYPH[a.icon]||GLYPH.spark}</svg></div></div><div class="pn">${esc(a.name)}</div><div class="pd">${esc(a.desc)}</div></div>`).join('');
    $$('#assGrid .pcard[data-ass]').forEach(c=>{
      c.addEventListener('click',()=>{
        const a=ASSISTANTS.find(x=>x.id===c.dataset.ass);
        if(!a)return;
        const convo = createConvo();
        convo.title = a.name;
        convo.assistant = a.id;
        saveConvos();
        openConvo(convo.id);
        if(window.innerWidth<=1024){$('#sidebar').classList.remove('open');$('#scrim').classList.remove('show')}
      });
    });
  }

  function renderProjects(){
    const list=[...PROJECTS].sort((a,b)=>projLastTs(b)-projLastTs(a));
    $('#projGrid').innerHTML=list.map(p=>{const n=projCount(p.id),tn=ptypeOf(p.type).n,ax=hexOf(p.color);return `<div class="pcard" data-proj="${p.id}" style="--ax:${ax}"><div class="pcard-acts"><span class="pa" data-pact="rename" data-tip="Renommer"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></span><span class="pa" data-pact="del" data-tip="Supprimer"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg></span></div><div class="pcard-top"><div class="pic" style="background:${p.color}"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.95)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GLYPH[p.icon]||GLYPH.spark}</svg></div><span class="ptag">${tn}</span></div><div class="pn">${esc(p.name)}</div><div class="pd">${esc(p.desc||'Sans description')}</div><div class="pm"><span class="pm-i"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.5 8.5 0 0 1-12.5 7.5L3 21l2-5.5A8.5 8.5 0 1 1 21 11.5z"/></svg>${n} conv.</span><span class="pm-sep">·</span><span>${ago(projLastTs(p))}</span></div></div>`}).join('')
      +`<div class="pcard add" id="projAdd"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg><div style="font-size:13px;font-weight:500">Nouveau projet</div></div>`;
    $$('#projGrid .pcard[data-proj]').forEach(c=>{
      c.addEventListener('click',e=>{if(e.target.closest('.pa'))return;openProject(c.dataset.proj)});
      c.querySelector('[data-pact=rename]').addEventListener('click',e=>{e.stopPropagation();renameProject(c.dataset.proj)});
      c.querySelector('[data-pact=del]').addEventListener('click',e=>{e.stopPropagation();deleteProject(c.dataset.proj)});
    });
    $('#projAdd').addEventListener('click',openProjModal);
  }
  function openProject(id){const p=projById(id);if(!p)return;activeProject=id;
    const cs=CONVOS.filter(c=>c.pid===id).sort((a,b)=>b.ts-a.ts);
    $('#prjHeadIc').style.background=p.color;$('#prjHeadIc').innerHTML=`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.95)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GLYPH[p.icon]||GLYPH.spark}</svg>`;
    $('#prjName').textContent=p.name;$('#prjDesc').textContent=p.desc||'Sans description';
    const convHTML=cs.length?cs.map(c=>{const last=c.msgs[c.msgs.length-1],snip=(last&&typeof last.text==='string'&&last.text)?last.text.replace(/[#*`>-]/g,'').slice(0,64):(last&&last.media?'[média généré]':'');return `<div class="lrow" data-id="${c.id}"><div class="lic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${LIC.chat}</svg></div><div style="min-width:0;flex:1"><div class="ln">${esc(c.title)}</div><div class="lmeta">${c.msgs.length} message${c.msgs.length>1?'s':''} · ${esc(snip)}…</div></div><div class="lright">${ago(c.ts)}</div></div>`}).join(''):`<div class="empty-state"><div class="es-ic"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-12.5 7.5L3 21l2-5.5A8.5 8.5 0 1 1 21 11.5z"/></svg></div><div class="es-t">Aucune conversation</div><div class="es-d">Démarre la première conversation de ce projet.</div></div>`;
    $('#prjList').innerHTML=projPanelHTML(p)+`<div class="sb-label" style="margin:6px 4px 12px">Conversations</div>`+convHTML;
    bindProjPanel(p);
    $$('#prjList .lrow').forEach(r=>r.addEventListener('click',()=>openConvo(r.dataset.id)));
    showView('project');
  }
  function projPanelHTML(p){
    const files=p.files||[];
    return `<div class="prj-panel">
      <div class="pp-sec"><div class="pp-h"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GLYPH.brain}</svg>Contexte<span class="pp-sub">appliqué à toutes les conversations du projet</span></div>
        <textarea class="pp-ctx" id="prjCtx" maxlength="1200" aria-label="Contexte du projet" placeholder="Marque, ton, cible, contraintes, objectifs… L'IA s'en sert dans chaque réponse de ce projet.">${esc(p.context||'')}</textarea>
        <div class="pp-hint"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 6 9 17l-5-5"/></svg>Enregistré automatiquement</div>
      </div>
      <div class="pp-sec"><div class="pp-h"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GLYPH.note}</svg>Fichiers<span class="pp-sub">${files.length}</span><span class="pp-add" id="prjAddFile"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>Ajouter</span></div>
        <div class="pp-files" id="prjFiles">${files.length?files.map((f,i)=>`<div class="pp-file"><svg class="fi" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${fileIcon(f.name)}</svg><span class="pf-n">${esc(f.name)}</span><span class="pf-x" data-fx="${i}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></span></div>`).join(''):`<div class="pp-empty">Aucun fichier. Ajoute des références (brief, charte, exemples…).</div>`}</div>
      </div>
    </div>`;
  }
  function bindProjPanel(p){
    const ta=$('#prjCtx');if(ta){let t=null;ta.addEventListener('input',()=>{clearTimeout(t);t=setTimeout(()=>{p.context=ta.value.trim();saveProjects()},350)})}
    $('#prjAddFile')&&($('#prjAddFile').onclick=()=>{prjFileMode=true;$('#fileInput').multiple=true;$('#fileInput').click()});
    $$('#prjFiles .pf-x').forEach(x=>x.onclick=()=>{p.files.splice(+x.dataset.fx,1);saveProjects();openProject(p.id)});
  }
  function renameProject(id){const p=projById(id);if(!p)return;const v=window.prompt('Renommer le projet',p.name);if(v&&v.trim()){p.name=v.trim();saveProjects();renderProjects()}}
  function deleteProject(id){const p=projById(id);if(!p||!window.confirm('Supprimer le projet « '+p.name+' » ? Les conversations sont conservées (détachées).'))return;CONVOS.forEach(c=>{if(c.pid===id)c.pid=null});saveConvos();PROJECTS=PROJECTS.filter(x=>x.id!==id);saveProjects();renderProjects();toast('Projet supprimé')}
  function renderIntegrations(filter=''){
    const q=filter.toLowerCase().trim(),f=INTEGRATIONS.map((x,i)=>({x,i})).filter(({x})=>!q||x.n.toLowerCase().includes(q)||x.cat.toLowerCase().includes(q)||x.d.toLowerCase().includes(q));
    const on=INTEGRATIONS.filter(x=>x.on).length;
    $('#intCount').textContent=on+' connectée'+(on>1?'s':'')+' sur '+INTEGRATIONS.length;
    if(!f.length){$('#intList').innerHTML=`<div class="cp-empty">Aucune intégration pour « ${esc(filter)} »</div>`;return}
    const cats=[];f.forEach(o=>{if(!cats.includes(o.x.cat))cats.push(o.x.cat)});
    $('#intList').innerHTML=cats.map(cat=>`<div class="int-cat-h">${esc(cat)}</div>`+f.filter(o=>o.x.cat===cat).map(({x,i})=>`<div class="irow"><div class="iic">${GLYPH[x.ic]?`<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${GLYPH[x.ic]}</svg>`:''}</div><div style="min-width:0;flex:1"><div class="inm">${esc(x.n)}</div><div class="idesc">${x.on?`<span class="istat"><span class="idot"></span>Activé · préversion</span>`:esc(x.d)}</div></div><div class="toggle${x.on?' on':''}" data-int="${i}"></div></div>`).join('')).join('');
    $$('#intList .toggle').forEach(t=>t.addEventListener('click',()=>{const i=t.dataset.int;INTEGRATIONS[i].on=!INTEGRATIONS[i].on;saveIntState();renderIntegrations($('#intSearch').value||'');toast(INTEGRATIONS[i].n+(INTEGRATIONS[i].on?' connecté':' déconnecté'))}));
  }
  /* project create modal */
  let pmType=PTYPES[0].k;
  function openProjModal(){
    pmType=PTYPES[0].k;$('#pmName').value='';$('#pmDesc').value='';$('#pmCtx').value='';
    $('#pmTypes').innerHTML=PTYPES.map((t,i)=>`<div class="ptype${i===0?' on':''}" data-t="${t.k}"><span class="pt-ic" style="background:${t.color}"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.95)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GLYPH[t.icon]}</svg></span><span class="pt-n">${t.n}</span></div>`).join('');
    $$('#pmTypes .ptype').forEach(s=>s.onclick=()=>{$$('#pmTypes .ptype').forEach(x=>x.classList.remove('on'));s.classList.add('on');pmType=s.dataset.t});
    $('#projModal').classList.add('show');setTimeout(()=>$('#pmName').focus(),60);
  }
  function closeProjModal(){$('#projModal').classList.remove('show')}
  $('#pmClose').addEventListener('click',closeProjModal);$('#pmCancel').addEventListener('click',closeProjModal);
  $('#projModal').addEventListener('click',e=>{if(e.target.id==='projModal')closeProjModal()});
  $('#pmCreate').addEventListener('click',()=>{const name=$('#pmName').value.trim();if(!name)return toast('Donne un nom au projet');const t=ptypeOf(pmType);const p={id:'p'+newId(),name,desc:$('#pmDesc').value.trim(),type:t.k,icon:t.icon,color:t.color,context:$('#pmCtx').value.trim(),ts:now()};PROJECTS.push(p);saveProjects();renderProjects();closeProjModal();toast('Projet « '+name+' » créé');openProject(p.id)});
  $('#pmName').addEventListener('keydown',e=>{if(e.key==='Enter')$('#pmCreate').click()});
  $('#prjBack').addEventListener('click',()=>{activeProject=null;showView('projects')});
  $('#prjNewConv').addEventListener('click',()=>{const pid=activeProject;newChat();activeProject=pid;prompt.focus();toast('Nouvelle conversation dans le projet')});

  renderRecents();renderLibrary();renderProjects();renderAssistants();renderIntegrations();

