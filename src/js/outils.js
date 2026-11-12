  /* ===== SÉLECTEUR D'OUTILS (10 outils) — pilote currentMode + opts + model-pill ===== */
  let currentMode='text';
  const opts={search:false,reason:false};                                  // toggles cumulables (Assistant)
  const toolCfg={docAction:'Résumé',trFrom:'auto',trTo:'en',trReg:'Vouvoiement',trGloss:'',trCheck:false,codeLang:'Auto',asrLang:'fr-FR',asrEngine:'omni'};
  /* noms de langues propres via Intl.DisplayNames (repli sur le code) */
  const LANG_CODES=['auto','fr','en','es','de','it','pt','ar','zh','ja','ru','nl','pl','tr','ko','hi'];
  const _LDN=(()=>{try{return new Intl.DisplayNames(['fr'],{type:'language'})}catch(e){return null}})();
  function langName(code){if(code==='auto')return 'Détection auto';let n=_LDN?_LDN.of(code):code;return n?n.charAt(0).toUpperCase()+n.slice(1):code;}
  let lastTextModel=currentModel;                                          // mémorise le modèle texte choisi
  const MODE_CAT={text:'text',image:'image',video:'video',voice:'voice',doc:'text',translate:'text',transcribe:'text',code:'coder'};
  const MODE_LABEL={image:'Image',video:'Vidéo',voice:'Voix',doc:'Documents',translate:'Traduction',transcribe:'Transcription',code:'Code'};
  const PLACEHOLDER={text:'Pose ta question à MAZ…',image:'Décris l\'image à créer…',video:'Décris la vidéo à créer…',voice:'Texte à lire en voix off…',doc:'Pose ta question sur le document joint…',translate:'Colle le texte à traduire…',transcribe:'Micro live ou importe un fichier audio…',code:'Décris ce que le code doit faire…'};
  function modelForMode(mode){const cat=MODE_CAT[mode]||'text';
    if(cat==='image')return (MODELS.find(m=>m.kind==='image')||{}).id;
    if(cat==='video')return (MODELS.find(m=>m.kind==='video')||{}).id;
    if(cat==='voice')return 'CosyVoice 2';                                 // genVoice utilise CosyVoice2 → pill honnête
    if(cat==='coder')return (MODELS.find(m=>/Code/.test(m.tag||'')||/cod/i.test(m.id))||{id:lastTextModel}).id;
    return lastTextModel;}
  function setMode(mode){
    if((MODE_CAT[currentMode]||'text')==='text')lastTextModel=currentModel;
    currentMode=(currentMode===mode)?'text':mode;
    const want=modelForMode(currentMode);
    if(want&&want!==currentModel){currentModel=want;syncModel()}
    prompt.placeholder=PLACEHOLDER[currentMode]||PLACEHOLDER.text;
    renderModeChip();renderToolOpts();syncToolUI();
    if(currentMode!=='text')toast(MODE_LABEL[currentMode]+' — outil activé');
  }
  const XSVG='<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  function renderModeChip(){
    let h='';
    const _txt=MODE_CAT[currentMode]==='text';
    if(currentMode!=='text'&&MODE_LABEL[currentMode])h+='<span class="mode-chip">'+MODE_LABEL[currentMode]+'<span class="mc-x" data-x="mode" role="button" tabindex="0" aria-label="Retirer l\'outil">'+XSVG+'</span></span>';
    if(_txt&&opts.search)h+='<span class="mode-chip">Recherche<span class="mc-x" data-x="search" role="button" tabindex="0" aria-label="Désactiver la recherche">'+XSVG+'</span></span>';
    if(_txt&&opts.reason)h+='<span class="mode-chip">Réflexion<span class="mc-x" data-x="reason" role="button" tabindex="0" aria-label="Désactiver la réflexion">'+XSVG+'</span></span>';
    $('#modeChip').innerHTML=h;
    $$('#modeChip .mc-x').forEach(x=>x.onclick=()=>{const k=x.dataset.x;if(k==='mode')setMode(currentMode);else{opts[k]=false;renderModeChip();syncToolUI()}});
  }
  /* ===== Menu d'options générique premium — remplace TOUS les <select> natifs de la barre d'outils ===== */
  let _popOpt=null,_optKey=null,_popAnchor=null;
  function ensureOptPop(){if(_popOpt)return _popOpt;_popOpt=document.createElement('div');_popOpt.className='pop optmenu';_popOpt.setAttribute('role','listbox');document.body.appendChild(_popOpt);return _popOpt;}
  function openOptMenu(anchor,items,currentValue,onPick){
    const pop=ensureOptPop(),cur=String(currentValue);_popAnchor=anchor;
    pop.innerHTML=items.map(it=>{const s=String(it.value)===cur;
      return '<div class="pi opt-item'+(s?' sel':'')+'" role="option" aria-selected="'+s+'" tabindex="-1" data-val="'+esc(String(it.value))+'"><div class="pi-main"><div class="pi-t">'+esc(it.label)+'</div>'+(it.hint?'<div class="pi-d">'+esc(it.hint)+'</div>':'')+'</div><span class="pi-check"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M20 6 9 17l-5-5"/></svg></span></div>';
    }).join('');
    showPop(pop,anchor,'left',anchor);
    anchor.setAttribute('aria-expanded','true');
    const rows=Array.prototype.slice.call(pop.querySelectorAll('.opt-item'));
    const pick=el=>{if(!el)return;onPick(el.getAttribute('data-val'));closePop();anchor.setAttribute('aria-expanded','false');anchor.focus();};
    rows.forEach(el=>el.addEventListener('click',()=>pick(el)));
    let i=Math.max(0,rows.findIndex(el=>el.classList.contains('sel')));
    const focusAt=n=>{i=(n+rows.length)%rows.length;rows.forEach((el,j)=>el.classList.toggle('k',j===i));rows[i].focus();rows[i].scrollIntoView({block:'nearest'});};
    requestAnimationFrame(()=>{if(rows.length)focusAt(i);});
    if(_optKey)pop.removeEventListener('keydown',_optKey);
    _optKey=e=>{
      if(e.key==='ArrowDown'){e.preventDefault();focusAt(i+1);}
      else if(e.key==='ArrowUp'){e.preventDefault();focusAt(i-1);}
      else if(e.key==='Home'){e.preventDefault();focusAt(0);}
      else if(e.key==='End'){e.preventDefault();focusAt(rows.length-1);}
      else if(e.key==='Enter'||e.key===' '){e.preventDefault();pick(rows[i]);}
      else if(e.key==='Escape'){e.preventDefault();closePop();anchor.setAttribute('aria-expanded','false');anchor.focus();}
      else if(e.key==='Tab'){closePop();anchor.setAttribute('aria-expanded','false');}
    };
    pop.addEventListener('keydown',_optKey);
  }
  const OPT_CHEV='<svg class="oc-chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
  function upgradeOptSelects(host){
    host.querySelectorAll('select[data-opt]').forEach(sel=>{
      if(sel.dataset.up)return;sel.dataset.up='1';
      const wrap=sel.closest('.opt')||sel.parentElement;
      const lblEl=wrap.querySelector('label');
      const label=lblEl?lblEl.textContent.replace(/\s+/g,' ').trim():'';
      sel.classList.add('opt-native');
      const btn=document.createElement('button');
      btn.type='button';btn.className='opt-select';
      btn.setAttribute('data-popanchor','');
      btn.setAttribute('aria-haspopup','listbox');
      btn.setAttribute('aria-expanded','false');
      if(label)btn.setAttribute('aria-label',label);
      const curText=()=>{const o=sel.options[sel.selectedIndex];return o?o.text:'';};
      const paint=()=>{btn.innerHTML=(label?'<span class="os-lbl">'+esc(label)+'</span>':'')+'<span class="os-val">'+esc(curText())+'</span>'+OPT_CHEV;};
      paint();
      if(lblEl)lblEl.remove();
      wrap.classList.add('opt-select-host');
      wrap.insertBefore(btn,sel);
      btn.addEventListener('click',()=>{
        const wasOpen=openPop===_popOpt&&_popAnchor===btn;
        closePop();
        if(wasOpen)return;
        const items=Array.prototype.map.call(sel.options,o=>({value:o.value||o.text,label:o.text}));
        openOptMenu(btn,items,sel.value||curText(),val=>{
          for(let k=0;k<sel.options.length;k++){const o=sel.options[k];if((o.value||o.text)===val){sel.selectedIndex=k;break;}}
          sel.dispatchEvent(new Event('change'));
          paint();
        });
      });
    });
  }
  function renderToolOpts(){
    const host=$('#toolOpts');let h='';
    if(currentMode==='image'||currentMode==='video'){
      h='';   // modèle choisi via la pastille (plus de ligne redondante) ; l'image source passe par le trombone, rappelé dans le placeholder
    }else if(currentMode==='voice'){
      h='';   // voix = CosyVoice 2, pas d'option à régler → composer épuré
    }else if(currentMode==='doc'){
      h='<span class="opt"><label>Action</label><select data-opt="docAction">'+['Résumé','Extraction','Q&A'].map(a=>'<option'+(a===toolCfg.docAction?' selected':'')+'>'+a+'</option>').join('')+'</select></span><button class="opt" type="button" data-opt="docAttach" style="cursor:pointer;font:inherit">+ Joindre un document</button><span class="opt-note">PDF · DOCX · XLSX · TXT</span>';
    }else if(currentMode==='translate'){
      const opt=(c,sel)=>'<option value="'+c+'"'+(c===sel?' selected':'')+'>'+esc(langName(c))+'</option>';
      h='<span class="opt"><label>De</label><select data-opt="trFrom">'+LANG_CODES.map(c=>opt(c,toolCfg.trFrom)).join('')+'</select></span>'
       +'<button class="opt" type="button" data-opt="trSwap" data-tip="Inverser source / cible" aria-label="Inverser" style="cursor:pointer;font:inherit;padding:6px 9px">⇄</button>'
       +'<span class="opt"><label>Vers</label><select data-opt="trTo">'+LANG_CODES.filter(c=>c!=='auto').map(c=>opt(c,toolCfg.trTo)).join('')+'</select></span>'
       +'<span class="opt"><label>Registre</label><select data-opt="trReg">'+['Vouvoiement','Tutoiement','Soutenu','Familier','Marketing','Technique'].map(r=>'<option'+(r===toolCfg.trReg?' selected':'')+'>'+r+'</option>').join('')+'</select></span>'
       +'<button class="opt" type="button" data-opt="trGlossBtn" style="cursor:pointer;font:inherit">＋ Glossaire</button>'
       +'<label class="opt" style="cursor:pointer;gap:5px;display:inline-flex;align-items:center"><input type="checkbox" data-opt="trCheck"'+(toolCfg.trCheck?' checked':'')+' style="accent-color:var(--accent);margin:0"> Vérifier (côte à côte)</label>'
       +'<div class="opt glossbox" data-glossbox style="display:'+(toolCfg.trGloss?'flex':'none')+';flex-basis:100%;width:100%;padding:0"><textarea data-opt="trGlossArea" rows="2" placeholder="Glossaire — une entrée par ligne :  terme source = terme cible" style="width:100%;font:inherit;font-size:16px;resize:vertical;border:1px solid var(--line-strong);border-radius:var(--r-xs);padding:6px 8px;background:var(--surface);color:var(--ink)">'+esc(toolCfg.trGloss||'')+'</textarea></div>';
    }else if(currentMode==='transcribe'){
      h='<button class="opt" type="button" data-opt="asrFile" style="cursor:pointer;font:inherit">+ Importer un audio</button>'
       +'<span class="opt"><label>Moteur</label><select data-opt="asrEngine"><option value="omni"'+(toolCfg.asrEngine!=='sense'?' selected':'')+'>Qwen3-Omni · FR + multilingue</option><option value="sense"'+(toolCfg.asrEngine==='sense'?' selected':'')+'>SenseVoice · zh/en rapide</option></select></span>'
       +'<span class="opt"><label>Micro (live)</label><select data-opt="asrLang"><option value="fr-FR"'+(toolCfg.asrLang==='fr-FR'?' selected':'')+'>FR</option><option value="en-US"'+(toolCfg.asrLang==='en-US'?' selected':'')+'>EN</option></select></span>'
       +'<span class="opt-note">Micro live = bouton 🎤 dans la barre · Fichier ≤ ~10 Mo (~10 min) · post-traitement &amp; .srt</span>';
    }else if(currentMode==='code'){
      h='<span class="opt"><label>Langage</label><select data-opt="codeLang">'+['Auto','HTML/CSS/JS','Python','JavaScript','TypeScript','React','SQL','Rust','Go','Bash'].map(l=>'<option'+(l===toolCfg.codeLang?' selected':'')+'>'+l+'</option>').join('')+'</select></span><span class="opt-note">Aperçu live pour HTML autonome</span>';
    }
    host.innerHTML=h;autoLabelAll();
    host.querySelectorAll('select[data-opt]').forEach(s=>s.onchange=()=>{const k=s.dataset.opt;
      if(k in toolCfg)toolCfg[k]=s.value;
    });
    const da=host.querySelector('[data-opt=docAttach]');if(da)da.onclick=()=>{importMode=false;prjFileMode=false;$('#fileInput').multiple=true;$('#fileInput').click()};
    const af=host.querySelector('[data-opt=asrFile]');if(af)af.onclick=()=>{importMode=false;prjFileMode=false;$('#fileInput').multiple=false;$('#fileInput').click()};
    const am=host.querySelector('[data-opt=asrMic]');if(am)am.onclick=()=>toggleLiveTranscribe(am);
    const tsw=host.querySelector('[data-opt=trSwap]');if(tsw)tsw.onclick=()=>{const a=toolCfg.trFrom,b=toolCfg.trTo;toolCfg.trFrom=b;toolCfg.trTo=(a==='auto'?toolCfg.trTo:a);renderToolOpts()};
    const tch=host.querySelector('[data-opt=trCheck]');if(tch)tch.onchange=()=>{toolCfg.trCheck=tch.checked};
    const tga=host.querySelector('[data-opt=trGlossArea]');if(tga)tga.oninput=()=>{toolCfg.trGloss=tga.value};
    const tgb=host.querySelector('[data-opt=trGlossBtn]');if(tgb)tgb.onclick=()=>{const bx=host.querySelector('[data-glossbox]');if(!bx)return;const show=bx.style.display==='none';bx.style.display=show?'flex':'none';host.classList.toggle('gloss-open',show);if(show){const ta=bx.querySelector('textarea');ta&&ta.focus()}};
    host.classList.toggle('gloss-open',currentMode==='translate'&&!!toolCfg.trGloss);   // état initial (glossaire pré-rempli → ouvert)
    upgradeOptSelects(host);   // remplace chaque <select> natif par un déclencheur premium (menu maison)
  }
  function syncToolUI(){
    const _txt=MODE_CAT[currentMode]==='text';
    $$('#popTools .pi[data-mode]').forEach(p=>{const on=p.dataset.mode===currentMode;p.classList.toggle('sel',on);p.setAttribute('aria-pressed',on?'true':'false')});
    $$('#popTools .pi[data-toggle]').forEach(p=>{const on=_txt&&!!opts[p.dataset.toggle];p.style.display=_txt?'':'none';p.classList.toggle('sel',on);p.setAttribute('aria-pressed',on?'true':'false')});
  }
  /* bouton « + Outils » → popover (réutilise showPop/.pop, ancre .pop-on, jamais .open) */
  $('#toolsBtn').setAttribute('data-popanchor','');
  $('#toolsBtn').addEventListener('click',()=>{const tb=$('#toolsBtn');
    if(openPop===$('#popTools')){closePop();tb.setAttribute('aria-expanded','false');return}
    showPop($('#popTools'),tb,'left',tb);tb.setAttribute('aria-expanded','true');
  });
  $$('#popTools .pi[data-add]').forEach(p=>p.addEventListener('click',()=>{closePop();if(p.dataset.add==='file'){importMode=false;prjFileMode=false;$('#fileInput').multiple=true;$('#fileInput').click()}}));
  $$('#popTools .pi[data-mode]').forEach(p=>p.addEventListener('click',()=>{setMode(p.dataset.mode);closePop()}));
  $$('#popTools .pi[data-toggle]').forEach(p=>p.addEventListener('click',()=>{const k=p.dataset.toggle;if(MODE_CAT[currentMode]!=='text'){toast('Disponible avec l\'Assistant');return}opts[k]=!opts[k];renderModeChip();syncToolUI();toast((k==='search'?'Recherche web':'Réflexion')+(opts[k]?' activée':' désactivée'))}));

