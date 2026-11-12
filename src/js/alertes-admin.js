  /* ── Alertes : où être prévenu quand un agent s'arrête ─────────────────────
     Réglage strictement personnel (chacun son adresse), stocké côté serveur —
     c'est le serveur qui envoie, à une heure où le navigateur est fermé. */
  const eur2=c=>(Number(c||0)/100).toFixed(2).replace('.',',')+' €';
  async function chargerAlertes(){
    const e=document.getElementById('alEmail'),h=document.getElementById('alHook');
    if(!e||!VIA_PROXY)return;
    try{const r=await fetch(_PB+'/alertes');if(!r.ok)return;const d=await r.json();
      e.value=d.email||'';h.value=d.webhook||'';
      const s=document.getElementById('alSucces');
      if(s){s.classList.toggle('on',!!d.succes);s.setAttribute('aria-checked',d.succes?'true':'false')}
      const p=document.getElementById('alPlafond');if(p)p.value=((d.plafond_cents||0)/100).toFixed(0);
      const dp=document.getElementById('alDepense');
      if(dp)dp.textContent=d.plafond_cents?('dépensé ce mois : '+eur2(d.depense_cents)):'aucun plafond — la dépense n’est pas bornée';
      const m=document.getElementById('alMailEtat');
      if(m)m.textContent=d.mail_pret?'':'L’envoi de mails n’est pas encore branché côté serveur — l’URL de notification, elle, marche tout de suite.';
    }catch(err){}
  }
  function brancherAlertes(){
    const bs=document.getElementById('alSave'),bt=document.getElementById('alTest'),et=document.getElementById('alEtat');
    if(!bs||bs._on)return;bs._on=true;
    const lire=()=>({email:(document.getElementById('alEmail').value||'').trim(),
      webhook:(document.getElementById('alHook').value||'').trim(),
      succes:document.getElementById('alSucces').classList.contains('on'),
      plafond_cents:Math.round(parseFloat(document.getElementById('alPlafond').value||'0')*100)});
    const dire=(t,ko)=>{if(!et)return;et.textContent=t;et.style.color=ko?'#E8686D':'';};
    const HINTS={email_invalide:'Cette adresse mail n’a pas l’air valide.',webhook_https:'L’URL doit commencer par https://',webhook_invalide:'Cette URL n’est pas valide.',plafond_invalide:'Le plafond va de 0 (illimité) à 200 €.'};
    const sw=document.getElementById('alSucces');
    if(sw){const bascule=()=>{const on=!sw.classList.contains('on');sw.classList.toggle('on',on);sw.setAttribute('aria-checked',on?'true':'false')};
      sw.addEventListener('click',bascule);
      sw.addEventListener('keydown',e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();bascule()}});}
    bs.addEventListener('click',async()=>{
      bs.disabled=true;dire('Enregistrement…');
      try{const r=await fetch(_PB+'/alertes',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(lire())});
        const d=await r.json().catch(()=>({}));
        if(r.ok){dire('Enregistré.');toast('Alertes enregistrées');chargerAlertes()}
        else dire(HINTS[d.error]||'Refusé — vérifie les champs.',true);
      }catch(e){dire('Serveur injoignable — réessaie.',true)}
      finally{bs.disabled=false}
    });
    /* Un canal jamais essayé n'est pas un canal : on l'éprouve avant d'en dépendre. */
    bt.addEventListener('click',async()=>{
      const v=lire();if(!v.email&&!v.webhook){dire('Renseigne d’abord une adresse ou une URL.',true);return}
      bt.disabled=true;dire('Envoi…');
      try{
        await fetch(_PB+'/alertes',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(v)});
        const r=await fetch(_PB+'/alertes/test',{method:'POST'});const d=await r.json().catch(()=>({}));
        if(!r.ok){dire('Test impossible pour l’instant.',true)}
        else{const p=[];if(d.email)p.push('mail');if(d.webhook)p.push('notification');
          dire(p.length?'Envoyé par '+p.join(' et ')+' — regarde d’ici une minute.':'Rien n’est parti : aucun canal actif côté serveur.',!p.length)}
      }catch(e){dire('Serveur injoignable — réessaie.',true)}
      finally{bt.disabled=false}
    });
  }
  /* ── Vue admin (comptes) — visible uniquement pour un compte admin ; le serveur re-vérifie chaque action ── */
  function setupAdmin(){
    if(document.getElementById('set-admin'))return;
    const anchor=document.getElementById('set-privacy');if(!anchor)return;
    const sec=document.createElement('div');sec.className='field';sec.id='set-admin';
    sec.innerHTML='<label>Comptes (admin)</label>'
      +'<div id="admList" style="border:1px solid var(--line);border-radius:12px;overflow:hidden"></div>'
      +'<p style="margin:8px 2px 0;font-size:12px;line-height:1.5;color:var(--ink-faint)">Chaque code ouvre un espace séparé : la personne ne voit ni tes conversations, ni tes projets, ni ses agents IA — et toi non plus les siens. Un seul code par personne : deux appareils avec le même code partagent le même historique.</p>'
      +'<div style="display:flex;gap:8px;margin-top:10px"><input class="inp" id="admName" placeholder="Prénom du nouveau collègue / client" aria-label="Nom du nouvel accès" style="flex:1"><button class="btn primary" id="admCreate" style="white-space:nowrap">Créer un accès</button></div>'
      +'<div id="admNew" style="display:none;margin-top:10px;padding:14px;border:1.5px dashed var(--accent);border-radius:12px;background:var(--accent-tint)"><div style="font-size:12px;font-weight:700;color:var(--accent-strong);margin-bottom:6px">CODE D’ACCÈS — montré une seule fois, envoie-le maintenant</div><div style="display:flex;gap:8px;align-items:center"><code id="admCode" style="flex:1;font-size:14px;letter-spacing:.05em;user-select:all"></code><button class="btn" id="admCopy">Copier</button><button class="btn primary" id="admInvite">Copier l’invitation</button></div><p style="margin:8px 0 0;font-size:11.5px;color:var(--ink-faint)">« Copier l’invitation » met le lien, le code et le mode d’emploi dans ton presse-papier — il n’y a plus qu’à coller dans un message.</p></div>';
    anchor.parentNode.insertBefore(sec,anchor);
    sec.querySelector('#admCreate').addEventListener('click',admCreate);
    sec.querySelector('#admName').addEventListener('keydown',e=>{if(e.key==='Enter')admCreate()});
    sec.querySelector('#admCopy').addEventListener('click',()=>{try{navigator.clipboard.writeText(document.getElementById('admCode').textContent);toast('Code copié — envoie-le à la personne')}catch(e){}});
    /* Donner un accès tenait en un code brut collé dans un SMS, sans le lien ni
       le mode d'emploi : la personne d'en face ne savait pas quoi en faire. */
    sec.querySelector('#admInvite').addEventListener('click',()=>{
      const code=document.getElementById('admCode').textContent,nom=sec.dataset.dernier||'';
      const t=(nom?nom+', ':'')+'voici ton accès à MAZ.\n\n'
        +location.origin+location.pathname+'\n'
        +'Code : '+code+'\n\n'
        +'Ouvre le lien, colle le code, c’est tout. Ton espace est privé : tes conversations n’apparaissent chez personne d’autre.';
      try{navigator.clipboard.writeText(t);toast('Invitation copiée — colle-la dans un message')}catch(e){toast('Copie impossible')}});
    admRefresh();
  }
  async function admRefresh(){
    const box=document.getElementById('admList');if(!box)return;
    box.innerHTML='<div style="padding:12px;font-size:13px;color:var(--ink-soft)">Chargement…</div>';
    try{
      const r=await fetch(_PB+'/admin/users');if(!r.ok)throw 0;
      const us=await r.json();
      box.innerHTML=us.map(u=>{
        const seen=u.last_seen?new Date(u.last_seen).toLocaleDateString('fr-FR',{day:'numeric',month:'short'}):'jamais';
        return '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid var(--line);font-size:13px">'
          +'<span style="flex:1;font-weight:600;'+(u.disabled?'opacity:.45;text-decoration:line-through':'')+'">'+esc(u.name)+(u.is_admin?' <span style="font-size:10px;color:var(--accent-strong);border:1px solid var(--accent-ring);border-radius:5px;padding:1px 5px">ADMIN</span>':'')+'</span>'
          +'<span style="color:var(--ink-faint);font-size:11.5px">vu : '+seen+'</span>'
          +'<span style="color:var(--ink-soft);font-size:11.5px" title="requêtes · tokens · coût">'+(u.req||0)+' req · '+Math.round((u.tok||0)/1000)+'k tok · $'+(+u.cost||0).toFixed(2)+'</span>'
          +'<button class="mini-btn" data-adm-nom="'+esc(u.id)+'" data-nm="'+esc(u.name)+'">Renommer</button>'
          +'<button class="mini-btn" data-adm-code="'+esc(u.id)+'" data-nm="'+esc(u.name)+'">Code perso</button>'
          +(u.is_admin?'':'<button class="mini-btn" data-adm-toggle="'+esc(u.id)+'" data-en="'+(u.disabled?1:0)+'">'+(u.disabled?'Réactiver':'Révoquer')+'</button>')
          +(u.is_admin||u.last_seen?'':'<button class="mini-btn danger" data-adm-sup="'+esc(u.id)+'" data-nm="'+esc(u.name)+'" title="Jamais utilisé — suppression définitive">Supprimer</button>')
          +'</div>';
      }).join('')||'<div style="padding:12px;font-size:13px;color:var(--ink-soft)">Aucun compte</div>';
      box.querySelectorAll('[data-adm-code]').forEach(b=>b.addEventListener('click',async()=>{
        const code=window.prompt('Nouveau code pour « '+b.dataset.nm+' » — 12 caractères minimum, lettres ET chiffres (insensible aux majuscules).\n\n⚠️ Il remplace l\'ancien immédiatement.');
        if(code===null)return;
        try{
          const r=await fetch(_PB+'/admin/setcode',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:b.dataset.admCode,code:code.trim()})});
          if(r.ok){toast('Code de '+b.dataset.nm+' remplacé');if(b.dataset.admCode===localStorage.getItem('mzai:cloud_uid')){localStorage.setItem('mzai:acode',code.trim())}}   // si on change SON propre code, la session suit
          else{const d=await r.json().catch(()=>({}));toast(d.error==='code_taken'?'Ce code est déjà pris — choisis-en un autre':'Code refusé : '+(d.hint||'12+ caractères, lettres et chiffres'))}
        }catch(e){toast('Impossible pour l\'instant — réessaie')}
      }));
      /* « Invité 2 · 4,80 $ » ne dit pas qui consomme. Le nom est la seule chose
         qui rend la colonne coût lisible dès que plusieurs personnes s'en servent. */
      box.querySelectorAll('[data-adm-nom]').forEach(b=>b.addEventListener('click',async()=>{
        const v=window.prompt('Nom de cette personne — c’est ce que tu liras à côté de ce qu’elle consomme.',b.dataset.nm);
        if(v===null)return;const name=v.trim();if(!name||name===b.dataset.nm)return;
        try{const r=await fetch(_PB+'/admin/rename',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:b.dataset.admNom,name})});
          if(r.ok){toast('Renommé : '+name);admRefresh()}else toast('Renommage refusé')}
        catch(e){toast('Impossible pour l\'instant — réessaie')}
      }));
      /* Seuls les comptes JAMAIS utilisés proposent ce bouton (le serveur revérifie) :
         un accès qui a servi se révoque, il ne s'efface pas avec son historique. */
      box.querySelectorAll('[data-adm-sup]').forEach(b=>b.addEventListener('click',async()=>{
        if(!window.confirm('Supprimer définitivement l’accès de « '+b.dataset.nm+' » ?\n\nIl n’a jamais servi, rien ne sera perdu. Son code cessera de fonctionner.'))return;
        try{const r=await fetch(_PB+'/admin/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:b.dataset.admSup})});
          const d=await r.json().catch(()=>({}));
          if(r.ok){toast('Accès supprimé');admRefresh()}
          else toast(d.hint||'Suppression refusée')}
        catch(e){toast('Impossible pour l\'instant — réessaie')}
      }));
      box.querySelectorAll('[data-adm-toggle]').forEach(b=>b.addEventListener('click',async()=>{
        const en=b.dataset.en==='1';
        if(!en&&!window.confirm('Révoquer cet accès ? La personne ne pourra plus utiliser MAZ (son historique est conservé).'))return;
        await fetch(_PB+'/admin/disable',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:b.dataset.admToggle,enable:en})}).catch(()=>{});
        admRefresh();
      }));
    }catch(e){box.innerHTML='<div style="padding:12px;font-size:13px;color:#E8686D">Impossible de charger les comptes — réessaie.</div>'}
  }
  async function admCreate(){
    const inp=document.getElementById('admName'),name=(inp.value||'').trim().slice(0,60);
    if(!name){toast('Donne un nom (prénom du collègue ou du client)');return}
    try{
      const r=await fetch(_PB+'/admin/user',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});
      if(!r.ok)throw 0;
      const d=await r.json();
      inp.value='';
      const sec=document.getElementById('set-admin');if(sec)sec.dataset.dernier=name;
      const nb=document.getElementById('admNew');nb.style.display='block';
      document.getElementById('admCode').textContent=d.code;
      toast('Accès créé pour '+name);
      admRefresh();
    }catch(e){toast('Création impossible — réessaie')}
  }
