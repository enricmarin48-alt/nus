// Prova del fitxer vinculat («Desa també a un fitxer»): si un altre ordinador l'ha canviat, en obrir
// l'app no s'hi escriu res sense preguntar, encara que el navegador recordi el permís.
// Fa servir el sistema de fitxers privat del navegador (OPFS) en lloc d'un fitxer de l'USB.
//   node tests/e2e-fitxer.mjs
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(path.join(execSync('npm root -g').toString().trim(), 'playwright')); }
const here = path.dirname(fileURLToPath(import.meta.url));
const html = readFileSync(path.join(here, '..', 'index.html'));
const srv = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html);
}).listen(18791);
const url = 'http://127.0.0.1:18791/';
const browser = await playwright.chromium.launch();
const step = async (name, fn) => { process.stdout.write(`· ${name} … `); await fn(); console.log('ok'); };
try {
  const page = await (await browser.newContext()).newPage();
  // el permís sempre «concedit» (com quan el navegador el recorda) i el selector de fitxers fa servir OPFS
  await page.addInitScript(() => {
    const P = FileSystemHandle.prototype;
    P.queryPermission = async () => 'granted';
    P.requestPermission = async () => 'granted';
    window.showSaveFilePicker = async () => (await navigator.storage.getDirectory()).getFileHandle('d.json', { create: true });
  });
  const readFile = () => page.evaluate(async () => JSON.parse(await (await (await (await navigator.storage.getDirectory()).getFileHandle('d.json')).getFile()).text()));
  await page.goto(url + '#/gimnastes');

  await step('es vincula un fitxer nou i s’hi desa cada canvi', async () => {
    await page.click('button[data-act=newGym]');
    await page.fill('#dlg input[name=name]', 'Anna'); await page.click('#dlg button.primary');
    await page.goto(url + '#/configuracio');
    await page.click('button[data-act=linkFile]');
    await page.waitForSelector('text=+ d.json');
    await page.waitForTimeout(400);
    const d = await readFile();
    assert.deepEqual(d.gymnasts.map(g => g.name), ['Anna']);
  });

  await step('en tornar a obrir, sense canvis d’altres, es continua desant sense preguntar', async () => {
    await page.reload();
    await page.waitForSelector('text=+ d.json');
    await page.goto(url + '#/gimnastes');
    await page.click('button[data-act=newGym]');
    await page.fill('#dlg input[name=name]', 'Berta'); await page.click('#dlg button.primary');
    await page.waitForTimeout(600);
    assert.deepEqual((await readFile()).gymnasts.map(g => g.name).sort(), ['Anna', 'Berta']);
  });

  await step('un altre ordinador canvia el fitxer: en obrir, s’avisa i el fitxer no es toca', async () => {
    // simulem l'altre ordinador: hi afegeix una gimnasta i una competició, amb hora més nova
    await page.evaluate(async () => {
      const fh = await (await navigator.storage.getDirectory()).getFileHandle('d.json');
      const d = JSON.parse(await (await fh.getFile()).text());
      d.gymnasts.push({ id: 'gb', name: 'Carla de B', surname: '', clubId: null, category: '', level: '', gender: 'F' });
      d.competitions.push({ id: 'kb', name: 'Jornada 2 (B)', date: '2027-02-02', entries: [], teams: [] });
      d.meta.updated = new Date(Date.now() + 60000).toISOString();
      const w = await fh.createWritable(); await w.write(JSON.stringify(d)); await w.close();
    });
    await page.reload();
    await page.waitForSelector('button[data-act=fileConflict]');
    // encara que es facin canvis, el fitxer de l'altre ordinador es manté
    await page.goto(url + '#/gimnastes');
    await page.click('button[data-act=newGym]');
    await page.fill('#dlg input[name=name]', 'Dana'); await page.click('#dlg button.primary');
    await page.waitForTimeout(600);
    const d = await readFile();
    assert.ok(d.gymnasts.some(g => g.name === 'Carla de B'));
    assert.equal(d.competitions.length, 1);
  });

  await step('triant «Fes servir les del fitxer» es carreguen les dades de l’altre ordinador', async () => {
    await page.click('button[data-act=fileConflict]');
    await page.click('#confirm button[value=file]');
    await page.waitForTimeout(300);
    await page.goto(url + '#/competicions');
    await page.waitForSelector('text=Jornada 2 (B)');
    await page.waitForSelector('text=+ d.json');
  });

  await step('enganxar: una cometa enmig d’un nom no ajunta files; una cel·la amb salt de línia sí que va junta', async () => {
    const r = await page.evaluate(() => [splitRows('Anna "Nena"\tCG Lleida\nBerta\tCG Lleida'), splitRows('Dana\t"Club Gimnàstic\nLleida"\nElna\tClub')]);
    assert.deepEqual(r[0], [['Anna "Nena"', 'CG Lleida'], ['Berta', 'CG Lleida']]);
    assert.deepEqual(r[1], [['Dana', 'Club Gimnàstic Lleida'], ['Elna', 'Club']]);
  });
} finally { await browser.close(); srv.close(); }
console.log('\nFitxer vinculat correcte.');
