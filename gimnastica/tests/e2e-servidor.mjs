// Prova del mode servidor (xarxa local sense internet): un navegador fa d'ordinador de la taula
// (localhost) i un altre de mòbil de tutora (adreça de xarxa). Cal Go i Playwright.
//   node tests/e2e-servidor.mjs
import { createRequire } from 'node:module';
import { execSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync, copyFileSync } from 'node:fs';
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
mkdirSync(path.join(srvDir, 'web'), { recursive: true });
copyFileSync(path.join(root, 'index.html'), path.join(srvDir, 'web', 'index.html'));
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
    await admin.waitForSelector('text=Servidor');
    assert.equal(await admin.locator('#scoregrid input.sc[data-e=e2][data-a=salt]').inputValue(), '8,00');
    await admin.waitForSelector('text=Tutores: codi');
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
    await tutor.waitForSelector('#scoregrid');
  });

  await step('la tutora entra notes de barra i arriben a la taula al moment', async () => {
    await tutor.click('button[data-act=tutApp][data-a=barra]');
    const first = tutor.locator('#scoregrid input.sc').first();
    await first.click();
    await tutor.keyboard.type('9,1'); await tutor.keyboard.press('Enter');
    await tutor.keyboard.type('8,45'); await tutor.keyboard.press('Enter');
    await tutor.waitForSelector('[data-st="e1:barra:0"].ok');
    await tutor.waitForSelector('[data-st="e2:barra:0"].ok');
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

  await step('al fitxer del servidor hi ha les notes', async () => {
    await new Promise(r => setTimeout(r, 600));
    const d = JSON.parse(readFileSync(dataFile, 'utf8'));
    const e1 = d.competitions[0].entries.find(e => e.id === 'e1');
    assert.equal(e1.scores.barra[0].v, 9.1);
  });

  await step('el noi no té barra; el minitramp té 2 salts', async () => {
    await tutor.click('button[data-act=tutGroup]:has-text("masculí")');
    assert.equal(await tutor.locator('button[data-act=tutApp][data-a=barra]').count(), 0);
    await tutor.click('button[data-act=tutApp][data-a=mini]');
    assert.equal(await tutor.locator('#scoregrid input.sc').count(), 2);
    await tutor.click('button[data-act=tutGroup]:has-text("femení")');
    await tutor.click('button[data-act=tutApp][data-a=terra]');
  });

  await step('sense connexió: la tutora segueix i s’envia tot quan torna', async () => {
    await stopServer();
    const first = tutor.locator('#scoregrid input.sc').first();
    await first.click(); await tutor.keyboard.type('8,8'); await tutor.keyboard.press('Enter');
    await tutor.waitForSelector('text=Sense connexió', { timeout: 10000 });
    await admin.waitForSelector('text=Sense connexió amb el servidor', { timeout: 10000 });
    // la taula també segueix treballant
    const inp = admin.locator('#scoregrid input.sc[data-e=e1][data-a=salt]');
    await inp.click(); await admin.keyboard.type('7,7'); await admin.keyboard.press('Enter');
    await startServer();
    await tutor.waitForSelector('[data-st="e1:terra:0"].ok', { timeout: 15000 });
    await admin.waitForFunction(() => document.querySelector('#scoregrid input.sc[data-e=e1][data-a=terra]').value === '8,80', null, { timeout: 15000 });
    await admin.waitForSelector('text=Servidor ·', { timeout: 15000 });
    await new Promise(r => setTimeout(r, 1500));
    const d = JSON.parse(readFileSync(dataFile, 'utf8'));
    const e1 = d.competitions[0].entries.find(e => e.id === 'e1');
    assert.equal(e1.scores.salt[0].v, 7.7);
    assert.equal(e1.scores.terra[0].v, 8.8);
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
