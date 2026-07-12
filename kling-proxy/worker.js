/**
 * MAZ — Proxy signeur JWT Kling (Cloudflare Worker)
 * ------------------------------------------------------------
 * Rôle : signer le JWT Kling (HS256) côté serveur, pour que la CLÉ SECRÈTE
 * ne soit JAMAIS présente dans le navigateur. Le client (mzai-v2.html) appelle
 * ce Worker en POST et reçoit un jeton court (30 min) qu'il utilise pour parler
 * à api.klingai.com. Le secret reste dans les variables du Worker.
 *
 * Secrets à poser (jamais dans le code) :
 *   wrangler secret put KLING_AK   → Access Key Kling
 *   wrangler secret put KLING_SK   → Secret Key Kling
 * Variable publique (wrangler.toml) :
 *   ALLOWED_ORIGINS = "https://mazen-create11.github.io"   (séparés par des virgules)
 */

function b64url(bytesOrObj) {
  let bin;
  if (bytesOrObj instanceof Uint8Array) {
    bin = String.fromCharCode(...bytesOrObj);
  } else {
    bin = String.fromCharCode(...new TextEncoder().encode(JSON.stringify(bytesOrObj)));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function corsHeaders(origin, allowed) {
  const ok = allowed.length === 0 || allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? (origin || allowed[0] || '*') : (allowed[0] || 'null'),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
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
    const cors = corsHeaders(origin, allowed);

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);

    // Anti-abus basique : refuse les origines hors liste (stoppe les autres sites ;
    // ne remplace pas une vraie auth utilisateur — voir README pour le durcissement).
    if (allowed.length && origin && !allowed.includes(origin)) {
      return json({ error: 'origin_forbidden' }, 403, cors);
    }

    const ak = env.KLING_AK, sk = env.KLING_SK;
    if (!ak || !sk) return json({ error: 'proxy_unconfigured' }, 500, cors);

    const now = Math.floor(Date.now() / 1000);
    const exp = now + 1800; // 30 min
    const data = b64url({ alg: 'HS256', typ: 'JWT' }) + '.' + b64url({ iss: ak, exp, nbf: now - 5 });
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(sk), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)));
    const token = data + '.' + b64url(sig);

    return json({ token, exp }, 200, cors);
  },
};
