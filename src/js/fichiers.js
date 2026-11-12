  /* ===== Extraction de texte côté client : TXT/CSV/code (natif), DOCX/XLSX (DecompressionStream), PDF (pdf.js lazy CDN) ===== */
  const XENT={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
  const decX=s=>(s||'').replace(/&(amp|lt|gt|quot|apos);/g,(_,n)=>XENT[n]).replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCharCode(parseInt(n,16)));
  function zipEntries(buf){
    const dv=new DataView(buf),u8=new Uint8Array(buf);let eocd=-1;
    for(let i=u8.length-22;i>=0;i--){if(dv.getUint32(i,true)===0x06054b50){eocd=i;break}}
    if(eocd<0)throw new Error('archive illisible');
    const n=dv.getUint16(eocd+10,true);let p=dv.getUint32(eocd+16,true);const out={};
    for(let i=0;i<n&&p+46<=u8.length;i++){
      if(dv.getUint32(p,true)!==0x02014b50)break;
      const method=dv.getUint16(p+10,true),csize=dv.getUint32(p+20,true),nl=dv.getUint16(p+28,true),el=dv.getUint16(p+30,true),cl=dv.getUint16(p+32,true),lho=dv.getUint32(p+42,true);
      const name=new TextDecoder().decode(u8.subarray(p+46,p+46+nl));
      const lnl=dv.getUint16(lho+26,true),lel=dv.getUint16(lho+28,true),ds=lho+30+lnl+lel;
      out[name]={method,comp:u8.subarray(ds,ds+csize)};
      p+=46+nl+el+cl;
    }
    return out;
  }
  async function zipText(e){
    if(!e)return'';
    if(e.method===0)return new TextDecoder().decode(e.comp);
    const stream=new Response(e.comp).body.pipeThrough(new DecompressionStream('deflate-raw'));
    return new TextDecoder().decode(await new Response(stream).arrayBuffer());
  }
  async function docxText(buf){
    const z=zipEntries(buf),xml=await zipText(z['word/document.xml']);if(!xml)return'';
    return xml.split(/<\/w:p>/).map(seg=>[...seg.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map(m=>decX(m[1])).join('')).join('\n').replace(/\n{3,}/g,'\n\n').trim();
  }
  async function xlsxText(buf){
    const z=zipEntries(buf);let shared=[];
    const ss=await zipText(z['xl/sharedStrings.xml']);
    if(ss)shared=[...ss.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m=>[...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t=>decX(t[1])).join(''));
    const sheets=Object.keys(z).filter(k=>/^xl\/worksheets\/sheet\d+\.xml$/i.test(k)).sort();const out=[];
    for(const sk of sheets){const xml=await zipText(z[sk]);if(!xml)continue;
      [...xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].forEach(r=>{
        const line=[...r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)].map(c=>{const attrs=c[1]||'',inner=c[2]||'',t=(/t="([^"]+)"/.exec(attrs)||[])[1],v=(/<v>([\s\S]*?)<\/v>/.exec(inner)||[])[1],is=(/<t[^>]*>([\s\S]*?)<\/t>/.exec(inner)||[])[1];if(t==='s'&&v!=null)return shared[+v]||'';if(is!=null)return decX(is);return v!=null?decX(v):''}).join('\t');
        if(line.trim())out.push(line);
      });
      out.push('');
    }
    return out.join('\n').trim();
  }
  let _pdfjs=null;
  async function loadPdfjs(){
    if(_pdfjs)return _pdfjs;
    await new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';s.integrity='sha512-q+4liFwdPC/bNdhUpZx6aXDx/h77yEQtn4I1slHydcbZK34nLaR3cAeYSJshoxIOq3mjEf7xJE8YWIUHMn+oCQ==';s.crossOrigin='anonymous';s.onload=res;s.onerror=()=>rej(new Error('CDN pdf.js injoignable ou intégrité invalide'));document.head.appendChild(s)});
    if(!window.pdfjsLib)throw new Error('pdf.js indisponible');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    return (_pdfjs=window.pdfjsLib);
  }
  async function pdfText(buf){
    const lib=await loadPdfjs(),pdf=await lib.getDocument({data:buf}).promise;let txt='';
    const pages=Math.min(pdf.numPages,40);
    for(let i=1;i<=pages;i++){const pg=await pdf.getPage(i),tc=await pg.getTextContent();txt+=tc.items.map(it=>it.str).join(' ')+'\n'}
    return txt.trim();
  }
  async function pdfToImages(buf,maxPages){  // PDF scanné → pages JPEG (pour le modèle vision OCR) ; limité pour le coût
    const lib=await loadPdfjs(),pdf=await lib.getDocument({data:buf}).promise,n=Math.min(pdf.numPages,maxPages||8),out=[];
    for(let i=1;i<=n;i++){const pg=await pdf.getPage(i),vp=pg.getViewport({scale:2}),cv=document.createElement('canvas');
      cv.width=vp.width;cv.height=vp.height;await pg.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise;
      out.push(cv.toDataURL('image/jpeg',0.82));}
    return out;
  }
  const TEXT_EXT=/\.(txt|md|js|ts|jsx|tsx|css|html|json|py|sql|yaml|yml|sh|xml|csv|env|toml|rs|go|java|c|cpp|php|rb|kt|swift|log|ini)$/i;
  async function extractFileText(file){
    const name=(file.name||'').toLowerCase(),CAP=500*1024;  // 500 Ko de texte injecté max
    try{
      if(TEXT_EXT.test(name)){if(file.size>CAP)return'[« '+file.name+' » dépasse 500 Ko — colle uniquement la partie pertinente.]';return (await file.text()).slice(0,CAP)}
      if(/\.docx$/.test(name)){if(file.size>5*1024*1024)return'[« '+file.name+' » trop lourd pour l\'extraction navigateur — colle le texte.]';const t=await docxText(await file.arrayBuffer());return t?t.slice(0,CAP):'[DOCX « '+file.name+' » : aucun texte extrait — colle le contenu.]'}
      if(/\.xlsx$/.test(name)){if(file.size>5*1024*1024)return'[« '+file.name+' » trop lourd — colle le tableau.]';const t=await xlsxText(await file.arrayBuffer());return t?t.slice(0,CAP):'[XLSX « '+file.name+' » : aucune donnée extraite — colle le tableau.]'}
      if(/\.pdf$/.test(name)){const t=await pdfText(await file.arrayBuffer());return t?t.slice(0,CAP):'[PDF « '+file.name+' » : aucun texte sélectionnable — probablement un PDF scanné (image). L\'extraction sans OCR est impossible côté navigateur. Fournis un PDF texte ou colle le contenu.]'}
    }catch(e){return'[Impossible de lire « '+file.name+' » côté navigateur ('+(e.message||'erreur')+'). Colle le texte directement.]'}
    return null;  // format binaire non géré → seul le nom est transmis (honnête)
  }
  /* init visuel du sélecteur */
  renderModeChip();renderToolOpts();syncToolUI();

