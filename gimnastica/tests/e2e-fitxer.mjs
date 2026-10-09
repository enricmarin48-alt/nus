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
    await page.fill('#dlg input[name=name]', 'Anna'); await page.selectOption('#dlg select[name=category]', { index: 1 }); await page.selectOption('#dlg select[name=level]', { index: 1 }); await page.click('#dlg button.primary');
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
    await page.fill('#dlg input[name=name]', 'Berta'); await page.selectOption('#dlg select[name=category]', { index: 1 }); await page.selectOption('#dlg select[name=level]', { index: 1 }); await page.click('#dlg button.primary');
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
    await page.fill('#dlg input[name=name]', 'Dana'); await page.selectOption('#dlg select[name=category]', { index: 1 }); await page.selectOption('#dlg select[name=level]', { index: 1 }); await page.click('#dlg button.primary');
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

  // ─── dues pestanyes del mateix navegador amb el fitxer vinculat: només una pot canviar les dades (l'altra és en pausa i
  // no hi escriu), i en passar d'una a l'altra no hi ha cap «té altres dades»
  await step('dues pestanyes amb el fitxer vinculat: la que és en pausa no hi escriu, i en passar d’una a l’altra no hi ha cap conflicte', async () => {
    const ctx = await browser.newContext();
    await ctx.addInitScript(() => {
      const P = FileSystemHandle.prototype;
      P.queryPermission = async () => 'granted';
      P.requestPermission = async () => 'granted';
      window.showSaveFilePicker = async () => (await navigator.storage.getDirectory()).getFileHandle('d.json', { create: true });
    });
    const gym = name => ({ id: 'g-' + name, name, surname: 'S', clubId: null, gender: 'F', category: '', level: '' });
    const add = (p, name) => p.evaluate(g => { db.gymnasts.push(g); commit(); }, gym(name));
    const A = await ctx.newPage();
    const read = () => A.evaluate(async () => JSON.parse(await (await (await (await navigator.storage.getDirectory()).getFileHandle('d.json')).getFile()).text()).gymnasts.map(g => g.name).sort().join(','));
    await A.goto(url + '#/configuracio');
    await A.click('button[data-act=linkFile]'); await A.waitForSelector('text=+ d.json');
    await add(A, 'Anna'); await A.waitForTimeout(600);
    assert.equal(await read(), 'Anna');
    const B = await ctx.newPage();
    await B.goto(url + '#/configuracio'); await B.waitForSelector('text=+ d.json');
    await A.waitForSelector('#pause[open]');
    await add(B, 'Berta'); await B.waitForTimeout(600);
    assert.equal(await read(), 'Anna,Berta');
    assert.equal(await A.evaluate(() => db.gymnasts.map(g => g.name).sort().join(',')), 'Anna,Berta', 'la que és en pausa ho veu');
    // (un canvi que arribés a la de la pausa sense passar per la pantalla: no es desa enlloc, es guarda per descarregar)
    await add(A, 'Intrusa'); await A.waitForTimeout(600);
    assert.equal(await read(), 'Anna,Berta', 'la de la pausa no escriu al fitxer');
    assert.ok(!(await B.evaluate(() => localStorage.getItem('notesgim.db'))).includes('Intrusa'), 'ni al navegador');
    assert.ok(await A.evaluate(() => !!win.unsent && !!document.querySelector('#pause button#pauseunsent')), 'es pot descarregar');
    assert.equal(await A.evaluate(() => db.gymnasts.map(g => g.name).sort().join(',')), 'Anna,Berta');
    // la de la pausa torna a manar
    await A.click('#pause button:has-text("Treballa en aquesta finestra")');
    await A.waitForFunction(() => !win.paused);
    await B.waitForSelector('#pause[open]');
    await add(A, 'Carla'); await A.waitForTimeout(800);
    assert.equal(await read(), 'Anna,Berta,Carla');
    for (const p of [A, B]) assert.equal(await p.locator('button[data-act=fileConflict]').count(), 0, 'cap conflicte amb el fitxer');
    assert.equal(await B.evaluate(() => db.gymnasts.map(g => g.name).sort().join(',')), 'Anna,Berta,Carla');
    // es tanca la que mana: l'altra continua i hi escriu
    await A.close();
    await B.waitForFunction(() => !win.paused);
    await add(B, 'Dana'); await B.waitForTimeout(800);
    assert.equal(await B.evaluate(async () => JSON.parse(await (await (await (await navigator.storage.getDirectory()).getFileHandle('d.json')).getFile()).text()).gymnasts.length), 4);
    assert.equal(await B.locator('button[data-act=fileConflict]').count(), 0);
    await ctx.close();
  });

  // ─── un fitxer (o un navegador) que només té entitats o la configuració (el començament d'un curs) també té dades:
  // es pregunta abans de tocar res, com amb el programa NotesGim
  const cfgOnly = (dbId, updated, clubs, line2) => ({ app: 'notesgim', version: 1, settings: { dataGen: 2, rev: 4, line2 },
    clubs: clubs.map((n, i) => ({ id: 'c' + (i + 1), name: n, contacts: [{ role: 'Tècnica', name: 'Persona ' + (i + 1), phones: '600000', email: '' }] })),
    gymnasts: [], teams: [], competitions: [], meta: { created: updated, updated, dbId } });
  const full = (dbId, updated) => ({ app: 'notesgim', version: 1, settings: { dataGen: 2, rev: 4, line2: 'Temporada 2025-2026' },
    clubs: [{ id: 'c1', name: 'Club de l’any passat' }], teams: [],
    gymnasts: [{ id: 'g1', name: 'Anna', surname: 'S', clubId: 'c1', gender: 'F', category: 'Aleví', level: 'A' }, { id: 'g2', name: 'Berta', surname: 'S', clubId: 'c1', gender: 'F', category: 'Aleví', level: 'A' }],
    competitions: [{ id: 'k1', name: 'Fase', date: '2026-01-22', entries: [], teams: [] }], meta: { created: updated, updated, dbId } });
  const clubs15 = Array.from({ length: 15 }, (_, i) => 'Entitat nova ' + (i + 1));
  const seeded = async (seed, fileData) => {
    const ctx = await browser.newContext();
    await ctx.addInitScript(([s]) => {
      if (!sessionStorage.getItem('llavor')) localStorage.setItem('notesgim.db', s);
      sessionStorage.setItem('llavor', '1');
      const P = FileSystemHandle.prototype;
      P.queryPermission = async () => 'granted';
      P.requestPermission = async () => 'granted';
      const fh = async () => (await navigator.storage.getDirectory()).getFileHandle('d.json', { create: true });
      window.showOpenFilePicker = async () => [await fh()];
      window.showSaveFilePicker = async () => fh();
    }, [JSON.stringify(seed)]);
    const p = await ctx.newPage();
    await p.goto(url + '#/configuracio');
    await p.waitForSelector('[data-act=openLinkFile]');
    if (fileData) await p.evaluate(async t => { const w = await (await (await navigator.storage.getDirectory()).getFileHandle('d.json', { create: true })).createWritable(); await w.write(t); await w.close(); }, JSON.stringify(fileData));
    const read = () => p.evaluate(async () => JSON.parse(await (await (await (await navigator.storage.getDirectory()).getFileHandle('d.json')).getFile()).text()));
    return { p, ctx, read };
  };

  await step('«Fes servir un fitxer que ja tinc…» amb un fitxer només amb entitats: es pregunta (i si es cancel·la, no es toca)', async () => {
    const { p, ctx, read } = await seeded(full('navegadorA', '2026-06-20T10:00:00.000Z'), cfgOnly('altreOrdinador', '2026-09-15T10:00:00.000Z', clubs15, 'Temporada 2026-2027'));
    await p.click('[data-act=openLinkFile]');
    await p.waitForSelector('#confirm[open]');
    assert.ok((await p.textContent('#confirm')).includes('15 entitats, 0 gimnastes, 0 competicions'));
    await p.click('#confirm button[value=no]');
    await p.waitForTimeout(500);
    const d = await read();
    assert.equal(d.clubs.length, 15); assert.equal(d.settings.line2, 'Temporada 2026-2027'); assert.equal(d.meta.dbId, 'altreOrdinador');
    assert.equal(await p.evaluate(() => fileHandle), null);
    // i «Fes servir les del fitxer» les carrega
    await p.click('[data-act=openLinkFile]');
    await p.waitForSelector('#confirm[open]');
    await p.click('#confirm button[value=ok]');
    await p.waitForTimeout(600);
    assert.equal(await p.evaluate(() => db.clubs.length), 15);
    assert.equal((await read()).clubs.length, 15);
    await ctx.close();
  });

  await step('fitxer vinculat que a l’altre ordinador s’ha buidat i només té entitats noves: en obrir, s’avisa i no s’hi escriu', async () => {
    const { p, ctx, read } = await seeded(full('navegadorB', '2026-06-20T10:00:00.000Z'), null);
    await p.click('[data-act=linkFile]');
    await p.waitForSelector('text=+ d.json');
    await p.waitForTimeout(400);
    assert.equal((await read()).gymnasts.length, 2);
    await p.evaluate(async t => { const w = await (await (await navigator.storage.getDirectory()).getFileHandle('d.json')).createWritable(); await w.write(t); await w.close(); },
      JSON.stringify(cfgOnly('navegadorB', new Date(Date.now() + 60000).toISOString(), clubs15, 'Temporada 2026-2027')));
    await p.reload();
    await p.waitForSelector('button[data-act=fileConflict]');
    await p.waitForTimeout(500);
    const d = await read();
    assert.deepEqual([d.clubs.length, d.gymnasts.length], [15, 0]);
    await ctx.close();
  });

  await step('un navegador que només té entitats vincula un fitxer amb dades: es pregunta abans de substituir-les', async () => {
    const { p, ctx } = await seeded(cfgOnly('navegadorC', '2026-09-15T10:00:00.000Z', clubs15, 'Temporada 2026-2027'), full('altres', '2026-06-20T10:00:00.000Z'));
    await p.click('[data-act=openLinkFile]');
    await p.waitForSelector('#confirm[open]');
    assert.ok((await p.textContent('#confirm')).includes('15 entitats, 0 gimnastes, 0 competicions'));
    await p.click('#confirm button[value=no]');
    await p.waitForTimeout(300);
    assert.equal(await p.evaluate(() => db.clubs.length), 15);
    await ctx.close();
  });
} finally { await browser.close(); srv.close(); }
console.log('\nFitxer vinculat correcte.');
