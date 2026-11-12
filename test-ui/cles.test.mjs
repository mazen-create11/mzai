// Les clés et le chemin des appels. Deux modes :
//  - en ligne, pas de clé dans le navigateur : tout passe par le Worker ;
//  - en local avec un fichier de clés : l'app appelle le fournisseur elle-même.
// Les clés de ces tests sont inventées, et le fichier de clés est fabriqué par le décor.
import test from 'node:test';
import assert from 'node:assert/strict';
import { monde, CODE, REPONSE } from './monde.mjs';

const repondu = (page) => page.waitForFunction((r) => document.querySelector('#chat .msg.ai')?.textContent.includes(r), REPONSE);
const stockees = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('mzai:apikeys') || '{}'));

test('en ligne : le navigateur n’envoie qu’un bouche-trou à la place de la clé, et rien ne part chez un fournisseur', async (t) => {
  const m = await monde({ connecte: true }); t.after(m.fin);
  const { page } = m;
  await page.waitForFunction(() => /Bienvenue/.test(document.querySelector('#toast .tm').textContent));
  await page.fill('#prompt', 'Bonjour');
  await page.click('#sendBtn');
  await repondu(page);
  const [envoi] = m.discussions();
  assert.equal(envoi.autorisation, 'Bearer via-proxy');
  assert.equal(envoi.code, CODE);
  assert.deepEqual(m.directs, [], 'aucun appel direct à un fournisseur');
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#set-api')).display), 'none', 'un invité n’a aucune clé à saisir');
  assert.deepEqual(m.erreurs, []);
});

test('en local avec un fichier de clés : appel direct au fournisseur avec cette clé, sans porte et sans Worker', async (t) => {
  const m = await monde({ connecte: true, cles: { openrouter: 'cle-fichier-or', siliconflow: 'cle-fichier-sf' } }); t.after(m.fin);
  const { page } = m;
  await page.waitForSelector('#prompt');
  assert.equal(await page.locator('#mazGate').count(), 0);
  await page.fill('#prompt', 'Bonjour');
  await page.click('#sendBtn');
  await repondu(page);
  const envoi = m.directs.find((a) => /chat\/completions$/.test(a.chemin));
  assert.equal(envoi.hote, 'openrouter.ai');
  assert.equal(envoi.chemin, '/api/v1/chat/completions');
  assert.equal(envoi.autorisation, 'Bearer cle-fichier-or');
  assert.ok(m.directs.every((a) => a.code === null), 'le code d’accès enregistré sur l’appareil ne sort jamais vers un fournisseur');
  assert.deepEqual(m.appels, [], 'rien ne passe par le Worker');
  assert.deepEqual(m.erreurs, []);
});

test('les clés du fichier restent en mémoire : elles ne sont jamais recopiées dans le stockage du navigateur', async (t) => {
  const m = await monde({ connecte: true, cles: { openrouter: 'cle-fichier-or', siliconflow: 'cle-fichier-sf' } }); t.after(m.fin);
  const { page } = m;
  await page.waitForSelector('#prompt');
  const tout = await page.evaluate(() => JSON.stringify(Object.entries(localStorage)));
  assert.ok(!tout.includes('cle-fichier-or') && !tout.includes('cle-fichier-sf'));
  assert.deepEqual(m.erreurs, []);
});

test('une clé saisie dans les réglages est nettoyée, gardée sur l’appareil, et retrouvée au rechargement', async (t) => {
  const m = await monde({ connecte: true, cles: { openrouter: 'cle-fichier-or' }, reglagesCles: true }); t.after(m.fin);
  const { page } = m;
  await page.waitForSelector('#prompt');
  await page.evaluate(() => openSettingsAt('api'));
  const champ = page.locator('#apiList input[name="api-siliconflow"]');
  await champ.fill('  sk-sili con-é123\n ');   // espaces, accent, retour à la ligne : ce qui casse un en-tête HTTP
  assert.deepEqual(await stockees(page), { siliconflow: 'sk-silicon-123', kling_ak: '', kling_sk: '', kling_proxy: '' }, 'la clé saisie est gardée nettoyée, celle du fichier n’y est pas');
  assert.ok(await page.locator('#apiList .api-row[data-key="siliconflow"] .api-st.on').count(), 'le fournisseur passe à « connecté »');

  await page.locator('#apiList input[name="kling_ak"]').fill('ak-1');
  await page.locator('#apiList input[name="kling_sk"]').fill('sk-2');
  assert.deepEqual(await stockees(page), { siliconflow: 'sk-silicon-123', kling_ak: 'ak-1', kling_sk: 'sk-2', kling_proxy: '' });

  await page.reload();
  await page.waitForSelector('#prompt');
  await page.evaluate(() => openSettingsAt('api'));
  assert.equal(await page.locator('#apiList input[name="api-siliconflow"]').inputValue(), 'sk-silicon-123');
  assert.equal(await page.locator('#apiList input[name="api-openrouter"]').inputValue(), 'cle-fichier-or');
  assert.deepEqual(m.erreurs, []);
});

test('première visite en local : la clé collée est vérifiée chez le fournisseur avant d’être gardée', async (t) => {
  const m = await monde({ cles: { siliconflow: 'cle-fichier-sf' }, reglagesCles: true }); t.after(m.fin);
  const { page } = m;
  await page.waitForSelector('#onboard.show');
  await page.click('#obNext');
  await page.fill('#obKey', ' sk-or-nou velle ');
  await page.click('#obTest');
  await page.waitForFunction(() => /Clé valide/.test(document.querySelector('#obKeyStat').textContent));
  const verif = m.directs.find((a) => a.chemin === '/api/v1/auth/key');
  assert.equal(verif.autorisation, 'Bearer sk-or-nouvelle');
  assert.equal((await stockees(page)).openrouter, 'sk-or-nouvelle');
  assert.ok(!JSON.stringify(await stockees(page)).includes('cle-fichier-sf'));

  await page.click('#obNext');   // dernière étape
  await page.click('#obNext');   // « Commencer »
  await page.waitForFunction(() => !document.querySelector('#onboard').classList.contains('show'));
  assert.equal(await page.evaluate(() => localStorage.getItem('mzai:onboarded')), 'true');
  assert.equal((await stockees(page)).openrouter, 'sk-or-nouvelle');
  assert.deepEqual(m.erreurs, []);
});

test('le magasin de clés est fermé : huit entrées publiques figées, aucun ancien nom global', async (t) => {
  const m = await monde({ connecte: true, cles: { openrouter: 'cle-fichier-or' } }); t.after(m.fin);
  await m.page.waitForSelector('#prompt');
  const vu = await m.page.evaluate(() => {
    const existe = (nom) => { try { return (0, eval)(`typeof ${nom}`) !== 'undefined'; } catch { return true; } };
    let ecrit = false;
    try { Relais.viaProxy = true; Relais.cle = () => 'x'; ecrit = Relais.viaProxy === true || Relais.cle('openrouter') === 'x'; } catch { /* figé */ }
    return {
      publiques: Object.keys(Relais).sort(),
      fige: Object.isFrozen(Relais) && !ecrit,
      temoin: existe('toast'),
      fuites: ['KEYS', 'DEFAULT_KEYS', 'persistKeys', 'cleanKey', 'PROXY_URL', '_keyFile', 'VIA_PROXY', '_PB', 'OR_HOST', 'SF_HOST', 'SHOW_API_SETTINGS'].filter(existe),
      lue: Relais.cle('openrouter'), inconnue: Relais.cle('constructor'), direct: Relais.viaProxy === false && Relais.orHost === 'https://openrouter.ai',
    };
  });
  assert.deepEqual(vu, {
    publiques: ['base', 'cle', 'nettoyerCle', 'orHost', 'poserCle', 'sfHost', 'showApiSettings', 'viaProxy'],
    fige: true, temoin: true, fuites: [], lue: 'cle-fichier-or', inconnue: '', direct: true,
  });
});
