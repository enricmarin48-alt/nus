// Prova de l'app instal·lable (com quan és a GitHub Pages, https): funciona sense internet, es posa al dia
// sola quan hi ha una versió nova, i el joc NUS (al mateix lloc) no li deixa cap versió vella desada.
//   node tests/e2e-pwa.mjs        (cal Playwright i openssl)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import https from 'node:https';
import { readFileSync, mkdtempSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(path.join(execSync('npm root -g').toString().trim(), 'playwright')); }
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, '..', '..');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'notesgim-pwa-'));
execSync(`openssl req -x509 -newkey rsa:2048 -nodes -keyout "${tmp}/k.pem" -out "${tmp}/c.pem" -days 1 -subj /CN=127.0.0.1`, { stdio: 'ignore' });

// el lloc: el repositori a /nus/ (com GitHub Pages), amb memòria cau de 10 minuts com Pages
const state = { build: 'V1', up: true };
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.json': 'application/json' };
const srv = https.createServer({ key: readFileSync(`${tmp}/k.pem`), cert: readFileSync(`${tmp}/c.pem`) }, (req, res) => {
  if (!state.up) { req.socket.destroy(); return; }
  let p = decodeURIComponent(new URL(req.url, 'https://x').pathname);
  if (!p.startsWith('/nus/')) { res.writeHead(404); return res.end(); }
  p = p.slice(5); if (p === '' || p.endsWith('/')) p += 'index.html';
  const file = path.join(repo, p);
  if (!file.startsWith(repo) || !existsSync(file)) { res.writeHead(404); return res.end(); }
  let body = readFileSync(file);
  if (p === 'gimnastica/index.html') body = Buffer.from(body.toString().replace("const APP_BUILD = 'dev';", `const APP_BUILD = '${state.build}';`));
  if (p === 'gimnastica/sw.js') body = Buffer.from(body.toString().replace(/const VERSION = '[^']*';/, `const VERSION = 'notesgim-${state.build}';`));
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream', 'cache-control': 'max-age=600' });
  res.end(body);
}).listen(18443);
const base = 'https://127.0.0.1:18443/nus/';
const step = async (name, fn) => { process.stdout.write(`· ${name} … `); await fn(); console.log('ok'); };
const browser = await playwright.chromium.launch({ args: ['--ignore-certificate-errors'] });
const errors = [];
try {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  const build = async () => { await page.goto(base + 'gimnastica/#/configuracio'); await page.waitForSelector('text=funciona sense internet'); return (await page.textContent('main')).match(/NotesGim [\d.]+ · (\S+)/)[1]; };
  const controlled = () => page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 15000 });

  await step('primer s’obre el joc NUS (el seu service worker cobreix tot /nus/)', async () => {
    await page.goto(base);
    await page.waitForFunction(() => navigator.serviceWorker.controller || navigator.serviceWorker.ready, null, { timeout: 15000 });
    await page.waitForTimeout(500);
  });

  await step('NotesGim s’instal·la i queda llesta per funcionar sense internet', async () => {
    await page.goto(base + 'gimnastica/');
    await page.waitForSelector('text=Competicions');
    await controlled();
    assert.equal(await build(), 'V1');
    await page.waitForSelector('#offstat:has-text("Llesta per funcionar sense internet")', { timeout: 15000 });
    // el NUS no s'ha quedat cap pàgina de NotesGim
    const leaked = await page.evaluate(async () => { const out = []; for (const k of await caches.keys()) { if (k.startsWith('notesgim-')) continue; for (const r of await (await caches.open(k)).keys()) if (r.url.includes('/gimnastica/')) out.push(k + ' ' + r.url); } return out; });
    assert.deepEqual(leaked, []);
  });

  await step('sense internet s’obre igual (també amb ?source=pwa)', async () => {
    state.up = false;
    for (const u of ['gimnastica/', 'gimnastica/index.html', 'gimnastica/?source=pwa', 'gimnastica/#/gimnastes']) {
      await page.goto(base + u);
      await page.waitForSelector('header.top .brand');
    }
    state.up = true;
  });

  await step('versió nova: avisa amb «Actualitza» i, en clicar-hi, es fa servir la nova', async () => {
    state.build = 'V2';
    await page.goto(base + 'gimnastica/');
    await page.waitForSelector('button[data-act=applyUpdate]', { timeout: 20000 });
    await page.click('button[data-act=applyUpdate]');
    await page.waitForLoadState('load');
    assert.equal(await build(), 'V2');
    state.up = false;
    assert.equal(await build(), 'V2', 'sense internet, també la nova');
    state.up = true;
  });
} finally {
  await browser.close();
  srv.close();
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('\nApp instal·lable correcta.');
