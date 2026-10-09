// Prova del mode servidor (xarxa local sense internet): un navegador fa d'ordinador de la taula
// (localhost) i un altre de mòbil de tutora (adreça de xarxa). Cal Go i Playwright.
//   node tests/e2e-servidor.mjs
import { createRequire } from 'node:module';
import { execSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync, copyFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

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
    await tutor.waitForSelector('.banner:has-text("No tanquis aquesta pàgina")', { timeout: 10000 });
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

  await step('una segona finestra de la taula amb dades velles no trepitja les noves', async () => {
    const other = await (await browser.newContext({ viewport: { width: 1200, height: 800 } })).newPage();
    watch(other, 'altra finestra');
    await other.goto(`http://127.0.0.1:${PORT}/#/gimnastes`);
    await other.waitForSelector('#gymtable');
    // la primera finestra reanomena una gimnasta
    await admin.goto(`http://127.0.0.1:${PORT}/#/gimnastes`);
    await admin.click('#gymtable a[data-act=editGym]:has-text("Anna")');
    await admin.fill('#dlg input[name=name]', 'Anna Maria');
    await admin.click('#dlg button.primary');
    await new Promise(r => setTimeout(r, 1200));
    // l'altra la veu sola, i el que hi canviï després no desfà el nom
    await other.waitForSelector('#gymtable >> text=Anna Maria', { timeout: 10000 });
    await other.goto(`http://127.0.0.1:${PORT}/#/configuracio`);
    await other.fill('input[data-k=org]', 'ORG DE PROVA'); await other.press('input[data-k=org]', 'Tab');
    await new Promise(r => setTimeout(r, 1500));
    const d = JSON.parse(readFileSync(dataFile, 'utf8'));
    assert.equal(d.gymnasts.find(g => g.id === 'g1').name, 'Anna Maria');
    assert.equal(d.settings.org, 'ORG DE PROVA');
    await other.close();
    await admin.goto(`http://127.0.0.1:${PORT}/#/competicio/k1/notes`);
    await admin.waitForSelector('#scoregrid');
  });

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

  await step('competició tancada: la tutora ja no pot entrar notes', async () => {
    await admin.click('button[data-act=toggleLock]');
    await new Promise(r => setTimeout(r, 1000));
    await tutor.reload();
    await tutor.waitForSelector('text=Mode tutora');
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

    await step('dues còpies de les mateixes dades (Documents i un USB), canviades cada una un dia: no es perd cap competició ni cap entitat, i es diu', async () => {
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
      assert.ok(t1.some(x => x.includes('Fase 2 (preparada a casa)') && x.includes('Entitat nova de casa')), 'es diu què s’hi ha afegit: ' + JSON.stringify(t1));
      await sleep(1200); await w.close(); await kill(p);
      p = await run(D); w = await open(casa);
      await sleep(1200);
      assert.equal((await w.evaluate(() => window.__toasts.slice())).filter(x => /altre lloc|altra finestra/.test(x)).length, 0, 'en obrir Documents ja no hi ha res a dir');
      await w.close(); await kill(p);
      for (const [nom, file] of [['Documents', D], ['USB', U]]) {
        const d = read(file);
        assert.deepEqual(d.competitions.map(c => c.name).sort(), ['Fase 1', 'Fase 2 (preparada a casa)'], nom);
        assert.deepEqual(d.clubs.map(c => c.name).sort(), ['CG Lleida', 'Entitat nova de casa'], nom);
        assert.ok(d.gymnasts.some(g => g.name === 'Carla'), nom);
        assert.equal(d.competitions.find(c => c.id === 'k1').entries[0].scores.salt[0].v, 8.5, nom);
        assert.equal(d.competitions.find(c => c.id === 'k2').entries.length, 1, nom);
      }
      // la mateixa finestra, sense canvis, torna a obrir el mateix fitxer: no diu res
      p = await run(D); w = await open(casa); await sleep(800);
      assert.equal((await w.evaluate(() => window.__toasts.slice())).length, 0);
      await w.close(); await kill(p);
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
