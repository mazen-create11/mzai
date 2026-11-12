  /* ===== onboarding première visite ===== */
  // En mode hébergé (accès par code) les clés vivent côté serveur → on saute l'étape « connecte ta clé ».
  let obSteps=[0,1,2],obIdx=0,obTheme=normTheme(DB.get('theme','dark'));
  const obStepList=()=>SHOW_API_SETTINGS&&!VIA_PROXY?[0,1,2]:[0,2];
  const curStep=()=>obSteps[obIdx];
  function startOnboarding(){obSteps=obStepList();obIdx=0;obTheme=normTheme(DB.get('theme','dark'));
    $('#obDots').innerHTML=obSteps.map((s,i)=>`<span class="ob-dot${i===0?' on':''}"></span>`).join('');
    $('#obThemes').innerHTML=[['light','Clair','#FAF8F3'],['dark','Sombre','#08080A']].map(([k,n,bg])=>`<div class="ob-theme${k===obTheme?' on':''}" data-th="${k}" role="button" tabindex="0" aria-label="Thème ${n}"><div class="ob-sw" style="background:${bg};border:1px solid var(--line-strong);border-radius:var(--r-sm);height:34px"></div><div class="ob-nm">${n}</div></div>`).join('');
    $$('#obThemes .ob-theme').forEach(el=>el.onclick=()=>{$$('#obThemes .ob-theme').forEach(x=>x.classList.remove('on'));el.classList.add('on');obTheme=el.dataset.th;applyTheme(obTheme,true);renderThemePicker()});
    $('#obTools').innerHTML=[['Assistant','persona'],['Image','eye'],['Documents','note'],['Traduction','globe'],['Voix','spark'],['Code','code']].map(([n,g])=>`<span class="ob-tool"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GLYPH[g]||GLYPH.spark}</svg>${n}</span>`).join('');
    const ok=$('#obKey');if(ok)ok.value=VIA_PROXY?'':(KEYS.openrouter||'');$('#obKeyStat').textContent='';$('#obKeyStat').className='ob-keystat';
    obShow();$('#onboard').classList.add('show');
  }
  function obShow(){
    const st=curStep();
    $$('#onboard .ob-step').forEach(s=>s.hidden=+s.dataset.step!==st);
    $$('#onboard .ob-dot').forEach((d,i)=>d.classList.toggle('on',i===obIdx));
    $('#obBack').style.display=obIdx===0?'none':'';
    $('#obSkip').style.display=obIdx===obSteps.length-1?'none':'';
    $('#obNext').textContent=obIdx===obSteps.length-1?'Commencer ✦':'Continuer';
    if(st===1)setTimeout(()=>{const k=$('#obKey');k&&k.focus()},80);
  }
  async function obTest(){
    const k=cleanKey($('#obKey').value),st=$('#obKeyStat');
    if(!k){st.className='ob-keystat warn';st.textContent='Colle d\'abord ta clé OpenRouter.';return;}
    st.className='ob-keystat';st.textContent='Vérification…';
    try{
      const r=await fetch('https://openrouter.ai/api/v1/auth/key',{headers:{'Authorization':'Bearer '+k}});
      if(r.ok){KEYS.openrouter=k;persistKeys();renderApiList();syncModel();
        let d=null;try{d=(await r.json()).data}catch(e){}
        const noCredit=d&&((d.limit_remaining!=null&&d.limit_remaining<=0)||(d.limit!=null&&typeof d.usage==='number'&&d.usage>=d.limit));
        if(noCredit){st.className='ob-keystat warn';st.textContent='Clé valide, mais ton crédit OpenRouter semble épuisé — ajoute quelques € sur openrouter.ai, sinon les réponses échoueront.';}
        else{st.className='ob-keystat ok';st.textContent='✓ Clé valide ! Pense à garder un peu de crédit OpenRouter pour les réponses.';}
      }
      else if(r.status===401){st.className='ob-keystat warn';st.textContent='Clé refusée (401). Recopie-la depuis openrouter.ai/keys.';}
      else{st.className='ob-keystat warn';st.textContent='Réponse '+r.status+' — réessaie dans un instant.';}
    }catch(e){st.className='ob-keystat warn';st.textContent='Connexion impossible. Tu peux continuer et coller la clé dans Réglages.';}
  }
  function obNext(){if(obIdx<obSteps.length-1){obIdx++;obShow();}else obFinish();}
  function obBack(){if(obIdx>0){obIdx--;obShow();}}
  function obFinish(){
    const k=$('#obKey')?$('#obKey').value.trim():'';if(k&&k!==KEYS.openrouter){KEYS.openrouter=k;persistKeys();renderApiList();syncModel();}
    DB.set('theme',obTheme);DB.set('onboarded',true);$('#onboard').classList.remove('show');
    prompt&&prompt.focus();
  }
  $('#obNext').addEventListener('click',obNext);
  $('#obBack').addEventListener('click',obBack);
  $('#obBack').style.display='none';
  $('#obSkip').addEventListener('click',obFinish);
  $('#obTest').addEventListener('click',obTest);

  /* ===== PWA : installable ===== */
  let deferredPrompt=null;
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;$('#installBtn')&&($('#installBtn').style.display='flex')});
  window.addEventListener('appinstalled',()=>{toast('MAZ installée ✦');$('#installBtn')&&($('#installBtn').style.display='none')});
  async function installApp(){if(deferredPrompt){deferredPrompt.prompt();const r=await deferredPrompt.userChoice;deferredPrompt=null;$('#installBtn')&&($('#installBtn').style.display='none');toast(r.outcome==='accepted'?'Installation…':'Installation annulée')}else toast('Utilise le menu du navigateur › « Installer MAZ »')}

  /* ===== clavier mobile : garder le composer visible (visualViewport) ===== */
  (function(){
    const vv=window.visualViewport;if(!vv)return;
    const app=document.getElementById('app');if(!app)return;let raf=0;
    const sync=()=>{raf=0;const kb=window.innerHeight-vv.height-vv.offsetTop;
      // écrit --app-h sur l'élément racine #app (et non style.height d'une autre cible)
      if(kb>110){app.style.setProperty('--app-h',vv.height+'px');if(generating||activeId)scrollDown&&scrollDown();}
      else app.style.removeProperty('--app-h');};
    const onVV=()=>{if(!raf)raf=requestAnimationFrame(sync)};
    vv.addEventListener('resize',onVV);vv.addEventListener('scroll',onVV);
  })();
  /* à l'accueil, le focus du champ recentre le composer (clavier virtuel) */
  $('#prompt').addEventListener('focus',()=>{
    if($('#app').dataset.view==='home')setTimeout(()=>{try{$('#prompt').scrollIntoView({block:'center',behavior:'smooth'})}catch(e){}},80);
  });

  /* a11y : les éléments role=button (divs cliquables : onboarding, vignettes thème…) s'activent au clavier */
  document.addEventListener('keydown',e=>{
    if(e.key!=='Enter'&&e.key!==' ')return;
    const t=e.target,r=t&&t.getAttribute('role');if(r!=='button'&&r!=='switch')return;
    if(t.matches('button,a[href],input,textarea,select'))return;
    e.preventDefault();t.click();
  });
  /* a11y : reflète l'état réel des interrupteurs/segments après bascule */
  document.addEventListener('click',e=>{const t=e.target&&e.target.closest('.toggle,.sg,.ob-theme,.ps-preset,.ptype,.chip');if(!t)return;setTimeout(()=>{const grp=t.parentElement?t.parentElement.querySelectorAll('.toggle,.sg,.ob-theme,.ps-preset,.ptype,.chip'):[t];(grp.length?grp:[t]).forEach(el=>{const on=el.classList.contains('on')||el.classList.contains('active');if(el.matches('.toggle'))el.setAttribute('aria-checked',on?'true':'false');else el.setAttribute('aria-pressed',on?'true':'false');});},0);});
