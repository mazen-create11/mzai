  async function runGen(node, _, opts){
    setGenerating(true);
    const col=node.querySelector('.col'),bubble=node.querySelector('.bubble');
    let stopped=false,fin=false,reasonText="",reasonBox=null,fullText="",ctrl=null,idle=null,timedOut=false,injTotal=0,injUsed=0,resolvedModel=opts.model,wasAuto=false,finishReason="",streamEl=null,gotChunk=false,_scrollP=false;const t0=performance.now();
    const _scrollSoon=()=>{if(_scrollP)return;_scrollP=true;requestAnimationFrame(()=>{_scrollP=false;scrollDown();});};   // un seul scroll par frame
    const truncNote=()=>finishReason==='length'?'\n\n_✂️ Réponse tronquée (limite de longueur atteinte) — écris « continue » pour la suite._':'';
    const finish=(text,meta)=>{
      if(fin)return;fin=true;meta=meta||{};clearTimeout(idle);setGenerating(false);curStop=null;   // libère l'UI en premier : un échec de rendu/persistance ne fige plus l'app en « génération »
      if(reasonBox){const ri=reasonBox.querySelector('.rc-in');if(reasonText)ri.textContent=reasonText;reasonBox.classList.remove('open','live');const lbl=reasonBox.querySelector('.rt-lbl');if(lbl)lbl.textContent=modelById(opts.model).id+' a réfléchi'+(meta.ms?' · '+(meta.ms/1000).toFixed(1)+'s':'');}
      let copyText=text,qcDone=false;
      if(currentMode==='translate'&&toolCfg.trCheck){const j=renderTransQC(bubble,text);if(j!=null){copyText=j;qcDone=true;}}  // côte-à-côte + contrôle qualité
      if(!qcDone){bubble.classList.add('md');bubble.innerHTML=(meta.demo?'<div class="demo-tag">Mode démonstration — aucune clé API active, réponse simulée</div>':'')+renderMD(text)+sourcesBlock(opts.model,meta.sources);}
      wireBubble(bubble);addActions(col,copyText,node,meta.error,resolvedModel);
      if(injTotal>0){const b=injBadge(injUsed,injTotal);if(b)col.appendChild(b);}                          // transparence : X / Y caractères de document injectés
      if(currentMode==='doc'&&toolCfg.docAction==='Extraction')addJsonDownload(col,text);                  // export .json structuré
      if(meta.usage||meta.ms){const s=statsEl(wasAuto?'MAZ Auto → '+resolvedModel:resolvedModel,meta.ms,meta.usage,true);if(s)col.appendChild(s);}
      if(VIA_PROXY&&meta.usage){try{fetch(_PB+'/usage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tokens:+meta.usage.total_tokens||0,cost:+meta.usage.cost||0})}).catch(()=>{})}catch(e){}}   // consommation par compte (préparé facturation)
      scrollDown();
      opts.onDone&&opts.onDone(text,{reasonText,sources:meta.sources,usage:meta.usage,ms:meta.ms,resolved:resolvedModel,auto:wasAuto,error:meta.error});
    };
    curStop=()=>{stopped=true;if(ctrl){try{ctrl.abort()}catch(e){}}};
    bubble.innerHTML='<div class="gen-loading"><div class="gl-ring"></div>Génération en cours…</div>';
    
    try {
      const c = convoById(activeId);
      const qcMode=(currentMode==='translate'&&toolCfg.trCheck);  // mode vérification : on masque le JSON brut pendant le stream
      let mData = modelById(opts.model);
      if(mData.provider==='mz' && KEYS.openrouter){  // MAZ Auto → routage selon la demande (transparent : modèle réel révélé sous la réponse)
        const lastMsg=(c.msgs.filter(m=>m.role==='user'&&!m.fs).pop())||{};   // le routage se cale sur la vraie question, pas sur l'injection de fichiers
        const lastUser=lastMsg.text||'';
        const t=lastUser.toLowerCase();
        const hasImg=(lastMsg.files||[]).some(f=>f.isImg&&f.b64);
        let api,name;
        _routeWhy=null;   // la raison du routage, révélée dans .msg-stats — la transparence est la signature
        if(hasImg){api=VISION_DOC;name='Qwen3-VL · vision';_routeWhy='image jointe';}          // toute image → modèle vision
        else if(currentMode==='code'){api='moonshotai/kimi-k2.7-code';name='Kimi K2.7 Code';_routeWhy='outil Code';}   // l'outil dicte le modèle…
        else if(currentMode==='doc'||currentMode==='translate'||currentMode==='transcribe'){api='deepseek/deepseek-v4-pro';name='DeepSeek V4 Pro';_routeWhy='outil '+currentMode;}
        else{   // …sinon (Assistant), heuristique sur le contenu
          const isCode=/```/.test(lastUser)||/\b(code|coder|coding|fonction|function|bug|debug|refactor|déboguer|sql|regex|python|javascript|typescript|css|html|react|composant|component|api|endpoint|stack ?trace|compil)\b/.test(t);
          const isMath=/\b(calcul|équation|equation|intégrale|integral|dérivée|derivee|probabilit|matrice|théorème|theoreme|résous|resous|factorise)\b/.test(t)||/\d\s*[+\-*/^=]\s*[\d(]/.test(lastUser);
          const isHard=isMath||lastUser.length>600||/\b(analyse|raisonne|démontre|demontre|prouve|stratégie|strateg|compare|optimise|architecture|explique en détail|étape par étape|plan détaillé)\b/.test(t);
          if(isCode){api='moonshotai/kimi-k2.7-code';name='Kimi K2.7 Code';_routeWhy='code détecté';}
          else if(isHard){api='deepseek/deepseek-v4-pro';name='DeepSeek V4 Pro';_routeWhy=isMath?'calcul détecté':'demande complexe';}
          else{api='deepseek/deepseek-v4-flash';name='DeepSeek V4 Flash';_routeWhy='demande courante';}
        }
        mData={...mData,provider:'openrouter',api};
        wasAuto=true;const rm=MODELS.find(m=>m.api===api);resolvedModel=rm?rm.id:name;
        // la pill révèle le routage LE TEMPS de la réponse — syncModel() la
        // restaure à la fin de génération : on voit le routeur travailler
        const _pl=document.querySelector('.model-pill .lbl');if(_pl)_pl.textContent=resolvedModel;
      }
      const isOR = mData.provider === 'openrouter';
      const isSF = mData.provider === 'siliconflow' && mData.kind!=='image' && mData.kind!=='video' && mData.kind!=='audio';
      if(!isOR && !isSF){
        if(MODE_CAT[currentMode]==='text' && opts.model!=='MAZ Auto'){ currentModel='MAZ Auto';syncModel();return runGen(node,_,{...opts,model:'MAZ Auto'}); }  // modèle média égaré en conversation texte → assistant réel (pas de boucle : au 2e passage model=MAZ Auto route vers OpenRouter)
        return finish(REPLIES[ri++%REPLIES.length],{demo:true});  // vrai cas « sans clé » → réponse simulée, désormais explicitement badgée
      }

      const apiKey = isOR ? KEYS['openrouter'] : KEYS['siliconflow'];
      if(!apiKey){ bubble.classList.remove('md'); return finish(VIA_PROXY?'⚠️ **Service momentanément indisponible.** Réessaie dans un moment.':'⚠️ Clé API manquante pour '+(isOR?'OpenRouter':'SiliconFlow')+'. Ajoute-la dans Paramètres › Connexions API.',{error:true}); }

      // Truncation intelligente : garde les 24 derniers messages, tronque les longs
      const allMsgs=c.msgs.filter(m=>m.text);
      let trimmedMsgs=allMsgs.length>24?allMsgs.slice(-24):allMsgs;
      if(allMsgs.length>24){  // pin : un message porteur de fichier ne doit jamais disparaître hors fenêtre
        const carriers=allMsgs.filter(m=>(m.files||[]).some(f=>f.textContent||f.b64||(f.ocrPages&&f.ocrPages.length))&&!trimmedMsgs.includes(m));
        if(carriers.length)trimmedMsgs=carriers.concat(trimmedMsgs);
      }
      if(currentMode==='translate'||currentMode==='transcribe')trimmedMsgs=trimmedMsgs.slice(-1);  // tâches one-shot : ne traduire/transcrire QUE le dernier message, jamais l'historique (sinon les prompts média/voix orphelins seraient traduits eux aussi)
      const cap=injCap(opts.model);  // budget d'injection généreux calé sur la fenêtre du modèle
      const needsVision=currentMode==='doc'&&trimmedMsgs.some(m=>(m.files||[]).some(f=>(f.isImg&&f.b64)||(f.ocrPages&&f.ocrPages.length)));
      const messages=[{role:'system',content:buildSystem(c)}].concat(
        trimmedMsgs.map(m=>{
          const imgs=(m.files||[]).filter(f=>f.isImg&&f.b64);
          const ocr=[].concat(...(m.files||[]).map(f=>f.ocrPages||[]));  // pages PDF rastérisées (scanné)
          const docs=(m.files||[]).filter(f=>!f.isImg&&f.textContent&&!(f.ocrPages&&f.ocrPages.length));
          let txt=m.text.length>4000?m.text.slice(0,4000)+'…[tronqué]':m.text;
          if(docs.length)txt+='\n\n'+docs.map(f=>{const cut=f.textContent.slice(0,cap).replace(/```/g,'`​`​`');injTotal+=f.textContent.length;injUsed+=cut.length;return '**Fichier : '+f.name+'**\n```\n'+cut+'\n```'}).join('\n\n');
          if(ocr.length)txt+='\n\n[Document scanné joint en images — lis-les directement pour répondre.]';
          const imgParts=[...imgs.map(f=>({type:'image_url',image_url:{url:f.b64}})),...ocr.map(u=>({type:'image_url',image_url:{url:u}}))];
          if(imgParts.length)return{role:m.role==='ai'?'assistant':'user',content:[{type:'text',text:txt},...imgParts]};
          return{role:m.role==='ai'?'assistant':'user',content:txt};
        })
      );
      const endpoint = isOR ? OR_HOST+"/api/v1/chat/completions" : SF_HOST+"/v1/chat/completions";
      const headers={'Authorization':'Bearer '+apiKey,'Content-Type':'application/json'};
      if(isOR){headers['HTTP-Referer']=location.origin||'https://mzai.app';headers['X-Title']='MAZ';}
      bubble.innerHTML=qcMode?'<div class="gen-loading"><div class="gl-ring"></div>Traduction + contrôle qualité…</div>':'<span class="caret"></span>';
      let modelId = mData.api||opts.model;
      if(opts.search && isOR) modelId += ':online';  // plugin web réel d'OpenRouter
      if(needsVision && isOR){ modelId = VISION_DOC; const _vm=MODELS.find(m=>m.api===VISION_DOC); resolvedModel=_vm?_vm.id:'Qwen3-VL'; }   // doc scanné / photo → modèle vision OCR : le badge reflète
      setGenHue(resolvedModel);   // l'arc de la pill prend la couleur du modèle routé le modèle réellement appelé
      const _ctx=(modelById(opts.model).ctx||'').toLowerCase();const maxTok=(/m|auto/.test(_ctx)||parseInt(_ctx)>=128)?8192:4096;   // moins de troncature pour les gros contextes
      const body = {model:modelId, messages, stream:SETTINGS.stream, max_tokens:maxTok};
      if(opts.reason && isOR) body.reasoning={enabled:true};  // chaîne de raisonnement réelle
      if(isOR) body.usage={include:true};                      // tokens + coût réels
      else if(SETTINGS.stream) body.stream_options={include_usage:true};
      ctrl=new AbortController();
      const arm=()=>{clearTimeout(idle);idle=setTimeout(()=>{timedOut=true;try{ctrl.abort()}catch(e){}},gotChunk?90000:180000);};  // 180s avant le 1er token (modèles à raisonnement lent), 90s entre tokens ensuite
      arm();
      const res = await fetch(endpoint, { method:'POST', headers, body: JSON.stringify(body), signal:ctrl.signal });

      if(!res.ok){
        const raw = await res.text(); let msg;
        if(VIA_PROXY){
          // mode hébergé : jamais de nom de fournisseur ni de « clé/Connexions API » (le collègue ne gère rien de tout ça)
          if(res.status===402) msg="⚠️ **Service momentanément indisponible.** Réessaie dans un moment.";
          else if(res.status===401||res.status===403) msg="🔒 **Ta session a expiré.** Reconnecte-toi pour continuer.";
          else if(res.status===429) msg="⏳ **Trop de requêtes.** Attends quelques secondes puis réessaie.";
          else msg="⚠️ **Le service a renvoyé une erreur ("+res.status+").** Réessaie dans un moment.";
        }else{
          if(res.status===402) msg="💳 **Crédits insuffisants** sur "+(isOR?'OpenRouter':'SiliconFlow')+". Recharge ton compte, ou choisis un modèle plus économique (ex. DeepSeek Flash).";
          else if(res.status===401) msg="🔑 **Clé API refusée.** Vérifie-la dans Paramètres › Connexions API.";
          else if(res.status===429) msg="⏳ **Trop de requêtes.** Attends quelques secondes puis réessaie.";
          else { let d=''; try{ d=((JSON.parse(raw).error)||{}).message||''; }catch(e){} msg="**Erreur API "+res.status+"** — "+(d||raw.slice(0,160)); }
        }
        bubble.classList.remove('md'); return finish(msg,{error:true});
      }
      
      const collectSources=(arr)=>(arr||[]).filter(a=>a&&a.url_citation).map(a=>({url:a.url_citation.url,title:a.url_citation.title}));

      if(!SETTINGS.stream) {
        const data = await res.json();
        if(!data || !data.choices || !data.choices.length || !data.choices[0].message){  // garde : réponse malformée
          bubble.classList.remove('md'); return finish('⚠️ Réponse vide ou malformée renvoyée par le modèle. Réessaie ou choisis un autre modèle.',{error:true});
        }
        const m0 = data.choices[0].message;
        if(m0.reasoning||m0.reasoning_content){reasonText=m0.reasoning||m0.reasoning_content;insertReason(col,opts.model,reasonText,false);}
        if(!(m0.content||'').trim()){  // garde : aucun texte
          bubble.classList.remove('md'); return finish('_Le modèle n\'a renvoyé aucun texte. Réessaie, ou choisis un autre modèle._',{ms:performance.now()-t0,usage:data.usage,error:true});
        }
        finishReason=data.choices[0].finish_reason||'';
        return finish(m0.content+truncNote(),{ms:performance.now()-t0,usage:data.usage,sources:collectSources(m0.annotations)});
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "", usage=null, sources=[], parseErrors=0, streamErr="";
      const processLine = (t)=>{
        if(!t.startsWith('data:') || /^data:\s*\[DONE\]\s*$/.test(t)) return;   // absorbe data:[DONE] avec ou sans espace
        try {
          const data = JSON.parse(t.slice(t.indexOf(':')+1).trim());
          if(data.error){ streamErr=(data.error&&(data.error.message||data.error.code))||'erreur renvoyée par le modèle en cours de génération'; return; }   // erreur émise au milieu du flux (429, modération…) → on la remonte
          if(data.usage) usage = data.usage;
          if(data.choices&&data.choices[0]&&data.choices[0].finish_reason)finishReason=data.choices[0].finish_reason;
          const d = data.choices?.[0]?.delta || {};
          const rd = d.reasoning ?? d.reasoning_content;
          if(rd){ gotChunk=true; reasonText += rd; if(!reasonBox)reasonBox=insertReason(col,opts.model,'',true); reasonBox.querySelector('.rc-in').appendChild(document.createTextNode(rd)); _scrollSoon(); }   // incrémental (plus de re-rendu O(n²))
          if(d.annotations) sources = sources.concat(collectSources(d.annotations));
          if(d.content) {
            fullText += d.content; gotChunk=true;
            if(!qcMode){ if(!streamEl){bubble.innerHTML='<span class="stxt"></span><span class="caret"></span>';streamEl=bubble.querySelector('.stxt');} streamEl.appendChild(document.createTextNode(d.content)); }  // incrémental : on n'ajoute que le delta (pas de re-rendu O(n²))
            _scrollSoon();
          }
        } catch(e) { parseErrors++; if(parseErrors<=3) console.warn('[MAZ SSE] fragment illisible :', e.message); }
      };
      while(!stopped) {
        const {done, value} = await reader.read();
        if(done) break;
        arm();  // chaque chunk reçu réarme le timer d'inactivité
        buffer += decoder.decode(value, {stream: true});
        const lines = buffer.split('\n');
        buffer = lines.pop();  // dernière ligne potentiellement incomplète → on la garde pour le prochain chunk
        for(const line of lines) processLine(line.trim());
      }
      if(buffer && buffer.trim()) processLine(buffer.trim());   // flush : dernier event reçu sans \n final (sinon tokens perdus)
      if(!stopped && !fullText.trim()){  // aucune réponse reçue (serveur muet, erreur mi-stream, tout filtré…)
        bubble.classList.remove('md'); return finish(streamErr?('⚠️ '+streamErr):'_Le modèle n\'a renvoyé aucun texte. Réessaie, ou choisis un autre modèle._',{ms:performance.now()-t0,usage,error:true});
      }
      const _tail = (streamErr ? '\n\n_⚠️ '+streamErr+'_' : '')+(parseErrors>0 ? '\n\n_⚠️ Réponse peut-être incomplète ('+parseErrors+' fragment(s) illisible(s) côté flux)._' : '')+truncNote();
      finish(fullText+_tail,{ms:performance.now()-t0,usage,sources});
    } catch(err) {
      if(timedOut) return finish((fullText||'')+(fullText?'\n\n':'')+'_⚠️ Réponse interrompue : le serveur n\'a plus rien envoyé (délai dépassé)._',{ms:performance.now()-t0});
      if(err.name==='AbortError') return finish(fullText||'_Génération arrêtée._',{ms:performance.now()-t0});
      finish((fullText?fullText+'\n\n':'')+'_⚠️ '+friendlyErr(err)+'_',{ms:performance.now()-t0,usage:null});
    }
  }
  /* Traduction — rendu côte-à-côte + contrôle qualité (parse défensif, repli markdown si JSON cassé) */
  function renderTransQC(bubble,text){
    let data=null;
    try{const m=text.match(/```json\s*([\s\S]*?)```/i);data=JSON.parse((m?m[1]:text).trim());}
    catch(e){try{data=JSON.parse(text.slice(text.indexOf('{'),text.lastIndexOf('}')+1));}catch(e2){}}
    if(!data||!Array.isArray(data.segments)||!data.segments.length)return null;  // repli : finish() rendra le markdown brut
    const rows=data.segments.map(s=>{const doubt=String(s.fidelity||'').toLowerCase().startsWith('dout');
      return '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:9px 0;border-top:1px solid var(--line)">'
        +'<div style="font-size:13px;color:var(--ink-soft);line-height:1.5">'+esc(s.src||'')+'</div>'
        +'<div style="font-size:13px;color:var(--ink);line-height:1.5'+(doubt?';border-left:2px solid var(--warning,#c2841a);padding-left:9px':'')+'">'+esc(s.tgt||'')+(doubt?' <span style="font-size:11px;color:var(--warning-strong,#7A560F);white-space:nowrap" data-tip="Fidélité à vérifier (rétro-traduction)">⚠ à vérifier</span>':'')+'</div></div>';
    }).join('');
    const flagged=data.segments.filter(s=>String(s.fidelity||'').toLowerCase().startsWith('dout')).length;
    bubble.classList.add('md');
    bubble.innerHTML='<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-soft)"><span>Source</span><span>Traduction</span></div>'
      +rows
      +'<div style="margin-top:10px;font-size:11.5px;color:var(--ink-soft);line-height:1.5">Contrôle qualité — '+(flagged?flagged+' segment'+(flagged>1?'s':'')+' marqué'+(flagged>1?'s':'')+' ⚠ à relire.':'aucun segment douteux détecté.')+'</div>';
    return data.segments.map(s=>s.tgt||'').join('\n');  // texte copiable = traduction complète
  }
  function renderAIStored(msg){
    const node=addAINode(msg.model),col=node.querySelector('.col'),bubble=node.querySelector('.bubble');
    if(msg.media){bubble.classList.add('media-b');bubble.innerHTML=mediaBubbleHTML(msg.media);wireMedia(bubble,msg.media,node);hydrateMedia(bubble);return}
    if(msg.reasonText)insertReason(col,msg.model,msg.reasonText,false);
    bubble.classList.add('md');bubble.innerHTML=renderMD(msg.text)+sourcesBlock(msg.model,msg.sources);wireBubble(bubble);addActions(col,msg.text,node);
    if(msg.usage||msg.ms){const s=statsEl((msg.auto?'MAZ Auto → ':'')+msg.model,msg.ms,msg.usage);if(s)col.appendChild(s);}
  }
