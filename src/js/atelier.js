  /* ═══════════════════════════════════════════════════════════════════════
     L'ATELIER — postes, passages, contrôle
     ───────────────────────────────────────────────────────────────────────
     Le chat reste l'Établi : on y met une consigne au point. Quand elle
     marche, on l'accroche à un poste, et le poste tourne sans onglet ouvert.
     Tout l'état vit côté serveur : ici, on affiche et on signe.
     ═══════════════════════════════════════════════════════════════════════ */
  const AT=(function(){
    const base=()=>_PB;                       // même Worker que la synchro
    let etat={postes:[],journee:[],controles:[],mois_cents:0,seq:0};
    let ouvriers=[],chantiers=[],charge=false,perime=false,sansAcces=false,posteOuvert=null;

    /* Le code d'accès n'est injecté par l'intercepteur que si VIA_PROXY ;
       l'atelier parle au Worker dans tous les cas, il pose donc son en-tête. */
    async function api(chemin,opt){
      opt=opt||{};const h=new Headers(opt.headers||{});
      const c=_acode();if(c)h.set('X-Maz-Code',c);
      if(opt.body&&!h.has('Content-Type'))h.set('Content-Type','application/json');
      const r=await fetch(base()+chemin,Object.assign({},opt,{headers:h}));
      const t=await r.text();let d=null;try{d=JSON.parse(t)}catch(e){}
      if(!r.ok)throw Object.assign(new Error((d&&(d.message||d.error))||('erreur '+r.status)),{statut:r.status,corps:d});
      return d;
    }
    /* La lumière se resserre le temps d'un passage. Compté, pas booléen : deux
       opérations lancées coup sur coup ne doivent pas s'éteindre l'une l'autre. */
    let enCours=0;
    function travail(on){
      enCours=Math.max(0,enCours+(on?1:-1));
      const a=document.getElementById('app');if(!a)return;
      if(enCours)a.dataset.travail='1';else delete a.dataset.travail;
    }
    const eur=c=>(c/100).toFixed(c<10?3:2).replace('.',',')+' €';
    const hhmm=ms=>new Date(ms).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
    const esc2=s=>esc(String(s==null?'':s));

    /* ── Le khatam-jauge : les 8 branches sont les 8 derniers passages.
          Un seul élément graphique dans tout l'atelier, et il porte la donnée. ── */
    /* Géométrie réelle du khatam : deux carrés entrelacés, donc huit pointes
       extérieures à R et huit sommets intérieurs à R·cos45/cos22,5 ≈ 0,765·R.
       Chaque branche est le triangle (intérieur k−1, pointe k, intérieur k) —
       une branche par passage, la plus récente en haut, dans le sens horaire.
       Ce n'est pas un scintillement décoratif : la forme est le logo, et elle
       porte la donnée. */
    const ETATS={O:'var(--accent)','?':'var(--ink-faint)',X:'var(--danger)','.':'var(--line-strong)'};
    function jauge(sante,taille){
      const n=taille||30,c=n/2,R=n*.47,r=R*0.7654,S=(sante||'').padStart(8,'.').slice(-8);
      const pt=(ang,ray)=>[c+Math.cos((ang-90)*Math.PI/180)*ray,c+Math.sin((ang-90)*Math.PI/180)*ray];
      let p='';
      for(let i=0;i<8;i++){
        const [ax,ay]=pt(i*45-22.5,r),[bx,by]=pt(i*45,R),[dx,dy]=pt(i*45+22.5,r);
        const e=S[i]||'.',col=ETATS[e]||ETATS['.'];
        const d=`M${ax.toFixed(2)} ${ay.toFixed(2)}L${bx.toFixed(2)} ${by.toFixed(2)}L${dx.toFixed(2)} ${dy.toFixed(2)}`;
        p+= e==='O' ? `<path d="${d}Z" fill="${col}"/>`
          : e==='?' ? `<path d="${d}Z" fill="${col}" fill-opacity=".38"/>`
          : `<path d="${d}" fill="none" stroke="${col}" stroke-width="${e==='X'?1.5:1}" stroke-linejoin="round"/>`;
      }
      // le cabochon central : la couleur du dernier passage, comme la gemme du logo
      return `<svg class="at-gauge" viewBox="0 0 ${n} ${n}" width="${n}" height="${n}" aria-hidden="true">`
        + p + `<circle cx="${c}" cy="${c}" r="${(n*.115).toFixed(2)}" fill="${ETATS[S[7]]||ETATS['.']}"/></svg>`;
    }

    /* ── Le récit du haut : ce qui s'est passé, en français, pas en compteurs ── */
    function recit(){
      const j=etat.journee,finis=j.filter(p=>p.statut==='fini').length,
            ko=j.filter(p=>p.statut==='echec'||p.statut==='coupe').length,
            att=etat.controles.length,
            jour=new Date().toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'});
      if(!etat.postes.length)return `<p class="at-narr">${esc2(jour[0].toUpperCase()+jour.slice(1))}. <span class="at-mute">Aucun agent pour l'instant — décris en une phrase un travail qui revient, et il le fera sans toi.</span></p>`;
      const bouts=[];
      if(finis)bouts.push(`<span class="at-em">${finis} tâche${finis>1?'s':''}</span> ${finis>1?'ont réussi':'a réussi'}`);
      if(ko)bouts.push(`${ko} ${ko>1?'ont cassé':'a cassé'}`);
      if(att)bouts.push(`<span class="at-em">${att}</span> ${att>1?'attendent':'attend'} ton accord`);
      const corps=bouts.length?bouts.join(', ')+'.':'Rien n\'a encore tourné aujourd\'hui.';
      return `<p class="at-narr">${esc2(jour[0].toUpperCase()+jour.slice(1))}. ${corps}
        <span class="at-mute">Ce mois : <span class="at-num">${eur(etat.mois_cents)}</span>.</span></p>`;
    }

    /* ── 24 heures sur un trait. Chaque point est un passage, cliquable. ── */
    function ligneJour(){
      const d=new Date(),d0=new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime();
      const pc=ms=>Math.max(0,Math.min(100,((ms-d0)/86400000)*100));
      // Les repères extrêmes se recadrent : centré, « 00 » et « 24 » sortiraient du tracé.
      let g='';for(let h=0;h<=24;h+=4){const x=(h/24*100).toFixed(2);
        const tr=h===0?'translateX(0)':h===24?'translateX(-100%)':'translateX(-50%)';
        g+=`<span class="at-tick" style="left:${x}%"></span><span class="at-th" style="left:${x}%;transform:${tr}">${String(h).padStart(2,'0')}</span>`}
      const pts=etat.journee.filter(p=>p.debut_at>=d0).map(p=>{
        const k=p.statut==='fini'?'ok':(p.statut==='attente'?'att':(p.statut==='encours'?'run':'ko'));
        const t=`${hhmm(p.debut_at)} · ${p.statut}${p.cout_cents?' · '+eur(p.cout_cents):''}`;
        return `<span class="at-ev ${k}" style="left:${pc(p.debut_at).toFixed(2)}%" title="${esc2(t)}" data-passage="${esc2(p.id)}"></span>`;
      }).join('');
      return `<div class="at-day"><span class="at-lbl">La journée</span>
        <div class="at-daybar">${g}<span class="at-now" style="left:${pc(Date.now()).toFixed(2)}%"></span>${pts}</div></div>`;
    }

    /* « il y a 12 min », « demain 08:03 » — un horaire brut oblige à faire le
       calcul de tête à chaque coup d'œil, et cet écran se lit d'un coup d'œil. */
    function depuis(ms){
      const d=Math.round((Date.now()-ms)/60000);
      if(d<1)return 'à l\'instant';
      if(d<60)return 'il y a '+d+' min';
      if(d<1440)return 'il y a '+Math.round(d/60)+' h';
      return 'il y a '+Math.round(d/1440)+' j';
    }
    function bientot(ms){
      const d=new Date(ms),now=new Date();
      const j=Math.round((new Date(d.getFullYear(),d.getMonth(),d.getDate())-new Date(now.getFullYear(),now.getMonth(),now.getDate()))/86400000);
      const h=hhmm(ms);
      return j<=0?h:j===1?'demain '+h:d.toLocaleDateString('fr-FR',{weekday:'short'})+' '+h;
    }

    /* « 0 8 * * 1 » n'est pas une cadence, c'est une expression cron. Ce qui se
       lit, c'est « chaque lundi à 8h ». Les cinq formes que la fiche propose
       sont traduites en toutes lettres ; toute autre expression est rendue
       telle quelle plutôt que devinée de travers. */
    const JOURS=['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
    function cronFr(c){
      const p=String(c||'').trim().split(/\s+/);
      if(p.length!==5)return 'planifié';
      const[mi,h,jm,mo,js]=p;
      const heure=n=>Number(n)+'h'+(mi==='0'?'':String(mi).padStart(2,'0'));
      if(/^\*\/(\d+)$/.test(mi)&&h==='*')return 'toutes les '+mi.slice(2)+' min';
      if(mi==='0'&&h==='*')return 'toutes les heures';
      if(jm==='*'&&mo==='*'&&js==='*'&&/^\d+$/.test(h))return 'chaque jour à '+heure(h);
      if(js==='1-5'&&/^\d+$/.test(h))return 'du lundi au vendredi à '+heure(h);
      if(/^\d$/.test(js)&&/^\d+$/.test(h))return 'chaque '+JOURS[+js]+' à '+heure(h);
      if(/^\d+$/.test(jm)&&/^\d+$/.test(h))return 'le '+(jm==='1'?'1er':jm)+' du mois à '+heure(h);
      return c;
    }

    /* Les états en français courant. « disjoncté » et « sommeil » disaient la
       mécanique interne, pas ce que la personne doit comprendre. */
    const ETIQ_ETAT={actif:'en marche',pause:'en pause',disjoncte:'budget atteint',sommeil:'en veille',brouillon:'brouillon'};
    /* Le poinçon d'état : un cercle plus ou moins rempli. L'état est TOUJOURS
       écrit en toutes lettres à côté — jamais porté par la seule couleur. */
    const POINCON={
      actif:'<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.25"/><circle cx="8" cy="8" r="2.2" fill="currentColor"/>',
      pause:'<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.25"/><path d="M6.4 5.6v4.8M9.6 5.6v4.8" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>',
      disjoncte:'<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.25"/><path d="M8.6 4.6 6.4 8.3h3.2L7.4 11.4" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>',
      sommeil:'<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.25" stroke-dasharray="2 2.4"/>',
      brouillon:'<rect x="2.6" y="2.6" width="10.8" height="10.8" rx="1" fill="none" stroke="currentColor" stroke-width="1.1" stroke-dasharray="2 2"/>',
    };
    /* Le khatam en petit : il ne compte plus les passages, il scelle une
       signature en attente. C'est son sens d'origine. */
    const SCEAU='<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><rect x="3.4" y="3.4" width="9.2" height="9.2" fill="none" stroke="currentColor" stroke-width="1"/><rect x="3.4" y="3.4" width="9.2" height="9.2" fill="none" stroke="currentColor" stroke-width="1" transform="rotate(45 8 8)"/><circle cx="8" cy="8" r="1.4" fill="currentColor"/></svg>';
    const FLECHE='<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" aria-hidden="true"><path d="M8 5.5 18 12 8 18.5z"/></svg>';

    function peigne(sante){
      const S=(sante||'').padStart(8,'.').slice(-8);
      const cl={O:'o',X:'x','?':'q','.':'v'};
      const n={O:0,X:0,'?':0};for(const c of S)if(n[c]!==undefined)n[c]++;
      const dit=`Huit dernières tâches : ${n.O} réussie${n.O>1?'s':''}, ${n.X} en échec, ${n['?']} en attente de ton accord.`;
      return `<span class="at-sr">${dit}</span><span class="at-peigne" aria-hidden="true">`
        + [...S].map((c,i)=>`<i class="at-pas ${cl[c]||'v'}${i===7?' der':''}"></i>`).join('')+'</span>';
    }

    const PLUS='<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>';
    function lignePoste(p){
      const att=etat.controles.filter(c=>c.poste_id===p.id).length;
      const der=etat.journee.filter(x=>x.poste_id===p.id)[0];
      const et=p.etat||'brouillon';
      const cad=p.cadence==='cron'?cronFr(p.cron):'quand tu appuies';
      const ETATS=ETIQ_ETAT;
      const proch=et==='disjoncte'?'budget du mois atteint'
        :(der&&(der.statut==='echec'||der.statut==='coupe'))?'échec '+depuis(der.debut_at)
        :(et==='actif'&&p.prochain_at)?bientot(p.prochain_at)
        :der?depuis(der.debut_at):'jamais lancé';
      const part=p.budget_cents?Math.min(100,(p.depense_cents/p.budget_cents)*100):0;
      const seuil=part>=100?'depasse':part>=70?'proche':'';
      return `<li class="at-ligne" data-etat="${esc2(et)}"${att?' data-signature="1"':''}>
        <a class="at-lien" href="#" data-poste="${esc2(p.id)}" aria-label="Ouvrir l'agent ${esc2(p.nom)}"></a>
        <span class="at-c at-poincon"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">${POINCON[et]||POINCON.brouillon}</svg></span>
        <div class="at-c at-ident">
          <h3 class="at-nm"><span>${esc2(p.nom)}</span>${att?`<span class="at-sceau">${SCEAU}${att} à valider</span>`:''}</h3>
          <p class="at-obj">${esc2(p.objectif||'—')}</p>
        </div>
        <div class="at-attrib">
          <div class="at-c at-c-ouv"><span class="at-ouv">${esc2(p.ouvrier_nom||'—')}</span><span class="at-mod">${esc2((p.modele||'').replace('-latest',''))}</span></div>
          <div class="at-c"><span class="at-chant">${p.chantier_nom?esc2(p.chantier_nom):''}</span></div>
        </div>
        <div class="at-c at-c-cad"><span class="at-proch">${esc2(proch)}</span><span class="at-cad">${ETATS[et]||et} · ${cad}</span></div>
        <div class="at-c at-c-sante">${peigne(p.sante)}</div>
        <div class="at-c at-c-env"${seuil?` data-seuil="${seuil}"`:''}>
          <span class="at-mnt">${((p.depense_cents||0)/100).toFixed(2).replace('.',',')}<em> / ${((p.budget_cents||0)/100).toFixed(2).replace('.',',')} €</em></span>
          <span class="at-env" style="--at-part:${part.toFixed(1)}%"></span>
        </div>
        <div class="at-c at-c-act"><button class="at-go" data-lancer="${esc2(p.id)}" aria-label="Lancer ${esc2(p.nom)} maintenant" title="Lancer maintenant">${FLECHE}</button>
          <button class="at-go at-plus" data-menu="${esc2(p.id)}" aria-label="Actions sur ${esc2(p.nom)}" aria-haspopup="menu" title="Actions">${PLUS}</button></div>
      </li>`;
    }

    /* ═══ Le menu de ligne ══════════════════════════════════════════════════
       Le registre n'avait qu'un geste : lancer. Renommer, dupliquer, mettre en
       service, supprimer existaient côté serveur sans jamais atteindre l'écran —
       il fallait ouvrir la fiche, ou rien du tout pour la suppression. */
    let menuOuvert=null;
    function fermerMenu(){if(menuOuvert){menuOuvert.remove();menuOuvert=null;
      document.removeEventListener('pointerdown',horsMenu,true);document.removeEventListener('keydown',clavMenu,true)}}
    const horsMenu=e=>{if(menuOuvert&&!menuOuvert.contains(e.target))fermerMenu()};
    const clavMenu=e=>{if(e.key==='Escape'){e.preventDefault();fermerMenu()}};
    const IC_M={
      ouvrir:'<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M10 14 21 3M18 13v7H4V6h7"/></svg>',
      blanc:'<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 5.5 18 12 8 18.5z"/></svg>',
      nom:'<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
      copie:'<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></svg>',
      service:'<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 2"/></svg>',
      pause:'<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M9 5v14M15 5v14"/></svg>',
      sup:'<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14"/></svg>',
    };
    function ouvrirMenu(p,ancre){
      fermerMenu();
      const actif=p.etat==='actif';
      const items=[
        ['ouvrir','Ouvrir l\'agent',IC_M.ouvrir],
        ['lancer','Lancer maintenant',IC_M.blanc],
        ['blanc','Essai à blanc (sans risque)',IC_M.blanc],
        ['sep'],
        ['nom','Renommer',IC_M.nom],
        ['copie','Dupliquer',IC_M.copie],
        [actif?'pause':'service',actif?'Mettre en pause':'Mettre en marche',actif?IC_M.pause:IC_M.service],
        ['sep'],
        ['sup','Supprimer l\'agent',IC_M.sup],
      ];
      const m=document.createElement('div');m.className='at-menu';m.setAttribute('role','menu');
      m.innerHTML=items.map(([a,l,ic])=>a==='sep'?'<span class="at-msep"></span>'
        :`<button class="at-mi${a==='sup'?' danger':''}" role="menuitem" data-a="${a}">${ic}<span>${l}</span></button>`).join('');
      document.body.appendChild(m);
      const r=ancre.getBoundingClientRect(),h=m.offsetHeight,w=m.offsetWidth;
      m.style.left=Math.max(8,Math.min(window.innerWidth-w-8,r.right-w))+'px';
      m.style.top=(r.bottom+6+h>window.innerHeight?Math.max(8,r.top-h-6):r.bottom+6)+'px';
      menuOuvert=m;
      setTimeout(()=>{document.addEventListener('pointerdown',horsMenu,true);document.addEventListener('keydown',clavMenu,true)},0);
      m.querySelector('.at-mi').focus();
      m.addEventListener('click',async e=>{
        const b=e.target.closest('.at-mi');if(!b)return;
        const a=b.dataset.a;fermerMenu();
        if(a==='ouvrir')return ouvrirPoste(p.id);
        if(a==='lancer'||a==='blanc')return lancerVite(p,a==='blanc'?'repetition':'reel');
        if(a==='nom')return renommer(p);
        if(a==='copie')return dupliquer(p);
        if(a==='pause'||a==='service')return basculer(p,a==='pause'?'pause':'actif');
        if(a==='sup')return supprimer(p);
      });
    }
    /* Lancer depuis le registre : la fiche n'est pas ouverte, donc pas de
       #atRunEtat à nourrir — le retour passe par le toast et le repeint. */
    async function lancerVite(p,mode){
      travail(true);toast(mode==='repetition'?'Essai à blanc — rien ne sera envoyé':'C\'est parti — '+p.nom);
      try{
        const r=await api('/postes/'+p.id+'/lancer',{method:'POST',body:JSON.stringify({mode})});
        await rafraichir();
        if(r.statut==='attente'){showView('controle');peindreControle()}
        else toast(r.statut==='fini'?'Terminé — ouvre l\'agent pour lire le résultat':'Arrêté : '+r.statut);
      }catch(e){toast(friendlyErr(e))}
      finally{travail(false)}
    }
    async function renommer(p){
      const v=window.prompt('Nouveau nom de l\'agent',p.nom);
      if(v===null)return;const nom=v.trim();if(!nom||nom===p.nom)return;
      try{await api('/postes/'+p.id,{method:'PATCH',body:JSON.stringify({nom:nom.slice(0,120)})});await rafraichir();toast('Agent renommé')}
      catch(e){toast(friendlyErr(e))}
    }
    /* Dupliquer copie la consigne COURANTE, pas l'historique : le clone repart
       en v1 et en brouillon — on ne planifie jamais un poste jamais vu tourner. */
    async function dupliquer(p){
      travail(true);
      try{
        const cons=await api('/postes/'+p.id+'/consignes');
        const cv=(cons||[])[0]||{};let blocs={};try{blocs=JSON.parse(cv.blocs||'{}')}catch(e){}
        let outillage=[];try{outillage=JSON.parse(cv.outillage||'[]')}catch(e){}
        const q=await api('/postes',{method:'POST',body:JSON.stringify({
          nom:(p.nom+' (copie)').slice(0,120),objectif:p.objectif,ouvrier_id:p.ouvrier_id,
          chantier_id:p.chantier_id||null,cadence:'demande',blocs,outillage,modele:cv.modele||p.modele,
          budget_cents:p.budget_cents||300,motif:'copie de « '+String(p.nom).slice(0,60)+' »'})});
        await rafraichir();ouvrirPoste(q.id);toast('Agent dupliqué — la copie repart en brouillon');
      }catch(e){toast(friendlyErr(e))}
      finally{travail(false)}
    }
    async function basculer(p,v){
      try{await api('/postes/'+p.id,{method:'PATCH',body:JSON.stringify({etat:v})});
        await rafraichir();toast(v==='actif'?'Agent en marche':'Agent en pause')}
      catch(e){
        if(e.corps&&e.corps.error==='jamais_repete'){toast('Fais un essai à blanc d\'abord — ouvre l\'agent');return}
        toast(friendlyErr(e));
      }
    }
    /* Le serveur marque supprime=1 : les passages et les livrables déjà produits
       restent, seule la ligne quitte le registre. On le dit, plutôt que de faire
       peur avec un « définitivement » qui serait faux. */
    async function supprimer(p){
      if(!window.confirm('Supprimer l\'agent « '+p.nom+' » ?\n\nIl disparaît de la liste et cesse de travailler. Les résultats déjà produits sont conservés.'))return;
      try{await api('/postes/'+p.id,{method:'DELETE'});await rafraichir();toast('Agent supprimé')}
      catch(e){toast(friendlyErr(e))}
    }

    /* Le tri est structurel, pas décoratif : ce qui réclame un geste est en
       haut, ce qui tourne bien s'efface, les brouillons se replient. */
    /* Le tri par strates reste le même ; le filtre décide seulement QUI entre.
       Un registre de trois lignes n'a pas besoin d'être trié, un de trente si. */
    let filtre='tous',quete='';
    const aSigner=id=>etat.controles.some(c=>c.poste_id===id);
    const estCasse=p=>p.etat==='disjoncte'||etat.journee.some(x=>x.poste_id===p.id&&(x.statut==='echec'||x.statut==='coupe'));
    function retenus(){
      const q=quete.trim().toLowerCase();
      return etat.postes.filter(p=>{
        if(filtre==='signer'&&!aSigner(p.id))return false;
        if(filtre==='casse'&&!estCasse(p))return false;
        if(filtre==='service'&&p.etat!=='actif')return false;
        if(filtre==='brouillon'&&p.etat!=='brouillon')return false;
        if(!q)return true;
        return [p.nom,p.objectif,p.ouvrier_nom,p.chantier_nom,p.modele].some(v=>String(v||'').toLowerCase().includes(q));
      });
    }
    function barre(){
      if(etat.postes.length<4)return '';
      const n=f=>etat.postes.filter(p=>f==='tous'?1:f==='signer'?aSigner(p.id):f==='casse'?estCasse(p):f==='service'?p.etat==='actif':p.etat==='brouillon').length;
      const F=[['tous','Tous'],['service','En marche'],['signer','À valider'],['casse','À reprendre'],['brouillon','Brouillons']];
      return `<div class="at-bar">
        <label class="at-find"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <input id="atFind" type="search" placeholder="Chercher un agent" aria-label="Chercher un agent" value="${esc2(quete)}"></label>
        <div class="at-filtres" role="group" aria-label="Filtrer la liste">
          ${F.filter(([k])=>k==='tous'||n(k)).map(([k,l])=>`<button class="at-fl" data-f="${k}" aria-pressed="${filtre===k?'true':'false'}">${l}<b>${n(k)}</b></button>`).join('')}
        </div></div>`;
    }
    function strates(){
      const att=id=>aSigner(id);
      const casse=p=>estCasse(p);
      const liste=retenus();
      if(!liste.length)return `<div class="at-reg"><p class="at-rien">Aucun agent ne correspond${quete?' à « '+esc2(quete)+' »':''}.</p></div>`;
      const g={signer:[],casse:[],service:[],brouillon:[]};
      liste.forEach(p=>{
        if(att(p.id))g.signer.push(p);
        else if(casse(p))g.casse.push(p);
        else if(p.etat==='brouillon')g.brouillon.push(p);
        else g.service.push(p);
      });
      const bloc=(cls,titre,l)=>l.length?`<div class="at-strate ${cls}"><span class="at-strate-t">${titre}</span>
        <span class="at-strate-n">${l.length}</span><span class="at-strate-f"></span></div>
        <ul class="at-lignes">${l.map(lignePoste).join('')}</ul>`:'';
      let h='';
      h+=bloc('urgent','À valider',g.signer);
      h+=bloc('casse','À reprendre',g.casse);
      h+=bloc('','En marche',g.service);
      if(g.brouillon.length)h+=`<details class="at-repli"${g.signer.length+g.casse.length+g.service.length?'':' open'}>
        <summary>Brouillons · ${g.brouillon.length}</summary>
        <ul class="at-lignes">${g.brouillon.map(lignePoste).join('')}</ul></details>`;
      return `<div class="at-reg">${h}</div>`;
    }

    /* ── La forge : une phrase suffit, le reste est déduit puis relu ── */
    function forge(){
      return `<div class="at-forge">
        <span class="at-lbl">Nouvel agent</span>
        <textarea class="at-ta" id="atForge" rows="2" aria-label="Décris le travail à confier"
          placeholder="Décris un travail en une phrase — « relire mes emails de prospection et me dire s'ils sonnent IA »"></textarea>
        <div class="at-frow">
          <button class="at-btn plein" id="atForger">Créer l'agent</button>
          <span class="at-td" id="atForgeEtat"></span>
        </div>
      </div>`;
    }

    /* Le registre est repeint seul quand on filtre ou qu'on cherche : ses
       écouteurs vivent donc ici, pas noyés dans peindre(). */
    function brancherRegistre(){
      $$('#atBody .at-lien').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();ouvrirPoste(a.dataset.poste)}));
      $$('#atBody .at-go[data-lancer]').forEach(g=>g.addEventListener('click',async e=>{
        e.preventDefault();e.stopPropagation();
        const p=etat.postes.find(x=>x.id===g.dataset.lancer);if(!p)return;
        g.disabled=true;
        try{await lancerVite(p,'reel')}finally{g.disabled=false}
      }));
      $$('#atBody .at-go[data-menu]').forEach(g=>g.addEventListener('click',e=>{
        e.preventDefault();e.stopPropagation();
        const p=etat.postes.find(x=>x.id===g.dataset.menu);if(p)ouvrirMenu(p,g);
      }));
    }
    function peindre(){
      fermerMenu();
      const b=$('#atBody');if(!b)return;
      if(!charge){b.innerHTML=`<div class="at-list">${'<div class="at-sk"></div>'.repeat(3)}</div>`;return}
      if(sansAcces){
        b.innerHTML=`<div class="at-empty">
          <p class="at-et">Tes agents demandent ton code d'accès.</p>
          <p class="at-es">Tes agents vivent sur le serveur pour travailler sans onglet ouvert — il faut donc savoir à qui ils appartiennent. Recharge la page&nbsp;: MAZ te demandera ton code.</p>
          <button class="at-btn plein" id="atRecharge">Recharger</button></div>`;
        const r=$('#atRecharge');r&&r.addEventListener('click',()=>{try{localStorage.removeItem('mzai:acode')}catch(e){}location.reload()});
        return;
      }
      const hors=perime?`<div class="at-off"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v6M12 16v6" stroke-linecap="round"/><circle cx="12" cy="12" r="2"/></svg>Connexion perdue — voici le dernier état connu.</div>`:'';
      const liste=etat.postes.length
        ? `<div${perime?' class="at-stale"':''}>${barre()}<div id="atReg">${strates()}</div></div>`
        : `<div class="at-empty"><p class="at-et">Un agent, c'est un travail qui se refait tout seul.</p>
             <p class="at-es">Ou qui part quand tu appuies. Décris-le en une phrase : MAZ écrit ses instructions, choisit le modèle et les outils — tu relis avant de lancer.</p></div>`;
      /* La ligne des 24 h ne s'affiche que s'il s'est passé quelque chose :
         une règle graduée vide occupe 60 px pour dire « rien ». */
      const d0=new Date();d0.setHours(0,0,0,0);
      const duJour=etat.journee.some(p=>p.debut_at>=d0.getTime());
      b.innerHTML=hors+recit()+(duJour?ligneJour():'')+liste+forge();
      brancherRegistre();
      /* Le champ ne repeint QUE le registre : repeindre tout l'écran lui volerait
         le focus à chaque lettre tapée. */
      const fd=$('#atFind');
      if(fd){let t=0;fd.addEventListener('input',()=>{quete=fd.value;clearTimeout(t);t=setTimeout(()=>{
        const z=$('#atReg');if(z){z.innerHTML=strates();brancherRegistre()}
        $$('#atBody .at-fl').forEach(x=>x.setAttribute('aria-pressed',x.dataset.f===filtre?'true':'false'));},120)})}
      $$('#atBody .at-fl').forEach(x=>x.addEventListener('click',()=>{
        filtre=x.dataset.f;
        $$('#atBody .at-fl').forEach(y=>y.setAttribute('aria-pressed',y===x?'true':'false'));
        const z=$('#atReg');if(z){z.innerHTML=strates();brancherRegistre()}}));
      const f=$('#atForger');f&&f.addEventListener('click',forger);
      const ta=$('#atForge');ta&&ta.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();forger()}});
      const n=$('#atNavN');if(n){n.textContent=etat.controles.length||'';n.hidden=!etat.controles.length}
      // le khatam de la sidebar devient la jauge ambiante : les 8 derniers passages du jour,
      // branche sertie = réussi, brique = cassé, craie = attend signature — la marque au premier regard
      const _ni=document.querySelector('.nav-item[data-view=atelier] .nav-ic');
      if(_ni){const MAPJ={fini:'O',echec:'X',coupe:'X',attente:'?'};
        const sj=(etat.journee||[]).slice(-8).map(x=>MAPJ[x.statut]||'.').join('');
        const _old=_ni.querySelector('svg');
        if(_old)_old.outerHTML=jauge(sj,18);
      }
      // bascule en échec : on compte les passages cassés du jour, un flash si le compte monte
      const _ko=etat.journee.filter(x=>x.statut==='echec'||x.statut==='coupe').length;
      if(window.__echecs!=null && _ko>window.__echecs)flashEchec();
      window.__echecs=_ko;
      window.__parc={actifs:etat.postes.filter(p=>p.etat==='actif').length,signer:etat.controles.length};
      if(typeof majHomeEtat==='function')majHomeEtat();
      const s=$('#atSub');if(s)s.textContent=etat.postes.length?`${etat.postes.length} agent${etat.postes.length>1?'s':''} · ${eur(etat.mois_cents)} ce mois`:'Tes agents qui travaillent sans toi';
    }

    /* Retire puis rejoue la classe : sans le reflow, un second échec d'affilée
       ne rejouerait pas l'animation (même classe déjà posée). */
    function flashEchec(){
      const el=document.querySelector('.nav-item[data-view="atelier"]');if(!el)return;
      el.classList.remove('at-flash');void el.offsetWidth;el.classList.add('at-flash');
      const svg=el.querySelector('.nav-ic svg');
      svg&&svg.addEventListener('animationend',()=>el.classList.remove('at-flash'),{once:true});
    }

    async function rafraichir(){
      try{
        const d=await api('/atelier');etat=d;perime=false;charge=true;
        const[o,c]=await Promise.all([api('/ouvriers').catch(()=>[]),api('/chantiers').catch(()=>[])]);
        ouvriers=o||[];chantiers=c||[];
      }catch(e){
        /* Un refus d'accès n'est pas une panne réseau. Afficher « connexion
           perdue » quand le vrai problème est « code manquant » envoie
           chercher un problème qui n'existe pas. */
        charge=true;sansAcces=(e.statut===401);perime=!sansAcces;
      }
      peindre();
    }

    /* ── Forger : le modèle rédige la fiche, Mazen relit et ajuste ── */
    async function forger(){
      const ta=$('#atForge'),et=$('#atForgeEtat'),bt=$('#atForger');
      const phrase=(ta&&ta.value||'').trim();
      if(phrase.length<12){et.textContent='Une phrase un peu plus précise, et c\'est parti.';ta&&ta.focus();return}
      bt.disabled=true;travail(true);et.textContent='MAZ écrit les instructions…';
      try{
        const spec=await api('/forge',{method:'POST',body:JSON.stringify({phrase})});
        const ouv=await assurerOuvrier(spec);
        const p=await api('/postes',{method:'POST',body:JSON.stringify({
          nom:spec.nom,objectif:spec.objectif,ouvrier_id:ouv.id,cadence:'demande',
          blocs:spec.blocs,outillage:spec.outillage,modele:spec.modele,budget_cents:300,
          motif:motifForge(spec)})});
        ta.value='';et.textContent='';
        await rafraichir();ouvrirPoste(p.id);
        toast('Agent créé — relis ses instructions avant de le lancer');
      }catch(e){et.textContent=friendlyErr(e)}
      finally{bt.disabled=false;travail(false)}
    }
    /* Le routeur explique déjà pourquoi il a choisi ce modèle — on garde sa
       raison dans la version de consigne. Une boîte noire qui choisit juste
       reste une boîte noire. */
    function motifForge(spec){
      const t=(spec.pourquoi||[]).join(' · ');
      return `forgé — ${spec.modele} (${spec.rpm}/min)${t?' · '+t:''}`.slice(0,400);
    }
    /* Un ouvrier par couple (modèle, outillage) : on n'en empile pas un par poste. */
    async function assurerOuvrier(spec){
      const cle=JSON.stringify((spec.outillage||[]).slice().sort());
      const dej=ouvriers.find(o=>o.modele===spec.modele&&JSON.stringify(JSON.parse(o.outillage||'[]').slice().sort())===cle);
      if(dej)return dej;
      const o=await api('/ouvriers',{method:'POST',body:JSON.stringify({
        nom:spec.ouvrier||'Ouvrier',metier:spec.metier||'',modele:spec.modele,outillage:spec.outillage||[]})});
      ouvriers.push(o);return o;
    }

    /* ═══ Le diff de consigne ═══════════════════════════════════════════════
       Une consigne fait 500 à 2 000 caractères ; tu en changes trois mots.
       Relire deux pavés côte à côte pour les retrouver, personne ne le fait.
       Plus grande sous-séquence commune sur les MOTS, calculée en local :
       zéro appel, zéro jeton, instantané. */
    function motsDiff(av,ap){
      const A=String(av||'').split(/(\s+)/).filter(s=>s!==''),
            B=String(ap||'').split(/(\s+)/).filter(s=>s!=='');
      const n=A.length,m=B.length;
      // Garde-fou : au-delà, on compare bloc entier plutôt que d'allouer 4 M de cellules.
      if(n*m>400000)return av===ap?[['=',ap]]:[['-',av],['+',ap]];
      const L=Array.from({length:n+1},()=>new Uint32Array(m+1));
      for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)
        L[i][j]=A[i]===B[j]?L[i+1][j+1]+1:Math.max(L[i+1][j],L[i][j+1]);
      const ops=[];let i=0,j=0;
      const pousse=(t,s)=>{const d=ops[ops.length-1];if(d&&d[0]===t)d[1]+=s;else ops.push([t,s])};
      while(i<n&&j<m){
        if(A[i]===B[j]){pousse('=',A[i]);i++;j++}
        else if(L[i+1][j]>=L[i][j+1]){pousse('-',A[i]);i++}
        else{pousse('+',B[j]);j++}
      }
      while(i<n)pousse('-',A[i++]);
      while(j<m)pousse('+',B[j++]);
      return ops;
    }
    const rendDiff=ops=>ops.map(([t,s])=>{
      const e=esc2(s);
      return t==='='?e:t==='-'?`<del class="at-del">${e}</del>`:`<ins class="at-ins">${e}</ins>`;
    }).join('');

    /* ═══ La fiche de poste ═══ */
    const OUTILLAGE=[
      {cle:'web_search',nom:'Recherche web',note:'≈ 0,03 € par appel — 180× une requête simple',cher:true},
      {cle:'code_interpreter',nom:'Calcul Python',note:'≈ 0,00003 € par appel — négligeable'},
    ];
    const NOMS={role:'Rôle',methode:'Méthode',interdits:'Interdits',format:'Format de sortie'};
    const AIDE={role:'Qui il est, et pour qui il travaille.',methode:'Les étapes, dans l\'ordre.',
      interdits:'Ce qu\'il ne doit jamais faire. C\'est le bloc qui sauve.',format:'La forme exacte du résultat.'};

    async function ouvrirPoste(id){
      showView('poste');
      const b=$('#atPosteBody');b.innerHTML=`<div class="at-list">${'<div class="at-sk"></div>'.repeat(2)}</div>`;
      try{
        const[p,cons,passages,corrs]=await Promise.all([
          api('/postes').then(l=>l.find(x=>x.id===id)),
          api('/postes/'+id+'/consignes'),api('/postes/'+id+'/passages'),
          api('/correctifs').catch(()=>[])]);
        posteOuvert=p;peindrePoste(p,cons,passages);
        // Une proposition en attente ne doit pas se perdre parce qu'on a quitté l'écran.
        const c=(corrs||[]).find(x=>x.poste_id===id);
        if(c){const z=$('#atCorrEnAttente');if(z)montrerCorrectif(
          {...c,n:(()=>{try{return JSON.parse(c.preuves||'[]').length}catch(e){return 0}})()},z)}
      }catch(e){b.innerHTML=`<div class="at-empty"><p class="at-et">Agent illisible</p><p class="at-es">${esc2(friendlyErr(e))}</p></div>`}
    }

    function peindrePoste(p,cons,passages){
      const cv=(cons||[])[0]||{blocs:'{}'};let blocs={};try{blocs=JSON.parse(cv.blocs)}catch(e){}
      const outil=(()=>{try{return JSON.parse(cv.outillage||'[]')}catch(e){return[]}})();
      const ouv=ouvriers.find(o=>o.id===p.ouvrier_id)||{};
      $('#atPosteNom').textContent=p.nom;
      $('#atPosteSub').textContent=`instructions v${p.consigne_ver} · ${(ouv.modele||'—').replace('-latest','')} · ${ETIQ_ETAT[p.etat]||p.etat}`;
      const pct=p.budget_cents?Math.min(100,(p.depense_cents/p.budget_cents)*100):0;
      const cl=pct>=100?' plein':(pct>=70?' chaud':'');
      const der=(passages||[])[0];

      $('#atPosteBody').innerHTML=`
        <div class="at-fiche">
          <div class="at-card">
            <div class="at-ct-row">
              <p class="at-ct">Instructions <span class="at-bc" style="margin-left:6px">v${p.consigne_ver}</span></p>
              ${(cons||[]).length>1?`<label class="at-cmp"><span>comparer à</span>
                <select class="at-sel at-sel-mini" id="atCmp" aria-label="Comparer à une version précédente">
                  <option value="">—</option>
                  ${cons.filter(c=>c.version<p.consigne_ver).map(c=>`<option value="${c.version}">v${c.version}</option>`).join('')}
                </select></label>`:''}
            </div>
            <div class="at-blocs">${['role','methode','interdits','format'].map(k=>`
              <div class="at-bloc">
                <div class="at-bh"><span class="at-bn">${NOMS[k]}</span><span class="at-bc" data-cnt="${k}">${(blocs[k]||'').length}</span></div>
                <textarea class="at-bt" data-bloc="${k}" rows="2" aria-label="${NOMS[k]}" placeholder="${esc2(AIDE[k])}">${esc2(blocs[k]||'')}</textarea>
              </div>`).join('')}</div>
            <div class="at-f"><span class="at-lbl">Ce qu'il doit produire</span>
              <textarea class="at-bt" id="atObj" rows="2" style="border:1px solid var(--line);border-radius:var(--r-sm)" aria-label="Objectif">${esc2(p.objectif||'')}</textarea></div>
            <div id="atCorrEnAttente"></div>
            <div class="at-frow"><button class="at-btn" id="atSave">Enregistrer en v${p.consigne_ver+1}</button>
              <span class="at-td" id="atSaveEtat"></span></div>
          </div>

          <div style="display:flex;flex-direction:column;gap:var(--s-6)">
            <div class="at-card">
              <p class="at-ct">Réglages</p>
              <div class="at-grid2">
                <div class="at-f"><span class="at-lbl">Modèle</span>
                  <select class="at-sel" id="atModele">${['mistral-large-latest','magistral-medium-latest','mistral-medium-latest','ministral-8b-latest','ministral-3b-latest','devstral-medium-latest','codestral-latest'].map(m=>`<option value="${m}"${ouv.modele===m?' selected':''}>${m.replace('-latest','')}</option>`).join('')}</select></div>
                <div class="at-f"><span class="at-lbl">Budget / mois</span>
                  <input class="at-in at-num" id="atBudget" type="number" min="0" step="0.5" value="${((p.budget_cents||0)/100).toFixed(2)}" aria-label="Budget mensuel en euros"></div>
              </div>
              ${cv.motif?`<p class="at-td" style="margin:calc(-1 * var(--s-2)) 0 0">${esc2(cv.motif)}</p>`:''}
              <div class="at-f"><span class="at-lbl">Ce qu'il a le droit d'utiliser</span>
                ${OUTILLAGE.map(o=>`<label class="at-tool${outil.includes(o.cle)?' on':''}" data-tool="${o.cle}">
                  <input type="checkbox" ${outil.includes(o.cle)?'checked':''} aria-label="${esc2(o.nom)}">
                  <span><span class="at-tn">${o.nom}</span><span class="at-td${o.cher?' cher':''}">${o.note}</span></span></label>`).join('')}</div>
              <div class="at-grid2">
                <div class="at-f"><span class="at-lbl">Quand il travaille</span>
                  <select class="at-sel" id="atCad">
                    <option value="demande"${p.cadence==='demande'?' selected':''}>Quand j'appuie</option>
                    <option value="cron"${p.cadence==='cron'?' selected':''}>Tout seul, à heure fixe</option></select></div>
                <div class="at-f" id="atCronF" ${p.cadence==='cron'?'':'hidden'}><span class="at-lbl">À quelle heure</span>
                  <select class="at-sel" id="atCron">
                    ${[['0 8 * * *','Chaque jour à 8h'],['0 20 * * *','Chaque jour à 20h'],['0 9 * * 1','Chaque lundi à 9h'],['0 * * * *','Toutes les heures'],['*/30 * * * *','Toutes les 30 min']]
                      .map(([v,l])=>`<option value="${v}"${p.cron===v?' selected':''}>${l}</option>`).join('')}</select></div>
              </div>
              <div class="at-f"><span class="at-lbl">Dépensé ce mois — <span class="at-num">${eur(p.depense_cents||0)}</span> sur <span class="at-num">${eur(p.budget_cents||0)}</span></span>
                <div class="at-jauge${cl}"><i style="width:${pct.toFixed(1)}%"></i></div></div>
              <div class="at-f"><span class="at-lbl">Données à traiter <span style="text-transform:none;letter-spacing:0">— colle ici ce sur quoi il doit travailler</span></span>
                <textarea class="at-bt" id="atEntree" rows="2" style="border:1px solid var(--line);border-radius:var(--r-sm)"
                  aria-label="Données à traiter" placeholder="Facultatif si l'agent cherche lui-même sur le web."></textarea></div>
              <div class="at-frow">
                <button class="at-btn" id="atRepet">Essai à blanc</button>
                <button class="at-btn plein" id="atLancer">Lancer maintenant</button>
                ${p.etat==='actif'?'<button class="at-btn" id="atPause">Mettre en pause</button>':'<button class="at-btn" id="atActiver">Mettre en marche</button>'}
              </div>
              <div class="at-frow" style="border-top:1px solid var(--line-faint);padding-top:var(--s-3)">
                <button class="at-btn" id="atDup">Dupliquer</button>
                <button class="at-btn" id="atRenom">Renommer</button>
                <span style="flex:1"></span>
                <button class="at-btn danger" id="atSup">Supprimer</button>
              </div>
              <p class="at-td" id="atRunEtat">${p.cadence==='cron'&&p.prochain_at?'Prochaine fois '+new Date(p.prochain_at).toLocaleString('fr-FR',{weekday:'short',hour:'2-digit',minute:'2-digit'}):''}</p>
            </div>

            <div class="at-card">
              <p class="at-ct">${der?'Dernière exécution':'Exécutions'}</p>
              ${der?`<div class="at-steps" id="atJournal"></div><div id="atLivrable"></div>`:'<p class="at-td">Jamais lancé. « Essai à blanc » n\'envoie rien nulle part : c\'est le bon premier geste.</p>'}
              ${(passages||[]).length?`<div class="at-f"><span class="at-lbl">Historique</span>${passages.slice(0,6).map(x=>{
                const k=x.statut==='fini'?'':(x.statut==='attente'?'att':'ko');
                return `<button class="at-step" data-passage="${x.id}" style="background:none;border:0;border-top:1px solid var(--line-faint);width:100%;cursor:pointer;text-align:left;font:inherit">
                  <span class="at-si ${k}"></span><span class="at-sn">${hhmm(x.debut_at)} · ${esc2(x.mode)} · ${esc2(x.declencheur)}</span>
                  <span class="at-sv">${eur(x.cout_cents||0)}</span></button>`}).join('')}</div>`:''}
            </div>
          </div>
        </div>`;

      /* Une consigne ne se lit pas à travers une meurtrière : chaque bloc prend
         la hauteur de son contenu, et la garde à la frappe. */
      /* Aucun plafond : un bloc de consigne se lit d'un trait. Le plafonner à
         420 px créait une barre de défilement DANS le bloc, et deux niveaux de
         scroll imbriqués — on ne savait plus lequel on faisait bouger. */
      const pousser=t=>{t.style.height='auto';t.style.height=t.scrollHeight+'px'};
      $$('#atPosteBody .at-bt').forEach(t=>{pousser(t);t.addEventListener('input',()=>{
        pousser(t);
        const c=t.dataset.bloc&&$(`#atPosteBody .at-bc[data-cnt="${t.dataset.bloc}"]`);if(c)c.textContent=t.value.length})});
      /* Les polices arrivent après le premier calcul : la hauteur serait mesurée
         avec la police de repli, puis Archivo la dépasserait — et comme le champ
         est en overflow:hidden, la fin de la consigne disparaîtrait SANS barre
         de défilement pour le dire. On remesure quand les polices sont prêtes. */
      if(document.fonts&&document.fonts.ready)document.fonts.ready.then(()=>{
        $$('#atPosteBody .at-bt').forEach(pousser)}).catch(()=>{});
      $$('#atPosteBody .at-tool').forEach(l=>l.addEventListener('change',()=>l.classList.toggle('on',l.querySelector('input').checked)));

      /* Comparer : les quatre éditeurs basculent en lecture, seuls les mots
         qui ont bougé sont marqués. Un bloc inchangé le dit et se tait. */
      const selCmp=$('#atCmp');
      selCmp&&selCmp.addEventListener('change',()=>{
        const v=selCmp.value;
        const zone=$('#atPosteBody .at-blocs');
        if(!v){peindrePoste(p,cons,passages);return}
        const ref=(cons||[]).find(c=>String(c.version)===String(v));
        let avant={};try{avant=JSON.parse(ref.blocs)}catch(e){}
        zone.innerHTML=['role','methode','interdits','format'].map(k=>{
          const a=avant[k]||'',b=blocs[k]||'';
          const inchange=a.trim()===b.trim();
          return `<div class="at-bloc">
            <div class="at-bh"><span class="at-bn">${NOMS[k]}</span>
              <span class="at-bc">${inchange?'inchangé':'modifié'}</span></div>
            <div class="at-diff${inchange?' at-diff-off':''}">${inchange?esc2(b||'—'):rendDiff(motsDiff(a,b))}</div>
          </div>`}).join('');
        const bar=document.createElement('div');
        bar.className='at-frow';bar.style.marginTop='var(--s-3)';
        bar.innerHTML=`<span class="at-td">v${v} → v${p.consigne_ver} · <del class="at-del">retiré</del> <ins class="at-ins">ajouté</ins></span>`;
        zone.after(bar);
      });
      $('#atCad').addEventListener('change',e=>{$('#atCronF').hidden=e.target.value!=='cron'});
      $('#atSave').addEventListener('click',()=>enregistrer(p));
      $('#atLancer').addEventListener('click',()=>lancer(p,'reel'));
      $('#atRepet').addEventListener('click',()=>lancer(p,'repetition'));
      const pa=$('#atPause'),ac=$('#atActiver');
      pa&&pa.addEventListener('click',()=>etatPoste(p,'pause'));
      ac&&ac.addEventListener('click',()=>etatPoste(p,'actif'));
      $('#atDup')&&$('#atDup').addEventListener('click',()=>dupliquer(p));
      $('#atRenom')&&$('#atRenom').addEventListener('click',async()=>{await renommer(p);ouvrirPoste(p.id)});
      /* Supprimer depuis la fiche renvoie au registre : rester sur la fiche d'un
         poste qui n'existe plus n'a pas de sens. */
      $('#atSup')&&$('#atSup').addEventListener('click',async()=>{
        const av=etat.postes.length;await supprimer(p);
        if(etat.postes.length<av)showView('atelier');});
      $$('#atPosteBody [data-passage]').forEach(x=>x.addEventListener('click',()=>journal(x.dataset.passage)));
      if(der)journal(der.id);
    }

    async function enregistrer(p){
      const et=$('#atSaveEtat');et.textContent='Enregistrement…';
      const blocs={};$$('#atPosteBody .at-bt[data-bloc]').forEach(t=>blocs[t.dataset.bloc]=t.value.trim());
      const outillage=[...$$('#atPosteBody .at-tool')].filter(l=>l.querySelector('input').checked).map(l=>l.dataset.tool);
      const cad=$('#atCad').value;
      try{
        const modele=$('#atModele').value;
        /* Un ouvrier = un couple (modèle, outillage). On réutilise celui qui
           correspond, sinon on en crée un : changer le modèle d'un poste ne
           doit pas modifier celui des autres postes qui partagent l'ouvrier. */
        const ouv=await assurerOuvrier({modele,outillage,nom:'Ouvrier '+modele.replace('-latest','')});
        if(ouv.id!==p.ouvrier_id)await api('/postes/'+p.id,{method:'PATCH',body:JSON.stringify({ouvrier_id:ouv.id})});
        await api('/postes/'+p.id,{method:'PATCH',body:JSON.stringify({
          blocs,outillage,modele,motif:'modifié depuis la fiche',
          objectif:$('#atObj').value.trim(),cadence:cad,cron:cad==='cron'?$('#atCron').value:null,
          budget_cents:Math.round(parseFloat($('#atBudget').value||'0')*100)})});
        et.textContent='';toast('Instructions enregistrées en v'+(p.consigne_ver+1));
        await rafraichir();ouvrirPoste(p.id);
      }catch(e){et.textContent=friendlyErr(e)}
    }
    async function etatPoste(p,etatV){
      try{await api('/postes/'+p.id,{method:'PATCH',body:JSON.stringify({etat:etatV})});
        toast(etatV==='actif'?'Agent en marche':'Agent en pause');await rafraichir();ouvrirPoste(p.id)}
      catch(e){
        /* Le serveur refuse de planifier un poste jamais vu tourner. Plutôt que
           d'afficher le refus, on propose le geste qui débloque. */
        if(e.corps&&e.corps.error==='jamais_repete'){
          const et=$('#atRunEtat');if(et)et.textContent=e.corps.hint;
          toast('Fais un essai à blanc d\'abord');
          const rp=$('#atRepet');if(rp){rp.classList.add('plein');rp.focus()}
          const la=$('#atLancer');if(la)la.classList.remove('plein');
          return;
        }
        toast(friendlyErr(e));
      }
    }

    /* ═══ Le pont : un échange de l'Établi devient un poste ═══
       On n'archive pas le résultat, on extrait la méthode qui l'a produit. */
    async function depuisEchange(){
      const c=convoById(activeId);
      if(!c||!c.msgs||c.msgs.length<2){toast('Ouvre une conversation qui a produit quelque chose');return}
      const bt=$('#atPontBtn');bt.disabled=true;travail(true);
      const lbl=bt.innerHTML;bt.innerHTML='MAZ lit la conversation…';
      try{
        const echange=c.msgs.filter(m=>m&&typeof m.text==='string'&&m.text.trim())
          .slice(-12)
          .map(m=>(m.role==='user'?'MAZEN : ':'IA : ')+m.text.trim())
          .join('\n\n---\n\n');
        const spec=await api('/forge',{method:'POST',body:JSON.stringify({echange})});
        const ouv=await assurerOuvrier(spec);
        const p=await api('/postes',{method:'POST',body:JSON.stringify({
          nom:spec.nom,objectif:spec.objectif,ouvrier_id:ouv.id,cadence:'demande',
          blocs:spec.blocs,outillage:spec.outillage,modele:spec.modele,budget_cents:300,
          motif:'tiré de la conversation « '+(c.title||'sans titre').slice(0,40)+' » · '+motifForge(spec)})});
        await rafraichir();ouvrirPoste(p.id);
        toast('Agent créé depuis la conversation — relis ses instructions');
      }catch(e){toast(friendlyErr(e))}
      finally{bt.disabled=false;bt.innerHTML=lbl;travail(false)}
    }
    /* Le pont n'apparaît que quand il y a matière : au moins une vraie réponse. */
    function syncPont(){
      const el=$('#atPont');if(!el)return;
      const c=convoById(activeId);
      // La convention du fil est role:'ai' (pas 'assistant') — s'y tromper masque le pont en silence.
      const utile=!!(c&&(c.msgs||[]).some(m=>m&&m.role==='ai'&&!m.error&&typeof m.text==='string'&&m.text.trim().length>80));
      el.hidden=!(utile&&$('#app').dataset.view==='chat');
    }
    async function lancer(p,mode){
      const et=$('#atRunEtat'),bs=[$('#atLancer'),$('#atRepet')].filter(Boolean);
      bs.forEach(b=>b.disabled=true);travail(true);
      et.textContent=mode==='repetition'?'Essai à blanc — rien ne partira…':'En cours…';
      try{
        const ent=($('#atEntree')&&$('#atEntree').value.trim())||null;
        const r=await api('/postes/'+p.id+'/lancer',{method:'POST',body:JSON.stringify({mode,entree:ent})});
        if(r.statut==='attente'){et.textContent='Arrêté avant d\'envoyer — ton accord est demandé.';await rafraichir();showView('controle');peindreControle()}
        else{et.textContent=r.statut==='fini'?'Terminé.':'Arrêté : '+r.statut+(r.erreur?' — '+r.erreur:'');await rafraichir();ouvrirPoste(p.id)}
      }catch(e){et.textContent=friendlyErr(e)}
      finally{bs.forEach(b=>b.disabled=false);travail(false)}
    }
    async function journal(pid){
      const c=$('#atJournal');if(!c)return;
      try{
        const d=await api('/passages/'+pid);
        const etapes=(d.etapes||[]).map(e=>{
          const k=e.statut==='simule'?'sim':(e.statut==='echec'?'ko':(e.statut==='attente'?'att':''));
          const val=e.ms?e.ms+' ms':(e.sortie||'');
          return `<div class="at-step"><span class="at-si ${k}"></span><span class="at-sn">${esc2(e.nom)}${e.statut==='simule'?' — simulé':''}</span><span class="at-sv">${esc2(String(val).slice(0,26))}</span></div>`
            +(e.plan?`<div class="at-plan">${esc2(e.plan)}</div>`:'');
        }).join('')||'<p class="at-td">Aucune étape.</p>';
        c.innerHTML=etapes;
        // Le livrable est le PRODUIT du poste : il se lit ici, pas dans un journal technique.
        const zone=$('#atLivrable');if(!zone)return;
        const lv=(d.livrables||[])[0];
        if(!lv){zone.innerHTML=d.statut==='attente'
          ? '<p class="at-td">En attente de ton accord — rien n\'a encore été envoyé.</p>'
          : (d.mode==='repetition'?'<p class="at-td">Essai à blanc : rien n\'a été envoyé, seul le plan a été relevé.</p>':'');return}
        const plein=await api('/livrables/'+lv.id);
        const HAUT='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M7 22V10l5-8a2 2 0 0 1 2 2v5h5a2 2 0 0 1 2 2.4l-1.6 8A2 2 0 0 1 17.4 22H7z"/><path d="M7 10H4v12h3"/></svg>';
        const BAS='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M17 2v12l-5 8a2 2 0 0 1-2-2v-5H5a2 2 0 0 1-2-2.4l1.6-8A2 2 0 0 1 6.6 2H17z"/><path d="M17 14h3V2h-3"/></svg>';
        zone.innerHTML=`<div class="at-livr">
          <div class="at-livr-h"><span class="at-livr-t">${esc2(plein.titre)}</span>
            <span class="at-livr-m">${hhmm(plein.cree_at)} · ${eur(d.cout_cents||0)}</span></div>
          <div class="at-livr-c bubble md">${renderMD(String(plein.corps||''))}</div>
          <div class="at-frow">
            <div class="at-pouce">
              <button class="at-pb" id="atPHaut" aria-label="Ce résultat est bon" title="Ce résultat est bon">${HAUT}</button>
              <button class="at-pb bas" id="atPBas" aria-label="Ce résultat ne va pas" title="Ce résultat ne va pas">${BAS}</button>
            </div>
            <input class="at-motif" id="atMotif" hidden placeholder="En deux mots, qu'est-ce qui ne va pas ? « prix inventé »" aria-label="Motif du recalage">
            <button class="at-btn" id="atCopie">Copier</button>
          </div>
          <div id="atCorrectif"></div></div>`;
        const cp=$('#atCopie');cp&&cp.addEventListener('click',()=>{
          navigator.clipboard.writeText(plein.corps||'').then(()=>toast('Résultat copié')).catch(()=>toast('Copie impossible'))});
        brancherPouce(plein.id);
      }catch(e){c.innerHTML='<p class="at-td">'+esc2(friendlyErr(e))+'</p>'}
    }

    /* ═══ Le pouce ══════════════════════════════════════════════════════════
       Il ne sert pas à faire des statistiques. Un pouce en bas + deux mots,
       et quand le même reproche revient trois fois, l'atelier propose la ligne
       d'interdit qui l'empêchera. Sans le motif, on n'a qu'une humeur. */
    function brancherPouce(livrableId){
      const h=$('#atPHaut'),b=$('#atPBas'),m=$('#atMotif'),z=$('#atCorrectif');
      if(!h||!b)return;
      const envoyer=async(pouce)=>{
        try{
          const r=await api('/livrables/'+livrableId+'/verdict',
            {method:'POST',body:JSON.stringify({pouce,motif:pouce===-1?(m.value||'').trim():''})});
          h.classList.toggle('on',pouce===1);b.classList.toggle('on',pouce===-1);
          toast(pouce===1?'Noté — c\'est ce qu\'on veut':'Noté — il fera autrement');
          if(r.correctif)montrerCorrectif(r.correctif,z);
        }catch(e){toast(friendlyErr(e))}
      };
      h.addEventListener('click',()=>{m.hidden=true;envoyer(1)});
      b.addEventListener('click',()=>{
        if(m.hidden){m.hidden=false;m.focus();return}   // premier clic : on demande pourquoi
        envoyer(-1);
      });
      m.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();envoyer(-1)}});
    }

    /* Un correctif modifie la consigne : c'est une écriture, donc il attend une
       signature — et Mazen peut réécrire la phrase avant d'accepter. */
    function montrerCorrectif(c,zone){
      if(!zone)return;
      zone.innerHTML=`<div class="at-corr">
        <div class="at-corr-h"><span class="at-corr-b">${c.action==='remplacer'?'remplacer dans':'ajouter aux'} ${NOMS[c.bloc]||c.bloc}</span>
          <span class="at-td">fondé sur ${c.n} résultats recalés pour « ${esc2(c.motif)} »</span></div>
        <textarea class="at-corr-t" id="atCorrTxt" aria-label="Phrase proposée">${esc2(c.texte)}</textarea>
        <div class="at-acts">
          <button class="at-btn" data-c="refuser">Pas celle-là</button>
          <button class="at-btn plein" data-c="accepter">Ajouter aux instructions</button>
        </div></div>`;
      $$('[data-c]',zone).forEach(bt=>bt.addEventListener('click',async()=>{
        $$('[data-c]',zone).forEach(x=>x.disabled=true);
        try{
          const d=bt.dataset.c==='accepter'
            ? await api('/correctifs/'+c.id,{method:'POST',body:JSON.stringify({decision:'accepter',texte:$('#atCorrTxt').value})})
            : await api('/correctifs/'+c.id,{method:'POST',body:JSON.stringify({decision:'refuser'})});
          zone.innerHTML='';
          if(bt.dataset.c==='accepter'){toast('Instructions passées en v'+d.version);await rafraichir();ouvrirPoste(c.poste_id||posteOuvert.id)}
          else toast('Proposition écartée — le reproche reste noté');
        }catch(e){toast(friendlyErr(e));$$('[data-c]',zone).forEach(x=>x.disabled=false)}
      }));
    }

    /* ═══ Le contrôle ═══ */
    function peindreControle(){
      const b=$('#atCtrlBody');if(!b)return;
      if(!etat.controles.length){
        b.innerHTML=`<div class="at-empty"><p class="at-et">Rien à valider.</p><p class="at-es">Tes agents travaillent seuls.</p></div>`;return}
      b.innerHTML=etat.controles.map(c=>{
        let a={};try{a=JSON.parse(c.intention)}catch(e){}
        const reste=Math.max(0,c.perime_at-Date.now()),h=Math.floor(reste/3600000),m=Math.floor(reste%3600000/60000);
        return `<div class="at-ctrl" data-ctrl="${esc2(c.id)}">
          <div class="at-ctrl-h"><span class="at-ctrl-t">${esc2(c.resume)}</span>
            <span class="at-exp">expire dans ${h} h ${String(m).padStart(2,'0')}</span></div>
          <p class="at-why">${esc2(c.poste_nom||'')} — ${esc2(c.pourquoi||'')}</p>
          <div class="at-prev bubble md">${renderMD(String(a.corps||a.titre||c.intention))}</div>
          <div class="at-acts">
            <button class="at-btn danger" data-d="refuser">Refuser</button>
            <button class="at-btn plein" data-d="valider">Valider</button>
          </div>
          <p class="at-td" data-etat></p>
        </div>`}).join('');
      $$('#atCtrlBody .at-ctrl').forEach(el=>{
        $$('[data-d]',el).forEach(bt=>bt.addEventListener('click',()=>decider(el,bt.dataset.d)));
      });
    }
    async function decider(el,d){
      const et=$('[data-etat]',el),bs=$$('[data-d]',el);
      bs.forEach(b=>b.disabled=true);travail(true);et.textContent=d==='valider'?'Exécution en cours…':'Refus transmis…';
      try{
        await api('/controle/'+el.dataset.ctrl,{method:'POST',body:JSON.stringify({decision:d})});
        await rafraichir();peindreControle();
        toast(d==='valider'?'Validé — c\'est parti':'Refusé');
      }catch(e){et.textContent=friendlyErr(e);bs.forEach(b=>b.disabled=false)}
      finally{travail(false)}
    }

    return{rafraichir,peindre,peindreControle,ouvrirPoste,depuisEchange,syncPont,etat:()=>etat};
  })();

  $('#atRefresh')&&$('#atRefresh').addEventListener('click',()=>AT.rafraichir());
  $('#atBack')&&$('#atBack').addEventListener('click',()=>showView('atelier'));
  $('#atPontBtn')&&$('#atPontBtn').addEventListener('click',()=>AT.depuisEchange());
  /* Le fil est réécrit par plusieurs chemins (ouverture, streaming, régénération,
     édition) : on observe le résultat plutôt que d'aller brancher chacun d'eux. */
  (function(){const fil=$('#chat');if(!fil)return;
    let t=0;new MutationObserver(()=>{clearTimeout(t);t=setTimeout(()=>AT.syncPont(),260)})
      .observe(fil,{childList:true,subtree:true,characterData:true});})();

