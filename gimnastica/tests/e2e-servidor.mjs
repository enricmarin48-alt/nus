// Prova del mode servidor (xarxa local sense internet): un navegador fa d'ordinador de la taula
// (localhost) i un altre de mòbil de tutora (adreça de xarxa). Cal Go i Playwright.
//   node tests/e2e-servidor.mjs
import { createRequire } from 'node:module';
import { execSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync, copyFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fixture as rotFixture } from './fixture-rotacions.mjs';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(path.join(execSync('npm root -g').toString().trim(), 'playwright')); }

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const out = path.join(here, 'out', 'servidor');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const srvDir = path.join(root, 'servidor');
mkdirSync(path.join(srvDir, 'web', 'icons'), { recursive: true });
copyFileSync(path.join(root, 'index.html'), path.join(srvDir, 'web', 'index.html'));
for (const f of readdirSync(path.join(root, 'icons'))) copyFileSync(path.join(root, 'icons', f), path.join(srvDir, 'web', 'icons', f));
const bin = path.join(out, 'notesgim-servidor');
execSync(`go build -o "${bin}" .`, { cwd: srvDir, stdio: 'inherit', env: { ...process.env, CGO_ENABLED: '0' } });

const lan = Object.values(os.networkInterfaces()).flat().find(a => a && a.family === 'IPv4' && !a.internal);
assert.ok(lan, 'cal una adreça de xarxa (no localhost) per fer de mòbil de tutora');
const PORT = +process.env.NOTESGIM_TEST_PORT || 18765, dataFile = path.join(out, 'notesgim-dades.json');

const now = Date.now();
writeFileSync(dataFile, JSON.stringify({
  app: 'notesgim', version: 1,
  settings: { dataGen: 2 },
  clubs: [{ id: 'c1', name: 'CG Lleida' }],
  gymnasts: [
    { id: 'g1', name: 'Anna', surname: 'Puig', clubId: 'c1', gender: 'F', category: 'Aleví', level: 'A' },
    { id: 'g2', name: 'Berta', surname: 'Soler', clubId: 'c1', gender: 'F', category: 'Aleví', level: 'A' },
    { id: 'g3', name: 'Pau', surname: 'Gil', clubId: 'c1', gender: 'M', category: 'Aleví', level: 'A' },
  ],
  teams: [],
  competitions: [{ id: 'k1', name: 'Fase de prova', date: '2027-01-22', place: 'Lleida', season: '2026-2027', tutorsOn: true, tutorPin: '4321',
    entries: [
      { id: 'e1', gymnastId: 'g1', clubId: 'c1', gender: 'F', category: 'Aleví', level: 'A', bib: 1, status: '', scores: {} },
      { id: 'e2', gymnastId: 'g2', clubId: 'c1', gender: 'F', category: 'Aleví', level: 'A', bib: 2, status: '', scores: { salt: [{ v: 8, at: now }] } },
      { id: 'e3', gymnastId: 'g3', clubId: 'c1', gender: 'M', category: 'Aleví', level: 'A', bib: 3, status: '', scores: {} },
    ], teams: [] }],
  meta: { updated: new Date(now).toISOString() },
}));

let proc;
const startServer = async () => {
  proc = spawn(bin, ['-dades', dataFile, '-port', String(PORT), '-sense-navegador'], { stdio: 'pipe' });
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/api/info`); if (r.ok) return; } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('el servidor no arrenca');
};
const stopServer = () => new Promise(r => { proc.once('exit', r); proc.kill(); });

const step = async (name, fn) => { process.stdout.write(`· ${name} … `); await fn(); console.log('ok'); };
const browser = await playwright.chromium.launch();
const errors = [];
const watch = (p, who) => { p.on('pageerror', e => errors.push(`${who} pageerror: ${e.message}`)); };
// només una finestra de la taula pot canviar les dades: «Treballa en aquesta finestra» la torna a fer manar
const PAUSA = 'Aquesta finestra està en pausa: NotesGim s’està fent servir en una altra finestra.';
const isPaused = p => p.evaluate(() => win.paused && !!document.querySelector('#pause[open]'));
const takeOver = async p => { await p.click('#pause button:has-text("Treballa en aquesta finestra")'); await p.waitForFunction(() => !win.paused, null, { timeout: 10000 }); };
try {
  await startServer();
  const admin = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  const tutor = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  watch(admin, 'admin'); watch(tutor, 'tutora');

  await step('l’ordinador de la taula obre l’app sencera amb les dades del servidor', async () => {
    await admin.goto(`http://127.0.0.1:${PORT}/#/competicio/k1/notes`);
    await admin.waitForSelector('#scoregrid');
    await admin.waitForSelector('text=Desat al fitxer');
    assert.equal(await admin.locator('#scoregrid input.sc[data-e=e2][data-a=salt]').inputValue(), '8,00');
    await admin.waitForSelector('text=Tutores: codi');
  });

  await step('la taula té el codi QR per a les tutores, i el programa serveix la icona i el manifest', async () => {
    await admin.goto(`http://127.0.0.1:${PORT}/#/competicio/k1/configuracio`);
    await admin.waitForSelector('.tut-join .qr svg');
    const m = await (await fetch(`http://127.0.0.1:${PORT}/manifest.webmanifest`)).json();
    assert.equal(m.short_name, 'NotesGim');
    const icon = await fetch(`http://127.0.0.1:${PORT}/icons/icon-192.png`);
    assert.equal(icon.status, 200);
    assert.equal(icon.headers.get('content-type'), 'image/png');
    await admin.goto(`http://127.0.0.1:${PORT}/#/competicio/k1/notes`);
    await admin.waitForSelector('#scoregrid');
  });

  await step('un mòbil de la xarxa veu el mode tutora (i no l’app sencera)', async () => {
    await tutor.goto(`http://${lan.address}:${PORT}/`);
    await tutor.waitForSelector('text=Mode tutora');
    assert.equal(await tutor.locator('header.top nav').isVisible(), false);
    await tutor.fill('input[name=pin]', '0000');
    await tutor.click('button:has-text("Entra")');
    await tutor.waitForSelector('text=Codi incorrecte');
    await tutor.fill('input[name=pin]', '4321');
    await tutor.fill('input[name=who]', 'Marta');
    await tutor.click('button:has-text("Entra")');
    // l'aparell s'ha de triar (no se'n posa cap per defecte)
    await tutor.waitForSelector('text=Quin aparell puntues?');
  });

  await step('escanejant el QR (#codi=…) s’entra sense escriure el codi', async () => {
    const t2 = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
    watch(t2, 'tutora 2');
    await t2.goto(`http://${lan.address}:${PORT}/#codi=4321`);
    await t2.waitForSelector('text=Quin aparell puntues?');
    assert.equal(await t2.evaluate(() => location.hash), '');
    await t2.close();
  });

  await step('la tutora entra notes de barra amb el teclat gran i arriben a la taula al moment', async () => {
    await tutor.click('button[data-act=tutApp][data-a=barra]');
    await tutor.waitForSelector('#qe');
    assert.ok((await tutor.locator('.qe-who b').textContent()).includes('Anna'));
    for (const k of ['9', ',', '1']) await tutor.click(`.qe-keys button[data-k="${k}"]`);
    await tutor.click('#qesave');
    await tutor.waitForSelector('.toast:has-text("Desada 9,10")');
    // passa sola a la següent: la Berta
    assert.ok((await tutor.locator('.qe-who b').textContent()).includes('Berta'));
    for (const k of ['8', ',', '4', '5']) await tutor.click(`.qe-keys button[data-k="${k}"]`);
    await tutor.click('#qesave');
    // «Desfés» amb connexió (quan ja ha arribat a la taula i el mòbil ha rebut les dades del programa)
    await admin.waitForFunction(() => document.querySelector('#scoregrid input.sc[data-e=e2][data-a=barra]').value === '8,45', null, { timeout: 8000 });
    await new Promise(r => setTimeout(r, 1200));
    await tutor.locator('.toast', { hasText: 'Desada 8,45' }).locator('button', { hasText: 'Desfés' }).click();
    await tutor.waitForSelector('.toast:has-text("Desfet.")');
    await admin.waitForFunction(() => document.querySelector('#scoregrid input.sc[data-e=e2][data-a=barra]').value === '', null, { timeout: 8000 });
    assert.ok((await tutor.locator('.qe-who b').textContent()).includes('Berta'));
    for (const k of ['8', ',', '4', '5']) await tutor.click(`.qe-keys button[data-k="${k}"]`);
    await tutor.click('#qesave');
    await tutor.waitForSelector('.toast:has-text("Desada 8,45")');
    await tutor.click('button[data-act=tutToggleList]');
    await tutor.waitForSelector('#scoregrid');
    await tutor.waitForFunction(() => document.querySelectorAll('#scoregrid input.sc')[1].value === '8,45', null, { timeout: 8000 });
    const inp = admin.locator('#scoregrid input.sc[data-e=e1][data-a=barra]');
    await admin.waitForFunction(() => document.querySelector('#scoregrid input.sc[data-e=e1][data-a=barra]').value === '9,10', null, { timeout: 8000 });
    assert.ok(await inp.evaluate(el => el.classList.contains('tutor')));
    assert.ok((await inp.getAttribute('title')).includes('Marta'));
    assert.equal(await admin.locator('[data-out="tot:e2"]').textContent(), '16,45');
  });

  await step('la taula corregeix una nota i la tutora ho veu', async () => {
    const inp = admin.locator('#scoregrid input.sc[data-e=e2][data-a=barra]');
    await inp.click(); await admin.keyboard.type('8,5'); await admin.keyboard.press('Enter');
    assert.equal(await inp.evaluate(el => el.classList.contains('tutor')), false);
    await tutor.waitForFunction(() => document.querySelectorAll('#scoregrid input.sc')[1].value === '8,50', null, { timeout: 8000 });
  });

  await step('«Dona per revisades» treu el fons groc', async () => {
    await admin.click('button[data-act=reviewTutor]');
    await admin.waitForSelector('#scoregrid');
    assert.equal(await admin.locator('#scoregrid input.sc.tutor').count(), 0);
  });

  await step('una nota posada o revisada a la taula, la tutora ja no la pot canviar (409)', async () => {
    await new Promise(r => setTimeout(r, 800));
    const post = body => fetch(`http://${lan.address}:${PORT}/api/score`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ pin: '4321', compId: 'k1', i: 0 }, body)) });
    assert.equal((await post({ entryId: 'e2', appId: 'salt', value: 9 })).status, 409, 'el salt de la Berta el va posar la taula');
    assert.equal((await post({ entryId: 'e1', appId: 'barra', value: 9 })).status, 409, 'la barra de l’Anna ja està revisada');
    assert.equal((await post({ entryId: 'e1', appId: 'salt', value: 25 })).status, 403, 'una nota de més de 20 no s’accepta');
    // a la llista de la tutora surten amb el cadenat
    await tutor.waitForSelector('#scoregrid input.sc.locked');
  });

  // ─── un altre programa (un altre port i un altre fitxer), amb 12 gimnastes: el que arriba de les tutores no mou res
  // de lloc ni es menja cap clic ni cap xifra
  {
    const P2 = 18781, dir2 = path.join(out, 'tutores-focus'), file2 = path.join(dir2, 'notesgim-dades.json');
    mkdirSync(dir2, { recursive: true });
    const gyms = [], ents = [];
    for (let i = 1; i <= 12; i++) {
      gyms.push({ id: 'g' + i, name: 'Nom' + i, surname: 'Cognom' + i, clubId: 'c1', gender: 'F', category: 'Aleví', level: 'A' });
      ents.push({ id: 'e' + i, gymnastId: 'g' + i, clubId: 'c1', gender: 'F', category: 'Aleví', level: 'A', bib: i, status: '', scores: {} });
    }
    writeFileSync(file2, JSON.stringify({ app: 'notesgim', version: 1, settings: { dataGen: 2 }, clubs: [{ id: 'c1', name: 'CG Lleida' }], gymnasts: gyms, teams: [],
      competitions: [{ id: 'k1', name: 'Fase de prova', date: '2027-01-22', place: 'Lleida', season: '2026-2027', tutorsOn: true, tutorPin: '4321', entries: ents, teams: [] }],
      meta: { updated: new Date().toISOString() } }));
    const p2 = spawn(bin, ['-dades', file2, '-port', String(P2), '-sense-navegador'], { stdio: 'pipe' });
    const stop2 = () => new Promise(r => { if (p2.exitCode !== null || p2.signalCode !== null) r(); else { p2.once('exit', r); p2.kill(); } });
    const post2 = body => fetch(`http://${lan.address}:${P2}/api/score`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ pin: '4321', compId: 'k1', i: 0, who: 'Laia' }, body)) });
    try {
      for (let i = 0; i < 50; i++) { try { if ((await fetch(`http://127.0.0.1:${P2}/api/info`)).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
      const a2 = await (await browser.newContext({ viewport: { width: 1024, height: 900 } })).newPage();
      watch(a2, 'taula 2');
      await a2.goto(`http://127.0.0.1:${P2}/#/competicio/k1/notes`);
      await a2.waitForSelector('#scoregrid'); await a2.waitForSelector('text=Desat al fitxer'); await new Promise(r => setTimeout(r, 800));

      await step('taula (1024 px): la primera nota de les tutores no fa baixar la graella (el botó «Dona per revisada» ja hi té lloc)', async () => {
        const target = a2.locator('#scoregrid input.sc[data-e=e6][data-a=terra]');
        const b0 = await target.boundingBox();
        await post2({ entryId: 'e2', appId: 'salt', value: 9 });
        await a2.waitForSelector('#tutorreview:not(.invis)');
        assert.equal(Math.round((await target.boundingBox()).y), Math.round(b0.y));
        await a2.mouse.click(b0.x + b0.width / 2, b0.y + 4);
        assert.equal(await a2.evaluate(() => document.activeElement.dataset.e), 'e6');
        await a2.keyboard.type('8,7'); await a2.keyboard.press('Enter'); await new Promise(r => setTimeout(r, 300));
        assert.equal(await a2.evaluate(() => curComp().entries.find(e => e.id === 'e6').scores.terra[0].v), 8.7);
        // en revisar-les, el botó s'amaga però la graella tampoc no puja
        const b1 = await target.boundingBox();
        await a2.click('#tutorreview'); await a2.waitForSelector('#tutorreview.invis', { state: 'attached' });
        assert.equal(Math.round((await target.boundingBox()).y), Math.round(b1.y));
      });

      await step('taula: si la tutora corregeix la nota de la casella on hi ha el focus (sense escriure-hi res), la casella mostra la nova', async () => {
        const cell = a2.locator('#scoregrid input.sc[data-e=e3][data-a=salt]');
        await post2({ entryId: 'e3', appId: 'salt', value: 8 });
        await a2.waitForFunction(() => document.querySelector('#scoregrid input.sc[data-e=e3][data-a=salt]').value === '8,00');
        await cell.click(); await new Promise(r => setTimeout(r, 200));
        await post2({ entryId: 'e3', appId: 'salt', value: 9 });
        await a2.waitForFunction(() => document.querySelector('#scoregrid input.sc[data-e=e3][data-a=salt]').value === '9,00', null, { timeout: 8000 });
        assert.ok(await cell.evaluate(el => el === document.activeElement && el.classList.contains('tutor')));
        await a2.keyboard.press('Tab'); await new Promise(r => setTimeout(r, 1200));
        assert.equal(await cell.inputValue(), '9,00');
        assert.equal(await a2.textContent('[data-out="tot:e3"]'), '9,00');
        assert.equal(JSON.parse(readFileSync(file2, 'utf8')).competitions[0].entries.find(e => e.id === 'e3').scores.salt[0].v, 9);
      });

      await step('taula, «Entrada ràpida» amb el ratolí: una nota d’una tutora a mig clic no es menja cap xifra (8,5 es desa 8,5)', async () => {
        await a2.click('button[data-act=toggleQe]'); await a2.waitForSelector('#qe');
        const q = await a2.evaluate(() => ({ id: qe.entryId, app: qeCtx().a.id, other: qeCtx().list.find(e => e.id !== qe.entryId).id }));
        for (const k of ['8', ',', '5']) {
          const b = await a2.locator(`#qe button[data-act=qeKey][data-k="${k}"]`).boundingBox();
          await a2.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await a2.mouse.down();
          if (k === '5') { await post2({ entryId: q.other, appId: q.app, value: 9 }); await a2.waitForFunction(([id, app]) => (((curComp().entries.find(e => e.id === id).scores || {})[app] || [])[0] || {}).v === 9, [q.other, q.app], { timeout: 8000 }); }
          await new Promise(r => setTimeout(r, 80)); await a2.mouse.up(); await new Promise(r => setTimeout(r, 60));
        }
        assert.equal(await a2.textContent('#qedisp'), '8,5');
        await a2.click('#qesave'); await new Promise(r => setTimeout(r, 300));
        assert.equal(await a2.evaluate(([id, app]) => curComp().entries.find(e => e.id === id).scores[app][0].v, [q.id, q.app]), 8.5);
        await a2.click('button[data-act=toggleQe]');
      });

      // (sense connexió només aquest mòbil: el programa continua obert per a la resta)
      const nap = ms => new Promise(r => setTimeout(r, ms));
      const fileScore = (id, app) => ((((JSON.parse(readFileSync(file2, 'utf8')).competitions[0].entries.find(e => e.id === id).scores || {})[app] || [])[0]) || {}).v;
      await step('mòbil de la tutora, llista: quan surt (o marxa) «Sense connexió…» o «Enviant…», la llista no es mou i la nota va a la gimnasta que es volia (320, 360 i 390 px)', async () => {
        for (const [w, h, v1, v2] of [[390, 844, '7,5', '8,5'], [360, 740, '7,25', '8,25'], [320, 568, '7,75', '8,75']]) {
          const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
          const t = await ctx.newPage(); watch(t, `tutora llista ${w}`);
          await t.goto(`http://${lan.address}:${P2}/#codi=4321`); await t.waitForSelector('text=Quin aparell puntues?');
          await t.tap('button[data-act=tutApp][data-a=barra]'); await t.waitForSelector('#qe');
          await t.tap('button[data-act=tutToggleList]'); await t.waitForSelector('#scoregrid input.sc');
          await t.evaluate(() => scrollTo(0, 0)); await nap(300);
          const pos = () => t.evaluate(() => [...document.querySelectorAll('#scoregrid input.sc')].map(i => Math.round(i.getBoundingClientRect().y)).join(','));
          // (la primera gimnasta i l'última que es veu sense baixar la pàgina, que és on el dit toca)
          const [first, last] = await t.evaluate(() => { const v = [...document.querySelectorAll('#scoregrid input.sc')].filter(i => i.getBoundingClientRect().bottom <= innerHeight - 4); return [v[0].dataset.e, v[v.length - 1].dataset.e]; });
          const p0 = await pos(), bl = await t.locator(`#scoregrid input.sc[data-e=${last}]`).boundingBox();
          // es perd la Wi-Fi just quan envia la nota de la primera: surt l'avís
          await ctx.route('**/api/**', r => r.abort('internetdisconnected'));
          await t.locator(`#scoregrid input.sc[data-e=${first}]`).tap(); await t.keyboard.type(v1); await t.keyboard.press('Enter');
          await t.waitForSelector('#tutbanner .banner', { timeout: 15000 });
          await t.evaluate(() => scrollTo(0, 0)); await nap(200);
          assert.equal(await pos(), p0, `${w} px: «Sense connexió…» no mou la llista`);
          await t.touchscreen.tap(bl.x + bl.width / 2, bl.y + bl.height / 2);
          assert.equal(await t.evaluate(() => document.activeElement.dataset.e), last, `${w} px: el dit toca la casella que volia`);
          await t.keyboard.type(v2); await t.keyboard.press('Enter'); await nap(300);
          await t.evaluate(() => scrollTo(0, 0)); await nap(100);
          // «Enviant N notes…» i les notes d'una altra competició que no s'han pogut enviar (a sota de la llista)
          const mid = await t.evaluate(async () => {
            // (la cua és la del mòbil: s'hi posen notes de mentida un moment, i després es torna a deixar com era)
            const raw = localStorage.getItem('notesgim.tutor'), mine = [...tut.mine], on0 = tut.online, out = [];
            const fake = (n, comp) => Array.from({ length: n }, (_, k) => ({ compId: comp, entryId: 'e1', appId: 'salt', i: 0, value: 9, at: k + 1, label: 'x' }));
            const put = q => localStorage.setItem('notesgim.tutor', JSON.stringify(Object.assign(JSON.parse(raw), { queue: q })));
            tut.mine.clear();
            tut.online = true; put(fake(5, tutComp().id)); tutStatusBar(); out.push(document.querySelector('#tutbanner').textContent.includes('Enviant'));
            out.push([...document.querySelectorAll('#scoregrid input.sc')].map(i => Math.round(i.getBoundingClientRect().y)).join(','));
            put(fake(1, 'una-altra')); tutStatusBar(); out.push(!!document.querySelector('#tutstuck .note'));
            out.push([...document.querySelectorAll('#scoregrid input.sc')].map(i => Math.round(i.getBoundingClientRect().y)).join(','));
            localStorage.setItem('notesgim.tutor', raw); for (const [k, v] of mine) tut.mine.set(k, v); tut.online = on0; tutStatusBar();
            return out;
          });
          assert.deepEqual(mid, [true, p0, true, p0], `${w} px: «Enviant…» i les notes que no s’han pogut enviar no mouen la llista`);
          // torna la connexió: s'envien i l'avís marxa, sense moure res
          await ctx.unroute('**/api/**');
          await t.waitForFunction(() => !tutQ().length && !document.querySelector('#tutbanner .banner'), null, { timeout: 20000 });
          await t.evaluate(() => scrollTo(0, 0)); await nap(200);
          assert.equal(await pos(), p0, `${w} px: quan torna la connexió la llista no es mou`);
          await nap(500);
          assert.deepEqual([fileScore(first, 'barra'), fileScore(last, 'barra')], [+v1.replace(',', '.'), +v2.replace(',', '.')]);
          await ctx.close();
        }
      });

      await step('mòbil de 360 i 320 px, teclat gran: «⚠ Sense connexió · N al mòbil» no fa créixer la barra de l’aparell (el teclat no baixa)', async () => {
        for (const [w, h] of [[360, 740], [360, 640], [320, 640]]) {
          const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
          const t = await ctx.newPage(); watch(t, `tutora teclat ${w}x${h}`);
          await t.goto(`http://${lan.address}:${P2}/#codi=4321`); await t.waitForSelector('text=Quin aparell puntues?');
          await t.tap('button[data-act=tutApp][data-a=terra]'); await t.waitForSelector('#qe'); await nap(300);
          const geo = () => t.evaluate(() => { const k = document.querySelector('.qe-keys button[data-k="5"]').getBoundingClientRect(); return [Math.round(document.querySelector('.qe-app').getBoundingClientRect().height), Math.round(k.y), Math.round(scrollY)]; });
          const g0 = await geo(), k5 = await t.locator('.qe-keys button[data-k="5"]').boundingBox();
          // (amb el dit allà on hi ha el botó, sense que la prova mogui la pàgina per arribar-hi)
          const tapAt = async sel => { const b = await t.locator(sel).boundingBox(); await t.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); };
          await ctx.route('**/api/**', r => r.abort('internetdisconnected'));
          for (const k of ['9', ',', '2']) await tapAt(`.qe-keys button[data-k="${k}"]`);
          await tapAt('#qesave');
          await t.waitForFunction(() => document.querySelector('#qenet').textContent.includes('Sense connexió'), null, { timeout: 15000 });
          await tapAt('.qe-keys button[data-k="8"]'); await tapAt('#qesave');
          await t.waitForFunction(() => document.querySelector('#qenet').textContent.includes('2 al mòbil'), null, { timeout: 15000 });
          assert.deepEqual(await geo(), g0, `${w}x${h}: la barra i el teclat no es mouen`);
          assert.equal(await t.evaluate(([x, y]) => document.elementFromPoint(x, y).closest('button').dataset.k, [k5.x + k5.width / 2, k5.y + 3]), '5', `${w}x${h}: el dit prem el 5`);
          await ctx.unroute('**/api/**');
          await t.waitForFunction(() => !tutQ().length && !document.querySelector('#qenet').textContent, null, { timeout: 20000 });
          assert.deepEqual(await geo(), g0, `${w}x${h}: quan torna la connexió tampoc`);
          await ctx.close();
        }
      });

      await step('mòbil amb la pàgina de tutora oberta dues vegades: cada pestanya es queda amb el seu aparell (també en tornar-la a carregar), la cua de notes és una sola i el que deixa una pestanya tancada ho envia l’altra', async () => {
        const ph = await playwright.chromium.launchPersistentContext(path.join(out, 'perfil-dues-pestanyes'), { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
        try {
          const B = ph.pages()[0] || await ph.newPage(); watch(B, 'pestanya B');
          await B.goto(`http://${lan.address}:${P2}/#codi=4321`); await B.waitForSelector('text=Quin aparell puntues?');
          await B.tap('button[data-act=tutApp][data-a=barra]'); await B.waitForSelector('#qe');
          const A = await ph.newPage(); watch(A, 'pestanya A');
          await A.goto(`http://${lan.address}:${P2}/#codi=4321`);
          // (una pestanya nova no fa servir l'aparell de l'altra: es torna a triar)
          await A.waitForSelector('text=Quin aparell puntues?');
          await A.tap('button[data-act=tutApp][data-a=terra]'); await A.waitForSelector('#qe');
          // arriben notes d'altres tutores: totes dues pestanyes es tornen a pintar
          for (let k = 0; k < 3; k++) { await post2({ entryId: 'e1' + k, appId: 'salt', value: 8 + k / 10 }); await nap(500); }
          await B.bringToFront(); await nap(800);
          await A.bringToFront(); await A.reload(); await A.waitForSelector('#qe');
          assert.ok((await A.textContent('.qe-app')).includes('Terra'), 'la pestanya A torna a Terra');
          // el mòbil es queda sense Wi-Fi i A desa dues notes: B, on no s'ha escrit res, també diu que n'hi ha 2 al mòbil
          await ph.route('**/api/**', r => r.abort('internetdisconnected'));
          const e1 = await A.evaluate(() => qe.entryId);
          await A.tap('.qe-keys button[data-k="7"]'); await A.tap('#qesave'); await nap(200);
          const e2 = await A.evaluate(() => qe.entryId);
          for (const k of ['7', ',', '2', '5']) await A.tap(`.qe-keys button[data-k="${k}"]`);
          await A.tap('#qesave');
          await A.waitForFunction(() => tutQ().length === 2 && !tut.online, null, { timeout: 15000 });
          assert.ok(await A.evaluate(() => JSON.parse(localStorage.getItem('notesgim.tutor')).queue.every(q => q.id)), 'cada nota té el seu id des que s’escriu');
          await B.waitForFunction(() => document.querySelector('#qenet').textContent.includes('2 al mòbil'), null, { timeout: 15000 });
          // la tutora tanca A abans que les pugui enviar (al mòbil no avisa de res) i torna la Wi-Fi: les envia B
          await A.close({ runBeforeUnload: false });
          await ph.unroute('**/api/**');
          await B.waitForFunction(() => !tutQ().length && document.querySelector('#tutstatus').textContent.includes('tot enviat'), null, { timeout: 20000 });
          await nap(600);
          assert.deepEqual([fileScore(e1, 'terra'), fileScore(e2, 'terra')], [7, 7.25]);
          assert.ok((await B.textContent('.qe-app')).includes('Barra'), 'la pestanya B continua a Barra');
          await B.reload(); await B.waitForSelector('#qe');
          assert.ok((await B.textContent('.qe-app')).includes('Barra'), 'i en tornar-la a carregar, també');
        } finally { await ph.close(); }
      });

      await step('mòbil de la tutora, teclat gran: quan surt «Sense connexió…» el teclat no es mou (el dit prem la tecla que volia)', async () => {
        const t3 = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
        watch(t3, 'tutora 3');
        await t3.goto(`http://${lan.address}:${P2}/#codi=4321`); await t3.waitForSelector('text=Quin aparell puntues?');
        await t3.tap('button[data-act=tutApp][data-a=terra]'); await t3.waitForSelector('#qe');
        const key = () => t3.locator('.qe-keys button[data-k="5"]').boundingBox();
        const b0 = await key();
        await stop2();
        await t3.waitForSelector('#tutbanner .banner', { timeout: 15000 });
        assert.equal(Math.round((await key()).y), Math.round(b0.y));
        assert.equal(await t3.evaluate(([x, y]) => { const b = document.elementFromPoint(x, y).closest('button'); return b && b.dataset.k; }, [b0.x + b0.width / 2, b0.y + b0.height / 2]), '5');
        // (l'avís es veu, a la franja de dalt)
        const bn = await t3.locator('#tutbanner .banner').boundingBox();
        assert.ok(bn.y >= 0 && bn.y + bn.height <= 60, JSON.stringify(bn));
        await t3.close();
      });
      await a2.close();
    } finally { await stop2(); }
  }

  await step('al fitxer del servidor hi ha les notes', async () => {
    await new Promise(r => setTimeout(r, 600));
    const d = JSON.parse(readFileSync(dataFile, 'utf8'));
    const e1 = d.competitions[0].entries.find(e => e.id === 'e1');
    assert.equal(e1.scores.barra[0].v, 9.1);
  });

  await step('el noi no té barra (es torna a demanar l’aparell); el minitramp té 2 salts', async () => {
    const sel = tutor.locator('.gsel select');
    await sel.selectOption(await tutor.locator('.gsel select option', { hasText: 'masculí' }).getAttribute('value'));
    await tutor.waitForSelector('text=Aquest grup no fa aquest aparell');
    assert.equal(await tutor.locator('button[data-act=tutApp][data-a=barra]').count(), 0);
    await tutor.click('button[data-act=tutApp][data-a=mini]');
    assert.equal(await tutor.locator('#scoregrid input.sc').count(), 2);
    await sel.selectOption(await tutor.locator('.gsel select option', { hasText: 'femení' }).getAttribute('value'));
    await tutor.click('button[data-act=tutApp][data-a=terra]');
  });

  await step('sense connexió: la tutora segueix i s’envia tot quan torna', async () => {
    await stopServer();
    const first = tutor.locator('#scoregrid input.sc').first();
    await first.click(); await tutor.keyboard.type('8,8'); await tutor.keyboard.press('Enter');
    await tutor.waitForSelector('.banner:has-text("No tanquis la pàgina")', { timeout: 10000 });
    await admin.waitForSelector('text=Sense connexió amb el programa', { timeout: 10000 });
    // la taula també segueix treballant
    const inp = admin.locator('#scoregrid input.sc[data-e=e1][data-a=salt]');
    await inp.click(); await admin.keyboard.type('7,7'); await admin.keyboard.press('Enter');
    await startServer();
    await tutor.waitForSelector('[data-st="e1:terra:0"].ok, #tutstatus:has-text("tot enviat")', { timeout: 15000 });
    await admin.waitForFunction(() => document.querySelector('#scoregrid input.sc[data-e=e1][data-a=terra]').value === '8,80', null, { timeout: 15000 });
    await admin.waitForSelector('text=Desat al fitxer', { timeout: 15000 });
    await new Promise(r => setTimeout(r, 1500));
    const d = JSON.parse(readFileSync(dataFile, 'utf8'));
    const e1 = d.competitions[0].entries.find(e => e.id === 'e1');
    assert.equal(e1.scores.salt[0].v, 7.7);
    assert.equal(e1.scores.terra[0].v, 8.8);
  });

  await step('si la taula canvia el codi mentre la tutora no té connexió, les seves notes no es perden', async () => {
    await tutor.context().setOffline(true);
    const inp = tutor.locator('#scoregrid input.sc').nth(1);
    await inp.click(); await tutor.keyboard.type('7,4'); await tutor.keyboard.press('Enter');
    await admin.goto(`http://127.0.0.1:${PORT}/#/competicio/k1/configuracio`);
    await admin.click('button[data-act=newPin]');
    await admin.waitForTimeout(800);
    const pin = await admin.evaluate(() => curComp().tutorPin);
    await tutor.context().setOffline(false);
    await tutor.waitForSelector('text=sense enviar', { timeout: 20000 });
    assert.ok((await tutor.textContent('main')).includes('7,40'));
    await tutor.fill('input[name=pin]', pin);
    await tutor.click('button:has-text("Entra")');
    await tutor.waitForFunction(() => JSON.parse(localStorage.getItem('notesgim.tutor')).queue.length === 0, null, { timeout: 15000 });
    await new Promise(r => setTimeout(r, 800));
    const d = JSON.parse(readFileSync(dataFile, 'utf8'));
    assert.equal(d.competitions[0].entries.find(e => e.id === 'e2').scores.terra[0].v, 7.4);
    await admin.goto(`http://127.0.0.1:${PORT}/#/competicio/k1/notes`);
    await admin.waitForSelector('#scoregrid');
  });

  // ─── només una finestra de la taula pot canviar les dades alhora: la que s'obre (o on es clica «Treballa en aquesta
  // finestra»); l'altra queda en pausa. Com a l'ordinador de la taula, les dues amb el mateix perfil del navegador
  {
    const nap = ms => new Promise(r => setTimeout(r, ms));
    const file = () => JSON.parse(readFileSync(dataFile, 'utf8'));
    const fileEntry = id => file().competitions[0].entries.find(e => e.id === id);
    const spy = p => p.evaluate(() => { if (window.__t) return; window.__t = []; new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.classList && n.classList.contains('toast')) window.__t.push(n.textContent); }).observe(document.body, { childList: true, subtree: true }); });
    const alarms = p => p.evaluate(() => (window.__t || []).filter(x => /s’havien canviat/.test(x)));
    const cellV = (p, e, a) => p.evaluate(([e, a]) => { const i = document.querySelector(`#scoregrid input.sc[data-e=${e}][data-a=${a}]`); return i && i.value; }, [e, a]);
    let other;
    await spy(admin);

    await step('dues finestres de la taula: la que s’obre passa a manar i la d’abans queda en pausa; la nota que s’hi escrivia (sense Intro) es desa abans', async () => {
      const cell = admin.locator('#scoregrid input.sc[data-e=e1][data-a=barra]');
      await cell.click(); await admin.keyboard.type('6,6');
      other = await admin.context().newPage(); watch(other, 'segona finestra');
      await other.goto(`http://127.0.0.1:${PORT}/#/competicio/k1/notes`); await other.waitForSelector('#scoregrid'); await other.waitForSelector('text=Desat al fitxer');
      await spy(other);
      await admin.waitForSelector(`#pause[open] >> text=${PAUSA}`);
      assert.equal(await isPaused(other), false, 'la nova mana');
      await nap(400);
      assert.equal(fileEntry('e1').scores.barra[0].v, 6.6, 'al fitxer');
      assert.equal(await cellV(other, 'e1', 'barra'), '6,60', 'i a la finestra nova');
    });

    await step('la finestra en pausa no pot canviar res: ni el ratolí ni el teclat hi arriben, i el programa no n’accepta cap canvi (423)', async () => {
      const before = readFileSync(dataFile, 'utf8');
      const box = await admin.locator('#scoregrid input.sc[data-e=e2][data-a=barra]').boundingBox();
      await admin.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await admin.keyboard.type('1,5'); await admin.keyboard.press('Enter'); await admin.keyboard.press('Escape');
      await nap(300);
      assert.ok(await isPaused(admin), 'continua en pausa');
      assert.equal(await admin.evaluate(() => api('api/db', { method: 'PUT', body: JSON.stringify({ db, base: server.dataRev, window: WIN }) }).then(() => 200, e => e.status)), 423);
      await nap(300);
      assert.equal(readFileSync(dataFile, 'utf8'), before, 'el fitxer no ha canviat');
    });

    await step('les notes de les tutores arriben a totes dues finestres (a la de la pausa, per veure-les)', async () => {
      const pin = file().competitions[0].tutorPin;
      const r = await fetch(`http://${lan.address}:${PORT}/api/score`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin, compId: 'k1', entryId: 'e2', appId: 'terra', i: 0, value: 8.25, who: 'Marta' }) });
      assert.equal(r.status, 200);
      for (const p of [admin, other]) await p.waitForFunction(() => { const i = document.querySelector('#scoregrid input.sc[data-e=e2][data-a=terra]'); return i && i.value === '8,25' && i.classList.contains('tutor'); }, null, { timeout: 8000 });
      assert.ok(await isPaused(admin));
    });

    await step('«Treballa en aquesta finestra» la torna a fer manar (l’altra queda en pausa), i al revés; cap no trepitja el que ha desat l’altra', async () => {
      await takeOver(admin);
      assert.ok(await isPaused(other));
      // (la casella on s'escrivia en posar-se en pausa torna a dir el que s'hi havia escrit, amb el cursor al final: s'hi
      // continuaria escrivint; aquí s'hi escriu una altra nota)
      assert.deepEqual(await admin.evaluate(() => [document.activeElement.dataset.e, document.activeElement.value, document.activeElement.selectionStart]), ['e1', '6,6', 3]);
      await admin.locator('#scoregrid input.sc[data-e=e1][data-a=barra]').click(); await admin.keyboard.press('Control+A'); await admin.keyboard.type('9,35'); await admin.keyboard.press('Enter');
      await other.waitForFunction(() => document.querySelector('#scoregrid input.sc[data-e=e1][data-a=barra]').value === '9,35', null, { timeout: 8000 });
      await takeOver(other);
      assert.ok(await isPaused(admin));
      await other.locator('#scoregrid input.sc[data-e=e2][data-a=barra]').click(); await other.keyboard.type('7,45'); await other.keyboard.press('Enter');
      await admin.waitForFunction(() => document.querySelector('#scoregrid input.sc[data-e=e2][data-a=barra]').value === '7,45', null, { timeout: 8000 });
      await nap(400);
      assert.deepEqual([fileEntry('e1').scores.barra[0].v, fileEntry('e2').scores.barra[0].v, fileEntry('e2').scores.terra[0].v], [9.35, 7.45, 8.25]);
    });

    await step('el que no s’ha pogut desar en el moment de la pausa (el programa no ho rebia) es queda a la finestra i es pot descarregar; mai no s’escriu a sobre del fitxer', async () => {
      const bib0 = fileEntry('e1').bib;
      await other.evaluate(() => go('#/competicio/k1/inscripcions')); await other.waitForSelector('input[data-chg=bib][data-id=e1]');
      await other.route('**/api/db', r => (r.request().method() === 'PUT' ? r.abort('connectionreset') : r.continue()));
      await other.locator('input[data-chg=bib][data-id=e1]').click(); await other.keyboard.press('Control+A'); await other.keyboard.type('901'); await other.keyboard.press('Tab');
      await nap(600);
      await takeOver(admin);
      await other.waitForSelector('#pause[open] #pauseunsent');
      const [dl] = await Promise.all([other.waitForEvent('download'), other.click('#pause #pauseunsent')]);
      assert.equal(JSON.parse(readFileSync(await dl.path(), 'utf8')).competitions[0].entries.find(e => e.id === 'e1').bib, 901, 'el canvi es pot descarregar');
      assert.equal(await other.evaluate(async () => JSON.parse((await idbGet('abansServidor')).raw).competitions[0].entries.find(e => e.id === 'e1').bib), 901, 'i és a Configuració → Dades');
      await other.unroute('**/api/db');
      await nap(5000);   // (la finestra en pausa no el torna a enviar)
      assert.equal(fileEntry('e1').bib, bib0);
      assert.equal(await admin.evaluate(() => curComp().entries.find(e => e.id === 'e1').bib), bib0);
      assert.equal(await other.evaluate(() => curComp().entries.find(e => e.id === 'e1').bib), bib0, 'la de la pausa ja mostra el que hi ha al fitxer');
    });

    await step('una fitxa oberta a la finestra que queda en pausa: si no ha canviat res, en tornar-hi es pot desar; si l’altra ha esborrat la inscripció, es tanca i es diu (no torna)', async () => {
      await admin.evaluate(() => go('#/competicio/k1/inscripcions')); await admin.waitForSelector('a[data-act=editEntry][data-id=e2]');
      await admin.click('a[data-act=editEntry][data-id=e2]'); await admin.waitForSelector('#dlg[open] input[name=bib]');
      await takeOver(other);
      assert.ok(await isPaused(admin));
      await takeOver(admin);
      assert.ok(await admin.evaluate(() => $('#dlg').open), 'la fitxa continua oberta');
      await admin.fill('#dlg input[name=bib]', '222'); await admin.click('#dlg button.primary'); await nap(800);
      assert.equal(fileEntry('e2').bib, 222);
      const e2 = fileEntry('e2');
      await admin.click('a[data-act=editEntry][data-id=e2]'); await admin.waitForSelector('#dlg[open] input[name=bib]');
      await admin.fill('#dlg input[name=bib]', '333');
      await takeOver(other);
      await other.evaluate(() => { const c = curComp(); c.entries = c.entries.filter(e => e.id !== 'e2'); commit(); });
      await nap(800);
      await takeOver(admin);
      await admin.waitForSelector('.toast:has-text("s’ha tancat el que tenies obert")');
      assert.equal(await admin.evaluate(() => $('#dlg').open), false);
      await nap(500);
      assert.equal(fileEntry('e2'), undefined, 'l’esborrada no torna');
      // (es deixa com era)
      await admin.evaluate(e => { curComp().entries.push(e); db.competitions = migrate(db).competitions; commit(); }, e2);
      await nap(800);
      assert.equal(fileEntry('e2').bib, 222);
    });

    await step('es tanca la finestra que mana: l’altra continua sola (i no hi ha hagut cap alarma)', async () => {
      await takeOver(other);
      assert.deepEqual([...await alarms(admin), ...await alarms(other)], []);
      await other.close();
      await admin.waitForFunction(() => !win.paused, null, { timeout: 8000 });
      await admin.evaluate(() => go('#/competicio/k1/notes')); await admin.waitForSelector('#scoregrid');
      await admin.locator('#scoregrid input.sc[data-e=e1][data-a=barra]').click(); await admin.keyboard.type('9,1'); await admin.keyboard.press('Enter');
      await nap(800);
      assert.equal(fileEntry('e1').scores.barra[0].v, 9.1);
      assert.deepEqual(await alarms(admin), []);
    });
  }

  // ─── sisena revisió (finestres de la taula): el que s'escriu no es desa mai com una altra cosa (ni en passar a una altra
  // finestra, ni si la finestra queda en segon pla), i moltes finestres obertes no l'encallen
  {
    const nap = ms => new Promise(r => setTimeout(r, ms));
    const fileEntry = id => JSON.parse(readFileSync(dataFile, 'utf8')).competitions[0].entries.find(e => e.id === id);
    const cellV = (p, e, a) => p.evaluate(([e, a]) => { const i = document.querySelector(`#scoregrid input.sc[data-e=${e}][data-a=${a}]`); return i && i.value; }, [e, a]);
    const focused = p => p.evaluate(() => { const el = document.activeElement; return { at: el.dataset.e ? el.dataset.e + '/' + el.dataset.a : el.dataset.id, v: el.value, s: [el.selectionStart, el.selectionEnd] }; });
    const terra = () => (fileEntry('e1').scores.terra || [])[0].v;
    const spy = p => p.evaluate(() => { if (window.__t) return; window.__t = []; new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.classList && n.classList.contains('toast')) window.__t.push(n.textContent); }).observe(document.body, { childList: true, subtree: true }); });
    const openWin = async (hash = '#/competicio/k1/notes') => {
      const p = await admin.context().newPage(); watch(p, 'una altra finestra');
      await p.goto(`http://127.0.0.1:${PORT}/${hash}`); await p.waitForSelector('text=Desat al fitxer', { timeout: 15000 });
      return p;
    };
    const unpaused = P => Promise.all(P.map(p => p.evaluate(() => !win.paused))).then(l => l.filter(Boolean).length);
    // la finestra es minimitza o queda tapada (com fa el navegador: el camp es queda el focus, però avisa d'un canvi i de
    // sortir-ne, i la finestra perd el focus), i després torna
    const away = p => p.evaluate(() => {
      const el = document.activeElement;
      document.hasFocus = () => false;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new FocusEvent('blur')); el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      window.dispatchEvent(new FocusEvent('blur'));
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const back = p => p.evaluate(() => {
      delete document.hasFocus; delete document.visibilityState;
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new FocusEvent('focus'));
      const el = document.activeElement;
      el.dispatchEvent(new FocusEvent('focus')); el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    });

    await step('una nota a mig escriure («8,» de 8,5) quan s’obre una altra finestra no es desa; en tornar-hi (amb el botó o perquè l’altra es tanca) s’hi continua escrivint on s’havia deixat i es desa el que es volia', async () => {
      for (const [how, a, b] of [['botó', '8,', '5'], ['es tanca', '7,', '4']]) {
        const before = terra();
        await admin.bringToFront();
        await admin.locator('#scoregrid input.sc[data-e=e1][data-a=terra]').click(); await admin.keyboard.type(a);
        const B = await openWin();
        await admin.waitForSelector('#pause[open]');
        await nap(600);
        assert.equal(terra(), before, `${how}: «${a}» no es desa`);
        assert.equal(await cellV(B, 'e1', 'terra'), await B.evaluate(v => fmt(Engine.toM(v)), before), 'l’altra finestra té la nota d’abans');
        if (how === 'botó') { await takeOver(admin); assert.ok(await isPaused(B)); await B.close(); }
        else { await B.close({ runBeforeUnload: true }); await admin.waitForFunction(() => !win.paused, null, { timeout: 5000 }); }
        assert.deepEqual(await focused(admin), { at: 'e1/terra', v: a, s: [a.length, a.length] }, `${how}: el camp tal com era, amb el cursor al final (no tot seleccionat)`);
        await admin.keyboard.type(b); await admin.keyboard.press('Enter'); await nap(700);
        assert.equal(terra(), +(a + b).replace(',', '.'), `${how}: es desa ${a}${b}`);
      }
      // una nota acabada sense Intro sí que es desa abans de la pausa, i en tornar-hi també s'hi continua escrivint
      await admin.locator('#scoregrid input.sc[data-e=e1][data-a=terra]').click(); await admin.keyboard.type('6,6');
      const B = await openWin();
      await admin.waitForSelector('#pause[open]'); await nap(500);
      assert.equal(terra(), 6.6, 'la nota acabada es desa');
      assert.equal(await cellV(B, 'e1', 'terra'), '6,60');
      await takeOver(admin); await B.close();
      assert.deepEqual(await focused(admin), { at: 'e1/terra', v: '6,6', s: [3, 3] });
      await admin.keyboard.type('5'); await admin.keyboard.press('Enter'); await nap(700);
      assert.equal(terra(), 6.65);
    });

    await step('un dorsal a mig escriure («1» de 14, i l’1 ja el té una altra gimnasta) quan s’obre una altra finestra: no es desa cap dorsal repetit, i en tornar-hi «4» + Tab desa el 14', async () => {
      await admin.evaluate(() => go('#/competicio/k1/inscripcions')); await admin.waitForSelector('input[data-chg=bib][data-id=e3]');
      const d = String(fileEntry('e1').bib), bib3 = fileEntry('e3').bib;
      await admin.locator('input[data-chg=bib][data-id=e3]').click(); await admin.keyboard.press('Control+A'); await admin.keyboard.type(d);
      const B = await openWin('#/competicio/k1/inscripcions');
      await admin.waitForSelector('#pause[open]'); await nap(500);
      assert.equal(fileEntry('e3').bib, bib3, 'cap dorsal repetit al fitxer');
      await takeOver(admin); await B.close();
      assert.deepEqual(await focused(admin), { at: 'e3', v: d, s: [d.length, d.length] });
      await admin.keyboard.type('4'); await admin.keyboard.press('Tab'); await nap(700);
      assert.equal(fileEntry('e3').bib, +(d + '4'));
    });

    await step('la finestra es minimitza o queda tapada amb «8,» escrit: no es desa ni es toca res; en tornar-hi, «5» + Intro desa 8,5 (i un dorsal escrit es desa en sortir-ne amb Tab)', async () => {
      await admin.evaluate(() => go('#/competicio/k1/notes')); await admin.waitForSelector('#scoregrid');
      const before = terra();
      await admin.locator('#scoregrid input.sc[data-e=e1][data-a=terra]').click(); await admin.keyboard.type('8,');
      await away(admin); await nap(700);
      assert.equal(terra(), before, '«8,» no es desa');
      assert.deepEqual(await focused(admin), { at: 'e1/terra', v: '8,', s: [2, 2] }, 'ni es canvia el que hi ha escrit');
      await back(admin);
      assert.deepEqual(await focused(admin), { at: 'e1/terra', v: '8,', s: [2, 2] }, 'en tornar-hi, el cursor on era (no tot seleccionat)');
      await admin.keyboard.type('5'); await admin.keyboard.press('Enter'); await nap(700);
      assert.equal(terra(), 8.5);
      assert.equal(await cellV(admin, 'e1', 'terra'), '8,50');
      // un dorsal: el navegador avisa d'un canvi en minimitzar, però no es desa fins que se'n surt
      await admin.evaluate(() => go('#/competicio/k1/inscripcions')); await admin.waitForSelector('input[data-chg=bib][data-id=e3]');
      const bib3 = fileEntry('e3').bib;
      await admin.locator('input[data-chg=bib][data-id=e3]').click(); await admin.keyboard.press('Control+A'); await admin.keyboard.type('77');
      await away(admin); await nap(700);
      assert.equal(fileEntry('e3').bib, bib3, 'el dorsal encara no es desa');
      await back(admin);
      await admin.keyboard.press('Tab'); await nap(700);
      assert.equal(fileEntry('e3').bib, 77, 'en sortir-ne, sí');
      await admin.evaluate(() => go('#/competicio/k1/notes')); await admin.waitForSelector('#scoregrid');
    });

    await step('«Desfés» es torna a oferir en tornar a la finestra on s’ha fet el canvi, si mentrestant no ha canviat res', async () => {
      await admin.locator('#scoregrid input.sc[data-e=e1][data-a=salt]').click(); await admin.keyboard.type('np'); await admin.keyboard.press('Enter');
      await admin.waitForSelector('.toast:has-text("no presentada") button:has-text("Desfés")'); await nap(600);
      assert.equal(fileEntry('e1').status, 'np');
      const B = await openWin();
      await admin.waitForSelector('#pause[open]');
      assert.equal(await B.locator('.toast button:has-text("Desfés")').count(), 0);
      await nap(1500);
      await takeOver(admin);
      await admin.locator('.toast:has-text("no presentada") button:has-text("Desfés")').click();
      await admin.waitForSelector('.toast:has-text("Desfet.")'); await nap(700);
      assert.equal(fileEntry('e1').status, '', 'desfet al fitxer');
      // (si mentrestant l'altra finestra hi ha canviat res, ja no)
      await admin.locator('#scoregrid input.sc[data-e=e1][data-a=salt]').click(); await admin.keyboard.type('np'); await admin.keyboard.press('Enter');
      await admin.waitForSelector('.toast:has-text("no presentada") button:has-text("Desfés")');
      await takeOver(B);
      await B.evaluate(() => { S().org = 'ORG DE B'; commit(); }); await nap(700);
      await takeOver(admin);
      await nap(300);
      assert.equal(await admin.locator('.toast button:has-text("Desfés")').count(), 0, 'cap Desfés de les dades d’abans');
      await B.close();
      await admin.evaluate(() => { curComp().entries.find(e => e.id === 'e1').status = ''; commit(); }); await nap(700);
      assert.equal(fileEntry('e1').status, '');
    });

    await step('7 finestres obertes (NotesGim obert moltes vegades): es desa de seguida, «Treballa en aquesta finestra» va de seguida i desa el que s’escrivia a l’altra, una de nova s’obre de seguida, i mai no n’hi ha dues que manin', async () => {
      const W = [];
      for (let i = 0; i < 6; i++) { const t = Date.now(); W.push(await openWin()); assert.ok(Date.now() - t < 5000, `la finestra ${i + 2} triga ${Date.now() - t} ms a obrir-se`); }
      const all = [admin, ...W], act = W[5];
      await nap(2500);
      assert.equal(await unpaused(all), 1, 'només una mana');
      assert.ok(!(await isPaused(act)), 'la darrera que s’ha obert');
      await act.locator('#scoregrid input.sc[data-e=e2][data-a=terra]').click(); await act.keyboard.type('9,15'); await act.keyboard.press('Enter');
      let t = Date.now();
      while (Date.now() - t < 8000 && (fileEntry('e2').scores.terra || [])[0].v !== 9.15) await nap(100);
      assert.ok(Date.now() - t < 1500, `la nota arriba al fitxer en ${Date.now() - t} ms`);
      await act.locator('#scoregrid input.sc[data-e=e2][data-a=salt]').click(); await act.keyboard.type('6,6');
      await admin.bringToFront();
      t = Date.now();
      await takeOver(admin);
      assert.ok(Date.now() - t < 3000, `«Treballa en aquesta finestra» triga ${Date.now() - t} ms`);
      await nap(600);
      assert.equal(fileEntry('e2').scores.salt[0].v, 6.6, 'el que s’escrivia a l’altra finestra es desa');
      assert.equal(await act.evaluate(() => !!win.unsent), false);
      assert.equal(await unpaused(all), 1);
      t = Date.now(); const W8 = await openWin(); assert.ok(Date.now() - t < 5000, `la vuitena finestra triga ${Date.now() - t} ms`);
      await nap(1000);
      assert.equal(await unpaused([...all, W8]), 1);
      for (const p of [...W, W8]) await p.close();
      await admin.waitForFunction(() => !win.paused, null, { timeout: 5000 });
    });

    await step('es tanca la finestra que mana just després d’un canvi: el canvi arriba al fitxer i l’altra continua de seguida (no al cap de 40 s)', async () => {
      const B = await openWin();
      await admin.waitForSelector('#pause[open]');
      await B.locator('#scoregrid input.sc[data-e=e2][data-a=terra]').click(); await B.keyboard.type('7,35'); await B.keyboard.press('Enter');
      const t = Date.now();
      await B.close({ runBeforeUnload: true });
      await admin.waitForFunction(() => !win.paused, null, { timeout: 8000 });
      assert.ok(Date.now() - t < 3000, `l’altra continua al cap de ${Date.now() - t} ms`);
      assert.equal(fileEntry('e2').scores.terra[0].v, 7.35);
      await admin.waitForFunction(() => document.querySelector('#scoregrid input.sc[data-e=e2][data-a=terra]').value === '7,35', null, { timeout: 3000 });
      // dos canvis seguits, i es tanca quan el primer encara s'està enviant (el programa triga a desar: un USB lent; aquí, un
      // intermediari que l'endarrereix): tots dos arriben, i l'altra continua de seguida
      let slow = false;
      const px = http.createServer((req, res) => {
        const go = () => { const up = http.request({ host: '127.0.0.1', port: PORT, path: req.url, method: req.method, headers: req.headers }, r => { res.writeHead(r.statusCode, r.headers); r.pipe(res); }); up.on('error', () => res.destroy()); req.pipe(up); };
        if (slow && req.method === 'PUT' && req.url.startsWith('/api/db')) { slow = false; setTimeout(go, 600); } else go();
      });
      await new Promise(r => px.listen(0, '127.0.0.1', r));
      try {
        const C = await admin.context().newPage(); watch(C, 'finestra lenta');
        await C.goto(`http://127.0.0.1:${px.address().port}/#/competicio/k1/notes`); await C.waitForSelector('text=Desat al fitxer', { timeout: 15000 });
        await admin.waitForSelector('#pause[open]');
        slow = true;
        await C.locator('#scoregrid input.sc[data-e=e1][data-a=salt]').click(); await C.keyboard.type('7,1'); await C.keyboard.press('Enter');
        await nap(300);
        await C.keyboard.type('7,2'); await C.keyboard.press('Enter');
        await nap(250);
        assert.deepEqual(await C.evaluate(() => [server.pushing, server.again]), [true, true], 'el segon espera que acabi el primer');
        const t2 = Date.now();
        await C.close({ runBeforeUnload: true });
        await admin.waitForFunction(() => !win.paused, null, { timeout: 8000 });
        assert.ok(Date.now() - t2 < 4000, `l’altra continua al cap de ${Date.now() - t2} ms`);
        await nap(300);
        assert.deepEqual([fileEntry('e1').scores.salt[0].v, fileEntry('e2').scores.salt[0].v], [7.1, 7.2], 'tots dos canvis són al fitxer');
      } finally { px.close(); }
    });

    await step('el programa es tanca just quan s’obre una altra finestra (entre api/info i api/claim): la finestra diu «Connectant…» i s’obre sola quan torna', async () => {
      await admin.route('**/api/release', () => {});   // (la que mana no la deixa: la nova espera)
      const B = await admin.context().newPage(); watch(B, 'finestra que s’obre');
      const g = B.goto(`http://127.0.0.1:${PORT}/#/competicio/k1/notes`);
      await B.waitForRequest(r => r.url().includes('api/claim'));
      await nap(300);
      await new Promise(r => { proc.once('exit', r); proc.kill('SIGKILL'); });
      await g.catch(() => {});
      await nap(1500);
      await startServer();
      await B.waitForSelector('#scoregrid', { timeout: 15000 }); await B.waitForSelector('text=Desat al fitxer', { timeout: 15000 });
      await admin.unroute('**/api/release');
      await takeOver(admin); await B.close();
    });

    await step('«Tanca NotesGim» a la finestra que mana: la que és en pausa diu que NotesGim s’ha tancat (no que s’està fent servir en una altra), i quan es torna a obrir continua sola', async () => {
      const B = await openWin('#/competicions');
      await admin.waitForSelector('#pause[open]');
      await spy(admin);
      const exited = new Promise(r => proc.once('exit', r));
      await B.click('button[data-act=quitApp]'); await B.waitForSelector('#confirm[open]'); await B.click('#confirm button[value=ok]');
      await B.waitForSelector('text=NotesGim s’ha tancat');
      await exited;
      await admin.waitForSelector('#pause[open] >> text=NotesGim s’ha tancat o no respon', { timeout: 4000 });
      assert.ok(!(await admin.locator('#pause').innerText()).includes('altra finestra'));
      await admin.click('#pause #pausetake'); await nap(1500);
      assert.ok((await admin.locator('#pause').innerText()).includes('NotesGim s’ha tancat o no respon'), 'el botó també ho diu');
      assert.deepEqual(await admin.evaluate(() => window.__t.filter(x => /no respon: torna-ho/.test(x))), []);
      await startServer();
      await admin.waitForFunction(() => !win.paused, null, { timeout: 15000 });
      await B.close();
      await admin.evaluate(() => go('#/competicio/k1/notes')); await admin.waitForSelector('#scoregrid');
    });
  }

  await step('restaurar una còpia amb el programa: tornen les notes de la còpia', async () => {
    const backup = JSON.parse(readFileSync(dataFile, 'utf8'));
    const before = backup.competitions[0].entries.find(e => e.id === 'e1').scores.salt[0].v;
    const inp = admin.locator('#scoregrid input.sc[data-e=e1][data-a=salt]');
    await inp.click(); await admin.keyboard.type('5'); await admin.keyboard.press('Enter');
    await new Promise(r => setTimeout(r, 800));
    const f = path.join(out, 'copia.json'); writeFileSync(f, JSON.stringify(backup));
    await admin.goto(`http://127.0.0.1:${PORT}/#/configuracio`);
    await admin.evaluate(() => { window.showOpenFilePicker = undefined; });
    const [chooser] = await Promise.all([admin.waitForEvent('filechooser'), admin.click('button[data-act=restore]')]);
    await chooser.setFiles(f);
    await admin.click('#confirm button[value=ok]');
    await new Promise(r => setTimeout(r, 1500));
    const d = JSON.parse(readFileSync(dataFile, 'utf8'));
    assert.equal(d.competitions[0].entries.find(e => e.id === 'e1').scores.salt[0].v, before);
    await admin.goto(`http://127.0.0.1:${PORT}/#/competicio/k1/notes`);
    await admin.waitForSelector('#scoregrid');
  });

  await step('si el programa no pot escriure al fitxer, la taula ho diu (sense bucles) i es torna a desar sol', async () => {
    mkdirSync(dataFile + '.tmp');   // ara no s'hi pot escriure
    let puts = 0;
    const count = r => { if (r.url().includes('/api/db') && r.method() === 'PUT') puts++; };
    admin.on('request', count);
    await admin.goto(`http://127.0.0.1:${PORT}/#/configuracio`);
    await admin.fill('input[data-k=org]', 'ORG SENSE DISC'); await admin.press('input[data-k=org]', 'Tab');
    await admin.waitForSelector('#savestate >> text=No es pot desar al fitxer', { timeout: 8000 });
    await admin.waitForSelector('.toast:has-text("no s\'ha pogut desar al fitxer")');
    await new Promise(r => setTimeout(r, 5000));
    assert.ok(puts <= 4, `massa intents de desar: ${puts}`);
    assert.equal(await admin.locator('.toast', { hasText: 'altra finestra' }).count(), 0);
    // «Tanca NotesGim» avisa que ara no es pot desar (i es pot fer-se enrere)
    await admin.click('button[data-act=quitApp]');
    await admin.waitForSelector('#confirm[open] >> text=Ara no es pot desar al fitxer');
    await admin.click('#confirm button[value=no]');
    rmSync(dataFile + '.tmp', { recursive: true, force: true });
    await admin.waitForSelector('.toast:has-text("Ja es torna a desar al fitxer")', { timeout: 12000 });
    admin.off('request', count);
    assert.equal(JSON.parse(readFileSync(dataFile, 'utf8')).settings.org, 'ORG SENSE DISC');
    await admin.goto(`http://127.0.0.1:${PORT}/#/competicio/k1/notes`);
    await admin.waitForSelector('#scoregrid');
  });

  await step('competició tancada: la tutora ja no pot entrar notes (i el mòbil diu que la taula les ha bloquejat, no «Codi incorrecte»)', async () => {
    await admin.click('button[data-act=toggleLock]');
    await new Promise(r => setTimeout(r, 1000));
    await tutor.reload();
    await tutor.waitForSelector('text=Notes bloquejades');
    const txt = (await tutor.textContent('#main')).replace(/\s+/g, ' ');
    assert.ok(txt.includes('La taula ha bloquejat les notes d’aquesta competició: ja no se’n poden entrar.') && !txt.includes('Codi incorrecte'), txt);
  });
  await admin.screenshot({ path: path.join(out, 'taula.png'), fullPage: true });
  await tutor.screenshot({ path: path.join(out, 'tutora.png'), fullPage: true });

  await step('«Esborra-ho tot» amb el programa: abans se’n guarda una còpia a copies-notesgim; Desfés ho torna', async () => {
    const copies = path.join(out, 'copies-notesgim');
    const n0 = readdirSync(copies).filter(f => f.endsWith('-abans-d-esborrar.json')).length;
    await admin.goto(`http://127.0.0.1:${PORT}/#/configuracio`);
    await admin.click('button[data-act=wipe]');
    await admin.waitForSelector('#dlg form[data-form=wipe] >> text=copies-notesgim');
    await admin.click('#dlg form[data-form=wipe] button.danger');
    await admin.waitForSelector('.toast:has-text("Abans se n’ha guardat una còpia a copies-notesgim")');
    await new Promise(r => setTimeout(r, 1500));
    const d = JSON.parse(readFileSync(dataFile, 'utf8'));
    assert.equal(d.gymnasts.length + d.competitions.length + d.clubs.length, 0, 'el fitxer queda buit');
    const made = readdirSync(copies).filter(f => f.endsWith('-abans-d-esborrar.json')).sort();
    assert.equal(made.length, n0 + 1, 'abans d’esborrar es guarda una còpia (només una)');
    assert.equal(JSON.parse(readFileSync(path.join(copies, made[made.length - 1]), 'utf8')).gymnasts.length, 3);
    await admin.locator('.toast button:has-text("Desfés")').last().click();
    await admin.waitForSelector('.toast:has-text("Desfet.")');
    await new Promise(r => setTimeout(r, 1500));
    assert.equal(JSON.parse(readFileSync(dataFile, 'utf8')).gymnasts.length, 3, 'Desfés ho torna al fitxer');
  });

  await step('el programa nou comença de zero: les dades de les proves d’abans es guarden apart i la finestra no les recupera', async () => {
    await stopServer();
    // un fitxer d'una versió de proves (sense settings.dataGen); la finestra encara té les seves dades
    writeFileSync(dataFile, JSON.stringify({ app: 'notesgim', version: 1, clubs: [{ id: 'cv', name: 'Club Vell' }],
      gymnasts: [{ id: 'gv', name: 'Vella', surname: 'Proves', clubId: 'cv', gender: 'F', category: 'Aleví', level: 'A' }], teams: [], competitions: [],
      settings: { rev: 4 }, meta: { updated: new Date().toISOString(), dbId: 'proves-velles' } }));
    // (i la finestra, les seves d'una versió de proves, sense dataGen)
    // (en carregar la pàgina, abans que l'app les llegeixi: si no, la finestra oberta les tornaria a desar en sortir)
    await admin.context().addInitScript(() => {
      if (sessionStorage.getItem('dades-de-proves')) return;
      sessionStorage.setItem('dades-de-proves', '1');
      const d = JSON.parse(localStorage.getItem('notesgim.db')); delete d.settings.dataGen; localStorage.setItem('notesgim.db', JSON.stringify(d));
    });
    assert.ok(await admin.evaluate(() => JSON.parse(localStorage.getItem('notesgim.db')).gymnasts.length) > 0);
    await startServer();
    await admin.goto(`http://127.0.0.1:${PORT}/#/gimnastes`); await admin.reload();
    await admin.waitForSelector('.toast:has-text("Comences de zero")');
    assert.equal(await admin.evaluate(() => db.gymnasts.length + db.competitions.length + db.clubs.length), 0, 'no hi ha res de les dades d’abans');
    const kept = readdirSync(out).filter(f => /^notesgim-dades-proves-.*\.json$/.test(f));
    assert.equal(kept.length, 1, 'les dades de les proves no s’esborren');
    assert.ok(readFileSync(path.join(out, kept[0]), 'utf8').includes('Vella'));
    await new Promise(r => setTimeout(r, 1500));
    const d = JSON.parse(readFileSync(dataFile, 'utf8'));
    assert.equal(d.settings.dataGen, 2); assert.equal(d.gymnasts.length, 0);
    // tornar a obrir: continua buit i l'avís ja no hi surt
    await admin.reload();
    await admin.waitForSelector('text=Desat al fitxer');
    await new Promise(r => setTimeout(r, 500));
    assert.equal(await admin.locator('.toast:has-text("Comences de zero")').count(), 0);
    assert.equal(await admin.evaluate(() => db.gymnasts.length), 0);
    // i un altre cop amb el programa tancat i tornat a obrir
    await stopServer(); await startServer();
    await admin.reload();
    await admin.waitForSelector('text=Desat al fitxer');
    assert.equal(await admin.evaluate(() => db.gymnasts.length), 0);
    assert.equal(readdirSync(out).filter(f => /^notesgim-dades-proves-.*\.json$/.test(f)).length, 1);
  });

  await step('una altra finestra (un altre navegador) amb dades d’abans no les torna a posar al fitxer buit', async () => {
    const gyms = () => JSON.parse(readFileSync(dataFile, 'utf8')).gymnasts.length;
    const seedWin = async db => {
      const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
      await ctx.addInitScript(r => { if (!localStorage.getItem('notesgim.db')) localStorage.setItem('notesgim.db', r); }, JSON.stringify(db));
      const p = await ctx.newPage(); watch(p, 'altra finestra');
      await p.goto(`http://127.0.0.1:${PORT}/#/gimnastes`);
      await p.waitForSelector('text=Desat al fitxer');
      return p;
    };
    const G = id => ({ id, name: 'Vella' + id, surname: 'Proves', clubId: 'cv', gender: 'F', category: 'Aleví', level: 'A' });
    // dades de les versions de proves (sense dataGen)
    const a = await seedWin({ app: 'notesgim', version: 1, settings: { rev: 4 }, clubs: [{ id: 'cv', name: 'Club Vell' }], gymnasts: [G('v1'), G('v2')], teams: [], competitions: [],
      meta: { updated: new Date().toISOString(), dbId: 'proves-velles' } });
    await a.waitForSelector('.toast:has-text("Comences de zero")');
    assert.equal(await a.evaluate(() => db.gymnasts.length), 0);
    await new Promise(r => setTimeout(r, 1200));
    assert.equal(gyms(), 0, 'el fitxer continua buit');
    // dades d'ara d'una altra finestra (unes altres dades): al fitxer nou no s'hi ha desat mai res, s'hi posen
    const b = await seedWin({ app: 'notesgim', version: 1, settings: { rev: 4, dataGen: 2 }, clubs: [], gymnasts: [G('n1')], teams: [], competitions: [],
      meta: { updated: new Date(Date.now() + 60000).toISOString(), dbId: 'unes-altres' } });
    await new Promise(r => setTimeout(r, 1200));
    assert.equal(await b.evaluate(() => db.gymnasts.length), 1);
    assert.equal(gyms(), 1, 'les dades d’ara de la finestra van al fitxer nou');
    // «Esborra-ho tot» des d'aquesta finestra: una tercera amb unes altres dades d'ara ja no les hi posa
    await b.goto(`http://127.0.0.1:${PORT}/#/configuracio`);
    await b.click('button[data-act=wipe]');
    await b.click('#dlg form[data-form=wipe] button.danger');
    await b.waitForSelector('.toast:has-text("Esborrat:")');
    await new Promise(r => setTimeout(r, 1200));
    assert.equal(gyms(), 0);
    const c = await seedWin({ app: 'notesgim', version: 1, settings: { rev: 4, dataGen: 2 }, clubs: [], gymnasts: [G('t1'), G('t2')], teams: [], competitions: [],
      meta: { updated: new Date(Date.now() + 120000).toISOString(), dbId: 'unes-terceres' } });
    await c.waitForSelector('.toast:has-text("S’han obert les dades del fitxer")');
    assert.equal(await c.evaluate(() => db.gymnasts.length), 0);
    await new Promise(r => setTimeout(r, 1200));
    assert.equal(gyms(), 0, 'el fitxer continua buit');
    // un fitxer amb només entitats (el començament d'un curs) tampoc no el trepitja una finestra amb unes altres dades
    await c.evaluate(() => { db.clubs.push({ id: 'cn', name: 'Entitat del curs nou' }); commit(); });
    await new Promise(r => setTimeout(r, 1200));
    const e = await seedWin({ app: 'notesgim', version: 1, settings: { rev: 4, dataGen: 2 }, clubs: [], gymnasts: [G('u1'), G('u2'), G('u3')], teams: [], competitions: [],
      meta: { updated: new Date(Date.now() + 180000).toISOString(), dbId: 'usb-any-passat' } });
    await e.waitForSelector('.toast:has-text("S’han obert les dades del fitxer")');
    await new Promise(r => setTimeout(r, 1200));
    const f = JSON.parse(readFileSync(dataFile, 'utf8'));
    assert.deepEqual([f.gymnasts.length, f.clubs.map(x => x.name)], [0, ['Entitat del curs nou']], 'les entitats del fitxer es queden');
    assert.equal(await e.evaluate(async () => { const r = await idbGet('abansServidor'); return r && JSON.parse(r.raw).gymnasts.length; }), 3, 'les de la finestra es guarden');
    await e.context().close();
    // però si el fitxer s'ha perdut (no hi és), la finestra hi torna a posar les seves (les d'ara)
    // (la c era en pausa des que s'ha obert la e: hi torna a manar)
    await takeOver(c);
    await c.evaluate(() => { db.gymnasts.push({ id: 'n2', name: 'Nova', surname: 'Dara', clubId: null, gender: 'F', category: 'Aleví', level: 'A' }); commit(); });
    await new Promise(r => setTimeout(r, 1200));
    assert.equal(gyms(), 1);
    await stopServer(); rmSync(dataFile, { force: true }); await startServer();
    await c.reload();
    await c.waitForSelector('text=Desat al fitxer');
    await new Promise(r => setTimeout(r, 1200));
    assert.equal(gyms(), 1, 'la finestra torna a posar les seves dades (d’ara) al fitxer que s’ha perdut');
    await c.context().close();
    await a.context().close(); await b.context().close();
  });

  // ─── quarta revisió (dades): cada prova té el seu fitxer (el programa d'aquí dalt s'atura i al final es torna a engegar)
  await stopServer();
  const procs = [];   // (els programes d'aquestes proves: si una falla, cap no es queda engegat)
  const kill = (p, sig = 'SIGTERM') => new Promise(r => { if (p.exitCode !== null || p.signalCode !== null) r(); else { p.once('exit', r); p.kill(sig); } });
  try {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const run = async file => {
      const p = spawn(bin, ['-dades', file, '-port', String(PORT), '-sense-navegador'], { stdio: 'pipe' });
      procs.push(p);
      for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/api/info`)).ok) return p; } catch {} await sleep(100); }
      throw new Error('el servidor no arrenca');
    };
    const dirOf = n => { const d = path.join(out, 'r4-' + n); rmSync(d, { recursive: true, force: true }); mkdirSync(d, { recursive: true }); return d; };
    const read = f => JSON.parse(readFileSync(f, 'utf8'));
    const G = (id, name) => ({ id, name, surname: 'S', clubId: 'c1', gender: 'F', category: 'Aleví', level: 'A' });
    const E = (id, g, bib, scores = {}) => ({ id, gymnastId: g, clubId: 'c1', gender: 'F', category: 'Aleví', level: 'A', bib, status: '', scores });
    const data = (dbId, updated, { gyms = [G('g1', 'Anna'), G('g2', 'Berta')], comps, clubs = [{ id: 'c1', name: 'CG Lleida' }] } = {}) => ({ app: 'notesgim', version: 1, settings: { dataGen: 2, rev: 4 },
      clubs, gymnasts: gyms, teams: [], competitions: comps || [{ id: 'k1', name: 'Fase 1', date: '2027-01-22', place: 'Lleida', season: '2026-2027', tutorsOn: true, tutorPin: '4321',
        entries: gyms.map((g, i) => E('e' + (i + 1), g.id, i + 1)), teams: [] }], meta: { created: new Date(updated - 864e5).toISOString(), updated: new Date(updated).toISOString(), dbId } });
    // una finestra (un perfil del navegador) que recorda els avisos
    const windowCtx = async () => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
      await ctx.addInitScript(() => { window.__toasts = []; new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.classList && n.classList.contains('toast')) window.__toasts.push(n.textContent); }).observe(document, { childList: true, subtree: true }); });
      return ctx;
    };
    const open = async (ctx, hash = '#/competicions') => {
      const p = await ctx.newPage(); watch(p, 'r4');
      await p.goto(`http://127.0.0.1:${PORT}/${hash}`);
      await p.waitForFunction(() => typeof server !== 'undefined' && server.on && server.dataRev != null && !server.pushing, null, { timeout: 15000 });
      await sleep(600);
      return p;
    };
    const tutorPost = body => fetch(`http://${lan.address}:${PORT}/api/score`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ pin: '4321', compId: 'k1', i: 0, who: 'Marta' }, body)) });
    const kept = p => p.evaluate(async () => { const b = await idbGet('abansServidor'); return b ? JSON.parse(b.raw).gymnasts.map(g => g.name) : null; });

    await step('la tutora corregeix una nota just quan la taula la dona per revisada: la correcció (que el programa ha acceptat) no es perd i torna a sortir en groc', async () => {
      const f = path.join(dirOf('revisio'), 'notesgim-dades.json');
      writeFileSync(f, JSON.stringify(data('r4rev', Date.now() - 60000)));
      const p = await run(f);
      try {
        const T = await open(await windowCtx(), '#/competicio/k1/notes');
        assert.equal((await tutorPost({ entryId: 'e1', appId: 'barra', value: 8.5, op: 'r4-a' })).status, 200);
        const cell = '#scoregrid input.sc[data-e=e1][data-a=barra]';
        await T.waitForSelector(cell + '.tutor');
        // el que desa la taula (la revisió) arriba tard al programa: mentrestant, la correcció de la tutora
        const held = []; let hold = true;
        await T.route('**/api/db', r => { if (hold && r.request().method() === 'PUT') held.push(r); else r.continue(); });
        await T.click('#tutorreview');
        await T.waitForFunction(() => curComp().entries[0].scores.barra[0].ok === true);
        await sleep(400);
        assert.equal((await tutorPost({ entryId: 'e1', appId: 'barra', value: 9.5, op: 'r4-b' })).status, 200, 'el programa accepta la correcció');
        await sleep(300);
        hold = false; for (const r of held) await r.continue();
        await T.waitForFunction(c => { const i = document.querySelector(c); return i && i.value === '9,50' && i.classList.contains('tutor'); }, cell, { timeout: 8000 });
        await sleep(1200);
        const a = read(f).competitions[0].entries[0].scores.barra[0];
        assert.deepEqual([a.v, !!a.ok], [9.5, false], 'al fitxer, la correcció sense revisar');
        await T.context().close();
      } finally { await kill(p); }
    });

    {
      const f = path.join(dirOf('reenvia'), 'notesgim-dades.json');
      writeFileSync(f, JSON.stringify(data('r4re', Date.now() - 60000)));
      const p = await run(f);
      let T, t;
      try {
        await step('la resposta a una nota de la tutora es perd (Wi-Fi) i el mòbil la torna a enviar: si la taula l’ha esborrada, no torna', async () => {
          T = await open(await windowCtx(), '#/competicio/k1/notes');
          t = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
          watch(t, 'tutora r4');
          await t.goto(`http://${lan.address}:${PORT}/#codi=4321`);
          await t.waitForSelector('text=Quin aparell puntues?');
          await t.click('button[data-act=tutApp][data-a=barra]'); await t.waitForSelector('#qe');
          let lose = 1;
          await t.context().route('**/api/score', async r => { if (lose-- > 0) { await r.fetch(); return r.abort('connectionreset'); } return r.continue(); });
          for (const k of ['7', ',', '5']) await t.click(`.qe-keys button[data-k="${k}"]`);
          await t.click('#qesave');
          const cell = '#scoregrid input.sc[data-e=e1][data-a=barra]';
          await T.waitForSelector(cell + '.tutor');
          await T.click(cell); await T.keyboard.press('Backspace'); await T.keyboard.press('Enter');
          await t.waitForFunction(() => !JSON.parse(localStorage.getItem('notesgim.tutor')).queue.length, null, { timeout: 15000 });
          await sleep(1500);
          const a = (read(f).competitions[0].entries[0].scores.barra || [])[0] || {};
          assert.ok(a.v === undefined || a.v === null, 'la nota esborrada no ha tornat: ' + JSON.stringify(a));
          assert.equal(await T.inputValue(cell), '');
        });

        await step('el mòbil es torna a carregar mentre el programa no respon: diu «Connectant…» amb les notes guardades (mai l’app sencera) i les envia quan torna', async () => {
          let block = true;
          await t.context().route('**/api/**', r => (block ? r.abort('connectionreset') : r.continue()));
          for (const k of ['8', ',', '2']) await t.click(`.qe-keys button[data-k="${k}"]`);
          await t.click('#qesave');
          await sleep(300);
          await t.reload({ waitUntil: 'domcontentloaded' });
          await t.waitForSelector('text=Connectant amb l’ordinador de la taula');
          await t.waitForSelector('#main >> text=1 nota guardada al mòbil');
          await sleep(4000);
          assert.equal(await t.evaluate(() => !!document.querySelector('[data-act=newComp]') || server.on), false, 'no s’obre l’app sencera');
          assert.ok((await t.textContent('#main')).includes('Connectant amb l’ordinador de la taula'));
          block = false;
          await t.waitForSelector('#qe', { timeout: 20000 });
          await t.waitForFunction(() => !JSON.parse(localStorage.getItem('notesgim.tutor')).queue.length, null, { timeout: 15000 });
          await sleep(800);
          assert.equal(read(f).competitions[0].entries[1].scores.barra[0].v, 8.2);
        });
      } finally {
        if (t) await t.context().close();
        if (T) await T.context().close();
        await kill(p);
      }
    }

    // ─── cinquena revisió: el mòbil de les tutores (la cua de notes és una sola per a tot el mòbil, i cada nota té el seu id)
    {
      const G12 = Array.from({ length: 12 }, (_, k) => G('g' + (k + 1), 'Nom' + (k + 1)));
      const scoreOf = (f, id, app) => ((((read(f).competitions[0].entries.find(e => e.id === id) || {}).scores || {})[app] || [])[0]) || {};
      const phone = (name, w = 390, h = 844) => playwright.chromium.launchPersistentContext(dirOf('perfil-' + name), { viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
      const enter = async (P, app = 'barra', pin = '4321') => {
        await P.goto(`http://${lan.address}:${PORT}/#codi=${pin}`); await P.waitForSelector('text=Quin aparell puntues?');
        await P.tap(`button[data-act=tutApp][data-a=${app}]`); await P.waitForSelector('#qe');
      };
      const typeSave = async (P, keys) => { for (const k of keys) await P.tap(`.qe-keys button[data-k="${k}"]`); await P.tap('#qesave'); await sleep(150); };
      const server5 = async name => {
        const f = path.join(dirOf(name), 'notesgim-dades.json');
        writeFileSync(f, JSON.stringify(data('r5' + name, Date.now() - 60000, { gyms: G12 })));
        const p = await run(f);
        // (la finestra de la taula desa la competició una vegada: llavors el programa en té els aparells)
        const T = await open(await windowCtx(), '#/competicio/k1/notes');
        return { f, p, T };
      };

      await step('dues pestanyes al mòbil: la que estava adormida (mòbil bloquejat) no torna a enviar el que l’altra ja ha enviat, ni una nota que la taula ha esborrat ni la que la tutora ha corregit', async () => {
        const { f, p, T } = await server5('adormida');
        const ph = await phone('adormida');
        try {
          const A = ph.pages()[0] || await ph.newPage(); watch(A, 'r5 A');
          await enter(A);
          await A.route('**/api/**', r => r.abort('internetdisconnected'));
          await typeSave(A, ['7', ',', '5']); await typeSave(A, ['8']); await typeSave(A, ['8', ',', '5']);
          await A.waitForFunction(() => tutQ().length === 3 && !tut.online, null, { timeout: 15000 });
          // (Chrome adorm la pestanya: aquí, amb el depurador; mentrestant no s'hi executa res)
          const cdp = await ph.newCDPSession(A);
          await cdp.send('Debugger.enable'); await cdp.send('Debugger.pause');
          await A.unroute('**/api/**');
          const B = await ph.newPage(); watch(B, 'r5 B');
          await B.goto(`http://${lan.address}:${PORT}/#codi=4321`); await B.waitForSelector('text=Quin aparell puntues?');
          await B.waitForFunction(() => !tutQ().length, null, { timeout: 15000 }); await sleep(800);
          assert.deepEqual(['e1', 'e2', 'e3'].map(e => scoreOf(f, e, 'barra').v), [7.5, 8, 8.5]);
          // la taula esborra la del dorsal 2 (no era d'aquesta gimnasta) i la tutora corregeix a B la del 3
          const c2 = '#scoregrid input.sc[data-e=e2][data-a=barra]';
          await T.waitForSelector(c2 + '.tutor', { timeout: 10000 });
          await T.click(c2); await T.keyboard.press('Backspace'); await T.keyboard.press('Enter');
          for (let i = 0; i < 40 && scoreOf(f, 'e2', 'barra').v != null; i++) await sleep(250);
          await B.tap('button[data-act=tutApp][data-a=barra]'); await B.waitForSelector('#qe');
          await B.tap('.qe-strip button[data-id=e3]'); await sleep(200);
          await typeSave(B, ['9', ',', '2', '5']);
          await B.waitForFunction(() => !tutQ().length, null, { timeout: 15000 }); await sleep(1200);
          assert.deepEqual(['e1', 'e2', 'e3'].map(e => scoreOf(f, e, 'barra').v ?? null), [7.5, null, 9.25]);
          // la pestanya A es desperta
          await cdp.send('Debugger.resume'); await cdp.send('Debugger.disable');
          await A.bringToFront(); await sleep(6000);
          assert.equal(await A.evaluate(() => tutQ().length), 0);
          assert.deepEqual(['e1', 'e2', 'e3'].map(e => scoreOf(f, e, 'barra').v ?? null), [7.5, null, 9.25], 'res no torna');
        } finally { await ph.close(); await T.context().close(); await kill(p); }
      });

      await step('la taula canvia el codi mentre el mòbil té notes guardades: la pestanya del QR nou les envia, la vella no les torna a desar ni torna a posar el codi d’abans, i en tornar a carregar no s’envia res dues vegades', async () => {
        const { f, p, T } = await server5('codi-nou');
        const ph = await phone('codi-nou');
        const posts = [];
        ph.on('request', r => { if (r.url().includes('/api/score')) posts.push(JSON.parse(r.postData()).entryId); });
        try {
          const A = ph.pages()[0] || await ph.newPage(); watch(A, 'r5 codi A');
          await enter(A);
          await ph.route('**/api/**', r => r.abort('internetdisconnected'));
          await typeSave(A, ['7', ',', '5']); await typeSave(A, ['8']);
          await A.waitForFunction(() => tutQ().length === 2 && !tut.online, null, { timeout: 15000 });
          await T.evaluate(() => { curComp().tutorPin = '9999'; commit(); }); await sleep(1200);
          await ph.unroute('**/api/**');
          await A.waitForSelector('#main >> text=2 notes guardades al mòbil sense enviar', { timeout: 30000 });
          const B = await ph.newPage(); watch(B, 'r5 codi B');
          await B.goto(`http://${lan.address}:${PORT}/#codi=9999`); await B.waitForSelector('text=Quin aparell puntues?');
          await B.waitForFunction(() => !tutQ().length, null, { timeout: 15000 }); await sleep(1000);
          assert.deepEqual([scoreOf(f, 'e1', 'barra').v, scoreOf(f, 'e2', 'barra').v], [7.5, 8]);
          // la pestanya vella ja no diu que n'hi ha per enviar; al mòbil hi ha el codi nou i la cua buida
          await A.waitForFunction(() => !/sense enviar/.test(document.querySelector('#main').textContent), null, { timeout: 10000 });
          assert.deepEqual(await B.evaluate(() => { const s = JSON.parse(localStorage.getItem('notesgim.tutor')); return [s.pin, s.queue.length]; }), ['9999', 0]);
          const c2 = '#scoregrid input.sc[data-e=e2][data-a=barra]';
          await T.waitForSelector(c2 + '.tutor', { timeout: 10000 });
          await T.click(c2); await T.keyboard.press('Backspace'); await T.keyboard.press('Enter');
          for (let i = 0; i < 40 && scoreOf(f, 'e2', 'barra').v != null; i++) await sleep(250);
          await sleep(1500);
          await A.close();
          assert.deepEqual(await B.evaluate(() => { const s = JSON.parse(localStorage.getItem('notesgim.tutor')); return [s.pin, s.queue.length]; }), ['9999', 0]);
          posts.length = 0;
          await B.reload(); await B.waitForSelector('text=Quin aparell puntues?', { timeout: 15000 }); await sleep(3000);
          assert.deepEqual(posts, [], 'no s’envia res més');
          assert.equal(scoreOf(f, 'e2', 'barra').v ?? null, null, 'la nota esborrada no torna');
        } finally { await ph.close(); await T.context().close(); await kill(p); }
      });

      await step('la llista de la tutora: si la taula canvia els dorsals, es torna a pintar (la nota va a la gimnasta que ara porta el dorsal); una nota refusada no treu el focus d’on s’escriu; i a mitja nota en segon pla, no es desa «8,» ni s’hi afegeix el que falta a «8,00»', async () => {
        const { f, p, T } = await server5('llista');
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
        const posts = [];
        ctx.on('request', r => { if (r.url().includes('/api/score')) { const b = JSON.parse(r.postData()); posts.push(b.entryId + '=' + b.value); } });
        try {
          const t = await ctx.newPage(); watch(t, 'r5 llista');
          await enter(t); await t.tap('button[data-act=tutToggleList]'); await t.waitForSelector('#scoregrid input.sc');
          const rows = () => t.evaluate(() => [...document.querySelectorAll('#scoregrid tbody tr')].map(tr => tr.cells[0].textContent + ':' + tr.dataset.row).join(' '));
          // dues gimnastes portaven el dorsal de l'altra: la taula els canvia
          await T.evaluate(() => { const c = curComp(); c.entries.find(e => e.id === 'e3').bib = 5; c.entries.find(e => e.id === 'e5').bib = 3; commit(); });
          await t.waitForFunction(() => document.querySelector('#scoregrid tbody tr:nth-child(3)').dataset.row === 'e5', null, { timeout: 15000 });
          assert.ok((await rows()).startsWith('1:e1 2:e2 3:e5 4:e4 5:e3 6:e6'), await rows());
          await t.locator('#scoregrid tbody tr:nth-child(3) input.sc').tap(); await t.keyboard.type('9,1'); await t.keyboard.press('Enter');
          await t.waitForFunction(() => !tutQ().length, null, { timeout: 15000 }); await sleep(800);
          assert.deepEqual([scoreOf(f, 'e5', 'barra').v, scoreOf(f, 'e3', 'barra').v ?? null], [9.1, null]);
          // si arriba mentre s'escriu en una casella, el dorsal de la fila ja es posa al dia (i el que s'escriu es queda)
          await t.locator('#scoregrid input.sc[data-e=e1]').tap(); await t.keyboard.type('8');
          await T.evaluate(() => { curComp().entries.find(e => e.id === 'e1').bib = 21; commit(); });
          await t.waitForFunction(() => document.querySelector('#scoregrid tr[data-row=e1]').cells[0].textContent === '21', null, { timeout: 15000 });
          assert.equal(await t.evaluate(() => document.activeElement.dataset.e + ':' + document.activeElement.value), 'e1:8');
          await t.keyboard.press('Enter');
          await t.waitForFunction(() => !tutQ().length, null, { timeout: 15000 }); await sleep(800);
          assert.equal(scoreOf(f, 'e1', 'barra').v, 8);
          // (quan se surt de les caselles, la llista es torna a pintar per dorsal)
          await t.evaluate(() => document.activeElement.blur());
          await t.waitForFunction(() => document.querySelector('#scoregrid tbody tr:last-child').dataset.row === 'e1', null, { timeout: 5000 });
          // la taula revisa la nota d'una altra tutora just abans que aquesta la corregeixi (el seu mòbil encara no ho sap)
          await tutorPost({ entryId: 'e8', appId: 'barra', value: 8, who: 'Laia' });
          await t.waitForFunction(() => document.querySelector('#scoregrid input.sc[data-e=e8]').value === '8,00', null, { timeout: 10000 });
          await t.locator('#scoregrid input.sc[data-e=e7]').tap(); await t.keyboard.type('8,25');
          await t.route('**/api/tutor?**', r => (r.request().url().includes('since=') ? setTimeout(() => r.continue().catch(() => {}), 6000) : r.continue()));
          await tutorPost({ entryId: 'e2', appId: 'salt', value: 7 });   // (acaba la consulta que hi ha en curs: la següent arriba tard)
          await sleep(500);
          await T.evaluate(() => { curComp().entries.find(x => x.id === 'e8').scores.barra[0].ok = true; commit(); });
          await sleep(1000);
          await t.keyboard.press('Enter'); await sleep(100);   // la del 7, desada; el focus al 8
          await t.keyboard.type('8,75'); await t.keyboard.press('Enter');   // la taula no l'accepta (409); el focus al 9
          await t.waitForSelector('.toast:has-text("8 Nom8 S · Barra: la taula ja l’ha posada o revisada")', { timeout: 10000 });
          await sleep(300);
          await t.keyboard.type('9,5');
          assert.equal(await t.evaluate(() => document.activeElement.dataset.e + ':' + document.activeElement.value), 'e9:9,5');
          await t.keyboard.press('Enter');
          await t.waitForFunction(() => !tutQ().length, null, { timeout: 15000 }); await sleep(800);
          assert.deepEqual([scoreOf(f, 'e7', 'barra').v, scoreOf(f, 'e8', 'barra').v, scoreOf(f, 'e9', 'barra').v], [8.25, 8, 9.5]);
          await t.unroute('**/api/tutor?**');
          // a mitja nota, la pàgina queda en segon pla (una trucada, la pantalla es bloqueja) i en torna
          const hide = v => t.evaluate(v => { Object.defineProperty(document, 'visibilityState', { value: v, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }, v);
          const away = () => t.evaluate(() => { const el = document.activeElement; el.dispatchEvent(new FocusEvent('blur')); el.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); window.dispatchEvent(new FocusEvent('blur')); });
          const back = () => t.evaluate(() => { const el = document.activeElement; window.dispatchEvent(new FocusEvent('focus')); el.dispatchEvent(new FocusEvent('focus')); el.dispatchEvent(new FocusEvent('focusin', { bubbles: true })); });
          const cellNow = id => t.evaluate(id => { const i = document.querySelector(`#scoregrid input.sc[data-e=${id}]`); return [i.value, document.activeElement === i, i.selectionStart, i.selectionEnd]; }, id);
          posts.length = 0;
          await t.locator('#scoregrid input.sc[data-e=e10]').tap(); await t.keyboard.type('8,');
          await hide('hidden'); await sleep(1200); await hide('visible');
          assert.deepEqual(await cellNow('e10'), ['8,', true, 2, 2]);
          await t.keyboard.type('5'); await t.keyboard.press('Enter');
          // (amb «8» sí que es desa, però sense tocar el que s'hi veu; en tornar, el navegador hi torna a posar el focus)
          await t.locator('#scoregrid input.sc[data-e=e11]').tap(); await t.keyboard.type('8');
          await away(); await hide('hidden'); await sleep(1200); await hide('visible'); await back();
          assert.deepEqual(await cellNow('e11'), ['8', true, 1, 1]);
          await t.keyboard.type(',5'); await t.keyboard.press('Enter');
          await t.waitForFunction(() => !tutQ().length, null, { timeout: 15000 }); await sleep(800);
          assert.deepEqual(posts, ['e10=8.5', 'e11=8', 'e11=8.5']);
          assert.deepEqual([scoreOf(f, 'e10', 'barra').v, scoreOf(f, 'e11', 'barra').v], [8.5, 8.5]);
        } finally { await ctx.close(); await T.context().close(); await kill(p); }
      });

      await step('mòbil de la tutora: es torna a carregar i la primera petició es queda penjada («Connectant…», mai en blanc, i es torna a provar); la competició tancada una estona no fa oblidar el codi; i amb una sola nota, els avisos parlen d’una nota', async () => {
        const { f, p, T } = await server5('codi-i-connexio');
        const ph = await phone('codi-i-connexio', 360, 740);
        const norm = async (P, sel) => (await P.textContent(sel)).replace(/\s+/g, ' ').trim();
        try {
          const t = ph.pages()[0] || await ph.newPage(); watch(t, 'r5 connexió');
          await enter(t);
          // (una petició que no respon mai: la Wi-Fi del pavelló)
          let stall = 1; const held = [];
          await ph.route('**/api/tutor?**', r => { if (stall > 0 && !r.request().url().includes('since=')) { stall--; held.push(r); return; } r.continue(); });
          await t.reload({ waitUntil: 'domcontentloaded' });
          await t.waitForSelector('#main >> text=Connectant amb l’ordinador de la taula', { timeout: 5000 });
          await t.waitForSelector('#qe', { timeout: 25000 });
          for (const r of held) await r.abort().catch(() => {});
          await ph.unroute('**/api/tutor?**');
          // la taula tanca la competició una estona; el mòbil es torna a carregar mentrestant
          await T.click('button[data-act=toggleLock] >> nth=0');
          await t.waitForSelector('#main >> text=Notes bloquejades', { timeout: 30000 });
          await t.reload(); await t.waitForSelector('#main >> text=Notes bloquejades'); await sleep(800);
          assert.equal(await t.evaluate(() => tut.pin), '4321', 'no oblida el codi');
          await T.click('button[data-act=toggleLock] >> nth=0');
          await t.waitForSelector('#qe', { timeout: 20000 });
          // una sola nota guardada al mòbil
          await ph.route('**/api/**', r => r.abort('internetdisconnected'));
          const eid = await t.evaluate(() => qe.entryId);
          await typeSave(t, ['8', ',', '5']);
          await t.waitForSelector('#tutbanner .banner', { timeout: 15000 });
          assert.equal(await t.locator('#tutbanner .banner').innerText(), '⚠ Sense connexió · 1 nota al mòbil\nNo tanquis la pàgina');
          await t.tap('button[data-act=tutLogout]'); await t.waitForSelector('#confirm[open]');
          assert.ok((await norm(t, '#confirm')).includes('Si surts, es perdrà (digues-la a la taula)'), await norm(t, '#confirm'));
          await t.click('#confirm button:has-text("Cancel·la")');
          await t.reload({ waitUntil: 'domcontentloaded' });
          await t.waitForSelector('#main >> text=1 nota guardada al mòbil', { timeout: 15000 });
          assert.ok((await norm(t, '#main')).includes('1 nota guardada al mòbil: s’enviarà sola quan hi hagi connexió.'), await norm(t, '#main'));
          // la taula canvia el codi i torna la Wi-Fi
          await T.evaluate(() => { curComp().tutorPin = '9999'; commit(); }); await sleep(800);
          await ph.unroute('**/api/**');
          await t.waitForSelector('form .note.warn', { timeout: 20000 });
          const login = await norm(t, 'form .note.warn');
          for (const x of ['1 nota guardada al mòbil sense enviar.', 'S’enviarà sola si tornes a entrar', 'digues-la a la taula', 'Ja l’he dita a la taula']) assert.ok(login.includes(x), login);
          await t.fill('input[name=pin]', '9999'); await t.tap('button:has-text("Entra")');
          await t.waitForFunction(() => !tutQ().length, null, { timeout: 15000 }); await sleep(800);
          assert.equal(scoreOf(f, eid, 'barra').v, 8.5);
        } finally { await ph.close(); await T.context().close(); await kill(p); }
      });

      // ─── sisena revisió: el mòbil de les tutores (cap nota a una altra gimnasta, ni a sobre d'una correcció)
      const norm6 = async (P, sel) => ((await P.textContent(sel).catch(() => '')) || '').replace(/\s+/g, ' ').trim();

      await step('sisena revisió: una nota que es queda pel camí i arriba al programa després de la correcció no la trepitja; amb dues pestanyes, cada nota l’envia una sola', async () => {
        const { f, p, T } = await server5('tard');
        const ph = await phone('tard');
        try {
          const A = ph.pages()[0] || await ph.newPage(); watch(A, 'r6 tard A');
          await enter(A);
          const B = await ph.newPage(); watch(B, 'r6 tard B');
          await enter(B, 'terra');
          await A.bringToFront();
          // la Wi-Fi s'encalla: la petició de la primera nota (7,5) no arriba (el mòbil la dona per perduda i la torna a provar)
          let stale = null; const posts = [];
          await ph.route('**/api/score', r => {
            const b = JSON.parse(r.request().postData());
            posts.push(`${r.request().frame().page() === A ? 'A' : 'B'} ${b.op}`);
            if (b.value === 7.5) { stale = r.request().postData(); return r.abort('timedout'); }
            return r.continue();
          });
          await typeSave(A, ['7', ',', '5']);
          await A.waitForFunction(() => !tut.online, null, { timeout: 15000 });
          // la tutora la corregeix (9): ara a la cua només hi ha la correcció, i arriba
          await A.tap('.qe-strip button[data-id=e1]'); await sleep(200);
          await typeSave(A, ['9']);
          await A.waitForFunction(() => !tutQ().length, null, { timeout: 20000 });
          for (let i = 0; i < 40 && scoreOf(f, 'e1', 'barra').v !== 9; i++) await sleep(250);
          assert.equal(scoreOf(f, 'e1', 'barra').v, 9);
          // i ara la Wi-Fi entrega la de 7,5 (el programa no l'havia vista mai)
          const r = await fetch(`http://${lan.address}:${PORT}/api/score`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: stale });
          const j = await r.json();
          assert.deepEqual([r.status, j.ok, j.older], [200, true, true], JSON.stringify(j));
          await sleep(1500);
          assert.equal(scoreOf(f, 'e1', 'barra').v, 9, 'la correcció es queda al fitxer');
          assert.equal(await T.inputValue('#scoregrid input.sc[data-e=e1][data-a=barra]'), '9,00', 'i a la taula');
          const by = {}; for (const x of posts) { const [pg, op] = x.split(' '); (by[op] = by[op] || new Set()).add(pg); }
          assert.ok(Object.values(by).every(s => s.size === 1), 'cada nota l’envia una sola pestanya: ' + posts.join(', '));
        } finally { await ph.close(); await T.context().close(); await kill(p); }
      });

      await step('sisena revisió: dues competicions amb codis diferents en dues pestanyes: la vella, en tornar-la a carregar, es queda amb la seva competició i el seu aparell; les notes de l’una les envia l’altra, i només es diuen no enviades si el seu codi ja no val', async () => {
        const f = path.join(dirOf('dos-codis'), 'notesgim-dades.json');
        const gA = G12.slice(0, 6), gB = [G('h1', 'Bnom1'), G('h2', 'Bnom2'), G('h3', 'Bnom3')];
        const comp = (id, name, pin, gyms, pre) => ({ id, name, date: '2027-01-22', place: 'Lleida', season: '2026-2027', tutorsOn: true, tutorPin: pin, entries: gyms.map((g, i) => E(pre + (i + 1), g.id, i + 1)), teams: [] });
        writeFileSync(f, JSON.stringify(data('r6codis', Date.now() - 60000, { gyms: [...gA, ...gB], comps: [comp('k1', 'Fase Nivell A', '4321', gA, 'e'), comp('k2', 'Fase Nivell B', '5555', gB, 'b')] })));
        const p = await run(f);
        const T = await open(await windowCtx(), '#/competicio/k1/notes');
        await T.goto(`http://127.0.0.1:${PORT}/#/competicio/k2/notes`); await sleep(800);
        await T.evaluate(() => commit()); await sleep(1200);
        const sc = (k, id) => ((((read(f).competitions.find(c => c.id === k).entries.find(e => e.id === id) || {}).scores || {}).barra || [])[0] || {}).v;
        const ph = await phone('dos-codis');
        try {
          const A = ph.pages()[0] || await ph.newPage(); watch(A, 'r6 codis A');
          await enter(A, 'barra', '4321');
          assert.ok((await A.textContent('h1')).includes('Nivell A'));
          await ph.route('**/api/score', r => r.abort('internetdisconnected'));
          await typeSave(A, ['8']); await typeSave(A, ['8', ',', '5']);
          await A.waitForFunction(() => tutQ().length === 2, null, { timeout: 10000 });
          const B = await ph.newPage(); watch(B, 'r6 codis B');
          await enter(B, 'terra', '5555');
          assert.ok((await B.textContent('h1')).includes('Nivell B'));
          await sleep(1500);
          assert.ok(!/no s’han pogut enviar/.test(await norm6(B, '#main')), 'B no diu que les de l’altra pestanya no s’han pogut enviar: ' + await norm6(B, '#main'));
          await ph.unroute('**/api/score');
          await A.waitForFunction(() => !tutQ().length, null, { timeout: 20000 }); await sleep(800);
          assert.deepEqual([sc('k1', 'e1'), sc('k1', 'e2')], [8, 8.5]);
          // la pestanya A es torna a carregar (el mòbil la tenia en segon pla): la seva competició i el seu aparell
          await A.bringToFront(); await A.reload(); await A.waitForSelector('#qe');
          assert.ok((await A.textContent('h1')).includes('Nivell A'), await A.textContent('h1'));
          assert.ok((await A.textContent('.qe-app')).includes('Barra'));
          const eid = await A.evaluate(() => qe.entryId);
          await typeSave(A, ['9', ',', '1']);
          await A.waitForFunction(() => !tutQ().length, null, { timeout: 15000 }); await sleep(800);
          assert.deepEqual([sc('k1', eid), sc('k2', 'b1') ?? null], [9.1, null], 'la nota va a la seva competició');
          // A guarda una nota sense connexió i es tanca; la taula canvia el codi de «Nivell A»: B ja no la pot enviar i ho diu
          await ph.route('**/api/score', r => r.abort('internetdisconnected'));
          await typeSave(A, ['7']);
          await A.waitForFunction(() => tutQ().length === 1, null, { timeout: 10000 });
          await A.close({ runBeforeUnload: false });
          await T.goto(`http://127.0.0.1:${PORT}/#/competicio/k1/notes`); await sleep(500);
          await T.evaluate(() => { curComp().tutorPin = '7777'; commit(); }); await sleep(1200);
          await ph.unroute('**/api/score');
          await B.bringToFront();
          await B.waitForFunction(() => /nota d’una altra competició no s’ha pogut enviar/.test((document.querySelector('#tutstuck') || {}).textContent || ''), null, { timeout: 20000 });
          assert.ok((await norm6(B, '#tutstuck')).includes('Fase Nivell A ·'), await norm6(B, '#tutstuck'));
          assert.ok((await B.textContent('h1')).includes('Nivell B'), 'B continua a la seva');
        } finally { await ph.close(); await T.context().close(); await kill(p); }
      });

      await step('sisena revisió: teclat gran, la taula passa a un altre grup la gimnasta que s’està puntuant (o en corregeix el nivell de tot el grup, o la treu): el teclat no salta a una altra gimnasta, no es perd el que s’ha escrit i es diu què ha passat', async () => {
        const f = path.join(dirOf('grup'), 'notesgim-dades.json');
        const gyms = [...G12.slice(0, 5), { ...G('x1', 'Benja1'), category: 'Benjamí' }, { ...G('x2', 'Benja2'), category: 'Benjamí' }];
        const entries = [...gyms.slice(0, 5).map((g, i) => E('e' + (i + 1), g.id, i + 1)), { ...E('x1', 'x1', 21), category: 'Benjamí' }, { ...E('x2', 'x2', 22), category: 'Benjamí' }];
        writeFileSync(f, JSON.stringify(data('r6grup', Date.now() - 60000, { gyms, comps: [{ id: 'k1', name: 'Fase 1', date: '2027-01-22', place: 'Lleida', season: '2026-2027', tutorsOn: true, tutorPin: '4321', entries, teams: [] }] })));
        const p = await run(f);
        const T = await open(await windowCtx(), '#/competicio/k1/notes');
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
        try {
          const P = await ctx.newPage(); watch(P, 'r6 grup');
          await P.goto(`http://${lan.address}:${PORT}/#codi=4321`); await P.waitForSelector('text=Quin aparell puntues?');
          const alevi = await P.evaluate(() => Engine.groupsOf(tutComp(), S()).find(g => g.category === 'Aleví').key);
          await P.evaluate(k => { tut.group = k; tutPick(); render(); }, alevi);
          await P.tap('button[data-act=tutApp][data-a=barra]'); await P.waitForSelector('#qe');
          const key5 = async () => Math.round((await P.locator('.qe-keys button[data-k="5"]').boundingBox()).y);
          // 1) la taula li corregeix la categoria mentre la tutora escriu «8,»
          await P.tap('.qe-strip button[data-id=e2]'); await sleep(300);
          await P.tap('.qe-keys button[data-k="8"]'); await P.tap('.qe-keys button[data-k=","]');
          const y0 = await key5();
          await T.evaluate(() => { const e = curComp().entries.find(x => x.id === 'e2'); e.category = 'Infantil'; db.gymnasts.find(x => x.id === 'g2').category = 'Infantil'; commit(); });
          await P.waitForSelector('.qe-card.qe-out', { timeout: 15000 });
          assert.deepEqual([await P.textContent('.qe-bib'), await P.textContent('.qe-who b'), await P.textContent('#qedisp')], ['2', 'Nom2 S', '8,']);
          assert.ok((await norm6(P, '.qe-next')).includes('Aquesta gimnasta ha canviat de grup a la taula.'), await norm6(P, '.qe-next'));
          assert.ok((await norm6(P, '.qe-saved')).includes('Ha canviat de grup: ara és a'), await norm6(P, '.qe-saved'));
          assert.equal(await key5(), y0, 'el teclat no es mou');
          // és ella qui puntua: acaba la nota i la desa (per a ella)
          await P.tap('.qe-keys button[data-k="5"]'); await P.tap('#qesave');
          await P.waitForFunction(() => !tutQ().length, null, { timeout: 15000 }); await sleep(800);
          assert.deepEqual([scoreOf(f, 'e2', 'barra').v, scoreOf(f, 'e1', 'barra').v ?? null], [8.5, null]);
          assert.equal(await P.$('.qe-card.qe-out'), null, 'després de desar, a la següent del grup');
          // 2) la taula corregeix el nivell de tot el grup mentre s'escriu «9» per al dorsal 4: el teclat segueix el grup
          await P.tap('.qe-strip button[data-id=e4]'); await sleep(300);
          await P.tap('.qe-keys button[data-k="9"]');
          await T.evaluate(() => { for (const e of curComp().entries) if (e.category === 'Aleví') e.level = 'B'; commit(); });
          await P.waitForFunction(() => (Engine.groupsOf(tutComp(), S()).find(g => g.key === tut.group) || {}).level === 'B', null, { timeout: 15000 });
          await sleep(300);
          assert.deepEqual([await P.textContent('.qe-bib'), await P.textContent('#qedisp'), !!(await P.$('.qe-card.qe-out'))], ['4', '9', false]);
          // 3) la taula en treu la inscripció mentre s'escriu «7»: no es pot desar i es diu
          await P.tap('.qe-strip button[data-id=e5]'); await sleep(300);
          await P.tap('.qe-keys button[data-k="7"]');
          await T.evaluate(() => { const c = curComp(); c.entries = c.entries.filter(e => e.id !== 'e5'); commit(); });
          await P.waitForSelector('.qe-card.qe-out', { timeout: 15000 });
          assert.deepEqual([await P.textContent('.qe-bib'), await P.textContent('#qedisp'), await P.evaluate(() => document.querySelector('#qesave').disabled)], ['5', '7', true]);
          assert.ok((await norm6(P, '.qe-next')).includes('ja no és a la competició'), await norm6(P, '.qe-next'));
          await P.tap('button[data-act=qeMove][data-d="1"]');
          assert.equal(await P.$('.qe-card.qe-out'), null);
          assert.notEqual(await P.textContent('.qe-bib'), '5');
          await sleep(500);
          assert.deepEqual(['e1', 'e3', 'e4'].map(e => scoreOf(f, e, 'barra').v ?? null), [null, null, null], 'cap nota a una altra gimnasta');
        } finally { await ctx.close(); await T.context().close(); await kill(p); }
      });

      await step('sisena revisió: l’ordinador de la taula canvia de Wi-Fi (una adreça i un QR nous): la pàgina vella, al cap d’una estona sense connexió, diu que les notes potser no hi arribaran i quines són; la del QR nou diu on són', async () => {
        const { f, p, T } = await server5('adreca');
        const ph = await playwright.chromium.launchPersistentContext(dirOf('perfil-adreca'), { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
          args: [`--host-resolver-rules=MAP zona-wifi.lan ${lan.address}`] });
        try {
          const OLD = `http://${lan.address}:${PORT}`, NEW = `http://zona-wifi.lan:${PORT}`;
          const A = ph.pages()[0] || await ph.newPage(); watch(A, 'r6 adreça vella');
          await A.goto(`${OLD}/#codi=4321`); await A.waitForSelector('text=Quin aparell puntues?');
          await A.tap('button[data-act=tutApp][data-a=barra]'); await A.waitForSelector('#qe');
          await ph.route(`${OLD}/**`, r => r.abort('addressunreachable'));
          await typeSave(A, ['8']); await typeSave(A, ['8', ',', '5']);
          await A.waitForFunction(() => tutQ().length === 2 && !tut.online, null, { timeout: 15000 });
          assert.ok((await norm6(A, '#tutbanner')).includes('⚠ Sense connexió · 2 notes al mòbil'));
          const k0 = await A.locator('.qe-keys button[data-k="5"]').boundingBox();
          // (al cap de dos minuts)
          await A.evaluate(() => { tut.okAt -= 130000; tutStatusBar(); });
          const bn = await norm6(A, '#tutbanner'), st = await norm6(A, '#tutstuck');
          assert.ok(bn.includes('⚠ Fa 2 min que no hi ha connexió') && bn.includes('Llegeix l’avís de sota') && !bn.includes('al mòbil'), bn);
          for (const x of ['Si la taula ha canviat de Wi-Fi o té un codi QR nou, aquestes 2 notes no hi arribaran soles: digues-les a la taula.', '1 Nom1 S · Barra: 8,00', '2 Nom2 S · Barra: 8,50', 'Ja les he dites a la taula']) assert.ok(st.includes(x), st);
          assert.deepEqual(await A.locator('.qe-keys button[data-k="5"]').boundingBox(), k0, 'el teclat no es mou');
          // el QR nou: una altra adreça (al navegador, unes altres dades)
          const B = await ph.newPage(); watch(B, 'r6 adreça nova');
          await B.goto(`${NEW}/#codi=4321`); await B.waitForSelector('text=Quin aparell puntues?');
          await B.tap('button[data-act=tutApp][data-a=barra]'); await B.waitForSelector('#qe');
          await B.waitForFunction(() => /ha canviat d’adreça/.test((document.querySelector('#tutstuck') || {}).textContent || ''), null, { timeout: 15000 });
          assert.ok((await norm6(B, '#tutstuck')).includes(`(abans: ${lan.address}:${PORT}). Si en aquest mòbil tenies la pàgina oberta amb l’adreça d’abans i hi havia notes sense enviar, només són en aquella pàgina`), await norm6(B, '#tutstuck'));
          await B.tap('#tutstuck button[data-act=tutHostsOk]');
          assert.equal(await norm6(B, '#tutstuck'), '');
          await B.reload(); await B.waitForSelector('#qe'); await sleep(1500);
          assert.equal(await norm6(B, '#tutstuck'), '', 'un cop llegit, no torna a sortir');
          // l'adreça d'abans torna (la taula torna a la Wi-Fi del pavelló): les envia, i l'avís marxa
          await ph.unroute(`${OLD}/**`);
          await A.bringToFront();
          await A.waitForFunction(() => !tutQ().length && !/no hi arribaran/.test((document.querySelector('#tutstuck') || {}).textContent || ''), null, { timeout: 30000 }); await sleep(800);
          assert.deepEqual([scoreOf(f, 'e1', 'barra').v, scoreOf(f, 'e2', 'barra').v], [8, 8.5]);
        } finally { await ph.close(); await T.context().close(); await kill(p); }
      });

      await step('sisena revisió: notes que la taula no accepta en tornar la Wi-Fi (no presentada, ja posada, inscripció treta): es diu quina és cada una i per què, en una llista que es queda (també en tornar a carregar) fins que la tutora diu que ja ho sap; i per a un noi, en masculí', async () => {
        const f = path.join(dirOf('refusades'), 'notesgim-dades.json');
        const gyms = G12.slice(0, 6).map((g, i) => (i === 0 ? { ...g, name: 'Pau', gender: 'M' } : g));
        const entries = gyms.map((g, i) => ({ ...E('e' + (i + 1), g.id, i + 1), gender: g.gender }));
        writeFileSync(f, JSON.stringify(data('r6ref', Date.now() - 60000, { gyms, comps: [{ id: 'k1', name: 'Fase 1', date: '2027-01-22', place: 'Lleida', season: '2026-2027', tutorsOn: true, tutorPin: '4321', entries, teams: [] }] })));
        const p = await run(f);
        const T = await open(await windowCtx(), '#/competicio/k1/notes');
        const ph = await phone('refusades', 360, 740);
        try {
          const A = ph.pages()[0] || await ph.newPage(); watch(A, 'r6 refusades');
          await enter(A, 'terra');
          assert.equal(await A.textContent('.qe-bib'), '2', '(el grup de les noies)');
          await ph.route('**/api/score', r => r.abort('internetdisconnected'));
          await typeSave(A, ['8']); await typeSave(A, ['8', ',', '5']); await typeSave(A, ['9']); await typeSave(A, ['7']);
          // (i una per al noi, d'abans que la taula el posi com a no presentat)
          await A.evaluate(() => { const c = tutComp(), e = c.entries.find(x => x.id === 'e1'); tutQueue(c, e, c.apparatus.find(a => a.id === 'terra'), 0, 8); });
          await A.waitForFunction(() => tutQ().length === 5, null, { timeout: 10000 });
          await T.evaluate(() => {
            const c = curComp();
            c.entries.find(e => e.id === 'e2').status = 'np'; c.entries.find(e => e.id === 'e1').status = 'np';
            c.entries.find(e => e.id === 'e3').scores.terra = [{ v: 6, at: Date.now() }];
            c.entries = c.entries.filter(e => e.id !== 'e4');
            commit();
          });
          await sleep(1500);
          await ph.unroute('**/api/score');
          await A.waitForFunction(() => !tutQ().length, null, { timeout: 30000 }); await sleep(500);
          const want = ['La taula no ha acceptat aquestes 4 notes (no s’han desat). Si cal, digues-les a la taula:', '2 Nom2 S · Terra: 8,00 — consta com a no presentada (NP)', '3 Nom3 S · Terra: 8,50 — la taula ja l’ha posada o revisada',
            '4 Nom4 S · Terra: 9,00 — ja no és a la competició (la taula l’ha treta)', '1 Pau S · Terra: 8,00 — consta com a no presentat (NP)'];
          for (const x of want) assert.ok((await norm6(A, '#tutstuck')).includes(x), x + ' | ' + await norm6(A, '#tutstuck'));
          assert.deepEqual([scoreOf(f, 'e3', 'terra').v, scoreOf(f, 'e5', 'terra').v], [6, 7]);
          await A.reload(); await A.waitForSelector('#qe'); await sleep(800);
          for (const x of want) assert.ok((await norm6(A, '#tutstuck')).includes(x), 'en tornar a carregar: ' + x);
          await A.tap('#tutstuck button[data-act=tutRefusedOk]');
          assert.equal(await norm6(A, '#tutstuck'), '');
          // el programa ho diu sense «gimnasta» (pot ser un noi), en majúscula i amb l'apòstrof bo
          const r = await fetch(`http://${lan.address}:${PORT}/api/score`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: '4321', compId: 'k1', entryId: 'e1', appId: 'terra', i: 0, value: 8, op: 'r6-noi' }) });
          assert.deepEqual([r.status, await r.json()], [403, { error: 'La taula hi ha posat NP (no s’ha presentat).', code: 'np' }]);
        } finally { await ph.close(); await T.context().close(); await kill(p); }
      });

      await step('sisena revisió: la llista de la tutora només posa ✓ quan el programa ha rebut la nota que s’hi veu (no la d’abans de corregir-la)', async () => {
        const { f, p, T } = await server5('marca');
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
        try {
          const P = await ctx.newPage(); watch(P, 'r6 marca');
          await enter(P); await P.tap('button[data-act=tutToggleList]'); await P.waitForSelector('#scoregrid input.sc');
          let n = 0, offline = false;
          await ctx.route('**/api/**', async r => {
            if (offline) return r.abort('internetdisconnected');
            if (r.request().url().includes('/api/score') && n++ === 0) { await sleep(2500); offline = true; return r.continue(); }
            return r.continue();
          });
          const cell = '#scoregrid input.sc[data-e=e1][data-a=barra]';
          await P.tap(cell); await P.fill(cell, '7,5'); await P.keyboard.press('Enter');
          await sleep(300);
          await P.tap(cell); await P.fill(cell, '8,5'); await P.keyboard.press('Enter');
          await sleep(4500);
          assert.deepEqual([await P.textContent('[data-st="e1:barra:0"]'), await P.evaluate(() => tutQ().map(o => o.value)), scoreOf(f, 'e1', 'barra').v], ['…', [8.5], 7.5]);
          offline = false; await ctx.unroute('**/api/**');
          await P.waitForFunction(() => !tutQ().length, null, { timeout: 20000 });
          await P.waitForFunction(() => document.querySelector('[data-st="e1:barra:0"]').textContent === '✓', null, { timeout: 5000 });
          await sleep(500);
          assert.equal(scoreOf(f, 'e1', 'barra').v, 8.5);
        } finally { await ctx.close(); await T.context().close(); await kill(p); }
      });

      await step('sisena revisió: la taula canvia el codi i la tutora escaneja el QR nou a la mateixa pestanya (només canvia el #codi=): s’hi entra amb el codi nou, es torna a triar l’aparell i s’envia el que hi havia guardat', async () => {
        const { f, p, T } = await server5('qr-pestanya');
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
        try {
          const P = await ctx.newPage(); watch(P, 'r6 qr');
          await enter(P);
          await ctx.route('**/api/**', r => r.abort('internetdisconnected'));
          const eid = await P.evaluate(() => qe.entryId);
          await typeSave(P, ['7']);
          await P.waitForFunction(() => tutQ().length === 1 && !tut.online, null, { timeout: 15000 });
          await T.evaluate(() => { curComp().tutorPin = '9999'; commit(); }); await sleep(1000);
          await ctx.unroute('**/api/**');
          await P.waitForSelector('input[name=pin]', { timeout: 30000 });
          let loads = 0; P.on('load', () => { loads++; });
          await P.goto(`http://${lan.address}:${PORT}/#codi=9999`);
          await P.waitForSelector('text=Quin aparell puntues?', { timeout: 15000 });
          await P.waitForFunction(() => !tutQ().length, null, { timeout: 15000 }); await sleep(800);
          assert.deepEqual([loads, await P.evaluate(() => [tut.pin, location.hash, JSON.parse(localStorage.getItem('notesgim.tutor')).pin])], [0, ['9999', '', '9999']]);
          assert.equal(scoreOf(f, eid, 'barra').v, 7);
        } finally { await ctx.close(); await T.context().close(); await kill(p); }
      });

      await step('setena revisió: amb les rotacions fetes, la tutora tria l’aparell i la subdivisió, i el teclat gran segueix l’ordre del full de rotacions (rotació per rotació, la categoria canvia sola, les NP se salten); «Per categoria» és com abans', async () => {
        const f = path.join(dirOf('rotacions'), 'notesgim-dades.json');
        // (amb la regla del 18/04: Infantil, Cadet i Juvenil juntes, en una sola subdivisió de 5 categories i nivells)
        const d = rotFixture(); Object.assign(d.competitions[0], { tutorsOn: true, tutorPin: '4321' });
        d.settings.rot = { joins: [{ g: 'F', cats: ['Infantil', 'Cadet', 'Juvenil'] }], apart: [], seen: [], allM: true, maxGroup: 15 };
        Object.assign(d.settings, { dataGen: 2 }); d.meta = { created: new Date(Date.now() - 864e5).toISOString(), updated: new Date(Date.now() - 60000).toISOString(), dbId: 'r7rot' };
        writeFileSync(f, JSON.stringify(d));
        const p = await run(f);
        const T = await open(await windowCtx(), '#/competicio/c418/rotacions');
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
        try {
          await T.click('button[data-act=rotMake]'); await T.waitForSelector('.toast:has-text("Fetes")');
          // a la subdivisió d'Infantil, Cadet i Juvenil, una NP al primer grup que passa per la barra
          const S7 = await T.evaluate(() => { const c = curComp(), v = rotViewOf(c), sv = v.subs.find(s => s.keys.length > 2);
            const seq = Engine.rotAppSeq(sv, 'barra', S(), rotCtx()); seq[0].entries[2].status = 'np'; commit();
            const first = v.subs.find(s => s.N && s.apps.some(a => a.id === 'barra'));
            return { id: sv.id, idx: sv.idx, first: first.id, heads: seq.map(b => `Rotació ${b.r + 1} · Grup ${b.G.g + 1}`), seq: seq.flatMap(b => b.entries.map(e => ({ id: e.id, np: e.status === 'np', cat: `${e.category} ${e.level}` }))) }; });
          await sleep(1500);
          for (let i = 0; i < 60 && !(read(f).competitions[0].rot || {}).made; i++) await sleep(250);
          const P = await ctx.newPage(); watch(P, 'r7 rotacions');
          await P.goto(`http://${lan.address}:${PORT}/#codi=4321`); await P.waitForSelector('text=Quin aparell puntues?');
          assert.ok((await norm6(P, '.tut-by')).includes('En l’ordre de les rotacions'));
          assert.equal(await P.locator('.gsel select').count(), 0, 'primer l’aparell');
          await P.tap('button[data-act=tutApp][data-a=barra]'); await P.waitForSelector('#qe');
          assert.equal(await P.evaluate(() => tut.sub), S7.first, 'la primera subdivisió on falten notes de barra');
          await P.selectOption('.gsel select', S7.id); await P.waitForFunction(id => tut.sub === id && !!document.querySelector('#qe'), S7.id);
          // el mateix ordre que el full (amb les NP, ratllades) i on comença cada grup
          assert.deepEqual(await P.$$eval('.qe-strip button', l => l.map(b => b.dataset.id)), S7.seq.map(x => x.id));
          assert.deepEqual(await P.$$eval('.qe-strip .qe-rb', l => l.map(b => b.textContent)), S7.heads);
          const cats = new Set();
          for (const x of S7.seq.filter(y => !y.np)) {
            assert.equal(await P.evaluate(() => qe.entryId), x.id, 'el mòbil mostra la que passa');
            const sub = await norm6(P, '.qe-who span'); assert.ok(sub.endsWith(x.cat), sub); cats.add(x.cat);
            await typeSave(P, ['8', ',', '5']);
          }
          assert.ok(cats.size >= 3, 'la categoria canvia sola: ' + [...cats].join(', '));
          assert.ok((await norm6(P, '.qe-next')).includes('Totes les notes de Barra d’aquesta subdivisió estan entrades.'));
          await P.waitForFunction(() => !tutQ().length, null, { timeout: 15000 }); await sleep(800);
          const fc = read(f).competitions[0], v85 = fc.entries.filter(e => ((((e.scores || {}).barra || [])[0]) || {}).v === 8.5).map(e => e.id).sort();
          assert.deepEqual(v85, S7.seq.filter(y => !y.np).map(y => y.id).sort(), 'cap nota a una altra gimnasta');
          // «Passa a la … subdivisió»: la següent on falten notes de barra
          await P.tap('.qe-next button[data-act=tutSub]'); await P.waitForFunction(id => tut.sub && tut.sub !== id, S7.id);
          // la llista: en el mateix ordre, amb la rotació i el grup a sobre de cada grup
          await P.selectOption('.gsel select', S7.id); await P.waitForFunction(id => tut.sub === id, S7.id);
          await P.tap('button[data-act=tutToggleList]'); await P.waitForSelector('#scoregrid');
          assert.deepEqual(await P.$$eval('#scoregrid tbody tr[data-row]', l => l.map(r => r.dataset.row)), S7.seq.map(x => x.id));
          assert.deepEqual(await P.$$eval('#scoregrid tr.tut-rb', l => l.map(r => r.textContent.trim())), S7.heads);
          await P.tap('button[data-act=tutToggleList]'); await P.waitForSelector('#qe');
          // «Per categoria»: com sempre (el grup i per dorsal), el de la gimnasta de la targeta (no el primer) i amb ella a la
          // targeta; i es torna a l'ordre de les rotacions, també amb ella
          const other = S7.seq.find(x => !x.np && x.cat !== S7.seq[0].cat);
          await P.tap(`.qe-strip button[data-id="${other.id}"]`); await P.waitForFunction(id => qe.entryId === id, other.id);
          const grpOf = id => P.evaluate(i => (Engine.groupsOf(tutComp(), S()).find(x => x.entries.some(e => e.id === i)) || {}).key, id);
          await P.tap('button[data-act=tutBy]'); await P.waitForFunction(() => tut.byCat && !!document.querySelector('#qe'));
          assert.deepEqual(await P.evaluate(() => [tut.group, qe.entryId]), [await grpOf(other.id), other.id], 'el grup de la que puntuava, i ella');
          assert.equal(await P.$eval('.qe-strip button.cur', b => b.dataset.id), other.id);
          const ids = await P.$$eval('.qe-strip button', l => l.map(b => b.dataset.id));
          const g = await P.evaluate(() => Engine.groupsOf(tutComp(), S()).find(x => x.key === tut.group).entries.slice().sort((a, b) => a.bib - b.bib).map(e => e.id));
          assert.deepEqual(ids, g);
          assert.equal(await P.locator('.qe-strip .qe-rb').count(), 0);
          await P.tap('button[data-act=tutBy]'); await P.waitForFunction(id => !tut.byCat && tut.sub === id, S7.id);
          assert.equal(await P.evaluate(() => qe.entryId), other.id);
          // la taula li canvia la categoria i passa a una altra subdivisió: el mòbil diu a quina («ara és a la 2a subdivisió · …»)
          const to = await T.evaluate(id => { const c = curComp(), e = c.entries.find(x => x.id === id); Object.assign(e, { category: 'Benjamí', level: 'A', teamId: null }); commit();
            const v = rotViewOf(c), sv = v.subs.find(x => x.id === v.place.get(e).subId); return `${sv.idx}a subdivisió · ${sv.label}`; }, other.id);
          await P.waitForFunction(t => ((document.querySelector('.qe-saved') || {}).textContent || '').includes(t), `Ha canviat de subdivisió: ara és a la ${to}`, { timeout: 15000 });
          // la taula esborra les rotacions: per categoria, i l'aparell es torna a triar (l'ordre ja no és el mateix); el grup és
          // el de la gimnasta que puntuava, i amb el mateix aparell, ella a la targeta
          await T.evaluate(() => { delete curComp().rot; commit(); });
          await P.waitForSelector('text=Quin aparell puntues?', { timeout: 15000 });
          assert.equal(await P.locator('.tut-by').count(), 0);
          assert.equal(await P.evaluate(() => tut.group), await grpOf(other.id));
          await P.tap('button[data-act=tutApp][data-a=barra]'); await P.waitForSelector('#qe');
          assert.deepEqual(await P.evaluate(() => [tut.group, qe.entryId]), [await grpOf(other.id), other.id]);
        } finally { await ctx.close(); await T.context().close(); await kill(p); }
      });

      // ─── setena revisió: el mòbil de les tutores diu el que passa (sense connexió, notes bloquejades)
      await step('setena revisió: sense connexió, l’avís de dalt es llegeix sencer de 320 a 412 px («⚠ Sense connexió · 1 nota al mòbil» i «No tanquis la pàgina») i no mou el teclat', async () => {
        const { p, T } = await server5('avis-dalt');
        try {
          for (const [w, hh] of [[320, 568], [360, 740], [390, 844], [412, 915]]) {
            const ctx = await browser.newContext({ viewport: { width: w, height: hh }, isMobile: true, hasTouch: true });
            try {
              const t = await ctx.newPage(); watch(t, `r7 avís ${w}`);
              await enter(t, 'terra');
              const k5 = () => t.evaluate(() => Math.round(document.querySelector('.qe-keys button[data-k="5"]').getBoundingClientRect().y + scrollY));
              const y0 = await k5();
              await ctx.route('**/api/**', r => r.abort('internetdisconnected'));
              await typeSave(t, ['8', ',', '5']);
              await t.waitForSelector('#tutbanner .banner', { timeout: 15000 });
              const b = await t.evaluate(() => {
                const el = document.querySelector('#tutbanner .banner'), r = el.getBoundingClientRect();
                return { lines: [...el.querySelectorAll('span')].map(x => x.textContent), cut: [el, ...el.querySelectorAll('span')].some(x => x.scrollWidth > x.clientWidth + 1),
                  inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0, under: r.bottom <= document.querySelector('header.top').getBoundingClientRect().bottom };
              });
              assert.deepEqual(b, { lines: ['⚠ Sense connexió · 1 nota al mòbil', 'No tanquis la pàgina'], cut: false, inside: true, under: true }, `${w} px`);
              assert.equal(await k5(), y0, `${w} px: el teclat no es mou`);
              await ctx.unroute('**/api/**');
              await t.waitForFunction(() => !tutQ().length && !document.querySelector('#tutbanner .banner'), null, { timeout: 20000 });
            } finally { await ctx.close(); }
          }
        } finally { await T.context().close(); await kill(p); }
      });

      await step('setena revisió: la taula bloqueja les notes mentre la tutora puntua (i té una nota per enviar): el mòbil diu que la taula les ha bloquejat (no «Codi incorrecte»), i quan les desbloqueja hi torna sol, al mateix aparell, i la nota s’envia', async () => {
        const { f, p, T } = await server5('bloquejada');
        const ph = await phone('bloquejada', 390, 844);
        const norm = async (P, sel) => (await P.textContent(sel)).replace(/\s+/g, ' ').trim();
        try {
          const t = ph.pages()[0] || await ph.newPage(); watch(t, 'r7 bloquejada');
          await enter(t, 'barra');
          // sense Wi-Fi un moment: la nota es queda al mòbil, i mentrestant la taula bloqueja les notes
          await ph.route('**/api/**', r => r.abort('internetdisconnected'));
          const eid = await t.evaluate(() => qe.entryId);
          await typeSave(t, ['7', ',', '5']);
          await t.waitForFunction(() => tutQ().length === 1 && !tut.online, null, { timeout: 15000 });
          await T.click('button[data-act=toggleLock] >> nth=0'); await sleep(800);
          await ph.unroute('**/api/**');
          await t.waitForSelector('#main >> text=Notes bloquejades', { timeout: 20000 });
          const txt = await norm(t, '#main');
          for (const x of ['La taula ha bloquejat les notes d’aquesta competició: ja no se’n poden entrar.', 'Si la taula les torna a obrir, aquesta pàgina hi tornarà a entrar sola', '1 nota guardada al mòbil sense enviar. S’enviarà sola si la taula torna a obrir les notes; si no, digues-la a la taula', 'Entra amb un altre codi'])
            assert.ok(txt.includes(x), txt);
          assert.ok(!txt.includes('Codi incorrecte') && !txt.includes('El codi ja no val'), txt);
          assert.equal(scoreOf(f, eid, 'barra').v, undefined, 'amb les notes bloquejades, la nota no hi va');
          // la taula les desbloqueja: el mòbil hi torna sol (al teclat de la barra) i envia la nota
          await T.click('button[data-act=toggleLock] >> nth=0');
          await t.waitForSelector('#qe', { timeout: 20000 });
          assert.ok((await t.textContent('.qe-app')).includes('Barra'));
          await t.waitForFunction(() => !tutQ().length, null, { timeout: 15000 }); await sleep(800);
          assert.equal(scoreOf(f, eid, 'barra').v, 7.5);
        } finally { await ph.close(); await T.context().close(); await kill(p); }
      });
    }

    await step('dues còpies de les mateixes dades (Documents i un USB), canviades cada una un dia: s’obre la més nova tal com és (sense barrejar-hi res), l’altra es guarda i es diu què hi havia', async () => {
      const root = dirOf('dues-copies'), docs = path.join(root, 'Documents'), usb = path.join(root, 'USB');
      mkdirSync(docs); mkdirSync(usb);
      const D = path.join(docs, 'notesgim-dades.json'), U = path.join(usb, 'notesgim-dades.json');
      writeFileSync(D, JSON.stringify(data('lesmeves', Date.now() - 864e5)));
      writeFileSync(U, readFileSync(D));
      const casa = await windowCtx(), pavello = await windowCtx();
      // dia 2, a casa (Documents): una competició nova amb inscripcions i una entitat nova
      let p = await run(D), w = await open(casa);
      await w.evaluate(() => {
        db.competitions.push({ id: 'k2', name: 'Fase 2 (preparada a casa)', date: '2027-02-12', place: 'Alcarràs', season: '2026-2027', entries: [
          { id: 'n1', gymnastId: 'g1', clubId: 'c1', gender: 'F', category: 'Aleví', level: 'A', bib: 1, status: '', scores: {} }], teams: [] });
        db.clubs.push({ id: 'c2', name: 'Entitat nova de casa' });
        db.competitions = migrate(db).competitions; commit();
      });
      await sleep(1500); await w.close(); await kill(p);
      // dia 3, al pavelló (USB): una inscripció d'última hora i notes
      p = await run(U); w = await open(pavello, '#/competicio/k1/notes');
      await w.evaluate(() => {
        db.gymnasts.push({ id: 'g3', name: 'Carla', surname: 'Pavelló', clubId: 'c1', gender: 'F', category: 'Aleví', level: 'A' });
        const c = db.competitions[0]; c.entries.push({ id: 'e3', gymnastId: 'g3', clubId: 'c1', gender: 'F', category: 'Aleví', level: 'A', bib: 3, status: '', scores: {} });
        c.entries[0].scores = { salt: [{ v: 8.5, at: Date.now() }] }; commit();
      });
      await sleep(1500); await w.close(); await kill(p);
      // dia 4, a casa: s'obre el NotesGim de l'USB (per portar els resultats a casa) i després el de Documents
      p = await run(U); w = await open(casa);
      const t1 = await w.evaluate(() => window.__toasts.slice());
      assert.ok(t1.some(x => x.includes('altre lloc') && x.includes('Fase 2 (preparada a casa)') && x.includes('Entitat nova de casa')), 'es diu què només hi havia a l’altra: ' + JSON.stringify(t1));
      const kept = await w.evaluate(async () => { const r = await idbGet('abansServidor'); return r && JSON.parse(r.raw); });
      assert.ok(kept && kept.competitions.some(c => c.name === 'Fase 2 (preparada a casa)'), 'la de casa es guarda (es pot descarregar)');
      await sleep(1200); await w.close(); await kill(p);
      const u = read(U);
      assert.deepEqual(u.competitions.map(c => c.name), ['Fase 1'], 'res barrejat: la de l’USB, tal com és');
      assert.ok(u.gymnasts.some(g => g.name === 'Carla')); assert.equal(u.competitions[0].entries[0].scores.salt[0].v, 8.5);
      // a Documents: la de Documents (la de casa) tampoc no ve de la de l'USB; es torna a dir, hi va la de la finestra tal com és
      // i la de Documents es guarda a copies-notesgim
      p = await run(D); w = await open(casa);
      await sleep(1200);
      const t2 = await w.evaluate(() => window.__toasts.slice());
      assert.ok(t2.some(x => x.includes('altre lloc') && x.includes('Fase 2 (preparada a casa)') && x.includes('copies-notesgim')), 'es diu que Documents tenia la Fase 2: ' + JSON.stringify(t2));
      await w.close(); await kill(p);
      const d = read(D);
      assert.ok(d.gymnasts.some(g => g.name === 'Carla')); assert.equal(d.competitions.find(c => c.id === 'k1').entries[0].scores.salt[0].v, 8.5);
      assert.ok(!d.competitions.some(c => c.id === 'k2') && !d.gymnasts.some((g, i, l) => l.findIndex(x => x.id === g.id) !== i), 'cap còpia barrejada ni repetida');
      const copies = readdirSync(path.join(docs, 'copies-notesgim')).map(f => readFileSync(path.join(docs, 'copies-notesgim', f), 'utf8'));
      assert.ok(copies.some(x => x.includes('Fase 2 (preparada a casa)')), 'la de Documents tal com era es guarda');
      // la mateixa finestra, sense canvis, torna a obrir el mateix fitxer: no diu res
      p = await run(D); w = await open(casa); await sleep(800);
      assert.equal((await w.evaluate(() => window.__toasts.slice())).length, 0);
      await w.close(); await kill(p);
      await casa.close(); await pavello.close();
    });

    await step('Documents → USB → pavelló (amb el rellotge endarrerit una setmana) → l’USB obert a casa: s’obre la del pavelló tal com és, sense cap avís, i el que s’hi ha tret no torna', async () => {
      const root = dirOf('usb-pavello'), docs = path.join(root, 'Documents'), usb = path.join(root, 'USB');
      mkdirSync(docs); mkdirSync(usb);
      const D = path.join(docs, 'notesgim-dades.json'), U = path.join(usb, 'notesgim-dades.json');
      writeFileSync(D, JSON.stringify(data('temporada', Date.now() - 3 * 864e5, { gyms: [G('g1', 'Anna'), G('g2', 'Berta'), G('g3', 'Carla')] })));
      const casa = await windowCtx();
      // dia 1, a casa: un canvi i es copia la carpeta a l'USB
      let p = await run(D), w = await open(casa);
      await w.evaluate(() => { db.clubs[0].name = 'CG Lleida (revisat)'; commit(); });
      await sleep(1500); await w.close(); await kill(p);
      writeFileSync(U, readFileSync(D));
      // dia 2, al pavelló (un ordinador amb el rellotge una setmana endarrerit): una baixa, una nota i una NP
      const pavello = await windowCtx();
      await pavello.addInitScript(() => { const D0 = Date, off = -7 * 864e5; window.Date = class extends D0 { constructor(...a) { super(...(a.length ? a : [D0.now() + off])); } static now() { return D0.now() + off; } }; });
      p = await run(U); w = await open(pavello, '#/competicio/k1/inscripcions');
      await w.evaluate(() => { const c = db.competitions[0]; c.entries = c.entries.filter(e => e.id !== 'e2'); c.entries.find(e => e.id === 'e1').scores = { salt: [{ v: 8.7, at: Date.now() }] }; c.entries.find(e => e.id === 'e3').status = 'np'; commit(); });
      await sleep(1500); await w.close(); await kill(p);
      const u0 = read(U);
      assert.ok(Date.parse(u0.meta.updated) < Date.parse(read(D).meta.updated), 'la del pavelló té una hora més vella (el rellotge)');
      // dia 3, a casa: s'obre el NotesGim de l'USB
      p = await run(U); w = await open(casa);
      const t = await w.evaluate(() => window.__toasts.slice());
      assert.equal(t.filter(x => /altre lloc|altra finestra|S’han obert/.test(x)).length, 0, 'cap avís: ' + JSON.stringify(t));
      const shown = await w.evaluate(() => db.competitions[0].entries.map(e => e.id + ':' + (e.status || '-') + ':' + ((e.scores.salt || [])[0] || {}).v));
      assert.deepEqual(shown, ['e1:-:8.7', 'e3:np:undefined'], 'la del pavelló, tal com és');
      await sleep(1200); await w.close(); await kill(p);
      const u = read(U).competitions[0].entries;
      assert.deepEqual(u.map(e => e.id), ['e1', 'e3'], 'la baixa no torna'); assert.equal(u.find(e => e.id === 'e3').status, 'np');
      await casa.close(); await pavello.close();
    });

    await step('«Restaura una còpia…» mentre NotesGim no respon i es tanca la finestra: en tornar-lo a obrir, la còpia substitueix el fitxer', async () => {
      const f = path.join(dirOf('restaura-tancada'), 'notesgim-dades.json'), now = Date.now();
      const d = data('r4rs', now - 50000); d.competitions[0].entries[0].scores = { salt: [{ v: 9, at: now - 60000 }] };
      writeFileSync(f, JSON.stringify(d));
      const bak = data('r4rs', now - 3600e3); bak.competitions[0].entries[0].scores = { salt: [{ v: 7, at: now - 3600e3 }] };
      let p = await run(f);
      const ctx = await windowCtx();
      let w = await open(ctx, '#/configuracio');
      p.kill('SIGSTOP');
      await w.evaluate(([t, n]) => restoreFromText(t, n), [JSON.stringify(bak), 'notesgim-copia-ahir.json']);
      await w.click('#confirm button[value=ok]');
      await sleep(1500);
      assert.equal(await w.evaluate(() => db.competitions[0].entries[0].scores.salt[0].v), 7);
      await w.close();
      p.kill('SIGCONT'); await kill(p);
      p = await run(f); w = await open(ctx, '#/configuracio');
      await sleep(1500);
      assert.equal(read(f).competitions[0].entries[0].scores.salt[0].v, 7, 'al fitxer, la nota de la còpia');
      assert.equal(await w.evaluate(() => db.competitions[0].entries[0].scores.salt[0].v), 7);
      assert.ok(readdirSync(path.join(path.dirname(f), 'copies-notesgim')).some(x => x.includes('-abans-de-restaurar')), 'abans se’n guarda una còpia');
      await ctx.close(); await kill(p);
    });

    await step('«Restaura una còpia…» d’unes altres dades mentre NotesGim no respon (la finestra oberta): quan torna, la còpia hi va, sense cap alarma', async () => {
      const f = path.join(dirOf('restaura-oberta'), 'notesgim-dades.json');
      writeFileSync(f, JSON.stringify(data('r4ro', Date.now() - 50000)));
      const bak = data('r4altres', Date.now() - 864e5, { gyms: [G('h1', 'Carla'), G('h2', 'Dolors'), G('h3', 'Elna')] });
      let p = await run(f);
      const ctx = await windowCtx(), w = await open(ctx, '#/configuracio');
      await kill(p);
      await sleep(1500);
      await w.evaluate(([t, n]) => restoreFromText(t, n), [JSON.stringify(bak), 'notesgim-copia-altre-curs.json']);
      await w.click('#confirm button[value=ok]');
      await sleep(800);
      p = await run(f);
      for (let i = 0; i < 60 && !read(f).gymnasts.some(g => g.name === 'Carla'); i++) await sleep(250);
      assert.deepEqual(read(f).gymnasts.map(g => g.name), ['Carla', 'Dolors', 'Elna']);
      await sleep(1000);
      assert.deepEqual(await w.evaluate(() => db.gymnasts.map(g => g.name)), ['Carla', 'Dolors', 'Elna']);
      assert.equal((await w.evaluate(() => window.__toasts.slice())).filter(x => /altra finestra/.test(x)).length, 0);
      await ctx.close(); await kill(p);
    });

    await step('NotesGim es torna a obrir: una segona finestra on no s’ha tocat res no fa saltar cap alarma ni trepitja la còpia de les dades d’abans', async () => {
      const f = path.join(dirOf('finestra-quieta'), 'notesgim-dades.json');
      writeFileSync(f, JSON.stringify(data('r4q', Date.now() - 60000)));
      const ctx = await windowCtx();
      // aquesta finestra tenia unes altres dades: en obrir, mana el fitxer i les seves es guarden
      await ctx.addInitScript(s => { if (!sessionStorage.getItem('llavor')) localStorage.setItem('notesgim.db', s); sessionStorage.setItem('llavor', '1'); },
        JSON.stringify(data('r4altre', Date.now() - 864e5, { gyms: [G('x1', 'Gimnasta de l’altre fitxer')] })));
      let p = await run(f);
      const A = await open(ctx, '#/gimnastes');
      assert.deepEqual(await kept(A), ['Gimnasta de l’altre fitxer']);
      const B = await open(ctx, '#/gimnastes');
      // (la B, la que s'ha obert, mana: s'hi torna a fer manar l'A, i la B queda en pausa, quieta)
      assert.ok(await isPaused(A));
      await takeOver(A);
      assert.ok(await isPaused(B));
      let block = false;
      await B.route('**/api/**', r => (block ? r.abort() : r.continue()));
      await sleep(800);
      await kill(p); block = true; await sleep(1000);
      await A.evaluate(() => { db.gymnasts.push({ id: 'gn', name: 'Nova', surname: 'Mentrestant', clubId: 'c1', gender: 'F', category: 'Aleví', level: 'A' }); commit(); });
      p = await run(f);
      for (let i = 0; i < 60 && !read(f).gymnasts.some(g => g.name === 'Nova'); i++) await sleep(250);
      assert.ok(read(f).gymnasts.some(g => g.name === 'Nova'));
      block = false;
      await B.waitForFunction(() => db.gymnasts.some(g => g.name === 'Nova'), null, { timeout: 15000 });
      await sleep(1500);
      assert.equal((await B.evaluate(() => window.__toasts.slice())).filter(x => /s’havien canviat/.test(x)).length, 0, 'cap alarma a la finestra quieta');
      assert.deepEqual(await kept(B), ['Gimnasta de l’altre fitxer'], 'la còpia de les dades d’abans no es trepitja');
      await ctx.close(); await kill(p);
    });
  } finally {
    for (const p of procs) await kill(p, 'SIGKILL');
    await startServer();
  }
} finally {
  await browser.close();
  if (proc && proc.exitCode === null) await stopServer();
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('\nMode servidor correcte.');
