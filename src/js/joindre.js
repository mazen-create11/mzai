  /* misc */
  /* Le tiroir garde son état d'une session à l'autre : le replier est un choix,
     pas un accident, et le retrouver ouvert à chaque rechargement l'annulait. */
  function replier(v,memoriser){const sb=$('#sidebar');if(!sb)return;sb.classList.toggle('collapsed',v);
    if(memoriser!==false)DB.set('sbcol',v);
    const b=$('#collapseBtn');b&&b.setAttribute('aria-expanded',v?'false':'true')}
  $('#collapseBtn').addEventListener('click',()=>replier(!$('#sidebar').classList.contains('collapsed')));
  if(DB.get('sbcol',false))replier(true);
  /* Cliquer À CÔTÉ referme le tiroir (demande Mazen 27/07) — sur mobile le voile
     le faisait déjà, sur grand écran il fallait viser le petit bouton. On ignore
     les clics qui VEULENT quelque chose (champ, bouton, lien, sélection en cours)
     pour ne pas replier le tiroir sous les doigts de quelqu'un qui écrit. */
  document.addEventListener('pointerdown',e=>{
    if(window.innerWidth<=1024)return;                       // ≤1024 : le scrim s'en charge
    const sb=$('#sidebar');if(!sb||sb.classList.contains('collapsed'))return;
    if(e.target.closest('#sidebar,.ov.show,.pop.show,#toast'))return;
    if(e.target.closest('input,textarea,select,button,a,[contenteditable=""],[contenteditable="true"],[role=button],.chat-pill,.pi,.at-lien,.at-ligne'))return;
    const sel=window.getSelection&&window.getSelection();if(sel&&String(sel).trim())return;
    replier(true,false);   // un clic de passage ne DÉCIDE rien : seul le bouton mémorise l'état
  },true);
  $('#navSearch')&&$('#navSearch').addEventListener('click',openPalette);
  let ATTACH=[],importMode=false,prjFileMode=false;
  const fileIcon=n=>{const x=(n.split('.').pop()||'').toLowerCase();const map={png:'img',jpg:'img',jpeg:'img',webp:'img',gif:'img',svg:'img',pdf:'doc',doc:'doc',docx:'doc',txt:'doc',md:'doc',js:'code',ts:'code',jsx:'code',css:'code',html:'code',json:'code',py:'code'};return LIC[map[x]||'doc']};
  function renderAttach(){$('#attachRow').innerHTML=ATTACH.map((f,i)=>attHTML(f,true,i)).join('');$$('#attachRow .ax').forEach(x=>x.onclick=e=>{e.stopPropagation();const f=ATTACH[+x.dataset.ax];if(f&&f.url)URL.revokeObjectURL(f.url);ATTACH.splice(+x.dataset.ax,1);renderAttach()});updateCount()}
  $('#attachBtn').addEventListener('click',()=>{importMode=false;$('#fileInput').multiple=true;$('#fileInput').click()});
  $('#fileInput').addEventListener('change',e=>{const fs=[...e.target.files];if(!fs.length){e.target.value='';return}
    if(prjFileMode){prjFileMode=false;const p=projById(activeProject);if(p){p.files=p.files||[];fs.forEach(f=>p.files.push({name:f.name,isImg:/^image\//.test(f.type)}));saveProjects();openProject(p.id);toast(fs.length>1?fs.length+' fichiers ajoutés':'Fichier ajouté au projet')}}
    else if(importMode){
      importMode=false;
      const file=fs[0];
      const fr=new FileReader();
      fr.onload=async ev=>{
        try{
          const data=JSON.parse(ev.target.result);
          const convos=(data&&(data.conversations||data.convos))||(Array.isArray(data)?data:[]);
          if(!Array.isArray(convos)||!convos.length)return toast('Fichier vide ou format inconnu');
          const okMsg=m=>m&&typeof m==='object'&&(m.role==='user'||m.role==='ai')&&(typeof m.text==='string'||(m.media&&typeof m.media==='object')||Array.isArray(m.files));
          let added=0,skipped=0;const addedIds=new Set();
          convos.forEach(c=>{
            if(!c||typeof c!=='object'||!Array.isArray(c.msgs)){skipped++;return;}
            const msgs=c.msgs.filter(okMsg).map(m=>{const o={role:m.role,text:typeof m.text==='string'?m.text:''};if(typeof m.model==='string')o.model=m.model;if(typeof m.ts==='number')o.ts=m.ts;if(m.auto)o.auto=true;if(m.reason)o.reason=true;if(m.search)o.search=true;if(typeof m.reasonText==='string')o.reasonText=m.reasonText;if(m.usage&&typeof m.usage==='object')o.usage=m.usage;if(typeof m.ms==='number')o.ms=m.ms;if(m.media&&typeof m.media==='object'){const md=Object.assign({},m.media);if(typeof md.url==='string')md.url=safeMediaUrl(md.url);o.media=md;}if(Array.isArray(m.files))o.files=m.files.map(f=>{if(f&&typeof f==='object'){const ff=Object.assign({},f);if(typeof ff.url==='string')ff.url=safeMediaUrl(ff.url);if(typeof ff.b64==='string'&&!/^data:(image|audio|video)\//i.test(ff.b64))ff.b64='';delete ff.file;return ff;}return{name:String(f&&f.name||'fichier')};});if(Array.isArray(m.sources))o.sources=m.sources.filter(s=>s&&typeof s.url==='string').map(s=>({url:safeUrl(s.url),title:typeof s.title==='string'?s.title:''}));return o;});
            if(!msgs.length){skipped++;return;}
            let id=(typeof c.id==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(c.id))?c.id:newId();  // id assaini → pas d'injection via data-id
            if(CONVOS.find(x=>x.id===id)){skipped++;return;}  // doublon
            const conv={id,title:(typeof c.title==='string'&&c.title.trim())?c.title.slice(0,120):'Conversation importée',msgs,ts:typeof c.ts==='number'?c.ts:now(),pinned:!!c.pinned,tags:Array.isArray(c.tags)?c.tags.slice(0,6).map(String):[]};
            if(typeof c.pid==='string'&&projById(c.pid))conv.pid=c.pid;if(typeof c.assistant==='string')conv.assistant=c.assistant;if(typeof c.model==='string')conv.model=c.model;
            CONVOS.push(conv);addedIds.add(id);
            added++;
          });
          // déporte les charges lourdes importées (b64 image, data-URL audio/vidéo, gros texte) vers IndexedDB → pas de bloat permanent du localStorage
          for(const conv of CONVOS){ if(!addedIds.has(conv.id))continue;
            for(const m of conv.msgs){
              if(m.media&&typeof m.media.url==='string'&&/^data:/i.test(m.media.url)&&!m.media.mid){const id='m'+newId();if(await MEDIA.put(id,m.media.url)){m.media.mid=id;delete m.media.url;}}
              if(Array.isArray(m.files))for(const f of m.files){
                if(f&&typeof f.b64==='string'&&/^data:/i.test(f.b64)&&!f._mid){const id='f'+newId();if(await MEDIA.put(id,f.b64)){f._mid=id;delete f.b64;}}
                else if(f&&typeof f.textContent==='string'&&f.textContent.length>20000&&!f._mid){const id='f'+newId();if(await MEDIA.put(id,f.textContent)){f._mid=id;f._txt=true;delete f.textContent;}}
              }
            }
          }
          // round-trip : restaure aussi projets / prompts / mémoire si présents (jamais les clés)
          let extra=0;
          if(Array.isArray(data.projects))data.projects.forEach(p=>{if(p&&typeof p==='object'&&typeof p.name==='string'&&!PROJECTS.find(x=>x.id===p.id)){const t=ptypeOf(p.type);PROJECTS.push({id:(typeof p.id==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(p.id))?p.id:'p'+newId(),name:p.name.slice(0,80),desc:typeof p.desc==='string'?p.desc:'',type:t.k,icon:t.icon,color:t.color,context:typeof p.context==='string'?p.context:'',files:Array.isArray(p.files)?p.files:[],ts:typeof p.ts==='number'?p.ts:now()});extra++;}});
          if(extra){saveProjects();renderProjects&&renderProjects();}
          if(Array.isArray(data.prompts))data.prompts.forEach(p=>{if(p&&typeof p.cmd==='string'&&typeof p.text==='string'&&!PROMPTS.find(x=>x.cmd===p.cmd)){PROMPTS.push({cmd:p.cmd.slice(0,16),title:typeof p.title==='string'?p.title:p.cmd,text:p.text,cat:typeof p.cat==='string'?p.cat:'assistant',icon:typeof p.icon==='string'?p.icon:'spark'});}});
          if(typeof data.prompts!=='undefined')savePrompts();
          if(typeof data.memory==='string'&&data.memory&&!getMemory())setMemory(data.memory);
          if(data.persona&&typeof data.persona==='object'){const p=data.persona;if(typeof p.name==='string')PERSONA.name=p.name.slice(0,40);if(typeof p.sys==='string')PERSONA.sys=p.sys;if(typeof p.tone==='string')PERSONA.tone=p.tone;if(typeof p.length==='string')PERSONA.length=p.length;if(Array.isArray(p.traits))PERSONA.traits=p.traits.slice(0,8).map(String);DB.set('persona',PERSONA);applyPersona&&applyPersona();}
          if(data.settings&&typeof data.settings==='object'){['density','anim','enter','stream','memory','webSearch','showReason'].forEach(k=>{if(k in data.settings)SETTINGS[k]=data.settings[k];});DB.set('settings',SETTINGS);applyDensity&&applyDensity();applyAnim&&applyAnim();}
          if(typeof data.model==='string'&&MODELS.find(m=>m.id===data.model)){currentModel=data.model;syncModel&&syncModel();}
          if(added&&!DB.set('convos',_convosForStorage()))return toast('Stockage plein — impossible d\'importer. Allège tes conversations.');
          renderRecents();renderLibrary('');
          toast(added?added+' conversation'+(added>1?'s':'')+' importée'+(added>1?'s':'')+(skipped?' · '+skipped+' ignorée'+(skipped>1?'s':''):'')+(extra?' · '+extra+' projet(s)':''):(extra?extra+' projet(s) importé(s)':'Aucune conversation valide à importer'));
        }catch(e){toast('Fichier invalide — JSON attendu');}
      };
      fr.readAsText(file);
    }
    else{
      if(fs.reduce((a,b)=>a+b.size,0)>20*1024*1024){toast('Taille totale limitée à 20 Mo');e.target.value='';return}
      fs.forEach(f=>{const isImg=/^image\//.test(f.type);ATTACH.push({name:f.name,isImg,url:isImg?URL.createObjectURL(f):null,file:f})});renderAttach();toast(fs.length>1?fs.length+' fichiers joints':'Fichier joint')
    }
    e.target.value=''});

  /* baguette magique */
  const magicHandler=async()=>{
    const p=prompt.value.trim();if(!p)return toast("Écris une idée d'abord !");
    if(generating)return toast('Génération déjà en cours');
    const mBtn=$('#magicWand');mBtn.classList.add('on');
    toast('Amélioration du prompt...');
    try {
      const msgs=[{role:'system',content:"Tu es un expert mondial en Prompt Engineering. Ta tâche est de réécrire le brouillon de l'utilisateur pour en faire un prompt clair, détaillé, avec du contexte, des contraintes et un format de sortie attendu. Renvoie UNIQUEMENT le prompt amélioré, sans introduction ni conclusion."},{role:'user',content:p}];
      const apiKey=Relais.cle('openrouter')||Relais.cle('siliconflow');
      if(!apiKey)throw new Error('no key');
      const provider=Relais.cle('openrouter')?'openrouter':'siliconflow';
      const endpoint=provider==='openrouter'?Relais.orHost+'/api/v1/chat/completions':Relais.sfHost+'/v1/chat/completions';
      const model=provider==='openrouter'?'deepseek/deepseek-v4-flash':'deepseek-ai/DeepSeek-V3';
      const res=await fetch(endpoint,{method:'POST',headers:{'Authorization':'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify({model,messages:msgs,temperature:0.3,max_tokens:600})});
      if(!res.ok)throw new Error('api');
      const data=await res.json();const txt=(data.choices?.[0]?.message?.content||'').trim();
      // n'écrase le champ que s'il est resté le brouillon d'origine (l'utilisateur a pu envoyer/effacer entre-temps → pas de texte fantôme)
      if(txt&&prompt.value.trim()===p){prompt.value=txt;autoGrow();updateCount();toast('Prompt amélioré ✦');}
      else if(txt){toast('Prompt amélioré ignoré (le champ a changé)');}
    }catch(e){toast(e.message==='no key'?"Ajoute ta clé API dans Réglages":"Impossible d'améliorer le prompt");}
    finally{mBtn.classList.remove('on');}
  };
  $('#magicWand').addEventListener('click',magicHandler);

  /* micro unique : dictée continue (tap = démarre, re-tap = stop) — plus épuré qu'un one-shot + un live séparés */
  const IS_IOS=/iP(hone|ad|od)/i.test(navigator.userAgent||'')||(/Mac/.test(navigator.platform||'')&&(navigator.maxTouchPoints||0)>1);
  const micBtn=$('#dictateBtn');
  micBtn&&micBtn.addEventListener('click',()=>toggleLiveTranscribe(micBtn));
  $('#addProject').addEventListener('click',openProjModal);
  let _libT=0;$('#libSearch').addEventListener('input',e=>{const v=e.target.value;clearTimeout(_libT);_libT=setTimeout(()=>renderLibrary(v),160)});   // débounce : pas de rebuild complet à chaque frappe
  $('#intSearch').addEventListener('input',e=>renderIntegrations(e.target.value));

