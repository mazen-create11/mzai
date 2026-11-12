  /* ══ CLOUD (mode hébergé uniquement) : compte par code d'accès + historique synchronisé + médias permanents ══
     Sécurité : le code n'est jamais loggé ; injecté en en-tête UNIQUEMENT vers notre Worker (interceptor ciblé) ;
     le serveur re-vérifie tout (defense-in-depth : contourner l'écran ne donne accès à rien). */
  const _acode=()=>{try{return localStorage.getItem('mzai:acode')||''}catch(e){return''}};
  if(Relais.viaProxy){
    const _f=window.fetch.bind(window);
    window.fetch=function(u,init){try{const s=typeof u==='string'?u:(u&&u.url)||'';if(s.indexOf(Relais.base)===0){init=init||{};const h=new Headers(init.headers||{});const c=_acode();if(c)h.set('X-Maz-Code',c);init.headers=h;}}catch(e){}return _f(u,init)};
  }
  let CLOUD_ON=false,_lastPush=0,_cpT=null;
  async function cloudPushSoon(){if(!CLOUD_ON)return;clearTimeout(_cpT);_cpT=setTimeout(async()=>{
    // trié par ancienneté : on avance _lastPush uniquement jusqu'à la dernière convo RÉELLEMENT poussée
    // (sinon, au-delà de 12 convos modifiées, les suivantes n'étaient jamais resynchronisées)
    const dirty=CONVOS.filter(c=>(c.ts||0)>_lastPush).sort((a,b)=>(a.ts||0)-(b.ts||0));if(!dirty.length)return;
    const batch=dirty.slice(0,12);let last=_lastPush,ok=true;
    for(const c of batch){try{
      const r=await fetch(Relais.base+'/sync/convo',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:c.id,data:_stripConvo(c),updated_at:c.ts||Date.now()})});
      if(!r.ok){ok=false;break}   // panne : on s'arrête, _lastPush reste au dernier succès, re-tentera au prochain save/pull
      last=c.ts||last;
    }catch(e){ok=false;break}}
    _lastPush=last;
    if(ok&&dirty.length>batch.length)cloudPushSoon();   // lot complet + reste → nouveau tick jusqu'à épuisement (pas de boucle si échec)
  },1200)}
  function cloudDelete(id){if(!CLOUD_ON)return;fetch(Relais.base+'/sync/convo?id='+encodeURIComponent(id),{method:'DELETE'}).catch(()=>{})}
  async function cloudPull(){
    try{
      const r=await fetch(Relais.base+'/sync/convos');if(!r.ok)return;
      const rows=await r.json();let changed=false;
      rows.forEach(row=>{
        const li=CONVOS.findIndex(c=>c.id===row.id);
        if(row.deleted){if(li>=0&&(CONVOS[li].ts||0)<=row.updated_at){CONVOS.splice(li,1);changed=true}return}
        let remote=null;try{remote=JSON.parse(row.data)}catch(e){}
        if(!remote||!remote.id)return;
        if(li<0){CONVOS.push(remote);changed=true}
        else if((CONVOS[li].ts||0)<row.updated_at){if(activeId!==row.id){CONVOS[li]=remote;changed=true}}   // on n'écrase jamais la convo ouverte sous les doigts de l'utilisateur
      });
      if(changed){CONVOS.sort((a,b)=>(b.ts||0)-(a.ts||0));saveConvos();renderRecents()}
      // push de ce que le cloud n'a pas (ou a en plus vieux)
      const seen=new Map(rows.map(r2=>[r2.id,r2.updated_at]));
      for(const c of CONVOS){const rts=seen.get(c.id);if(rts===undefined||(c.ts||0)>rts){try{await fetch(Relais.base+'/sync/convo',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:c.id,data:_stripConvo(c),updated_at:c.ts||Date.now()})})}catch(e){break}}}
      _lastPush=Date.now();CLOUD_ON=true;
    }catch(e){try{console.warn('[MAZ] sync',e)}catch(_){}}
  }
  function _gateEl(){let g=document.getElementById('mazGate');if(g)return g;
    g=document.createElement('div');g.id='mazGate';
    g.style.cssText='position:fixed;inset:0;z-index:99999;display:grid;place-items:center;background:var(--bg,#FAF8F3)';
    g.innerHTML='<div style="width:min(400px,90vw);text-align:center;padding:36px 30px;border:1px solid var(--line,#E7E2D6);border-radius:18px;background:var(--panel-solid,#fff);box-shadow:0 18px 60px rgba(43,36,24,.10)">'
      +'<div style="font-weight:800;font-size:34px;letter-spacing:-1px;margin-bottom:6px">MA<span style="color:#16B87A">Z</span></div>'
      +'<div style="color:var(--ink-soft,#56524A);font-size:14px;margin-bottom:22px">Espace privé — entre ton code d’accès</div>'
      +'<input id="gateIn" autocomplete="off" spellcheck="false" inputmode="text" placeholder="maz-XXXX-XXXX-XXXX-XXXX" aria-label="Code d’accès" style="width:100%;box-sizing:border-box;font-family:ui-monospace,monospace;font-size:16px;text-align:center;letter-spacing:.06em;padding:12px 14px;border:1px solid var(--line-strong,#D9D2C2);border-radius:10px;background:var(--surface,#F4F1E9);color:var(--ink,#21201B);outline:none">'
      +'<div id="gateErr" role="alert" style="min-height:20px;font-size:12.5px;color:#E8686D;margin:10px 0 4px"></div>'
      +'<button id="gateGo" style="width:100%;padding:12px;border:0;border-radius:10px;background:#16B87A;color:#04150D;font-weight:700;font-size:14.5px;cursor:pointer">Entrer</button>'
      +'<div style="margin-top:16px;font-size:11.5px;color:var(--ink-faint,#6E695D)">Pas de code ? Demande à Mazen.</div></div>';
    document.body.appendChild(g);
    const go=async()=>{const inp=g.querySelector('#gateIn'),err=g.querySelector('#gateErr'),btn=g.querySelector('#gateGo');
      const code=(inp.value||'').replace(/[^\x21-\x7E]/g,'').trim();if(!code){err.textContent='Colle ton code d’accès.';return}
      btn.disabled=true;btn.textContent='Vérification…';err.textContent='';
      try{const r=await fetch(Relais.base+'/auth/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});
        if(r.ok){const d=await r.json();try{localStorage.setItem('mzai:acode',code)}catch(e){}g.remove();onAuthed(d);return}
        err.textContent=r.status===401?'Code non reconnu — vérifie-le auprès de Mazen.':'Service indisponible — réessaie dans un instant.';
      }catch(e){err.textContent='Connexion impossible — vérifie ton réseau.'}
      btn.disabled=false;btn.textContent='Entrer';};
    g.querySelector('#gateGo').addEventListener('click',go);
    g.querySelector('#gateIn').addEventListener('keydown',e=>{if(e.key==='Enter')go()});
    setTimeout(()=>{try{g.querySelector('#gateIn').focus()}catch(e){}},60);
    return g;}
  function onAuthed(d){
    // changement de compte sur le même navigateur → purge locale AVANT tout (sinon les données de l'utilisateur précédent fuiteraient vers — et chez — le nouveau)
    try{const prev=localStorage.getItem('mzai:cloud_uid');
      if(prev&&d.uid&&prev!==d.uid){
        CONVOS.length=0;TRASH.length=0;activeId=null;
        try{saveTrash()}catch(e){}try{saveConvosSync()}catch(e){}try{setMemory('')}catch(e){}
        try{PROJECTS.length=0;saveProjects()}catch(e){}
        try{chat.innerHTML='';goHome();renderRecents()}catch(e){}
        try{USER.name=d.name||'Invité';USER.role='Espace privé';USER.email='';DB.set('user',USER);applyUser()}catch(e){}
      }
      if(d.uid)localStorage.setItem('mzai:cloud_uid',d.uid);
    }catch(e){}
    /* On pose le nom du compte tant que l'utilisateur n'a pas édité son profil
       (profil vierge OU nom vide) — sans jamais écraser une personnalisation. */
    try{if(d.name&&(localStorage.getItem('mzai:user')===null||!String(USER.name||'').trim())){USER.name=d.name;USER.role='Espace privé';DB.set('user',USER);applyUser&&applyUser()}}catch(e){}
    toast&&toast('Bienvenue, '+(d.name||'')+' ✦');
    cloudPull();
    const pv=document.getElementById('privacyNote');if(pv)pv.innerHTML='<b>Ton espace privé.</b> Tes conversations sont chiffrées en transit et synchronisées sur ton espace privé — elles te suivent sur tous tes appareils. Personne d’autre n’y a accès.';
    const pp=document.getElementById('privacyProviders');if(pp)pp.style.display='none';
    const sa=document.getElementById('set-api');if(sa)sa.style.display='none';
    if(d.admin)setupAdmin();
    brancherAlertes();chargerAlertes();
    if(!DB.get('onboarded',false))setTimeout(startOnboarding,600);   // 1re visite : prise en main après l'écran de code
  }
