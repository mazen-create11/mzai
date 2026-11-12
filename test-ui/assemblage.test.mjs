// L'assemblage : le fichier publié est exactement ce que donnent les sources.
// Aucun navigateur ici.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { assembler, ecarts, SCRIPTS, STYLES, SORTIE } from '../build.mjs';

const lire = (chemin) => readFileSync(new URL('../' + chemin, import.meta.url), 'utf8');

test('le fichier publié correspond aux sources, à l’octet près', () => {
  assert.ok(lire(SORTIE) === assembler(), `${SORTIE} ne correspond plus à src/ : lance « node build.mjs », ou reporte dans src/ ce qui a été modifié à la main`);
});

test('chaque fichier de src/ est assemblé une fois, et rien de listé ne manque', () => {
  assert.deepEqual(ecarts(), []);
});

test('chaque script se lit seul : aucune coupe au milieu d’une instruction', () => {
  for (const nom of SCRIPTS) assert.doesNotThrow(() => new vm.Script(lire(`src/js/${nom}.js`), { filename: nom + '.js' }), nom);
});

/** Profondeur d'accolades d'une feuille, lue comme un navigateur la lit :
 *  commentaires, chaînes et `url(…)` nus ne comptent pas. */
function accolades(css) {
  let d = 0, min = 0;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === '/' && css[i + 1] === '*') { i = css.indexOf('*/', i + 2) + 1; if (i === 0) return { fin: NaN, min }; }
    else if (c === '"' || c === "'") { for (i++; i < css.length && css[i] !== c && css[i] !== '\n'; i++) if (css[i] === '\\') i++; }
    else if (/^url\(\s*[^"'\s]/i.test(css.slice(i, i + 12))) { i = css.indexOf(')', i); if (i === -1) return { fin: NaN, min }; }
    else if (c === '{') d++;
    else if (c === '}') { d--; min = Math.min(min, d); }
  }
  return { fin: d, min };
}

test('chaque feuille de style se ferme : aucune coupe au milieu d’une règle', () => {
  assert.deepEqual(accolades('a{b:url(x{y)}/* } */c{d:"}"}'), { fin: 0, min: 0 }, 'le compteur lui-même');
  assert.deepEqual(accolades('a{b:c}}'), { fin: -1, min: -1 }, 'le compteur lui-même');
  for (const nom of STYLES) assert.deepEqual(accolades(lire(`src/css/${nom}.css`)), { fin: 0, min: 0 }, nom);
});

test('le gabarit ne porte ni style ni script de l’app, seulement ses deux points d’insertion', () => {
  const gabarit = lire('src/app.html');
  assert.equal(gabarit.match(/^\/\* @inclure (css|js) \*\/$/gm).join(), '/* @inclure css */,/* @inclure js */');
  assert.match(gabarit, /<style>\n\/\* @inclure css \*\/\n<\/style>/);
  assert.match(gabarit, /<script>\n\/\* @inclure js \*\/\n<\/script>/);
});
