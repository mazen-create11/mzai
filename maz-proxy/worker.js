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

const UPSTREAMS = { '/or/': 'https://openrouter.ai', '/sf/': 'https://api.siliconflow.com' };
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
      const byKey = env.ADMIN_KEY && req.headers.get('X-Admin-Key') === env.ADMIN_KEY;
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
      return new Response(value, { status: 200, headers: { ...cors, 'Content-Type': (metadata && metadata.ct) || 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000, immutable' } });
    }
    if (path === '/media/stash' && req.method === 'POST') {
      if (!user) return J({ error: 'code_required' }, 401, cors);
      const b = await req.json().catch(() => ({}));
      let hu; try { hu = new URL(String(b.url || '')); } catch { return J({ error: 'bad_url' }, 400, cors); }
      if (hu.protocol !== 'https:' || !MEDIA_HOSTS.test(hu.hostname)) return J({ error: 'host_not_allowed' }, 403, cors);
      let up; try { up = await fetch(hu.href); } catch { return J({ error: 'fetch_failed' }, 502, cors); }
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

    /* ══ PROXY API ══ */
    const prefix = Object.keys(UPSTREAMS).find(p => path.startsWith(p));
    if (!prefix) return J({ error: 'not_found' }, 404, cors);
    if (String(env.REQUIRE_CODE) === 'true' && !user) return J({ error: 'code_required' }, 401, cors);
    const key = prefix === '/or/' ? env.OPENROUTER_KEY : env.SILICONFLOW_KEY;
    if (!key) return J({ error: 'proxy_unconfigured' }, 500, cors);
    if (user) bumpUsage(env, ctx, user.id, 'requests', 1);

    const target = UPSTREAMS[prefix] + path.slice(prefix.length - 1) + url.search;
    const h = new Headers(req.headers);
    h.set('Authorization', 'Bearer ' + key);
    h.delete('Host'); h.delete('Origin'); h.delete('Referer'); h.delete('X-Maz-Code'); h.delete('X-Admin-Key');
    if (prefix === '/or/') { h.set('HTTP-Referer', allowed[0] || 'https://mazen-create11.github.io'); h.set('X-Title', 'MAZ'); }
    const init = { method: req.method, headers: h };
    if (req.method !== 'GET' && req.method !== 'HEAD') { init.body = req.body; init.duplex = 'half'; }
    let upstream;
    try { upstream = await fetch(target, init); }
    catch (e) { return J({ error: 'upstream_fetch_failed', detail: String(e).slice(0, 160) }, 502, cors); }
    const rh = new Headers(upstream.headers);
    for (const [k, v] of Object.entries(cors)) rh.set(k, v);
    rh.delete('Content-Encoding');
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: rh });
  },
};
