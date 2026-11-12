  const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
  const ICON='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 6 9 17l-5-5"/></svg>';
  const toast=m=>{const t=$('#toast');t.querySelector('.ti').innerHTML=ICON;t.querySelector('.tm').textContent=m;t.classList.remove('with-undo');t.classList.add('show');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),1700)};
  function toastUndo(m,fn){const t=$('#toast');t.querySelector('.ti').innerHTML=ICON;t.querySelector('.tm').textContent=m;t.classList.add('with-undo','show');const u=$('#toastUndo');u.onclick=()=>{t.classList.remove('show');fn&&fn()};clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),4200)}
  // Retour en place : l'icône devient une coche verte ~1,1 s puis revient. Copier est
  // l'action la plus fréquente — la confirmation doit être immédiate et sous le pouce, pas
  // un toast qui apparaît ailleurs. Le retour EST la coche : on ne double pas avec un toast.
  const _copyOkSVG='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  function flashCopie(btn){if(!btn)return;if(btn._flash)clearTimeout(btn._flash);else btn._orig=btn.innerHTML;btn.classList.add('act--ok');btn.innerHTML=_copyOkSVG;btn._flash=setTimeout(()=>{btn.innerHTML=btn._orig;btn.classList.remove('act--ok');btn._flash=null},1150)}
  let _drawerPrevFocus=null;
  function toggleSidebar(){const sb=$('#sidebar'),open=sb.classList.toggle('open');$('#scrim').classList.toggle('show');const mb=$('#menuBtn');mb&&mb.setAttribute('aria-expanded',open?'true':'false');
    if(open && window.innerWidth<=1024){_drawerPrevFocus=document.activeElement;const f=sb.querySelector('a,button,[role=button],[tabindex]:not([tabindex="-1"])');f&&f.focus();}
    else if(!open){const t=_drawerPrevFocus&&_drawerPrevFocus.focus?_drawerPrevFocus:mb;t&&t.focus&&t.focus();_drawerPrevFocus=null;}
  }
  // piège de focus du tiroir mobile : Tab cycle dedans, Échap ferme
  document.addEventListener('keydown',e=>{const sb=$('#sidebar');if(!sb||!sb.classList.contains('open')||window.innerWidth>1024)return;
    if(e.key==='Escape'){e.preventDefault();toggleSidebar();return;}
    if(e.key!=='Tab')return;
    const f=[...sb.querySelectorAll('a,button,[role=button],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(el=>el.offsetParent&&!el.disabled);
    if(!f.length)return;const first=f[0],last=f[f.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  });
  $('#menuBtn').addEventListener('click',toggleSidebar);
  $('#scrim').addEventListener('click',toggleSidebar);
  $('#scrim').addEventListener('touchend',e=>{e.preventDefault();toggleSidebar();},{passive:false});   // ceinture iOS : certains WebKit n'émettent pas click sur l'overlay

  /* ===== persistance (localStorage) ===== */
  const DB={
    get(k,f){try{const v=localStorage.getItem('mzai:'+k);return v===null?f:JSON.parse(v)}catch(e){return f}},
    set(k,v){try{localStorage.setItem('mzai:'+k,JSON.stringify(v));return true}catch(e){if(e&&/quota|exceeded/i.test((e.name||'')+' '+(e.message||''))){const t=Date.now();if(!DB._warnedAt||t-DB._warnedAt>60000){DB._warnedAt=t;try{toast('Stockage local plein — exporte puis allège tes conversations')}catch(_){}}}return false}}   // ré-alerte toutes les 60s tant que l'écriture échoue (plus de perte silencieuse)
  };

  /* ripple */
  $$('.rip').forEach(el=>el.addEventListener('pointerdown',e=>{const r=el.getBoundingClientRect(),d=Math.max(r.width,r.height),s=document.createElement('span');s.className='r';s.style.width=s.style.height=d+'px';s.style.left=(e.clientX-r.left)+'px';s.style.top=(e.clientY-r.top)+'px';el.appendChild(s);setTimeout(()=>s.remove(),600)}));

  /* greeting — la ligne d'état au-dessus dit des FAITS : la date, puis le parc
     dès que l'atelier a répondu. Les slogans n'ont rien à faire sur un instrument. */
  window.__parc=null;   // rempli par l'atelier à chaque peinture
  function majHomeEtat(){
    const el=document.getElementById('homeEtat');if(!el)return;
    const d=new Date().toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'});
    let t=d;
    if(window.__parc){const p=window.__parc;
      if(p.actifs)t+=' · '+p.actifs+' agent'+(p.actifs>1?'s':'')+' actif'+(p.actifs>1?'s':'');
      if(p.signer)t+=' · '+p.signer+' à valider';}
    el.textContent=t;
  }
  /* Le prénom n'est PAS écrit en dur : un invité qui entre son code lisait
     « Bonjour, Mazen ». applyUser() repeint dès que le compte est connu. */
  const GREET_MARK='<svg class="greet-mark" viewBox="0 0 16 16" aria-hidden="true"><rect x="3.2" y="3.2" width="9.6" height="9.6" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="3.2" y="3.2" width="9.6" height="9.6" fill="none" stroke="currentColor" stroke-width="1.6" transform="rotate(45 8 8)"/></svg>';
  const salut=()=>{const h=new Date().getHours();return h<6?'Bonne nuit':h<12?'Bonjour':h<18?'Bon après-midi':'Bonsoir'};
  function majGreet(){const g=$('#greet');if(!g)return;
    /* USER est déclaré plus bas : au tout premier appel il est encore dans sa
       zone morte, et `typeof` lève sur un const. D'où le try — on salue sans
       prénom pendant les quelques ms qui précèdent applyUser(). */
    let nom='';try{nom=(USER&&USER.name)?String(USER.name).trim().split(' ')[0]:''}catch(e){}
    g.innerHTML=salut()+(nom?', <b>'+esc(nom)+'</b>':'')+GREET_MARK;}
  majGreet();majHomeEtat();
  /* Un onglet reste ouvert des jours : sans ce battement, la date du 27 juillet
     restait affichée le 29, et « Bonsoir » persistait jusqu'au lendemain midi. */
  setInterval(()=>{majGreet();majHomeEtat()},60000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){majGreet();majHomeEtat()}});

  /* ═══ La lumière ═════════════════════════════════════════════════════════
     Deux mouvements, tous deux volontairement à la limite du perceptible :
     on ne doit pas les voir, on doit sentir que la page est vivante. */
  (function(){
    const app=document.getElementById('app');if(!app)return;

    /* — l'heure — Mêmes seuils que le salut ci-dessus (6/12/18) : la lumière
       et les mots ne peuvent pas se contredire. Le matin la source est haute
       et franche ; le soir elle descend et s'approfondit ; la nuit elle
       s'efface presque, on ne veut pas d'un écran qui crie à 3 h. */
    function heure(){
      const t=new Date().getHours();
      const [y,i] = t<6  ? ['40%','24%']    // nuit    — basse, retenue
                  : t<12 ? ['22%','34%']    // matin   — haute et franche
                  : t<18 ? ['30%','36%']    // journée — l'assiette de référence
                  :        ['40%','40%'];   // soir    — basse et profonde
      app.style.setProperty('--halo-y',y);
      app.style.setProperty('--halo-i',i);
    }
    heure();
    setInterval(heure,15*60*1000);   // le basculement se fait sans recharger

    /* — le pointeur — La nappe se déporte de 14 px au maximum, avec un fort
       amortissement : elle traîne derrière la souris au lieu de la suivre.
       Une translation seulement (composée sur le GPU), jamais un repaint.
       La boucle s'arrête d'elle-même dès que le déport est stabilisé. */
    if(!window.matchMedia)return;
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    if(!matchMedia('(pointer: fine)').matches)return;   // au doigt, rien à suivre

    const AMPL=14;
    let cx=0,cy=0,vx=0,vy=0,anim=0;
    function boucle(){
      vx+=(cx-vx)*.045;vy+=(cy-vy)*.045;
      app.style.setProperty('--lx',vx.toFixed(2)+'px');
      app.style.setProperty('--ly',vy.toFixed(2)+'px');
      if(Math.abs(cx-vx)>.15||Math.abs(cy-vy)>.15)anim=requestAnimationFrame(boucle);
      else anim=0;
    }
    addEventListener('pointermove',e=>{
      cx=((e.clientX/innerWidth)-.5)*2*AMPL;
      cy=((e.clientY/innerHeight)-.5)*2*AMPL;
      if(!anim)anim=requestAnimationFrame(boucle);
    },{passive:true});
    // La souris quitte la fenêtre : la lumière revient à sa place, elle ne
    // reste pas figée dans un coin.
    addEventListener('pointerleave',()=>{cx=0;cy=0;if(!anim)anim=requestAnimationFrame(boucle)},{passive:true});
  })();

