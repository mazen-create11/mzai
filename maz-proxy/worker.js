/**
 * MAZ — Proxy API (Cloudflare Worker)
 * ------------------------------------------------------------
 * Rôle : détenir les clés OpenRouter + SiliconFlow CÔTÉ SERVEUR et relayer
 * les appels, pour que l'app hébergée (mzai-v2.html sur GitHub Pages) marche
 * pour n'importe qui SANS jamais exposer les clés dans le navigateur.
 *
 * Le client appelle :
 *   <worker>/or/api/v1/chat/completions   → relayé vers openrouter.ai (streaming SSE ok)
 *   <worker>/sf/v1/images/generations     → relayé vers api.siliconflow.com
 *   <worker>/sf/v1/audio/speech, /video/submit, /video/status, /chat/completions, /audio/transcriptions …
 * Le Worker injecte l'en-tête Authorization à partir de ses secrets. La clé
 * ne transite jamais par le client.
 *
 * Secrets (jamais dans le code) :
 *   npx wrangler secret put OPENROUTER_KEY     → sk-or-v1-…
 *   npx wrangler secret put SILICONFLOW_KEY    → sk-…
 * Variable publique (wrangler.toml) :
 *   ALLOWED_ORIGINS = "https://mazen-create11.github.io"   (séparées par des virgules)
 *
 * ⚠️ Anti-abus : seules les origines listées sont acceptées (bloque les autres sites
 * web). Ça ne remplace pas une vraie auth par utilisateur — c'est un proxy « de confiance »
 * pour des collègues. Mazen assume le coût des appels. Pour durcir : ajouter un code
 * d'accès partagé (en-tête X-Maz-Pass comparé à un secret) — voir README.
 */

const UPSTREAMS = {
  '/or/': 'https://openrouter.ai',
  '/sf/': 'https://api.siliconflow.com',
};

function corsHeaders(req, allowed) {
  const origin = req.headers.get('Origin') || '';
  const ok = allowed.length === 0 || (origin && allowed.includes(origin));
  // reflète les en-têtes demandés au préflight (l'app envoie HTTP-Referer, X-Title, Authorization…)
  const reqH = req.headers.get('Access-Control-Request-Headers');
  return {
    'Access-Control-Allow-Origin': ok ? origin : (allowed[0] || 'null'),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': reqH || 'Content-Type, Authorization, HTTP-Referer, X-Title, X-Maz-Pass',
    'Access-Control-Max-Age': '600',
    'Vary': 'Origin',
  };
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const cors = corsHeaders(req, allowed);

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    // Anti-abus : refuse les origines hors liste (laisse passer les requêtes sans Origin,
    // ex. tests serveur — resserre en retirant `!origin` si tu veux bloquer aussi celles-là).
    if (allowed.length && origin && !allowed.includes(origin)) {
      return json({ error: 'origin_forbidden' }, 403, cors);
    }
    // Durcissement optionnel : décommenter pour exiger un code d'accès partagé
    // if (env.MAZ_PASS && req.headers.get('X-Maz-Pass') !== env.MAZ_PASS) return json({ error: 'forbidden' }, 403, cors);

    const url = new URL(req.url);

    // /fetch?url=… : rapatrie un média généré (URL de livraison signée qui expire) côté serveur
    // → contourne le CORS des CDN, l'app stocke le blob en IndexedDB pour qu'il survive. Hôtes whitelistés (anti-SSRF).
    if (url.pathname === '/fetch') {
      const target = url.searchParams.get('url') || '';
      let hu; try { hu = new URL(target); } catch { return json({ error: 'bad_url' }, 400, cors); }
      const OK_HOSTS = /(^|\.)(bfl\.ai|aliyuncs\.com|siliconflow\.com|klingai\.com|kling\.ai)$/i;
      if (hu.protocol !== 'https:' || !OK_HOSTS.test(hu.hostname)) return json({ error: 'host_not_allowed' }, 403, cors);
      let up; try { up = await fetch(target); } catch (e) { return json({ error: 'fetch_failed', detail: String(e).slice(0, 120) }, 502, cors); }
      const rh = new Headers(); for (const [k, v] of Object.entries(cors)) rh.set(k, v);
      rh.set('Content-Type', up.headers.get('Content-Type') || 'application/octet-stream');
      rh.set('Cache-Control', 'no-store');
      return new Response(up.body, { status: up.status, headers: rh });
    }

    const prefix = Object.keys(UPSTREAMS).find(p => url.pathname.startsWith(p));
    if (!prefix) return json({ error: 'not_found', hint: 'use /or/… , /sf/… or /fetch' }, 404, cors);

    const key = prefix === '/or/' ? env.OPENROUTER_KEY : env.SILICONFLOW_KEY;
    if (!key) return json({ error: 'proxy_unconfigured', provider: prefix }, 500, cors);

    const target = UPSTREAMS[prefix] + url.pathname.slice(prefix.length - 1) + url.search;

    // recopie les en-têtes du client, force l'Authorization avec le secret
    const h = new Headers(req.headers);
    h.set('Authorization', 'Bearer ' + key);
    h.delete('Host'); h.delete('Origin'); h.delete('Referer'); h.delete('X-Maz-Pass');
    if (prefix === '/or/') { h.set('HTTP-Referer', allowed[0] || 'https://mazen-create11.github.io'); h.set('X-Title', 'MAZ'); }

    const init = { method: req.method, headers: h };
    if (req.method !== 'GET' && req.method !== 'HEAD') { init.body = req.body; init.duplex = 'half'; }

    let upstream;
    try {
      upstream = await fetch(target, init);
    } catch (e) {
      return json({ error: 'upstream_fetch_failed', detail: String(e).slice(0, 200) }, 502, cors);
    }

    // renvoie le corps (streamé pour le SSE) + CORS
    const rh = new Headers(upstream.headers);
    for (const [k, v] of Object.entries(cors)) rh.set(k, v);
    rh.delete('Content-Encoding'); // évite un double-décodage côté navigateur sur les flux
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: rh });
  },
};
