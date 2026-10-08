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
const PORT = 18765, dataFile = path.join(out, 'notesgim-dades.json');

const now = Date.now();
writeFileSync(dataFile, JSON.stringify({
  app: 'notesgim', version: 1,
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

  await step('competició tancada: la tutora ja no pot entrar notes', async () => {
    await admin.click('button[data-act=toggleLock]');
    await new Promise(r => setTimeout(r, 1000));
    await tutor.reload();
    await tutor.waitForSelector('text=Mode tutora');
  });
  await admin.screenshot({ path: path.join(out, 'taula.png'), fullPage: true });
  await tutor.screenshot({ path: path.join(out, 'tutora.png'), fullPage: true });
} finally {
  await browser.close();
  if (proc && proc.exitCode === null) await stopServer();
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('\nMode servidor correcte.');
