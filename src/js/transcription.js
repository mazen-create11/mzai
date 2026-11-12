  /* ===== Transcription live (Web Speech) — instance dédiée, indépendante de la dictée #dictateBtn ===== */
  let asrRec=null,asrOn=false,_asrStarting=false,_asrStop=false;
  function toggleLiveTranscribe(btn){
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR)return toast(IS_IOS?'Transcription live peu fiable sur iPhone — importe un audio (outil Voix) pour une transcription précise':'Reconnaissance vocale non supportée — utilise Chrome ou Edge');
    if(asrOn||_asrStarting){_asrStop=true;try{asrRec&&asrRec.stop()}catch(e){}return}   // 2e tap = arrêt (verrou synchrone)
    _asrStarting=true;_asrStop=false;
    btn&&btn.classList.add('arming');   // teinte danger DÈS le tap — la permission micro peut prendre >1s, le geste ne doit jamais être muet
    asrRec=new SR();asrRec.lang=toolCfg.asrLang||'fr-FR';asrRec.interimResults=true;asrRec.continuous=true;
    const base=prompt.value;let finalT='';
    asrRec.onstart=()=>{_asrStarting=false;asrOn=true;btn&&(btn.classList.remove('arming'),btn.classList.add('on'));toast('Transcription live — parle, retape pour arrêter')};
    asrRec.onresult=e=>{let interim='';for(let i=e.resultIndex;i<e.results.length;i++){const r=e.results[i];if(r.isFinal)finalT+=r[0].transcript;else interim+=r[0].transcript}prompt.value=(base?base.trim()+' ':'')+finalT+interim;autoGrow();updateCount()};
    asrRec.onerror=ev=>{_asrStarting=false;btn&&btn.classList.remove('arming');if(ev&&ev.error==='not-allowed'){_asrStop=true;toast('Micro refusé — autorise l\'accès au micro dans les réglages')}else if(ev&&ev.error!=='no-speech')toast('Micro indisponible — réessaie')};
    asrRec.onend=()=>{_asrStarting=false;
      // sur iOS/Safari, continuous=true se coupe à chaque pause → on relance tant que l'utilisateur n'a pas arrêté
      if(asrOn&&!_asrStop){try{asrRec.start();return}catch(e){}}
      asrOn=false;btn&&btn.classList.remove('on','arming')};
    try{asrRec.start()}catch(e){_asrStarting=false;btn&&btn.classList.remove('arming');toast('Micro déjà actif — réessaie')}
  }
  /* ===== Transcription fichier audio → SiliconFlow ===== */
  /* Dispatcher : Qwen3-Omni (FR + multilingue, défaut) ou SenseVoice (zh/en, rapide). */
  function genTranscribe(c,file){return (toolCfg.asrEngine==='sense')?genTranscribeSense(c,file):genTranscribeOmni(c,file);}
  function fileToDataURL(file){return new Promise((res,rej)=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.onerror=()=>rej(new Error('Lecture du fichier échouée'));fr.readAsDataURL(file)})}
  function downloadText(name,txt,mime){const b=new Blob([txt],{type:mime||'text/plain'}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=name;a.click();URL.revokeObjectURL(u)}
  /* wrapper OpenRouter réutilisable (post-traitement, etc.) */
  async function chatOR(messages,model,opt){
    if(!KEYS.openrouter)throw new Error('Clé OpenRouter manquante — ajoute-la dans Réglages › Clés API');
    const res=await fetch(OR_HOST+'/api/v1/chat/completions',{method:'POST',
      headers:{'Authorization':'Bearer '+KEYS.openrouter,'Content-Type':'application/json','HTTP-Referer':location.origin||'https://mzai.app','X-Title':'MAZ'},
      body:JSON.stringify(Object.assign({model:model||'deepseek/deepseek-v4-flash',messages},opt||{}))});
    if(!res.ok)throw new Error('HTTP '+res.status+' · '+(await res.text().catch(()=>'')).slice(0,160));
    const d=await res.json();return (d.choices?.[0]?.message?.content||'').trim();
  }
  /* SenseVoice — endpoint dédié, zh/en rapide (le FR n'est PAS fiable ici → réservé zh/en) */
  async function genTranscribeSense(c,file){
    setGenerating(true);showView('chat');
    const node=addAINode('Transcription'),bubble=node.querySelector('.bubble');
    bubble.innerHTML='<div class="gen-loading"><div class="gl-ring"></div>Transcription (SenseVoice)…</div>';
    let done=false;curStop=()=>{done=true;node.remove();setGenerating(false);curStop=null};
    try{
      if(!hasKey('siliconflow'))throw new Error('Clé SiliconFlow manquante — ajoute-la dans Réglages › Clés API');
      if(file.size>30*1024*1024)throw new Error('Fichier trop lourd ('+(file.size/1048576).toFixed(1)+' Mo). Limite ≈ 30 Mo.');
      const fd=new FormData();fd.append('model','FunAudioLLM/SenseVoiceSmall');fd.append('file',file);
      const res=await fetch(SF_HOST+'/v1/audio/transcriptions',{method:'POST',headers:{'Authorization':'Bearer '+KEYS.siliconflow},body:fd});
      if(!res.ok)throw new Error('HTTP '+res.status+' · '+(await res.text().catch(()=>'')).slice(0,200));
      const data=await res.json();const text=((data.text||'')+'').trim()||'(aucune parole détectée dans l\'audio)';
      if(done)return;
      finishTranscript(c,node,bubble,file,text,'SenseVoice (zh/en)');
    }catch(e){if(!done){bubble.classList.remove('md');bubble.innerHTML="<div class='api-err'><b>Erreur transcription</b><br>"+esc(friendlyErr(e))+"</div>";setGenerating(false);curStop=null;scrollDown();}}
  }
  /* Qwen3-Omni — chat/completions multimodal (débloque le FR + 18 langues), streaming, 2 formes d'audio testées en repli */
  async function genTranscribeOmni(c,file){
    setGenerating(true);showView('chat');
    const node=addAINode('Transcription'),bubble=node.querySelector('.bubble');
    bubble.innerHTML='<div class="gen-loading"><div class="gl-ring"></div>Transcription (Qwen3-Omni)…</div>';
    let stopped=false,ctrl=new AbortController();
    curStop=()=>{stopped=true;try{ctrl.abort()}catch(e){}node.remove();setGenerating(false);curStop=null};
    try{
      if(!hasKey('siliconflow'))throw new Error('Clé SiliconFlow manquante — ajoute-la dans Réglages › Clés API');
      if(file.size>10*1024*1024)throw new Error('Fichier trop lourd ('+(file.size/1048576).toFixed(1)+' Mo). Limite ≈ 10 Mo (~10 min) pour l\'envoi en ligne. Découpe l\'audio en segments plus courts et réessaie.');
      const dataUrl=await fileToDataURL(file);
      const b64=dataUrl.slice(dataUrl.indexOf(',')+1);
      const fmt=((file.name.split('.').pop()||'mp3').toLowerCase()).replace('mpeg','mp3').replace('m4a','mp3').replace('oga','ogg');
      const sys='Transcris fidèlement et mot à mot le contenu parlé de cet audio, dans sa langue d\'origine. Restitue UNIQUEMENT le texte transcrit, avec une ponctuation naturelle, sans commentaire ni horodatage.';
      const tries=[{type:'input_audio',input_audio:{data:b64,format:fmt}},{type:'audio_url',audio_url:{url:dataUrl}}];
      let text='',ok=false,lastErr='';
      for(const part of tries){
        try{
          const body={model:'Qwen/Qwen3-Omni-30B-A3B-Instruct',stream:true,max_tokens:4096,
            messages:[{role:'user',content:[{type:'text',text:sys},part]}]};
          const res=await fetch(SF_HOST+'/v1/chat/completions',{method:'POST',headers:{'Authorization':'Bearer '+KEYS.siliconflow,'Content-Type':'application/json'},body:JSON.stringify(body),signal:ctrl.signal});
          if(!res.ok){lastErr='HTTP '+res.status+' · '+(await res.text().catch(()=>'')).slice(0,180);continue;}
          text='';const reader=res.body.getReader(),dec=new TextDecoder();let buf='';
          while(!stopped){const{done,value}=await reader.read();if(done)break;buf+=dec.decode(value,{stream:true});const lines=buf.split('\n');buf=lines.pop();
            for(const ln of lines){const tl=ln.trim();if(!tl.startsWith('data:')||/^data:\s*\[DONE\]\s*$/.test(tl))continue;try{const j=JSON.parse(tl.slice(tl.indexOf(':')+1).trim());const dc=j.choices?.[0]?.delta?.content;if(dc){text+=dc;bubble.innerHTML=esc(text)+'<span class="caret"></span>';scrollDown();}}catch(e){}}}
          ok=true;break;
        }catch(e){if(e.name==='AbortError')throw e;lastErr=e.message;}
      }
      if(stopped)return;
      if(!ok)throw new Error('Transcription refusée par l\'API. '+lastErr);
      text=(text||'').trim()||'(aucune parole détectée dans l\'audio)';
      finishTranscript(c,node,bubble,file,text,'Qwen3-Omni');
    }catch(e){if(stopped)return;if(e.name==='AbortError')return;bubble.classList.remove('md');bubble.innerHTML="<div class='api-err'><b>Erreur transcription</b><br>"+esc(friendlyErr(e))+"</div>";setGenerating(false);curStop=null;scrollDown();}
  }
  /* rendu commun : transcript + post-traitement (Ponctuer/Résumer/Notes/Chapitres) + téléchargements (.txt / .srt estimé) */
  function finishTranscript(c,node,bubble,file,text,engine){
    const col=col0(node);
    bubble.classList.add('md');bubble.innerHTML=renderMD(text);wireBubble(bubble);addActions(col,text,node);
    const note=document.createElement('div');note.style.cssText='margin-top:9px;font-size:11.5px;color:var(--ink-soft);line-height:1.5';
    note.textContent='Transcrit avec '+engine+'. L\'API ne renvoie pas d\'horodatage exact : le .srt utilise un découpage estimé. La piste son d\'une vidéo doit être fournie comme fichier audio.';
    col.appendChild(note);
    const pp=document.createElement('div');pp.style.cssText='display:flex;flex-wrap:wrap;gap:6px;margin-top:9px';
    [['Ponctuer','punct'],['Résumer','sum'],['Notes structurées','notes'],['Chapitres','chap']].forEach(([lbl,act])=>{const b=document.createElement('button');b.className='sug-chip';b.textContent=lbl;b.onclick=()=>postProcessTranscript(c,text,act,lbl);pp.appendChild(b)});
    col.appendChild(pp);
    const dls=document.createElement('div');dls.style.cssText='display:flex;flex-wrap:wrap;gap:6px;margin-top:6px';
    const mk=(lbl,fn)=>{const b=document.createElement('button');b.className='sug-chip';b.textContent=lbl;b.onclick=fn;dls.appendChild(b)};
    mk('Télécharger .txt',()=>downloadText('transcription.txt',text,'text/plain'));
    mk('.srt estimé',()=>estimateSRT(file,text).then(srt=>srt?downloadText('transcription.srt',srt,'text/plain'):toast('Aucun segment à exporter')).catch(()=>toast('Export SRT impossible')));
    col.appendChild(dls);
    c.msgs.push({role:'ai',text,model:'Transcription'});c.ts=now();saveConvos();renderRecents();setGenerating(false);curStop=null;scrollDown();
  }
  async function postProcessTranscript(c,text,act,lbl){
    if(generating)return toast('Attends la fin de la génération en cours');   // pas deux générations concurrentes (double-clic sur une chip)
    const prompts={punct:'Reformate ce texte transcrit : ajoute la ponctuation, les majuscules et des paragraphes, SANS changer les mots ni leur ordre. Rends uniquement le texte corrigé.',
      sum:'Résume ce transcript en points clés clairs et hiérarchisés (markdown).',
      notes:'Transforme ce transcript en notes structurées : titres, sous-points, décisions et actions à retenir (markdown).',
      chap:'Découpe ce transcript en chapitres thématiques. Pour chaque chapitre : un titre court puis 1-2 phrases de résumé (markdown).'};
    if(!activeId)createConvo();const cc=convoById(activeId)||c;showView('chat');
    setGenerating(true);const node=addAINode('Transcription · '+lbl),bubble=node.querySelector('.bubble');
    bubble.innerHTML='<div class="gen-loading"><div class="gl-ring"></div>'+esc(lbl)+'…</div>';
    let stop=false;curStop=()=>{stop=true;node.remove();setGenerating(false);curStop=null};
    try{
      const out=await chatOR([{role:'system',content:prompts[act]},{role:'user',content:text.slice(0,24000)}],'deepseek/deepseek-v4-flash',{max_tokens:2048,temperature:0.3});
      if(stop)return;
      bubble.classList.add('md');bubble.innerHTML=renderMD(out||'(vide)');wireBubble(bubble);addActions(col0(node),out,node);
      cc.msgs.push({role:'ai',text:out,model:'Transcription · '+lbl});cc.ts=now();saveConvos();renderRecents();setGenerating(false);curStop=null;scrollDown();
    }catch(e){if(!stop){bubble.classList.remove('md');bubble.innerHTML="<div class='api-err'><b>Erreur</b><br>"+esc(friendlyErr(e))+"</div>";setGenerating(false);curStop=null;scrollDown();}}
  }
  /* SRT à horodatage ESTIMÉ : segments répartis proportionnellement à la durée réelle de l'audio */
  function srtTime(sec){sec=Math.max(0,sec);const h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=Math.floor(sec%60),ms=Math.round((sec-Math.floor(sec))*1000);const p=(n,l)=>String(n).padStart(l,'0');return p(h,2)+':'+p(m,2)+':'+p(s,2)+','+p(ms,3);}
  function estimateSRT(file,text){
    return new Promise(resolve=>{
      // découpe phrase par phrase SANS lookbehind (le lookbehind fait planter tout le script sur iOS < 16.4)
      const segs=(text.replace(/\s+/g,' ').trim().match(/[^.!?…]+[.!?…]*/g)||[]).map(s=>s.trim()).filter(Boolean);
      if(!segs.length){resolve('');return;}
      const build=dur=>{
        const total=(dur&&isFinite(dur)&&dur>0)?dur:segs.length*3.5;
        const totChars=segs.reduce((a,x)=>a+x.length,0)||1;let t=0;const out=[];
        segs.forEach((s,i)=>{const d=Math.max(1.2,total*(s.length/totChars)),st=t,en=t+d;t=en;out.push((i+1)+'\n'+srtTime(st)+' --> '+srtTime(en)+'\n'+s+'\n');});
        resolve(out.join('\n'));
      };
      try{const url=URL.createObjectURL(file),a=new Audio();a.onloadedmetadata=()=>{const d=a.duration;URL.revokeObjectURL(url);build(d)};a.onerror=()=>{URL.revokeObjectURL(url);build(0)};a.src=url;}
      catch(e){build(0)}
    });
  }
  const col0=n=>n.querySelector('.col');
  /* init visuel du sélecteur */
  renderModeChip();renderToolOpts();syncToolUI();

