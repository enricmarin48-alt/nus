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
// les dades del 18/04 amb la regla que ella va fer servir aquell dia (Infantil, Cadet i Juvenil, juntes): l'app no
// n'ajunta cap sola, i la regla es recorda d'una competició a l'altra
const ICJ = ['Infantil', 'Cadet', 'Juvenil'];
const fixtureJ = date => { const d = fixture(date); d.settings.rot = { joins: [{ g: 'F', cats: ICJ }], apart: [], seen: [], allM: true, maxGroup: 15 }; return d; };

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

  await step('«Fes les rotacions»: cada categoria en la seva (Cadet i Juvenil, petites, només es diu); ella les ajunta amb Infantil i surten les 6 del Consell', async () => {
    await page.goto(url + '#/competicio/c418/rotacions');
    assert.ok((await page.locator('main').textContent()).includes('cada categoria en la seva (només van juntes les que ajuntes tu'));
    await page.click('button[data-act=rotMake]');
    await toastHas('Fetes 8 subdivisions i 22 grups');
    const note = (await page.locator('.note').first().textContent()).replace(/\s+/g, ' ');
    assert.ok(note.includes('He fet 8 subdivisions. Cada categoria va en la seva, si no l’ajuntes tu amb una altra.'), note);
    assert.ok(note.includes('Benjamí té 55 gimnastes') && note.includes('Benjamí A i Benjamí B') && note.includes('Tots els nois van junts'), note);
    assert.ok(note.includes('Cadet (7) i Juvenil (1) tenen poques gimnastes: si vols, ajunta-les amb una altra categoria a «Quines categories van juntes…».'), note);
    assert.ok(!note.includes('les he ajuntades'), 'cap no s’ajunta sola');
    assert.deepEqual((await view()).map(s => s.label), ['PREBENJAMÍ A i B', 'BENJAMÍ A', 'BENJAMÍ B', 'ALEVÍ A i B', 'INFANTIL A i B', 'CADET A i B', 'JUVENIL', 'MASCULINA']);
    // ella ajunta Infantil, Cadet i Juvenil (com el 18/04)
    await page.click('button[data-act=rotSubsDlg] >> visible=true');
    await page.waitForSelector('#dlg[open] form[data-form=rotSubs]');
    for (const cat of ICJ) await page.check(`#dlg input[name=jc][data-g=F][value="${cat}"]`);
    await page.click('#dlg button[data-act=rotDraftJoin][data-g=F]');
    await page.click('#dlg button.primary');
    await toastHas('Desat');
    assert.equal(await page.locator('.card.rot-sub').count(), 6);
    assert.ok((await page.locator('main').textContent()).includes('154 gimnastes'));
    assert.deepEqual((await view()).map(s => s.label), ['PREBENJAMÍ A i B', 'BENJAMÍ A', 'BENJAMÍ B', 'ALEVÍ A i B', 'INFANTIL A i B, CADET A i B i JUVENIL', 'MASCULINA']);
    assert.deepEqual(await page.evaluate(() => S().rot.joins.filter(j => j.g === 'F')), [{ g: 'F', cats: ICJ }]);
    // es torna a fer de zero: ara ja surten les 6, i es diu que van juntes perquè ho ha dit ella
    await page.click('.toolbar .menu button[data-act=menuToggle]');
    await page.click('.menu.open button[data-act=rotDelete]');
    await page.click('#confirm button[value=ok]');
    await page.click('button[data-act=rotMake]');
    await toastHas('Fetes 6 subdivisions i 18 grups');
    const n2 = (await page.locator('.note').first().textContent()).replace(/\s+/g, ' ');
    assert.ok(n2.includes('Infantil, Cadet i Juvenil van juntes, com vas dir.') && !n2.includes('poques gimnastes'), n2);
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

  await step('la Barra fixa dels nois, tots junts al final i «Classificació a part» (de moment no suma): surt al peu i a l’horari (12:00 – 12:20)', async () => {
    assert.ok((await card('MASCULINA').textContent()).includes('els nois fan la Barra fixa tots junts al final (de moment, a part: no suma al total)'));
    await card('MASCULINA').locator('button[data-act=rotAddFixa]').click();
    const t = await (await toastHas('Afegida la barra fixa dels nois')).textContent();
    assert.ok(t.startsWith('Afegida la barra fixa dels nois (tots junts al final). De moment no suma al total: si ha de sumar, canvia-ho a Configuració → Aparells → «Compta».'), t);
    const bf = await page.evaluate(() => { const c = curComp(), a = c.apparatus.find(x => x.name === 'Barra fixa'); return { modes: a.modes, final: c.rot.final.M.includes(a.id), total: Engine.totalApps(c, 'M').some(x => x.id === a.id), on: Engine.enabledApps(c, 'M').some(x => x.id === a.id) }; });
    assert.deepEqual(bf, { modes: { F: 'off', M: 'apart' }, final: true, total: false, on: true });
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
      // (un canvi de subdivisió fet a mà, amb una clau de més, i un altre de trucat)
      const e1 = c.entries[1].id, e2 = c.entries[2].id;
      c.rot.at[e1] = { s: c.rot.subs[1].id, g: 1, m: 1, x: 1, k: 'Aleví||F||A', junk: '<b>' }; c.rot.at[e2] = { s: c.rot.subs[1].id, g: 0, x: 2, k: 7 };
      c.rot.coaches = JSON.parse('{"__proto__":2,"LSR":"1","FEDAC":99}');
      const m = migrate(d), r = m.competitions[0].rot;
      const keys = r.subs.flatMap(s => s.keys), sub1 = d.competitions[0].rot.subs[1].id;
      const xs = [JSON.stringify(r.at[e1]), JSON.stringify(r.at[e2])], xsOk = xs[0] === JSON.stringify({ s: sub1, g: 1, m: 1, x: 1, k: 'Aleví||F||A' }) && xs[1] === JSON.stringify({ s: sub1, g: 0 });
      return { proto: Object.getPrototypeOf(r.at) === Object.prototype && Object.getPrototypeOf(r.coaches) === Object.prototype, dupKeys: keys.length !== new Set(keys).size,
        bad: r.subs.some(s => s.keys.some(k => k.split('||').length !== 3 || k.split('||')[1] !== s.g)), names: r.subs.every(s => s.name.length <= 120), coaches: r.coaches,
        again: JSON.stringify(migrate(JSON.parse(JSON.stringify(m))).competitions[0].rot) === JSON.stringify(r), xsOk, xs };
    });
    assert.ok(res.proto && !res.dupKeys && !res.bad && res.names && res.again && res.xsOk, JSON.stringify(res));
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
  const fresh = async (data = fixtureJ()) => {
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.evaluate(r => {
      if ($('#dlg').open) closeDialog();
      document.querySelectorAll('.toast').forEach(t => t.remove());
      db = migrate(JSON.parse(r)); Object.assign(ui, { rotPlanNotes: null, rotSeg: 'grups', rotSub: null, rotTimesOpen: false }); commit();
      go('#/competicio/c418/rotacions');
    }, JSON.stringify(data));
    await page.waitForSelector('button[data-act=rotMake]');
  };
  // («Fetes 6 subdivisions…» o, si només n'hi ha una, «Feta 1 subdivisió…»)
  const make = async () => { await page.click('button[data-act=rotMake]'); await toastHas('i mou el que calgui'); await page.waitForSelector('.card.rot-sub'); };
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
    // (una hora es torna a pintar en sortir-ne: a cada part, l'hora i els minuts, el navegador ja avisa d'un canvi)
    await s3.fill('08:30'); await s3.dispatchEvent('change'); await s3.blur(); await page.waitForTimeout(150);
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
    // «Avançat»: després de triar a quina va una categoria, es queda obert (també si el navegador avisa d'haver-lo obert
    // després de tornar a pintar el diàleg: es mira quan el diàleg ja té la subdivisió nova, no al cap d'una estona)
    const key = await page.locator('#dlg select[data-chg=rotDraftKey]').last().getAttribute('data-k');
    await page.click('#dlg details summary');
    await page.locator('#dlg select[data-chg=rotDraftKey]').last().selectOption('new');
    await page.waitForFunction(k => { const L = ui.rotDraft.subs; return L[L.length - 1].keys.includes(k) && document.querySelector(`#dlg select[data-chg=rotDraftKey][data-k="${k}"]`).value === String(L.length - 1); }, key);
    assert.ok(await page.evaluate(() => document.querySelector('#dlg details').open && ui.rotAdvOpen));
    // (el mateix, el clic i el canvi seguits, sense que el navegador hagi avisat encara)
    assert.ok(await page.evaluate(() => { const d = $('#dlg details'); d.open = false; ui.rotAdvOpen = false; rotDraftRedraw();
      $('#dlg details summary').click(); const sel = [...$$('#dlg select[data-chg=rotDraftKey]')].pop(); sel.value = 'new'; sel.dispatchEvent(new Event('change', { bubbles: true }));
      return $('#dlg details').open; }), '«Avançat» es queda obert');
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
    // (i un sol noi nou, en masculí)
    await page.evaluate(() => { const c = curComp(), g = { id: 'gm1', name: 'Nou', surname: 'Un', clubId: 'CGL', gender: 'M', category: 'Aleví', level: 'A', birthYear: '', notes: '', archived: false }; db.gymnasts.push(g); c.entries.push(newEntry(c, g)); commit(); render(); });
    const m1 = await page.locator('.note.warn', { hasText: 'gimnasta nou' }).innerText();
    assert.ok(m1.includes('1 gimnasta nou ') && m1.includes('l’he posat ') && m1.includes('surt marcat ') && m1.includes('deixa’l així'), m1);
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
    // només 18 d'Aleví (noies): una sola subdivisió, en singular, i res a dir de petites
    const d0 = fixture(); d0.competitions[0].entries = d0.competitions[0].entries.filter(e => e.gender === 'F' && e.category === 'Aleví').slice(0, 18);
    await fresh(d0); await make();
    assert.ok((await page.locator('.toast', { hasText: 'i mou el que calgui' }).innerText()).startsWith('Feta 1 subdivisió i '), await page.locator('.toast').last().innerText());
    assert.ok(!(await page.locator('.note:has-text("He fet")').innerText()).includes('poques'));
    // Prebenjamí 5, Benjamí 6 i Aleví 18 (noies): cadascuna en la seva, i es diu una vegada que les dues primeres són petites
    const d = fixture(), c = d.competitions[0], keep = { Prebenjamí: 5, Benjamí: 6, Aleví: 18 };
    c.entries = c.entries.filter(e => e.gender === 'F' && keep[e.category] && keep[e.category]-- > 0);
    await fresh(d); await make();
    assert.ok((await page.locator('.toast', { hasText: 'i mou el que calgui' }).innerText()).startsWith('Fetes 3 subdivisions i '), await page.locator('.toast').last().innerText());
    const note = await page.locator('.note:has-text("He fet")').innerText();
    assert.ok(note.includes('Prebenjamí (5) i Benjamí (6) tenen poques gimnastes: si vols, ajunta-les amb una altra categoria a «Quines categories van juntes…».'), note);
    assert.ok(!note.includes('les he ajuntades') && !note.includes('només té'), note);
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

  // ── segona revisió
  const act = () => page.evaluate(() => { const a = document.activeElement; return !a || a === document.body ? { tag: 'BODY' } : { tag: a.tagName, chg: a.dataset.chg || '', act: a.dataset.act || '', k: a.dataset.k || '', s: a.dataset.s || '', what: a.dataset.what || '' }; });
  const addGirls = (cat, n, pre) => page.evaluate(([cat, n, pre]) => { const c = curComp(); for (let i = 0; i < n; i++) { const g = { id: pre + i, name: 'N' + i, surname: 'Nova', clubId: i % 2 ? 'CGL' : 'INEF', gender: 'F', category: cat, level: 'A', birthYear: '', notes: '', archived: false }; db.gymnasts.push(g); c.entries.push(newEntry(c, g)); } commit(); render(); }, [cat, n, pre]);

  await step('horari amb el teclat: Tab després d’escriure no perd el focus (tampoc a una subdivisió «nova») i Maj+Tab no se’n va al botó de dalt', async () => {
    await fresh(); await make();
    await addGirls('Sènior', 4, 'gk');
    await page.click('button[data-act=rotSeg][data-v=horari]');
    const auto = await page.evaluate(() => rotViewOf(curComp()).subs.find(s => !s.real).id);
    const dur = page.locator(`input[data-chg=rotSubField][data-s="${auto}"][data-k=dur]`);
    await dur.fill('40'); await dur.press('Tab'); await page.waitForTimeout(150);
    // (la subdivisió nova s'ha desat amb un altre id: el focus és a «Premis» de la mateixa fila)
    const id = await page.evaluate(() => curComp().rot.subs.find(s => s.dur === 40).id);
    assert.notEqual(id, auto);
    assert.deepEqual(await act(), { tag: 'INPUT', chg: 'rotSubField', act: '', k: 'awards', s: id, what: '' });
    await page.keyboard.type('10'); await page.keyboard.press('Tab'); await page.waitForTimeout(150);
    assert.deepEqual(await act(), { tag: 'INPUT', chg: 'rotSubField', act: '', k: 'start', s: id, what: '' });
    assert.equal(await page.evaluate(id => curComp().rot.subs.find(s => s.id === id).awards, id), 10);
    // «Premis: minuts per cada 3…» → Tab: el desplegable «Temps per gimnasta i escalfaments»
    const aw = page.locator('input[data-chg=rotTime][data-k=awards]');
    await aw.fill('6'); await aw.press('Tab'); await page.waitForTimeout(150);
    assert.equal((await act()).tag, 'SUMMARY');
    // la 1a «Durada» → Maj+Tab: «Imprimeix l’horari» (no «Imprimeix / PDF…» de dalt), i la pàgina no es mou
    const d1 = page.locator('input[data-chg=rotSubField][data-k=dur]').first();
    await d1.evaluate(el => el.scrollIntoView({ block: 'center' }));
    const y0 = await page.evaluate(() => scrollY);
    await d1.fill('60'); await d1.press('Shift+Tab'); await page.waitForTimeout(150);
    assert.deepEqual(await act(), { tag: 'BUTTON', chg: '', act: 'rotPrintDlg', k: '', s: '', what: 'horari' });
    assert.equal(await page.evaluate(() => scrollY), y0);
    await page.click('button[data-act=rotSeg][data-v=grups]');
  });

  await step('diàlegs amb el teclat: ↑ ↓ tornen a moure la mateixa fila (no la de l’altra llista ni la que ara és al seu lloc)', async () => {
    await fresh(); await make();
    await page.click('.toolbar > .menu button[data-act=menuToggle]'); await page.click('.menu.open button[data-act=rotAppsDlg]');
    await page.waitForSelector('#dlg[open] form[data-form=rotApps]');
    const order = () => page.evaluate(() => ({ F: ui.rotApps.F.list.join(','), M: ui.rotApps.M.list.join(',') }));
    const o0 = await order(), m0 = o0.M.split(',');
    await page.focus('#dlg button[data-act=rotAppsMove][data-g=M][data-i="0"][data-d="1"]');
    await page.keyboard.press('Enter'); await page.waitForTimeout(80); await page.keyboard.press('Enter'); await page.waitForTimeout(80);
    const o1 = await order();
    assert.equal(o1.F, o0.F, 'l’ordre de les noies no canvia');
    assert.deepEqual(o1.M.split(','), [m0[1], m0[2], m0[0], ...m0.slice(3)]);
    await page.click('#dlg button[data-act=closeDlg]');
    await page.click('button[data-act=rotSubsDlg] >> visible=true'); await page.waitForSelector('#dlg[open] form[data-form=rotSubs]');
    const labels = () => page.evaluate(() => ui.rotDraft.subs.map(s => Engine.rotSubLabel(s.keys, curComp())));
    const l0 = await labels();
    await page.focus('#dlg button[data-act=rotDraftMove][data-i="0"][data-d="1"]');
    await page.keyboard.press('Enter'); await page.waitForTimeout(80); await page.keyboard.press('Enter'); await page.waitForTimeout(80);
    assert.deepEqual(await labels(), [l0[1], l0[2], l0[0], ...l0.slice(3)]);
    await page.click('#dlg button[data-act=closeDlg]');
  });

  await step('al mòbil: «Desfés» després de moure un equip d’una subdivisió «nova» es queda a la mateixa subdivisió', async () => {
    await fresh(); await make();
    await page.setViewportSize({ width: 390, height: 844 }); await page.evaluate(() => render());
    await addGirls('Sènior', 6, 'gu');
    await page.selectOption('.gsel select', await page.evaluate(() => rotViewOf(curComp()).subs.find(s => !s.real).id));
    await page.waitForSelector('.card.rot-sub h3:has-text("SÈNIOR")');
    await clearToasts();
    await page.locator('.card.rot-sub select[data-chg=rotMove]').first().selectOption({ index: 1 });
    await toastHas('Ara:');
    await page.click('.toast:has-text("Ara:") button:has-text("Desfés")');
    await toastHas('Desfet');
    assert.ok((await page.locator('.card.rot-sub h3').textContent()).includes('SÈNIOR'));
    assert.ok((await page.locator('.gsel select').evaluate(s => s.options[s.selectedIndex].text)).includes('SÈNIOR'));
    await page.setViewportSize({ width: 1366, height: 900 });
  });

  await step('sense cap gimnasta que competeixi, «Imprimeix» i Ctrl+P no fan uns fulls de rotacions buits', async () => {
    await fresh(); await make();
    await page.evaluate(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; }; window.__printed = 0; });
    const p0 = await page.evaluate(() => JSON.stringify(curComp().rot.printed));
    // totes NP
    await page.evaluate(() => { for (const e of curComp().entries) e.status = 'np'; commit(); render(); });
    await clearToasts();
    await page.click('main .toolbar button[data-act=rotPrintDlg]');
    await toastHas('Totes les gimnastes són NP');
    assert.equal(await page.evaluate(() => $('#dlg').open), false);
    // el botó de dalt i Ctrl+P: el diàleg de sempre, sense les rotacions ni l'horari
    assert.equal(await page.locator('button[data-types="general,teams"]').first().getAttribute('data-act'), 'printDlg');
    await page.keyboard.press('Control+p');
    await page.waitForSelector('#dlg[open] form[data-form=print]');
    assert.ok(!(await page.locator('#dlg').textContent()).includes('Horari general'));
    await page.click('#dlg button[data-act=closeDlg]');
    // ningú inscrit
    await page.evaluate(() => { curComp().entries = []; commit(); render(); });
    await clearToasts();
    await page.evaluate(() => actions.rotPrintDlg({ dataset: {} }));
    await toastHas('Primer cal inscriure les gimnastes');
    assert.equal(await page.evaluate(() => window.__printed), 0);
    assert.equal(await page.evaluate(() => JSON.stringify(curComp().rot.printed)), p0, 'no es marca com a imprès');
  });

  await step('«Quines categories van juntes»: desar un dia que una regla no hi fa res (un sol nivell) no l’oblida per a les properes', async () => {
    const comp = (date, id, keep) => { const c = fixture(date).competitions[0]; c.id = id; c.name = 'Jornada ' + date;
      for (const t of c.teams) t.id = id + t.id; for (const e of c.entries) { e.id = id + e.id; if (e.teamId) e.teamId = id + e.teamId; }
      if (keep) c.entries = c.entries.filter(keep); return c; };
    const d = fixture();
    // dia Y: només Benjamí A i Prebenjamí B (noies); dia Z: totes
    d.competitions.push(comp('2026-05-09', 'cY', e => !(e.gender === 'F' && ((e.category === 'Prebenjamí' && e.level === 'A') || (e.category === 'Benjamí' && e.level === 'B')))), comp('2026-05-30', 'cZ'));
    await fresh(d); await make();
    const openDlg = async () => { await page.click('button[data-act=rotSubsDlg] >> visible=true'); await page.waitForSelector('#dlg[open] form[data-form=rotSubs]'); };
    const save = async () => { await clearToasts(); await page.click('#dlg button.primary'); await toastHas('Desat'); };
    const row = re => page.locator('#dlg .rot-dlist li').filter({ hasText: re });
    const rules = () => page.evaluate(() => ({ benj: S().rot.joins.some(j => j.g === 'F' && j.cats.length === 1 && j.cats[0] === 'Benjamí'), preb: S().rot.apart.some(a => a.g === 'F' && a.cat === 'Prebenjamí') }));
    // dia X: Benjamí A i B junts (55) i Prebenjamí A i B separats
    await openDlg();
    await page.check('#dlg input[name=jc][data-g=F][value="Benjamí"]');
    await page.click('#dlg button[data-act=rotDraftJoin][data-g=F]');
    await row(/· PREBENJAMÍ A i B ·/).locator('button[data-act=rotDraftSplit]').click();
    await save();
    assert.deepEqual(await rules(), { benj: true, preb: true });
    // dia Y: es desa sense canviar res
    await clearToasts(); await page.evaluate(() => go('#/competicio/cY/rotacions')); await make();
    await openDlg(); await save();
    assert.deepEqual(await rules(), { benj: true, preb: true }, 'el dia Y no les oblida');
    // dia Z: les del dia X
    await clearToasts(); await page.evaluate(() => go('#/competicio/cZ/rotacions')); await make();
    const labels = (await view()).map(s => s.label);
    assert.ok(labels.includes('BENJAMÍ A i B') && labels.includes('PREBENJAMÍ A') && labels.includes('PREBENJAMÍ B'), labels.join(' | '));
    // si ella ho canvia (Benjamí separat), sí que es canvia
    await openDlg();
    await row(/· BENJAMÍ A i B ·/).locator('button[data-act=rotDraftSplit]').click();
    await save();
    assert.deepEqual(await rules(), { benj: false, preb: true });
  });

  await step('a una tauleta (768 i 820 px) amb 5 o 6 grups, el grup de cada equip es llegeix sencer', async () => {
    await fresh(); await make();
    const al = (await view()).find(s => s.label === 'ALEVÍ A i B').id;
    for (const w of [768, 820]) {
      await page.setViewportSize({ width: w, height: 1024 }); await page.evaluate(() => render());
      for (const k of ['5', '6']) {
        await clearToasts();
        await page.evaluate(([id, k]) => actions.rotSetK({ dataset: { s: id, k } }), [al, k]); await toastHas(`Ara hi ha ${k} grups`);
        const cut = await card('ALEVÍ A i B').locator('select[data-chg=rotMove], select[data-chg=rotStart]').evaluateAll(ss => ss.map(s => {
          const c = document.createElement('canvas').getContext('2d'); c.font = getComputedStyle(s).font;
          const t = s.options[s.selectedIndex].text; return { t, sw: Math.round(s.getBoundingClientRect().width), tw: Math.round(c.measureText(t).width) }; }).filter(x => x.tw + 24 > x.sw));
        assert.deepEqual(cut, [], `${w} px, ${k} grups`);
        const [sw, iw] = await page.evaluate(() => [document.scrollingElement.scrollWidth, innerWidth]);
        assert.ok(sw <= iw, `${sw} > ${iw}`);
      }
    }
    await page.setViewportSize({ width: 1366, height: 900 });
  });

  await step('canviar l’equip a la fitxa (Gimnastes), a la llista d’equips, d’entitat o important un full: també diu on és a les rotacions', async () => {
    await fresh(fixtureJ(new Date(Date.now() + 8 * 864e5).toISOString().slice(0, 10))); await make();
    await card('BENJAMÍ B').locator('.rot-u', { hasText: 'C.G. Lleida 2' }).locator('select[data-chg=rotMove]').selectOption('2');
    await toastHas('Ara:'); await clearToasts();
    const info = await page.evaluate(() => { const c = curComp(), t = n => c.teams.find(x => x.name === n && x.category === 'Benjamí' && x.level === 'B');
      const e = c.entries.find(x => x.teamId === t('C.G. Lleida').id); return { e: e.id, gym: e.gymnastId, master2: t('C.G. Lleida 2').sourceTeamId, at: JSON.stringify(c.rot.at) }; });
    await page.evaluate(() => go('#/gimnastes'));
    await page.locator(`select[data-chg=gymTeamInline][data-id="${info.gym}"]`).first().selectOption(info.master2);
    const t = await (await toastHas('A les rotacions de')).textContent();
    assert.ok(t.includes('A les rotacions de 3a FASE COMARCAL GIMNÀSTICA ARTÍSTICA continua al Grup 2; el seu equip nou és al Grup 3.'), t);
    assert.equal(await page.evaluate(() => JSON.stringify(compById('c418').rot.at)), info.at, 'ningú es mou sol');
    await page.click('.toast button:has-text("Mou-la amb l’equip")');
    await toastHas('Grup 3, amb el seu equip');
    assert.equal(await page.evaluate(id => { const c = compById('c418'); return rotViewOf(c).place.get(c.entries.find(e => e.id === id)).g; }, info.e), 2);
    // a la llista d'equips: una de «C.G. Lleida 2» (Grup 3) passa a «C.G. Lleida» (Grup 2)
    await clearToasts();
    const g2 = await page.evaluate(() => db.teams.find(t => t.id === 'TCGLBenjamiFB2').memberIds.find(id => compById('c418').entries.some(e => e.gymnastId === id)));
    await page.evaluate(() => go('#/equips'));
    await page.click('a[data-act=editTeam][data-id=TCGLBenjamiFB1]');
    await page.check(`#teampick input[name=m][value="${g2}"]`);
    await page.click('#dlg button.primary');
    const t3 = await (await toastHas('Equip desat')).textContent();
    assert.ok(t3.includes('A les rotacions de 3a FASE COMARCAL GIMNÀSTICA ARTÍSTICA, C.G. Lleida té gimnastes en més d’un grup'), t3);
    // a la fitxa, una altra entitat: diu on és el seu equip nou
    await clearToasts();
    const g1 = await page.evaluate(g2 => db.teams.find(t => t.id === 'TCGLBenjamiFB1').memberIds.find(id => id !== g2), g2);
    await page.evaluate(() => go('#/gimnastes'));
    await page.evaluate(id => actions.editGym({ dataset: { id } }), g1);
    await page.waitForSelector('#dlg[open] form[data-form=gym]');
    await page.fill('#dlg input[name=club]', 'INEF Lleida');
    await page.click('#dlg button.primary');
    const t4 = await (await toastHas('A les rotacions de')).textContent();
    assert.ok(/continua al Grup \d; el seu equip nou és al Grup \d\./.test(t4) && t4.includes('Mou-la amb l’equip'), t4);
    // un full d'inscripció importat a la competició que deixa un equip en dos grups: el missatge ho diu
    await fresh(); await make();
    const sel = card('ALEVÍ A i B').locator('.rot-u', { hasText: 'C.G. Lleida 2' }).first().locator('select[data-chg=rotMove]');
    await sel.selectOption(await sel.inputValue() === '1' ? '2' : '1'); await toastHas('Ara:'); await clearToasts();
    await page.click('nav.tabs a:has-text("Inscripcions")');
    await page.click('button[data-act=inscOpen] >> visible=true');
    await page.setInputFiles('#inscfile', [path.join(here, 'fixtures', 'inscripcio-nivell-A.xlsx')]);
    await page.waitForSelector('#dlg >> text=inscripcio-nivell-A.xlsx');
    await page.click('#dlg button[data-act=inscDo]');
    const t2 = await (await toastHas('Fulls d’inscripció importats')).textContent();
    assert.ok(t2.includes('A les rotacions, C.G. Lleida · ') && t2.includes('té gimnastes en més d’un grup (cadascuna s’ha quedat on era)'), t2);
  });

  await step('rètols de «Fes les rotacions»: una categoria petita al costat d’una partida per nivells, i les parts d’un bloc partit entre «»', async () => {
    const d = fixtureJ(); let keep = 5; d.competitions[0].entries = d.competitions[0].entries.filter(e => !(e.gender === 'F' && e.category === 'Prebenjamí') || keep-- > 0);
    await fresh(d); await make();
    const note = await page.locator('.note:has-text("He fet")').innerText();
    assert.ok(note.includes('Prebenjamí només té 5 gimnastes: si vols, ajunta-la amb una altra a «Quines categories van juntes…».'), note);
    // Infantil, Cadet i Juvenil van juntes (recordat): Infantil A 2, Cadet A 46, Juvenil A 46
    const d2 = fixture(), c2 = d2.competitions[0];
    d2.settings.rot = { joins: [{ g: 'F', cats: ['Infantil', 'Cadet', 'Juvenil'] }], apart: [], seen: [], allM: true, maxGroup: 15 };
    c2.entries = c2.entries.filter(e => !['Infantil', 'Cadet', 'Juvenil'].includes(e.category));
    let n = 0;
    for (const [cat, club, q] of [['Infantil', 'CGL', 2], ['Cadet', 'LSR', 46], ['Juvenil', 'INEF', 46]]) for (let i = 0; i < q; i++) {
      n++; d2.gymnasts.push({ id: 'gx' + n, name: 'N' + n, surname: 'Extra', clubId: club, gender: 'F', category: cat, level: 'A', birthYear: '', notes: '', archived: false });
      c2.entries.push({ id: 'ex' + n, gymnastId: 'gx' + n, clubId: club, gender: 'F', category: cat, level: 'A', teamId: null, bib: 900 + n, status: '', scores: {} }); }
    await fresh(d2); await make();
    const li = await page.locator('.note:has-text("He fet") li').allInnerTexts();
    const sp = li.findIndex(x => x.startsWith('Infantil, Cadet i Juvenil tenen 94 gimnastes'));
    assert.ok(sp >= 0 && li[sp].endsWith('les he partides en «Infantil A i Cadet A» i «Juvenil A».'), li.join(' / '));
    assert.ok(sp < li.findIndex(x => x.startsWith('Juvenil A té 46 gimnastes')), 'primer es diu que s’ha partit');
  });

  await step('«Has canviat les rotacions després d’imprimir-les»: el dia i l’hora d’aquí (imprès a les 0:30 és d’aquell dia)', async () => {
    const ctx2 = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ca-ES', timezoneId: 'Europe/Madrid' });
    try {
      const p2 = await ctx2.newPage();
      p2.on('pageerror', e => errors.push('pageerror: ' + e.message));
      await p2.goto(url);
      await p2.evaluate(r => { db = migrate(JSON.parse(r)); commit(); go('#/competicio/c418/rotacions'); }, JSON.stringify(fixture()));
      await p2.click('button[data-act=rotMake]'); await p2.waitForSelector('.card.rot-sub');
      await p2.evaluate(() => { curComp().rot.printed = { sig: 'zzz', at: '2026-10-09T22:30:00.000Z' }; commit(); render(); });
      const t = await p2.locator('.note.warn', { hasText: 'després d’imprimir-les' }).innerText();
      assert.ok(t.includes('(10/10/2026 a les 0:30)'), t);
    } finally { await ctx2.close(); }
  });

  await step('horari amb el teclat: una hora escrita (0945) es desa 9:45, també a «Comença a» d’una subdivisió «nova»', async () => {
    // (un ordinador en català té el camp d'hora de 24 hores)
    const b24 = await playwright.chromium.launch({ env: { ...process.env, LANG: 'ca_ES.UTF-8', LC_ALL: 'ca_ES.UTF-8' } });
    try {
      const p2 = await (await b24.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ca-ES' })).newPage();
      p2.on('pageerror', e => errors.push('pageerror (24 h): ' + e.message));
      await p2.goto(url);
      await p2.evaluate(r => { db = migrate(JSON.parse(r)); commit(); go('#/competicio/c418/rotacions'); }, JSON.stringify(fixture()));
      await p2.click('button[data-act=rotMake]'); await p2.waitForSelector('.card.rot-sub');
      await p2.evaluate(() => { const c = curComp(); for (let i = 0; i < 4; i++) { const g = { id: 'gh' + i, name: 'N' + i, surname: 'Nova', clubId: i % 2 ? 'CGL' : 'INEF', gender: 'F', category: 'Sènior', level: 'A', birthYear: '', notes: '', archived: false }; db.gymnasts.push(g); c.entries.push(newEntry(c, g)); } ui.rotSeg = 'horari'; commit(); render(); });
      const type = async loc => { await loc.scrollIntoViewIfNeeded(); await loc.click({ position: { x: 12, y: 10 } }); for (const d of '0945') { await p2.keyboard.press(d); await p2.waitForTimeout(120); } };
      const gen = p2.locator('input[data-chg=rotTime][data-k=start]');
      await type(gen);
      assert.equal(await gen.inputValue(), '09:45');
      await p2.keyboard.press('Tab'); await p2.waitForTimeout(150);
      assert.equal(await p2.evaluate(() => curComp().rot.time.start), '9:45');
      const auto = await p2.evaluate(() => rotViewOf(curComp()).subs.find(s => !s.real).id);
      await type(p2.locator(`input[data-chg=rotSubField][data-s="${auto}"][data-k=start]`));
      await p2.keyboard.press('Tab'); await p2.waitForTimeout(150);
      const s = await p2.evaluate(() => { const sv = rotViewOf(curComp()).subs.find(x => x.label === 'SÈNIOR'); return { real: sv.real, start: sv.sub.start, shown: $(`input[data-chg=rotSubField][data-s="${sv.id}"][data-k=start]`).value }; });
      assert.deepEqual(s, { real: true, start: '9:45', shown: '09:45' });
      // una hora escrita sencera que té la mateixa hora que la que hi havia (08:30 → «0845»): després del «08» el camp torna
      // a dir 08:30, però encara falten els minuts (no s'ha de tornar a pintar fins que se'n surt). I la mateixa hora
      // escrita una altra vegada, i amb el teclat (Tab), i a «Comença a» d'una subdivisió
      const typeIn = async (loc, digits, leave) => {
        await loc.scrollIntoViewIfNeeded(); await loc.click({ position: { x: 12, y: 10 } });
        for (const d of digits) { await p2.keyboard.press(d); await p2.waitForTimeout(120); }
        if (leave === 'tab') await p2.keyboard.press('Tab'); else await p2.mouse.click(5, 300);
        await p2.waitForTimeout(250);
      };
      const got = [];
      for (const [from, digits, leave] of [['8:30', '0845', 'clic'], ['9:00', '0915', 'clic'], ['9:15', '0915', 'tab'], ['9:30', '0930', 'clic'], ['8:30', '0930', 'tab'], ['12:00', '0800', 'clic']]) {
        await p2.evaluate(v => { curComp().rot.time.start = v; commit(); render(); }, from);
        await typeIn(gen, digits, leave);
        got.push(await p2.evaluate(() => curComp().rot.time.start) + ' ' + await gen.inputValue());
      }
      assert.deepEqual(got, ['8:45 08:45', '9:15 09:15', '9:15 09:15', '9:30 09:30', '9:30 09:30', '8:00 08:00']);
      const sub = await p2.evaluate(() => rotViewOf(curComp()).subs.find(x => x.label === 'SÈNIOR').id);
      const subIn = () => p2.locator(`input[data-chg=rotSubField][data-s="${sub}"][data-k=start]`);
      await typeIn(subIn(), '1000', 'tab'); await typeIn(subIn(), '1015', 'clic'); await typeIn(subIn(), '1015', 'tab');
      assert.deepEqual(await p2.evaluate(id => [rotViewOf(curComp()).subs.find(x => x.id === id).sub.start, $(`input[data-chg=rotSubField][data-s="${id}"][data-k=start]`).value], sub), ['10:15', '10:15']);
      // esborrar l'hora per tornar-la a escriure no és cap error (no surt «Escriu l’hora com 8:30»)
      await p2.evaluate(() => { $$('.toast').forEach(t => t.remove()); curComp().rot.time.start = '8:30'; commit(); render(); });
      await gen.click({ position: { x: 12, y: 10 } }); await p2.keyboard.press('Backspace'); await p2.waitForTimeout(100);
      for (const d of '09') { await p2.keyboard.press(d); await p2.waitForTimeout(120); }
      await p2.mouse.click(5, 300); await p2.waitForTimeout(250);
      assert.equal(await p2.evaluate(() => curComp().rot.time.start), '9:30');
      assert.equal(await p2.locator('.toast', { hasText: 'Escriu l’hora' }).count(), 0);
    } finally { await b24.close(); }
  });

  await step('diàlegs de les rotacions: «Tots junts al final» i les categories marcades per ajuntar no es desmarquen amb ↑ ↓', async () => {
    await fresh(); await make();
    await page.click('.toolbar > .menu button[data-act=menuToggle]'); await page.click('.menu.open button[data-act=rotAppsDlg]');
    await page.waitForSelector('#dlg[open] form[data-form=rotApps]');
    await page.check('#dlg input[name=fin_F][value=terra]');
    await page.click('#dlg button[data-act=rotAppsMove][data-g=F][data-i="0"][data-d="1"]'); await page.waitForTimeout(100);
    assert.ok(await page.isChecked('#dlg input[name=fin_F][value=terra]'), 'continua marcat després de ↓');
    await page.click('#dlg form[data-form=rotApps] button.primary'); await toastHas('Ordre desat');
    assert.deepEqual(await page.evaluate(() => ({ order: curComp().rot.order.F, final: curComp().rot.final.F })), { order: ['barra', 'salt'], final: ['terra'] });
    await page.click('button[data-act=rotSubsDlg] >> visible=true'); await page.waitForSelector('#dlg[open] form[data-form=rotSubs]');
    const boxes = page.locator('#dlg input[name=jc][data-g=F]');
    const picked = [await boxes.nth(0).getAttribute('value'), await boxes.nth(1).getAttribute('value')];
    await boxes.nth(0).check(); await boxes.nth(1).check();
    await page.click('#dlg button[data-act=rotDraftMove][data-i="2"][data-d="1"]'); await page.waitForTimeout(100);
    assert.deepEqual(await page.evaluate(() => $$('#dlg input[name=jc]:checked').map(i => i.value)), picked);
    await clearToasts();
    await page.click('#dlg button[data-act=rotDraftJoin][data-g=F]'); await page.waitForTimeout(150);
    assert.equal(await page.locator('.toast:has-text("Marca les categories")').count(), 0);
    assert.ok(await page.evaluate(p => ui.rotDraft.subs.some(s => p.every(cat => s.keys.some(k => rotCatOf(k) === cat))), picked), 'ajuntades');
    assert.deepEqual(await page.evaluate(() => $$('#dlg input[name=jc]:checked').map(i => i.value)), [], 'ja ajuntades, es desmarquen');
    await page.click('#dlg button[data-act=closeDlg]');
  });

  await step('«→ Grup N» amb el teclat: el focus es queda al desplegable (la fletxa següent no mou la pàgina)', async () => {
    await fresh(); await make();
    const sel = page.locator('select[data-chg=rotMove]').nth(10);
    await sel.scrollIntoViewIfNeeded(); await sel.focus();
    const e = await sel.getAttribute('data-e'), y0 = await page.evaluate(() => scrollY);
    await page.keyboard.press('ArrowUp'); await page.waitForTimeout(150);
    assert.deepEqual(await page.evaluate(() => [document.activeElement.dataset.chg, document.activeElement.dataset.e]), ['rotMove', e]);
    await page.keyboard.press('ArrowUp'); await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => scrollY), y0);
    // un desplegable d'una subdivisió que ja no hi és (les rotacions han canviat): es diu, no es fa veure que s'ha mogut
    await clearToasts();
    await page.evaluate(() => { const s = $('select[data-chg=rotMove]'); s.dataset.s = 'auto-F-9'; s.value = '1'; s.dispatchEvent(new Event('change', { bubbles: true })); });
    await toastHas('Les rotacions han canviat: torna-ho a provar.');
  });

  await step('després d’imprimir, la pantalla es torna a pintar: fora l’avís i les NOU, i una subdivisió «nova» es pot canviar (també amb Ctrl+P a mig escriure)', async () => {
    const okConfirms = async () => { for (let i = 0; i < 3; i++) { await page.waitForTimeout(150); if (await page.evaluate(() => $('#confirm').open)) await page.click('#confirm button[value=ok]'); } };
    const shown = () => page.evaluate(() => ({ banner: [...document.querySelectorAll('.note.warn')].some(n => n.textContent.includes('després d’imprimir-les')), nou: document.querySelectorAll('.rot-u.fresh').length }));
    await fresh(); await make();
    await page.evaluate(() => { window.print = () => { window.__p = $('#print').innerHTML; }; });
    await page.keyboard.press('Control+p'); await page.waitForSelector('#dlg[open] form[data-form=rotPrint]');
    await page.click('#dlg button.primary'); await okConfirms();
    await page.evaluate(() => { const c = curComp(); const g = { id: 'glate', name: 'Laia', surname: 'Tard', clubId: 'CGL', gender: 'F', category: 'Aleví', level: 'B', birthYear: '', notes: '', archived: false }; db.gymnasts.push(g); c.entries.push(newEntry(c, g)); commit(); render(); });
    assert.deepEqual(await shown(), { banner: true, nou: 1 });
    await page.click('.note.warn button[data-act=rotPrintDlg]'); await page.waitForSelector('#dlg[open] form[data-form=rotPrint]');
    await page.click('#dlg button.primary'); await okConfirms();
    await page.waitForFunction(() => !document.querySelector('.rot-u.fresh'));
    assert.deepEqual(await shown(), { banner: false, nou: 0 });
    // 6 sèniors (subdivisió «nova») i Ctrl+P a mig escriure la seva durada: s'imprimeixen les 7 i la durada es desa
    await addGirls('Sènior', 6, 'gp');
    await page.click('button[data-act=rotSeg][data-v=horari]');
    const dur = page.locator('input[data-chg=rotSubField][data-k=dur][data-s^="auto-"]');
    await dur.fill('40');
    await page.keyboard.press('Control+p'); await page.waitForSelector('#dlg[open] form[data-form=rotPrint]');
    await page.click('#dlg button.primary'); await okConfirms(); await page.waitForTimeout(200);
    const p = await page.evaluate(() => window.__p || '');
    assert.equal([...p.matchAll(/class="rs-title">([^<]*)</g)].length, 7, 'els 7 fulls');
    assert.ok(p.includes('SÈNIOR'));
    // després d'imprimir: la durada d'una altra subdivisió i el grup d'un equip de la SÈNIOR es desen
    const sen = await page.evaluate(() => rotViewOf(curComp()).subs.find(s => s.label === 'SÈNIOR'));
    assert.ok(sen.real && sen.sub.dur === 40, 'la durada escrita abans de Ctrl+P');
    const aw = page.locator(`input[data-chg=rotSubField][data-s="${sen.id}"][data-k=awards]`);
    await aw.fill('12'); await aw.press('Tab'); await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => rotViewOf(curComp()).subs.find(s => s.label === 'SÈNIOR').sub.awards), 12);
    await page.click('button[data-act=rotSeg][data-v=grups]');
    await clearToasts();
    const at0 = await page.evaluate(() => JSON.stringify(curComp().rot.at));
    const mv = card('SÈNIOR').locator('select[data-chg=rotMove]').first();
    await mv.selectOption((await mv.inputValue()) === '0' ? '1' : '0');
    await toastHas('Ara:');
    assert.ok(!(await page.locator('.toast').last().textContent()).includes('Ara: .'));
    assert.notEqual(await page.evaluate(() => JSON.stringify(curComp().rot.at)), at0);
  });

  await step('«Quines categories van juntes»: desar el que ha fet l’app (partit per mida) no les separa per a una altra jornada, ni els nois després de «Torna a la proposta»', async () => {
    const girls = (d, compId, spec) => { const c = d.competitions.find(x => x.id === compId); let n = 0;
      for (const [cat, lvl, q] of spec) for (let i = 0; i < q; i++) { n++; const id = compId + cat + lvl + i; d.gymnasts.push({ id: 'g' + id, name: 'N' + i, surname: 'Extra', clubId: ['CGL', 'LSR', 'INEF', 'FEDAC'][i % 4], gender: 'F', category: cat, level: lvl, birthYear: '', notes: '', archived: false });
        c.entries.push({ id: 'e' + id, gymnastId: 'g' + id, clubId: ['CGL', 'LSR', 'INEF', 'FEDAC'][i % 4], gender: 'F', category: cat, level: lvl, teamId: null, bib: 800 + n, status: '', scores: {} }); } };
    const boys = (d, compId, spec) => { const c = d.competitions.find(x => x.id === compId); let n = 0;
      for (const [cat, q] of spec) for (let i = 0; i < q; i++) { n++; const id = compId + 'b' + cat + i; d.gymnasts.push({ id: 'g' + id, name: 'Nen' + i, surname: 'Extra', clubId: ['CGL', 'LSR', 'INEF', 'FEDAC'][i % 4], gender: 'M', category: cat, level: 'A', birthYear: '', notes: '', archived: false });
        c.entries.push({ id: 'e' + id, gymnastId: 'g' + id, clubId: ['CGL', 'LSR', 'INEF', 'FEDAC'][i % 4], gender: 'M', category: cat, level: 'A', teamId: null, bib: 900 + n, status: '', scores: {} }); } };
    // (una altra jornada, més endavant, amb les mateixes gimnastes menys les que no passen keep)
    const second = (d, id, keep) => { const y = JSON.parse(JSON.stringify(d.competitions[0])); y.id = id; y.name = 'Jornada 2'; y.date = '2026-05-09';
      y.entries = y.entries.filter(keep).map(e => Object.assign(e, { id: id + e.id, teamId: e.teamId ? id + e.teamId : null })); y.teams.forEach(t => { t.id = id + t.id; });
      d.competitions.push(y); };
    const labels = () => page.evaluate(() => rotViewOf(curComp()).subs.map(s => s.label));
    const desa = async (reset = false) => {
      await page.click('button[data-act=rotSubsDlg] >> visible=true'); await page.waitForSelector('#dlg[open] form[data-form=rotSubs]');
      if (reset) { await page.click('#dlg button[data-act=rotDraftReset]'); await page.waitForTimeout(100); }
      await clearToasts(); await page.click('#dlg button.primary'); await toastHas('Desat');
    };
    // dia X: Infantil, Cadet i Juvenil van juntes però en són 71 (> 45): l'app les parteix per nivells. Desa sense canviar res
    const d = fixture(), c = d.competitions[0], ICJ = ['Infantil', 'Cadet', 'Juvenil'];
    c.entries = c.entries.filter(e => !ICJ.includes(e.category));
    girls(d, 'c418', [['Infantil', 'A', 12], ['Infantil', 'B', 14], ['Cadet', 'A', 10], ['Cadet', 'B', 30], ['Juvenil', 'A', 5]]);
    second(d, 'cY', e => !ICJ.includes(e.category)); girls(d, 'cY', [['Infantil', 'A', 12], ['Infantil', 'B', 14]]);
    d.settings.rot = { joins: [{ g: 'F', cats: ICJ }], apart: [], seen: [], allM: true, maxGroup: 15 };
    await fresh(d); await make();
    assert.ok((await labels()).includes('INFANTIL B i CADET B'), (await labels()).join(' | '));
    await desa();
    assert.deepEqual(await page.evaluate(() => S().rot.apart), [], 'cap categoria «separada»');
    // dia Y: només Infantil (26): una sola subdivisió
    await page.evaluate(() => go('#/competicio/cY/rotacions')); await page.waitForSelector('button[data-act=rotMake]'); await make();
    assert.ok((await labels()).includes('INFANTIL A i B'), (await labels()).join(' | '));
    // 60 nois (més de 45): l'app els parteix per mida. «Torna a la proposta de l'app» + Desa: continuen «tots junts»
    const d2 = fixture();
    d2.competitions[0].entries = d2.competitions[0].entries.filter(e => e.gender !== 'M');
    boys(d2, 'c418', [['Prebenjamí', 20], ['Benjamí', 20], ['Aleví', 20]]);
    second(d2, 'c2', e => e.gender !== 'M'); boys(d2, 'c2', [['Prebenjamí', 8], ['Benjamí', 8], ['Aleví', 8]]);
    await fresh(d2); await make();
    assert.equal((await labels()).filter(l => l.startsWith('MASCULINA')).length, 2);
    await desa(true);
    assert.equal(await page.evaluate(() => S().rot.allM), true);
    await page.evaluate(() => go('#/competicio/c2/rotacions')); await page.waitForSelector('button[data-act=rotMake]'); await make();
    assert.deepEqual((await labels()).filter(l => l.startsWith('MASCULINA')), ['MASCULINA'], 'amb 24 nois, una sola');
  });

  await step('canviar un equip a la mateixa competició (Inscripcions → l’equip) o treure’l: diu si queda en més d’un grup a les rotacions', async () => {
    await fresh(); await make();
    const v = await page.evaluate(() => { const sv = rotViewOf(curComp()).subs.find(s => s.label === 'BENJAMÍ B'); const g = n => sv.units.find(u => u.team && u.team.name === n).g; return [g('C.G. Lleida'), g('C.G. Lleida 2')]; });
    if (v[0] === v[1]) { await card('BENJAMÍ B').locator('.rot-u', { hasText: 'C.G. Lleida 2' }).locator('select[data-chg=rotMove]').selectOption(String((v[0] + 1) % 3)); await toastHas('Ara:'); }
    await page.click('nav.tabs a:has-text("Inscripcions")'); await page.waitForTimeout(150);
    await clearToasts();
    await page.evaluate(() => actions.editCompTeam({ dataset: { id: 'cTCGLBenjamiFB2' } })); await page.waitForSelector('#dlg[open] form[data-form=compTeam]');
    const e1 = await page.evaluate(() => curComp().entries.find(e => e.teamId === 'cTCGLBenjamiFB1').id);
    await page.check(`#dlg input[name=m][value="${e1}"]`);
    await page.click('#dlg button.primary');
    assert.ok((await (await toastHas('desat en aquesta competició')).textContent()).includes('A les rotacions, C.G. Lleida 2 té gimnastes en més d’un grup'));
    await clearToasts();
    await page.evaluate(() => actions.editCompTeam({ dataset: { id: 'cTCGLBenjamiFB2' } })); await page.waitForSelector('#dlg[open] form[data-form=compTeam]');
    await page.click('#dlg button[data-act=delCompTeam]'); await page.waitForSelector('#confirm[open]'); await page.click('#confirm button[value=ok]');
    assert.ok((await (await toastHas('Equip tret de la competició')).textContent()).includes('té gimnastes en més d’un grup'));
  });

  await step('«A les rotacions d’Interclubs…»: «de» davant d’un nom que comença per vocal', async () => {
    assert.deepEqual(await page.evaluate(() => ['Interclubs de Primavera', 'Hostalric', 'Iolanda', 'Huelva', 'Lleida', 'Òdena', 'Unió'].map(deN)),
      ['d’Interclubs de Primavera', 'd’Hostalric', 'de Iolanda', 'de Huelva', 'de Lleida', 'd’Òdena', 'd’Unió']);
    const d = fixtureJ(new Date(Date.now() + 8 * 864e5).toISOString().slice(0, 10));
    d.competitions[0].name = 'Interclubs de Primavera';
    await fresh(d); await make();
    await card('BENJAMÍ B').locator('.rot-u', { hasText: 'C.G. Lleida 2' }).locator('select[data-chg=rotMove]').selectOption('2');
    await toastHas('Ara:'); await clearToasts();
    const info = await page.evaluate(() => { const c = curComp(), t = n => c.teams.find(x => x.name === n && x.category === 'Benjamí' && x.level === 'B');
      return { gym: c.entries.find(x => x.teamId === t('C.G. Lleida').id).gymnastId, master2: t('C.G. Lleida 2').sourceTeamId }; });
    await page.evaluate(() => go('#/gimnastes')); await page.waitForTimeout(200);
    await page.locator(`select[data-chg=gymTeamInline][data-id="${info.gym}"]`).first().selectOption(info.master2);
    const t = await (await toastHas('A les rotacions')).textContent();
    assert.ok(t.includes('A les rotacions d’Interclubs de Primavera continua al Grup'), t);
    await page.evaluate(() => go('#/competicio/c418/rotacions'));
  });

  // ─── setena revisió
  const okConfirms7 = async () => { for (let i = 0; i < 3; i++) { await page.waitForTimeout(150); if (await page.evaluate(() => $('#confirm').open)) await page.click('#confirm button[value=ok]'); } };
  const printRot = async (what = null) => {
    await page.evaluate(() => { window.print = () => { window.__p = $('#print').innerHTML; }; window.__p = null; });
    await page.evaluate(w => actions.rotPrintDlg({ dataset: w ? { what: w } : {} }), what); await page.waitForSelector('#dlg[open] form[data-form=rotPrint]');
    await page.click('#dlg button.primary'); await okConfirms7();
    await page.waitForFunction(() => window.__p !== null);
    await page.evaluate(() => { document.body.classList.remove('printing'); $('#print').innerHTML = ''; });
  };
  const notes7 = () => page.$$eval('#main .note', ns => ns.map(n => n.textContent.replace(/\s+/g, ' ').trim()));

  await step('setena revisió: «Fes les rotacions» només deixa l’avís del resultat (no el «Fent les rotacions…»), i el resum diu «154 gimnastes (+2 NP)»', async () => {
    const d = fixture(); d.competitions[0].entries.push({ ...d.competitions[0].entries[0], id: 'np1', status: 'np', bib: 201 }, { ...d.competitions[0].entries[40], id: 'np2', status: 'np', bib: 202 });
    await fresh(d);
    await page.evaluate(() => { window.__t7 = []; new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.classList && n.classList.contains('toast')) window.__t7.push(n); }).observe($('#toasts'), { childList: true }); });
    await make(); await page.waitForTimeout(200);
    const shown = await page.$$eval('#toasts .toast span', l => l.map(x => x.textContent));
    assert.equal(shown.filter(x => x.startsWith('Fent')).length, 0, JSON.stringify(shown));
    assert.ok(await page.evaluate(() => window.__t7.some(n => n.textContent.includes('Fent les rotacions'))), 'mentre es calcula, sí que surt');
    assert.ok((await page.locator('#main p.small.muted', { hasText: 'subdivisions ·' }).textContent()).includes('154 gimnastes (+2 NP)'));
    // «Torna-les a fer de zero»: tampoc es queda el «Fent els grups…»
    await clearToasts();
    await page.evaluate(() => { actions.rotRedoAll(); }); await page.click('#confirm button[value=ok]');
    await toastHas('Grups refets'); await page.waitForTimeout(100);
    assert.equal((await page.$$eval('#toasts .toast span', l => l.map(x => x.textContent))).filter(x => x.startsWith('Fent')).length, 0);
  });

  await step('setena revisió: després d’imprimir l’horari, dues NP que l’escurcen ho diuen (hores d’abans → d’ara) a les dues pestanyes; tornar-lo a imprimir ho treu', async () => {
    await fresh(); await make();
    await printRot();
    const longest = await page.evaluate(() => { const v = rotViewOf(curComp()), sv = v.subs.find(s => s.label === 'ALEVÍ A i B'), G = sv.groups.reduce((a, x) => (x.n > a.n ? x : a));
      const sch = Engine.rotSchedule(v, curComp().rot), row = sch.blocks.flatMap(b => b.rows).find(r => r.kind === 'comp' && r.subId === sv.id);
      return { ids: G.entries.slice(0, 2).map(e => e.id), idx: sv.idx, from: Engine.rotHM(row.from), to: Engine.rotHM(row.to) }; });
    await page.evaluate(ids => { for (const e of curComp().entries) if (ids.includes(e.id)) e.status = 'np'; commit(); render(); }, longest.ids);
    let n = (await notes7()).find(x => x.includes('L’horari ha canviat des que el vas imprimir'));
    assert.ok(n, (await notes7()).join(' || '));
    assert.ok(n.includes(`${longest.idx}a subdivisió ${longest.from} – ${longest.to} → ${longest.from} – `) && n.includes('Torna’l a imprimir'), n);
    assert.ok(!n.includes('després d’imprimir-les'), 'les rotacions no han canviat');
    assert.equal(await page.locator('.tabs a[href$="/rotacions"] .badge').count(), 1, 'la marca de la pestanya');
    await page.click('button[data-act=rotSeg][data-v=horari]');
    assert.ok((await notes7()).some(x => x.includes('L’horari ha canviat des que el vas imprimir') && x.includes(`${longest.idx}a subdivisió`)));
    await page.click('button[data-act=rotSeg][data-v=grups]');
    // el botó de l'avís: només l'horari
    await page.click('.note.warn:has-text("L’horari ha canviat") button[data-act=rotPrintDlg]'); await page.waitForSelector('#dlg[open] form[data-form=rotPrint]');
    assert.deepEqual(await page.$$eval('#dlg input[name=w]', l => l.map(x => [x.value, x.checked])), [['rot', false], ['horari', true]]);
    await page.evaluate(() => { window.print = () => { window.__p = $('#print').innerHTML; }; window.__p = null; });
    await page.click('#dlg button.primary'); await okConfirms7(); await page.waitForFunction(() => window.__p !== null);
    await page.evaluate(() => { document.body.classList.remove('printing'); $('#print').innerHTML = ''; });
    assert.equal((await notes7()).filter(x => x.includes('L’horari ha canviat')).length, 0);
    // si després es mou un equip: les rotacions han canviat (i l'horari, si en canvia les hores)
    const sel = card('BENJAMÍ B').locator('select[data-chg=rotMove]').first();
    await sel.selectOption((await sel.inputValue()) === '0' ? '1' : '0');
    await page.waitForSelector('.note:has-text("després d’imprimir-les")');
    // dades desades: el que es va imprimir, amb les hores de l'horari
    const pr = await page.evaluate(() => { const r = migrate(JSON.parse(JSON.stringify(db))).competitions[0].rot.printed; return { sig: !!r.sig, ord: !!r.ord, rows: r.hor.rows.length }; });
    assert.ok(pr.sig && pr.ord && pr.rows > 10, JSON.stringify(pr));
  });

  await step('setena revisió: «Renumera dorsals» amb rotacions: en l’ordre de pas (subdivisió, grup, l’ordre del full i cognoms); si ja s’havien imprès, avisa que el full ha canviat', async () => {
    await fresh(); await make(); await printRot();
    await page.evaluate(() => go('#/competicio/c418/inscripcions')); await page.waitForSelector('button[data-act=renumber]');
    await page.click('button[data-act=renumber]');
    assert.ok((await page.locator('#confirm').textContent()).includes('en l’ordre en què competeixen'));
    await page.click('#confirm button[value=ok]');
    const t = await (await toastHas('Dorsals renumerats')).textContent();
    assert.ok(t.includes('torna’ls a imprimir'), t);
    const r = await page.evaluate(() => { const c = curComp(), v = rotViewOf(c), out = [];
      for (const sv of v.subs) for (const G of sv.groups) for (const x of Engine.rotGroupOrder(G, S(), rotCtx())) out.push(x.entries.map(e => ({ bib: e.bib, s: (gymById(e.gymnastId) || {}).surname })));
      return out; });
    const bibs = r.flat().map(x => x.bib);
    assert.deepEqual(bibs, bibs.map((_, i) => i + 1), 'els dorsals segueixen l’ordre de pas');
    for (const u of r) assert.deepEqual(u.map(x => x.s), [...u.map(x => x.s)].sort((a, b) => a.localeCompare(b, 'ca')), 'dins de cada equip, per cognoms');
    await page.evaluate(() => go('#/competicio/c418/rotacions')); await page.waitForSelector('.card.rot-sub');
    assert.ok((await notes7()).some(x => x.includes('ha canviat l’ordre de les gimnastes d’algun grup') && x.includes('Torna-les a imprimir')), (await notes7()).join(' || '));
    // tornar-les a imprimir ho treu; tornar a renumerar ja no canvia res
    await printRot();
    await page.evaluate(() => go('#/competicio/c418/inscripcions')); await page.waitForSelector('button[data-act=renumber]');
    await clearToasts();
    await page.click('button[data-act=renumber]'); await page.click('#confirm button[value=ok]');
    assert.equal(await (await toastHas('Dorsals renumerats')).textContent().then(x => x.includes('imprimir')), false);
    await page.evaluate(() => go('#/competicio/c418/rotacions')); await page.waitForSelector('.card.rot-sub');
    assert.equal((await notes7()).filter(x => x.includes('imprimir')).length, 0);
  });

  await step('setena revisió: «Renumera dorsals» sense rotacions: per entitat, equip (les individuals al final) i cognoms, mai pel nom', async () => {
    await fresh();
    await page.evaluate(() => go('#/competicio/c418/inscripcions')); await page.waitForSelector('button[data-act=renumber]');
    await page.click('button[data-act=renumber]');
    assert.ok((await page.locator('#confirm').textContent()).includes('entitat, equip i cognoms'));
    await page.click('#confirm button[value=ok]'); await toastHas('Dorsals renumerats');
    const r = await page.evaluate(() => { const c = curComp(); return groupsOf(c).map(g => [...g.entries].sort((a, b) => a.bib - b.bib).map(e => { const t = c.teams.find(x => x.id === e.teamId);
      return { club: clubName(e.clubId), team: t ? t.name : '~', s: gymById(e.gymnastId).surname + ', ' + gymById(e.gymnastId).name }; })); });
    const key = x => [x.club, x.team === '~' ? '\uffff' : x.team];
    for (const l of r) for (let i = 1; i < l.length; i++) {
      const a = l[i - 1], b = l[i], ka = key(a), kb = key(b), c1 = ka[0].localeCompare(kb[0], 'ca', { sensitivity: 'base', numeric: true });
      assert.ok(c1 < 0 || (c1 === 0 && (ka[1] < kb[1] || (ka[1] === kb[1] && a.s.localeCompare(b.s, 'ca', { sensitivity: 'base' }) <= 0))), `${a.club} ${a.team} ${a.s} → ${b.club} ${b.team} ${b.s}`);
    }
    // Benjamí A de C.G. Lleida: primer l'equip 1 sencer i després el 2 (abans, barrejats pel nom)
    const ba = r.find(l => l.some(x => x.team === 'C.G. Lleida 2' && x.club === 'C.G. Lleida')).filter(x => x.club === 'C.G. Lleida').map(x => x.team);
    assert.deepEqual(ba, [...ba].sort());
  });

  await step('setena revisió: fulls de jutge amb rotacions: l’«Ordre» és el de pas per l’aparell, un bloc per rotació («2a subdivisió · rotació 1 · Grup 2»)', async () => {
    await fresh(); await make();
    const exp = await page.evaluate(() => { const c = curComp(), g = groupsOf(c).find(x => x.category === 'Benjamí' && x.level === 'A' && x.gender === 'F'), v = rotViewOf(c), sv = v.subs.find(s => s.label === 'BENJAMÍ A');
      return { key: g.key, heads: Engine.rotAppSeq(sv, 'barra', S(), rotCtx()).map(b => `${sv.idx}a subdivisió · rotació ${b.r + 1} · Grup ${b.G.g + 1}`),
        bibs: Engine.rotAppSeq(sv, 'barra', S(), rotCtx()).flatMap(b => b.entries.map(e => String(e.bib))) }; });
    await page.evaluate(() => { window.print = () => { window.__p = $('#print').innerHTML; }; window.__p = null; });
    await page.evaluate(k => doPrint(curComp(), ['judge'], [k]), exp.key);
    await page.waitForFunction(() => window.__p !== null);
    const sheets = await page.$$eval('#print section.sheet', l => l.map(s => ({ title: s.querySelector('tr.rep th').textContent, heads: [...s.querySelectorAll('tr.jb')].map(x => x.textContent),
      rows: [...s.querySelectorAll('tr.judge')].map(tr => [tr.cells[0].textContent, tr.cells[1].textContent]) })));
    await page.evaluate(() => { document.body.classList.remove('printing'); $('#print').innerHTML = ''; });
    const barra = sheets.find(x => x.title.includes('Barra'));
    assert.deepEqual(barra.heads, exp.heads);
    assert.deepEqual(barra.rows.map(x => x[1]), exp.bibs, 'l’ordre de pas per la barra');
    assert.deepEqual(barra.rows.map(x => x[0]), exp.bibs.map((_, i) => String(i + 1)));
    // sense rotacions, com sempre: per dorsal i sense blocs
    await page.evaluate(() => { delete curComp().rot; commit(); window.__p = null; });
    await page.evaluate(k => doPrint(curComp(), ['judge'], [k]), exp.key);
    await page.waitForFunction(() => window.__p !== null);
    const s2 = await page.$$eval('#print section.sheet', l => l.map(s => ({ heads: s.querySelectorAll('tr.jb').length, bibs: [...s.querySelectorAll('tr.judge')].map(tr => +tr.cells[1].textContent) })));
    await page.evaluate(() => { document.body.classList.remove('printing'); $('#print').innerHTML = ''; });
    assert.equal(s2[0].heads, 0);
    assert.deepEqual(s2[0].bibs, [...s2[0].bibs].sort((a, b) => a - b));
  });

  await step('setena revisió: corregir el nivell d’una gimnasta la passa a una altra subdivisió: es diu d’on a on (amb l’hora), no que és «nova»', async () => {
    await fresh(); await make(); await printRot();
    const g = await page.evaluate(() => { const c = curComp(), v = rotViewOf(c), sv = v.subs.find(s => s.label === 'BENJAMÍ A'), e = sv.groups[1].entries[0];
      const w = new Map(); for (const b of Engine.rotSchedule(v, c.rot).blocks) for (const r of b.rows) if (r.kind === 'comp') w.set(r.subId, Engine.rotHM(r.from));
      const sb = v.subs.find(s => s.label === 'BENJAMÍ B'); return { id: e.id, name: entryName(e), a: sv.idx, ha: w.get(sv.id), b: sb.idx, hb: w.get(sb.id) }; });
    await page.evaluate(() => go('#/competicio/c418/inscripcions')); await page.waitForSelector(`a[data-act=editEntry]`);
    await page.click(`a[data-act=editEntry][data-id="${g.id}"]`); await page.waitForSelector('#dlg[open] form[data-form=entry]');
    await page.selectOption('#dlg select[name=level]', 'B'); await page.click('#dlg button.primary');
    const moved = `${g.name} ha passat de la ${g.a}a subdivisió (${g.ha}) a la ${g.b}a (${g.hb})`;
    const t = await (await toastHas('ha passat de la')).textContent();
    assert.ok(t.includes(moved), t + ' / ' + moved);
    await page.evaluate(() => go('#/competicio/c418/rotacions')); await page.waitForSelector('.card.rot-sub');
    const n = await notes7();
    assert.ok(n.some(x => x.includes(moved) && x.includes('l’he posada') && x.includes('deixa-la així')), n.join(' || '));
    assert.ok(!n.some(x => x.includes('gimnasta nova')), 'no és nova');
    // en imprimir, tampoc
    await page.evaluate(() => { window.print = () => {}; actions.rotPrintDlg({ dataset: {} }); }); await page.waitForSelector('#dlg[open] form[data-form=rotPrint]');
    await page.click('#dlg button.primary'); await page.waitForSelector('#confirm[open]');
    const q = await page.locator('#confirm').textContent();
    assert.ok(q.includes('1 gimnasta que ha canviat de subdivisió, i encara no l’has revisada'), q);
    await page.click('#confirm button[value=no]');
  });

  await step('setena revisió: dues exhibicions amb el mateix text a la mateixa subdivisió: just després d’imprimir l’horari no surt cap avís (i es desa quina és cada una)', async () => {
    await fresh(); await make();
    await page.click('button[data-act=rotSeg][data-v=horari]'); await page.waitForSelector('table.rot-hor');
    for (let i = 0; i < 2; i++) { await page.locator('table.rot-hor tr.comp').nth(1).locator('button[data-act=rotExtraAdd]').click(); await page.waitForTimeout(150); }
    assert.equal(await page.locator('table.rot-hor tr.extra').count(), 2);
    await printRot('horari');
    assert.equal((await notes7()).filter(x => x.includes('L’horari ha canviat')).length, 0, (await notes7()).join(' || '));
    assert.equal(await page.locator('.tabs a[href$="/rotacions"] .badge').count(), 0);
    const ids = await page.evaluate(() => migrate(JSON.parse(JSON.stringify(db))).competitions[0].rot.printed.hor.rows.filter(r => r.k === 'extra').map(r => r.id));
    assert.equal(ids.length, 2); assert.ok(ids.every(Boolean) && ids[0] !== ids[1], JSON.stringify(ids));
    await page.click('button[data-act=rotSeg][data-v=grups]');
  });

  await step('setena revisió: la graella de Notes amb un aparell (i l’Entrada ràpida de la taula) va en l’ordre del full de jutge: el full es copia de dalt a baix amb Intro', async () => {
    await fresh(); await make();
    // una NP al mig: al full no hi surt; a la graella sí, al seu lloc i sense casella
    const exp = await page.evaluate(() => { const c = curComp(), g = groupsOf(c).find(x => x.category === 'Benjamí' && x.level === 'A' && x.gender === 'F');
      const e = judgeBlocks(c, g, { id: 'barra' })[0].list[3]; e.status = 'np'; commit(); return { key: g.key, np: e.id }; });
    await page.evaluate(() => { window.print = () => { window.__p = $('#print').innerHTML; }; window.__p = null; });
    await page.evaluate(k => doPrint(curComp(), ['judge'], [k]), exp.key); await page.waitForFunction(() => window.__p !== null);
    const paper = await page.$$eval('#print section.sheet', l => { const s = l.find(x => x.querySelector('tr.rep th').textContent.includes('Barra'));
      return { heads: [...s.querySelectorAll('tr.jb')].map(x => x.textContent), bibs: [...s.querySelectorAll('tr.judge')].map(tr => tr.cells[1].textContent) }; });
    await page.evaluate(() => { document.body.classList.remove('printing'); $('#print').innerHTML = ''; });
    assert.ok(paper.heads.length >= 3 && paper.bibs.join() !== [...paper.bibs].sort((a, b) => a - b).join(), 'no és l’ordre dels dorsals');
    await page.evaluate(k => { ui.group = k; ui.app = 'barra'; ui.qe = false; go('#/competicio/c418/notes'); }, exp.key); await page.waitForSelector('#scoregrid');
    const grid = await page.$$eval('#scoregrid tbody tr', l => l.map(r => (r.classList.contains('jb') ? { h: r.textContent.trim() } : { bib: r.cells[0].textContent.trim(), id: r.dataset.row, off: !r.querySelector('input.sc:not(:disabled)') })));
    assert.deepEqual(grid.filter(x => x.h).map(x => x.h), paper.heads);
    assert.deepEqual(grid.filter(x => x.bib && !x.off).map(x => x.bib), paper.bibs, 'les mateixes files que el full, en el mateix ordre');
    assert.ok(grid.find(x => x.id === exp.np).off, 'la NP, al seu lloc i sense casella');
    assert.ok((await page.textContent('#main')).includes('Amb les rotacions fetes, les gimnastes surten en l’ordre en què passen per Barra, com al full de jutge.'));
    // es copia el full de dalt a baix: nota, Intro, nota, Intro…
    const sc = i => (5 + (i + 1) / 10).toFixed(1);
    await page.click('#scoregrid input.sc[data-col="barra:0:v"]:not(:disabled)');
    for (let i = 0; i < paper.bibs.length; i++) { await page.keyboard.type(sc(i).replace('.', ',')); await page.keyboard.press('Enter'); }
    const got = await page.evaluate(k => groupsOf(curComp()).find(x => x.key === k).entries.filter(e => e.status !== 'np').map(e => [String(e.bib), ((e.scores.barra || [])[0] || {}).v]), exp.key);
    assert.equal(got.length, paper.bibs.length);
    for (const [bib, v] of got) assert.equal(v, +sc(paper.bibs.indexOf(bib)), `dorsal ${bib}: la nota de la seva fila del full`);
    // ↓ des del desplegable d'equip salta la fila de la rotació
    const last = grid.filter(x => x.bib && !x.off && grid[grid.indexOf(x) + 1] && grid[grid.indexOf(x) + 1].h)[0];
    await page.focus(`#scoregrid select.teamsel[data-id="${last.id}"]`); await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.e), grid.slice(grid.indexOf(last) + 2).find(x => x.bib && !x.off).id);
    // amb totes les notes, per dorsal (i es diu com copiar un full)
    await page.evaluate(() => { ui.app = 'all'; render(); });
    const bibs = await page.$$eval('#scoregrid tbody tr[data-row]', l => l.map(r => +r.cells[0].textContent));
    assert.deepEqual(bibs, [...bibs].sort((a, b) => a - b)); assert.equal(await page.locator('#scoregrid tr.jb').count(), 0);
    assert.ok((await page.textContent('#main')).includes('Aquí surten per dorsal. Per copiar un full de jutge, tria’n l’aparell a dalt'));
    // l'Entrada ràpida de la taula: el mateix ordre que la graella, amb on comença cada rotació
    await page.evaluate(() => { ui.app = 'barra'; render(); });
    await page.click('button[data-act=toggleQe]'); await page.waitForSelector('#qe');
    assert.deepEqual(await page.$$eval('.qe-strip button', l => l.map(b => b.textContent)), grid.filter(x => x.bib).map(x => x.bib));
    assert.deepEqual(await page.$$eval('.qe-strip .qe-rb', l => l.map(b => b.textContent)), paper.heads);
    await page.click('button[data-act=toggleQe]'); await page.waitForSelector('#scoregrid');
    // sense rotacions, com sempre: per dorsal i sense files de rotació
    await page.evaluate(() => { delete curComp().rot; commit(); render(); });
    const b2 = await page.$$eval('#scoregrid tbody tr', l => l.map(r => (r.classList.contains('jb') ? -1 : +r.cells[0].textContent)));
    assert.deepEqual(b2, [...b2].sort((a, b) => a - b)); assert.ok(!b2.includes(-1));
    assert.ok(!(await page.textContent('#main')).includes('com al full de jutge'));
  });

  await step('setena revisió: el rètol de les noves o que han canviat de subdivisió: un noi, en masculí («l’he posat…, deixa’l»), i «i 1 més ha canviat»', async () => {
    await fresh(); await make(); await clearToasts();
    await page.evaluate(() => { const c = curComp(), e = c.entries.find(x => x.gender === 'M' && x.category === 'Aleví');
      db.gymnasts.push({ ...gymById(e.gymnastId), id: 'gnou1', name: 'Pau', surname: 'Nou Mas' }); c.entries.push({ ...e, id: 'nou1', gymnastId: 'gnou1', bib: 300, scores: {} }); commit(); render(); });
    let n = (await notes7()).find(x => x.includes('des que vas fer les rotacions'));
    assert.ok(n && n.includes('1 gimnasta nou des que vas fer les rotacions: l’he posat amb') && n.includes('(surt marcat NOU)') && n.includes('D’acord, deixa’l així'), n);
    await page.evaluate(() => { window.print = () => {}; actions.rotPrintDlg({ dataset: {} }); }); await page.waitForSelector('#dlg[open] form[data-form=rotPrint]');
    await page.click('#dlg button.primary'); await page.waitForSelector('#confirm[open]');
    const q = await page.locator('#confirm').textContent();
    assert.ok(q.includes('Hi ha 1 gimnasta nou que encara no has revisat (surt on l’he posat). Imprimeixo així les rotacions?'), q);
    await page.click('#confirm button[value=no]'); await page.evaluate(() => { if ($('#dlg').open) closeDialog(); });
    // sis noies de Benjamí A passen a Benjamí B: se'n diuen 5, «i 1 més ha canviat de subdivisió»
    await page.evaluate(() => { const c = curComp(); c.entries = c.entries.filter(e => e.id !== 'nou1');
      c.entries.filter(e => e.category === 'Benjamí' && e.level === 'A' && e.gender === 'F').slice(0, 6).forEach(e => { e.level = 'B'; e.teamId = null; }); commit(); render(); });
    n = (await notes7()).find(x => x.includes('ha passat de la'));
    assert.ok(n && n.includes(' i 1 més ha canviat de subdivisió: les he posades amb') && n.includes('(surten marcades NOU)') && n.includes('deixa-les així'), n);
  });

  await step('setena revisió: corregir el nivell a la fitxa (Gimnastes) també diu d’on a on ha passat a les rotacions, com a la inscripció', async () => {
    await fresh(fixtureJ(new Date(Date.now() + 8 * 864e5).toISOString().slice(0, 10))); await make(); await clearToasts();
    const g = await page.evaluate(() => { const c = curComp(), v = rotViewOf(c), sv = v.subs.find(s => s.label === 'BENJAMÍ A'), e = sv.groups[1].entries[0];
      const w = new Map(); for (const b of Engine.rotSchedule(v, c.rot).blocks) for (const r of b.rows) if (r.kind === 'comp') w.set(r.subId, Engine.rotHM(r.from));
      const sb = v.subs.find(s => s.label === 'BENJAMÍ B'); return { gid: e.gymnastId, name: entryName(e), a: sv.idx, ha: w.get(sv.id), b: sb.idx, hb: w.get(sb.id) }; });
    await page.evaluate(() => go('#/gimnastes')); await page.waitForSelector(`a[data-act=editGym][data-id="${g.gid}"]`);
    await page.click(`a[data-act=editGym][data-id="${g.gid}"]`); await page.waitForSelector('#dlg[open]');
    await page.selectOption('#dlg select[name=level]', 'B'); await page.click('#dlg button.primary');
    await page.waitForSelector('#confirm[open]'); await page.click('#confirm button[value=ok]');
    const t = await (await toastHas('Inscripcions actualitzades')).textContent();
    assert.ok(t.includes(`Inscripcions actualitzades. ${g.name} ha passat de la ${g.a}a subdivisió (${g.ha}) a la ${g.b}a (${g.hb}): mira-ho a la pestanya Rotacions i horari.`), t);
    await page.evaluate(() => go('#/competicio/c418/rotacions'));
  });
  // ─── moure-ho tot: un equip o unes gimnastes a un altre grup o a una altra subdivisió (les dades del 18/04, amb
  // Infantil, Cadet i Juvenil juntes: 1a Prebenjamí 8:30, 2a Benjamí A 9:25, 3a Benjamí B 10:25, 4a Aleví 11:25…)
  // (key: «Aleví A», a les subdivisions on n'hi ha més d'una; si no, null)
  const unitIn = (label, name, key) => { const l = card(label).locator('.rot-u').filter({ has: page.locator('.nm', { hasText: new RegExp(`^${name.replace(/\./g, '\\.')}$`) }) }); return (key ? l.filter({ hasText: '· ' + key }) : l).first(); };
  const atOf = ids => page.evaluate(ids => ids.map(id => curComp().rot.at[id]), ids);
  const unitIds = (label, name, key) => page.evaluate(([l, n, k]) => { const sv = rotViewOf(curComp()).subs.find(s => s.label === l); return sv.units.find(u => rotUnitName(u) === n && rotKeyTxt(u.key) === k).entries.map(e => e.id); }, [label, name, key]);

  await step('moure-ho tot: l’equip C.G. Lleida 2 d’Aleví A a la subdivisió de Benjamí B amb el desplegable, Desfés, i tornar-lo a la seva', async () => {
    await fresh(); await make(); await clearToasts();
    const sel = (label = 'ALEVÍ A i B') => unitIn(label, 'C.G. Lleida 2', 'Aleví A').locator('select[data-chg=rotMove]');
    // (primer la seva subdivisió; després les altres de les noies, amb l'hora; la dels nois, no)
    assert.deepEqual(await sel().locator('optgroup').evaluateAll(l => l.map(g => g.label)), ['4a subdivisió · ALEVÍ A i B (11:25)', '1a subdivisió · PREBENJAMÍ A i B (8:30)',
      '2a subdivisió · BENJAMÍ A (9:25)', '3a subdivisió · BENJAMÍ B (10:25)', '5a subdivisió · INFANTIL A i B, CADET A i B i JUVENIL (12:45)']);
    const s3 = await subId(2), s4 = await subId(3), ids = await unitIds('ALEVÍ A i B', 'C.G. Lleida 2', 'Aleví A');
    assert.equal(await sel().locator(`option[value="${s3}|1"]`).textContent(), '→ Grup 2 · Barra (9 → 13)');
    await sel().selectOption(`${s3}|1`);
    let t = await (await toastHas('C.G. Lleida 2 → 3a subdivisió')).textContent();
    // (l'avís diu el que ha passat, amb les subdivisions tal com queden)
    assert.ok(t.startsWith('C.G. Lleida 2 → 3a subdivisió, Grup 2 (Barra). Ara: 10 · 13 · 10. Competeixen a les 10:25 (abans, a les 11:25).'), t);
    assert.equal(await card('BENJAMÍ B').locator('h3').textContent(), '3a subdivisió · BENJAMÍ B (i C.G. Lleida 2 · Aleví A)');
    const u3 = unitIn('BENJAMÍ B', 'C.G. Lleida 2', 'Aleví A');
    assert.ok(await u3.locator('text=📌').count(), 'fixat a mà');
    assert.deepEqual(await atOf(ids), ids.map(() => ({ s: s3, g: 1, m: 1, x: 1, k: 'Aleví||F||A' })));
    assert.deepEqual((await view()).slice(2, 4).map(s => s.sizes), ['10/13/10', '8/15/14']);
    // Desfés: tot com abans
    await page.locator('.toast:has-text("C.G. Lleida 2 → 3a") button:has-text("Desfés")').click(); await toastHas('Desfet');
    assert.deepEqual((await view()).slice(2, 4).map(s => s.sizes), ['10/9/10', '12/15/14']);
    assert.ok((await atOf(ids)).every(a => a.s === s4 && !a.x));
    // una altra vegada, i tornada: un grup de la seva subdivisió (marcada «la seva») treu el canvi de subdivisió
    await clearToasts(); await sel().selectOption(`${s3}|1`); await toastHas('C.G. Lleida 2 → 3a'); await clearToasts();
    const back = sel('BENJAMÍ B');
    assert.ok((await back.locator('optgroup').evaluateAll(l => l.map(g => g.label))).includes('4a subdivisió · ALEVÍ A i B (11:35) · la seva'));
    await back.selectOption(`${s4}|0`);
    t = await (await toastHas('C.G. Lleida 2 → 4a subdivisió')).textContent();
    assert.ok(t.includes('Han tornat a la seva subdivisió. Competeixen a les 11:25 (abans, a les 10:25).'), t);
    assert.deepEqual(await atOf(ids), ids.map(() => ({ s: s4, g: 0, m: 1 })));
    assert.equal(await card('BENJAMÍ B').locator('h3').textContent(), '3a subdivisió · BENJAMÍ B');
    assert.equal(errors.length, 0, errors.join('\n'));
  });

  await step('moure-ho tot: «Mou…» només 2 de les 5 de l’equip C.G. Lleida d’Aleví B a la 3a: què canvia, l’equip repartit a totes dues, tornar a obrir, i «Ajunta-les aquí»', async () => {
    await clearToasts();
    const s3 = await subId(2), s4 = await subId(3), ids = await unitIds('ALEVÍ A i B', 'C.G. Lleida', 'Aleví B');
    assert.equal(ids.length, 5);
    await unitIn('ALEVÍ A i B', 'C.G. Lleida', 'Aleví B').locator('button[data-act=rotMoveDlg]').click();
    await page.waitForSelector('#dlg[open] form[data-form=rotMoveDo]');
    assert.equal(await page.locator('#dlg h2').textContent(), 'Mou C.G. Lleida');
    assert.deepEqual(await page.$$eval('#dlg input[name=who]', l => l.map(x => x.checked)), [true, true, true, true, true], 'totes marcades');
    assert.ok(await page.locator('#dlg button.primary').isDisabled(), 'primer cal triar on');
    // (només les subdivisions de les noies, i ho diu)
    assert.equal(await page.locator(`#dlg input[name=to][value^="${await subId(5)}|"]`).count(), 0);
    assert.ok((await page.locator('#dlg').textContent()).includes('Les noies i els nois van en subdivisions separades (fan aparells diferents).'));
    for (const i of [2, 3, 4]) await page.locator('#dlg input[name=who]').nth(i).uncheck();
    await page.check(`#dlg input[name=to][value="${s3}|2"]`);
    await page.waitForSelector('#rotMvWhat');
    const what = await page.locator('#rotMvWhat').innerText();
    assert.ok(what.includes('Passen de les 11:25 (4a subdivisió) a les 10:25 (3a).'), what);
    assert.ok(what.includes('L’equip C.G. Lleida quedarà repartit: 2 al Grup 3 de la 3a subdivisió i 3 al Grup 2 de la 4a.'), what);
    assert.equal((await page.locator(`#dlg label:has(input[value="${s3}|2"])`).textContent()).trim(), 'Grup 3 · Terra (10 → 12)');
    assert.equal(await page.locator('#dlg button.primary').textContent(), 'Mou-les');
    await page.click('#dlg button.primary');
    const t = await (await toastHas('2 gimnastes de C.G. Lleida → 3a subdivisió')).textContent();
    assert.ok(t.startsWith('2 gimnastes de C.G. Lleida → 3a subdivisió, Grup 3 (Terra). Ara: 10 · 9 · 12.'), t);
    const chip = l => card(l).locator('.chip', { hasText: 'està repartit' }).textContent();
    // (les que no són a la seva subdivisió, mogudes a mà)
    assert.ok((await chip('BENJAMÍ B')).includes('L’equip C.G. Lleida està repartit: 2 aquí (mogudes a mà) i 3 a la 4a subdivisió.'), await chip('BENJAMÍ B'));
    assert.ok((await chip('ALEVÍ A i B')).includes('L’equip C.G. Lleida està repartit: 3 aquí i 2 a la 3a subdivisió (mogudes a mà).'), await chip('ALEVÍ A i B'));
    assert.deepEqual((await atOf(ids)).map(a => [a.s, !!a.x]), [[s3, true], [s3, true], [s4, false], [s4, false], [s4, false]]);
    // en tornar a obrir l'app, continua igual (i no és cap «nova»)
    await page.waitForTimeout(400); await page.reload(); await page.waitForSelector('.card.rot-sub');
    assert.deepEqual((await atOf(ids)).map(a => [a.s, !!a.x]), [[s3, true], [s3, true], [s4, false], [s4, false], [s4, false]]);
    assert.ok((await chip('BENJAMÍ B')).includes('2 aquí (mogudes a mà) i 3 a la 4a subdivisió'));
    assert.equal(await page.locator('.note:has-text("des que vas fer les rotacions")').count(), 0);
    // «Ajunta-les aquí» (a la 4a): totes 5 al seu grup
    await card('ALEVÍ A i B').locator('.chip', { hasText: 'està repartit' }).locator('button[data-act=rotJoinX]').click();
    assert.ok((await (await toastHas('C.G. Lleida → 4a subdivisió, Grup 2')).textContent()).includes('L’equip C.G. Lleida torna a estar junt.'));
    assert.ok((await atOf(ids)).every(a => a.s === s4 && a.g === 1 && !a.x));
    assert.equal(await page.locator('.chip', { hasText: 'està repartit' }).count(), 0);
  });

  await step('moure-ho tot: un equip de Benjamí B a l’Aleví (4a) fa esperar els premis de Benjamí B: el diàleg ho diu, i després el rètol, l’horari i el full', async () => {
    await clearToasts();
    const s3 = await subId(2), s4 = await subId(3);
    await unitIn('BENJAMÍ B', 'FEDAC Lleida', null).locator('button[data-act=rotMoveDlg]').click();
    await page.waitForSelector('#dlg[open] form[data-form=rotMoveDo]');
    await page.check(`#dlg input[name=to][value="${s4}|2"]`); await page.waitForSelector('#rotMvWhat');
    const what = await page.locator('#rotMvWhat').innerText();
    // (la 3a ja no té premis: la 4a comença abans, i el diàleg ho diu, perquè a la llista hi ha l'hora d'ara)
    assert.ok(/Passen de les 10:25 \(3a subdivisió\) a les 11:[0-2]\d \(4a, que ara comença a les 11:25\)\./.test(what) && what.includes('Els premis de Benjamí B, que ara es fan després de la 3a subdivisió, es faran després de la 4a.'), what);
    await page.click('#dlg button.primary'); await toastHas('FEDAC Lleida → 4a subdivisió');
    const late = 'Els premis de Benjamí B es fan després de la 4a subdivisió, perquè FEDAC Lleida hi competeix.';
    assert.equal((await notes7()).filter(x => x === late).length, 1, (await notes7()).join(' || '));
    await page.click('button[data-act=rotSeg][data-v=horari]'); await page.waitForSelector('table.rot-hor');
    const rows = await page.$$eval('table.rot-hor tr:not(.gap)', trs => trs.map(tr => tr.querySelector('td.t').textContent.trim() + ' ' + tr.querySelectorAll('td')[1].childNodes[0].textContent.trim()));
    const aw = rows.filter(r => r.includes('PREMIS'));
    assert.deepEqual(aw.map(r => r.replace(/^[\d:]+ – [\d:]+ /, '')), ['PREMIS PREBENJAMÍ A i B', 'PREMIS BENJAMÍ A', 'PREMIS BENJAMÍ B i ALEVÍ A i B', 'PREMIS INFANTIL A i B, CADET A i B i JUVENIL', 'PREMIS MASCULINA']);
    // (la 3a, sense premis: la 4a comença quan acaba la competició de la 3a)
    const i3 = rows.findIndex(r => r.includes('Competició 3a subdivisió')), end3 = rows[i3].match(/– ([\d:]+)/)[1];
    assert.ok(rows[i3 + 2].includes(`${end3} – `) && rows[i3 + 2].includes('Competició 4a subdivisió'), rows.slice(i3, i3 + 3).join(' / '));
    assert.equal((await notes7()).filter(x => x === late).length, 1, 'també a l’Horari, un sol cop');
    assert.equal(await page.locator(`input[data-chg=rotSubField][data-s="${s3}"][data-k=awards]`).getAttribute('placeholder'), '0');
    // el full de l'horari
    await printRot('horari');
    assert.ok(await page.evaluate(() => (window.__p || '').includes('PREMIS BENJAMÍ B i ALEVÍ A i B') && !/PREMIS BENJAMÍ B<\/td>/.test(window.__p)));
    await page.click('button[data-act=rotSeg][data-v=grups]');
  });

  await step('moure-ho tot: amb gimnastes d’una altra subdivisió, el full de rotacions, el de jutge, l’ordre del mòbil de les tutores i «Renumera dorsals»', async () => {
    await clearToasts();
    const s3 = await subId(2);
    await unitIn('ALEVÍ A i B', 'C.G. Lleida 2', 'Aleví A').locator('select[data-chg=rotMove]').selectOption(`${s3}|1`); await toastHas('C.G. Lleida 2 → 3a');
    const ids = await unitIds('BENJAMÍ B', 'C.G. Lleida 2', 'Aleví A');
    // el full de la 3a: el Grup 2 diu «BENJAMÍ B – ALEVÍ A» i les files de les d'Aleví A, amb la seva categoria i nivell
    await page.evaluate(() => { window.print = () => { window.__p = $('#print').innerHTML; }; window.__p = null; });
    await page.evaluate(() => actions.rotPrintDlg({ dataset: {} })); await page.waitForSelector('#dlg[open] form[data-form=rotPrint]');
    await page.uncheck('#dlg input[name=w][value=horari]'); await page.click('#dlg button.primary'); await okConfirms7();
    await page.waitForFunction(() => window.__p !== null);
    const sheet = await page.$$eval('#print section.sheet.rot', l => l.map(s => ({ title: s.querySelector('.rs-title').textContent, groups: [...s.querySelectorAll('.rg')].map(g => ({ lab: g.querySelector('.lab').textContent, rows: [...g.querySelectorAll('tbody tr')].map(tr => [...tr.cells].map(td => td.textContent)) })) })));
    await page.evaluate(() => { document.body.classList.remove('printing'); $('#print').innerHTML = ''; });
    const b3 = sheet.find(x => x.title === 'Subdivisió – 3 – BENJAMÍ B'), g2 = b3.groups[1];
    assert.equal(g2.lab, 'BENJAMÍ B – ALEVÍ A');
    assert.deepEqual(g2.rows.filter(r => r[1] === 'C.G. LLEIDA-2 – ALEVÍ A').map(r => r[2]), ['A', 'A', 'A', 'A']);
    assert.ok(!sheet.find(x => x.title.includes('ALEVÍ A i B')).groups.some(g => g.rows.some(r => r[1].startsWith('C.G. LLEIDA-2') && r[2] === 'A')), 'ja no surten a la 4a');
    // el full de jutge d'Aleví A (barra): les 4, al bloc de la 3a subdivisió; l'ordre, el mateix que el del mòbil
    // (el mòbil de les tutores rep les rotacions com les envia el programa —tutorRotation— i en calcula l'ordre ell mateix)
    const exp = await page.evaluate(s3 => { const c = curComp(), v = rotViewOf(c), sv = v.subs.find(s => s.id === s3), g = groupsOf(c).find(x => x.key === 'Aleví||F||A');
      const seq = Engine.rotAppSeq(sv, 'barra', S(), rotCtx()), mine = new Set(g.entries);
      const tc = JSON.parse(JSON.stringify({ id: c.id, apparatus: c.apparatus, entries: c.entries.map(e => ({ id: e.id, bib: e.bib, name: entryName(e), club: clubName(e.clubId), gender: genderOf(e), category: e.category, level: e.level, status: e.status, scores: {}, clubId: e.clubId, teamId: e.teamId })),
        rotation: { rot: c.rot, teams: c.teams.map(t => ({ id: t.id, name: t.name, clubId: t.clubId, category: t.category, gender: genderOf(t), level: t.level })), clubs: Object.fromEntries(db.clubs.map(x => [x.id, x.name])), categories: S().categories.map(x => x.name), levels: S().levels } }));
      const rv = tutRot(tc), tsv = rv.subs.find(s => s.id === s3);
      return { key: g.key, blocks: seq.map(b => ({ h: `3a subdivisió · rotació ${b.r + 1} · Grup ${b.G.g + 1}`, ids: b.entries.filter(e => mine.has(e)).map(e => e.id) })).filter(b => b.ids.length),
        table: seq.flatMap(b => b.entries.map(e => e.id)), tut: Engine.rotAppSeq(tsv, 'barra', rv.st, rv.ctx).flatMap(b => b.entries.map(e => e.id)) }; }, s3);
    assert.deepEqual(exp.blocks.map(b => b.ids.sort()), [[...ids].sort()]);
    assert.deepEqual(exp.tut, exp.table, 'al mòbil, el mateix ordre que a la taula');
    assert.ok(exp.tut.filter(id => ids.includes(id)).length === 4, 'les d’Aleví A, a la barra de la 3a');
    await page.evaluate(() => { window.__p = null; });
    await page.evaluate(k => doPrint(curComp(), ['judge'], [k]), exp.key); await page.waitForFunction(() => window.__p !== null);
    const jb = await page.$$eval('#print section.sheet', l => { const s = l.find(x => x.querySelector('tr.rep th').textContent.includes('Barra')); return [...s.querySelectorAll('tr.jb')].map(x => x.textContent); });
    await page.evaluate(() => { document.body.classList.remove('printing'); $('#print').innerHTML = ''; });
    assert.equal(jb[0], exp.blocks[0].h, jb.join(' / '));
    assert.ok(jb.slice(1).every(x => x.startsWith('4a subdivisió')), jb.join(' / '));
    // «Renumera dorsals»: en l'ordre de pas, i les d'Aleví A que competeixen a la 3a, amb els dorsals de la 3a
    await page.evaluate(() => go('#/competicio/c418/inscripcions')); await page.waitForSelector('button[data-act=renumber]');
    await page.click('button[data-act=renumber]'); await page.click('#confirm button[value=ok]'); await toastHas('Dorsals renumerats');
    const r = await page.evaluate(ids => { const c = curComp(), v = rotViewOf(c), seq = v.subs.flatMap(sv => sv.groups.flatMap(G => Engine.rotGroupOrder(G, S(), rotCtx()).flatMap(x => x.entries)));
      const sub = id => v.place.get(c.entries.find(e => e.id === id)).subId, b3 = c.entries.filter(e => v.place.get(e).subId === v.subs[2].id).map(e => e.bib);
      return { bibs: seq.map(e => e.bib), guests: ids.map(id => c.entries.find(e => e.id === id).bib), lo: Math.min(...b3), hi: Math.max(...b3), sub: ids.map(sub) }; }, ids);
    assert.deepEqual(r.bibs, r.bibs.map((_, i) => i + 1), 'els dorsals segueixen l’ordre de pas');
    assert.ok(r.guests.every(b => b >= r.lo && b <= r.hi), JSON.stringify(r.guests) + ' ' + r.lo + '–' + r.hi);
    await page.evaluate(() => go('#/competicio/c418/rotacions')); await page.waitForSelector('.card.rot-sub');
  });

  await step('moure-ho tot: «Treu les fixacions» i «Torna-les a fer de zero» diuen quantes tornen a la seva subdivisió; «Mantén» les deixa on són', async () => {
    await clearToasts();
    const s3 = await subId(2), s4 = await subId(3);
    const guests = () => page.evaluate(() => rotGuests(rotViewOf(curComp())).length);
    assert.equal(await guests(), 10, 'C.G. Lleida 2 (4) a la 3a i FEDAC Lleida (6) a la 4a');
    // «Torna-les a fer de zero» → «Mantén…»: es queden on són
    await page.click('.toolbar .menu button[data-act=menuToggle]'); await page.click('.menu.open button[data-act=rotRedoAll]');
    await page.waitForSelector('#confirm[open]');
    assert.ok((await page.locator('#confirm button[value=all]').textContent()).includes('Torna-ho a fer tot (10 gimnastes tornen a la seva subdivisió)'));
    await page.click('#confirm button[value=keep]'); await toastHas('Grups refets a totes les subdivisions');
    assert.equal(await guests(), 10);
    // «Treu les fixacions» de la 3a: pregunta, i les 4 de C.G. Lleida 2 tornen a la 4a (marcades NOU, i es diu d'on a on)
    await clearToasts();
    await card('BENJAMÍ B').locator('button[data-act=menuToggle]').click(); await card('BENJAMÍ B').locator('button[data-act=rotUnpin]').click();
    await page.waitForSelector('#confirm[open]');
    assert.ok((await page.locator('#confirm').textContent()).includes('Treure les fixacions de la 3a subdivisió? Les 4 gimnastes que has portat a una altra subdivisió tornen a la seva. Es pot desfer.'));
    await page.click('#confirm button[value=ok]');
    assert.ok((await (await toastHas('Ja no n’hi ha cap de fixat')).textContent()).includes('Les 4 gimnastes que havies portat a una altra subdivisió han tornat a la seva.'));
    assert.equal(await guests(), 6);
    assert.ok((await notes7()).some(x => x.includes('ha passat de la 3a subdivisió') && x.includes('a la 4a')), (await notes7()).join(' || '));
    await page.click('.note button[data-act=rotAccept]'); await toastHas('Desades on eren');
    // «Torna-les a fer de zero» → «Torna-ho a fer tot»: FEDAC Lleida torna a la 3a, i ja no hi ha cap rètol de premis
    await clearToasts();
    await page.click('.toolbar .menu button[data-act=menuToggle]'); await page.click('.menu.open button[data-act=rotRedoAll]');
    await page.waitForSelector('#confirm[open]');
    assert.ok((await page.locator('#confirm button[value=all]').textContent()).includes('(6 gimnastes tornen a la seva subdivisió)'));
    await page.click('#confirm button[value=all]');
    assert.ok((await (await toastHas('Grups refets a totes les subdivisions')).textContent()).includes('Les 6 gimnastes que havies portat a una altra subdivisió han tornat a la seva.'));
    assert.equal(await guests(), 0);
    assert.equal((await notes7()).filter(x => x.startsWith('Els premis')).length, 0);
    assert.equal(await page.locator('.note:has-text("des que vas fer les rotacions")').count(), 0, 'totes desades');
    assert.ok(await page.evaluate(([s3, s4]) => { const c = curComp(), v = rotViewOf(c); return c.entries.every(e => !c.rot.at[e.id].x) && v.subs[2].id === s3 && v.subs[3].id === s4; }, [s3, s4]));
  });

  await step('moure-ho tot: al mòbil (360 px), el diàleg «Mou…» es pot fer servir sencer, i una competició bloquejada no el deixa obrir', async () => {
    await fresh(); await make();
    await page.setViewportSize({ width: 360, height: 740 }); await page.evaluate(() => render()); await clearToasts();
    await page.selectOption('.gsel select', await subId(3));
    await page.waitForSelector('.card.rot-sub h3:has-text("ALEVÍ A i B")');
    await page.locator('.card.rot-sub button[data-act=rotMoveDlg]').first().click();
    await page.waitForSelector('#dlg[open] form[data-form=rotMoveDo]');
    const fit = () => page.evaluate(() => { const b = $('#dlg .dlg'), r = $('#dlg').getBoundingClientRect(); return { sw: b.scrollWidth, cw: b.clientWidth, dw: Math.round(r.width), iw: innerWidth, page: document.scrollingElement.scrollWidth }; });
    let f = await fit();
    assert.ok(f.sw <= f.cw && f.dw <= f.iw && f.page <= f.iw, JSON.stringify(f));
    const s3 = await subId(2), radio = page.locator(`#dlg input[name=to][value="${s3}|0"]`);
    await radio.scrollIntoViewIfNeeded(); await radio.check(); await page.waitForSelector('#rotMvWhat');
    f = await fit(); assert.ok(f.sw <= f.cw, JSON.stringify(f));
    // el botó es veu (enganxat a baix) sense haver de baixar fins al final
    const okBox = await page.locator('#dlg button.primary').boundingBox();
    assert.ok(okBox && okBox.y + okBox.height <= 740 && okBox.width >= 100, JSON.stringify(okBox));
    await page.screenshot({ path: path.join(out, 'rot-mou-mobil.png') });
    await page.click('#dlg button.primary'); await toastHas('→ 3a subdivisió, Grup 1');
    await page.setViewportSize({ width: 1366, height: 900 }); await page.evaluate(() => render());
    // bloquejada: el botó no es pot clicar, i si s'hi arriba igualment, no s'obre
    await page.evaluate(() => { curComp().locked = true; commit(); render(); });
    assert.ok(await page.locator('button[data-act=rotMoveDlg]').first().isDisabled());
    await clearToasts();
    await page.evaluate(() => { const b = $('button[data-act=rotMoveDlg]'); actions.rotMoveDlg(b); });
    await toastHas('La competició està bloquejada');
    assert.equal(await page.evaluate(() => $('#dlg').open), false);
    await page.evaluate(() => { curComp().locked = false; commit(); render(); });
    assert.equal(errors.length, 0, errors.join('\n'));
  });

  // ── moure-ho tot, correccions de la revisió
  // (on és cada inscripció: el nom de la subdivisió, i si l'hi ha portat ella)
  const whereL = ids => page.evaluate(ids => { const c = curComp(), v = rotViewOf(c); return ids.map(id => { const e = c.entries.find(x => x.id === id), p = v.place.get(e); return v.subs.find(s => s.id === p.subId).label + (c.rot.at[id] && c.rot.at[id].x ? ' (x)' : ''); }); }, ids);
  const byLabel = l => page.evaluate(l => rotViewOf(curComp()).subs.find(s => s.label === l).id, l);
  const toastTxt = async t => (await (await toastHas(t)).textContent()).replace(/(Desfés|Reequilibra la resta)/g, '');

  await step('moure-ho tot: «Mou…» 2 de les 5 i després «Separa» Aleví: les 3 que no ha mogut van amb Aleví B (no amb les 2); «Treu les fixacions» d’un equip repartit en dues subdivisions que no són la seva les torna de debò a la seva', async () => {
    await fresh(); await make(); await clearToasts();
    const s3 = await subId(2), ids = await unitIds('ALEVÍ A i B', 'C.G. Lleida', 'Aleví B');
    await unitIn('ALEVÍ A i B', 'C.G. Lleida', 'Aleví B').locator('button[data-act=rotMoveDlg]').click();
    await page.waitForSelector('#dlg[open] form[data-form=rotMoveDo]');
    const moved = await page.$$eval('#dlg input[name=who]', l => l.slice(0, 2).map(x => x.value));
    for (const i of [2, 3, 4]) await page.locator('#dlg input[name=who]').nth(i).uncheck();
    await page.check(`#dlg input[name=to][value="${s3}|2"]`); await page.click('#dlg button.primary');
    await toastHas('2 gimnastes de C.G. Lleida → 3a subdivisió'); await clearToasts();
    const rest = ids.filter(id => !moved.includes(id));
    // «Quines categories van juntes…» → «Separa» la de l'Aleví → «Desa i fes els grups»
    await page.click('button[data-act=rotSubsDlg] >> visible=true'); await page.waitForSelector('#dlg[open] form[data-form=rotSubs]');
    await page.click('#dlg button[data-act=rotDraftSplit][data-i="3"]'); await page.click('#dlg button.primary');
    await toastHas('Desat');
    assert.deepEqual(await whereL(moved), ['BENJAMÍ B (x)', 'BENJAMÍ B (x)'], 'les 2 que ha mogut es queden a la 3a');
    assert.deepEqual(await whereL(rest), ['ALEVÍ B', 'ALEVÍ B', 'ALEVÍ B'], 'les 3 que no ha mogut, amb la seva categoria (i no fixades a la 3a)');
    assert.equal(await card('BENJAMÍ B').locator('.chip', { hasText: 'està repartit' }).count(), 1);
    // l'equip, ara: 2 a la 3a i les 3 d'Aleví B, totes a la 2a (Benjamí A) amb el desplegable. Cap a la seva
    // (PREBENJAMÍ A i B també diu «BENJAMÍ A»)
    const sBA = await subId(1), sAB = await byLabel('ALEVÍ B'), albT = /^\d+a subdivisió · ALEVÍ B$/, BA = /^2a subdivisió · BENJAMÍ A/;
    await unitIn(albT, 'C.G. Lleida', null).locator('select[data-chg=rotMove]').selectOption(`${sBA}|0`);
    await toastHas('C.G. Lleida → 2a subdivisió'); await clearToasts();
    assert.deepEqual(await whereL(ids.filter(id => rest.includes(id))), ['BENJAMÍ A (x)', 'BENJAMÍ A (x)', 'BENJAMÍ A (x)']);
    const unpinBA = async () => {
      await card(BA).locator('button[data-act=menuToggle]').click(); await card(BA).locator('button[data-act=rotUnpin]').click();
      await page.waitForSelector('#confirm[open]');
      assert.ok((await page.locator('#confirm').textContent()).includes('Les 3 gimnastes que has portat a una altra subdivisió tornen a la seva.'));
      await page.click('#confirm button[value=ok]');
    };
    const home = async t => {
      assert.ok((await toastTxt(t)).includes('Les 3 gimnastes que havies portat a una altra subdivisió han tornat a la seva.'));
      // (de debò a la seva, l'Aleví B, i no a la 3a, on hi ha les altres 2 de l'equip; i el rètol ho diu)
      assert.deepEqual(await whereL(rest), ['ALEVÍ B', 'ALEVÍ B', 'ALEVÍ B']);
      assert.deepEqual(await whereL(moved), ['BENJAMÍ B (x)', 'BENJAMÍ B (x)']);
      const n = (await notes7()).find(x => x.includes('des que vas fer') || x.includes('ha passat de'));
      assert.ok(n && n.includes('ha passat de la 2a subdivisió') && n.includes(`a la ${await page.evaluate(id => rotViewOf(curComp()).subs.find(s => s.id === id).idx, sAB)}a`), n);
      await page.click('.note button[data-act=rotAccept]'); await toastHas('Desades on eren');
      assert.deepEqual(await whereL(rest), ['ALEVÍ B', 'ALEVÍ B', 'ALEVÍ B'], 'i en desar-ho, també');
    };
    await unpinBA(); await home('Ja no n’hi ha cap de fixat');
    // el mateix amb «Torna a fer els grups d'aquesta subdivisió» → «Torna-ho a fer tot»
    await clearToasts();
    await unitIn(albT, 'C.G. Lleida', null).locator('select[data-chg=rotMove]').selectOption(`${sBA}|0`); await toastHas('C.G. Lleida → 2a subdivisió'); await clearToasts();
    await card(BA).locator('button[data-act=menuToggle]').click(); await card(BA).locator('button[data-act=rotRedoSub]').click();
    await page.waitForSelector('#confirm[open]'); await page.click('#confirm button[value=all]');
    await home('Grups refets');
    assert.equal(errors.length, 0, errors.join('\n'));
  });

  await step('moure-ho tot: canviar el nom d’una categoria o d’un nivell, o ajuntar-ne dos, no desfà el que ella ha portat a una altra subdivisió', async () => {
    await fresh(); await make(); await clearToasts();
    // (a la 1a, Prebenjamí A i B, que no desapareix encara que s'ajuntin els nivells A i B; la de Benjamí B, sí)
    const s1 = await subId(0), ids = await unitIds('ALEVÍ A i B', 'C.G. Lleida 2', 'Aleví A'), lsr = await unitIds('ALEVÍ A i B', 'La Salle Reus · 2 individuals', 'Aleví B');
    await unitIn('ALEVÍ A i B', 'C.G. Lleida 2', 'Aleví A').locator('select[data-chg=rotMove]').selectOption(`${s1}|1`); await toastHas('C.G. Lleida 2 → 1a'); await clearToasts();
    await unitIn('ALEVÍ A i B', 'La Salle Reus · 2 individuals', 'Aleví B').locator('select[data-chg=rotMove]').selectOption(`${s1}|0`); await toastHas('La Salle Reus · 2 individuals → 1a'); await clearToasts();
    const whereS = l => page.evaluate(l => { const c = curComp(), v = rotViewOf(c); return l.map(id => { const p = v.place.get(c.entries.find(e => e.id === id)); return p.subId + (p.x ? ' (x)' : ''); }); }, l);
    const check = async (k, kB) => {
      await page.evaluate(() => go('#/competicio/c418/rotacions')); await page.waitForSelector('.card.rot-sub');
      assert.deepEqual(await whereS(ids.concat(lsr)), ids.concat(lsr).map(() => s1 + ' (x)'));
      const at = await atOf(ids.concat(lsr));
      assert.deepEqual(at.map(a => a.k), ids.map(() => k).concat(lsr.map(() => kB)));
      assert.equal(await page.locator('.note:has-text("ha passat de")').count(), 0, 'ningú ha canviat de subdivisió');
    };
    // la categoria, a Configuració
    await page.evaluate(() => go('#/configuracio'));
    const i = await page.evaluate(() => S().categories.findIndex(c => c.name === 'Aleví'));
    const inp = page.locator(`input[data-chg=catField][data-k=name][data-i="${i}"]`);
    await inp.fill('Alevina'); await inp.press('Tab'); await toastHas('«Aleví» ara es diu «Alevina»');
    await check('Alevina||F||A', 'Alevina||F||B');
    // un nivell
    await page.evaluate(() => go('#/configuracio'));
    const j = await page.evaluate(() => S().levels.indexOf('A'));
    const lv = page.locator(`input[data-chg=listRename][data-key=levels][data-i="${j}"]`);
    await lv.fill('A1'); await lv.press('Tab'); await toastHas('«A» ara es diu «A1»');
    await check('Alevina||F||A1', 'Alevina||F||B');
    // dos nivells que s'ajunten (B a A1): les de B, ara A1, també es queden on ella les havia portat
    await page.evaluate(() => go('#/configuracio'));
    const b = page.locator(`input[data-chg=listRename][data-key=levels][data-i="${await page.evaluate(() => S().levels.indexOf('B'))}"]`);
    await b.fill('A1'); await b.press('Tab'); await page.waitForSelector('#confirm[open]'); await page.click('#confirm button[value=ok]');
    await toastHas('s’ha ajuntat amb');
    await check('Alevina||F||A1', 'Alevina||F||A1');
    assert.equal(errors.length, 0, errors.join('\n'));
  });

  await step('moure-ho tot: Juvenil (1 gimnasta, sola) a la de Cadet i tornada: cap «—», i els números que diuen són els de la pantalla', async () => {
    await fresh(fixture()); await make(); await clearToasts();
    const juv = await byLabel('JUVENIL'), cad = await byLabel('CADET A i B');
    await unitIn(/· JUVENIL$/, 'Mas Puig, Aina · C.G. Lleida', null).locator('select[data-chg=rotMove]').selectOption(`${cad}|0`);
    let t = await toastTxt('Mas Puig, Aina · C.G. Lleida → 6a subdivisió');
    assert.ok(!t.includes('—') && t.includes('La subdivisió de JUVENIL s’ha quedat sense gimnastes.') && t.includes('Els premis de Juvenil A ara es fan després de la 6a subdivisió.'), t);
    assert.ok(t.includes('Competeix a les ') && t.includes('(abans, a les '), t);
    assert.deepEqual((await view()).slice(6).map(s => [s.idx, s.label]), [[0, 'JUVENIL'], [7, 'MASCULINA']]);
    assert.ok(await page.locator('.card.rot-sub h3', { hasText: 'Subdivisió sense gimnastes · JUVENIL' }).count());
    // (al mòbil, el desplegable de les subdivisions també la diu pel nom)
    await page.setViewportSize({ width: 360, height: 740 }); await page.evaluate(() => render());
    assert.deepEqual((await page.locator('.gsel select option').allTextContents()).slice(6).map(x => x.trim()), ['Sense gimnastes · JUVENIL', '7a · MASCULINA']);
    await page.setViewportSize({ width: 1366, height: 900 }); await page.evaluate(() => render());
    await clearToasts();
    // «Mou…» per tornar-la: la seva no té número (ara no hi ha ningú), i es diu pel nom
    await unitIn(/^6a subdivisió · CADET/, 'Mas Puig, Aina · C.G. Lleida', null).locator('button[data-act=rotMoveDlg]').click();
    await page.waitForSelector('#dlg[open] form[data-form=rotMoveDo]');
    const head = await page.locator('#dlg form > p').first().textContent();
    assert.ok(head.includes('(la seva és la subdivisió de JUVENIL, ara sense gimnastes)'), head);
    await page.check(`#dlg input[name=to][value="${juv}|0"]`); await page.waitForSelector('#rotMvWhat');
    const what = await page.locator('#rotMvWhat').innerText();
    assert.ok(!what.includes('—') && what.includes('Torna a la seva subdivisió.') && what.includes('(subdivisió de JUVENIL, ara sense gimnastes).'), what);
    assert.ok(what.includes('Els premis de Juvenil A, que ara es fan després de la 6a subdivisió, es faran després de la subdivisió de JUVENIL, ara sense gimnastes.'), what);
    await page.click('#dlg button.primary');
    t = await toastTxt('Mas Puig, Aina · C.G. Lleida → 7a subdivisió');
    assert.ok(!t.includes('—') && t.includes('Ha tornat a la seva subdivisió.') && t.includes('Els premis de Juvenil A ara es fan després de la 7a subdivisió.'), t);
    assert.deepEqual((await view()).slice(6).map(s => [s.idx, s.label]), [[7, 'JUVENIL'], [8, 'MASCULINA']]);
    assert.equal(errors.length, 0, errors.join('\n'));
  });

  await step('moure-ho tot: amb el teclat, les fletxes del desplegable no surten de la subdivisió (i el focus s’hi queda); triant-ne una altra, el focus la segueix', async () => {
    await fresh(); await make(); await clearToasts();
    const s1 = await subId(0), s2 = await subId(1);
    const u = await page.evaluate(s1 => { const sv = rotViewOf(curComp()).subs.find(s => s.id === s1), x = sv.units.find(u => u.g === sv.k - 1 && u.n > 0); return { h: x.handle, g: x.g }; }, s1);
    const sel = () => page.locator(`select[data-chg=rotMove][data-s="${s1}"][data-e="${u.h}"]`);
    await sel().focus();
    for (const k of ['ArrowDown', 'ArrowRight', 'End', 'PageDown']) {
      await page.keyboard.press(k); await page.waitForTimeout(150);
      assert.equal(await sel().inputValue(), String(u.g), k);
      assert.ok(await page.evaluate(([s, e]) => document.activeElement.matches(`select[data-chg=rotMove][data-s="${s}"][data-e="${e}"]`), [s1, u.h]), k + ': el focus, al mateix desplegable');
    }
    assert.equal(await page.locator('.toast').count(), 0, 'no s’ha mogut res');
    // amunt sí que va pels grups d'aquí
    await page.keyboard.press('ArrowUp'); await toastHas(`→ Grup ${u.g}`); await clearToasts();
    // una altra subdivisió, triada: s'hi mou, i el focus va al seu desplegable a la targeta de la 2a
    await page.locator(`select[data-chg=rotMove][data-s="${s1}"][data-e="${u.h}"]`).focus();
    await page.locator(`select[data-chg=rotMove][data-s="${s1}"][data-e="${u.h}"]`).selectOption(`${s2}|0`);
    await toastHas('→ 2a subdivisió, Grup 1');
    assert.ok(await page.evaluate(([s, e]) => document.activeElement.matches(`select[data-chg=rotMove][data-s="${s}"][data-e="${e}"]`), [s2, u.h]), 'el focus segueix la unitat');
    assert.equal(errors.length, 0, errors.join('\n'));
  });

  await step('moure-ho tot: un equip repartit en dues subdivisions perquè se n’ha canviat l’equip a una: no diu «fet a mà», posa la «!» i ho diu en imprimir; «Mou…» comença a «Qui»', async () => {
    await fresh(); await make(); await clearToasts();
    const s3 = await subId(2);
    await unitIn('ALEVÍ A i B', 'C.G. Lleida 2', 'Aleví A').locator('select[data-chg=rotMove]').selectOption(`${s3}|1`); await toastHas('C.G. Lleida 2 → 3a'); await clearToasts();
    assert.equal(await page.evaluate(() => rotNeedsLook(curComp(), rotViewOf(curComp()))), false);
    // a una gimnasta de C.G. Lleida (Aleví A, a la 4a) se li posa l'equip C.G. Lleida 2 (i no clica «Mou-la amb l'equip»)
    await page.evaluate(() => { const c = curComp(), t = n => c.teams.find(x => x.name === n && x.category === 'Aleví' && x.level === 'A');
      c.entries.find(x => x.teamId === t('C.G. Lleida').id).teamId = t('C.G. Lleida 2').id; commit(); render(); });
    const chip = l => card(l).locator('.chip', { hasText: 'està repartit' }).textContent();
    assert.ok((await chip('BENJAMÍ B')).includes('L’equip C.G. Lleida 2 està repartit: 4 aquí (mogudes a mà) i 1 a la 4a subdivisió.'), await chip('BENJAMÍ B'));
    assert.ok((await chip('ALEVÍ A i B')).includes('L’equip C.G. Lleida 2 està repartit: 1 aquí i 4 a la 3a subdivisió (mogudes a mà).'), await chip('ALEVÍ A i B'));
    assert.equal(await page.locator('.chip:has-text("fet a mà")').count(), 0);
    assert.equal(await page.evaluate(() => rotNeedsLook(curComp(), rotViewOf(curComp()))), true, 'la «!» de la pestanya');
    await page.evaluate(() => { window.print = () => {}; actions.rotPrintDlg({ dataset: {} }); }); await page.waitForSelector('#dlg[open] form[data-form=rotPrint]');
    await page.click('#dlg button.primary'); await page.waitForSelector('#confirm[open]');
    const conf = (await page.locator('#confirm').textContent()).replace(/\s+/g, ' ');
    assert.ok(conf.includes('Encara hi ha avisos') && conf.includes('3a i 4a: C.G. Lleida 2 repartit en 2 subdivisions'), conf);
    await page.click('#confirm button[value=no]');
    await page.evaluate(() => { document.body.classList.remove('printing'); $('#print').innerHTML = ''; if ($('#dlg').open) closeDialog(); });
    // «Mou…» amb el teclat: el focus, a la primera de «Qui»
    await unitIn('ALEVÍ A i B', 'C.G. Lleida', 'Aleví B').locator('button[data-act=rotMoveDlg]').focus(); await page.keyboard.press('Enter');
    await page.waitForSelector('#dlg[open] form[data-form=rotMoveDo]');
    assert.ok(await page.evaluate(() => document.activeElement === $('#dlg input[name=who]')), 'el focus, a la primera de «Qui»');
    await page.keyboard.press('Tab');
    assert.ok(await page.evaluate(() => document.activeElement === $$('#dlg input[name=who]')[1]));
    await page.evaluate(() => closeDialog());
    assert.equal(errors.length, 0, errors.join('\n'));
  });

  await step('moure-ho tot: al mòbil, l’avís d’haver-ho mogut diu el que ha passat (no el «quedarà» del diàleg), i els botons van a sota', async () => {
    await fresh(); await make();
    await page.setViewportSize({ width: 360, height: 740 }); await page.evaluate(() => render()); await clearToasts();
    const s4 = await subId(3);
    await page.selectOption('.gsel select', await subId(2)); await page.waitForSelector('.card.rot-sub h3:has-text("BENJAMÍ B")');
    await unitIn('BENJAMÍ B', 'FEDAC Lleida', null).locator('button[data-act=rotMoveDlg]').click();
    await page.waitForSelector('#dlg[open] form[data-form=rotMoveDo]');
    for (const i of [1, 2, 3, 4, 5]) await page.locator('#dlg input[name=who]').nth(i).uncheck();
    const radio = page.locator(`#dlg input[name=to][value="${s4}|0"]`); await radio.scrollIntoViewIfNeeded(); await radio.check(); await page.waitForSelector('#rotMvWhat');
    assert.ok((await page.locator('#rotMvWhat').innerText()).includes('quedarà repartit'));
    await page.click('#dlg button.primary');
    const el = await toastHas('→ 4a subdivisió, Grup 1'), t = await toastTxt('→ 4a subdivisió, Grup 1');
    assert.ok(t.includes('Competeix a les 11:') && t.includes('(abans, a les 10:25)') && t.includes('L’equip FEDAC Lleida queda repartit: 5 al Grup 3 de la 3a subdivisió i 1 al Grup 1 de la 4a.') && t.includes('Els premis de Benjamí B ara es fan després de la 4a subdivisió.'), t);
    assert.ok(!/quedarà|faran|\(ara, /.test(t), t);
    const box = await el.evaluate(x => { const s = x.querySelector('span').getBoundingClientRect(), b = x.querySelector('button').getBoundingClientRect(); return { h: x.getBoundingClientRect().height, sw: s.width, below: b.top >= s.bottom - 1 }; });
    assert.ok(box.h < 260 && box.sw > 280 && box.below, JSON.stringify(box));
    await page.screenshot({ path: path.join(out, 'rot-mou-avis-mobil.png') });
    await page.setViewportSize({ width: 1366, height: 900 }); await page.evaluate(() => render());
    assert.equal(errors.length, 0, errors.join('\n'));
  });

  await step('moure-ho tot: la primera vegada (sense regles desades), les subdivisions petites ho diuen a la targeta, també després de tornar a obrir; el text d’abans de fer-les diu el que farà', async () => {
    // (el text d'abans de fer les rotacions: els nois junts i cada categoria i nivell al seu grup, si no ho ha canviat)
    await fresh(fixture());
    let intro = await page.locator('main .card p').first().textContent();
    assert.ok(intro.includes(', i els nois, tots junts)') && intro.includes('cada categoria i nivell al seu grup'), intro);
    assert.equal(await page.evaluate(() => S().rot === undefined || S().rot.joins === null), true);
    await make();
    const hint = l => card(l).locator('.chip', { hasText: 'Aquesta subdivisió només té' }).textContent();
    assert.ok((await hint(/· JUVENIL$/)).includes('Aquesta subdivisió només té 1 gimnasta.'));
    assert.ok((await hint('CADET A i B')).includes('només té 7 gimnastes'));
    // (tornar a obrir l'app: la nota de «He fet…» ja no hi és, i les targetes ho continuen dient)
    await page.waitForTimeout(400); await page.reload(); await page.waitForSelector('.card.rot-sub');
    assert.equal(await page.locator('.note:has-text("He fet")').count(), 0);
    assert.ok((await hint(/· JUVENIL$/)).includes('només té 1 gimnasta') && await card(/· JUVENIL$/).locator('.chip button[data-act=rotSubsDlg]').count());
    assert.equal(await page.evaluate(() => S().rot.joins), null);
    // amb els nois separats i «grups tan igualats com es pugui» (el que ella ha triat abans), el text ho diu
    const d = fixture(); d.settings.rot = { joins: null, apart: [], seen: [], allM: false, maxGroup: 15, mode: 'bal' };
    await fresh(d);
    intro = await page.locator('main .card p').first().textContent();
    assert.ok(!intro.includes('els nois') && intro.includes('tan igualats com es pugui (encara que calgui barrejar nivells o categories)') && !intro.includes('cada categoria i nivell al seu grup'), intro);
    assert.equal(errors.length, 0, errors.join('\n'));
  });

  // ── moure-ho tot, segona revisió
  // (on és cada inscripció: «4a/G2», amb 📌 si és fixada a mà i (x) si és en una subdivisió que no és la seva)
  const placeOf = ids => page.evaluate(ids => { const c = curComp(), v = rotViewOf(c); return ids.map(id => { const e = c.entries.find(x => x.id === id), p = v.place.get(e), sv = v.subs.find(s => s.id === p.subId); return `${sv.idx}a/G${p.g + 1}${c.rot.at[id] && c.rot.at[id].m ? '📌' : ''}${p.x ? '(x)' : ''}`; }); }, ids);
  // (respon una pregunta de dues opcions o una confirmació, i en torna el text)
  const answer = async value => { await page.waitForSelector('#confirm[open]'); const t = (await page.locator('#confirm').textContent()).replace(/\s+/g, ' '); await page.click(`#confirm button[value="${value}"]`); return t; };
  const gOf = id => page.evaluate(id => rotViewOf(curComp()).place.get(curComp().entries.find(e => e.id === id)).g, id);
  const nameOf = id => page.evaluate(id => entryName(curComp().entries.find(e => e.id === id)), id);
  // «Mou…» d'una unitat: només les ids marcades (si no, totes) a la subdivisió s, Grup g
  const mouDlg = async (u, s, g, only = null) => {
    await u.locator('button[data-act=rotMoveDlg]').click(); await page.waitForSelector('#dlg[open] form[data-form=rotMoveDo]');
    if (only) for (const v of await page.$$eval('#dlg input[name=who]', l => l.map(x => x.value))) if (!only.includes(v)) await page.locator(`#dlg input[name=who][value="${v}"]`).uncheck();
    await page.check(`#dlg input[name=to][value="${s}|${g}"]`); await page.waitForSelector('#rotMvWhat');
  };
  // imprimir: el text del primer avís (i s'imprimeix igualment)
  const printWarn = async (what = null) => {
    await page.evaluate(() => { window.print = () => { window.__p = $('#print').innerHTML; }; window.__p = null; });
    await page.evaluate(w => actions.rotPrintDlg({ dataset: w ? { what: w } : {} }), what); await page.waitForSelector('#dlg[open] form[data-form=rotPrint]');
    await page.click('#dlg button.primary');
    const t = await answer('ok'); await okConfirms7();
    await page.waitForFunction(() => window.__p !== null);
    await page.evaluate(() => { document.body.classList.remove('printing'); $('#print').innerHTML = ''; });
    return t;
  };

  await step('moure-ho tot (2a): «Mou…» 2 de les 5 a un altre grup de la mateixa subdivisió: cada tros fixat (📌), «repartit a mà», el desplegable compta bé, i cap eina no ho desfà', async () => {
    await fresh(); await make(); await clearToasts();
    const s4 = await subId(3), ids = await unitIds('ALEVÍ A i B', 'C.G. Lleida', 'Aleví B');
    const g0 = await gOf(ids[0]), tg = g0 === 0 ? 2 : 0;
    await mouDlg(unitIn('ALEVÍ A i B', 'C.G. Lleida', 'Aleví B'), s4, tg, ids.slice(0, 2));
    assert.ok((await page.locator('#dlg').textContent()).includes('Quedarà fixat a mà (📌), i les 3 que es queden, on són: «Reequilibra» no ho mourà.'));
    await page.click('#dlg button.primary'); await toastHas('2 gimnastes de C.G. Lleida → Grup');
    const want = ids.map((id, i) => `4a/G${(i < 2 ? tg : g0) + 1}📌`);
    assert.deepEqual(await placeOf(ids), want);
    // a la targeta, els dos trossos amb el 📌, i l'avís diu que l'ha repartit ella
    const parts = card('ALEVÍ A i B').locator('.rot-u').filter({ has: page.locator('.nm', { hasText: /^C\.G\. Lleida$/ }) }).filter({ hasText: '· Aleví B' });
    assert.equal(await parts.count(), 2);
    for (let i = 0; i < 2; i++) assert.equal(await parts.nth(i).locator('summary', { hasText: '📌' }).count(), 1, 'el 📌 a tots dos trossos');
    const chip = (await card('ALEVÍ A i B').locator('.chip', { hasText: 'repartit a mà' }).textContent()).replace(/\s+/g, ' ');
    const pp = [[tg, 2], [g0, 3]].sort((a, b) => a[0] - b[0]).map(([g, n]) => `${n} al Grup ${g + 1}`);
    assert.ok(chip.includes(`L’equip C.G. Lleida està repartit a mà: ${pp.join(' i ')}.`) && chip.includes('Ajunta-les'), chip);
    // el desplegable: al grup on n'hi ha 2, s'hi sumen les 3 que encara no hi són
    const nG = await page.evaluate(([s, g]) => rotViewOf(curComp()).subs.find(x => x.id === s).groups[g].n, [s4, tg]);
    const opt = (await parts.first().locator('select[data-chg=rotMove] option').allTextContents()).find(o => o.startsWith(`→ Grup ${tg + 1}`));
    assert.ok(opt && opt.endsWith(`(${nG} → ${nG + 3})`), opt);
    // «Torna a fer els grups d'aquesta subdivisió» → «Mantén…»
    await clearToasts();
    await card('ALEVÍ A i B').locator('button[data-act=menuToggle]').click(); await card('ALEVÍ A i B').locator('button[data-act=rotRedoSub]').click();
    assert.ok((await answer('keep')).includes('Mantén els equips que has mogut a mà'));
    await toastHas('Grups refets'); assert.deepEqual(await placeOf(ids), want, 'Torna a fer els grups');
    // «Reequilibra» (no proposa ajuntar-les, ni fer fora les altres)
    await clearToasts();
    await card('ALEVÍ A i B').locator('.card-head button[data-act=rotBalance]').click(); await page.waitForTimeout(250);
    if (await page.evaluate(() => $('#dlg').open)) { assert.ok(!(await page.locator('#dlg').textContent()).includes('C.G. Lleida · Aleví B')); await page.click('#dlg button.primary'); await toastHas('Reequilibrada'); }
    assert.deepEqual(await placeOf(ids), want, 'Reequilibra');
    // «Com es fan els grups…» → «Desa»
    await clearToasts();
    await page.evaluate(() => actions.rotOptsDlg()); await page.click('#dlg button.primary'); await toastHas('Desat: grups refets');
    assert.deepEqual(await placeOf(ids), want, 'Com es fan els grups');
    // «Nombre de grups…»: 4, i tornar a 3
    for (const k of ['4', '3']) { await clearToasts(); await page.evaluate(([s, k]) => actions.rotSetK({ dataset: { s, k } }), [s4, k]); await toastHas(`Ara hi ha ${k} grups`); assert.deepEqual(await placeOf(ids), want, 'Nombre de grups ' + k); }
    // «Torna-les a fer de zero» → «Mantén…»
    await clearToasts();
    await page.click('.toolbar .menu button[data-act=menuToggle]'); await page.click('.menu.open button[data-act=rotRedoAll]');
    await answer('keep'); await toastHas('Grups refets a totes les subdivisions');
    assert.deepEqual(await placeOf(ids), want, 'Torna-les a fer de zero');
    // tornar a obrir l'app
    await page.waitForTimeout(400); await page.reload(); await page.waitForSelector('.card.rot-sub');
    assert.deepEqual(await placeOf(ids), want, 'després de tornar a obrir');
    // «Ajunta-les»: totes al grup on n'hi ha més, fixades
    await clearToasts();
    await card('ALEVÍ A i B').locator('.chip', { hasText: 'repartit a mà' }).locator('button[data-act=rotJoinSplit]').click();
    await toastHas('C.G. Lleida: totes al Grup');
    assert.deepEqual(await placeOf(ids), ids.map(() => `4a/G${g0 + 1}📌`));
    assert.equal(errors.length, 0, errors.join('\n'));
  });

  await step('moure-ho tot (2a): un empat (2 de les 4 a un altre grup) i 2 gimnastes d’un equip a dos grups d’una altra subdivisió: «Mantén…» les deixa on són', async () => {
    await fresh(); await make(); await clearToasts();
    const s3 = await subId(2), s4 = await subId(3), ids = await unitIds('ALEVÍ A i B', 'C.G. Lleida 2', 'Aleví B');
    assert.equal(ids.length, 4);
    const g0 = await gOf(ids[0]), tg = g0 === 0 ? 2 : 0;
    await mouDlg(unitIn('ALEVÍ A i B', 'C.G. Lleida 2', 'Aleví B'), s4, tg, ids.slice(0, 2));
    await page.click('#dlg button.primary'); await toastHas('2 gimnastes de C.G. Lleida 2 → Grup');
    const want = ids.map((id, i) => `4a/G${(i < 2 ? tg : g0) + 1}📌`);
    assert.deepEqual(await placeOf(ids), want);
    await clearToasts();
    await card('ALEVÍ A i B').locator('button[data-act=menuToggle]').click(); await card('ALEVÍ A i B').locator('button[data-act=rotRedoSub]').click();
    await answer('keep'); await toastHas('Grups refets');
    assert.deepEqual(await placeOf(ids), want, 'empat: cada tros on era');
    // una de C.G. Lleida (Aleví B) al Grup 1 de la 3a, i una altra al Grup 3
    const i5 = await unitIds('ALEVÍ A i B', 'C.G. Lleida', 'Aleví B');
    for (const [i, g] of [[0, 0], [1, 2]]) {
      await clearToasts();
      await mouDlg(unitIn('ALEVÍ A i B', 'C.G. Lleida', 'Aleví B'), s3, g, [i5[i]]);
      await page.click('#dlg button.primary'); await toastHas('→ 3a subdivisió');
    }
    assert.deepEqual(await placeOf(i5.slice(0, 2)), ['3a/G1📌(x)', '3a/G3📌(x)']);
    await clearToasts();
    await card('BENJAMÍ B').locator('button[data-act=menuToggle]').click(); await card('BENJAMÍ B').locator('button[data-act=rotRedoSub]').click();
    assert.ok((await answer('keep')).includes('Mantén els equips que has mogut a mà (📌 1)'));
    await toastHas('Grups refets');
    assert.deepEqual(await placeOf(i5.slice(0, 2)), ['3a/G1📌(x)', '3a/G3📌(x)']);
    // (i el 📌 a cada una, al seu grup)
    assert.equal(await card('BENJAMÍ B').locator('.rot-u', { hasText: 'C.G. Lleida' }).filter({ hasText: '· Aleví B' }).locator('summary', { hasText: '📌' }).count(), 2);
    assert.equal(errors.length, 0, errors.join('\n'));
  });

  await step('moure-ho tot (2a): un equip portat a una altra subdivisió amb els de la seva entitat: si «Reequilibra» no millora res, no ho diu ni ho ofereix, i no fa fora les altres del grup', async () => {
    await fresh(); await make(); await clearToasts();
    const s3 = await subId(2);
    assert.equal((await view())[2].sizes, '10/9/10');
    await unitIn(/^2a subdivisió · BENJAMÍ A/, 'C.G. Lleida 2', null).locator('select[data-chg=rotMove]').selectOption(`${s3}|1`);
    const t = await (await toastHas('C.G. Lleida 2 → 3a subdivisió')).textContent();
    assert.ok(!t.includes('Reequilibra'), t);
    assert.equal((await view())[2].sizes, '10/15/10');
    const c3 = (await card('BENJAMÍ B').textContent()).replace(/\s+/g, ' ');
    assert.ok(!c3.includes('Es pot repartir més bé') && !c3.includes('Es poden separar') && !c3.includes('Es poden ajuntar'), c3);
    await clearToasts();
    await card('BENJAMÍ B').locator('.card-head button[data-act=rotBalance]').click();
    await toastHas('Ja està tan equilibrada');
    // «Torna a fer els grups» → «Mantén…»: la portada es queda al Grup 2 amb altres de Benjamí B, i els grups no queden més desiguals
    await clearToasts();
    await card('BENJAMÍ B').locator('button[data-act=menuToggle]').click(); await card('BENJAMÍ B').locator('button[data-act=rotRedoSub]').click();
    await answer('keep'); await toastHas('Grups refets');
    const s = (await view())[2].sizes.split('/').map(Number);
    assert.ok(Math.max(...s) <= 15 && Math.max(...s) - Math.min(...s) <= 5, s.join('/'));
    assert.ok(await page.evaluate(s3 => { const sv = rotViewOf(curComp()).subs.find(x => x.id === s3), u = sv.units.find(x => x.guest); return u.g === 1 && u.pinned && sv.groups[1].units.some(x => !x.guest); }, s3));
    // en el mateix grup que la seva, després de moure una sola gimnasta, «Reequilibra la resta» surt si millora
    await clearToasts();
    await unitIn(/^2a subdivisió · BENJAMÍ A/, 'INEF Lleida', null).locator('select[data-chg=rotMove]').selectOption(String(await page.evaluate(() => (rotViewOf(curComp()).subs[1].units.find(u => u.clubId === 'INEF').g + 1) % 3)));
    const t2 = await (await toastHas('INEF Lleida → Grup')).textContent();
    const useful = await page.evaluate(() => { const c = curComp(), sv = rotViewOf(c).subs[1]; return rotBalance(c, sv).useful; });
    assert.equal(t2.includes('Reequilibra la resta'), useful, t2);
    assert.equal(errors.length, 0, errors.join('\n'));
  });

  await step('moure-ho tot (2a): una subdivisió que es queda sense gimnastes: ↑ ↓ hi passen per sobre, el quadre de categories la numera com la pantalla, i a Notes les seves NP no tenen un «0a subdivisió»', async () => {
    await fresh(fixture()); await make(); await clearToasts();
    const cad = (await view()).find(s => s.label.startsWith('CADET'));
    await unitIn('JUVENIL', 'Mas Puig, Aina · C.G. Lleida', null).locator('select[data-chg=rotMove]').selectOption(`${cad.id}|1`);
    await toastHas('→ 6a subdivisió'); await clearToasts();
    assert.deepEqual((await view()).filter(s => s.idx >= 5 || !s.idx).map(s => `${s.idx}·${s.label}`), ['5·INFANTIL A i B', '6·CADET A i B', '0·JUVENIL', '7·MASCULINA']);
    // «Quines categories van juntes…»: els números i les gimnastes que hi competeixen, com a la pantalla
    await page.click('button[data-act=rotSubsDlg] >> visible=true'); await page.waitForSelector('#dlg[open] form[data-form=rotSubs]');
    const list = await page.$$eval('#dlg .rot-dlist li', l => l.map(x => x.innerText.replace(/\s+/g, ' ').trim()));
    assert.ok(list[5].startsWith('6a · CADET A i B · 8 gimnastes (1 portada d’una altra)'), list[5]);
    assert.ok(list[6].startsWith('Sense gimnastes · JUVENIL · cap gimnasta (1 portada a una altra)') && !list[6].includes('Ajunta-la'), list[6]);
    assert.ok(list[7].startsWith('7a · MASCULINA · 6 gimnastes'), list[7]);
    const adv = await page.$$eval('#dlg select[data-chg=rotDraftKey] option', l => [...new Set(l.map(o => o.textContent))]);
    assert.ok(adv.includes('Subdivisió sense gimnastes (JUVENIL)') && adv.includes('7a subdivisió') && !adv.includes('8a subdivisió'), adv.join(' | '));
    await page.click('#dlg button[data-act=closeDlg]');
    // ↓ a Cadet: passa per sobre de la de Juvenil (sense gimnastes) i va després de Masculina
    await card('CADET A i B').locator('button[data-act=rotSubMove][data-d="1"]').click();
    assert.ok((await toastTxt('ara és la')).includes('La 6a subdivisió ara és la 7a.'));
    await clearToasts();
    assert.deepEqual((await view()).filter(s => s.idx >= 5 || !s.idx).map(s => `${s.idx}·${s.label}`), ['5·INFANTIL A i B', '6·MASCULINA', '0·JUVENIL', '7·CADET A i B']);
    // ↓ a la de Juvenil (sense gimnastes): es diu pel nom, i després ja és l'última
    await card(/· JUVENIL$/).locator('button[data-act=rotSubMove][data-d="1"]').click();
    assert.ok((await toastTxt('ara va')).includes('La subdivisió de JUVENIL (sense gimnastes) ara va després de la 7a.'));
    await clearToasts();
    assert.ok(await card(/· JUVENIL$/).locator('button[data-act=rotSubMove][data-d="1"]').isDisabled());
    assert.ok(await card('CADET A i B').locator('button[data-act=rotSubMove][data-d="1"]').isDisabled(), 'després només hi ha la de Juvenil, sense gimnastes');
    // Notes: Cadet A (1) no hi va (NP) i les de Cadet B, a la d'Infantil: la subdivisió de Cadet es queda sense ningú que competeixi
    await fresh(fixture()); await make(); await clearToasts();
    const r = await page.evaluate(() => {
      const c = curComp(); let v = rotViewOf(c);
      const cad = v.subs.find(s => s.label.startsWith('CADET')), inf = v.subs.find(s => s.label.startsWith('INFANTIL'));
      const a = c.entries.find(e => e.category === 'Cadet' && e.level === 'A');
      changes.entryStatus({ dataset: { id: a.id }, value: 'np' });
      for (const u of rotViewOf(c).subs.find(s => s.id === cad.id).units.filter(u => u.key.endsWith('B'))) { v = rotViewOf(c); const sv = v.subs.find(s => s.id === cad.id), uu = sv.units.find(x => x.id === u.id); rotMoveDo(c, v, sv, uu, uu.entries, inf.id, 0, rotUnitName(uu)); }
      v = rotViewOf(c);
      const g = groupsOf(c).find(x => x.key === groupKeyOf(a)), sal = c.apparatus.find(x => x.id === 'salt') || c.apparatus[0];
      return { idx: v.subs.find(s => s.id === cad.id).idx, blocks: judgeBlocks(c, g, sal, undefined, true).map(b => [b.title, b.list.length]) };
    });
    assert.equal(r.idx, 0);
    assert.deepEqual(r.blocks, [['', 1]], JSON.stringify(r.blocks));
    assert.equal(errors.length, 0, errors.join('\n'));
  });

  await step('moure-ho tot (2a): «Ajunta-les aquí» diu qui torna, i l’avís d’imprimir diu «les individuals de La Salle Reus repartides»', async () => {
    await fresh(); await make(); await clearToasts();
    const s4 = await subId(3), s5 = await subId(4), ids = await unitIds('ALEVÍ A i B', 'La Salle Reus · 2 individuals', 'Aleví B');
    const moved = (await page.evaluate(() => sortEntries(rotViewOf(curComp()).subs[3].units.find(u => rotUnitName(u) === 'La Salle Reus · 2 individuals').entries).map(e => e.id)))[0];
    const stays = ids.find(id => id !== moved), mvName = await nameOf(moved);
    await mouDlg(unitIn('ALEVÍ A i B', 'La Salle Reus · 2 individuals', null), s5, 1, [moved]);
    await page.click('#dlg button.primary'); await toastHas(`${mvName} → 5a subdivisió`); await clearToasts();
    assert.ok((await printWarn('')).includes('4a i 5a: les individuals de La Salle Reus repartides en 2 subdivisions'));
    // «Ajunta-les aquí» a la 4a: torna la que s'havia mogut (no l'altra)
    await clearToasts();
    await card('ALEVÍ A i B').locator('button[data-act=rotJoinX]').click();
    const t = await toastTxt(`${mvName} → 4a subdivisió`);
    assert.ok(t.includes('Ha tornat a la seva subdivisió.') && t.includes('Les individuals de La Salle Reus tornen a estar juntes.') && !t.includes(await nameOf(stays)), t);
    assert.deepEqual((await placeOf([moved, stays])).map(x => x.split('/')[0]), ['4a', '4a']);
    // a un altre grup de la 4a: «repartides a mà», i en imprimir, «repartides en 2 grups»
    await clearToasts();
    const g = await gOf(stays), tg = g === 2 ? 0 : 2;
    await mouDlg(unitIn('ALEVÍ A i B', 'La Salle Reus · 2 individuals', null), s4, tg, [moved]);
    await page.click('#dlg button.primary'); await toastHas(`${mvName} → Grup`); await clearToasts();
    const chip = (await card('ALEVÍ A i B').locator('.chip', { hasText: 'La Salle Reus' }).textContent()).replace(/\s+/g, ' ');
    assert.ok(chip.includes('Les individuals de La Salle Reus estan repartides a mà: 1 al Grup') && chip.includes('Ajunta-les'), chip);
    assert.ok((await printWarn('')).includes('4a: les individuals de La Salle Reus repartides en 2 grups'));
    assert.equal(errors.length, 0, errors.join('\n'));
  });

  await step('moure-ho tot (2a): als nois, l’avís de les entrenadores diu «Ajunta’ls»; i si l’hora no canvia, «Continua competint a les…»', async () => {
    await fresh(); await make(); await clearToasts();
    await page.click('button[data-act=rotCoachDlg] >> visible=true'); await page.fill('#dlg input[name=c_CGL]', '1'); await page.click('#dlg button.primary');
    await toastHas('surt en');
    const chip = await card('MASCULINA').locator('.chip', { hasText: 'entrenadora' }).textContent();
    assert.ok(chip.includes('Ajunta’ls') && !chip.includes('Ajunta-les'), chip);
    assert.deepEqual(await page.evaluate(() => { const v = rotViewOf(curComp()); return [rotJoinLbl(v.subs.find(s => s.g === 'M'), 'CGL'), rotJoinLbl(v.subs[3], 'CGL')]; }), ['Ajunta’ls', 'Ajunta-les']);
    await page.click('button[data-act=rotCoachDlg] >> visible=true'); await page.fill('#dlg input[name=c_CGL]', ''); await page.click('#dlg button.primary');
    await toastHas('Entrenadores desades'); await clearToasts();
    // els nois separats: el de Benjamí, a la d'Aleví (la seva es queda sense gimnastes i la d'Aleví comença abans)
    await page.click('button[data-act=rotSubsDlg] >> visible=true'); await page.waitForSelector('#dlg[open] form[data-form=rotSubs]');
    await page.uncheck('#dlg input[data-chg=rotDraftAllM]'); await page.click('#dlg button.primary'); await toastHas('Desat'); await clearToasts();
    const M = await page.evaluate(() => rotViewOf(curComp()).subs.filter(s => s.g === 'M').map(s => ({ id: s.id, label: s.label, idx: s.idx })));
    const bj = M.find(s => s.label.endsWith('– BENJAMÍ')), al = M.find(s => s.label.endsWith('– ALEVÍ'));
    await mouDlg(card(bj.label).locator('.rot-u').first(), al.id, 0);
    const what = (await page.locator('#rotMvWhat').innerText()).replace(/\s+/g, ' ');
    const m = /Continuarà competint a les (\d+:\d+) \((\d+)a subdivisió, que ara comença a les (\d+:\d+)\)\./.exec(what);
    assert.ok(m && m[1] !== m[3] && +m[2] === al.idx, what);
    assert.ok(!/de les (\d+:\d+) .* a les \1 /.test(what), what);
    await page.click('#dlg button.primary');
    const t = await toastTxt('→ ');
    assert.ok(/Continua competint a les \d+:\d+\./.test(t) && !t.includes('(abans, a les'), t);
    assert.equal(errors.length, 0, errors.join('\n'));
  });

  await step('moure-ho tot (2a): uns minuts de premis posats a mà en una subdivisió que es queda sense premis: es diu al diàleg, en moure, a les dues pestanyes i en imprimir l’horari', async () => {
    await fresh(); await make(); await clearToasts();
    const s2 = await subId(1), s3 = await subId(2);
    await page.click('button[data-act=rotSeg][data-v=horari]');
    const inp = `input[data-chg=rotSubField][data-s="${s2}"][data-k=awards]`;
    await page.fill(inp, '5'); await page.press(inp, 'Tab'); await page.waitForTimeout(300); await clearToasts();
    await page.click('button[data-act=rotSeg][data-v=grups]'); await page.waitForSelector('.card.rot-sub');
    await mouDlg(unitIn(/^2a subdivisió · BENJAMÍ A/, 'C.G. Lleida 2', null), s3, 1);
    assert.ok((await page.locator('#rotMvWhat').innerText()).includes('La 2a subdivisió ja no donarà cap premi, però hi has posat 5′ de premis: si no calen, esborra’n els minuts a Horari.'));
    await page.click('#dlg button.primary');
    assert.ok((await toastTxt('C.G. Lleida 2 → 3a subdivisió')).includes('La 2a subdivisió ja no dona cap premi, però hi has posat 5′ de premis: si no calen, esborra’n els minuts a Horari.'));
    const note = 'La 2a subdivisió no dona cap premi, però hi has posat 5′ de premis (a l’horari surt «PREMIS» sol): si no calen, esborra’n els minuts a Horari.';
    assert.equal((await notes7()).filter(x => x.includes(note)).length, 1, (await notes7()).join(' || '));
    await page.click('button[data-act=rotSeg][data-v=horari]'); await page.waitForSelector('table.rot-hor');
    assert.equal((await notes7()).filter(x => x.includes(note)).length, 1);
    await clearToasts();
    assert.ok((await printWarn('horari')).includes('2a: 5′ de premis, però no hi ha cap categoria per premiar'));
    // sense els minuts, ja no es diu
    await page.fill(inp, ''); await page.press(inp, 'Tab'); await page.waitForTimeout(300);
    await page.click('button[data-act=rotSeg][data-v=grups]'); await page.waitForSelector('.card.rot-sub');
    assert.equal((await notes7()).filter(x => x.includes('no dona cap premi')).length, 0);
    assert.equal(errors.length, 0, errors.join('\n'));
  });

  await step('moure-ho tot (2a): al mòbil, després de portar un equip a una altra subdivisió, la pantalla hi va i el focus segueix l’equip; Desfés hi torna', async () => {
    await fresh(); await make(); await clearToasts();
    await page.setViewportSize({ width: 360, height: 740 }); await page.evaluate(() => render());
    const s2 = await subId(1), s3 = await subId(2);
    await page.selectOption('#main .gsel select', s2); await page.waitForFunction(() => $('.card.rot-sub h3').textContent.startsWith('2a subdivisió · BENJAMÍ A'));
    const b = unitIn(/^2a subdivisió · BENJAMÍ A/, 'C.G. Lleida 2', null).locator('button[data-act=rotMoveDlg]');
    await b.focus(); await page.keyboard.press('Enter'); await page.waitForSelector('#dlg[open] form[data-form=rotMoveDo]');
    await page.check(`#dlg input[name=to][value="${s3}|1"]`); await page.waitForSelector('#rotMvWhat');
    await page.locator('#dlg button.primary').focus(); await page.keyboard.press('Enter'); await toastHas('C.G. Lleida 2 → 3a subdivisió');
    const f = await page.evaluate(() => { const a = document.activeElement; return a === document.body ? 'BODY' : `${a.dataset.act}|${a.dataset.s}|${a.closest('.rot-sub') ? a.closest('.rot-sub').querySelector('h3').textContent : ''}`; });
    assert.ok(f.startsWith(`rotMoveDlg|${s3}|3a subdivisió · BENJAMÍ B`), f);
    await page.locator('.toast button', { hasText: 'Desfés' }).first().click(); await toastHas('Desfet');
    assert.equal(await page.evaluate(() => ui.rotSub), s2);
    await page.setViewportSize({ width: 1366, height: 900 }); await page.evaluate(() => render());
    assert.equal(errors.length, 0, errors.join('\n'));
  });
} finally {
  await browser.close();
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('\nRotacions i horari correctes.');
