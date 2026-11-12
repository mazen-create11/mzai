// Le relais vers les fournisseurs : ce qu'il laisse passer, et avec quelle clé.
// Le fournisseur est remplacé par un faux `fetch` qui note ce qu'il reçoit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker from '../worker.js';

const BASE = 'https://maz.test';
const CODE = 'maz-TEST-TEST-TEST-TEST';
const OK_OR = 'deepseek/deepseek-v4-flash';

async function sha256hex(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function monde(vars = {}) {
  const hash = await sha256hex(CODE);
  let requetesDuJour = 0;
  const maz_db = {
    prepare: (sql) => ({
      bind: (...a) => ({
        async first() {
          if (/FROM users WHERE code_hash=\?1/.test(sql)) return a[0] === hash ? { id: 'u1', name: 'Nadia', team: null, disabled: 0, is_admin: 0 } : null;
          if (/INSERT INTO usage/.test(sql)) return { requests: ++requetesDuJour };
          throw new Error('requête non prévue par le test : ' + sql);
        },
        async run() { return { success: true }; },
      }),
    }),
  };
  const env = { maz_db, OPENROUTER_KEY: 'cle-serveur-openrouter', SILICONFLOW_KEY: 'cle-serveur-siliconflow', MISTRAL_KEY: 'cle-serveur-mistral', REQUIRE_CODE: 'true', ALLOWED_ORIGINS: '', ...vars };
  const sorties = [];
  const vraiFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    sorties.push({ url: String(url), method: init.method, headers: new Headers(init.headers), body: init.body });
    return new Response(JSON.stringify({ relaye: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const appel = async (chemin, { method = 'POST', code = CODE, headers = {}, corps, brut } = {}) => {
    const h = { ...(code ? { 'X-Maz-Code': code } : {}), ...headers };
    let body;
    if (brut !== undefined) body = brut;
    else if (corps !== undefined) { body = JSON.stringify(corps); h['Content-Type'] = 'application/json'; }
    const rep = await worker.fetch(new Request(BASE + chemin, { method, headers: h, body: method === 'GET' ? undefined : body }), env, { waitUntil() {} });
    return { status: rep.status, json: await rep.json().catch(() => null) };
  };
  return { appel, sorties, fin: () => { globalThis.fetch = vraiFetch; } };
}

const chat = (extra = {}) => ({ model: OK_OR, messages: [{ role: 'user', content: 'bonjour' }], ...extra });

test('sans code valide, rien ne part chez le fournisseur', async (t) => {
  const m = await monde(); t.after(m.fin);
  assert.equal((await m.appel('/or/api/v1/chat/completions', { code: null, corps: chat() })).json.error, 'code_required');
  assert.equal((await m.appel('/or/api/v1/chat/completions', { code: 'maz-FAUX-FAUX-FAUX-FAUX', corps: chat() })).status, 401);
  assert.equal(m.sorties.length, 0);
});

test('une requête valide part avec la clé du serveur, jamais avec ce que le navigateur a envoyé', async (t) => {
  const m = await monde(); t.after(m.fin);
  const r = await m.appel('/or/api/v1/chat/completions', { corps: chat(), headers: { Authorization: 'Bearer cle-du-navigateur', 'X-Admin-Key': 'tentative' } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { relaye: true });
  assert.equal(m.sorties.length, 1);
  const s = m.sorties[0];
  assert.equal(s.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(s.method, 'POST');
  assert.equal(s.headers.get('Authorization'), 'Bearer cle-serveur-openrouter');
  assert.equal(s.headers.get('X-Maz-Code'), null, 'le code personnel ne doit pas sortir');
  assert.equal(s.headers.get('X-Admin-Key'), null);
  assert.deepEqual(JSON.parse(s.body), chat());
});

test('Mistral n’est pas relayé : aucune route /mi/ pour le navigateur', async (t) => {
  const m = await monde(); t.after(m.fin);
  for (const [method, chemin] of [['GET', '/mi/v1/conversations'], ['GET', '/mi/v1/conversations/conv_123/history'], ['DELETE', '/mi/v1/conversations/conv_123'], ['GET', '/mi/v1/agents'], ['POST', '/mi/v1/chat/completions']]) {
    const r = await m.appel(chemin, { method, corps: method === 'POST' ? { model: 'mistral-large-latest', messages: [] } : undefined });
    assert.equal(r.status, 404, `${method} ${chemin}`);
  }
  assert.equal(m.sorties.length, 0);
});

test('un chemin hors liste est refusé, même avec un code valide', async (t) => {
  const m = await monde(); t.after(m.fin);
  for (const chemin of ['/or/api/v1/credits', '/or/api/v1/models', '/or/api/v1/chat/completions/../credits', '/sf/v1/user/info', '/sf/v1/files']) {
    const r = await m.appel(chemin, { corps: chat() });
    assert.equal(r.status, 403, chemin);
    assert.equal(r.json.error, 'chemin_refuse');
  }
  assert.equal(m.sorties.length, 0);
});

test('seul POST est relayé', async (t) => {
  const m = await monde(); t.after(m.fin);
  for (const method of ['GET', 'DELETE', 'PUT', 'PATCH']) {
    const r = await m.appel('/or/api/v1/chat/completions', { method, corps: method === 'GET' ? undefined : chat() });
    assert.equal(r.status, 405, method);
  }
  assert.equal(m.sorties.length, 0);
});

test('le modèle doit être dans la liste, et il n’y a pas de porte dérobée', async (t) => {
  const m = await monde(); t.after(m.fin);
  const refus = async (corps, attendu = 'modele_refuse') => {
    const r = await m.appel('/or/api/v1/chat/completions', corps);
    assert.equal(r.json.error, attendu, JSON.stringify(corps).slice(0, 80));
  };
  await refus({ corps: chat({ model: 'openai/gpt-5-pro' }) });
  await refus({ corps: chat({ model: undefined }) });
  await refus({ corps: chat({ model: ['openai/gpt-5-pro'] }) });
  await refus({ corps: chat({ models: ['openai/gpt-5-pro'] }) });
  await refus({ corps: chat({ fallbacks: ['openai/gpt-5-pro'] }) });
  await refus({ corps: chat({ route: 'fallback' }) });
  await refus({ brut: 'model=openai/gpt-5-pro', headers: { 'Content-Type': 'text/plain' } }, 'corps_invalide');
  await refus({ brut: '["openai/gpt-5-pro"]', headers: { 'Content-Type': 'application/json' } }, 'corps_invalide');
  assert.equal(m.sorties.length, 0);
});

test('le suffixe de recherche web « :online » ne change pas le contrôle du modèle', async (t) => {
  const m = await monde(); t.after(m.fin);
  assert.equal((await m.appel('/or/api/v1/chat/completions', { corps: chat({ model: OK_OR + ':online' }) })).status, 200);
  assert.equal((await m.appel('/or/api/v1/chat/completions', { corps: chat({ model: 'openai/gpt-5-pro:online' }) })).status, 403);
});

test('transcription audio : le modèle est lu dans l’envoi multipart, le fichier passe intact', async (t) => {
  const m = await monde(); t.after(m.fin);
  const son = new Uint8Array([0, 255, 128, 13, 10, 200, 201, 0, 7]);   // des octets qu'une lecture en texte abîmerait
  const envoi = (modele) => {
    const fd = new FormData();
    fd.append('model', modele);
    fd.append('file', new Blob([son], { type: 'audio/wav' }), 'memo.wav');
    return new Request(BASE + '/sf/v1/audio/transcriptions', { method: 'POST', headers: { 'X-Maz-Code': CODE }, body: fd });
  };
  const env = { OPENROUTER_KEY: 'a', SILICONFLOW_KEY: 'cle-serveur-siliconflow', REQUIRE_CODE: 'true', ALLOWED_ORIGINS: '' };
  // même faux monde, mais on passe par worker.fetch directement pour garder le multipart natif
  const hash = await sha256hex(CODE);
  env.maz_db = { prepare: (sql) => ({ bind: (...a) => ({ async first() { return /FROM users/.test(sql) ? (a[0] === hash ? { id: 'u1', disabled: 0, is_admin: 0 } : null) : { requests: 1 }; }, async run() { return {}; } }) }) };

  const refus = await worker.fetch(envoi('openai/whisper-large'), env, { waitUntil() {} });
  assert.equal(refus.status, 403);
  assert.equal(m.sorties.length, 0);

  const ok = await worker.fetch(envoi('FunAudioLLM/SenseVoiceSmall'), env, { waitUntil() {} });
  assert.equal(ok.status, 200);
  const s = m.sorties[0];
  assert.equal(s.url, 'https://api.siliconflow.com/v1/audio/transcriptions');
  assert.equal(s.headers.get('Authorization'), 'Bearer cle-serveur-siliconflow');
  assert.match(s.headers.get('Content-Type'), /^multipart\/form-data; boundary=/);
  const recu = new Uint8Array(s.body);
  const motif = Array.from(son).join(',');
  assert.ok(Array.from(recu).join(',').includes(motif), 'les octets du fichier doivent arriver inchangés');
});

test('le suivi d’une vidéo passe sans modèle, mais pas avec un modèle interdit', async (t) => {
  const m = await monde(); t.after(m.fin);
  assert.equal((await m.appel('/sf/v1/video/status', { corps: { requestId: 'abc' } })).status, 200);
  assert.equal((await m.appel('/sf/v1/video/status', { corps: { requestId: 'abc', model: 'autre/modele' } })).status, 403);
  assert.equal((await m.appel('/sf/v1/video/submit', { corps: { prompt: 'sans modèle' } })).status, 403);
});

test('le plafond quotidien coupe le relais', async (t) => {
  const m = await monde({ DAILY_REQ_CAP: '2' }); t.after(m.fin);
  assert.equal((await m.appel('/or/api/v1/chat/completions', { corps: chat() })).status, 200);
  assert.equal((await m.appel('/or/api/v1/chat/completions', { corps: chat() })).status, 200);
  const r = await m.appel('/or/api/v1/chat/completions', { corps: chat() });
  assert.equal(r.status, 429);
  assert.equal(r.json.error, 'daily_limit');
  assert.equal(m.sorties.length, 2);
});

test('l’application et le serveur s’accordent : chaque modèle que l’app envoie est accepté', async (t) => {
  const m = await monde(); t.after(m.fin);
  const app = readFileSync(new URL('../../mzai-v2.html', import.meta.url), 'utf8');
  const declares = [...app.matchAll(/provider:'(openrouter|siliconflow)',api:'([^']+)'/g)].map((x) => [x[1], x[2]]);
  const directs = [...app.matchAll(/model:'([A-Za-z0-9-]+\/[A-Za-z0-9._-]+)'/g)].map((x) => [/^(deepseek|qwen|moonshotai|z-ai|minimax)\//.test(x[1]) ? 'openrouter' : 'siliconflow', x[1]]);
  assert.ok(declares.length >= 10, 'la liste des modèles de l’app n’a pas été trouvée');
  for (const [fournisseur, modele] of [...declares, ...directs]) {
    const chemin = fournisseur === 'openrouter' ? '/or/api/v1/chat/completions' : '/sf/v1/chat/completions';
    const r = await m.appel(chemin, { corps: { model: modele, messages: [] } });
    assert.equal(r.status, 200, `${modele} est envoyé par l’app mais refusé par le serveur`);
  }
});
