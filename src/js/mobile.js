  /* ═══ Appui long sur une conversation → feuille d'actions (mobile n'avait AUCUN accès à renommer/supprimer) ═══ */
  function ouvrirSheetConvo(id){
    const c=convoById(id);if(!c)return;
    const veil=$('#sheetVeil'),sh=$('#sheetConvo');
    $('#sheetTitle').textContent=c.title;
    const IC={
      open:'<path d="M21 11.5a8.5 8.5 0 0 1-12.5 7.5L3 21l2-5.5A8.5 8.5 0 1 1 21 11.5z"/>',
      pin:'<path d="M12 17v5M9 3h6l-1 7 3 2v2H7v-2l3-2z"/>',
      rename:'<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
      del:'<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z"/>'
    };
    const rows=[
      {a:'open',t:'Ouvrir',ic:IC.open},
      {a:'pin',t:c.pinned?'Désépingler':'Épingler',ic:IC.pin},
      {a:'rename',t:'Renommer',ic:IC.rename},
      {a:'del',t:'Mettre à la corbeille',ic:IC.del,danger:true}
    ];
    $('#sheetBody').innerHTML=rows.map(r=>'<button type="button" class="sheet-i'+(r.danger?' danger':'')+'" data-a="'+r.a+'"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+r.ic+'</svg>'+r.t+'</button>').join('');
    veil.hidden=false;sh.hidden=false;
    requestAnimationFrame(()=>{veil.classList.add('show');sh.classList.add('show')});
    const ferme=()=>{veil.classList.remove('show');sh.classList.remove('show');setTimeout(()=>{veil.hidden=true;sh.hidden=true},280)};
    veil.onclick=ferme;
    $$('#sheetBody .sheet-i').forEach(b=>b.onclick=()=>{ferme();const a=b.dataset.a;
      if(a==='open')openConvo(id);
      else if(a==='pin')togglePin(id);
      else if(a==='rename')renameConvo(id);
      else if(a==='del')deleteConvo(id);
    });
  }
  (function(){
    const list=$('#recentList');if(!list)return;
    let t=null,px=0,py=0,fired=false;
    const annule=()=>{if(t){clearTimeout(t);t=null}};
    list.addEventListener('pointerdown',e=>{
      if(e.pointerType!=='touch')return;
      const p=e.target.closest('.chat-pill');if(!p)return;
      px=e.clientX;py=e.clientY;fired=false;
      const id=p.dataset.id;
      t=setTimeout(()=>{t=null;fired=true;navigator.vibrate&&navigator.vibrate(10);ouvrirSheetConvo(id)},450);
    });
    list.addEventListener('pointermove',e=>{if(t&&(Math.abs(e.clientX-px)>8||Math.abs(e.clientY-py)>8))annule()});
    list.addEventListener('pointerup',annule);
    list.addEventListener('pointercancel',annule);
    list.addEventListener('click',e=>{if(fired){e.stopPropagation();e.preventDefault();fired=false}},true);   /* le tap qui suit l'appui long n'ouvre pas la conversation */
    list.addEventListener('contextmenu',e=>{if(fired)e.preventDefault()});
  })();
