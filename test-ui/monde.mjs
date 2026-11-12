// Le décor des tests d'interface : l'app servie telle qu'elle est en ligne,
// dans un vrai navigateur, avec un faux serveur à la place du Worker.
// Rien ne sort : toute requête hors du dossier servi est interceptée, et
// `keys.local.js` n'est jamais servi (l'app se comporte donc comme hébergée).
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RACINE = fileURLToPath(new URL('..', import.meta.url));
const WORKER = 'https://maz-proxy.maz-chaban.workers.dev';
export const CODE = 'maz-TEST-TEST-TEST-TEST';
export const REPONSE = 'Bonjour Nadia, réponse de test.';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
// Ce que GitHub Pages publie : les fichiers suivis par git, donc jamais les clés locales.
const INTERDITS = /(^|\/)(keys\.local\.js|\.git|\.dev\.vars|maz-proxy|kling-proxy|node_modules|test-ui)(\/|$)/;

function servir() {
  const serveur = http.createServer(async (req, res) => {
    const chemin = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html');
    const fichier = normalize(join(RACINE, chemin));
    if (!fichier.startsWith(RACINE.endsWith(sep) ? RACINE : RACINE + sep) || INTERDITS.test(chemin) || !TYPES[extname(fichier)]) { res.writeHead(404).end(); return; }
    try { res.writeHead(200, { 'Content-Type': TYPES[extname(fichier)], 'Cache-Control': 'no-store' }).end(await readFile(fichier)); }
    catch { res.writeHead(404).end(); }
  });
  return new Promise((ok) => serveur.listen(0, '127.0.0.1', () => ok(serveur)));
}

/** Le faux Worker : il note chaque appel et répond ce que le vrai répondrait. */
async function fauxWorker(route, appels, etat) {
  const req = route.request();
  const url = new URL(req.url());
  let corps = null;
  try { corps = req.postDataJSON(); } catch { /* pas du JSON */ }
  appels.push({ method: req.method(), chemin: url.pathname, code: req.headers()['x-maz-code'] || null, corps });
  const json = (status, objet) => route.fulfill({ status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(objet) });
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' } });
  if (url.pathname === '/auth/verify') return corps && corps.code === CODE ? json(200, { ok: true, uid: 'u1', name: 'Nadia', admin: false }) : json(401, { ok: false });
  if (req.headers()['x-maz-code'] !== CODE) return json(401, { error: 'code_required' });
  // les réponses propres à un test passent avant les réponses par défaut
  if (etat.routes) {
    const propre = await etat.routes({ method: req.method(), chemin: url.pathname, corps });
    if (propre !== undefined) return json(propre.status || 200, propre.json);
  }
  if (url.pathname === '/sync/convos') return json(200, etat.convos);
  if (/\/chat\/completions$/.test(url.pathname)) {
    if (corps && corps.stream) {
      const morceaux = REPONSE.match(/.{1,9}/g).map((t) => `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`);
      return route.fulfill({ status: 200, contentType: 'text/event-stream', headers: { 'Access-Control-Allow-Origin': '*' }, body: morceaux.join('') + `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { total_tokens: 12, cost: 0 } })}\n\ndata: [DONE]\n\n` });
    }
    return json(200, { choices: [{ message: { role: 'assistant', content: REPONSE }, finish_reason: 'stop' }], usage: { total_tokens: 12, cost: 0 } });
  }
  return json(200, { ok: true });
}

/**
 * Ouvre l'app dans un navigateur neuf.
 * `connecte` : le code est déjà enregistré sur l'appareil, et la prise en main déjà vue.
 * `routes` : ce que le faux Worker répond pour ce test, `({ method, chemin, corps }) => ({ status?, json })`,
 *            ou rien pour laisser la réponse par défaut.
 */
export async function monde({ connecte = false, convos = [], routes = null } = {}) {
  const serveur = await servir();
  const origine = `http://127.0.0.1:${serveur.address().port}`;
  const navigateur = await chromium.launch();
  const contexte = await navigateur.newContext({ viewport: { width: 1280, height: 800 }, locale: 'fr-FR' });
  const appels = [], erreurs = [], etat = { convos, routes };
  await contexte.route((u) => u.origin !== origine, (route) => {
    const u = new URL(route.request().url());
    if (u.origin === WORKER) return fauxWorker(route, appels, etat);
    // polices, bibliothèques distantes : l'app doit tenir sans elles
    return route.abort();
  });
  if (connecte) await contexte.addInitScript((code) => {
    try { localStorage.setItem('mzai:acode', code); localStorage.setItem('mzai:onboarded', 'true'); } catch { /* stockage fermé */ }
  }, CODE);
  const page = await contexte.newPage();
  page.on('pageerror', (e) => erreurs.push('exception : ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR_/.test(m.text())) erreurs.push('console : ' + m.text()); });
  await page.goto(origine + '/mzai-v2.html', { waitUntil: 'load' });
  return {
    page, appels, erreurs, origine, etat,
    /** Les appels au relais de discussion, dans l'ordre. */
    discussions: () => appels.filter((a) => /\/chat\/completions$/.test(a.chemin)),
    fin: async () => { await navigateur.close(); await new Promise((ok) => serveur.close(ok)); },
  };
}
