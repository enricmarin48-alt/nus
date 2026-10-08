// Prova de punta a punta amb un navegador de veritat, obrint l'app des del disc (file://),
// tal com la faran servir sense internet.
//   node tests/e2e.mjs            (cal Playwright: npm i -g playwright)
// Desa captures i el .xlsx exportat a tests/out/.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(path.join(execSync('npm root -g').toString().trim(), 'playwright')); }

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'out');
mkdirSync(out, { recursive: true });
const url = pathToFileURL(path.join(here, '..', 'index.html')).href;

const browser = await playwright.chromium.launch();
const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1366, height: 900 }, locale: 'ca-ES' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

const step = async (name, fn) => { process.stdout.write(`· ${name} … `); await fn(); console.log('ok'); };
const shot = name => page.screenshot({ path: path.join(out, name + '.png'), fullPage: true });

await page.goto(url);

await step('importa gimnastes enganxant des d’Excel', async () => {
  await page.click('a[data-nav=gimnastes]');
  await page.click('button[data-act=importGyms]');
  const rows = [
    ['Nom', 'Cognoms', 'Entitat', 'Categoria', 'Nivell', 'Any'],
    ['Anna', 'Puig', 'CG Lleida', 'aleví', 'A', '2015'],
    ['Berta', 'Soler', 'CG Lleida', 'Aleví', 'A', '2015'],
    ['Carla', 'Vidal', 'CG Lleida', 'Aleví', 'A', '2016'],
    ['Dana', 'Roca', 'CG Lleida', 'Aleví', 'A', '2016'],
    ['Elna', 'Mas', 'Escola Pardinyes', 'Aleví', 'A', '2015'],
    ['Fiona', 'Camps', 'Escola Pardinyes', 'Aleví', 'A', '2015'],
    ['Gina', 'Ros', 'Escola Pardinyes', 'Aleví', 'A', '2016'],
    ['Helena', 'Pons', 'Club Balaguer', 'Aleví', 'A', '2015'],
    ['Iris', 'Font', 'Club Balaguer', 'Aleví', 'B', '2015'],
  ];
  await page.fill('#imptext', rows.map(r => r.join('\t')).join('\n'));
  await page.click('button[data-act=impAnalyze]');
  await page.waitForSelector('text=9 gimnastes noves');
  await page.click('button[data-act=impDo]');
  await page.waitForSelector('#gymtable >> text=Helena');
  assert.equal(await page.locator('#gymtable tbody tr').count(), 9);
  // «aleví» en minúscules s'ha d'haver reconegut com a «Aleví»
  assert.equal(await page.locator('#gymtable td', { hasText: /^Aleví$/ }).count(), 9);
});

await step('afegeix una gimnasta a mà amb «Desa i afegeix-ne una altra»', async () => {
  await page.click('button[data-act=newGym]');
  await page.fill('#dlg input[name=name]', 'Júlia');
  await page.fill('#dlg input[name=surname]', 'Bosch');
  await page.fill('#dlg input[name=club]', 'Club Balaguer');
  await page.selectOption('#dlg select[name=category]', 'Aleví');
  await page.selectOption('#dlg select[name=level]', 'A');
  await page.click('#dlg button[name=again]');
  // el formulari nou recorda entitat, categoria i nivell
  assert.equal(await page.inputValue('#dlg input[name=club]'), 'Club Balaguer');
  await page.fill('#dlg input[name=name]', 'Laia');
  await page.fill('#dlg input[name=surname]', 'Serra');
  await page.click('#dlg button.primary');
  await page.waitForSelector('#gymtable >> text=Laia');
  assert.equal(await page.locator('#gymtable tbody tr').count(), 11);
});

await step('proposa equips automàticament (3 a 6 per entitat)', async () => {
  await page.click('a[data-nav=equips]');
  await page.click('button[data-act=autoTeams]');
  const n = await page.locator('#dlg input[name=p]').count();
  assert.equal(n, 3, 'CG Lleida (4), Escola Pardinyes (3), Club Balaguer (3)');
  await page.click('#dlg button.primary');
  await page.waitForSelector('text=CG Lleida Aleví A');
  await shot('equips');
});

await step('crea una competició i hi inscriu equips i una individual', async () => {
  await page.click('a[data-nav=competicions]');
  await page.click('button[data-act=newComp]');
  await page.fill('#dlg input[name=name]', 'Fase comarcal de gim. artística');
  await page.fill('#dlg input[name=date]', '2027-01-22');
  await page.click('#dlg button.primary');
  await page.waitForSelector('button[data-act=enrollTeams]');
  await page.click('button[data-act=enrollTeams]');
  await page.click('#dlg button[data-act=checkAll]');
  await page.click('#dlg button.primary');
  await page.waitForSelector('text=Aleví · Nivell A');
  await page.click('button[data-act=enrollGyms]');
  await page.click('#dlg label:has-text("Iris") input');
  await page.click('#dlg button.primary');
  await page.waitForSelector('text=Aleví · Nivell B');
  assert.equal(await page.locator('table.tbl tbody tr').count(), 11);
  await shot('inscripcions');
});

await step('entra notes amb el teclat (Intro baixa a la següent)', async () => {
  await page.click('.tabs a:has-text("Notes")');
  await page.click('button[data-act=pickApp][data-a=salt]');
  const salt = ['8,5', '9', '7.25', '8', '8,1', '7,9', '8,3', '9,2', '6,5', '7'];
  const first = page.locator('#scoregrid input.sc').first();
  await first.focus();
  for (const v of salt) { await page.keyboard.type(v); await page.keyboard.press('Enter'); }
  await page.click('button[data-act=pickApp][data-a=all]');
  // Totes: omplim barra i terra per columnes
  for (const app of ['barra', 'terra']) {
    const col = page.locator(`#scoregrid input.sc[data-a=${app}]`);
    await col.first().focus();
    const vals = app === 'barra' ? ['7', '8', '9', '6', '8,5', '7,5', '8', '9', '7', '8'] : ['9', '8', '7', '8', '9', '8', '7', '8,8', '7', '8'];
    for (const v of vals) { await page.keyboard.type(v); await page.keyboard.press('Enter'); }
  }
  const tot = await page.locator('#scoregrid td[data-out^="tot:"]').allTextContents();
  assert.ok(tot.every(t => /\d+,\d\d/.test(t)), 'tots els totals calculats: ' + tot.join(' | '));
  await shot('notes');
});

await step('nota no vàlida queda marcada i no es desa', async () => {
  const inp = page.locator('#scoregrid input.sc[data-a=salt]').first();
  const before = await inp.inputValue();
  await inp.fill('8,3,1');
  await inp.press('Tab');
  assert.ok(await inp.evaluate(el => el.classList.contains('invalid')));
  await page.reload();
  await page.waitForSelector('#scoregrid');
  assert.equal(await page.locator('#scoregrid input.sc[data-a=salt]').first().inputValue(), before);
});

await step('classificacions: individual, per aparells i equips (3 millors)', async () => {
  await page.click('.tabs a:has-text("Classificacions")');
  await page.waitForSelector('text=General individual');
  const firstPos = await page.locator('table.tbl tbody tr').first().locator('td').first().textContent();
  assert.equal(firstPos.trim(), '1');
  await page.click('button[data-act=pickClsType][data-t=teams]');
  await page.waitForSelector('tr.team-row');
  assert.equal(await page.locator('tr.team-row').count(), 3);
  // CG Lleida té 4 gimnastes: a cada aparell n'hi ha una de ratllada
  assert.ok(await page.locator('td.disc').count() >= 3);
  await shot('classificacio-equips');
  await page.click('button[data-act=pickClsType][data-t=apps]');
  await page.waitForSelector('h3:has-text("Salt")');
  await page.click('button[data-act=pickClsType][data-t=general]');
});

await step('les dades es mantenen després de tancar i tornar a obrir', async () => {
  const p2 = await ctx.newPage();
  await p2.goto(url + '#/gimnastes');
  await p2.waitForSelector('#gymtable >> text=Laia');
  assert.equal(await p2.locator('#gymtable tbody tr').count(), 11);
  await p2.close();
});

await step('exporta a Excel (.xlsx)', async () => {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button[data-act=exportComp]')]);
  await dl.saveAs(path.join(out, 'competicio.xlsx'));
});

await step('impressió: genera PDF de totes les classificacions', async () => {
  await page.evaluate(() => { window.print = () => {}; });
  await page.click('button[data-act=printDlg]');
  for (const t of ['apps', 'notes', 'judge', 'list']) await page.check(`#dlg input[name=t][value=${t}]`);
  await page.click('#dlg button.primary');
  await page.waitForFunction(() => document.querySelectorAll('#print .sheet').length > 0);
  const n = await page.locator('#print .sheet').count();
  assert.ok(n >= 10, 'fulls: ' + n);
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: path.join(out, 'impresos.pdf'), format: 'A4', printBackground: true });
  await page.emulateMedia({ media: 'screen' });
});

await step('còpia de seguretat: es descarrega i es pot restaurar', async () => {
  await page.goto(url + '#/configuracio');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button[data-act=backup]')]);
  const file = path.join(out, 'copia.json');
  await dl.saveAs(file);
  // esborrem-ho tot i restaurem
  await page.click('button[data-act=wipe]');
  await page.fill('#confirm input[name=typed]', 'ESBORRA');
  await page.click('#confirm button[value=ok]');
  await page.goto(url + '#/gimnastes');
  await page.waitForSelector('text=Encara no hi ha cap gimnasta');
  await page.goto(url + '#/configuracio');
  await page.evaluate(() => { window.showOpenFilePicker = undefined; });
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('button[data-act=restore]')]);
  await chooser.setFiles(file);
  await page.click('#confirm button[value=ok]');
  await page.goto(url + '#/gimnastes');
  await page.waitForSelector('#gymtable >> text=Laia');
});

await shot('final');
await browser.close();
if (errors.length) { console.error('\nErrors a la consola:\n' + errors.join('\n')); process.exit(1); }
console.log('\nTot correcte. Captures i fitxers a tests/out/');
