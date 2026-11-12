  /* ===== accessibilité : modales (aria-modal + piège de focus + retour focus) ===== */
  (function(){
    const SEL='a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
    const visible=el=>el.offsetParent!==null;
    let lastFocus=null;
    const obs=new MutationObserver(muts=>muts.forEach(m=>{
      const ov=m.target;if(!ov.classList||!ov.classList.contains('ov'))return;
      const shown=ov.classList.contains('show');
      if(shown&&!ov._wasShown){ov._wasShown=true;ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');lastFocus=document.activeElement;
        const f=[...ov.querySelectorAll(SEL)].filter(visible)[0];f&&setTimeout(()=>{try{f.focus()}catch(e){}},60);}
      else if(!shown&&ov._wasShown){ov._wasShown=false;try{lastFocus&&lastFocus.focus&&lastFocus.focus()}catch(e){}}
    }));
    document.querySelectorAll('.ov').forEach(ov=>obs.observe(ov,{attributes:true,attributeFilter:['class']}));
    document.addEventListener('keydown',e=>{
      if(e.key!=='Tab')return;
      const ov=[...document.querySelectorAll('.ov.show')].pop();if(!ov)return;
      const els=[...ov.querySelectorAll(SEL)].filter(visible);if(!els.length)return;
      const first=els[0],last=els[els.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    });
  })();

  /* ═══ Gestes tactiles — le tiroir suit le doigt (bord gauche = ouvrir, balayage gauche = fermer) ═══ */
  (function(){
    const sb=$('#sidebar'),scrim=$('#scrim'),edge=$('#edgeZone');
    if(!sb||!scrim||!edge)return;
    let x0=0,y0=0,lastX=0,lastT=0,vx=0,mode=null,W=0,engaged=false;
    function drag(e){
      if(!mode)return;
      const dx=e.clientX-x0,dy=e.clientY-y0;
      if(!engaged){
        if(Math.abs(dy)>Math.abs(dx)+6){fin(false);return}   /* intention verticale → on rend la main au scroll */
        if(!((mode==='open'&&dx>8)||(mode==='close'&&dx<-8)))return;
        engaged=true;W=sb.getBoundingClientRect().width;
        sb.classList.add('dragging');scrim.classList.add('dragging');
        scrim.style.visibility='visible';scrim.style.opacity=mode==='close'?'1':'0';
      }
      const tx=mode==='open'?Math.min(0,Math.max(-W,dx-W)):Math.min(0,Math.max(-W,dx));
      sb.style.transform='translateX('+tx+'px)';
      scrim.style.opacity=String(Math.max(0,Math.min(1,1+tx/W)));
      if(e.timeStamp>lastT){vx=(e.clientX-lastX)/(e.timeStamp-lastT);lastX=e.clientX;lastT=e.timeStamp}
    }
    function fin(release){
      document.removeEventListener('pointermove',drag);
      document.removeEventListener('pointerup',up);
      document.removeEventListener('pointercancel',cancel);
      if(engaged){
        const cur=parseFloat((sb.style.transform.match(/-?[\d.]+/)||[0])[0]);   /* tx courant, négatif */
        const ouverture=1+cur/W;                                               /* 0 fermé → 1 ouvert */
        const isOpen=sb.classList.contains('open');
        const cible=release
          ? (mode==='open' ? (ouverture>0.35||vx>0.4) : !(ouverture<0.65||vx<-0.4))
          : isOpen;                                                            /* annulation : retour à l'état courant */
        sb.classList.remove('dragging');scrim.classList.remove('dragging');
        void sb.offsetWidth;                                                   /* transition réactivée AVANT le changement d'état */
        if(cible!==isOpen)toggleSidebar();
        sb.style.transform='';scrim.style.opacity='';scrim.style.visibility='';/* la transition part de la position du doigt */
      }
      mode=null;engaged=false;
    }
    function up(){fin(true)}
    function cancel(){fin(false)}
    function arme(m,e){
      mode=m;engaged=false;x0=lastX=e.clientX;y0=e.clientY;lastT=e.timeStamp;vx=0;
      document.addEventListener('pointermove',drag);
      document.addEventListener('pointerup',up);
      document.addEventListener('pointercancel',cancel);
    }
    edge.addEventListener('pointerdown',e=>{
      if(e.pointerType!=='touch'||window.innerWidth>1024||sb.classList.contains('open'))return;
      arme('open',e);
    });
    sb.addEventListener('pointerdown',e=>{
      if(e.pointerType!=='touch'||window.innerWidth>1024||!sb.classList.contains('open'))return;
      arme('close',e);
    });
  })();

