// L'écran des agents : ce qu'il montre, et la promesse centrale du produit,
// à savoir qu'une écriture attend un accord avant de partir.
// Le faux serveur tient un petit état : des postes, et les contrôles en attente.
import test from 'node:test';
import assert from 'node:assert/strict';
import { monde } from './monde.mjs';

const T = Date.now();
const poste = (id, extra) => ({
  id, user_id: 'u1', chantier_id: null, ouvrier_id: 'o1', nom: 'Poste ' + id, objectif: 'Résumer la veille du jour', consigne_ver: 1,
  cadence: 'demande', cron: null, tz: 'Europe/Paris', decale_s: 0, prochain_at: null, cle_webhook: null, livrable_forme: 'note',
  destinataire: null, ecriture_auto: 0, budget_cents: 300, depense_cents: 12, depense_mois: '2026-11', etat: 'actif', sante: 'OO',
  lu_le: null, cree_at: T - 9e6, maj_at: T - 1e5, seq: 3, supprime: 0, ouvrier_nom: 'Veilleur', modele: 'mistral-medium-latest', chantier_nom: null, ...extra,
});
const controle = (id) => ({
  id, user_id: 'u1', passage_id: 'pa-' + id, poste_id: 'veille', outil: 'classer_livrable', tool_call_id: 'tc-' + id,
  intention: JSON.stringify({ titre: 'Veille du 12/11', corps: 'Trois nouveautés.' }), resume: 'Classer le livrable « Veille du 12/11 »',
  pourquoi: 'Toute écriture passe au contrôle', statut: 'attente', correction: null, perime_at: T + 86400e3, cree_at: T - 30e3, decide_at: null, seq: 5,
});

/** Un atelier de deux postes, et le faux serveur qui va avec. */
async function atelier(t, { controles = [] } = {}) {
  const base = {
    postes: [poste('veille', { nom: 'Veille du matin', cadence: 'cron', cron: '0 8 * * *', prochain_at: T + 3600e3 }), poste('brouillon', { nom: 'Idée en cours', etat: 'brouillon', sante: '' })],
    journee: [], controles: [...controles], mois_cents: 12, seq: 5,
  };
  const m = await monde({ connecte: true, routes: ({ method, chemin, corps }) => {
    if (chemin === '/atelier') return { json: base };
    if (chemin === '/ouvriers') return { json: [{ id: 'o1', nom: 'Veilleur', metier: 'veille', modele: 'mistral-medium-latest' }] };
    if (chemin === '/chantiers') return { json: [] };
    if (method === 'POST' && chemin === '/postes/veille/lancer') {   // le vrai serveur s'arrête avant d'écrire
      base.controles.push(controle('k' + (base.controles.length + 1)));
      return { json: { statut: 'attente', passage_id: 'pa-k1' } };
    }
    const decision = /^\/controle\/(.+)$/.exec(chemin);
    if (method === 'POST' && decision) {
      base.controles = base.controles.filter((c) => c.id !== decision[1]);
      return { json: { ok: true, statut: corps.decision === 'valider' ? 'fini' : 'coupe' } };
    }
  } });
  t.after(m.fin);
  await m.page.waitForFunction(() => /Bienvenue/.test(document.querySelector('#toast .tm').textContent));
  await m.page.click('.nav-item[data-view="atelier"]');
  await m.page.waitForSelector('#view-atelier [data-poste="veille"]');
  return { m, page: m.page, base, versAtelier: () => m.appels.filter((a) => /^\/(postes|controle)\b/.test(a.chemin) && a.method !== 'GET') };
}

test('l’écran des agents montre les postes du compte, leur cadence et la dépense du mois', async (t) => {
  const { m, page } = await atelier(t, { controles: [controle('k1')] });
  const texte = await page.innerText('#view-atelier');
  assert.match(texte, /2 agents · 0,12 € ce mois/);
  assert.match(texte, /Veille du matin/);
  assert.match(texte, /chaque jour à 8h/, 'la cadence est dite en clair, pas en cron');
  assert.match(texte, /1 attend ton accord/);
  assert.match(texte, /BROUILLONS · 1/i);
  assert.equal((await page.textContent('#atNavN')).trim(), '1', 'le menu signale le contrôle en attente');
  for (const chemin of ['/atelier', '/ouvriers', '/chantiers']) assert.ok(m.appels.some((a) => a.chemin === chemin && a.code), chemin + ' doit partir avec le code');
  assert.deepEqual(m.erreurs, []);
});

test('lancer un agent : il s’arrête avant d’écrire, et rien ne part sans « Valider »', async (t) => {
  const { m, page, versAtelier } = await atelier(t);
  await page.click('#view-atelier [data-lancer="veille"]');
  const carte = page.locator('#atCtrlBody .at-ctrl');
  await carte.waitFor();
  assert.deepEqual(versAtelier().map((a) => [a.method, a.chemin, a.corps]), [['POST', '/postes/veille/lancer', { mode: 'reel' }]]);
  assert.match(await carte.innerText(), /Classer le livrable « Veille du 12\/11 »/);
  assert.equal(await carte.locator('[data-d]').count(), 2, 'deux choix : refuser ou valider');

  await carte.locator('[data-d="valider"]').click();
  await page.waitForFunction(() => !document.querySelector('#atCtrlBody .at-ctrl'));
  assert.deepEqual(versAtelier().at(-1).corps, { decision: 'valider' });
  assert.equal(versAtelier().at(-1).chemin, '/controle/k1');
  await page.waitForFunction(() => /Validé/.test(document.querySelector('#toast .tm').textContent));
  assert.deepEqual(m.erreurs, []);
});

test('refuser un contrôle transmet le refus, et seulement lui', async (t) => {
  const { m, page, versAtelier } = await atelier(t);
  await page.click('#view-atelier [data-lancer="veille"]');
  const carte = page.locator('#atCtrlBody .at-ctrl');
  await carte.waitFor();
  await carte.locator('[data-d="refuser"]').click();
  await page.waitForFunction(() => /Refusé/.test(document.querySelector('#toast .tm').textContent));
  assert.deepEqual(versAtelier().map((a) => [a.chemin, a.corps]), [['/postes/veille/lancer', { mode: 'reel' }], ['/controle/k1', { decision: 'refuser' }]]);
  assert.deepEqual(m.erreurs, []);
});

test('si le serveur des agents ne répond pas, l’écran le dit sans casser l’app', async (t) => {
  const m = await monde({ connecte: true, routes: ({ chemin }) => (/^\/(atelier|ouvriers|chantiers)$/.test(chemin) ? { status: 503, json: { error: 'indisponible' } } : undefined) });
  t.after(m.fin);
  const { page } = m;
  await page.waitForFunction(() => /Bienvenue/.test(document.querySelector('#toast .tm').textContent));
  await page.click('.nav-item[data-view="atelier"]');
  await page.waitForFunction(() => /Connexion perdue/.test(document.querySelector('#view-atelier').innerText));
  assert.equal(await page.locator('#view-atelier [data-poste]').count(), 0);
  // le reste de l'app répond toujours
  await page.click('#newChat');
  assert.ok(await page.isVisible('#prompt'));
  assert.deepEqual(m.erreurs, []);
});
