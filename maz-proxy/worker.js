/**
 * MAZ — Backend (Cloudflare Worker) : proxy API + comptes + sync + médias
 * ------------------------------------------------------------------------
 * 1. PROXY   /or/* → openrouter.ai · /sf/* → api.siliconflow.com
 *            Clés détenues en secrets serveur, jamais côté client.
 *            Accès réservé aux porteurs d'un code valide (X-Maz-Code).
 * 2. COMPTES POST /auth/verify — un code d'accès par personne (hashé en base).
 * 3. SYNC    GET/PUT/DELETE /sync/… — l'historique de chacun le suit partout.
 * 4. MÉDIAS  POST /media/stash (rapatrie une URL de livraison qui expire),
 *            PUT /media/upload (blob direct), GET /media/:id (permanent, KV).
 * 5. USAGE   compteur requêtes/jour côté serveur + tokens/coût rapportés.
 * 6. ADMIN   /admin/* — créer/lister/révoquer des codes (X-Admin-Key).
 *
 * Secrets  : OPENROUTER_KEY · SILICONFLOW_KEY · ADMIN_KEY   (wrangler secret put …)
 * Bindings : maz_db (D1) · MEDIA (KV)                        (wrangler.toml)
 * Vars     : ALLOWED_ORIGINS · REQUIRE_CODE
 *
 * Sécurité :
 *  - codes JAMAIS en clair en base (SHA-256 ; entropie ~80 bits → brute-force irréaliste)
 *  - CORS restreint aux origines listées ; requêtes préparées partout (anti-injection)
 *  - /media/stash : whitelist d'hôtes (anti-SSRF) ; tailles bornées ; ids non devinables
 *  - GET /media/:id = capability-URL (uuid 128 bits) — nécessaire pour <img src> ; pas de listing
 */

import * as A from './atelier.js';

const UPSTREAMS = { '/or/': 'https://openrouter.ai', '/sf/': 'https://api.siliconflow.com', '/mi/': 'https://api.mistral.ai' };

/* Liste blanche des chemins relayables, par fournisseur.
   Sans elle, le proxy relaie N'IMPORTE QUEL chemin avec la vraie clé : un porteur
   de code appelle alors le modèle qu'il veut, lit le solde du compte, et les
   compteurs restent à zéro puisqu'ils sont alimentés par le navigateur.
   Relevé sur mzai-v2.html : l'app n'appelle que ces sept chemins. */
const CHEMINS_OK = {
  '/or/': [/^\/api\/v1\/chat\/completions$/],
  '/sf/': [/^\/v1\/(chat\/completions|images\/generations|audio\/speech|audio\/transcriptions|video\/submit|video\/status)$/],
  '/mi/': A.MI_CHEMINS,
};
/* Liste blanche des modèles. `:online` est le suffixe de recherche web d'OpenRouter. */
const MODELES_OK = {
  '/or/': new Set(['deepseek/deepseek-v4-pro', 'deepseek/deepseek-v4-flash', 'qwen/qwen3-max-thinking',
    'qwen/qwen3-coder-plus', 'moonshotai/kimi-k2.7-code', 'z-ai/glm-5.2', 'minimax/minimax-m3',
    'qwen/qwen3-vl-8b-instruct']),
  '/sf/': new Set(['black-forest-labs/FLUX.2-pro', 'black-forest-labs/FLUX-1.1-pro-Ultra',
    'black-forest-labs/FLUX.1-Kontext-max', 'black-forest-labs/FLUX.1-schnell', 'Qwen/Qwen-Image',
    'Tongyi-MAI/Z-Image-Turbo', 'Wan-AI/Wan2.2-T2V-A14B', 'Wan-AI/Wan2.2-I2V-A14B',
    'FunAudioLLM/CosyVoice2-0.5B']),
  '/mi/': A.MI_MODELES,
};
const MEDIA_HOSTS = /(^|\.)(bfl\.ai|aliyuncs\.com|siliconflow\.com|klingai\.com|kling\.ai)$/i;
const MAX_MEDIA = 22 * 1024 * 1024;   // 22 Mo par média
const MAX_CONVO = 1_500_000;          // 1,5 Mo par conversation (les blobs n'y sont jamais)
const MAX_CONVOS = 400;               // par utilisateur

/* ── helpers ── */
function corsHeaders(req, allowed) {
  const origin = req.headers.get('Origin') || '';
  const ok = allowed.length === 0 || (origin && allowed.includes(origin));
  const reqH = req.headers.get('Access-Control-Request-Headers');
  return {
    'Access-Control-Allow-Origin': ok ? origin : (allowed[0] || 'null'),
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': reqH || 'Content-Type, Authorization, X-Maz-Code, X-Admin-Key, HTTP-Referer, X-Title',
    'Access-Control-Max-Age': '600',
    'Vary': 'Origin',
  };
}
const J = (obj, status, cors) => new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
async function sha256hex(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}
const today = () => new Date().toISOString().slice(0, 10);
// comparaison à temps constant (via hash de même longueur) : pas de fuite temporelle sur la clé admin
async function safeEq(a, b) {
  if (!a || !b) return false;
  const [ha, hb] = await Promise.all([sha256hex(a), sha256hex(b)]);
  let diff = 0; for (let i = 0; i < ha.length; i++) diff |= ha.charCodeAt(i) ^ hb.charCodeAt(i);
  return diff === 0;
}
function genCode() {   // maz-XXXX-XXXX-XXXX-XXXX · base32 Crockford sans ambigus · ~80 bits
  const AB = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const b = crypto.getRandomValues(new Uint8Array(16));
  const s = [...b].map(x => AB[x % 32]).join('');
  return 'maz-' + s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8, 12) + '-' + s.slice(12, 16);
}
async function userFromCode(env, code) {
  if (!code || code.length < 10 || code.length > 64) return null;
  const h = await sha256hex(code.trim().toUpperCase().replace(/^MAZ-/, 'maz-'));   // insensible à la casse, préfixe normalisé
  const u = await env.maz_db.prepare('SELECT id,name,team,disabled,is_admin FROM users WHERE code_hash=?1').bind(h).first();
  return (u && !u.disabled) ? u : null;
}
function bumpUsage(env, ctx, uid, field, amt) {   // compteur best-effort, jamais bloquant
  ctx.waitUntil(env.maz_db.prepare(
    `INSERT INTO usage (user_id,day,${field}) VALUES (?1,?2,?3)
     ON CONFLICT(user_id,day) DO UPDATE SET ${field}=${field}+?3`
  ).bind(uid, today(), amt).run().catch(() => {}));
}

export default {
  async fetch(req, env, ctx) {
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const cors = corsHeaders(req, allowed);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const origin = req.headers.get('Origin') || '';
    if (allowed.length && origin && !allowed.includes(origin)) return J({ error: 'origin_forbidden' }, 403, cors);

    const url = new URL(req.url);
    const path = url.pathname;

    /* ══ ADMIN — X-Admin-Key (terminal) OU code d'un compte is_admin (vue admin de l'app) ══ */
    if (path.startsWith('/admin/')) {
      const byKey = env.ADMIN_KEY && await safeEq(req.headers.get('X-Admin-Key') || '', env.ADMIN_KEY);
      const byAdminUser = !byKey && (await userFromCode(env, req.headers.get('X-Maz-Code') || ''))?.is_admin === 1;
      if (!byKey && !byAdminUser) return J({ error: 'forbidden' }, 403, cors);
      if (path === '/admin/user' && req.method === 'POST') {
        const b = await req.json().catch(() => ({}));
        const name = String(b.name || '').slice(0, 60).trim();
        if (!name) return J({ error: 'name_required' }, 400, cors);
        const code = genCode(), id = crypto.randomUUID();
        await env.maz_db.prepare('INSERT INTO users (id,code_hash,name,team,created_at) VALUES (?1,?2,?3,?4,?5)')
          .bind(id, await sha256hex(code), name, b.team || null, Date.now()).run();
        return J({ id, name, code }, 200, cors);   // le code n'est montré qu'ICI, une seule fois
      }
      if (path === '/admin/users' && req.method === 'GET') {
        const rows = await env.maz_db.prepare(
          `SELECT u.id,u.name,u.team,u.disabled,u.is_admin,u.created_at,u.last_seen,
                  COALESCE(SUM(g.requests),0) req, COALESCE(SUM(g.tokens),0) tok, COALESCE(SUM(g.cost),0) cost
           FROM users u LEFT JOIN usage g ON g.user_id=u.id GROUP BY u.id ORDER BY u.created_at`).all();
        return J(rows.results, 200, cors);
      }
      if (path === '/admin/setcode' && req.method === 'POST') {   // code personnalisé choisi par l'admin — exigences minimales anti-devinette
        const b = await req.json().catch(() => ({}));
        const id = String(b.id || ''), code = String(b.code || '').trim();
        if (!id) return J({ error: 'id_required' }, 400, cors);
        if (code.length < 12 || code.length > 64) return J({ error: 'code_length', hint: '12 à 64 caractères' }, 400, cors);
        if (!/[a-zA-Z]/.test(code) || !/[0-9]/.test(code)) return J({ error: 'code_weak', hint: 'lettres ET chiffres requis' }, 400, cors);
        if (/^(maz-?)?(1234|azerty|password|motdepasse|admin|test)/i.test(code)) return J({ error: 'code_weak', hint: 'trop courant' }, 400, cors);
        const h = await sha256hex(code.toUpperCase().replace(/^MAZ-/, 'maz-'));   // même normalisation que la vérification
        const dup = await env.maz_db.prepare('SELECT id FROM users WHERE code_hash=?1 AND id!=?2').bind(h, id).first();
        if (dup) return J({ error: 'code_taken' }, 409, cors);
        await env.maz_db.prepare('UPDATE users SET code_hash=?2 WHERE id=?1').bind(id, h).run();
        return J({ ok: true }, 200, cors);
      }
      if (path === '/admin/disable' && req.method === 'POST') {
        const b = await req.json().catch(() => ({}));
        await env.maz_db.prepare('UPDATE users SET disabled=?2 WHERE id=?1').bind(String(b.id || ''), b.enable ? 0 : 1).run();
        return J({ ok: true }, 200, cors);
      }
      return J({ error: 'not_found' }, 404, cors);
    }

    /* ══ AUTH ══ */
    if (path === '/auth/verify' && req.method === 'POST') {
      const b = await req.json().catch(() => ({}));
      const u = await userFromCode(env, String(b.code || ''));
      if (!u) { await new Promise(r => setTimeout(r, 400)); return J({ ok: false }, 401, cors); }   // délai constant anti-énumération
      ctx.waitUntil(env.maz_db.prepare('UPDATE users SET last_seen=?2 WHERE id=?1').bind(u.id, Date.now()).run().catch(() => {}));
      return J({ ok: true, uid: u.id, name: u.name, team: u.team, admin: u.is_admin === 1 }, 200, cors);
    }

    /* ══ routes authentifiées par code ══ */
    const user = await userFromCode(env, req.headers.get('X-Maz-Code') || '');

    /* MÉDIAS — GET public par capability-URL (uuid non devinable), écriture authentifiée */
    if (path.startsWith('/media/') && req.method === 'GET') {
      const id = path.slice('/media/'.length);
      if (!/^[a-f0-9-]{36}$/.test(id)) return J({ error: 'bad_id' }, 400, cors);
      const { value, metadata } = await env.MEDIA.getWithMetadata(id, { type: 'stream' });
      if (!value) return J({ error: 'not_found' }, 404, cors);
      const ct = (metadata && metadata.ct) || 'application/octet-stream';
      // allowlist stricte : raster/audio/vidéo uniquement — SVG et tout type actif exclus (rendus en téléchargement, jamais inline)
      const safe = /^(image\/(png|jpe?g|webp|gif|avif|bmp)|audio\/[\w.+-]+|video\/[\w.+-]+)$/i.test(ct);
      const headers = { ...cors, 'Content-Type': safe ? ct : 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=31536000, immutable' };
      if (!safe) headers['Content-Disposition'] = 'attachment';
      return new Response(value, { status: 200, headers });
    }
    if (path === '/media/stash' && req.method === 'POST') {
      if (!user) return J({ error: 'code_required' }, 401, cors);
      const b = await req.json().catch(() => ({}));
      let hu; try { hu = new URL(String(b.url || '')); } catch { return J({ error: 'bad_url' }, 400, cors); }
      if (hu.protocol !== 'https:' || !MEDIA_HOSTS.test(hu.hostname)) return J({ error: 'host_not_allowed' }, 403, cors);
      let up; try { up = await fetch(hu.href, { redirect: 'error' }); } catch { return J({ error: 'fetch_failed' }, 502, cors); }   // pas de suivi de redirection → l'hôte final reste dans la whitelist (anti-SSRF)
      if (!up.ok) return J({ error: 'upstream_' + up.status }, 502, cors);
      const buf = await up.arrayBuffer();
      if (!buf.byteLength || buf.byteLength > MAX_MEDIA) return J({ error: 'size' }, 413, cors);
      const id = crypto.randomUUID();
      await env.MEDIA.put(id, buf, { metadata: { ct: up.headers.get('Content-Type') || 'application/octet-stream', uid: user.id } });
      return J({ mid: id }, 200, cors);
    }
    if (path === '/media/upload' && req.method === 'PUT') {
      if (!user) return J({ error: 'code_required' }, 401, cors);
      const buf = await req.arrayBuffer();
      if (!buf.byteLength || buf.byteLength > MAX_MEDIA) return J({ error: 'size' }, 413, cors);
      const id = crypto.randomUUID();
      await env.MEDIA.put(id, buf, { metadata: { ct: req.headers.get('Content-Type') || 'application/octet-stream', uid: user.id } });
      return J({ mid: id }, 200, cors);
    }

    /* SYNC — historique par utilisateur, isolé par user_id (requêtes préparées) */
    if (path === '/sync/convos' && req.method === 'GET') {
      if (!user) return J({ error: 'code_required' }, 401, cors);
      const rows = await env.maz_db.prepare('SELECT id,data,updated_at,deleted FROM convos WHERE user_id=?1 ORDER BY updated_at DESC LIMIT ?2')
        .bind(user.id, MAX_CONVOS).all();
      return J(rows.results, 200, cors);
    }
    if (path === '/sync/convo' && req.method === 'PUT') {
      if (!user) return J({ error: 'code_required' }, 401, cors);
      const b = await req.json().catch(() => ({}));
      const id = String(b.id || '').slice(0, 64), data = JSON.stringify(b.data || null), ts = +b.updated_at || Date.now();
      if (!id || data === 'null') return J({ error: 'bad_convo' }, 400, cors);
      if (data.length > MAX_CONVO) return J({ error: 'convo_too_big' }, 413, cors);
      const n = await env.maz_db.prepare('SELECT COUNT(*) c FROM convos WHERE user_id=?1').bind(user.id).first();
      if (n.c >= MAX_CONVOS) {   // fenêtre glissante : on écrase la plus ancienne
        await env.maz_db.prepare('DELETE FROM convos WHERE user_id=?1 AND id IN (SELECT id FROM convos WHERE user_id=?1 ORDER BY updated_at ASC LIMIT 1)').bind(user.id).run();
      }
      await env.maz_db.prepare(
        `INSERT INTO convos (user_id,id,data,updated_at,deleted) VALUES (?1,?2,?3,?4,0)
         ON CONFLICT(user_id,id) DO UPDATE SET data=?3,updated_at=?4,deleted=0 WHERE excluded.updated_at>=convos.updated_at`
      ).bind(user.id, id, data, ts).run();
      return J({ ok: true }, 200, cors);
    }
    if (path === '/sync/convo' && req.method === 'DELETE') {
      if (!user) return J({ error: 'code_required' }, 401, cors);
      const id = String(url.searchParams.get('id') || '').slice(0, 64);
      await env.maz_db.prepare('UPDATE convos SET deleted=1,data=?3,updated_at=?4 WHERE user_id=?1 AND id=?2')
        .bind(user.id, id, '{}', Date.now()).run();   // tombstone : le contenu est purgé, la suppression se propage
      return J({ ok: true }, 200, cors);
    }

    /* USAGE — tokens/coût rapportés par l'app (indicatif) */
    if (path === '/usage' && req.method === 'POST') {
      if (!user) return J({ error: 'code_required' }, 401, cors);
      const b = await req.json().catch(() => ({}));
      const tok = Math.max(0, Math.min(10_000_000, +b.tokens || 0)), cost = Math.max(0, Math.min(1000, +b.cost || 0));
      if (tok) bumpUsage(env, ctx, user.id, 'tokens', tok);
      if (cost) bumpUsage(env, ctx, user.id, 'cost', cost);
      return J({ ok: true }, 200, cors);
    }

    /* ══ L'ATELIER ══════════════════════════════════════════════════════════
       Chantiers, ouvriers, postes, passages, contrôles, livrables.
       Tout est isolé par user_id en requête préparée, et chaque écriture prend
       un numéro au compteur monotone : GET /delta?depuis=<seq> rejoue ensuite
       exactement ce qui a changé, sans rien retélécharger. */
    if (/^\/(atelier|delta|chantiers|ouvriers|postes|passages|controle|livrables)(\/|$|\?)/.test(path)) {
      if (!user) return J({ error: 'code_required' }, 401, cors);
      const corps = ['POST', 'PATCH', 'PUT'].includes(req.method) ? await req.json().catch(() => ({})) : {};
      const seg = path.split('/').filter(Boolean);
      const db = env.maz_db;
      const lire = (t, id) => db.prepare(`SELECT * FROM ${t} WHERE id=?1 AND user_id=?2`).bind(id, user.id).first();
      try {

        /* ── l'accueil, en UNE requête ── */
        if (path === '/atelier' && req.method === 'GET') {
          const r = await db.batch([
            db.prepare(`SELECT p.*, o.nom ouvrier_nom, o.modele, c.nom chantier_nom FROM postes p
                        LEFT JOIN ouvriers o ON o.id=p.ouvrier_id LEFT JOIN chantiers c ON c.id=p.chantier_id
                        WHERE p.user_id=?1 AND p.supprime=0 ORDER BY p.maj_at DESC`).bind(user.id),
            db.prepare(`SELECT id,poste_id,statut,mode,debut_at,fin_at,cout_cents,resume,erreur FROM passages
                        WHERE user_id=?1 AND debut_at>?2 ORDER BY debut_at DESC LIMIT 60`).bind(user.id, Date.now() - 86400000),
            db.prepare(`SELECT * FROM controles WHERE user_id=?1 AND statut='attente' AND perime_at>?2
                        ORDER BY cree_at ASC`).bind(user.id, Date.now()),
            db.prepare(`SELECT COALESCE(SUM(cout_cents),0) c FROM passages WHERE user_id=?1 AND debut_at>?2`)
              .bind(user.id, Date.parse(new Date().toISOString().slice(0, 7) + '-01T00:00:00Z')),
            db.prepare(`SELECT seq FROM compteurs WHERE user_id=?1`).bind(user.id),
          ]);
          return J({
            postes: r[0].results, journee: r[1].results, controles: r[2].results,
            mois_cents: (r[3].results[0] || {}).c || 0, seq: ((r[4].results[0] || {}).seq) || 0,
          }, 200, cors);
        }

        /* ── tout ce qui a changé depuis un curseur ── */
        if (path === '/delta' && req.method === 'GET') {
          const d = parseInt(url.searchParams.get('depuis') || '0', 10) || 0;
          const tables = ['chantiers', 'ouvriers', 'postes', 'passages', 'controles', 'livrables'];
          const r = await db.batch(tables.map(t =>
            db.prepare(`SELECT * FROM ${t} WHERE user_id=?1 AND seq>?2 ORDER BY seq LIMIT 300`).bind(user.id, d)));
          const out = {}; tables.forEach((t, i) => { out[t] = r[i].results; });
          out.seq = ((await db.prepare('SELECT seq FROM compteurs WHERE user_id=?1').bind(user.id).first()) || {}).seq || 0;
          return J(out, 200, cors);
        }

        /* ── chantiers & ouvriers : même moule ── */
        for (const [nom, champs] of [
          ['chantiers', ['nom', 'contexte', 'library_id', 'couleur']],
          ['ouvriers', ['nom', 'metier', 'modele', 'temperature', 'outillage', 'agent_id', 'agent_version']],
        ]) {
          if (seg[0] !== nom) continue;
          if (req.method === 'GET' && seg.length === 1) {
            const rows = await db.prepare(`SELECT * FROM ${nom} WHERE user_id=?1 AND supprime=0 ORDER BY nom`).bind(user.id).all();
            return J(rows.results, 200, cors);
          }
          if (req.method === 'POST' && seg.length === 1) {
            if (!String(corps.nom || '').trim()) return J({ error: 'nom_requis' }, 400, cors);
            if (nom === 'ouvriers' && !A.MI_MODELES.has(String(corps.modele || '')))
              return J({ error: 'modele_refuse', hint: corps.modele }, 400, cors);
            const id = crypto.randomUUID(), t = Date.now(), s = await A.seqNext(env, user.id);
            // On n'insère QUE les champs transmis : lier null sur une colonne
            // NOT NULL DEFAULT '' la ferait échouer au lieu de prendre son défaut.
            const donnes = champs.filter(c => corps[c] !== undefined);
            const vals = donnes.map(c => c === 'outillage' ? JSON.stringify(corps[c] || []) : corps[c]);
            const cols = donnes.length ? ',' + donnes.join(',') : '';
            const ph = donnes.map((_, i) => ',?' + (i + 3)).join('');
            await db.prepare(
              `INSERT INTO ${nom} (id,user_id${cols},cree_at,maj_at,seq)
               VALUES (?1,?2${ph},?${donnes.length + 3},?${donnes.length + 4},?${donnes.length + 5})`
            ).bind(id, user.id, ...vals, t, t, s).run();
            return J(await lire(nom, id), 200, cors);
          }
          if (req.method === 'PATCH' && seg.length === 2) {
            const av = await lire(nom, seg[1]); if (!av) return J({ error: 'introuvable' }, 404, cors);
            if (nom === 'ouvriers' && corps.modele !== undefined && !A.MI_MODELES.has(String(corps.modele)))
              return J({ error: 'modele_refuse', hint: corps.modele }, 400, cors);
            const maj = champs.filter(c => corps[c] !== undefined);
            if (maj.length) {
              const vals = maj.map(c => c === 'outillage' ? JSON.stringify(corps[c] || []) : corps[c]);
              await db.prepare(`UPDATE ${nom} SET ${maj.map((c, i) => `${c}=?${i + 3}`).join(',')},maj_at=?${maj.length + 3},seq=?${maj.length + 4} WHERE id=?1 AND user_id=?2`)
                .bind(seg[1], user.id, ...vals, Date.now(), await A.seqNext(env, user.id)).run();
            }
            return J(await lire(nom, seg[1]), 200, cors);
          }
          if (req.method === 'DELETE' && seg.length === 2) {
            await db.prepare(`UPDATE ${nom} SET supprime=1,maj_at=?3,seq=?4 WHERE id=?1 AND user_id=?2`)
              .bind(seg[1], user.id, Date.now(), await A.seqNext(env, user.id)).run();
            return J({ ok: true }, 200, cors);
          }
        }

        /* ── postes ── */
        if (seg[0] === 'postes') {
          if (req.method === 'GET' && seg.length === 1) {
            const rows = await db.prepare('SELECT * FROM postes WHERE user_id=?1 AND supprime=0 ORDER BY maj_at DESC').bind(user.id).all();
            return J(rows.results, 200, cors);
          }
          if (req.method === 'POST' && seg.length === 1) {
            if (!String(corps.nom || '').trim()) return J({ error: 'nom_requis' }, 400, cors);
            if (!(await lire('ouvriers', String(corps.ouvrier_id || '')))) return J({ error: 'ouvrier_introuvable' }, 400, cors);
            const id = crypto.randomUUID(), t = Date.now();
            const cadence = ['demande', 'cron', 'webhook', 'chaine'].includes(corps.cadence) ? corps.cadence : 'demande';
            const tz = String(corps.tz || 'Europe/Paris');
            const decale = await A.decalageDe(id);
            const prochain = cadence === 'cron' && corps.cron ? A.prochaineCadence(corps.cron, tz, t, decale) : null;
            if (cadence === 'cron' && !prochain) return J({ error: 'cron_invalide', hint: corps.cron }, 400, cors);
            await db.prepare(
              `INSERT INTO postes (id,user_id,chantier_id,ouvrier_id,nom,objectif,consigne_ver,cadence,cron,tz,decale_s,
                 prochain_at,livrable_forme,destinataire,ecriture_auto,budget_cents,etat,cree_at,maj_at,seq)
               VALUES (?1,?2,?3,?4,?5,?6,1,?7,?8,?9,?10,?11,?12,?13,0,?14,'brouillon',?15,?15,?16)`
            ).bind(id, user.id, corps.chantier_id || null, corps.ouvrier_id, String(corps.nom).slice(0, 120),
              String(corps.objectif || ''), cadence, corps.cron || null, tz, decale, prochain,
              String(corps.livrable_forme || 'note'), corps.destinataire || null,
              Number.isFinite(+corps.budget_cents) ? +corps.budget_cents : 300, t, await A.seqNext(env, user.id)).run();
            const b = corps.blocs || {};
            await db.prepare(`INSERT INTO consignes_versions (poste_id,version,blocs,modele,outillage,motif,cree_at)
                              VALUES (?1,1,?2,?3,?4,?5,?6)`)
              .bind(id, JSON.stringify(b), corps.modele || null, JSON.stringify(corps.outillage || []), 'création', t).run();
            return J(await lire('postes', id), 200, cors);
          }
          const p = seg.length >= 2 ? await lire('postes', seg[1]) : null;
          if (seg.length >= 2 && !p) return J({ error: 'introuvable' }, 404, cors);

          /* modifier la consigne CRÉE une version — jamais d'écrasement */
          if (req.method === 'PATCH' && seg.length === 2) {
            const t = Date.now();
            if (corps.blocs) {
              const v = p.consigne_ver + 1;
              await db.prepare(`INSERT INTO consignes_versions (poste_id,version,blocs,modele,outillage,motif,cree_at)
                                VALUES (?1,?2,?3,?4,?5,?6,?7)`)
                .bind(p.id, v, JSON.stringify(corps.blocs), corps.modele || null,
                  JSON.stringify(corps.outillage || []), String(corps.motif || `v${v}`), t).run();
              await db.prepare('UPDATE postes SET consigne_ver=?2 WHERE id=?1').bind(p.id, v).run();
            }
            const champs = ['nom', 'objectif', 'chantier_id', 'ouvrier_id', 'cadence', 'cron', 'tz',
              'livrable_forme', 'destinataire', 'ecriture_auto', 'budget_cents', 'etat'];
            const maj = champs.filter(c => corps[c] !== undefined);
            if (maj.length) {
              await db.prepare(`UPDATE postes SET ${maj.map((c, i) => `${c}=?${i + 3}`).join(',')},maj_at=?${maj.length + 3},seq=?${maj.length + 4} WHERE id=?1 AND user_id=?2`)
                .bind(p.id, user.id, ...maj.map(c => corps[c]), t, await A.seqNext(env, user.id)).run();
            }
            const apres = await lire('postes', p.id);
            if (apres.cadence === 'cron' && apres.cron) {
              const pr = A.prochaineCadence(apres.cron, apres.tz, t, apres.decale_s);
              if (!pr) return J({ error: 'cron_invalide', hint: apres.cron }, 400, cors);
              await db.prepare('UPDATE postes SET prochain_at=?2 WHERE id=?1').bind(p.id, pr).run();
              apres.prochain_at = pr;
            } else if (apres.cadence !== 'cron') {
              await db.prepare('UPDATE postes SET prochain_at=NULL WHERE id=?1').bind(p.id).run();
            }
            return J(apres, 200, cors);
          }
          if (req.method === 'DELETE' && seg.length === 2) {
            await db.prepare('UPDATE postes SET supprime=1,etat=?3,maj_at=?4,seq=?5 WHERE id=?1 AND user_id=?2')
              .bind(p.id, user.id, 'pause', Date.now(), await A.seqNext(env, user.id)).run();
            return J({ ok: true }, 200, cors);
          }

          /* ── LANCER : c'est le « sur le coup ». Un poste sans cadence est un
                poste de plein droit, il attend juste qu'on appuie. ── */
          if (req.method === 'POST' && seg[2] === 'lancer') {
            const mode = corps.mode === 'repetition' ? 'repetition' : 'reel';
            const r = await A.lancer(env, user, p, { mode, entree: corps.entree || null });
            return J(r, 200, cors);
          }
          if (req.method === 'GET' && seg[2] === 'passages') {
            const rows = await db.prepare('SELECT * FROM passages WHERE poste_id=?1 AND user_id=?2 ORDER BY debut_at DESC LIMIT 40')
              .bind(p.id, user.id).all();
            return J(rows.results, 200, cors);
          }
          if (req.method === 'GET' && seg[2] === 'consignes') {
            const rows = await db.prepare('SELECT * FROM consignes_versions WHERE poste_id=?1 ORDER BY version DESC').bind(p.id).all();
            return J(rows.results, 200, cors);
          }
        }

        /* ── passages ── */
        if (seg[0] === 'passages' && seg.length === 2 && req.method === 'GET') {
          const pa = await lire('passages', seg[1]); if (!pa) return J({ error: 'introuvable' }, 404, cors);
          const et = await db.prepare('SELECT * FROM etapes WHERE passage_id=?1 ORDER BY seq').bind(pa.id).all();
          const lv = await db.prepare('SELECT id,titre,forme,cree_at,ouvert_at FROM livrables WHERE passage_id=?1').bind(pa.id).all();
          return J({ ...pa, etapes: et.results, livrables: lv.results }, 200, cors);
        }

        /* ── contrôle : la file unique. Ne rien décider n'exécute jamais rien. ── */
        if (seg[0] === 'controle') {
          if (req.method === 'GET' && seg.length === 1) {
            const rows = await db.prepare(
              `SELECT c.*, p.nom poste_nom FROM controles c LEFT JOIN postes p ON p.id=c.poste_id
               WHERE c.user_id=?1 AND c.statut='attente' AND c.perime_at>?2 ORDER BY c.cree_at`).bind(user.id, Date.now()).all();
            return J(rows.results, 200, cors);
          }
          if (req.method === 'POST' && seg.length === 2) {
            const c = await lire('controles', seg[1]); if (!c) return J({ error: 'introuvable' }, 404, cors);
            if (c.statut !== 'attente') return J({ error: 'deja_decide', statut: c.statut }, 409, cors);
            if (c.perime_at <= Date.now()) {
              await db.prepare('UPDATE controles SET statut=?2 WHERE id=?1').bind(c.id, 'perime').run();
              return J({ error: 'perime' }, 409, cors);
            }
            const d = ['valider', 'refuser', 'corriger'].includes(corps.decision) ? corps.decision : null;
            if (!d) return J({ error: 'decision_invalide' }, 400, cors);
            await db.prepare('UPDATE controles SET statut=?2,correction=?3,decide_at=?4,seq=?5 WHERE id=?1')
              .bind(c.id, d === 'refuser' ? 'refuse' : (d === 'corriger' ? 'corrige' : 'valide'),
                corps.correction ? JSON.stringify(corps.correction) : null, Date.now(), await A.seqNext(env, user.id)).run();
            const r = await A.reprendre(env, user, c, d, corps.correction || null);
            return J(r, 200, cors);
          }
        }

        /* ── livrables : le lire compte, c'est ce qui permet la mise en sommeil ── */
        if (seg[0] === 'livrables' && seg.length === 2 && req.method === 'GET') {
          const l = await lire('livrables', seg[1]); if (!l) return J({ error: 'introuvable' }, 404, cors);
          if (!l.ouvert_at) {
            const t = Date.now();
            ctx.waitUntil(db.batch([
              db.prepare('UPDATE livrables SET ouvert_at=?2 WHERE id=?1').bind(l.id, t),
              db.prepare('UPDATE postes SET lu_le=?2 WHERE id=?1').bind(l.poste_id, t),
            ]).catch(() => {}));
            l.ouvert_at = t;
          }
          return J(l, 200, cors);
        }

        return J({ error: 'not_found' }, 404, cors);
      } catch (e) {
        try { console.warn('[MAZ atelier]', String(e && e.stack || e).slice(0, 400)); } catch (_) {}
        return J({ error: 'atelier_erreur', message: String(e && e.message || e).slice(0, 200) }, e && e.statut || 500, cors);
      }
    }

    /* ══ PROXY API ══ */
    const prefix = Object.keys(UPSTREAMS).find(p => path.startsWith(p));
    if (!prefix) return J({ error: 'not_found' }, 404, cors);
    if (String(env.REQUIRE_CODE) === 'true' && !user) return J({ error: 'code_required' }, 401, cors);

    /* ── Verrous du proxy ────────────────────────────────────────────────────
       Le chemin doit figurer dans la liste blanche, et le modèle demandé aussi.
       Le corps est lu une fois puis réémis : on ne peut pas valider ce qu'on
       laisse filer en flux. */
    const sousChemin = path.slice(prefix.length - 1);
    if (!(CHEMINS_OK[prefix] || []).some(re => re.test(sousChemin)))
      return J({ error: 'chemin_refuse', hint: sousChemin }, 403, cors);

    let corpsBrut = null;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      corpsBrut = await req.text();
      if (corpsBrut.length > 8_000_000) return J({ error: 'corps_trop_gros' }, 413, cors);
      if (corpsBrut) {
        let b = null; try { b = JSON.parse(corpsBrut); } catch (_) {}
        const demande = b && typeof b.model === 'string' ? b.model.replace(/:online$/, '') : null;
        if (demande && !MODELES_OK[prefix].has(demande))
          return J({ error: 'modele_refuse', hint: demande }, 403, cors);
      }
    }

    const key = prefix === '/or/' ? env.OPENROUTER_KEY
              : prefix === '/mi/' ? env.MISTRAL_KEY
              : env.SILICONFLOW_KEY;
    if (!key) return J({ error: 'proxy_unconfigured' }, 500, cors);
    if (user) {
      // plafond quotidien par compte (garde-fou anti-drain si un code fuite) — désactivable via DAILY_REQ_CAP=0
      const cap = parseInt(env.DAILY_REQ_CAP || '5000', 10);
      if (Number.isFinite(cap) && cap > 0) {
        // incrément ATOMIQUE + lecture de la nouvelle valeur (pas de course : une rafale concurrente ne peut plus franchir le cap)
        const row = await env.maz_db.prepare(
          `INSERT INTO usage (user_id,day,requests) VALUES (?1,?2,1)
           ON CONFLICT(user_id,day) DO UPDATE SET requests=requests+1 RETURNING requests`
        ).bind(user.id, today()).first();
        if (row && (row.requests || 0) > cap) return J({ error: 'daily_limit', hint: 'Plafond quotidien atteint — réessaie demain.' }, 429, cors);
      } else {
        bumpUsage(env, ctx, user.id, 'requests', 1);
      }
    }

    const target = UPSTREAMS[prefix] + path.slice(prefix.length - 1) + url.search;
    const h = new Headers(req.headers);
    h.set('Authorization', 'Bearer ' + key);
    h.delete('Host'); h.delete('Origin'); h.delete('Referer'); h.delete('X-Maz-Code'); h.delete('X-Admin-Key');
    if (prefix === '/or/') { h.set('HTTP-Referer', allowed[0] || 'https://mazen-create11.github.io'); h.set('X-Title', 'MAZ'); }
    const init = { method: req.method, headers: h };
    if (corpsBrut !== null) { init.body = corpsBrut; h.delete('Content-Length'); }
    let upstream;
    try { upstream = await fetch(target, init); }
    catch (e) { try { console.warn('[MAZ] upstream fail', String(e).slice(0, 200)); } catch (_) {} return J({ error: 'upstream_fetch_failed' }, 502, cors); }   // détail loggé côté serveur, pas renvoyé au client
    const rh = new Headers(upstream.headers);
    for (const [k, v] of Object.entries(cors)) rh.set(k, v);
    rh.delete('Content-Encoding');
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: rh });
  },

  /* Le battement de l'atelier. Un seul déclencheur planifié pour tous les postes :
     la limite est de cinq PAR COMPTE, pas par service. Voir atelier.js. */
  async scheduled(event, env, ctx) {
    try { await A.battement(env, ctx); }
    catch (e) { try { console.warn('[MAZ battement]', String(e && e.stack || e).slice(0, 300)); } catch (_) {} }
  },
};
