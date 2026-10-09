// Proves de les rotacions i l'horari (pestanya «Rotacions i horari») amb les dades reals de la 3a fase del
// 18/04/2026. Obre l'app des del disc.   node tests/e2e-rotacions.mjs   (cal Playwright)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fixture } from './fixture-rotacions.mjs';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(path.join(execSync('npm root -g').toString().trim(), 'playwright')); }

const here = path.dirname(fileURLToPath(import.meta.url));
const url = pathToFileURL(path.join(here, '..', 'index.html')).href;
const out = path.join(here, 'out');
mkdirSync(out, { recursive: true });
const errors = [];
const step = async (name, fn) => { process.stdout.write(`· ${name} … `); await fn(); console.log('ok'); };

const browser = await playwright.chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ca-ES' });
  const page = await ctx.newPage();
  // (les dades es posen un sol cop: un script d'inici les tornaria a posar si en recarregar no les veiés a temps)
  await page.goto(url);
  await page.evaluate(r => { localStorage.setItem('notesgim.db', r); }, JSON.stringify(fixture()));
  await page.reload();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const view = () => page.evaluate(() => rotViewOf(curComp()).subs.map(s => ({ id: s.id, idx: s.idx, label: s.label, sizes: s.sizes.join('/'), k: s.k, dur: s.dur, warn: s.warnings.map(w => w.t) })));
  const toastHas = t => page.waitForSelector(`.toast:has-text("${t}")`);
  const card = label => page.locator('.card.rot-sub').filter({ has: page.locator('h3', { hasText: label }) }).first();
  const MODEL = ['INFANTIL A i B, CADET A i B i JUVENIL', 'BENJAMÍ A', 'BENJAMÍ B', 'MASCULINA', 'PREBENJAMÍ A i B', 'ALEVÍ A i B'];

  await step('«Fes les rotacions»: 6 subdivisions com el Consell, amb l’explicació', async () => {
    await page.goto(url + '#/competicio/c418/rotacions');
    await page.click('button[data-act=rotMake]');
    await toastHas('Fetes 6 subdivisions i 18 grups');
    const note = await page.locator('.note').first().textContent();
    assert.ok(note.includes('Benjamí té 55 gimnastes') && note.includes('Benjamí A i Benjamí B'), note);
    assert.ok(note.includes('Cadet (7) i Juvenil (1) tenen poques gimnastes') && note.includes('Tots els nois van junts'), note);
    assert.equal(await page.locator('.card.rot-sub').count(), 6);
    assert.ok((await page.locator('main').textContent()).includes('154 gimnastes'));
    const v = await view();
    assert.deepEqual(v.map(s => s.sizes), ['8/8/9', '9/11/6', '10/9/10', '12/15/14', '6/13/8', '2/1/3']);
    await page.screenshot({ path: path.join(out, 'rot-grups.png'), fullPage: true });
  });

  await step('ordre del dia amb ↑ ↓ (com el model), es recorda en tornar-les a fer', async () => {
    const move = async (label, d) => { await card(label).locator(`button[data-act=rotSubMove][data-d="${d}"]`).click(); await page.waitForTimeout(80); };
    // Infantil… de la 5a a la 1a; Masculina de la 6a a la 4a; Prebenjamí i Aleví al final
    for (let i = 0; i < 4; i++) await move('INFANTIL A i B', -1);
    await move('PREBENJAMÍ', 1); await move('PREBENJAMÍ', 1); await move('PREBENJAMÍ', 1);
    for (let i = 0; i < 2; i++) await move('MASCULINA', -1);
    const v = await view();
    assert.deepEqual(v.map(s => s.label), ['INFANTIL A i B, CADET A i B i JUVENIL', 'BENJAMÍ A', 'BENJAMÍ B', 'MASCULINA', 'ALEVÍ A i B', 'PREBENJAMÍ A i B']);
    await move('ALEVÍ A i B', 1);
    assert.deepEqual((await view()).map(s => s.label), MODEL);
    await page.waitForTimeout(400);
    await page.reload();
    assert.deepEqual((await view()).map(s => s.label), MODEL, 'després de tornar a obrir');
    // esborrar-les i tornar-les a fer: l'ordre es recorda
    await page.click('.toolbar .menu button[data-act=menuToggle]');
    await page.click('.menu.open button[data-act=rotDelete]');
    await page.click('#confirm button[value=ok]');
    await page.click('button[data-act=rotMake]');
    await toastHas('Fetes 6 subdivisions');
    assert.deepEqual((await view()).map(s => s.label), MODEL, 'l’ordre recordat');
  });

  await step('grups equilibrats, i l’avís que explica per què un grup és més gran', async () => {
    const t = await card('INFANTIL A i B').textContent();
    assert.ok(t.includes('Grups: 6 · 13 · 8'), t.slice(0, 300));
    assert.ok(t.includes('és més gran perquè cada categoria i nivell va al seu grup'));
    assert.ok(!(await card('BENJAMÍ A').textContent()).includes('Es pot repartir més bé'), 'el que surt ja és el millor');
  });

  await step('moure un equip a un altre grup: es veu l’efecte, queda 📌 i es pot desfer', async () => {
    const sel = card('BENJAMÍ A').locator('.rot-u', { hasText: 'C.G. Lleida 2' }).locator('select[data-chg=rotMove]');
    const v0 = (await view())[1];
    const opts = await sel.locator('option').allTextContents();
    const target = opts.findIndex(o => o.startsWith('→') && /\(6 → 12\)|\(9 → 15\)/.test(o));
    assert.ok(target >= 0, opts.join(' | '));
    await sel.selectOption({ index: target });
    await toastHas('Ara:');
    assert.ok(await card('BENJAMÍ A').locator('.rot-u', { hasText: 'C.G. Lleida 2' }).locator('text=📌').count());
    await page.locator('.toast:has-text("Ara:") button:has-text("Desfés")').click();
    await toastHas('Desfet');
    assert.equal((await view())[1].sizes, v0.sizes);
  });

  await step('«Reequilibra la resta» després de moure: ho ensenya abans i només mou el que cal', async () => {
    const v0 = await page.evaluate(() => { const sv = rotViewOf(curComp()).subs[1]; return { inef: sv.units.find(u => u.clubId === 'INEF').g, cgl2: sv.units.find(u => u.team && u.team.name === 'C.G. Lleida 2').g }; });
    const sel = card('BENJAMÍ A').locator('.rot-u', { hasText: 'C.G. Lleida 2' }).locator('select[data-chg=rotMove]');
    await sel.selectOption(String(v0.inef));
    await page.locator('.toast:has-text("Ara:") button:has-text("Reequilibra la resta")').click();
    await page.waitForSelector('#dlg[open] form[data-form=rotBalance]');
    const t = await page.locator('#dlg').textContent();
    assert.ok(t.includes('INEF Lleida (6): del Grup'), t);
    assert.ok(!t.includes('C.G. Lleida 2'), 'la fixada no es mou');
    await page.click('#dlg button.primary');
    await toastHas('Reequilibrada');
    const s = (await view())[1].sizes.split('/').map(Number).sort((a, b) => a - b);
    assert.deepEqual(s, [6, 9, 11]);
    assert.ok(await page.evaluate(g => rotViewOf(curComp()).subs[1].units.find(u => u.team && u.team.name === 'C.G. Lleida 2').g === g && rotViewOf(curComp()).subs[1].units.find(u => u.team && u.team.name === 'C.G. Lleida 2').pinned, v0.inef));
  });

  await step('«comença a»: el grup que comença a un altre aparell canvia el número', async () => {
    const before = await page.evaluate(() => rotViewOf(curComp()).subs[0].groups.map(g => g.label));
    await card('INFANTIL A i B').locator('select[data-chg=rotStart][data-g="0"]').selectOption('2');
    await toastHas('Ara aquest grup és el Grup 3');
    const after = await page.evaluate(() => rotViewOf(curComp()).subs[0].groups.map(g => g.label));
    assert.deepEqual(after, [before[2], before[1], before[0]]);
  });

  await step('entrenadores: La Salle Reus amb 1 entrenadora va en un sol grup a cada subdivisió', async () => {
    await page.click('button[data-act=rotCoachDlg] >> visible=true');
    await page.fill('#dlg input[name=c_LSR]', '1');
    await page.click('#dlg button.primary');
    for (let i = 0; i < 6; i++) {
      const bad = await page.evaluate(() => { const sv = rotViewOf(curComp()).subs.find(s => s.warnings.some(w => w.t === 'coach')); return sv ? sv.id : null; });
      if (!bad) break;
      await page.evaluate(id => actions.rotBalance({ dataset: { s: id } }), bad);
      await page.waitForSelector('#dlg[open] form[data-form=rotBalance]');
      await page.click('#dlg button.primary');
      await toastHas('Reequilibrada');
    }
    const groups = await page.evaluate(() => rotViewOf(curComp()).subs.map(s => (s.clubs.find(c => c.clubId === 'LSR') || { groups: 0 }).groups));
    assert.ok(groups.every(n => n <= 1), groups.join(','));
    // (es treu el límit i es tornen a fer tots els grups, com els del model, per a les proves que vénen)
    await page.click('button[data-act=rotCoachDlg] >> visible=true');
    await page.fill('#dlg input[name=c_LSR]', '');
    await page.click('#dlg button.primary');
    await toastHas('Entrenadores desades');
    await page.click('.toolbar .menu button[data-act=menuToggle]');
    await page.click('.menu.open button[data-act=rotRedoAll]');
    await page.click('#confirm button[value=all]');
    await toastHas('Grups refets a totes les subdivisions');
    assert.deepEqual((await view()).map(s => s.sizes), ['6/13/8', '9/11/6', '10/9/10', '2/1/3', '8/8/9', '12/15/14']);
  });

  await step('la Barra fixa dels nois, tots junts al final: surt al peu i a l’horari (12:00 – 12:20)', async () => {
    await card('MASCULINA').locator('button[data-act=rotAddFixa]').click();
    await toastHas('He afegit la Barra fixa');
    assert.ok((await card('MASCULINA').textContent()).includes('Al final, tots junts: Barra fixa (6)'));
    const v = await view();
    assert.deepEqual(v.map(s => s.dur), [80, 55, 55, 20, 50, 75]);
  });

  await step('una inscripció nova surt «NOU» amb la seva entitat; «D’acord» la desa i ningú més es mou', async () => {
    const at0 = await page.evaluate(() => JSON.stringify(curComp().rot.at));
    await page.evaluate(() => {
      const c = curComp(), g = { id: 'gnew', name: 'Nova', surname: 'Prova', clubId: 'FEDAC', gender: 'F', category: 'Aleví', level: 'B', birthYear: '', notes: '', archived: false };
      db.gymnasts.push(g); c.entries.push(newEntry(c, g)); commit(); render();
    });
    await page.waitForSelector('.note:has-text("gimnasta nova")');
    const where = await page.evaluate(() => { const c = curComp(), v = rotViewOf(c), e = c.entries.find(x => x.gymnastId === 'gnew'), p = v.place.get(e), sv = v.subs.find(s => s.id === p.subId);
      return { g: p.g, fedac: sv.units.filter(u => u.clubId === 'FEDAC' && u.key === 'Aleví||F||B' && !u.fresh).map(u => u.g) }; });
    assert.ok(where.fedac.includes(where.g), JSON.stringify(where));
    assert.ok(await page.locator('.rot-u.fresh').count());
    await page.click('.note button[data-act=rotAccept]');
    await toastHas('Desades on eren');
    const at1 = await page.evaluate(() => JSON.parse(JSON.stringify(curComp().rot.at)));
    const a0 = JSON.parse(at0);
    for (const k of Object.keys(a0)) assert.deepEqual(at1[k], a0[k], k);
    assert.equal(Object.keys(at1).length, Object.keys(a0).length + 1);
    assert.equal(await page.locator('.note:has-text("gimnasta nova")').count(), 0);
  });

  await step('canviar l’equip d’una gimnasta: es queda al seu grup i surt «Ajunta-les»', async () => {
    await page.evaluate(() => {
      const c = curComp(), v = rotViewOf(c), sv = v.subs.find(s => s.label === 'ALEVÍ A i B');
      const a = sv.units.find(u => u.team && u.team.name === 'C.G. Lleida 3'), b = sv.units.find(u => u.team && u.team.name === 'FEDAC Lleida' && u.g !== a.g);
      if (!b) throw new Error('cal un equip en un altre grup');
      window.__moved = [a.entries[0].id, a.entries[0].teamId];
      a.entries[0].teamId = b.team.id; commit(); render();
    });
    await page.waitForSelector('.chip:has-text("té gimnastes en 2 grups")');
    await page.locator('.chip:has-text("té gimnastes en 2 grups") button[data-act=rotJoinSplit]').click();
    await toastHas('totes al Grup');
    assert.equal(await page.locator('.chip:has-text("té gimnastes en 2 grups")').count(), 0);
  });

  await step('canviar el nom d’una categoria: les subdivisions la segueixen', async () => {
    await page.evaluate(() => {
      const i = S().categories.findIndex(c => c.name === 'Cadet');
      changes.catField({ dataset: { i: String(i), k: 'name' }, value: 'Cadets' });
    });
    await page.goto(url + '#/competicio/c418/rotacions');
    await page.waitForSelector('.card.rot-sub');
    assert.equal(await page.locator('.note:has-text("no era a cap subdivisió")').count(), 0);
    assert.ok((await view())[0].label.includes('CADETS A i B'));
  });

  await step('«Quines categories van juntes»: els nois per separat (i Desfés)', async () => {
    await page.click('button[data-act=rotSubsDlg] >> visible=true');
    await page.waitForSelector('#dlg[open] form[data-form=rotSubs]');
    await page.uncheck('#dlg input[data-chg=rotDraftAllM]');
    await page.waitForTimeout(100);
    assert.equal(await page.locator('#dlg .rot-dlist li').count(), 8);
    await page.click('#dlg button.primary');
    await toastHas('Desat');
    assert.equal((await view()).filter(s => s.label.startsWith('MASCULINA')).length, 3);
    await page.locator('.toast:has-text("Desat") button:has-text("Desfés")').click();
    await toastHas('Desfet');
    assert.equal((await view()).filter(s => s.label.startsWith('MASCULINA')).length, 1);
  });

  await step('horari: premis de la 5a a 10 minuts i una exhibició després de la 4a → les 19 files del model', async () => {
    // (el canvi de nom de Cadet fa que el nom de la 1a sigui un altre: es torna a posar)
    // (i es desfà la inscripció nova i el canvi d'equip d'abans: l'Aleví torna a ser el del 18/04)
    await page.evaluate(() => {
      const i = S().categories.findIndex(c => c.name === 'Cadets'); changes.catField({ dataset: { i: String(i), k: 'name' }, value: 'Cadet' });
      const c = curComp(); c.entries = c.entries.filter(e => e.gymnastId !== 'gnew');
      const [id, t] = window.__moved; c.entries.find(e => e.id === id).teamId = t; commit();
    });
    await page.goto(url + '#/competicio/c418/rotacions');
    await card('ALEVÍ A i B').locator('button[data-act=menuToggle]').click();
    await card('ALEVÍ A i B').locator('button[data-act=rotRedoSub]').click();
    await page.click('#confirm button[value]:not([value=""])');
    await toastHas('Grups refets');
    await page.click('button[data-act=rotSeg][data-v=horari]');
    const sub = i => page.evaluate(i => rotViewOf(curComp()).subs[i].id, i);
    await page.fill(`input[data-chg=rotSubField][data-s="${await sub(4)}"][data-k=awards]`, '10');
    await page.press(`input[data-chg=rotSubField][data-s="${await sub(4)}"][data-k=awards]`, 'Tab');
    await page.click(`button[data-act=rotExtraAdd][data-s="${await sub(3)}"]`);
    await toastHas('Fila afegida');
    const t = page.locator('input[data-chg=rotExtra][data-k=text]');
    await t.fill('EXHIBICIÓ I3 / I4 / I5'); await t.press('Tab');
    await page.waitForTimeout(150);
    const rows = await page.$$eval('table.rot-hor tr:not(.gap)', trs => trs.map(tr => tr.querySelector('td.t').textContent.trim() + ' ' + (tr.classList.contains('extra') ? tr.querySelector('input[data-k=text]').value : tr.querySelectorAll('td')[1].childNodes[0].textContent.trim())));
    assert.deepEqual(rows, [
      '8:00 – 8:30 Escalfament general 1a subdivisió a pista annexa',
      '8:30 – 9:50 Competició 1a subdivisió INFANTIL A i B, CADET A i B i JUVENIL - 3 rotacions - 3’ escalfament per aparell',
      '9:50 – 10:00 PREMIS INFANTIL A i B, CADET A i B i JUVENIL',
      '9:30 – 10:00 Escalfament general 2a subdivisió a pista annexa',
      '10:00 – 10:55 Competició 2a subdivisió BENJAMÍ A - 3 rotacions - 3’ escalfament per aparell',
      '10:55 – 11:00 PREMIS BENJAMÍ A',
      '10:30 – 11:00 Escalfament general 3a subdivisió a pista annexa',
      '11:00 – 11:55 Competició 3a subdivisió BENJAMÍ B - 3 rotacions - 3’ escalfament per aparell',
      '11:55 – 12:00 PREMIS BENJAMÍ B',
      '11:30 – 12:00 Escalfament general 4a subdivisió a pista annexa',
      '12:00 – 12:20 Competició 4a subdivisió MASCULINA - 3 rotacions - 1’30’’ escalfament per aparell',
      '12:35 – 12:40 PREMIS MASCULINA',
      '12:20 – 12:35 EXHIBICIÓ I3 / I4 / I5',
      '12:10 – 12:40 Escalfament general 5a subdivisió a pista annexa',
      '12:40 – 13:30 Competició 5a subdivisió PREBENJAMÍ A i B - 3 rotacions - 3’ escalfament per aparell',
      '13:30 – 13:40 PREMIS PREBENJAMÍ A i B',
      '13:10 – 13:40 Escalfament general 6a subdivisió a pista annexa',
      '13:40 – 14:55 Competició 6a subdivisió ALEVÍ A i B - 3 rotacions - 3’ escalfament per aparell',
      '14:55 – 15:00 PREMIS ALEVÍ A i B']);
    assert.equal(await page.locator('.note.warn').count(), 0, 'sense avisos');
    await page.fill('textarea[data-chg=rotNotes]', 'Text meu');
    await page.locator('textarea[data-chg=rotNotes]').blur();
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => curComp().rot.notes), 'Text meu');
    await page.click('button[data-act=rotNotesReset]');
    await toastHas('Observacions del Consell');
    await page.screenshot({ path: path.join(out, 'rot-horari.png'), fullPage: true });
  });

  await step('fulls de les rotacions i de l’horari (A4 vertical, com el model)', async () => {
    await page.evaluate(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; }; });
    await page.click('button[data-act=rotPrintDlg] >> visible=true');
    await page.uncheck('#dlg input[name=w][value=horari]');
    await page.click('#dlg button.primary');
    await page.waitForFunction(() => window.__printed === 1);
    const html = await page.locator('#print').innerHTML(), txt = await page.locator('#print').textContent();
    assert.equal((html.match(/<section class="sheet rot"/g) || []).length, 6);
    for (const x of ['Subdivisió – 1 – INFANTIL A i B, CADET A i B i JUVENIL', 'ORDRE: SALT → BARRA → TERRA', 'C.G. LLEIDA – CADET B', 'C.G. LLEIDA-2', 'MASCULINA (ALEVÍ)',
      'ORDRE DE ROTACIÓ PER A MASCULINA: SALT → MINITRAMP → TERRA / BARRA FIXA (LES 3 CATEGORIES)', 'Les tres categories realitzaran l’aparell Barra fixa'])
      assert.ok(txt.includes(x), x);
    const pdf = await page.pdf({ format: 'A4', path: path.join(out, 'rotacions.pdf') });
    const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    assert.equal(pages, 6, 'un full per subdivisió (l’Aleví hi cap)');
    await page.screenshot({ path: path.join(out, 'rot-print.png') });
    await page.evaluate(() => { document.body.classList.remove('printing'); $('#print').innerHTML = ''; });
    // l'horari
    await page.click('button[data-act=rotPrintDlg] >> visible=true');
    await page.uncheck('#dlg input[name=w][value=rot]');
    await page.click('#dlg button.primary');
    await page.waitForFunction(() => window.__printed === 2);
    const h2 = await page.locator('#print').textContent();
    for (const x of ['18 d’abril de 2026', 'HORARI GENERAL 18-04-2026', '8:00 – 8:30', '14:55 – 15:00', 'Observacions:', 'GIMNÀSTICA ARTÍSTICA FEMENINA I MASCULINA']) assert.ok(h2.includes(x), x);
    const pdf2 = await page.pdf({ format: 'A4', path: path.join(out, 'horari.pdf') });
    assert.equal((pdf2.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length, 1);
    await page.evaluate(() => { document.body.classList.remove('printing'); $('#print').innerHTML = ''; });
  });

  await step('després d’imprimir: si es mou un equip, avisa; una NP, no', async () => {
    await page.click('button[data-act=rotSeg][data-v=grups]');
    await page.evaluate(() => { curComp().entries.find(e => e.category === 'Aleví').status = 'np'; commit(); render(); });
    assert.equal(await page.locator('.note:has-text("després d’imprimir-les")').count(), 0);
    const sel = card('BENJAMÍ B').locator('select[data-chg=rotMove]').first();
    const cur = await sel.inputValue();
    await sel.selectOption(cur === '0' ? '1' : '0');
    await page.waitForSelector('.note:has-text("després d’imprimir-les")');
  });

  await step('competició bloquejada: es pot mirar i imprimir, però no canviar res', async () => {
    await page.evaluate(() => { curComp().locked = true; commit(); render(); });
    const enabled = await page.$$eval('main .card.rot-sub select, main .card.rot-sub button:not([data-act=menuToggle]), main .toolbar button[data-act=rotSubsDlg]', els => els.filter(e => !e.disabled).map(e => e.outerHTML.slice(0, 80)));
    assert.deepEqual(enabled, []);
    const upd = await page.evaluate(() => db.meta.updated);
    await page.click('button[data-act=rotPrintDlg] >> visible=true');
    await page.click('#dlg button.primary');
    await page.waitForFunction(() => window.__printed === 3);
    assert.equal(await page.evaluate(() => db.meta.updated), upd, 'no s’hi escriu res');
    await page.evaluate(() => { document.body.classList.remove('printing'); $('#print').innerHTML = ''; curComp().locked = false; commit(); render(); });
  });

  await step('al mòbil: 5 pestanyes, una subdivisió cada vegada i res que surti pels costats', async () => {
    for (const [w, hgt] of [[390, 844], [360, 740]]) {
      await page.setViewportSize({ width: w, height: hgt });
      await page.goto(url + '#/competicio/c418/rotacions');
      await page.waitForSelector('.card.rot-sub');
      assert.equal(await page.locator('.card.rot-sub').count(), 1);
      assert.equal(await page.locator('nav.tabs a').count(), 5);
      const [sw, iw] = await page.evaluate(() => [document.scrollingElement.scrollWidth, innerWidth]);
      assert.ok(sw <= iw, `${sw} > ${iw}`);
      await page.selectOption('.gsel select', { index: 1 });
      assert.ok((await page.locator('.card.rot-sub h3').textContent()).includes('2a subdivisió'));
    }
    await page.screenshot({ path: path.join(out, 'rot-mobil.png'), fullPage: true });
    await page.setViewportSize({ width: 1366, height: 900 });
  });

  await step('un fitxer trucat amb rotacions estranyes no peta ni executa res', async () => {
    const res = await page.evaluate(() => {
      const d = JSON.parse(JSON.stringify(db)), c = d.competitions[0], e0 = c.entries[0].id;
      c.rot.subs.push({ id: '<img src=x onerror=alert(1)>', g: 'F', keys: ['Aleví||F||A', 'bad', 5, 'x||M||A'], k: 99, name: 'x'.repeat(500), dur: -3, awards: 1e9, start: '25:99', extras: [{ id: '__proto__', text: '<b>', min: 'a' }] });
      c.rot.subs.push(JSON.parse(JSON.stringify(c.rot.subs[0])));
      c.rot.subs.push('junk', null);
      c.rot.at = JSON.parse('{"__proto__":{"s":"q","g":0},"constructor":{"s":"x","g":1}}');
      c.rot.at[e0] = { s: '<img>', g: 1, m: 1 };
      c.rot.coaches = JSON.parse('{"__proto__":2,"LSR":"1","FEDAC":99}');
      const m = migrate(d), r = m.competitions[0].rot;
      const keys = r.subs.flatMap(s => s.keys);
      return { proto: Object.getPrototypeOf(r.at) === Object.prototype && Object.getPrototypeOf(r.coaches) === Object.prototype, dupKeys: keys.length !== new Set(keys).size,
        bad: r.subs.some(s => s.keys.some(k => k.split('||').length !== 3 || k.split('||')[1] !== s.g)), names: r.subs.every(s => s.name.length <= 120), coaches: r.coaches,
        again: JSON.stringify(migrate(JSON.parse(JSON.stringify(m))).competitions[0].rot) === JSON.stringify(r) };
    });
    assert.ok(res.proto && !res.dupKeys && !res.bad && res.names && res.again, JSON.stringify(res));
    // (la clau «__proto__» passa a ser una clau qualsevol, sense cap efecte; 99 entrenadores no val)
    assert.equal(res.coaches.LSR, 1); assert.ok(!('FEDAC' in res.coaches) && !Object.prototype.hasOwnProperty.call(res.coaches, '__proto__'));
  });

  await step('«Jornada següent»: es copien les subdivisions (no els grups) i es poden fer de nou', async () => {
    await page.goto(url + '#/competicions');
    await page.click('button[data-act=dupComp][data-id=c418]');
    await page.click('#dlg form[data-form=comp] button.primary');
    await page.waitForSelector('nav.tabs');
    const r = await page.evaluate(() => { const c = db.competitions[db.competitions.length - 1]; return { made: c.rot.made, n: c.rot.subs.length, at: Object.keys(c.rot.at).length, id: c.id, src: c.rot.src }; });
    assert.deepEqual([r.made, r.n, r.at], [null, 6, 0]);
    await page.goto(url + `#/competicio/${r.id}/rotacions`);
    assert.ok((await page.locator('main').textContent()).includes('Les subdivisions seran les de'));
    await page.click('button[data-act=rotMake]');
    await toastHas('Fetes 6 subdivisions');
    assert.deepEqual((await view()).map(s => s.label), MODEL);
  });

  // ── correccions de la revisió: cada prova torna a començar amb les dades del 18/04 (sense rotacions fetes)
  const fresh = async (data = fixture()) => {
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.evaluate(r => {
      if ($('#dlg').open) closeDialog();
      document.querySelectorAll('.toast').forEach(t => t.remove());
      db = migrate(JSON.parse(r)); Object.assign(ui, { rotPlanNotes: null, rotSeg: 'grups', rotSub: null, rotTimesOpen: false }); commit();
      go('#/competicio/c418/rotacions');
    }, JSON.stringify(data));
    await page.waitForSelector('button[data-act=rotMake]');
  };
  const make = async () => { await page.click('button[data-act=rotMake]'); await toastHas('Fetes'); await page.waitForSelector('.card.rot-sub'); };
  const clearToasts = () => page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
  const subId = i => page.evaluate(i => rotViewOf(curComp()).subs[i].id, i);

  await step('horari: les observacions surten en l’ordre escrit; un valor que no val torna al d’abans; «Temps per gimnasta» no es plega', async () => {
    await fresh(); await make();
    await page.click('button[data-act=rotSeg][data-v=horari]');
    const typed = ['Abans de començar:', '- Comunicar les baixes.', '- Recollir els dorsals.', 'Aparcament: al carrer de darrere.', 'En cas d’avançament:', '- Els premis es poden avançar 20 minuts.'];
    await page.fill('textarea[data-chg=rotNotes]', typed.join('\n'));
    await page.locator('textarea[data-chg=rotNotes]').blur();
    await page.waitForTimeout(100);
    const obs = await page.evaluate(() => { const c = curComp(), d = document.createElement('div'); d.innerHTML = rotHorariSheet(c, rotViewOf(c)); const o = d.querySelector('.obs'); return { first: o.firstChild.textContent + o.childNodes[1].textContent, rest: [...o.querySelectorAll('p, li')].map(x => x.textContent) }; });
    assert.equal(obs.first, 'Observacions: Abans de començar:');
    assert.deepEqual(obs.rest, ['Comunicar les baixes.', 'Recollir els dorsals.', 'Aparcament: al carrer de darrere.', 'En cas d’avançament:', 'Els premis es poden avançar 20 minuts.']);
    // una durada que no val: el camp torna a dir la que es fa servir (no queda buit com si fos automàtica)
    const s1 = await subId(0), dur = page.locator(`input[data-chg=rotSubField][data-s="${s1}"][data-k=dur]`);
    await dur.fill('40'); await dur.press('Tab'); await page.waitForTimeout(100);
    await dur.fill('3'); await dur.press('Tab');
    await toastHas('Ha de ser un número del 5 al 600');
    assert.equal(await dur.inputValue(), '40');
    assert.equal(await page.evaluate(() => curComp().rot.subs[0].dur), 40);
    // temps m:ss: 99:00 no es desa com a 30:00 sense dir res; «abc» no es queda escrit
    await page.click('summary:has-text("Temps per gimnasta")');
    const wf = page.locator('input[data-chg=rotTimeMS][data-k=warmF]');
    for (const bad of ['99:00', 'abc']) {
      await clearToasts();
      await wf.fill(bad); await wf.press('Tab');
      await toastHas('com a màxim 30:00');
      assert.equal(await wf.inputValue(), '3:00', bad);
    }
    assert.equal(await page.evaluate(() => curComp().rot.time.warmF), 180);
    // un temps bo: l'apartat es queda obert i el Tab va al camp següent
    const al = page.locator('input[data-chg=rotGym][data-cat="Aleví"]');
    await al.fill('1:30'); await al.press('Tab'); await page.waitForTimeout(150);
    assert.ok(await page.evaluate(() => document.querySelector('details[data-open=rotTimesOpen]').open));
    assert.equal(await page.evaluate(() => document.activeElement.dataset.cat), 'Infantil');
    // textos: «de l’1 al 240» i el lloc de l'escalfament sense article
    await page.click(`button[data-act=rotExtraAdd][data-s="${s1}"]`); await toastHas('Fila afegida');
    const mi = page.locator('input[data-chg=rotExtra][data-k=min]');
    await mi.fill('0'); await mi.press('Tab'); await toastHas('Els minuts han de ser de l’1 al 240.');
    const pl = page.locator('input[data-chg=rotTime][data-k=place]');
    await pl.fill('Pavelló 2'); await pl.press('Tab'); await page.waitForTimeout(100);
    const s3 = page.locator(`input[data-chg=rotSubField][data-s="${await subId(2)}"][data-k=start]`);
    await s3.fill('08:30'); await s3.dispatchEvent('change'); await page.waitForTimeout(150);
    const w = (await page.locator('.note.warn').allInnerTexts()).find(x => x.startsWith('L’escalfament de la 3a'));
    assert.ok(w && w.endsWith(': a Pavelló 2 hi hauria dues subdivisions escalfant alhora.'), w);
  });

  await step('«Quines categories van juntes»: el màxim no es menja el clic, «Avançat» no es plega, el rètol vell se’n va i els nois no són «petits»', async () => {
    await fresh(); await make();
    assert.equal(await page.locator('.note:has-text("He fet")').count(), 1);
    const open = async () => { await page.click('button[data-act=rotSubsDlg] >> visible=true'); await page.waitForSelector('#dlg[open] form[data-form=rotSubs]'); };
    // escriure el màxim i clicar de seguida «Tots els nois junts» o ↓: el clic val
    await open();
    await page.fill('#dlg input[name=maxGroup]', '20');
    await page.click('#dlg input[data-chg=rotDraftAllM]');
    assert.equal(await page.isChecked('#dlg input[data-chg=rotDraftAllM]'), false);
    assert.ok((await page.locator('#dlg').textContent()).includes('més de 60 gimnastes (3 grups × 20)'));
    // «Avançat»: després de triar a quina va una categoria, es queda obert
    await page.click('#dlg details summary');
    await page.locator('#dlg select[data-chg=rotDraftKey]').last().selectOption('new');
    await page.waitForTimeout(100);
    assert.ok(await page.evaluate(() => document.querySelector('#dlg details').open));
    await page.click('#dlg button[data-act=closeDlg]');
    // desar sense canviar res: el rètol de «Fes les rotacions» ja no hi és, i la MASCULINA no diu «només té»
    await open();
    await page.fill('#dlg input[name=maxGroup]', '15');
    await page.click('#dlg button.primary');
    await toastHas('Desat');
    assert.equal(await page.locator('.note:has-text("He fet")').count(), 0);
    assert.equal(await card('MASCULINA').locator('.chip:has-text("només té")').count(), 0);
    // i el màxim escrit + «Desa» d'un sol clic
    await open(); await clearToasts();
    await page.fill('#dlg input[name=maxGroup]', '20');
    await page.click('#dlg button.primary');
    await toastHas('Desat');
    assert.equal(await page.evaluate(() => S().rot.maxGroup), 20);
  });

  await step('canviar l’equip d’una gimnasta a Inscripcions: diu on és a les rotacions i «Mou-la amb l’equip» l’hi porta', async () => {
    await fresh(); await make();
    await card('BENJAMÍ B').locator('.rot-u', { hasText: 'C.G. Lleida 2' }).locator('select[data-chg=rotMove]').selectOption('2');
    await toastHas('Ara:'); await clearToasts();
    const info = await page.evaluate(() => { const c = curComp(), t = n => c.teams.find(x => x.name === n && x.category === 'Benjamí' && x.level === 'B'); const e = c.entries.find(x => x.teamId === t('C.G. Lleida').id); return { e: e.id, t2: t('C.G. Lleida 2').id, at: JSON.stringify(c.rot.at) }; });
    await page.click('nav.tabs a:has-text("Inscripcions")');
    await page.locator(`select[data-chg=entryTeam][data-id="${info.e}"]`).first().selectOption(info.t2);
    await toastHas('A les rotacions continua al Grup');
    assert.ok((await page.locator('.toast').last().textContent()).includes('el seu equip nou és al Grup 3.'));
    assert.equal(await page.evaluate(() => JSON.stringify(curComp().rot.at)), info.at, 'ningú es mou sol');
    await page.click('.toast button:has-text("Mou-la amb l’equip")');
    await toastHas('Grup 3, amb el seu equip');
    await page.click('nav.tabs a:has-text("Rotac")');
    await page.waitForSelector('.card.rot-sub');
    assert.equal(await page.locator('.chip:has-text("té gimnastes en 2 grups")').count(), 0);
    assert.equal(await page.evaluate(id => rotViewOf(curComp()).place.get(curComp().entries.find(e => e.id === id)).g, info.e), 2);
  });

  await step('un màxim més baix fa més grups (o ho ofereix), i amb 12 grups cada equip es llegeix', async () => {
    await fresh(); await make();
    await page.click('.toolbar > .menu button[data-act=menuToggle]'); await page.click('.menu.open button[data-act=rotOptsDlg]');
    await page.fill('#dlg input[name=maxGroup]', '12'); await page.click('#dlg button.primary');
    await toastHas('Desat: grups refets');
    let al = (await view()).find(s => s.label === 'ALEVÍ A i B');
    assert.equal(al.k, 4); assert.ok(!al.warn.includes('over'), al.warn.join());
    // si el nombre de grups s'ha posat a mà, l'avís porta el botó per fer-ne prou
    await page.evaluate(id => actions.rotSetK({ dataset: { s: id, k: '3' } }), al.id); await toastHas('Ara hi ha 3 grups');
    await card('ALEVÍ A i B').locator('.chip.bad button[data-act=rotSetK]').first().click();
    await toastHas('Ara hi ha 4 grups');
    // 12 grups: les columnes van en dues files i el desplegable de cada equip diu «Grup 1 · Salt» sencer
    await page.evaluate(id => actions.rotSetK({ dataset: { s: id, k: '12' } }), al.id); await toastHas('Ara hi ha 12 grups');
    const r = await card('ALEVÍ A i B').locator('select[data-chg=rotMove]').first().evaluate(s => ({ w: s.getBoundingClientRect().width, t: s.options[s.selectedIndex].text }));
    const tw = await page.evaluate(t => { const c = document.createElement('canvas').getContext('2d'); c.font = getComputedStyle(document.querySelector('select[data-chg=rotMove]')).font; return c.measureText(t).width; }, r.t);
    assert.ok(r.w > tw + 30, JSON.stringify(r) + ' ' + tw);
  });

  await step('inscripcions i categories noves: textos en singular, totes les subdivisions als fulls i el recompte bo', async () => {
    await fresh(); await make();
    // una sola gimnasta nova
    await page.evaluate(() => { const c = curComp(), g = { id: 'gn1', name: 'Nova', surname: 'Una', clubId: 'BP', gender: 'F', category: 'Aleví', level: 'B', birthYear: '', notes: '', archived: false }; db.gymnasts.push(g); c.entries.push(newEntry(c, g)); commit(); render(); });
    const n1 = await page.locator('.note.warn', { hasText: 'gimnasta nova' }).innerText();
    assert.ok(n1.includes('1 gimnasta nova') && n1.includes('l’he posada') && n1.includes('surt marcada') && n1.includes('deixa-la així'), n1);
    await page.click('.note button[data-act=rotAccept]'); await toastHas('Desades on eren');
    // 4 de Sènior (una categoria sense subdivisió): «nova» al final
    await page.evaluate(() => { const c = curComp(); for (let i = 0; i < 4; i++) { const g = { id: 'gs' + i, name: 'Sèn' + i, surname: 'Nova', clubId: 'CGL', gender: 'F', category: 'Sènior', level: 'A', birthYear: '', notes: '', archived: false }; db.gymnasts.push(g); c.entries.push(newEntry(c, g)); } commit(); render(); });
    assert.ok((await page.locator('.note.warn', { hasText: 'gimnastes noves' }).innerText()).includes('4 gimnastes noves'));
    await page.evaluate(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; }; window.__printed = 0; });
    await page.click('button[data-act=rotPrintDlg] >> visible=true');
    const boxes = await page.locator('#dlg input[name=s]').count();
    assert.equal(boxes, 7);
    await page.uncheck('#dlg input[name=w][value=horari]');
    await page.click('#dlg button.primary');
    await page.waitForSelector('#confirm[open]');
    const q = await page.locator('#confirm').innerText();
    assert.ok(q.includes('Hi ha 4 gimnastes noves que encara no has revisat'), q);
    await page.click('#confirm button[value=ok]');
    // (la nova d'Aleví fa que un grup passi de 15: també ho pregunta)
    await page.waitForTimeout(150);
    if (await page.evaluate(() => $('#confirm').open)) { assert.ok((await page.locator('#confirm').innerText()).includes('Encara hi ha avisos')); await page.click('#confirm button[value=ok]'); }
    await page.waitForFunction(() => window.__printed === 1);
    const html = await page.locator('#print').innerHTML();
    assert.equal((html.match(/<section class="sheet rot"/g) || []).length, 7);
    assert.ok(html.includes('SÈNIOR'));
    await page.evaluate(() => { document.body.classList.remove('printing'); $('#print').innerHTML = ''; });
  });

  await step('al mòbil: el menú ⋯ de dalt cap a la pantalla i, després de moure un equip d’una subdivisió nova, es continua veient', async () => {
    await fresh(); await make();
    for (const [w, hgt] of [[360, 740], [390, 844]]) {
      await page.setViewportSize({ width: w, height: hgt });
      await page.evaluate(() => render());
      await clearToasts();
      await page.click('.toolbar > .menu button[data-act=menuToggle]');
      const r = await page.evaluate(() => { const l = document.querySelector('.toolbar > .menu.open .menu-list').getBoundingClientRect(); return { l: l.left, r: l.right, sw: document.scrollingElement.scrollWidth, iw: innerWidth }; });
      assert.ok(r.l >= 0 && r.r <= r.iw && r.sw <= r.iw, `${w}: ${JSON.stringify(r)}`);
      await page.evaluate(() => closeMenus());
    }
    await page.evaluate(() => { const c = curComp(); for (let i = 0; i < 6; i++) { const g = { id: 'gm' + i, name: 'Sèn' + i, surname: 'Mòbil', clubId: i % 2 ? 'CGL' : 'INEF', gender: 'F', category: 'Sènior', level: 'A', birthYear: '', notes: '', archived: false }; db.gymnasts.push(g); c.entries.push(newEntry(c, g)); } commit(); render(); });
    const auto = await page.evaluate(() => rotViewOf(curComp()).subs.find(s => !s.real).id);
    await page.selectOption('.gsel select', auto);
    await page.waitForSelector('.card.rot-sub h3:has-text("SÈNIOR")');
    await page.locator('.card.rot-sub select[data-chg=rotMove]').first().selectOption({ index: 1 });
    await toastHas('Ara:');
    assert.ok((await page.locator('.card.rot-sub h3').textContent()).includes('SÈNIOR'));
    await page.setViewportSize({ width: 1366, height: 900 });
  });

  await step('categories petites ben explicades, gimnastes sense categoria, un noi d’una categoria nova i tots els aparells al final', async () => {
    // Prebenjamí 5, Benjamí 6 i Aleví 18 (noies): s'ajunten totes dues amb Aleví, i es diu una vegada
    const d = fixture(), c = d.competitions[0], keep = { Prebenjamí: 5, Benjamí: 6, Aleví: 18 };
    c.entries = c.entries.filter(e => e.gender === 'F' && keep[e.category] && keep[e.category]-- > 0);
    await fresh(d); await make();
    const note = await page.locator('.note:has-text("He fet")').innerText();
    assert.ok(note.includes('Prebenjamí (5) i Benjamí (6) tenen poques gimnastes: les he ajuntat amb Aleví.'), note);
    assert.ok(!note.includes('té poques') && !note.includes('només té'), note);
    // dues gimnastes sense categoria: subdivisió seva, nom sencer i l'avís per posar-la
    const d2 = fixture();
    for (let i = 0; i < 2; i++) { d2.gymnasts.push({ id: 'gq' + i, name: 'Q' + i, surname: 'Sense', clubId: 'CGL', gender: 'F', category: '', level: 'A', birthYear: '', notes: '', archived: false });
      d2.competitions[0].entries.push({ id: 'eq' + i, gymnastId: 'gq' + i, clubId: 'CGL', gender: 'F', category: '', level: 'A', teamId: null, bib: 900 + i, status: '', scores: {} }); }
    await fresh(d2); await make();
    assert.ok((await page.locator('.note.warn').allInnerTexts()).some(x => x.startsWith('2 gimnastes no tenen categoria o nivell')));
    assert.ok((await view()).some(s => s.label === 'SENSE CATEGORIA'));
    assert.ok((await view()).every(s => !/ i $/.test(s.label)));
    // un noi passa a Infantil (cap subdivisió): va amb els altres nois, i ho diu així
    await page.evaluate(() => { const c = curComp(); c.entries.find(e => e.gender === 'M').category = 'Infantil'; commit(); render(); });
    assert.ok((await page.locator('.note.warn').allInnerTexts()).some(x => x.includes('no era a cap subdivisió') && x.includes('(amb els altres nois)')));
    // tots els aparells dels nois «tots junts al final»: sense rotacions, sense l'error i l'horari ho diu bé
    await page.click('.toolbar > .menu button[data-act=menuToggle]'); await page.click('.menu.open button[data-act=rotAppsDlg]');
    for (const b of await page.locator('#dlg input[name=fin_M]').all()) await b.check();
    await page.click('#dlg button.primary'); await toastHas('Ordre desat');
    assert.equal(await page.locator('.note.bad').count(), 0);
    const mt = await card('MASCULINA').locator('.rot-ord').textContent(); assert.ok(/^Sense rotacions: tots junts a .+ \(\d+\)$/.test(mt), mt);
    await page.click('button[data-act=rotSeg][data-v=horari]');
    const row = await page.locator('table.rot-hor tr.comp', { hasText: 'MASCULINA' }).locator('td').nth(1).evaluate(td => td.childNodes[0].textContent.trim());
    assert.ok(/^Competició \da subdivisió MASCULINA - 1’30’’ escalfament per aparell$/.test(row), row);
    await page.click('button[data-act=rotSeg][data-v=grups]');
  });
} finally {
  await browser.close();
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('\nRotacions i horari correctes.');
