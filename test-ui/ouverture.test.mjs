// Ouvrir l'app : la porte d'accès, puis l'app elle-même.
import test from 'node:test';
import assert from 'node:assert/strict';
import { monde, CODE } from './monde.mjs';

test('sans code, la porte s’affiche ; un faux code est refusé, le bon ouvre l’app', async (t) => {
  const m = await monde(); t.after(m.fin);
  const { page } = m;
  await page.waitForSelector('#mazGate');
  assert.equal(m.appels.length, 0, 'rien ne part tant qu’aucun code n’est saisi');

  await page.fill('#gateIn', 'maz-FAUX-FAUX-FAUX-FAUX');
  await page.click('#gateGo');
  await page.waitForFunction(() => document.querySelector('#gateErr').textContent.length > 0);
  assert.match(await page.textContent('#gateErr'), /Code non reconnu/);
  assert.equal(await page.evaluate(() => localStorage.getItem('mzai:acode')), null, 'un code refusé n’est pas gardé');

  await page.fill('#gateIn', CODE);
  await page.keyboard.press('Enter');
  await page.waitForSelector('#mazGate', { state: 'detached' });
  await page.waitForFunction(() => /Bienvenue, Nadia/.test(document.querySelector('#toast .tm').textContent));
  assert.equal(await page.evaluate(() => localStorage.getItem('mzai:acode')), CODE);
  await page.waitForFunction(() => document.querySelector('#navName').textContent.includes('Nadia'));

  // une fois entré, la synchro part, avec le code en en-tête
  await page.waitForFunction(() => true);
  const synchro = await attendre(() => m.appels.find((a) => a.chemin === '/sync/convos'));
  assert.equal(synchro.code, CODE);
  assert.deepEqual(m.erreurs, []);
});

test('avec un code déjà enregistré, l’app s’ouvre sans porte et propose ses modèles', async (t) => {
  const m = await monde({ connecte: true }); t.after(m.fin);
  const { page } = m;
  await page.waitForFunction(() => /Bienvenue, Nadia/.test(document.querySelector('#toast .tm').textContent));
  assert.equal(await page.locator('#mazGate').count(), 0);
  assert.equal(await page.textContent('.model-pill .lbl'), 'MAZ Auto');
  assert.ok(await page.isVisible('#prompt'));
  const modeles = await page.evaluate(() => [...document.querySelectorAll('#popModel .pi')].map((p) => ({ id: p.dataset.model, sansCle: p.classList.contains('nokey') })));
  assert.ok(modeles.length >= 10, 'le sélecteur de modèles est vide');
  assert.deepEqual(modeles.filter((x) => x.sansCle), [], 'en ligne, aucun modèle ne doit réclamer une clé');
  assert.deepEqual(m.erreurs, []);
});

test('un code révoqué entre-temps ramène à la porte', async (t) => {
  const m = await monde(); t.after(m.fin);
  const { page } = m;
  await page.evaluate(() => { localStorage.setItem('mzai:acode', 'maz-ANCI-ENCO-DERE-VOQU'); });
  await page.reload();
  await page.waitForSelector('#mazGate');
  assert.equal(await page.evaluate(() => localStorage.getItem('mzai:acode')), null);
  assert.deepEqual(m.erreurs, []);
});

test('la racine du site mène à l’app, et les clés locales ne sont jamais servies', async (t) => {
  const m = await monde({ connecte: true }); t.after(m.fin);
  const { page } = m;
  await page.goto(m.origine + '/');
  await page.waitForURL(/\/mzai-v2\.html$/);
  assert.equal((await page.request.get(m.origine + '/keys.local.js')).status(), 404);
  assert.equal(await page.evaluate(() => typeof window.MZAI_KEYS), 'undefined');
});

async function attendre(lire, ms = 5000) {
  const fin = Date.now() + ms;
  for (;;) { const v = lire(); if (v) return v; if (Date.now() > fin) throw new Error('attendu en vain'); await new Promise((ok) => setTimeout(ok, 50)); }
}
