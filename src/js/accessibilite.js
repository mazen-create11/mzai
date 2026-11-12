  /* a11y : étiquette automatiquement les champs sans label (depuis placeholder / label du .field) */
  function autoLabelAll(){
    $$('input,textarea,select').forEach(el=>{
      if(el.getAttribute('aria-label')||el.getAttribute('aria-labelledby')||el.closest('label')||(el.id&&document.querySelector('label[for="'+el.id+'"]')))return;
      const ph=el.getAttribute('placeholder');const fl=el.closest('.field,.opt')?(el.closest('.field,.opt').querySelector('label')||{}).textContent:'';
      const lab=(fl||ph||el.dataset.opt||'Champ').toString().trim();if(lab)el.setAttribute('aria-label',lab);   // le label visible prime sur le placeholder (WCAG 2.5.3 « Label in Name »)
    });
  }
  /* a11y : rend les contrôles d'action (divs/spans cliquables) focusables + nommés + activables au clavier (cf. handler keydown role=button) */
  const A11Y_SEL='.la,.pa,.ax,.mc-x,.pf-x,.gm-b,.help-link,.src,.toggle,.chat-pill,.lrow,.pcard,.irow,.ps-preset,.prchip,.faq-q,.cp-item,.sug,.ob-theme,.slash-i,.pi[data-mode],.pi[data-toggle],.pi[data-pf],.pi[data-add],.ptype,.nw-road,.pp-file .pf-x,.btn,.m-x,.mini-btn,.sg,.ltag,.pr-row,.rt,.swatch,.vbtn,.tu';
  function a11yButtons(root){root=root||document;const els=root.nodeType===1&&root.matches&&root.matches(A11Y_SEL)?[root,...root.querySelectorAll(A11Y_SEL)]:[...root.querySelectorAll(A11Y_SEL)];els.forEach(el=>{
    if(el.matches('button,a,input,textarea,select'))return;
    if(!el.getAttribute('role'))el.setAttribute('role',el.matches('.toggle')?'switch':'button');
    if(!el.hasAttribute('tabindex'))el.setAttribute('tabindex','0');
    if(!el.getAttribute('aria-label')){const t=(el.getAttribute('data-tip')||el.textContent||'').replace(/\s+/g,' ').trim().slice(0,60)||(el.matches('.m-x,.mc-x,.pf-x,.ax')?'Fermer':'');if(t)el.setAttribute('aria-label',t);}
    if(el.matches('.toggle'))el.setAttribute('aria-checked',el.classList.contains('on')?'true':'false');   // état réel de l'interrupteur
    else if(el.matches('.sg,.ob-theme,.ps-preset,.ptype'))el.setAttribute('aria-pressed',(el.classList.contains('on')||el.classList.contains('active')||el.classList.contains('sel'))?'true':'false');
  });}
  let _a11yT=0,_a11yRoots=[];
  function _a11ySweep(){const roots=_a11yRoots;_a11yRoots=[];if(roots.length){roots.forEach(n=>{if(n&&n.nodeType===1)a11yButtons(n)});}else{a11yButtons();}autoLabelAll();}
  (function(){const app=document.getElementById('app');if(!app)return;new MutationObserver(muts=>{for(const m of muts)for(const n of m.addedNodes)if(n.nodeType===1)_a11yRoots.push(n);clearTimeout(_a11yT);_a11yT=setTimeout(_a11ySweep,250);}).observe(app,{childList:true,subtree:true});})();
  /* ===== init : restaure l'état persistant ===== */
  (function init(){
    if(SETTINGS.memory===undefined)SETTINGS.memory=true;
    applyTheme(normTheme(DB.get('theme','dark')),true);   // anti-FOUC déjà posé dans <head> ; ici on resynchronise le bouton
    renderThemePicker();
    $$('#segDensity .sg').forEach(b=>b.classList.toggle('on',b.dataset.d===(SETTINGS.density||'cozy')));
    $$('.set-body .toggle[data-set]').forEach(t=>t.classList.toggle('on',!!SETTINGS[t.dataset.set]));
    opts.search=!!SETTINGS.webSearch;opts.reason=!!SETTINGS.showReason;renderModeChip();syncToolUI();  // état initial des toggles depuis les préférences
    applyAnim();applyDensity();applyUser();applyPersona();syncModel();updateCount();
    if(SESSION_TOKENS>0||SESSION_COST>0)_renderTok(false);
    autoLabelAll();a11yButtons();
    // En mode hébergé, l'onboarding est lancé par onAuthed (après l'écran de code), jamais derrière lui.
    if(!Relais.viaProxy&&!DB.get('onboarded',false))setTimeout(startOnboarding,400);
  })();

