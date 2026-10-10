// Proves dels arreglos de la revisió: fitxa, importació, inscripció, equips, D + E, «Grup següent»,
// nivells repetits, curs de la competició i mida de pantalla de les tauletes. Obre l'app des del disc.
//   node tests/e2e-revisio.mjs            (cal Playwright)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fixture } from './fixture-rotacions.mjs';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(path.join(execSync('npm root -g').toString().trim(), 'playwright')); }

const here = path.dirname(fileURLToPath(import.meta.url));
const url = pathToFileURL(path.join(here, '..', 'index.html')).href;
const d0 = new Date(), pad = n => String(n).padStart(2, '0');
const today = `${d0.getFullYear()}-${pad(d0.getMonth() + 1)}-${pad(d0.getDate())}`;

// dades de partida: CG Lleida (4 Aleví A, equip de 3 + 1 sense) i Escola Pardinyes (3 Aleví A, equip), 3 Benjamí A
const G = (id, name, clubId, category = 'Aleví', level = 'A') => ({ id, name, surname: 'Prova', clubId, gender: 'F', category, level, birthYear: '', notes: '', archived: false });
const E = (id, g, bib, teamId, scores = {}) => ({ id, gymnastId: g.id, clubId: g.clubId, gender: 'F', category: g.category, level: g.level, bib, teamId, status: '', scores });
const gyms = [G('g1', 'Anna', 'c1'), G('g2', 'Berta', 'c1'), G('g3', 'Carla', 'c1'), G('g4', 'Dana', 'c1'),
  G('g5', 'Elna', 'c2'), G('g6', 'Fiona', 'c2'), G('g7', 'Gina', 'c2'),
  G('b1', 'Ona', 'c1', 'Benjamí'), G('b2', 'Pia', 'c1', 'Benjamí'), G('b3', 'Rut', 'c1', 'Benjamí'),
  G('z1', 'Zoe', 'c1', 'Aleví', 'NIVELL A')];
const by = id => gyms.find(g => g.id === id);
const s = v => ({ salt: [{ v, at: 1 }] });
const seed = {
  app: 'notesgim', version: 1,
  settings: { org: 'PROVA', levels: ['A', 'B', 'NIVELL A'], rev: 4 },
  clubs: [{ id: 'c1', name: 'CG Lleida' }, { id: 'c2', name: 'Escola Pardinyes' }],
  gymnasts: gyms,
  teams: [
    { id: 'T1', name: 'CG Lleida', clubId: 'c1', gender: 'F', category: 'Aleví', level: 'A', memberIds: ['g1', 'g2', 'g3'] },
    { id: 'T2', name: 'Escola Pardinyes', clubId: 'c2', gender: 'F', category: 'Aleví', level: 'A', memberIds: ['g5', 'g6', 'g7'] },
  ],
  competitions: [
    { id: 'k1', name: 'Jornada avui', date: today, place: 'Lleida', season: '', locked: false, autoTeams: true,
      teams: [
        { id: 'ct1', name: 'CG Lleida', clubId: 'c1', gender: 'F', category: 'Aleví', level: 'A', sourceTeamId: 'T1', auto: true },
        { id: 'ct2', name: 'Escola Pardinyes', clubId: 'c2', gender: 'F', category: 'Aleví', level: 'A', sourceTeamId: 'T2', auto: true }],
      entries: [E('e1', by('g1'), 1, 'ct1', s(8)), E('e2', by('g2'), 2, 'ct1', s(8.2)), E('e3', by('g3'), 3, 'ct1', s(8.4)), E('e4', by('g4'), 4, null, s(8.6)),
        E('e5', by('g5'), 5, 'ct2', s(8.1)), E('e6', by('g6'), 6, 'ct2', s(8.3)), E('e7', by('g7'), 7, 'ct2', s(8.5)),
        E('e8', by('b1'), 8, null), E('e9', by('b2'), 9, null), E('e10', by('b3'), 10, null)] },
    { id: 'k2', name: 'Jornada D+E', date: today, place: 'Lleida', season: '', locked: false, scoring: 'detailed', teams: [],
      entries: [E('f1', by('g1'), 1, null), E('f2', by('g2'), 2, null)] },
    { id: 'k3', name: 'Jornada estiu', date: '2027-08-20', place: 'Lleida', season: '2026-2027', locked: false, teams: [], entries: [] },
  ],
  meta: { created: new Date().toISOString(), updated: new Date().toISOString(), dbId: 'proves' },
};

const browser = await playwright.chromium.launch();
const errors = [];
const step = async (name, fn) => { process.stdout.write(`· ${name} … `); await fn(); console.log('ok'); };
try {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ca-ES' });
  await ctx.addInitScript(r => { if (!localStorage.getItem('notesgim.db')) localStorage.setItem('notesgim.db', r); }, JSON.stringify(seed));
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const data = () => page.evaluate(() => JSON.parse(JSON.stringify(db)));
  const comp = async id => (await data()).competitions.find(c => c.id === id);
  await page.goto(url + '#/gimnastes');
  await page.waitForSelector('#gymtable');

  await step('la fitxa no es desa sense categoria o nivell (si no, competiria sola en un grup a part)', async () => {
    const n = (await data()).gymnasts.length;
    await page.click('button[data-act=newGym]');
    await page.fill('#dlg input[name=name]', 'Sense Nivell');
    await page.selectOption('#dlg select[name=category]', 'Aleví');
    await page.click('#dlg button.primary');
    assert.ok(await page.locator('#dlg[open]').count(), 'el navegador no l’ha de deixar desar');
    // i encara que el navegador la deixés passar, l'app tampoc
    await page.evaluate(() => document.querySelectorAll('#dlg select').forEach(s => s.removeAttribute('required')));
    await page.click('#dlg button.primary');
    await page.waitForSelector('.toast:has-text("Tria la categoria i el nivell")');
    assert.equal((await data()).gymnasts.length, n);
    await page.click('#dlg button[data-act=closeDlg]');
  });

  await step('Excel: «Nivell A» és el nivell A, i l’equip «A» de dues entitats són dos equips', async () => {
    await page.click('button[data-act=importGyms]');
    const rows = [['Nom', 'Cognoms', 'Entitat', 'Gènere', 'Categoria', 'Nivell', 'Equip'],
      ...['Ia', 'Ib', 'Ic'].map(n => [n, 'Lleida', 'CG Lleida', 'F', 'Infantil', 'Nivell A', 'A']),
      ...['Pa', 'Pb', 'Pc'].map(n => [n, 'Pardinyes', 'Escola Pardinyes', 'F', 'Infantil', 'Nivel A', 'A'])];
    await page.fill('#imptext', rows.map(r => r.join('\t')).join('\n'));
    await page.click('button[data-act=impAnalyze]');
    await page.waitForSelector('text=6 fitxes noves');
    await page.click('button[data-act=impDo]');
    await page.waitForSelector('#gymtable >> text=Pc');
    const d = await data();
    assert.deepEqual(d.settings.levels, ['A', 'B', 'NIVELL A']);
    assert.ok(d.gymnasts.filter(g => g.category === 'Infantil').every(g => g.level === 'A'));
    const teams = d.teams.filter(t => t.name === 'A');
    assert.equal(teams.length, 2);
    assert.deepEqual(teams.map(t => [d.clubs.find(c => c.id === t.clubId).name, t.memberIds.length]).sort(), [['CG Lleida', 3], ['Escola Pardinyes', 3]]);
  });

  await step('Excel: «Cognom 1» i «Cognom 2» s’ajunten, i «Nois» / «Masculina» són nois', async () => {
    await page.goto(url + '#/gimnastes');
    await page.click('button[data-act=importGyms]');
    const rows = [['Nom', 'Cognom 1', 'Cognom 2', 'Entitat', 'Sexe', 'Categoria', 'Nivell'],
      ['Laia', 'Garcia', 'Puig', 'CG Lleida', 'Femenina', 'Cadet', 'A'], ['Laia', 'Garcia', 'Roca', 'CG Lleida', 'Noies', 'Cadet', 'A'],
      ['Pol', 'Serra', 'Mir', 'CG Lleida', 'Nois', 'Cadet', 'A'], ['Jan', 'Pla', 'Coll', 'CG Lleida', 'Masculina', 'Cadet', 'A'],
      ['Ot', 'Vila', 'Gil', 'CG Lleida', 'xyz', 'Cadet', 'A']];
    await page.fill('#imptext', rows.map(r => r.join('\t')).join('\n'));
    await page.click('button[data-act=impAnalyze]');
    await page.waitForSelector('text=5 fitxes noves');
    assert.ok((await page.locator('#dlg').textContent()).includes('un gènere que no s’entén'));
    // tornar a enganxar sense analitzar: no s'importa l'anàlisi d'abans
    await page.fill('#imptext', 'Nom\tCognoms\nX\tY');
    assert.ok(await page.locator('#dlg button[data-act=impDo]').isDisabled());
    await page.fill('#imptext', rows.map(r => r.join('\t')).join('\n'));
    await page.click('button[data-act=impAnalyze]');
    await page.waitForSelector('text=5 fitxes noves');
    await page.click('button[data-act=impDo]');
    await page.waitForSelector('#gymtable >> text=Roca');
    const d = await data(), by = n => d.gymnasts.find(g => g.name + ' ' + g.surname === n);
    assert.ok(by('Laia Garcia Puig') && by('Laia Garcia Roca'));
    assert.deepEqual(['Laia Garcia Puig', 'Laia Garcia Roca', 'Pol Serra Mir', 'Jan Pla Coll'].map(n => by(n).gender), ['F', 'F', 'M', 'M']);
  });

  await step('dos nivells que són el mateix («NIVELL A» i «A») es poden ajuntar', async () => {
    await page.goto(url + '#/configuracio');
    const inp = page.locator('input[data-chg=listRename][data-key=levels]').nth(2);
    assert.equal(await inp.inputValue(), 'NIVELL A');
    await inp.fill('A'); await inp.press('Tab');
    await page.waitForSelector('#confirm[open] >> text=Vols ajuntar-hi');
    await page.click('#confirm button[value=ok]');
    await page.waitForSelector('.toast:has-text("s’ha ajuntat")');
    const d = await data();
    assert.deepEqual(d.settings.levels, ['A', 'B']);
    assert.equal(d.gymnasts.find(g => g.id === 'z1').level, 'A');
  });

  await step('«＋ Gimnasta nova» des de «Inscriu gimnastes» torna a la llista amb les marcades', async () => {
    await page.goto(url + '#/competicio/k1/inscripcions');
    await page.click('button[data-act=enrollGyms]');
    await page.check('#dlg input[name=g][value=z1]');
    const ia = (await data()).gymnasts.find(g => g.name === 'Ia');
    await page.check(`#dlg input[name=g][value=${ia.id}]`);
    await page.click('#dlg button[data-act=newGymHere]');
    await page.waitForSelector('#dlg >> text=Afegeix gimnasta');
    await page.fill('#dlg input[name=name]', 'Nova');
    await page.fill('#dlg input[name=club]', 'CG Lleida');
    await page.selectOption('#dlg select[name=category]', 'Aleví');
    await page.selectOption('#dlg select[name=level]', 'A');
    await page.click('#dlg button.primary');
    await page.waitForSelector('#dlg >> text=Inscriu gimnastes');
    const checked = await page.locator('#dlg input[name=g]:checked').evaluateAll(l => l.map(i => i.value));
    assert.deepEqual(checked.sort(), [ia.id, 'z1'].sort());
    const nova = (await data()).gymnasts.find(g => g.name === 'Nova');
    assert.ok((await comp('k1')).entries.some(e => e.gymnastId === nova.id), 'la nova ja hi és inscrita');
    await page.click('#dlg button.primary');
    await page.waitForTimeout(200);
    const c = await comp('k1');
    assert.ok(c.entries.some(e => e.gymnastId === 'z1') && c.entries.some(e => e.gymnastId === ia.id));
  });

  await step('canviar el nom d’un equip a «Equips» no desfà el canvi d’equip del mateix dia', async () => {
    await page.goto(url + '#/competicio/k1/inscripcions');
    await page.selectOption('select[data-chg=entryTeam][data-id=e1]', '');
    await page.waitForTimeout(150);
    assert.equal((await comp('k1')).entries.find(e => e.id === 'e1').teamId, null);
    await page.goto(url + '#/equips');
    await page.click('a[data-act=editTeam][data-id=T1]');
    await page.fill('#dlg input[name=name]', 'CG Lleida A');
    await page.click('#dlg button.primary');
    await page.waitForTimeout(150);
    const c = await comp('k1');
    assert.equal(c.entries.find(e => e.id === 'e1').teamId, null, 'l’Anna continua individual aquell dia');
    const ct = c.teams.find(t => t.sourceTeamId === 'T1');
    assert.equal(ct.name, 'CG Lleida A');
    assert.deepEqual(c.entries.filter(e => e.teamId === ct.id).map(e => e.id).sort().filter(id => ['e2', 'e3'].includes(id)), ['e2', 'e3']);
  });

  await step('«＋ Equip» amb el nom d’un equip que ja hi és: s’hi afegeix, no en treu ningú', async () => {
    await page.goto(url + '#/competicio/k1/inscripcions');
    const before = (await comp('k1')).entries.filter(e => e.teamId === 'ct1').map(e => e.id);
    await page.locator('.ins-group', { hasText: 'Aleví' }).first().locator('button[data-act=newCompTeam]').click();
    await page.fill('#dlg input[name=name]', 'CG Lleida A');
    await page.selectOption('#dlg select[name=clubId]', 'c1');
    await page.check('#dlg input[name=m][value=e4]');
    await page.click('#dlg button.primary');
    await page.waitForSelector('.toast:has-text("ja hi era")');
    const c = await comp('k1');
    const now = c.entries.filter(e => e.teamId === 'ct1').map(e => e.id);
    assert.ok(before.every(id => now.includes(id)) && now.includes('e4'), JSON.stringify({ before, now }));
    assert.ok((await data()).teams.find(t => t.id === 'T1').memberIds.includes('g4'));
  });

  await step('amb un sol aparell, al final de la columna es passa a l’aparell que falta i a una casella buida', async () => {
    await page.goto(url + '#/competicio/k1/notes');
    await page.waitForSelector('#scoregrid');
    const g = await page.evaluate(() => groupsOf(curComp()).find(x => x.category === 'Aleví').key);
    await page.evaluate(k => { ui.group = k; ui.app = 'salt'; render(); }, g);
    const last = page.locator('#scoregrid input.sc[data-a=salt]:not(:disabled)').last();
    await last.click(); await last.press('Enter');
    const t = page.locator('.toast', { hasText: 'Final d’Aleví' });
    await t.locator('button', { hasText: 'Ara Barra' }).click();
    const a = await page.evaluate(() => { const el = document.activeElement; return { a: el.dataset.a, f: el.dataset.f, v: el.value }; });
    assert.deepEqual(a, { a: 'barra', f: 'v', v: '' });
  });

  await step('D + E − Pen.: una nota que passa del màxim no es desa', async () => {
    await page.goto(url + '#/competicio/k2/notes');
    await page.waitForSelector('#scoregrid');
    await page.click('button[data-act=pickApp][data-a=salt]');
    const d = page.locator('#scoregrid input.sc[data-e=f1][data-a=salt][data-f=d]');
    await d.click(); await page.keyboard.type('4'); await page.keyboard.press('Tab');
    await page.keyboard.type('18'); await page.keyboard.press('Tab');
    await page.waitForSelector('.toast:has-text("passa del màxim")');
    const at = (await comp('k2')).entries.find(e => e.id === 'f1').scores.salt[0];
    assert.equal(at.d, 4); assert.equal(at.e, undefined); assert.ok(!(at.v > 20));
    // i una penalització més gran que D + E tampoc
    const e = page.locator('#scoregrid input.sc[data-e=f1][data-a=salt][data-f=e]');
    await e.click(); await e.fill('8'); await e.press('Tab');
    await page.keyboard.type('15'); await page.keyboard.press('Tab');
    await page.waitForSelector('.toast:has-text("més gran que D + E")');
    const at2 = (await comp('k2')).entries.find(x => x.id === 'f1').scores.salt[0];
    assert.equal(at2.v, 12); assert.ok(!at2.p);
    // la E rebutjada (D 12 + E 9 > 20) es desa sola quan es corregeix la D
    const d2 = page.locator('#scoregrid input.sc[data-e=f2][data-a=salt][data-f=d]');
    await d2.click(); await page.keyboard.type('12'); await page.keyboard.press('Tab');
    await page.keyboard.type('9'); await page.keyboard.press('Tab');
    await page.waitForSelector('.toast:has-text("D + E − Pen. = 21,00")');
    await d2.click(); await d2.fill('10'); await d2.press('Tab');
    await page.waitForTimeout(150);
    const at3 = (await comp('k2')).entries.find(x => x.id === 'f2').scores.salt[0];
    assert.deepEqual([at3.d, at3.e, at3.v], [10, 9, 19]);
    assert.equal(await page.locator('#scoregrid input.sc.invalid[data-e=f2]').count(), 0);
  });

  await step('canviar la data d’una competició a un altre curs també en canvia el curs', async () => {
    await page.goto(url + '#/competicio/k3/configuracio');
    await page.click('button[data-act=editComp]');
    await page.fill('#dlg input[name=date]', '2027-10-16');
    await page.click('#dlg button.primary');
    await page.waitForTimeout(150);
    assert.equal((await comp('k3')).season, '2027-2028');
  });

  await step('una tauleta girada amb el teclat obert no passa a la vista de mòbil; un mòbil girat, sí', async () => {
    for (const [w, h, phone] of [[1024, 450, false], [1280, 500, false], [844, 390, true], [740, 360, true]]) {
      await page.setViewportSize({ width: w, height: h });
      assert.equal(await page.evaluate(() => isPhone()), phone, `${w}x${h}`);
    }
    await page.setViewportSize({ width: 1366, height: 900 });
  });

  // (amb dades noves, com si fos el primer dia: les proves d'abans han canviat equips i nivells)
  const ctx2 = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ca-ES' });
  await ctx2.addInitScript(r => { if (!localStorage.getItem('notesgim.db')) localStorage.setItem('notesgim.db', r); }, JSON.stringify(seed));
  const pg = await ctx2.newPage();
  pg.on('pageerror', e => errors.push('pageerror: ' + e.message));
  const data2 = () => pg.evaluate(() => JSON.parse(JSON.stringify(db)));

  await step('fulls d’inscripció dels clubs (.xlsx del Consell): nivell A i B, equips i individuals', async () => {
    const fx = n => path.join(here, 'fixtures', n);
    await pg.goto(url + '#/gimnastes');
    await pg.click('button[data-act=inscOpen]');
    await pg.setInputFiles('#inscfile', [fx('inscripcio-nivell-A.xlsx'), fx('inscripcio-nivell-B.xlsx'), fx('inscripcio-buida.xlsx')]);
    await pg.waitForSelector('#dlg >> text=inscripcio-nivell-B.xlsx');
    const dlg = await pg.locator('#dlg').textContent();
    assert.ok(dlg.includes('no té cap esportista'), 'el model buit es diu');
    assert.ok(dlg.includes('en surten'), 'es diu qui surt d’un equip que ja hi era');
    // les de la fulla individual que podrien anar a l'equip del seu club: s'avisa (però no es canvia)
    assert.ok(dlg.includes('pot fer equip') && dlg.includes('poden formar part d’un equip de la seva entitat'), 'avís «pot fer equip»');
    // «C.G. LLEIDA» és l'entitat «CG Lleida» que ja hi ha; el nivell surt del full
    assert.equal(await pg.locator('#dlg select[data-chg=inscClub][data-f="0"]').inputValue(), 'c1');
    assert.equal(await pg.locator('#dlg select[data-chg=inscClub][data-f="1"]').inputValue(), 'c2');
    assert.equal(await pg.locator('#dlg select[data-chg=inscLevel][data-f="1"]').inputValue(), 'B');
    assert.ok(dlg.includes('Marta Soler Rius') && dlg.includes('600 111 222'), 'l’entrenadora');
    await pg.click('#dlg button[data-act=inscDo]');
    await pg.waitForSelector('.toast:has-text("Fulls d’inscripció importats")');
    const d = await data2();
    const by = (n, club) => d.gymnasts.find(g => gymKey(g) === n && g.clubId === club);
    const gymKey = g => g.name + ' ' + g.surname;
    // els noms en majúscules queden ben escrits; l'any surt fins i tot d'una data
    const maria = by('Maria Antònia D’Alòs i Col·lell'.replace('’', "'"), 'c1');
    // la de la fulla INDIVIDUAL queda com a individual (no s'inventa cap equip)
    assert.ok(maria && maria.birthYear === '2016' && maria.category === 'Aleví' && maria.level === 'A' && maria.noTeam, JSON.stringify(maria));
    assert.equal(by('Júlia Roca Mir', 'c1').birthYear, '2013');
    // el 2n cognom, a la segona casella del model
    assert.ok(by('Nora Vidal Roca', 'c1'), 'els dos cognoms');
    // l'Anna surt a la fulla individual i a l'EQUIP 1: és de l'equip (una sola fitxa)
    assert.equal(d.gymnasts.filter(g => gymKey(g) === 'Anna Serra' && g.clubId === 'c1').length, 1);
    const team = n => d.teams.find(t => t.clubId === 'c1' && t.name === n && t.category === 'Aleví' && t.level === 'A');
    const names = t => t.memberIds.map(id => d.gymnasts.find(g => g.id === id).name).sort();
    // l'equip «CG Lleida» ja hi era (amb altres gimnastes): ara és el del full
    assert.deepEqual(names(team('CG Lleida')), ['Anna', 'Berta', 'Carla', 'Dana']);
    assert.ok(team('CG Lleida').memberIds.every(id => d.gymnasts.find(g => g.id === id).surname !== 'Prova'));
    assert.deepEqual(names(team('CG Lleida 2')), ['Elna', 'Fiona', 'Gina']);
    assert.ok(d.teams.some(t => t.clubId === 'c1' && t.category === 'Benjamí' && t.level === 'A' && t.memberIds.length === 3));
    // nivell B, de l'altra entitat
    assert.ok(d.teams.some(t => t.clubId === 'c2' && t.name === 'Escola Pardinyes 2' && t.level === 'B' && t.memberIds.length === 3));
    assert.equal(by('Laia Garcia Puig', 'c2').level, 'B');
    assert.ok((d.clubs.find(c => c.id === 'c1').contacts || []).some(p => p.name === 'Marta Soler Rius' && p.email === 'marta@exemple.cat'));
  });

  await step('un full de nois (el nom del fitxer diu «masculina») es posa sol com a nois', async () => {
    await pg.goto(url + '#/gimnastes');
    await pg.click('button[data-act=inscOpen]');
    await pg.setInputFiles('#inscfile', [path.join(here, 'fixtures', 'inscripcio-masculina-A.xlsx')]);
    await pg.waitForSelector('#dlg >> text=inscripcio-masculina-A.xlsx');
    assert.equal(await pg.locator('#dlg select[data-chg=inscGender]').inputValue(), 'M');
    await pg.click('#dlg button[data-act=closeDlg]');
  });

  await step('des d’una competició, els fulls d’inscripció també hi inscriuen les gimnastes (amb el seu equip)', async () => {
    await pg.goto(url + '#/competicio/k1/inscripcions');
    await pg.click('button[data-act=inscOpen] >> visible=true');
    await pg.setInputFiles('#inscfile', [path.join(here, 'fixtures', 'inscripcio-nivell-A.xlsx')]);
    await pg.waitForSelector('#dlg >> text=ja hi és');
    assert.equal(await pg.locator('#insccomp').inputValue(), 'k1', 'la competició on s’ha obert');
    await pg.click('#dlg button[data-act=inscDo]');
    await pg.waitForSelector('.toast:has-text("a Jornada avui:")');
    const d = await data2(), c = d.competitions.find(x => x.id === 'k1');
    const e = n => c.entries.find(x => { const g = d.gymnasts.find(y => y.id === x.gymnastId); return g && g.name + ' ' + g.surname === n && g.clubId === 'c1'; });
    const tname = x => (c.teams.find(t => t.id === x.teamId) || {}).name || null;
    assert.equal(tname(e('Elna Font')), 'CG Lleida 2');
    assert.equal(tname(e('Laia Garcia Puig')), null, 'la de la fulla individual, sense equip');
    // a Inscripcions també surt l'avís
    await pg.waitForSelector('tr:has-text("Laia Garcia Puig") .badge:has-text("pot fer equip")');
    assert.ok(e('Ona Bosch') && e('Ona Bosch').category === 'Benjamí');
  });

  await step('fulls com els escriu cada club: «EQUIP Nº 1», cognoms «Anyó», el 2n cognom en una sola fulla, apòstrofs, dues nenes amb el mateix nom i els equips en un altre fitxer', async () => {
    const fx = n => path.join(here, 'fixtures', n);
    await pg.goto(url + '#/competicio/k1/inscripcions');
    await pg.click('button[data-act=inscOpen] >> visible=true');
    await pg.setInputFiles('#inscfile', [fx('inscripcio-variants-equips.xlsx'), fx('inscripcio-variants-individual.xlsx')]);
    await pg.waitForSelector('#dlg >> text=inscripcio-variants-individual.xlsx');
    await pg.click('#dlg button[data-act=inscDo]');
    await pg.waitForSelector('.toast:has-text("Fulls d’inscripció importats")');
    const d = await data2(), club = d.clubs.find(x => x.name === 'Club Variants'), c = d.competitions.find(x => x.id === 'k1');
    const gyms = d.gymnasts.filter(g => g.clubId === club.id), nm = g => g.name + ' ' + g.surname;
    assert.deepEqual(gyms.map(nm).sort(), ['Anna Serra', 'Clara D\'Alòs', 'Elna Font', 'Fiona Anyó', 'Helena Pons', 'Laia Puig Soler', 'Laia Vidal', 'Laia Vidal', 'Marta Anyes', 'Núria Anyó Puig', 'Ona Bosch', 'Pia Cano'].sort(), 'una fitxa per gimnasta (i dues Laia Vidal, de dos anys diferents)');
    const team = (cat, n) => { const t = c.teams.find(x => x.clubId === club.id && x.category === cat && x.name === n); return t ? c.entries.filter(e => e.teamId === t.id).map(e => nm(d.gymnasts.find(g => g.id === e.gymnastId))).sort() : null; };
    assert.deepEqual(team('Aleví', 'Club Variants'), ['Anna Serra', 'Fiona Anyó', 'Laia Puig Soler', 'Laia Vidal']);
    assert.deepEqual(team('Aleví', 'Club Variants 2'), ['Clara D\'Alòs', 'Elna Font', 'Marta Anyes']);
    assert.deepEqual(team('Benjamí', 'Club Variants'), ['Laia Vidal', 'Ona Bosch', 'Pia Cano']);
    const ind = c.entries.filter(e => e.clubId === club.id && !e.teamId).map(e => nm(d.gymnasts.find(g => g.id === e.gymnastId))).sort();
    assert.deepEqual(ind, ['Helena Pons', 'Núria Anyó Puig']);
    assert.equal(c.entries.filter(e => e.clubId === club.id).length, 12, 'cadascuna inscrita un sol cop');
    // la fulla individual sola, una altra vegada: les dels equips es queden al seu equip
    await pg.click('button[data-act=inscOpen] >> visible=true');
    await pg.setInputFiles('#inscfile', [fx('inscripcio-variants-individual.xlsx')]);
    await pg.waitForSelector('#dlg >> text=inscripcio-variants-individual.xlsx');
    assert.ok((await pg.locator('#dlg').textContent()).includes('l’equip que ja tenia'));
    await pg.click('#dlg button[data-act=inscDo]');
    await pg.waitForSelector('.toast:has-text("Fulls d’inscripció importats")');
    const d2 = await data2(), c2 = d2.competitions.find(x => x.id === 'k1');
    const t2 = (cat, n) => { const t = c2.teams.find(x => x.clubId === club.id && x.category === cat && x.name === n); return t ? c2.entries.filter(e => e.teamId === t.id).length : 0; };
    assert.deepEqual([t2('Aleví', 'Club Variants'), t2('Aleví', 'Club Variants 2')], [4, 3]);
  });

  await step('el full de l’entitat mana: equips tal qual a la competició triada (encara que ja hi fossin), cap altra competició canvia i no s’hi fan equips «igualats»', async () => {
    // una competició passada (com la del 18/04) i una que ve, on l'Elna (EQUIP 2 al full) era a «CG Lleida» amb
    // equips que s'havien fet sols (5 + 2)
    await pg.evaluate(() => {
      const gid = n => db.gymnasts.find(g => g.clubId === 'c1' && g.name + ' ' + g.surname === n).id;
      const who = ['Anna Serra', 'Berta Pla', 'Carla Coll', 'Dana Mas', 'Elna Font', 'Fiona Ros', 'Gina Gil'].map(gid);
      const mk = (id, date) => { const c = { id, name: 'Comp ' + id, date, place: 'Lleida', season: 'Curs prova', locked: false, autoTeams: true,
        teams: [{ id: id + 't1', name: 'CG Lleida', clubId: 'c1', category: 'Aleví', gender: 'F', level: 'A', sourceTeamId: null, auto: true },
          { id: id + 't2', name: 'CG Lleida 2', clubId: 'c1', category: 'Aleví', gender: 'F', level: 'A', sourceTeamId: null, auto: true }],
        entries: who.map((g, i) => ({ id: id + 'e' + i, gymnastId: g, clubId: 'c1', gender: 'F', category: 'Aleví', level: 'A', bib: i + 1, teamId: i < 5 ? id + 't1' : id + 't2', status: '', scores: i === 4 ? { salt: [{ v: 8, at: 1 }] } : {} })) };
        db.competitions.push(normalizeComp(c, S().compDefaults)); };
      const d = new Date(Date.now() - 30 * 864e5), f = new Date(Date.now() + 20 * 864e5), iso = x => x.toISOString().slice(0, 10);
      mk('kp', iso(d)); mk('kf', iso(f)); commit();
    });
    await pg.goto(url + '#/competicio/kp/inscripcions');
    await pg.click('button[data-act=inscOpen] >> visible=true');
    await pg.setInputFiles('#inscfile', [path.join(here, 'fixtures', 'inscripcio-nivell-A.xlsx')]);
    await pg.waitForSelector('#dlg >> text=ja hi és');
    assert.equal(await pg.locator('#insccomp').inputValue(), 'kp');
    await pg.click('#dlg button[data-act=inscDo]');
    const t = await pg.locator('.toast:has-text("Fulls d’inscripció importats")').last().textContent();
    assert.ok(t.includes('ja ha passat: les fitxes de les gimnastes no s’han canviat'), 'una competició passada no canvia les fitxes: ' + t);
    assert.ok(t.includes('canviat d’equip (les notes no canvien)'), 'l’Elna ja tenia notes: ' + t);
    const d = await data2();
    const teamsOf = id => { const c = d.competitions.find(x => x.id === id), gn = gid => d.gymnasts.find(g => g.id === gid).name;
      return Object.fromEntries(c.teams.filter(x => x.category === 'Aleví' && x.level === 'A' && x.clubId === 'c1').map(x => [x.name, c.entries.filter(e => e.teamId === x.id).map(e => gn(e.gymnastId)).sort().join(',')])); };
    assert.deepEqual(teamsOf('kp'), { 'CG Lleida': 'Anna,Berta,Carla,Dana', 'CG Lleida 2': 'Elna,Fiona,Gina' }, 'com diu el full, encara que ja hi fossin');
    assert.deepEqual(teamsOf('kf'), { 'CG Lleida': 'Anna,Berta,Carla,Dana,Elna', 'CG Lleida 2': 'Fiona,Gina' }, 'l’altra competició no canvia');
    assert.ok(d.competitions.find(x => x.id === 'kp').entries.find(e => e.id === 'kpe4').scores.salt[0].v === 8, 'la nota es queda');
    // «Fes equips per entitat» no toca els equips del full (ni hi posa les individuals)
    await pg.evaluate(() => { db.competitions.find(c => c.id === 'kp').entries.forEach(e => { if (!e.teamId) delete e.noAuto; }); commit(); });
    await pg.evaluate(() => actions.autoCompTeams ? actions.autoCompTeams() : null);
    await pg.waitForTimeout(300);
    const ok = await pg.$('#confirm[open] button[value=ok]'); if (ok) await ok.click();
    await pg.waitForTimeout(300);
    assert.deepEqual(teamsOf('kp'), { 'CG Lleida': 'Anna,Berta,Carla,Dana', 'CG Lleida 2': 'Elna,Fiona,Gina' });
    const d2 = await data2();
    assert.deepEqual((await (async () => { const c = d2.competitions.find(x => x.id === 'kp'); return Object.fromEntries(c.teams.filter(x => x.category === 'Aleví' && x.level === 'A' && x.clubId === 'c1').map(x => [x.name, c.entries.filter(e => e.teamId === x.id).length])); })()), { 'CG Lleida': 4, 'CG Lleida 2': 3 }, 'cap equip nou ni «igualat»');
  });

  await step('si un equip canvia de gimnastes d’una jornada a l’altra, la classificació ho avisa i la puntuació continua sumant', async () => {
    // a «Comp kf» (després de kp), l'Elna és a «CG Lleida»: a kp, no
    await pg.evaluate(() => { ui.clsType = 'teams'; ui.clsGroup = 'Aleví||F||A'; location.hash = '#/competicio/kf/classificacions'; });
    await pg.waitForSelector('.chg');
    const t = await pg.locator('tr.team-row:has-text("CG Lleida") .chg').first().textContent();
    assert.ok(t.includes('Canvis respecte de «Comp kp»') && t.includes('entra Elna Font'), t);
    // al rànquing del curs: l'equip suma les dues jornades i surt l'avís
    await pg.evaluate(() => { ui.rkSeason = 'Curs prova'; ui.rkType = 'teams'; ui.rkGroup = 'Aleví||F||A'; location.hash = '#/ranquing'; });
    await pg.waitForSelector('.card .chg');
    const r = await pg.locator('.card tr:has-text("CG Lleida") .chg').first().textContent();
    assert.ok(r.includes('Ha canviat de gimnastes') && r.includes('entra Elna Font'), r);
    assert.ok(await pg.locator('.note.warn:has-text("continua sumant igual")').count());
  });

  // ─── setena revisió: el curs. Categories per l'any (els botons sempre pregunten i diuen quins equips es desfan),
  // «Passa al curs següent» per error a mig curs i «Desfés un curs», el rànquing del curs després de passar de curs
  // i el nom de la jornada següent. Amb el rellotge al 10/11/2026 (la 2a Fase, del 21/11, encara no s'ha fet)
  const ctx7 = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ca-ES', timezoneId: 'Europe/Madrid' });
  await ctx7.clock.install({ time: new Date('2026-11-10T10:00:00+01:00') });
  const p7 = await ctx7.newPage();
  p7.on('pageerror', e => errors.push('pageerror (7a revisió): ' + e.message));
  p7.on('console', m => { if (m.type() === 'error') errors.push('console (7a revisió): ' + m.text()); });
  await p7.goto(url);
  // CG Lleida: «CG Lleida» (Anna i Berta, de 2015; Carla i Dana, de 2016) i «CG Lleida 2» (Laia, de 2017, que per l'any
  // és benjamí; Gina i Helena), tots dos dits per l'entitat al full; la 1a Fase ja s'ha fet i la 2a encara no
  const season7 = () => {
    const g = (id, name, year) => ({ id, name, surname: 'Prova', clubId: 'c1', gender: 'F', category: 'Aleví', level: 'A', birthYear: String(year), notes: '', archived: false });
    const gyms = [g('a1', 'Anna', 2015), g('a2', 'Berta', 2015), g('a3', 'Carla', 2016), g('a4', 'Dana', 2016), g('b1', 'Laia', 2017), g('b2', 'Gina', 2016), g('b3', 'Helena', 2016)];
    const T = { T1: ['a1', 'a2', 'a3', 'a4'], T2: ['b1', 'b2', 'b3'] };
    const mk = (id, name, date, scored) => ({ id, name, date, place: 'Lleida', season: '', locked: false, autoTeams: true,
      teams: [{ id: id + 'T1', name: 'CG Lleida', clubId: 'c1', gender: 'F', category: 'Aleví', level: 'A', sourceTeamId: 'T1', form: true },
        { id: id + 'T2', name: 'CG Lleida 2', clubId: 'c1', gender: 'F', category: 'Aleví', level: 'A', sourceTeamId: 'T2', form: true }],
      entries: gyms.map((x, i) => ({ id: id + x.id, gymnastId: x.id, clubId: 'c1', gender: 'F', category: 'Aleví', level: 'A', bib: i + 1, status: '',
        teamId: id + (T.T1.includes(x.id) ? 'T1' : 'T2'), scores: scored ? { salt: [{ v: 8 + i / 10, at: 1 }], barra: [{ v: 8, at: 1 }], terra: [{ v: 8, at: 1 }] } : {} })) });
    return { app: 'notesgim', version: 1, settings: { org: 'PROVA', levels: ['A', 'B'], rev: 4 }, clubs: [{ id: 'c1', name: 'CG Lleida' }], gymnasts: gyms,
      teams: [{ id: 'T1', name: 'CG Lleida', clubId: 'c1', gender: 'F', category: 'Aleví', level: 'A', memberIds: T.T1, form: true },
        { id: 'T2', name: 'CG Lleida 2', clubId: 'c1', gender: 'F', category: 'Aleví', level: 'A', memberIds: T.T2, form: true }],
      competitions: [mk('k1', '1a Fase comarcal', '2026-10-24', true), mk('k2', '2a Fase comarcal', '2026-11-21', false)],
      meta: { created: '2026-09-01T10:00:00.000Z', updated: '2026-11-01T10:00:00.000Z', dbId: 'curs7' } };
  };
  const load7 = (d, hash) => p7.evaluate(([r, hash]) => {
    if ($('#confirm').open) $('#confirm').close(); if ($('#dlg').open) closeDialog(); $$('.toast').forEach(t => t.remove());
    db = migrate(JSON.parse(r)); commit(); go(hash);
  }, [JSON.stringify(d), hash]).then(() => p7.waitForTimeout(150));
  const state7 = () => p7.evaluate(() => JSON.stringify({ g: db.gymnasts, t: db.teams, c: db.competitions, s: db.settings.categories }));
  const teams7 = cid => p7.evaluate(cid => { const c = compById(cid); return Object.fromEntries(c.teams.map(t => [t.name, c.entries.filter(e => e.teamId === t.id).map(e => gymById(e.gymnastId).name).sort().join(',')]).filter(x => x[1])); }, cid);
  const confirm7 = async () => { await p7.waitForSelector('#confirm[open]'); return p7.locator('#confirm').textContent(); };
  const lastToast7 = () => p7.locator('.toast').last().textContent();
  const shift7 = d => p7.click(`button[data-act=shiftYears][data-d="${d}"]`);

  await step('«Posa a tothom la categoria que li toca» (a Gimnastes i a Configuració) sempre pregunta abans, amb els equips que es desfan; l’avís diu quins equips han canviat', async () => {
    await load7(season7(), '#/gimnastes');
    const before = await state7();
    for (const hash of ['#/gimnastes', '#/configuracio']) {
      await p7.evaluate(h => go(h), hash); await p7.waitForTimeout(150);
      await p7.locator('button[data-act=recalcCats]').first().click();
      const t = await confirm7();
      assert.ok(t.includes('Laia Prova: Aleví → Benjamí') && t.includes('«CG Lleida 2» (Aleví A), el va dir l’entitat al full d’inscripció: hi quedarien Gina Prova i Helena Prova'), t);
      assert.ok(t.includes('«2a Fase comarcal» (21/11/2026: 3 inscripcions)'), t);
      // (qui es queda sense equip, també la Laia: el CG Lleida no té cap altre equip benjamí; cap promesa d'equips nous)
      assert.ok(t.includes('Es quedarien sense equip: Gina Prova, Helena Prova i Laia Prova') && !t.includes('equips nous'), t);
      await p7.click('#confirm button[value=no]'); await p7.waitForTimeout(150);
      assert.equal(await state7(), before, 'Cancel·la: res no canvia (' + hash + ')');
    }
    await p7.locator('button[data-act=recalcCats]').first().click(); await confirm7();
    await p7.click('#confirm button[value=ok]'); await p7.waitForTimeout(200);
    const toast = await lastToast7();
    assert.ok(toast.includes('Equip desfet: «CG Lleida 2» (Aleví A)') && toast.includes('Es queden sense equip: Gina Prova, Helena Prova i Laia Prova'), toast);
    // (a la 2a Fase, la Laia ja és benjamí; la Gina i l'Helena, individuals: l'entitat ja ha dit els seus equips)
    assert.deepEqual(await teams7('k2'), { 'CG Lleida': 'Anna,Berta,Carla,Dana' });
    // els botons que obren els fulls d'inscripció, amb un clic: el diàleg, sense cap fitxer
    for (const hash of ['#/gimnastes', '#/competicio/k2/inscripcions']) {
      await p7.evaluate(h => { closeDialog(); go(h); }, hash); await p7.waitForTimeout(150);
      await p7.locator('button[data-act=inscOpen] >> visible=true').first().click();
      await p7.waitForSelector('#dlg[open] #inscfile');
      assert.equal(await p7.evaluate(() => ui.insc.files.length), 0, hash);
    }
    await p7.evaluate(() => closeDialog());
  });

  await step('«Passa al curs següent» a mig curs pregunta abans; «Desfés un curs» just després ho deixa tot com era (també els equips del full); si després s’ha canviat res, avisa abans', async () => {
    await load7(season7(), '#/configuracio');
    const before = await state7();
    await shift7(1);
    let t = await confirm7();
    assert.ok(t.includes('Hi ha una competició d’aquest curs (2026-2027) per fer') && t.includes('«2a Fase comarcal», 21/11/2026'), t);
    await p7.click('#confirm button[value=no]'); await p7.waitForTimeout(150);
    assert.equal(await state7(), before, 'Cancel·la: res no canvia');
    await shift7(1); await confirm7(); await p7.click('#confirm button[value=ok]');
    await p7.waitForSelector('#confirm[open] >> text=Amb els anys nous');
    t = await p7.locator('#confirm').textContent();
    assert.ok(t.includes('Anna Prova: Aleví → Infantil') && t.includes('«CG Lleida» (Aleví A), el va dir l’entitat al full d’inscripció: hi quedarien Carla Prova i Dana Prova'), t);
    await p7.click('#confirm button[value=ok]'); await p7.waitForTimeout(200);
    assert.ok((await lastToast7()).includes('Equip desfet: «CG Lleida» (Aleví A)'));
    assert.notEqual(await state7(), before);
    // «Desfés un curs (−1)» tot seguit: com abans del +1 (sense preguntar res)
    await shift7(-1); await p7.waitForTimeout(250);
    assert.equal(await p7.locator('#confirm[open]').count(), 0);
    assert.ok((await lastToast7()).includes('Tot torna a estar com abans de «Passa al curs següent»'));
    assert.equal(await state7(), before, '+1 i −1: tot com era');
    // +1, un altre canvi (un dorsal) i −1: no es pot tornar exactament; s'avisa abans, amb la competició que canvia
    await shift7(1); await confirm7(); await p7.click('#confirm button[value=ok]');
    await p7.waitForSelector('#confirm[open] >> text=Amb els anys nous'); await p7.click('#confirm button[value=ok]'); await p7.waitForTimeout(200);
    await p7.evaluate(() => { compById('k2').entries[0].bib = 99; commit(); });
    const mid = await state7();
    await shift7(-1);
    t = await confirm7();
    assert.ok(t.includes('Ja no es pot tornar exactament a com estava abans de «Passa al curs següent» (el 10/11/2026): després s’hi han fet altres canvis') && t.includes('«2a Fase comarcal» (21/11/2026'), t);
    // (i quins equips dels que havia dit l'entitat no tornaran: el +1 va desfer «CG Lleida»)
    assert.ok(t.includes('no tornarà a ser com era: «CG Lleida» (Aleví A)'), t);
    await p7.click('#confirm button[value=""]'); await p7.waitForTimeout(150);
    assert.equal(await state7(), mid, 'Cancel·la: res no canvia');
    // +1, es tanca NotesGim i es torna a obrir (sense cap altre canvi), −1: tot com era, també els equips del full
    await load7(season7(), '#/configuracio');
    const before2 = await state7();
    const plus7 = async () => { await shift7(1); await confirm7(); await p7.click('#confirm button[value=ok]');
      await p7.waitForSelector('#confirm[open] >> text=Amb els anys nous'); await p7.click('#confirm button[value=ok]'); await p7.waitForTimeout(200); };
    await plus7();
    await p7.waitForFunction(() => !saveTimer); await p7.waitForTimeout(500);
    await p7.reload(); await p7.waitForSelector('button[data-act=shiftYears]');
    assert.equal(await p7.evaluate(() => db.settings.lastShift.d), 1, 'tornat a obrir: les dades de després del +1');
    await shift7(-1); await p7.waitForTimeout(300);
    assert.equal(await p7.locator('#confirm[open]').count(), 0);
    assert.equal(await state7(), before2, 'tornat a obrir, −1: tot com era');
    // el «Desfés» de l'avís (torna a després del +1) i −1 un altre cop: tot com era
    await p7.locator('.toast').last().locator('button', { hasText: 'Desfés' }).click(); await p7.waitForTimeout(200);
    assert.notEqual(await state7(), before2);
    await shift7(-1); await p7.waitForTimeout(300);
    assert.equal(await p7.locator('#confirm[open]').count(), 0);
    assert.equal(await state7(), before2, '«Desfés» i −1: tot com era');
    // el +1 es va fer en un altre ordinador (aquí no hi ha la còpia d'abans): s'avisa, amb els equips del full
    await plus7();
    await p7.evaluate(async () => { shiftUndo = null; await idbDel(SHIFT_KEY); });
    await shift7(-1);
    t = await confirm7();
    assert.ok(t.includes('la còpia de com estava abans no és en aquest ordinador') && t.includes('no tornarà a ser com era: «CG Lleida» (Aleví A)'), t);
    await p7.click('#confirm button[value=""]'); await p7.waitForTimeout(150);
  });

  await step('«Passa al curs següent» al setembre, abans de la primera competició del curs, no fa la pregunta vermella; si ja s’ha fet per a aquest curs o el curs ja ha començat, sí', async () => {
    const red = async () => { const t = await confirm7(); return [t, await p7.locator('#confirm[open] button.danger').count()]; };
    // 15/09/2027: la 1a Fase del curs nou (23/10/2027) ja és feta a l'app, però encara no s'ha fet
    const d = season7(), k3 = JSON.parse(JSON.stringify(d.competitions[1]));
    Object.assign(k3, { id: 'k3', name: '1a Fase comarcal', date: '2027-10-23' }); k3.entries.forEach(e => { e.id = 'k3' + e.gymnastId; });
    k3.teams.forEach(t => { t.id = 'k3' + t.sourceTeamId; }); k3.entries.forEach(e => { e.teamId = 'k3' + e.teamId.slice(2); });
    d.competitions.push(k3);
    await ctx7.clock.setSystemTime(new Date('2027-09-15T10:00:00+02:00'));
    await load7(d, '#/configuracio');
    await shift7(1);
    let [t, n] = await red();
    assert.ok(t.startsWith('Amb els anys nous') && !n, t);
    await p7.click('#confirm button[value=ok]'); await p7.waitForTimeout(200);
    // un altre +1 el mateix setembre: els anys ja són els del curs 2027-2028
    await shift7(1);
    [t, n] = await red();
    assert.ok(n && t.includes('Ja s’ha passat al curs següent el 15/09/2027: els anys de les categories ja són els del curs 2027-2028'), t);
    await p7.click('#confirm button[value=no]'); await p7.waitForTimeout(150);
    // al desembre, entre fases (encara no hi ha la següent): el curs ja ha començat
    await ctx7.clock.setSystemTime(new Date('2026-12-10T10:00:00+01:00'));
    await load7(season7(), '#/configuracio');
    await shift7(1);
    [t, n] = await red();
    assert.ok(n && t.includes('El curs 2026-2027 ja ha començat: ja s’han fet «1a Fase comarcal», 24/10/2026 i «2a Fase comarcal», 21/11/2026'), t);
    await p7.click('#confirm button[value=no]'); await p7.waitForTimeout(150);
    await ctx7.clock.setSystemTime(new Date('2026-11-10T10:00:00+01:00'));
  });

  await step('rànquing del curs: un equip reanomenat i un de nou amb el nom d’abans no es barregen, tampoc després de «Passa al curs següent»', async () => {
    // 1a i 2a Fase amb «CG Lleida»; a la Final ja es diu «CG Lleida Groc» i n'hi ha un de nou, «CG Lleida» (Laia,
    // Gina i Helena, de «CG Lleida 2»). Al juliol, el +1 desfà tots dos equips de la llista
    const d = season7();
    d.competitions[1].date = '2026-11-21';
    for (const e of d.competitions[1].entries) e.scores = { salt: [{ v: 7.5, at: 1 }], barra: [{ v: 7.5, at: 1 }], terra: [{ v: 7.5, at: 1 }] };
    d.teams[0].name = 'CG Lleida Groc';
    d.teams[1] = { id: 'T3', name: 'CG Lleida', clubId: 'c1', gender: 'F', category: 'Aleví', level: 'A', memberIds: ['b1', 'b2', 'b3'] };
    for (const g of d.gymnasts) if (g.id === 'b2' || g.id === 'b3') g.birthYear = '2015';
    const f = JSON.parse(JSON.stringify(d.competitions[1]));
    f.id = 'k3'; f.name = 'Final comarcal'; f.date = '2027-01-30';
    f.teams = [{ id: 'k3T1', name: 'CG Lleida Groc', clubId: 'c1', gender: 'F', category: 'Aleví', level: 'A', sourceTeamId: 'T1' },
      { id: 'k3T3', name: 'CG Lleida', clubId: 'c1', gender: 'F', category: 'Aleví', level: 'A', sourceTeamId: 'T3' }];
    f.entries.forEach(e => { e.id = 'k3' + e.gymnastId; e.teamId = ['b1', 'b2', 'b3'].includes(e.gymnastId) ? 'k3T3' : 'k3T1'; e.scores = { salt: [{ v: 9, at: 1 }], barra: [{ v: 9, at: 1 }], terra: [{ v: 9, at: 1 }] }; });
    d.competitions.push(f);
    await ctx7.clock.setSystemTime(new Date('2027-07-15T10:00:00+02:00'));
    await load7(d, '#/ranquing');
    const rank = () => p7.evaluate(() => { ui.rkSeason = '2026-2027'; ui.rkType = 'teams'; ui.rkGroup = 'all'; ui.rkOff = {}; render();
      return [...document.querySelectorAll('section .card tbody tr')].map(tr => [...tr.children].map(td => td.innerText.split('\n')[0].trim()).filter((x, i) => i !== 2).join(' | ')); });
    const notes = () => p7.evaluate(() => { ui.clsType = 'teams'; ui.clsGroup = 'Aleví||F||A'; go('#/competicio/k3/classificacions'); return [...document.querySelectorAll('tr.team-row')].map(r => r.children[1].innerText.replace(/\s+/g, ' ').trim()); });
    const r0 = await rank();
    assert.deepEqual(r0, ['1 | CG Lleida Groc | 72,60 | 67,50 | 81,00 | 221,10 | 3', '2 | CG Lleida 2 | 73,50 | 67,50 | — | 141,00 | 2', '3 | CG Lleida | — | — | 81,00 | 81,00 | 1'], JSON.stringify(r0));
    const n0 = await notes(); await p7.waitForTimeout(100);
    await p7.evaluate(() => go('#/configuracio')); await p7.waitForTimeout(150);
    await p7.click('button[data-act=shiftYears][data-d="1"]');
    await p7.waitForSelector('#confirm[open] >> text=Amb els anys nous'); await p7.click('#confirm button[value=ok]'); await p7.waitForTimeout(200);
    assert.equal(await p7.evaluate(() => db.teams.length), 0, 'el +1 ha desfet els equips de la llista');
    await p7.evaluate(() => go('#/ranquing')); await p7.waitForTimeout(150);
    assert.deepEqual(await rank(), r0, 'el rànquing del curs passat no canvia');
    assert.deepEqual(await notes(), n0, 'ni els avisos de la Final');
    assert.ok(!n0.some(x => /^CG Lleida ▸.*Canvis/.test(x)), n0.join(' / '));
    await ctx7.clock.setSystemTime(new Date('2026-11-10T10:00:00+01:00'));
  });

  await step('«Jornada següent»: el número de la fase o de la jornada, mai l’any ni el curs; si no n’hi ha, el nom surt seleccionat', async () => {
    const names = await p7.evaluate(() => ['1a Fase comarcal 2026-2027', 'Fase comarcal 1 · curs 2026-27', '2a FASE JEEC 2027', 'Jornada 3 (Alpicat)', '3r Trofeu', 'Final comarcal'].map(nextCompName));
    assert.deepEqual(names, ['2a Fase comarcal 2026-2027', 'Fase comarcal 2 · curs 2026-27', '3a FASE JEEC 2027', 'Jornada 4 (Alpicat)', '4t Trofeu', 'Final comarcal']);
    const d = season7(); d.competitions[1].name = 'Final comarcal';
    await load7(d, '#/competicions');
    await p7.click('button[data-act=dupComp][data-id=k2]');
    await p7.waitForSelector('#dlg[open] form[data-form=comp]');
    assert.deepEqual(await p7.evaluate(() => { const i = $('#dlg input[name=name]'); return [i.value, document.activeElement === i, i.selectionStart, i.selectionEnd]; }), ['Final comarcal', true, 0, 14]);
    await p7.keyboard.type('Final comarcal 2');
    assert.equal(await p7.inputValue('#dlg input[name=name]'), 'Final comarcal 2');
    await p7.evaluate(() => closeDialog());
  });
  await ctx7.close();

  // ─── setena revisió (textos): «d’» davant de vocal, noi o noia segons qui és, singular i plural, «1r salt»
  // i el primer dia (Com començar, Inscripcions buides). Amb les dades de la 3a fase del 18/04/2026.
  const ctx7t = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ca-ES', acceptDownloads: true });
  const p7t = await ctx7t.newPage();
  p7t.on('pageerror', e => errors.push('pageerror (7a revisió): ' + e.message));
  p7t.on('console', m => { if (m.type() === 'error') errors.push('console (7a revisió): ' + m.text()); });
  await p7t.goto(url);
  const load7t = async (hash, prep = '') => {
    await p7t.evaluate(([r, hash, prep]) => { if ($('#dlg').open) closeDialog(); $$('.toast').forEach(t => t.remove()); db = migrate(JSON.parse(r)); if (prep) (0, eval)(prep)(db); ui.qe = false; commit(); go(hash); }, [JSON.stringify(fixture()), hash, prep]);
    await p7t.waitForTimeout(150);
  };
  const lastToast7t = () => p7t.evaluate(() => { const t = $$('#toasts .toast span'); return t.length ? t[t.length - 1].textContent : ''; });
  const confirmTxt7 = async () => { await p7t.waitForSelector('#confirm[open]'); return (await p7t.locator('#confirm').innerText()).replace(/\s+/g, ' '); };
  const cancel7 = () => p7t.click('#confirm button[value=no]');

  await step('setena revisió: «de» o «d’», noi o noia i singular o plural, amb les eines de l’app', async () => {
    await load7t('#/competicions');
    const r = await p7t.evaluate(() => ({
      de: ['Ester Vila', 'Iris Font', 'Olga', 'Helena', 'Unió', 'INEF Lleida', 'Aleví', 'aquest grup', 'Iolanda', 'Huelva', 'Lleida', 'Yolanda',
        '«Interclubs»', '«Comp kp»', '<b>Anna</b>', 1, 11, '11:30', '1a Fase', '1r', 3, '10:00', '1.000', 8].map(deN),
      mf: [{ gender: 'M' }, { gender: 'F' }, {}, null].map(x => mf(x, 'presentat', 'presentada')),
      falten: [faltenTxt(1, 'nota', 'notes'), faltenTxt(3, 'nota', 'notes'), faltenTxt(1), faltenTxt(2)],
      rev: [tutorReviewTxt(1), tutorReviewTxt(2)],
    }));
    assert.deepEqual(r.de, ['d’Ester Vila', 'd’Iris Font', 'd’Olga', 'd’Helena', 'd’Unió', 'd’INEF Lleida', 'd’Aleví', 'd’aquest grup', 'de Iolanda', 'de Huelva', 'de Lleida', 'de Yolanda',
      'd’«Interclubs»', 'de «Comp kp»', 'd’<b>Anna</b>', 'd’1', 'd’11', 'd’11:30', 'de 1a Fase', 'de 1r', 'de 3', 'de 10:00', 'de 1.000', 'de 8']);
    assert.deepEqual(r.mf, ['presentat', 'presentada', 'presentada', 'presentada']);
    assert.deepEqual(r.falten, ['falta 1 nota', 'falten 3 notes', 'falta 1', 'falten 2']);
    assert.deepEqual(r.rev, ['✓ Dona per revisada la nota de les tutores', '✓ Dona per revisades les 2 notes de les tutores']);
    // la fitxa arxivada d'una noia i la d'un noi (un nom que comença per vocal)
    const m = await p7t.evaluate(() => [archiveMsg({ name: 'Ester', surname: 'Vila', gender: 'F' }, { comps: ['2a Fase'], weak: [] }).msg,
      archiveMsg({ name: 'Oriol', surname: 'Mas', gender: 'M' }, { comps: ['2a Fase'], weak: [] }).msg, archiveMsg({ name: 'Pau', surname: 'Roca', gender: 'M' }, { comps: [], weak: [] }).msg]);
    assert.deepEqual(m, ['Fitxa d’Ester Vila arxivada: ja no surt a les llistes ni és a cap equip. Treta de: 2a Fase.',
      'Fitxa d’Oriol Mas arxivada: ja no surt a les llistes ni és a cap equip. Tret de: 2a Fase.', 'Fitxa de Pau Roca arxivada: ja no surt a les llistes ni és a cap equip.']);
  });

  await step('setena revisió: un noi no presentat, treure’l de la competició, la seva fitxa i el canvi de categoria, en masculí', async () => {
    // (els 3 nois d'Aleví A: l'últim ja té notes; la competició és avui, perquè la fitxa també la canviï)
    await load7t('#/competicio/c418/notes', `db => { const c = db.competitions[0]; c.date = '${today}'; c.entries.filter(e => e.gender === 'M' && e.category === 'Aleví').pop().scores = { salt: [{ v: 8, at: 1 }] }; }`);
    const boys = await p7t.evaluate(() => curComp().entries.filter(e => e.gender === 'M' && e.category === 'Aleví').map(e => e.id));
    assert.equal(boys.length, 3);
    await p7t.evaluate(() => { ui.group = 'Aleví||M||A'; ui.app = 'all'; render(); });
    await p7t.waitForTimeout(150);
    const cell = p7t.locator(`#scoregrid input.sc[data-e="${boys[0]}"][data-a=salt]`).first();
    await cell.click(); await p7t.keyboard.type('NP'); await p7t.keyboard.press('Enter'); await p7t.waitForTimeout(400);
    const name0 = await p7t.evaluate(id => entryName(curComp().entries.find(e => e.id === id)), boys[0]);
    assert.ok((await lastToast7t()).startsWith(`${name0}: no presentat (NP).`), await lastToast7t());
    // «Entrada ràpida» → NP
    await p7t.evaluate(id => { const e = curComp().entries.find(x => x.id === id); e.status = ''; commit(); ui.qe = true; qe.entryId = id; qe.i = 0; render(); }, boys[1]);
    await p7t.waitForSelector('#qe');
    await p7t.click('#qe button[data-act=qeNP]'); await p7t.waitForTimeout(300);
    assert.ok((await lastToast7t()).includes(': no presentat (NP).'), await lastToast7t());
    await p7t.evaluate(() => { ui.qe = false; render(); });
    // treure de la competició un noi que ja té notes
    await p7t.evaluate(() => go('#/competicio/c418/inscripcions')); await p7t.waitForTimeout(150);
    assert.equal(await p7t.getAttribute(`button[data-act=delEntry][data-id="${boys[2]}"]`, 'title'), 'Treu-lo de la competició');
    await p7t.click(`button[data-act=delEntry][data-id="${boys[2]}"]`);
    assert.ok((await confirmTxt7()).includes('ja té notes. Segur que el vols treure de la competició?'));
    await cancel7();
    // la fitxa nova des del grup dels nois: «Inscriu-lo»; si es canvia a noia, «Inscriu-la»
    await p7t.click('button[data-act=newGymHere][data-g="Aleví||M||A"]');
    await p7t.waitForSelector('#dlg[open] form[data-form=gym]');
    const enroll = async () => (await p7t.locator('#dlg label.chk', { hasText: 'també a' }).innerText()).replace(/\s+/g, ' ');
    assert.ok((await enroll()).startsWith('Inscriu-lo també a'), await enroll());
    await p7t.selectOption('#dlg select[name=gender]', 'F');
    assert.ok((await enroll()).startsWith('Inscriu-la també a'), await enroll());
    assert.ok((await p7t.locator('#dlg select[name=team] option').first().textContent()).includes('amb les de la seva entitat'));
    await p7t.selectOption('#dlg select[name=gender]', 'M');
    assert.ok((await p7t.locator('#dlg select[name=team] option').first().textContent()).includes('amb els de la seva entitat'));
    await p7t.click('#dlg button[data-act=closeDlg]');
    // la seva fitxa: «Arxivat», i si ara és d'un altre grup, «està inscrit com a…»
    const gid = await p7t.evaluate(id => curComp().entries.find(e => e.id === id).gymnastId, boys[1]);
    await p7t.evaluate(id => actions.editGym({ dataset: { id } }), gid);
    await p7t.waitForSelector('#dlg[open] form[data-form=gym]');
    assert.ok((await p7t.locator('#dlg label.chk', { hasText: 'ja no competeix' }).innerText()).startsWith('Arxivat'));
    await p7t.selectOption('#dlg select[name=level]', 'B');
    await p7t.click('#dlg button.primary');
    assert.ok((await confirmTxt7()).includes(' està inscrit com a Aleví A a '), await confirmTxt7());
    await cancel7();
  });

  await step('setena revisió: «Fitxa d’Iris…», «No hi ha gimnastes d’Aleví…», «Actualitza-la», «1r salt / 2n salt»', async () => {
    // una gimnasta sense inscripcions que es diu Iris: el ✕ de la llista
    await load7t('#/gimnastes', 'db => { db.gymnasts.push({ id: "gi", name: "Iris", surname: "Font", clubId: "INEF", gender: "F", category: "Aleví", level: "A", birthYear: "", notes: "", archived: false }); }');
    await p7t.click('button[data-act=delGym][data-id="gi"]');
    await p7t.click('#confirm button[value=ok]'); await p7t.waitForTimeout(200);
    assert.equal(await lastToast7t(), 'Fitxa d’Iris Font esborrada.');
    // Equips → Nou equip, d'INEF Lleida, d'Aleví A i d'Infantil A (nois), sense gimnastes
    await p7t.evaluate(() => go('#/equips')); await p7t.waitForTimeout(150);
    await p7t.locator('button[data-act=newTeam]').first().click();
    await p7t.waitForSelector('#dlg[open]');
    await p7t.selectOption('#dlg select[name=clubId]', 'INEF');
    await p7t.selectOption('#dlg select[name=category]', 'Aleví');
    await p7t.selectOption('#dlg select[name=level]', 'A'); await p7t.waitForTimeout(150);
    assert.ok((await p7t.locator('#teampick').innerText()).startsWith('No hi ha gimnastes d’Aleví femení · nivell A en aquesta entitat.'));
    await p7t.selectOption('#dlg select[name=category]', 'Infantil'); await p7t.selectOption('#dlg select[name=gender]', 'M'); await p7t.waitForTimeout(150);
    assert.ok((await p7t.locator('#teampick').innerText()).startsWith('No hi ha gimnastes d’Infantil masculí · nivell A'));
    await p7t.click('#dlg button[data-act=closeDlg]');
    // passa al curs següent: només 1 gimnasta (amb l'any) canvia de categoria
    await load7t('#/configuracio', 'db => { const g = db.gymnasts.find(x => x.id === "g100"); g.category = "Aleví"; g.birthYear = "2015"; }');
    await p7t.click('button[data-act=shiftYears][data-d="1"]');
    const q = await confirmTxt7();
    assert.ok(q.includes('1 gimnasta canvia de categoria. L’actualitzo ara?') && q.includes('Actualitza-la') && !q.includes('Actualitza-les'), q);
    await cancel7();
    // full de jutge del minitramp (2 salts) dels nois; i amb D + E, les caselles de cada salt a sota
    const heads = await p7t.evaluate(() => {
      const c = curComp() || db.competitions[0], g = groupsOf(c).find(x => x.key === 'Aleví||M||A'), a = c.apparatus.find(x => x.id === 'mini');
      const th = html => { const d = document.createElement('div'); d.innerHTML = html; return [...d.querySelectorAll('thead tr:not(.rep)')].map(tr => [...tr.children].map(x => x.textContent + (x.colSpan > 1 ? '×' + x.colSpan : ''))); };
      return [th(judgeSheet(c, g, a)), th(judgeSheet(Object.assign({}, c, { scoring: 'detailed' }), g, a))];
    });
    assert.deepEqual(heads[0], [['Ordre', 'Dorsal', 'Esportista', 'Entitat', '1r salt', '2n salt', 'Final']]);
    assert.deepEqual(heads[1], [['Ordre', 'Dorsal', 'Esportista', 'Entitat', '1r salt×4', '2n salt×4', 'Final'], ['D', 'E', 'Pen.', 'Nota', 'D', 'E', 'Pen.', 'Nota']]);
  });

  await step('setena revisió: el primer dia, «Com començar» diu el camí de veritat i les Inscripcions buides ofereixen els fulls dels clubs (també al mòbil)', async () => {
    await p7t.evaluate(() => { if ($('#dlg').open) closeDialog(); db = defaultDb(); commit(); go('#/competicions'); });
    await p7t.waitForTimeout(150);
    const intro = (await p7t.locator('.card', { hasText: 'Com començar' }).innerText()).replace(/\s+/g, ' ');
    for (const x of ['Nova competició', 'Inscripcions → 📥 Fulls d’inscripció dels clubs', 'els equips queden com diu el full', 'Rotacions i horari → Fes les rotacions → 🖨 Imprimeix', 'Tutores i Notes', 'Classificacions i Podi']) assert.ok(intro.includes(x), x + ' | ' + intro);
    assert.ok(!intro.includes('Els equips es fan sols'), intro);
    await p7t.locator('.page-head button[data-act=newComp]').click();
    await p7t.waitForSelector('#dlg[open] form[data-form=comp]');
    await p7t.fill('#dlg input[name=name]', '1a FASE COMARCAL'); await p7t.fill('#dlg input[name=date]', '2026-11-21');
    await p7t.click('#dlg button.primary'); await p7t.waitForTimeout(300);
    await p7t.setViewportSize({ width: 360, height: 740 }); await p7t.waitForTimeout(200);
    assert.ok(await p7t.evaluate(() => isPhone()));
    const b = p7t.locator('.empty button[data-act=inscOpen]');
    assert.ok(await b.isVisible(), 'al mòbil, sense obrir el menú ⋯');
    assert.ok((await p7t.locator('.empty').innerText()).includes('El més ràpid són els fulls d’inscripció dels clubs'));
    // «Inscriu gimnastes» sense cap fitxa: també els ofereix, i s'obren amb aquesta competició triada
    await p7t.click('button[data-act=enrollGyms]');
    await p7t.waitForSelector('#dlg[open] #gympick button[data-act=inscOpen]');
    await p7t.click('#dlg #gympick button[data-act=inscOpen]');
    await p7t.waitForSelector('#dlg[open] #inscfile');
    assert.equal(await p7t.evaluate(() => ui.insc.compId), await p7t.evaluate(() => curComp().id));
    await p7t.evaluate(() => closeDialog());
    await p7t.setViewportSize({ width: 1366, height: 900 });
  });
  await ctx7t.close();

  // ─── tercera revisió: res es torna a pintar a mig clic, a mitja tecla, amb un menú obert ni a sobre del que
  // s'escriu; el focus, el cursor i la graella es queden on eren (amb les dades de la 3a fase del 18/04/2026)
  const ctx3 = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ca-ES' });
  const p3 = await ctx3.newPage();
  p3.on('pageerror', e => errors.push('pageerror (3a revisió): ' + e.message));
  p3.on('console', m => { if (m.type() === 'error') errors.push('console (3a revisió): ' + m.text()); });
  await p3.goto(url);
  const load3 = async hash => {
    await p3.evaluate(([r, hash]) => { if ($('#dlg').open) closeDialog(); $$('.toast').forEach(t => t.remove()); db = migrate(JSON.parse(r)); ui.qe = false; commit(); go(hash); }, [JSON.stringify(fixture()), hash]);
    await p3.waitForTimeout(150);
  };
  // una nota d'una tutora que arriba del programa (com fa serverWaitLoop)
  const tutorNote = (eid, app = 'salt', v = 8.5) => p3.evaluate(([eid, app, v]) => {
    const r = JSON.parse(JSON.stringify(db)), c = r.competitions.find(x => x.entries.some(e => e.id === eid)), e = c.entries.find(x => x.id === eid);
    e.scores = e.scores || {}; e.scores[app] = [{ v, at: Date.now(), by: 'tutor', who: 'Anna' }];
    applyRemote(r, null);
  }, [eid, app, v]);
  // clic amb el ratolí; la nota arriba mentre el botó és premut
  const clickWithNote = async (loc, eid) => {
    await loc.scrollIntoViewIfNeeded(); const b = await loc.boundingBox();
    await p3.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await p3.mouse.down();
    if (eid) await tutorNote(eid);
    await p3.waitForTimeout(80); await p3.mouse.up(); await p3.waitForTimeout(150);
  };
  const act3 = () => p3.evaluate(() => { const a = document.activeElement; return a && a !== document.body ? { tag: a.tagName, chg: a.dataset.chg || '', act: a.dataset.act || '', id: a.dataset.id || a.dataset.e || '' } : null; });

  await step('una nota de tutora a mig clic o a mitja tecla no es menja el clic ni la tecla (Inscripcions, Classificacions, menú ⋯)', async () => {
    await load3('#/competicio/c418/inscripcions');
    await clickWithNote(p3.locator('a[data-act=editEntry][data-id=e010]'), 'e001');
    assert.ok(await p3.evaluate(() => $('#dlg').open), 'el clic al nom obre la fitxa');
    await p3.evaluate(() => closeDialog());
    await clickWithNote(p3.locator('input.selbox[data-id=e012]'), 'e002');
    assert.ok(await p3.locator('input.selbox[data-id=e012]').isChecked(), 'la casella es marca');
    // Espai sobre una casella, i sobre ✕ (treure de la competició)
    await p3.locator('input.selbox[data-id=e021]').focus();
    await p3.keyboard.down(' '); await tutorNote('e003'); await p3.waitForTimeout(60); await p3.keyboard.up(' '); await p3.waitForTimeout(100);
    assert.ok(await p3.locator('input.selbox[data-id=e021]').isChecked(), 'Espai marca la casella');
    assert.equal((await act3()).id, 'e021');
    await p3.locator('button[data-act=delEntry][data-id=e022]').focus();
    await p3.keyboard.down(' '); await tutorNote('e004'); await p3.waitForTimeout(60); await p3.keyboard.up(' '); await p3.waitForTimeout(150);
    assert.ok(await p3.evaluate(() => !curComp().entries.some(e => e.id === 'e022')), 'Espai sobre ✕ la treu');
    // les notes sí que hi són (s'han pintat en deixar anar)
    assert.equal(await p3.evaluate(() => curComp().entries.find(e => e.id === 'e004').scores.salt[0].v), 8.5);
    await p3.goto(url + '#/competicio/c418/classificacio'); await p3.waitForTimeout(200);
    await clickWithNote(p3.locator('button[data-act=printDlg]:visible').first(), 'e005');
    assert.ok(await p3.evaluate(() => $('#dlg').open), '«Imprimeix / PDF…» s’obre');
    await p3.evaluate(() => closeDialog());
    // Rotacions: el menú ⋯ obert no es tanca sol i el clic va a l'opció que es volia
    await load3('#/competicio/c418/rotacions');
    await p3.click('button[data-act=rotMake]'); await p3.waitForSelector('.card.rot-sub');
    await p3.evaluate(() => $$('.toast').forEach(t => t.remove()));
    await p3.locator('.card.rot-sub button[data-act=menuToggle]').first().click();
    const it = p3.locator('.menu.open button[data-act=rotRedoSub]');
    const b = await it.boundingBox();
    await p3.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await tutorNote('e006'); await p3.waitForTimeout(80);
    assert.ok(await p3.evaluate(() => !!$('.menu.open')), 'el menú es queda obert');
    await p3.mouse.down(); await p3.waitForTimeout(60); await p3.mouse.up();
    await p3.waitForSelector('#confirm[open], #dlg[open]');
    await p3.evaluate(() => { if ($('#confirm').open) $('#confirm').close(); if ($('#dlg').open) closeDialog(); });
    await p3.waitForTimeout(100);
    assert.equal(await p3.evaluate(() => curComp().entries.find(e => e.id === 'e006').scores.salt[0].v), 8.5, 'en tancar el menú, la nota es veu');
  });

  await step('«Entrada ràpida» amb el ratolí: una nota d’una altra gimnasta a mig clic no es menja cap xifra (8,5 es desa 8,5)', async () => {
    await load3('#/competicio/c418/notes');
    await p3.click('button[data-act=toggleQe]'); await p3.waitForSelector('#qe');
    const cur = await p3.evaluate(() => ({ id: qe.entryId, app: qeCtx().a.id, other: qeCtx().list.find(e => e.id !== qe.entryId).id }));
    for (const k of ['8', ',', '5']) {
      const key = p3.locator(`#qe button[data-act=qeKey][data-k="${k}"]`), b = await key.boundingBox();
      await p3.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await p3.mouse.down();
      if (k === '5') await tutorNote(cur.other, cur.app, 9);
      await p3.waitForTimeout(80); await p3.mouse.up(); await p3.waitForTimeout(60);
    }
    assert.equal(await p3.textContent('#qedisp'), '8,5');
    await p3.click('#qesave'); await p3.waitForTimeout(100);
    assert.equal(await p3.evaluate(([id, app]) => curComp().entries.find(x => x.id === id).scores[app][0].v, [cur.id, cur.app]), 8.5);
    assert.equal(await p3.evaluate(([id, app]) => curComp().entries.find(x => x.id === id).scores[app][0].v, [cur.other, cur.app]), 9);
  });

  await step('«Entrada ràpida» amb el teclat: Intro sobre «NP» o «◀» (amb el tabulador) fa el que diu el botó; després de clicar «NP» amb el ratolí, Intro desa', async () => {
    await load3('#/competicio/c418/notes');
    await p3.click('button[data-act=toggleQe]'); await p3.waitForSelector('#qe');
    const st = id => p3.evaluate(id => curComp().entries.find(e => e.id === id).status, id);
    const id0 = await p3.evaluate(() => qe.entryId);
    await p3.focus('#qe button[data-act=qeMove][data-d="-1"]'); await p3.keyboard.press('Tab');
    assert.equal((await act3()).act, 'qeNP');
    await p3.keyboard.press('Enter'); await p3.waitForTimeout(150);
    assert.equal(await st(id0), 'np', 'Intro sobre NP la marca');
    const id1 = await p3.evaluate(() => qe.entryId);
    assert.notEqual(id1, id0);
    await p3.focus('#qe button[data-act=qeNP]'); await p3.keyboard.press('Shift+Tab');
    assert.equal((await act3()).act, 'qeMove');
    await p3.keyboard.press('Enter'); await p3.waitForTimeout(150);
    assert.equal(await p3.evaluate(() => qe.entryId), id0, 'Intro sobre ◀ torna a l’anterior');
    // amb el ratolí: «Treu NP» (es queda a la mateixa gimnasta i el botó conserva el focus); s'escriu 8,5 + Intro: es desa
    await p3.click('#qe button[data-act=qeNP]'); await p3.waitForTimeout(150);
    assert.equal(await st(id0), '');
    assert.equal(await p3.evaluate(() => qe.entryId), id0);
    await p3.keyboard.type('8,5'); await p3.keyboard.press('Enter'); await p3.waitForTimeout(150);
    assert.equal(await st(id0), '', 'Intro no la torna a marcar NP');
    const app = await p3.evaluate(() => qeCtx().a.id);
    assert.equal(await p3.evaluate(([id, app]) => curComp().entries.find(e => e.id === id).scores[app][0].v, [id0, app]), 8.5);
  });

  await step('graella de Notes: la casella amb el focus mostra la nota nova de la tutora (si no s’hi ha escrit res) i la graella no torna a dalt', async () => {
    await load3('#/competicio/c418/notes');
    const eid = await p3.evaluate(() => $('#scoregrid input.sc[data-a=salt]').dataset.e);
    const cell = p3.locator(`#scoregrid input.sc[data-e=${eid}][data-a=salt]`);
    await tutorNote(eid, 'salt', 8); await p3.waitForTimeout(100);
    assert.equal(await cell.inputValue(), '8,00');
    await cell.click(); await p3.waitForTimeout(100);
    await tutorNote(eid, 'salt', 9); await p3.waitForTimeout(100);
    assert.equal(await cell.inputValue(), '9,00', 'la casella amb el focus, sense escriure-hi res');
    assert.ok(await cell.evaluate(el => el === document.activeElement && el.selectionStart === 0 && el.selectionEnd === el.value.length), 'continua seleccionada');
    // s'hi escriu la mateixa nota que hi havia (8,00 → 9,00 → s'escriu 9,00) mentre arriba una correcció: en sortir, la nova
    await p3.keyboard.type('9,00'); await tutorNote(eid, 'salt', 9.5); await p3.waitForTimeout(100);
    assert.equal(await cell.inputValue(), '9,00', 'el que s’escriu no es toca');
    await p3.keyboard.press('Tab'); await p3.waitForTimeout(150);
    assert.equal(await cell.inputValue(), '9,50', 'en sortir sense canviar res, la que hi ha desada');
    assert.equal(await p3.textContent(`[data-out="tot:${eid}"]`), await p3.evaluate(id => fmt(Engine.entryTotal(curComp(), curComp().entries.find(e => e.id === id))), eid));
    // un grup llarg, avall de tot: s'obre una altra pestanya (aquesta queda en pausa), hi desa i es tanca: aquesta continua
    // amb les seves dades, i la graella no torna a dalt (la casella es continua veient i té el focus)
    await p3.evaluate(() => { const g = groupsOf(curComp()).sort((a, b) => b.entries.length - a.entries.length)[0]; ui.group = g.key; ui.app = 'all'; render(); });
    const ids = await p3.evaluate(() => $$('#scoregrid input.sc[data-a=salt]').map(x => x.dataset.e));
    const low = p3.locator(`#scoregrid input.sc[data-a=salt][data-e=${ids[ids.length - 2]}]`);
    await low.scrollIntoViewIfNeeded(); await low.click();
    const top0 = await p3.evaluate(() => $('#scoregrid').closest('.grid-wrap').scrollTop);
    assert.ok(top0 > 100, 'la graella té la seva barra i és avall: ' + top0);
    const other = await ctx3.newPage(); await other.goto(url + '#/gimnastes'); await other.waitForTimeout(200);
    await p3.waitForSelector('#pause[open]');
    await other.evaluate(() => { db.clubs.push({ id: 'cx', name: 'Club nou' }); commit(); flush(); });
    await other.close();
    await p3.waitForFunction(() => !win.paused && db.clubs.some(c => c.id === 'cx'));
    await p3.waitForTimeout(150);
    const inf = await p3.evaluate(() => { const w = $('#scoregrid').closest('.grid-wrap'), a = document.activeElement, wr = w.getBoundingClientRect(), r = a.getBoundingClientRect(); return { top: w.scrollTop, e: a.dataset.e, vis: r.top >= wr.top && r.bottom <= wr.bottom }; });
    assert.deepEqual(inf, { top: top0, e: ids[ids.length - 2], vis: true });
  });

  // només una pestanya pot canviar les dades alhora: la que s'obre (o on es clica «Treballa en aquesta finestra»); l'altra
  // queda en pausa
  const paused = p => p.evaluate(() => win.paused && !!document.querySelector('#pause[open]'));
  await step('dues pestanyes: se n’obre una altra just mentre aquí s’escriu una nota (sense Intro): es desa abans de la pausa i l’altra la té (8,50 i 9,25)', async () => {
    await load3('#/competicio/c418/notes');
    await p3.evaluate(() => flush());
    const ids = await p3.evaluate(() => $$('#scoregrid input.sc[data-a=salt]').map(x => x.dataset.e));
    await p3.click(`#scoregrid input.sc[data-a=salt][data-e=${ids[0]}]`);
    await p3.keyboard.type('8,5'); await p3.keyboard.press('Enter');
    await p3.keyboard.type('9,25');
    const other = await ctx3.newPage(); await other.goto(url + '#/competicio/c418/notes'); await other.waitForTimeout(400);
    assert.ok(await paused(p3), 'aquesta queda en pausa');
    assert.equal(await paused(other), false, 'la que s’ha obert és la que mana');
    const v = p => p.evaluate(ids => ids.map(id => (((curComp().entries.find(e => e.id === id).scores || {}).salt || [])[0] || {}).v ?? null), ids.slice(0, 2));
    assert.deepEqual(await v(other), [8.5, 9.25], 'l’altra té les dues notes');
    assert.equal(await p3.evaluate(() => $$('.toast').filter(t => /altra pestanya/.test(t.textContent)).length), 0);
    await other.evaluate(() => { db.clubs.push({ id: 'cz', name: 'Club Z' }); commit(); flush(); });
    await other.close();
    await p3.waitForFunction(() => !win.paused, null, { timeout: 5000 });
    assert.deepEqual(await v(p3), [8.5, 9.25]);
    assert.ok(await p3.evaluate(() => db.clubs.some(c => c.id === 'cz')), 'i les dades de l’altra pestanya hi són');
    await p3.evaluate(() => $$('#fixtip').forEach(t => t.remove()));
  });

  await step('un formulari obert d’una inscripció, una fitxa o un equip que s’ha esborrat mentrestant: «Desa» no peta ni el torna a crear', async () => {
    const before = errors.length;
    await load3('#/competicio/c418/inscripcions');
    const eid = await p3.evaluate(() => curComp().entries[0].id);
    await p3.click(`a[data-act=editEntry][data-id=${eid}]`); await p3.waitForSelector('#dlg[open] form[data-form=entry]');
    await p3.evaluate(id => { const c = curComp(); c.entries = c.entries.filter(e => e.id !== id); }, eid);
    await p3.click('#dlg button.primary');
    await p3.waitForSelector('.toast:has-text("Aquesta inscripció ja no hi és")');
    assert.equal(await p3.evaluate(id => curComp().entries.some(e => e.id === id), eid), false);
    const gid = await p3.evaluate(() => db.gymnasts[0].id);
    await p3.evaluate(() => go('#/gimnastes')); await p3.click(`#gymtable a[data-act=editGym][data-id=${gid}]`); await p3.waitForSelector('#dlg[open] form[data-form=gym]');
    await p3.evaluate(id => { db.gymnasts = db.gymnasts.filter(g => g.id !== id); }, gid);
    await p3.click('#dlg button.primary');
    await p3.waitForSelector('.toast:has-text("Aquesta fitxa ja no hi és")');
    assert.equal(await p3.evaluate(id => db.gymnasts.some(g => g.id === id), gid), false);
    const t = await p3.evaluate(() => { const t = db.teams.find(x => x.memberIds.length > 1); return t && { id: t.id, m: t.memberIds }; });
    await p3.evaluate(() => go('#/equips')); await p3.click(`a[data-act=editTeam][data-id="${t.id}"]`); await p3.waitForSelector('#dlg[open] form[data-form=team]');
    await p3.evaluate(id => { db.teams = db.teams.filter(x => x.id !== id); }, t.id);
    await p3.click('#dlg button.primary');
    await p3.waitForSelector('.toast:has-text("Aquest equip ja no hi és")');
    assert.equal(await p3.evaluate(id => db.teams.some(x => x.id === id), t.id), false, 'l’equip no torna');
    assert.equal(errors.length, before, 'cap error a la pàgina');
  });

  await step('clicar al final d’un camp de text just després d’haver-ne canviat un altre: el cursor es queda on s’ha clicat («Terra lliure»)', async () => {
    await load3('#/competicio/c418/configuracio');
    const a0 = p3.locator('input[data-chg=app][data-k=name][data-i="0"]'), a2 = p3.locator('input[data-chg=app][data-k=name][data-i="2"]');
    await a0.click(); await p3.keyboard.press('End'); await p3.keyboard.type(' de poltre');
    const b = await a2.boundingBox();
    await p3.mouse.move(b.x + b.width - 6, b.y + b.height / 2); await p3.mouse.down(); await p3.waitForTimeout(100); await p3.mouse.up(); await p3.waitForTimeout(100);
    assert.deepEqual(await p3.evaluate(() => { const a = document.activeElement; return [a.dataset.i, a.selectionStart, a.selectionEnd]; }), ['2', 5, 5]);
    await p3.keyboard.type(' lliure'); await p3.keyboard.press('Tab'); await p3.waitForTimeout(150);
    assert.deepEqual(await p3.evaluate(() => [curComp().apparatus[0].name, curComp().apparatus[2].name]), ['Salt de poltre', 'Terra lliure']);
  });

  await step('canviar un desplegable amb el teclat no perd el focus (Inscripcions, «Fulls d’inscripció», «Enganxa des d’Excel»), i les pestanyes amb un nombre tampoc', async () => {
    await load3('#/competicio/c418/inscripcions');
    const team = p3.locator('select[data-chg=entryTeam][data-id=e060]');
    await team.scrollIntoViewIfNeeded(); await team.focus();
    const y0 = await p3.evaluate(() => scrollY), t0 = await p3.evaluate(() => curComp().entries.find(e => e.id === 'e060').teamId);
    await p3.keyboard.press('ArrowDown'); await p3.waitForTimeout(150);
    const t1 = await p3.evaluate(() => curComp().entries.find(e => e.id === 'e060').teamId);
    assert.notEqual(t1, t0);
    assert.deepEqual(await act3(), { tag: 'SELECT', chg: 'entryTeam', act: '', id: 'e060' });
    await p3.keyboard.press('ArrowDown'); await p3.waitForTimeout(150);
    assert.notEqual(await p3.evaluate(() => curComp().entries.find(e => e.id === 'e060').teamId), t1, 'la segona fletxa també canvia l’equip');
    assert.equal(await p3.evaluate(() => scrollY), y0, 'la pàgina no es mou');
    const stt = p3.locator('select[data-chg=entryStatus][data-id=e060]');
    await stt.focus(); await p3.keyboard.press('ArrowDown'); await p3.waitForTimeout(150);
    assert.equal(await p3.evaluate(() => curComp().entries.find(e => e.id === 'e060').status), 'np');
    assert.deepEqual(await act3(), { tag: 'SELECT', chg: 'entryStatus', act: '', id: 'e060' });
    // la pestanya «Notes 0/462»: arriba una nota (ara «1/462») i el focus s'hi queda
    await p3.focus('nav.tabs a[href$="/notes"]');
    await tutorNote('e001'); await p3.waitForTimeout(150);
    assert.ok(await p3.evaluate(() => document.activeElement.matches('nav.tabs a[href$="/notes"]')), 'el focus és a la pestanya Notes');
    await p3.keyboard.press('Enter'); await p3.waitForTimeout(150);
    assert.equal(await p3.evaluate(() => ui.tab), 'notes');
    // «Fulls d'inscripció»: el gènere d'una fila
    await load3('#/competicio/c418/inscripcions');
    await p3.click('button[data-act=inscOpen] >> visible=true'); await p3.waitForSelector('#dlg[open] #inscfile');
    await p3.setInputFiles('#inscfile', [path.join(here, 'fixtures', 'inscripcio-nivell-A.xlsx'), path.join(here, 'fixtures', 'inscripcio-nivell-B.xlsx')]);
    await p3.waitForSelector('#dlg select[data-chg=inscRowGender]');
    const rg = p3.locator('#dlg select[data-chg=inscRowGender]').nth(1);
    await rg.scrollIntoViewIfNeeded(); await rg.focus();
    const mark = await rg.evaluate(el => el.dataset.f + ':' + el.dataset.i);
    await p3.keyboard.press('ArrowDown'); await p3.waitForTimeout(150);
    assert.equal(await p3.evaluate(() => { const a = document.activeElement; return a.dataset.chg + ' ' + a.dataset.f + ':' + a.dataset.i; }), 'inscRowGender ' + mark);
    await p3.evaluate(() => closeDialog());
    // «Enganxa des d'Excel»: canviar què és una columna no torna a obrir el diàleg (ni la taula a la 1a columna)
    await p3.goto(url + '#/gimnastes'); await p3.waitForTimeout(150);
    await p3.click('button[data-act=importGyms] >> visible=true');
    const rows = [['Nom', 'Cognoms', 'Club', 'Gènere', 'Cat', 'Nivell', 'Any', 'Equip', 'Notes']];
    for (let i = 0; i < 40; i++) rows.push(['Nom' + i, 'Cognom' + i, 'CG Lleida', 'F', 'Aleví', 'A', '2015', '', 'x']);
    await p3.fill('#imptext', rows.map(r => r.join('\t')).join('\n'));
    await p3.click('#dlg button[data-act=impAnalyze]'); await p3.waitForSelector('#dlg select[data-chg=impMap][data-i="8"]');
    const sel = p3.locator('#dlg select[data-chg=impMap][data-i="8"]');
    await sel.scrollIntoViewIfNeeded(); await sel.focus();
    const left0 = await p3.evaluate(() => $('#dlg .tbl-wrap').scrollLeft), m0 = await p3.evaluate(() => ui.import.map[8]);
    assert.ok(left0 > 100, 'la taula és desplaçada cap a la dreta: ' + left0);
    await p3.keyboard.press('ArrowDown'); await p3.waitForTimeout(150);
    const m1 = await p3.evaluate(() => ui.import.map[8]);
    assert.notEqual(m1, m0);
    assert.deepEqual(await p3.evaluate(() => [document.activeElement.dataset.chg, document.activeElement.dataset.i, $('#dlg .tbl-wrap').scrollLeft]), ['impMap', '8', left0]);
    await p3.keyboard.press('ArrowDown'); await p3.waitForTimeout(150);
    assert.notEqual(await p3.evaluate(() => ui.import.map[8]), m1, 'la segona fletxa torna a canviar la columna');
    await p3.evaluate(() => closeDialog());
  });

  await step('mòbil petit (320 px): marcar una inscripció no fa créixer la barra de marcar (la llista no es mou)', async () => {
    const ph = await browser.newContext({ viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: 'ca-ES' });
    try {
      const pp = await ph.newPage();
      pp.on('pageerror', e => errors.push('pageerror (320 px): ' + e.message));
      await pp.goto(url);
      await pp.evaluate(r => { db = migrate(JSON.parse(r)); commit(); go('#/competicio/c418/inscripcions'); }, JSON.stringify(fixture()));
      await pp.waitForSelector('.selbar');
      const bar = () => pp.evaluate(() => Math.round(document.querySelector('.selbar').getBoundingClientRect().height));
      const rowY = () => pp.evaluate(() => Math.round(document.querySelector('input.selbox[data-id=e002]').getBoundingClientRect().top + scrollY));
      const h0 = await bar(), y0 = await rowY();
      await pp.locator('input.selbox[data-id=e001]').check(); await pp.waitForTimeout(100);
      assert.ok((await pp.textContent('.selbar .btn.danger')).includes('(1)'));
      assert.deepEqual([await bar(), await rowY()], [h0, y0]);
    } finally { await ph.close(); }
  });

  // ─── quarta revisió: el teclat de l'ordinador a l'entrada ràpida, els menús ⋯, «NP» a la graella, dues pestanyes i el
  // que arriba de les tutores a la graella (no mou cap casella i compta bé a tots els grups)
  await step('«Entrada ràpida» amb el teclat: Tab + Intro a «Treu NP» (de pressa) i després 8,5 + Intro desa la nota; Tab a «NP», arriba una nota (es torna a pintar) i Intro la marca NP', async () => {
    await load3('#/competicio/c418/notes');
    await p3.click('button[data-act=toggleQe]'); await p3.waitForSelector('#qe');
    const st = id => p3.evaluate(id => curComp().entries.find(e => e.id === id).status, id);
    const cur = await p3.evaluate(() => ({ id: qe.entryId, app: qeCtx().a.id, other: qeCtx().list.find(e => e.id !== qe.entryId).id }));
    await p3.focus('#qe button[data-act=qeMove][data-d="-1"]'); await p3.keyboard.press('Tab');
    assert.equal((await act3()).act, 'qeNP');
    await p3.waitForTimeout(700);   // (l'organitzadora mira la pantalla; mentrestant arriba la nota d'una tutora)
    await tutorNote(cur.other, cur.app, 9); await p3.waitForTimeout(150);
    assert.equal((await act3()).act, 'qeNP', 'el focus es queda a NP');
    await p3.keyboard.press('Enter'); await p3.waitForTimeout(150);
    assert.equal(await st(cur.id), 'np', 'Intro sobre «NP» (amb el tabulador) la marca, encara que s’hagi tornat a pintar');
    // torna a la mateixa gimnasta: Tab fins a «Treu NP» i Intro de seguida; després s'escriu la nota i Intro
    await p3.evaluate(id => { qe.jump = id; render(); }, cur.id);
    await p3.focus('#qe button[data-act=qeMove][data-d="-1"]'); await p3.keyboard.press('Tab');
    assert.equal(await p3.evaluate(() => document.activeElement.textContent.trim()), 'Treu NP');
    await p3.waitForTimeout(100); await p3.keyboard.press('Enter'); await p3.waitForTimeout(150);
    assert.equal(await st(cur.id), '');
    await p3.keyboard.type('8,5'); await p3.keyboard.press('Enter'); await p3.waitForTimeout(150);
    assert.equal(await st(cur.id), '', 'Intro no la torna a marcar NP');
    assert.equal(await p3.evaluate(([id, app]) => curComp().entries.find(e => e.id === id).scores[app][0].v, [cur.id, cur.app]), 8.5);
  });

  await step('«Entrada ràpida»: el teclat no es mou d’una gimnasta a la següent (noms i entitats llargs, NP, nota de la tutora) ni quan surt «Volies dir 9,50?» (320, 360 i 1366 px)', async () => {
    for (const [w, hh, phone] of [[320, 568, true], [360, 640, true], [1366, 768, false]]) {
      const cx = await browser.newContext({ viewport: { width: w, height: hh }, isMobile: phone, hasTouch: phone, locale: 'ca-ES' });
      try {
        const pp = await cx.newPage();
        pp.on('pageerror', e => errors.push(`pageerror (teclat ${w}): ` + e.message));
        await pp.goto(url);
        await pp.evaluate(r => { db = migrate(JSON.parse(r)); ui.qe = true; commit(); go('#/competicio/c418/notes'); }, JSON.stringify(fixture()));
        await pp.waitForSelector('#qe');
        const places = await pp.evaluate(() => {
          const L = qeCtx().list, gym = k => db.gymnasts.find(x => x.id === L[k].gymnastId);
          gym(1).name = 'Maria del Carme Montserrat'; gym(1).surname = 'Puig i Soler de la Torre';
          db.clubs.find(c => c.id === L[2].clubId).name = 'Club Gimnàstic Artístic de Lleida i comarques del Segrià';
          L[3].status = 'np'; L[4].scores = { salt: [{ v: 9.5, at: Date.now(), by: 'tutor', who: 'Maria Antònia de les Borges Blanques' }] };
          commit(); render();
          const key = () => Math.round(document.querySelector('.qe-keys button[data-k="5"]').getBoundingClientRect().y + scrollY), at = new Set();
          for (const e of L.slice(0, 8)) { qe.jump = e.id; render(); at.add(key()); }
          for (const b of ['95', '2', '0', '7,5', '']) { qe.buf = b; qeRefresh(); at.add(key()); }
          return [...at];
        });
        assert.equal(places.length, 1, `${w} px: la tecla 5 a ${places.join(', ')}`);
        if (phone) { await pp.tap('#qe button[data-k="9"]'); await pp.tap('#qe button[data-k="5"]'); }
        else { await pp.keyboard.type('95'); }
        assert.ok((await pp.textContent('#qehint')).includes('Volies dir 9,50?'));
        assert.ok(await pp.evaluate(() => { const h = $('#qehint').getBoundingClientRect(), b = $('#qehint button').getBoundingClientRect(); return b.left >= h.left && b.right <= h.right && b.bottom <= h.bottom + 1; }), `${w} px: el botó «Volies dir…» es veu sencer`);
      } finally { await cx.close(); }
    }
  });

  await step('menú ⋯: Esc o sortir-ne amb el tabulador el tanca, i un menú que ja no es veu (tauleta girada) no atura el que s’ha de pintar', async () => {
    await load3('#/competicio/c418/rotacions');
    await p3.click('button[data-act=rotMake]'); await p3.waitForSelector('.card.rot-sub');
    await p3.evaluate(() => $$('.toast').forEach(t => t.remove()));
    const tg = p3.locator('.toolbar button[data-act=menuToggle]').first();
    await tg.focus(); await p3.keyboard.press('Enter'); await p3.waitForTimeout(100);
    assert.ok(await p3.evaluate(() => !!$('.menu.open')));
    for (let i = 0; i < 15 && await p3.evaluate(() => !!(document.activeElement.closest && document.activeElement.closest('.menu'))); i++) await p3.keyboard.press('Tab');
    await p3.waitForTimeout(100);
    assert.equal(await p3.evaluate(() => !!$('.menu.open')), false, 'sortir-ne amb el tabulador el tanca');
    await tg.focus(); await p3.keyboard.press('Enter'); await p3.waitForTimeout(100);
    await p3.keyboard.press('Tab'); await p3.keyboard.press('Escape'); await p3.waitForTimeout(100);
    assert.equal(await p3.evaluate(() => !!$('.menu.open')), false, 'Esc el tanca');
    assert.equal((await act3()).act, 'menuToggle', 'i el focus torna al botó ⋯');
    await p3.evaluate(() => { db.competitions[0].name = 'NOM NOU'; commit(); renderKeepFocus(); }); await p3.waitForTimeout(300);
    assert.equal((await p3.textContent('#main h1')).trim(), 'NOM NOU');
    // tauleta petita (vista de mòbil): s'obre el ⋯ de la competició i es gira (vista d'ordinador): el menú no es veu
    const tab = await browser.newContext({ viewport: { width: 600, height: 960 }, isMobile: true, hasTouch: true, locale: 'ca-ES' });
    try {
      const tp = await tab.newPage();
      tp.on('pageerror', e => errors.push('pageerror (tauleta): ' + e.message));
      await tp.goto(url);
      await tp.evaluate(r => { db = migrate(JSON.parse(r)); commit(); go('#/competicio/c418/classificacions'); }, JSON.stringify(fixture()));
      await tp.waitForTimeout(200);
      await tp.tap('.comp-head .show-ph button[data-act=menuToggle]'); await tp.waitForTimeout(150);
      assert.ok(await tp.evaluate(() => !!$('.menu.open .menu-list') && $('.menu.open .menu-list').offsetParent !== null));
      await tp.setViewportSize({ width: 960, height: 600 }); await tp.waitForTimeout(400);
      await tp.evaluate(() => { window.__pintat = 0; new MutationObserver(() => __pintat++).observe($('#main'), { childList: true }); });
      await tp.evaluate(() => { const r = JSON.parse(JSON.stringify(db)), e = r.competitions[0].entries[0]; e.scores = { salt: [{ v: 8.5, at: Date.now(), by: 'tutor', who: 'Anna' }] }; applyRemote(r, null); });
      await tp.waitForTimeout(400);
      assert.ok(await tp.evaluate(() => __pintat > 0 && !keepLater), 'la nota de la tutora es pinta');
    } finally { await tab.close(); }
  });

  await step('graella de Notes: després d’escriure «NP» en una casella, un clic amb el ratolí a una pestanya, un altre grup o «Entrada ràpida» fa el que diu (i la NP es desa)', async () => {
    const tryClick = async (sel, what) => {
      await load3('#/competicio/c418/notes');
      const cell = p3.locator('#scoregrid input.sc[data-a=salt]').nth(2), eid = await cell.getAttribute('data-e');
      await cell.click(); await p3.keyboard.type('NP');
      const before = await p3.evaluate(() => ({ group: ui.group, tab: ui.tab, qe: !!ui.qe }));
      const t = p3.locator(sel).first(); await t.scrollIntoViewIfNeeded(); const b = await t.boundingBox();
      await p3.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await p3.mouse.down(); await p3.waitForTimeout(120); await p3.mouse.up(); await p3.waitForTimeout(300);
      const after = await p3.evaluate(() => ({ group: ui.group, tab: ui.tab, qe: !!ui.qe }));
      assert.equal(await p3.evaluate(id => curComp().entries.find(e => e.id === id).status, eid), 'np', what + ': la NP es desa');
      assert.notEqual(after[what], before[what], what + ': el clic fa el que diu');
    };
    await tryClick('nav.tabs a[href$="/classificacions"]', 'tab');
    await tryClick('.pills button[data-g]:not(.on)', 'group');
    await tryClick('button[data-act=toggleQe]', 'qe');
  });

  await step('dues pestanyes: la que és en pausa no pot canviar res; «Treballa en aquesta finestra» passa d’una a l’altra i cap no trepitja el que ha desat l’altra', async () => {
    await load3('#/competicio/c418/inscripcions');
    await p3.evaluate(() => flush());
    const bibOf = (p, id) => p.evaluate(id => curComp().entries.find(e => e.id === id).bib, id);
    const bib = p3.locator('input[data-chg=bib]:visible').first(), id = await bib.getAttribute('data-id'), bib0 = await bibOf(p3, id);
    const other = await ctx3.newPage(); await other.goto(url + '#/competicio/c418/inscripcions'); await other.waitForTimeout(400);
    assert.ok(await paused(p3));
    // en pausa: ni el ratolí ni el teclat no hi arriben
    await p3.bringToFront();
    const r0 = await p3.evaluate(() => localStorage.getItem('notesgim.db'));
    await p3.mouse.click((await bib.boundingBox()).x + 10, (await bib.boundingBox()).y + 8);
    await p3.keyboard.type('999'); await p3.keyboard.press('Enter'); await p3.keyboard.press('Escape'); await p3.keyboard.press('Escape');
    await p3.waitForTimeout(300);
    assert.ok(await paused(p3), 'continua en pausa');
    assert.equal(await bibOf(p3, id), bib0, 'no ha canviat res');
    assert.equal(await p3.evaluate(() => localStorage.getItem('notesgim.db')), r0, 'no ha desat res');
    // «Treballa en aquesta finestra»: ara mana aquesta, l'altra queda en pausa
    await p3.click('#pause button:has-text("Treballa en aquesta finestra")');
    await p3.waitForFunction(() => !win.paused);
    assert.ok(await paused(other));
    await bib.click(); await p3.keyboard.press('Control+A'); await p3.keyboard.type('777'); await p3.keyboard.press('Tab'); await p3.waitForTimeout(300);
    assert.equal(await bibOf(p3, id), 777);
    await other.waitForFunction(id => curComp().entries.find(e => e.id === id).bib === 777, id);   // (l'altra ho veu)
    // i al revés
    await other.bringToFront();
    await other.click('#pause button:has-text("Treballa en aquesta finestra")');
    await other.waitForFunction(() => !win.paused);
    assert.ok(await paused(p3));
    await other.evaluate(() => { db.clubs.push({ id: 'cq', name: 'Club Q' }); commit(); flush(); });
    await p3.waitForFunction(() => db.clubs.some(c => c.id === 'cq'));
    await other.close();
    await p3.waitForFunction(() => !win.paused, null, { timeout: 5000 });
    assert.equal(await bibOf(p3, id), 777);
    assert.ok(await p3.evaluate(() => db.clubs.some(c => c.id === 'cq')), 'i les dades de l’altra pestanya hi són');
    const ls = await p3.evaluate(() => JSON.parse(localStorage.getItem('notesgim.db')));
    assert.ok(ls.clubs.some(c => c.id === 'cq') && ls.competitions.find(c => c.id === 'c418').entries.find(e => e.id === id).bib === 777);
    assert.equal(await p3.evaluate(() => $$('.toast').filter(t => /altra pestanya/.test(t.textContent)).length), 0, 'cap alarma');
  });

  await step('graella de Notes: el que arriba de les tutores no mou cap casella (nota sota el mínim «→ 3,00», primer salt amb «la mitjana»), i la pastilla d’un altre grup compta bé', async () => {
    for (const [w, hh] of [[1366, 768], [1024, 768]]) {
      await p3.setViewportSize({ width: w, height: hh });
      await load3('#/competicio/c418/notes');
      await p3.evaluate(() => { const s = curComp().apparatus.find(a => a.id === 'salt'); s.attempts = 2; s.rule = 'avg'; ui.app = 'all'; commit(); render(); });
      const ids = await p3.evaluate(() => [...new Set($$('#scoregrid input.sc').map(i => i.dataset.e))]);
      const pos = () => p3.evaluate(() => $$('#scoregrid input.sc').map(i => { const r = i.getBoundingClientRect(); return Math.round(r.x) + ':' + Math.round(r.y + scrollY); }).join(' '));
      const p0 = await pos();
      await tutorNote(ids[1], 'barra', 2.5); await p3.waitForTimeout(100);
      assert.ok(await p3.evaluate(() => $$('.minhint').some(x => x.textContent.includes('3,00'))), 'surt «→ 3,00»');
      assert.equal(await pos(), p0, `${w} px: «→ 3,00» no mou cap casella`);
      await tutorNote(ids[2], 'salt', 9.1); await p3.waitForTimeout(100);
      assert.ok((await p3.textContent('#progress')).includes('amb 1 intent'));
      assert.equal(await pos(), p0, `${w} px: «… amb 1 intent» no fa baixar la graella`);
    }
    await p3.setViewportSize({ width: 1366, height: 900 });
    // totes les notes d'un altre grup: la seva pastilla (i l'opció del desplegable) passa a ✓
    await load3('#/competicio/c418/notes');
    const o = await p3.evaluate(() => { const g = groupsOf(curComp()).filter(x => x.entries.length).find(x => x.key !== ui.group && x.entries.length <= 6); return { key: g.key, ids: g.entries.map(e => e.id), apps: Engine.enabledApps(curComp(), g.gender).map(a => a.id) }; });
    const pill = () => p3.evaluate(k => $$('button.pill[data-act=pickGroup]').find(x => x.dataset.g === k).textContent.replace(/\s+/g, ' ').trim(), o.key);
    assert.ok((await pill()).includes('falten'));
    await p3.evaluate(([ids, apps]) => {
      const r = JSON.parse(JSON.stringify(db)), c = r.competitions[0];
      for (const id of ids) { const e = c.entries.find(x => x.id === id); e.scores = {}; for (const a of apps) e.scores[a] = [{ v: 8, at: Date.now(), by: 'tutor', who: 'Anna' }]; }
      applyRemote(r, null);
    }, [o.ids, o.apps]);
    await p3.waitForTimeout(150);
    const now = await pill();
    assert.ok(now.endsWith('✓') && !now.includes('falten'), now);
    assert.ok(!(await p3.evaluate(k => $$('select[data-target=pickGroup] option').filter(x => x.value === k).map(x => x.textContent).join('|'), o.key)).includes('falten'));
  });

  // ─── sisena revisió (finestres de la taula): dues pestanyes que s'obren alhora, i el que s'escriu en una pestanya no es
  // desa mai com una altra cosa (ni en passar a una altra pestanya, ni si la finestra queda en segon pla)
  await step('dues pestanyes que s’obren alhora (el navegador torna a obrir les pestanyes en engegar-se): una treballa i l’altra queda en pausa, mai totes dues en pausa', async () => {
    for (let run = 0; run < 6; run++) {
      const c = await browser.newContext({ viewport: { width: 1200, height: 800 } });
      const a = await c.newPage(), b = await c.newPage();
      for (const p of [a, b]) p.on('pageerror', e => errors.push('pageerror (pestanyes alhora): ' + e.message));
      const ga = a.goto(url + '#/gimnastes'); if (run % 3) await new Promise(r => setTimeout(r, run % 3 === 1 ? 3 : 12)); const gb = b.goto(url + '#/gimnastes');
      await Promise.all([ga, gb]);
      await a.waitForTimeout(2500);
      const st = async () => (await Promise.all([a, b].map(p => p.evaluate(() => win.paused)))).map(x => x ? 'P' : 'a').join('');
      const s1 = await st();
      assert.ok(s1 === 'Pa' || s1 === 'aP', `${run}: ${s1}`);
      await a.waitForTimeout(1500);
      assert.equal(await st(), s1, `${run}: es queda així`);
      await c.close();
    }
  });

  const focused3 = () => p3.evaluate(() => { const el = document.activeElement; return { e: el.dataset.e, v: el.value, s: [el.selectionStart, el.selectionEnd] }; });
  await step('dues pestanyes: «8,» (de 8,5) escrit quan se n’obre una altra no es desa; en tornar-hi s’hi continua escrivint on s’havia deixat i es desa 8,5', async () => {
    await load3('#/competicio/c418/notes');
    await p3.evaluate(() => flush());
    const eid = await p3.evaluate(() => $('#scoregrid input.sc[data-a=salt]').dataset.e);
    const v = p => p.evaluate(id => (((curComp().entries.find(e => e.id === id).scores || {}).salt || [])[0] || {}).v ?? null, eid);
    const before = await v(p3);
    await p3.click(`#scoregrid input.sc[data-a=salt][data-e=${eid}]`); await p3.keyboard.type('8,');
    const other = await ctx3.newPage(); await other.goto(url + '#/competicio/c418/notes'); await other.waitForTimeout(400);
    assert.ok(await paused(p3));
    assert.equal(await v(other), before, 'l’altra no té «8,» (ni 8,00)');
    await p3.bringToFront();
    await p3.click('#pause button:has-text("Treballa en aquesta finestra")'); await p3.waitForFunction(() => !win.paused);
    assert.deepEqual(await focused3(), { e: eid, v: '8,', s: [2, 2] }, 'el camp tal com era, amb el cursor al final');
    await p3.keyboard.type('5'); await p3.keyboard.press('Enter'); await p3.waitForTimeout(300);
    assert.equal(await v(p3), 8.5);
    await other.close();
  });

  await step('la finestra es minimitza o queda tapada amb «8,» escrit: no es desa ni es toca res; en tornar-hi, «5» + Intro desa 8,5', async () => {
    await load3('#/competicio/c418/notes');
    const eid = await p3.evaluate(() => $$('#scoregrid input.sc[data-a=salt]')[1].dataset.e);
    const v = () => p3.evaluate(id => (((curComp().entries.find(e => e.id === id).scores || {}).salt || [])[0] || {}).v ?? null, eid);
    const before = await v();
    await p3.click(`#scoregrid input.sc[data-a=salt][data-e=${eid}]`); await p3.keyboard.type('8,');
    await p3.evaluate(() => {
      const el = document.activeElement;
      document.hasFocus = () => false;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new FocusEvent('blur')); el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      window.dispatchEvent(new FocusEvent('blur'));
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await p3.waitForTimeout(400);
    assert.equal(await v(), before, '«8,» no es desa');
    assert.deepEqual(await focused3(), { e: eid, v: '8,', s: [2, 2] });
    await p3.evaluate(() => {
      delete document.hasFocus; delete document.visibilityState;
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new FocusEvent('focus'));
      const el = document.activeElement;
      el.dispatchEvent(new FocusEvent('focus')); el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    });
    assert.deepEqual(await focused3(), { e: eid, v: '8,', s: [2, 2] }, 'en tornar-hi, el cursor on era');
    await p3.keyboard.type('5'); await p3.keyboard.press('Enter'); await p3.waitForTimeout(300);
    assert.equal(await v(), 8.5);
  });

  // ─── setena revisió (una temporada sencera): la mateixa gimnasta mai dues vegades (ha canviat d'entitat, l'any
  // estava malament o l'entitat s'ha escrit d'una altra manera), el canvi d'equip a la fitxa, un equip ple, una
  // competició passada entrada després i les sigles de les entitats
  const day = n => { const d = new Date(Date.now() + n * 864e5); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const G7 = (id, name, surname, clubId, birthYear, category = 'Aleví', extra = {}) => Object.assign({ id, name, surname, clubId, gender: 'F', category, level: 'A', birthYear: String(birthYear), notes: '', archived: false }, extra);
  const g7 = [G7('q1', 'Queralt', 'Mora', 'c2', 2015), G7('r1', 'Rut', 'Soler', 'c2', 2015), G7('s1', 'Sara', 'Vidal', 'c2', 2016),
    G7('j1', 'Júlia', 'Roca', 'c1', 2013, 'Infantil'), G7('h1', 'Helena', 'Pons', 'c1', 2015), G7('gg', 'Gina', 'Gil', 'c1', 2016), G7('i1', 'Iris', 'Font', 'c1', 2015),
    G7('d1', 'Dana', 'Mas', 'c1', 2016, 'Aleví', { noTeam: true }),
    G7('a1', 'Anna', 'Serra', 'c1', 2015, 'Aleví', { noTeam: true }), G7('b1', 'Berta', 'Pla', 'c1', 2015, 'Aleví', { noTeam: true }),
    G7('a3', 'Anna', 'Serra', 'c3', 2015, 'Aleví', { noTeam: true }), G7('b3', 'Berta', 'Pla', 'c3', 2015, 'Aleví', { noTeam: true }),
    ...[1, 2, 3, 4, 5, 6].map(i => G7('o' + i, 'Benjamina' + i, 'Prova', 'c1', 2017, 'Benjamí'))];
  const by7 = id => g7.find(g => g.id === id);
  const E7 = (k, id, bib, teamId = null, scores = {}, extra = {}) => Object.assign({ id: k + id, gymnastId: id, clubId: by7(id).clubId, gender: 'F', category: by7(id).category, level: 'A', bib, teamId, status: '', scores }, extra);
  const sc = v => ({ salt: [{ v, at: 1 }], barra: [{ v, at: 1 }], terra: [{ v, at: 1 }] });
  const hasSc = e => Object.values(e.scores || {}).some(l => (l || []).some(a => a && a.v != null));
  const ct7 = (id, name, clubId, src, category = 'Aleví', form) => Object.assign({ id, name, clubId, gender: 'F', category, level: 'A', sourceTeamId: src, auto: true }, form ? { form: true } : {});
  const seed7 = {
    app: 'notesgim', version: 1, settings: { org: 'PROVA', rev: 4 },
    clubs: [{ id: 'c1', name: 'CG Lleida' }, { id: 'c2', name: 'Escola Pardinyes' }, { id: 'c3', name: 'Club Gimnàstic Lleida' }],
    gymnasts: g7,
    teams: [
      { id: 'P1', name: 'Escola Pardinyes', clubId: 'c2', gender: 'F', category: 'Aleví', level: 'A', memberIds: ['q1', 'r1', 's1'], form: true },
      { id: 'T1', name: 'CG Lleida', clubId: 'c1', gender: 'F', category: 'Aleví', level: 'A', memberIds: ['h1', 'gg', 'i1'], form: true },
      { id: 'T6', name: 'CG Lleida', clubId: 'c1', gender: 'F', category: 'Benjamí', level: 'A', memberIds: ['o1', 'o2', 'o3', 'o4', 'o5', 'o6'] },
      // (un equip de l'entitat repetida, que es diu com ella)
      { id: 'T3', name: 'Club Gimnàstic Lleida 2', clubId: 'c3', gender: 'F', category: 'Aleví', level: 'A', memberIds: ['b3'] }],
    competitions: [
      // la 1a Fase ja s'ha fet (amb notes); la 2a Fase s'ha fet amb «Jornada següent» (equips copiats de les fitxes)
      { id: 'f1', name: '1a Fase', date: day(-20), place: 'Lleida', season: 'Curs 7', locked: false, autoTeams: true,
        teams: [ct7('f1p', 'Escola Pardinyes', 'c2', 'P1', 'Aleví', true), ct7('f1t', 'CG Lleida', 'c1', 'T1', 'Aleví', true)],
        entries: [E7('f1', 'q1', 1, 'f1p', sc(8)), E7('f1', 'r1', 2, 'f1p', sc(8.1)), E7('f1', 's1', 3, 'f1p', sc(8.2)), E7('f1', 'j1', 4, null, sc(8.3), { noAuto: true }),
          E7('f1', 'h1', 5, 'f1t', sc(8.4)), E7('f1', 'gg', 6, 'f1t', sc(8.5)), E7('f1', 'i1', 7, 'f1t', sc(8.6)),
          E7('f1', 'a1', 8, null, sc(8.7)), E7('f1', 'b1', 9, null, sc(8.8)), E7('f1', 'b3', 10, null, sc(8.9))] },
      { id: 'f2', name: '2a Fase', date: day(10), place: 'Alpicat', season: 'Curs 7', locked: false, autoTeams: true,
        teams: [ct7('f2p', 'Escola Pardinyes', 'c2', 'P1'), ct7('f2t', 'CG Lleida', 'c1', 'T1'), ct7('f2b', 'CG Lleida', 'c1', 'T6', 'Benjamí')],
        entries: [E7('f2', 'q1', 1, 'f2p'), E7('f2', 'r1', 2, 'f2p'), E7('f2', 's1', 3, 'f2p'), E7('f2', 'j1', 4, null, {}, { noAuto: true }),
          E7('f2', 'h1', 5, 'f2t'), E7('f2', 'gg', 6, 'f2t'), E7('f2', 'i1', 7, 'f2t'), E7('f2', 'd1', 8, null, {}, { noAuto: true }),
          E7('f2', 'a1', 9, null, {}, { noAuto: true }), E7('f2', 'a3', 10, null, {}, { noAuto: true }),
          ...[1, 2, 3, 4, 5, 6].map(i => E7('f2', 'o' + i, 10 + i, 'f2b', {}, i === 1 ? { status: 'np' } : {}))] },
      // una de més endavant, ja bloquejada
      { id: 'f3', name: '3a Fase', date: day(30), place: 'Lleida', season: 'Curs 7', locked: true, autoTeams: true, teams: [],
        entries: [E7('f3', 'd1', 1, null, {}, { noAuto: true })] },
    ],
    meta: { created: new Date().toISOString(), updated: new Date().toISOString(), dbId: 'proves7' },
  };
  const ctx7 = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ca-ES' });
  await ctx7.addInitScript(r => { if (!localStorage.getItem('notesgim.db')) localStorage.setItem('notesgim.db', r); }, JSON.stringify(seed7));
  const p7 = await ctx7.newPage();
  p7.on('pageerror', e => errors.push('pageerror (7a revisió): ' + e.message));
  p7.on('console', m => { if (m.type() === 'error') errors.push('console (7a revisió): ' + m.text()); });
  const d7 = () => p7.evaluate(() => JSON.parse(JSON.stringify(db)));
  const fx7 = n => path.join(here, 'fixtures', n);
  const toast7 = async re => { await p7.waitForFunction(r => $$('.toast').some(t => new RegExp(r).test(t.textContent)), re.source); return p7.evaluate(r => $$('.toast').filter(t => new RegExp(r).test(t.textContent)).pop().textContent, re.source); };
  const row7 = (txt) => p7.locator('#dlg tr', { hasText: txt });

  await step('full d’una entitat amb una gimnasta que abans era d’una altra entitat i dues amb l’any corregit: «ja hi és (abans a …)», una sola fitxa i una sola inscripció de cadascuna', async () => {
    await p7.goto(url + '#/competicio/f2/inscripcions');
    await p7.click('button[data-act=inscOpen] >> visible=true');
    await p7.setInputFiles('#inscfile', [fx7('inscripcio-canvis-entitat.xlsx')]);
    await p7.waitForSelector('#dlg >> text=inscripcio-canvis-entitat.xlsx');
    assert.equal(await p7.locator('#dlg select[data-chg=inscClub]').inputValue(), 'c1', '«C.G. LLEIDA» és «CG Lleida»');
    assert.ok((await row7('Mora, Queralt').textContent()).includes('ja hi és (abans a Escola Pardinyes)'), await row7('Mora, Queralt').textContent());
    assert.ok((await row7('Roca, Júlia').textContent()).includes('(any 2013)'));
    assert.ok((await row7('Pons, Helena').textContent()).includes('(any 2015)'));
    assert.equal(await row7('Mora, Queralt').locator('select[data-chg=inscRowSame]').inputValue(), 'q1', 'per defecte és la mateixa');
    assert.ok((await p7.locator('#dlg').textContent()).includes('3 gimnastes del full ja hi són amb una altra entitat o un altre any'));
    // «és una altra»: seria una fitxa nova (i es pot tornar enrere)
    await row7('Roca, Júlia').locator('select[data-chg=inscRowSame]').selectOption('__other');
    await p7.waitForFunction(() => /nova/.test([...document.querySelectorAll('#dlg tr')].find(t => t.textContent.includes('Roca, Júlia')).cells[0].textContent));
    assert.ok((await row7('Roca, Júlia').textContent()).includes('n’hi ha una amb aquest nom: CG Lleida · any 2013'));
    await row7('Roca, Júlia').locator('select[data-chg=inscRowSame]').selectOption('j1');
    await p7.waitForFunction(() => /ja hi és/.test([...document.querySelectorAll('#dlg tr')].find(t => t.textContent.includes('Roca, Júlia')).cells[0].textContent));
    await p7.click('#dlg button[data-act=inscDo]');
    const t = await toast7(/Fulls d’inscripció importats/);
    assert.ok(t.includes('0 fitxes noves, 5 actualitzades') && t.includes('cap inscripció nova'), t);
    assert.ok(t.includes('Ha canviat d’entitat: Queralt Mora (abans a Escola Pardinyes)'), t);
    // (la Dana Mas és de la mateixa entitat i grup i no surt al full; les que hi surten amb un altre any, no s'hi diuen)
    assert.ok(/també hi (ha|són) [^.]*Dana Mas/.test(t) && !/Júlia Roca|Helena Pons/.test(t.split('també hi')[1] || ''), t);
    // (l'equip de l'entitat d'abans es queda sense prou gimnastes: es diu)
    assert.ok(t.includes('«Escola Pardinyes» es queda amb 2: no arriba al mínim (3)'), t);
    const d = await d7(), f1 = d.competitions.find(c => c.id === 'f1'), f2 = d.competitions.find(c => c.id === 'f2');
    const named = n => d.gymnasts.filter(g => g.name + ' ' + g.surname === n);
    for (const n of ['Queralt Mora', 'Júlia Roca', 'Helena Pons']) {
      assert.equal(named(n).length, 1, 'una sola fitxa: ' + n);
      assert.equal(f2.entries.filter(e => e.gymnastId === named(n)[0].id).length, 1, 'una sola inscripció a la 2a Fase: ' + n);
    }
    assert.equal(named('Queralt Mora')[0].clubId, 'c1', 'la fitxa és de la seva entitat d’ara');
    assert.ok(!d.teams.find(x => x.id === 'P1').memberIds.includes('q1'), 'i ja no és a l’equip de l’entitat d’abans');
    assert.equal(named('Júlia Roca')[0].birthYear, '2014');
    assert.equal(named('Helena Pons')[0].birthYear, '2016');
    const eq = f2.entries.find(e => e.gymnastId === 'q1');
    assert.ok(eq.clubId === 'c1' && !eq.teamId, 'a la 2a Fase, de CG Lleida i individual');
    assert.equal(f1.entries.find(e => e.gymnastId === 'q1').clubId, 'c2', 'la 1a Fase (passada) no canvia');
    assert.equal((f2.teams.find(x => x.id === f2.entries.find(e => e.gymnastId === 'h1').teamId) || {}).name, 'CG Lleida');
  });

  await step('canviar l’equip a la fitxa (o a la llista) també val per a la competició que ve amb els equips del full, i diu on no ha canviat i per què', async () => {
    await p7.goto(url + '#/gimnastes');
    await p7.waitForSelector('#gymtable');
    await p7.locator('select[data-chg=gymTeamInline][data-id=d1]').first().selectOption('T1');
    const t = await toast7(/Dana Mas → CG Lleida/);
    assert.ok(t.includes('També a: 2a Fase.'), t);
    assert.ok(t.includes('A 3a Fase continua com a individual: les notes hi estan bloquejades.'), t);
    const d = await d7(), f2 = d.competitions.find(c => c.id === 'f2'), e = f2.entries.find(x => x.gymnastId === 'd1');
    const ct = f2.teams.find(x => x.id === e.teamId);
    assert.ok(ct && ct.sourceTeamId === 'T1' && ct.form === true, 'a l’equip del full de la 2a Fase');
    assert.ok(!d.competitions.find(c => c.id === 'f3').entries[0].teamId, 'la bloquejada no canvia');
  });

  await step('un equip ple (6 de 6): abans de desar es diu; «Només en aquesta competició» no el fa passar del màxim a la fitxa, «També a la fitxa» sí (i ho avisa)', async () => {
    await p7.goto(url + '#/competicio/f2/inscripcions');
    const add = async (name, choice) => {
      await p7.click('button[data-act=newGymHere][data-g="Benjamí||F||A"]'); await p7.waitForSelector('#dlg[open] form[data-form=gym]');
      await p7.fill('#dlg input[name=name]', name); await p7.fill('#dlg input[name=surname]', 'Substituta');
      await p7.fill('#dlg input[name=club]', 'CG Lleida'); await p7.press('#dlg input[name=club]', 'Tab');
      const opt = await p7.locator('#dlg select[name=team] option', { hasText: 'CG Lleida — 6/6 · ple' }).getAttribute('value');
      await p7.selectOption('#dlg select[name=team]', opt);
      await p7.click('#dlg button.primary');
      await p7.waitForSelector('#confirm[open]');
      const txt = await p7.locator('#confirm').textContent();
      assert.ok(txt.includes('ja té 6 gimnastes a la fitxa (el màxim és 6)') && txt.includes('Només en aquesta competició') && txt.includes('no classificarà'), txt);
      await p7.click(`#confirm button[value=${choice}]`);
      return toast7(new RegExp(name + ' Substituta: desat'));
    };
    const t1 = await add('Txell', 'comp');
    assert.ok(t1.includes('(només en aquesta competició)') && t1.includes('A la fitxa, l’equip es queda amb 6.'), t1);
    let d = await d7(), f2 = d.competitions.find(c => c.id === 'f2');
    const tx = d.gymnasts.find(g => g.name === 'Txell');
    assert.equal(d.teams.find(x => x.id === 'T6').memberIds.length, 6, 'la fitxa de l’equip es queda amb 6');
    assert.ok(!tx.noTeam && !d.teams.some(x => x.memberIds.includes(tx.id)), 'la seva fitxa, sense equip');
    assert.equal(f2.entries.find(e => e.gymnastId === tx.id).teamId, 'f2b', 'avui, a l’equip');
    const t2 = await add('Mia', 'rec');
    assert.ok(t2.includes('ara en té 7 a la fitxa i el màxim és 6') && t2.includes('no classificarà'), t2);
    d = await d7();
    assert.equal(d.teams.find(x => x.id === 'T6').memberIds.length, 7);
    // a la llista de gimnastes: també es diu, i «Cancel·la» no canvia res
    await p7.goto(url + '#/gimnastes'); await p7.waitForSelector('#gymtable');
    await p7.locator('select[data-chg=gymTeamInline][data-id=a1]').first().selectOption('T1');
    assert.equal(await p7.locator('#confirm[open]').count(), 0, 'un equip amb lloc no pregunta res');
    await toast7(/Anna Serra → CG Lleida/);
    // (l'equip de la fitxa, ple: 5 + una fitxa que no és de ningú)
    await p7.evaluate(() => { const t = db.teams.find(x => x.id === 'T1'); t.memberIds.push('zz'); commit(); render(); });
    await p7.waitForSelector('#gymtable');
    await p7.locator('select[data-chg=gymTeamInline][data-id=b1]').first().selectOption('T1');
    await p7.waitForSelector('#confirm[open]');
    assert.ok((await p7.locator('#confirm').textContent()).includes('ja té 6 gimnastes'));
    await p7.click('#confirm button[value=""]');
    await p7.waitForTimeout(150);
    assert.equal(await p7.locator('select[data-chg=gymTeamInline][data-id=b1]').first().inputValue(), '__none');
    assert.ok(!(await d7()).teams.find(x => x.id === 'T1').memberIds.includes('b1'));
    await p7.evaluate(() => { const t = db.teams.find(x => x.id === 'T1'); t.memberIds = t.memberIds.filter(id => id !== 'zz'); commit(); render(); });
  });

  await step('«Fusiona amb…» dues entitats que són la mateixa: les fitxes repetides es fan una (amb les inscripcions); on totes dues tenen notes, es queden totes dues i es diu', async () => {
    await p7.goto(url + '#/entitats');
    await p7.selectOption('select[data-chg=clubMerge][data-id=c3]', 'c1');
    await p7.waitForSelector('#confirm[open]');
    const txt = await p7.locator('#confirm').textContent();
    assert.ok(txt.includes('2 gimnastes surten a totes dues entitats') && txt.includes('Anna Serra') && txt.includes('Berta Pla'), txt);
    await p7.click('#confirm button[value=gyms]');
    const t = await toast7(/fusionada amb «CG Lleida»/);
    assert.ok(t.includes('1 fitxa repetida ajuntada') && t.includes('Berta Pla no s’ha ajuntat: a 1a Fase totes dues fitxes tenen notes'), t);
    assert.ok(t.includes('L’equip «Club Gimnàstic Lleida 2» ara es diu «CG Lleida 2»'), t);
    const d = await d7(), f1 = d.competitions.find(c => c.id === 'f1'), f2 = d.competitions.find(c => c.id === 'f2');
    assert.deepEqual(d.gymnasts.filter(g => g.name === 'Anna').map(g => g.id), ['a1']);
    assert.equal(f2.entries.filter(e => e.gymnastId === 'a1').length, 1, 'una sola inscripció a la 2a Fase');
    assert.ok(!f2.entries.some(e => e.gymnastId === 'a3'));
    assert.equal(d.gymnasts.filter(g => g.name === 'Berta').length, 2, 'la Berta, totes dues (cap nota perduda)');
    assert.equal(f1.entries.filter(e => hasSc(e)).length, 10, 'cap nota perduda a la 1a Fase');
    assert.ok(!d.clubs.some(c => c.id === 'c3'));
    assert.ok(d.teams.find(x => x.id === 'T3').name === 'CG Lleida 2' && d.teams.find(x => x.id === 'T3').clubId === 'c1');
  });

  await step('un full amb l’entitat escrita d’una altra manera («CLUB GIMNÀSTIC LLEIDA») i les gimnastes de «CG Lleida»: es tria «CG Lleida» i es diu', async () => {
    await p7.goto(url + '#/gimnastes');
    await p7.click('button[data-act=inscOpen] >> visible=true');
    await p7.setInputFiles('#inscfile', [fx7('inscripcio-nom-diferent.xlsx')]);
    await p7.waitForSelector('#dlg >> text=inscripcio-nom-diferent.xlsx');
    assert.equal(await p7.locator('#dlg select[data-chg=inscClub]').inputValue(), 'c1');
    assert.ok((await p7.locator('#dlg').textContent()).includes('Al full l’entitat és «CLUB GIMNÀSTIC LLEIDA», però gairebé totes les gimnastes ja són de CG Lleida'));
    // (si es tria «Nova», les que ja hi són ho diuen; com que CG Lleida ja les ha inscrites a la 2a Fase amb el seu
    // full, per defecte són unes altres gimnastes, i a la fila es diu per què)
    await p7.selectOption('#dlg select[data-chg=inscClub]', '__new');
    await p7.waitForFunction(() => /n’hi ha una amb aquest nom: CG Lleida/.test($('#dlg').textContent));
    assert.ok((await p7.locator('#dlg').textContent()).includes('3 gimnastes del full es diuen com gimnastes d’una altra entitat que el full de la seva entitat ja ha inscrit a 2a Fase'));
    assert.ok((await row7('Pons, Helena').textContent()).includes('CG Lleida · any 2016, ja és al full de la seva entitat per a 2a Fase'), await row7('Pons, Helena').textContent());
    assert.equal(await row7('Pons, Helena').locator('select[data-chg=inscRowSame]').inputValue(), '__other');
    await p7.click('#dlg button[data-act=closeDlg]');
  });

  await step('entitats en majúscules dels fulls: les sigles es queden («INEF Lleida»), «al full:» diu el que diu el full i el nom d’una entitat nova es pot canviar abans d’importar', async () => {
    assert.deepEqual(await p7.evaluate(() => ['INEF LLEIDA', 'CEIP PARDINYES', 'UE LLEIDA', 'AEE GIMNÀSTICA BALAGUER', 'ESCOLA SAFA', 'FEDAC LLEIDA', 'C.G. LLEIDA', 'CEIP JOAN XXIII', "AMPA DE L'ESCOLA", 'Inef Lleida'].map(entityCase)),
      ['INEF Lleida', 'CEIP Pardinyes', 'UE Lleida', 'AEE Gimnàstica Balaguer', 'Escola SAFA', 'FEDAC Lleida', 'C.G. Lleida', 'CEIP Joan XXIII', "AMPA de l'Escola", 'Inef Lleida']);
    await p7.goto(url + '#/gimnastes');
    await p7.click('button[data-act=inscOpen] >> visible=true');
    await p7.setInputFiles('#inscfile', [fx7('inscripcio-inef.xlsx')]);
    await p7.waitForSelector('#dlg >> text=inscripcio-inef.xlsx');
    assert.ok((await p7.locator('#dlg label.f span').first().textContent()).includes('(al full: INEF LLEIDA)'));
    assert.equal(await p7.locator('#dlg select[data-chg=inscClub] option:checked').textContent(), 'Nova: INEF Lleida');
    await p7.fill('#dlg input[data-chg=inscClubName]', 'INEF de Lleida'); await p7.press('#dlg input[data-chg=inscClubName]', 'Tab');
    await p7.waitForFunction(() => $('#dlg select[data-chg=inscClub] option:checked').textContent === 'Nova: INEF de Lleida');
    assert.ok((await p7.locator('#dlg').textContent()).includes('INEF de Lleida (Aleví A, 3)'), 'l’equip ja es diu com l’entitat');
    // (si s'hi escriu el nom d'una que ja hi és, és aquella)
    await p7.fill('#dlg input[data-chg=inscClubName]', 'cg lleida'); await p7.press('#dlg input[data-chg=inscClubName]', 'Tab');
    await p7.waitForFunction(() => $('#dlg select[data-chg=inscClub]').value === 'c1');
    await p7.click('#dlg button[data-act=closeDlg]');
    assert.ok(!(await d7()).clubs.some(c => /INEF/.test(c.name)), 'Cancel·la no importa res');
  });

  await step('fulls dels clubs d’una competició que ja ha passat (feta en paper): les fitxes noves tenen els equips del full i «Jornada següent» els proposa tal qual', async () => {
    await p7.evaluate(d => { db.competitions.push(normalizeComp({ id: 'fp', name: 'Fase en paper', date: d, place: 'Lleida', season: 'Curs 7', locked: false, autoTeams: true, teams: [], entries: [] }, S().compDefaults)); commit(); }, day(-5));
    await p7.goto(url + '#/competicio/fp/inscripcions');
    await p7.click('button[data-act=inscOpen] >> visible=true');
    await p7.setInputFiles('#inscfile', [fx7('inscripcio-inef.xlsx')]);
    await p7.waitForSelector('#dlg >> text=inscripcio-inef.xlsx');
    await p7.click('#dlg button[data-act=inscDo]');
    const t = await toast7(/Fulls d’inscripció importats/);
    assert.ok(t.includes('És una competició que ja ha passat: les fitxes ja tenen l’equip que diu el full, o «només individual», per a la jornada següent.'), t);
    let d = await d7();
    const club = d.clubs.find(c => c.name === 'INEF Lleida');
    const team = d.teams.find(x => x.clubId === club.id);
    assert.ok(team && team.name === 'INEF Lleida' && team.form === true && team.memberIds.length === 3, JSON.stringify(team));
    assert.ok(d.gymnasts.find(g => g.name === 'Paula').noTeam, 'la de la fulla individual, «només individual»');
    // «Jornada següent»
    await p7.goto(url + '#/competicions');
    await p7.click('button[data-act=dupComp][data-id=fp]'); await p7.waitForSelector('#dlg[open] form[data-form=comp]');
    await p7.fill('#dlg input[name=name]', 'Fase següent'); await p7.fill('#dlg input[name=date]', day(15));
    await p7.click('#dlg button.primary'); await p7.waitForFunction(() => !$('#dlg').open);
    d = await d7();
    const nc = d.competitions.find(c => c.name === 'Fase següent'), nt = nc.teams.filter(x => x.clubId === club.id);
    assert.deepEqual(nt.map(x => [x.name, nc.entries.filter(e => e.teamId === x.id).length]), [['INEF Lleida', 3]], 'l’equip del full');
    assert.ok(!nc.entries.find(e => e.gymnastId === d.gymnasts.find(g => g.name === 'Paula').id).teamId, 'la individual, individual');
  });

  await step('canviar el nom d’una entitat a Entitats proposa canviar també el dels seus equips que es diuen com ella', async () => {
    await p7.goto(url + '#/entitats');
    const id = await p7.evaluate(() => db.clubs.find(c => c.name === 'INEF Lleida').id);
    const teamNames = async () => { const d = await d7(); return [...new Set([d.teams, ...d.competitions.map(c => c.teams)].flat().filter(x => x.clubId === id).map(x => x.name))]; };
    // (només les majúscules: també es proposa; aquí es diu que no)
    await p7.fill(`input[data-chg=clubName][data-id="${id}"]`, 'Inef Lleida'); await p7.press(`input[data-chg=clubName][data-id="${id}"]`, 'Tab');
    await p7.waitForSelector('#confirm[open]');
    assert.ok((await p7.locator('#confirm').textContent()).includes('«INEF Lleida» → «Inef Lleida»'));
    await p7.click('#confirm button[value=no]');
    await p7.waitForTimeout(150);
    assert.deepEqual(await teamNames(), ['INEF Lleida'], 'si es diu que no, els equips no canvien');
    await p7.fill(`input[data-chg=clubName][data-id="${id}"]`, 'INEF Lleida Centre'); await p7.press(`input[data-chg=clubName][data-id="${id}"]`, 'Tab');
    await p7.waitForSelector('#confirm[open]');
    assert.ok((await p7.locator('#confirm').textContent()).includes('«INEF Lleida» → «INEF Lleida Centre»'));
    await p7.click('#confirm button[value=ok]');
    await toast7(/nom d’equip canviat/);
    assert.deepEqual(await teamNames(), ['INEF Lleida Centre'], 'a la llista d’equips i a totes les competicions');
  });

  // ─── setena revisió (comprovació): dues gimnastes amb el mateix nom a dues entitats, cadascuna al full de la seva
  // (arribin en l'ordre que arribin, o el dia mateix amb les notes posades), una competició passada amb una gimnasta que
  // ha canviat d'entitat, «Importa» just després d'escriure el nom de l'entitat nova i els textos (un, una, sense entitat)
  // CG Lleida: la Queralt Mora (individual) i la Helena Pons (equip) ja han competit a la 1a Fase; la 2a Fase s'ha fet
  // amb «Jornada següent». L'Escola Pardinyes porta al seu full una altra Queralt Mora i una altra Helena Pons.
  const seed8 = ({ f1Date = day(-20) } = {}) => {
    const gs = [G7('q1', 'Queralt', 'Mora', 'c1', 2015, 'Aleví', { noTeam: true }), G7('h1', 'Helena', 'Pons', 'c1', 2016), G7('gg', 'Gina', 'Gil', 'c1', 2016),
      G7('i1', 'Iris', 'Font', 'c1', 2015), G7('j1', 'Júlia', 'Roca', 'c1', 2014, 'Infantil', { noTeam: true }),
      G7('r2', 'Rut', 'Soler', 'c2', 2015, 'Aleví', { noTeam: true }), G7('s2', 'Sara', 'Vidal', 'c2', 2016, 'Aleví', { noTeam: true })];
    const E8 = (k, g, bib, teamId = null, scores = {}) => ({ id: k + g.id, gymnastId: g.id, clubId: g.clubId, gender: 'F', category: g.category, level: 'A', bib, teamId, status: '', scores, ...(teamId ? {} : { noAuto: true }) });
    return { app: 'notesgim', version: 1, settings: { org: 'PROVA', rev: 4 },
      clubs: [{ id: 'c1', name: 'CG Lleida' }, { id: 'c2', name: 'Escola Pardinyes' }],
      gymnasts: gs,
      teams: [{ id: 'T1', name: 'CG Lleida', clubId: 'c1', gender: 'F', category: 'Aleví', level: 'A', memberIds: ['h1', 'gg', 'i1'], form: true }],
      competitions: [
        { id: 'f1', name: '1a Fase', date: f1Date, place: 'Lleida', season: 'Curs 8', locked: false, autoTeams: true,
          teams: [ct7('f1t', 'CG Lleida', 'c1', 'T1', 'Aleví', true)],
          entries: gs.map((g, i) => E8('f1', g, i + 1, ['h1', 'gg', 'i1'].includes(g.id) ? 'f1t' : null, sc(8 + i / 10))) },
        { id: 'f2', name: '2a Fase', date: day(10), place: 'Alpicat', season: 'Curs 8', locked: false, autoTeams: true,
          teams: [ct7('f2t', 'CG Lleida', 'c1', 'T1')],
          entries: gs.map((g, i) => E8('f2', g, i + 1, ['h1', 'gg', 'i1'].includes(g.id) ? 'f2t' : null)) }],
      meta: { created: new Date().toISOString(), updated: new Date().toISOString(), dbId: 'proves8' } };
  };
  const open8 = async seed => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ca-ES' });
    await ctx.addInitScript(r => { if (!localStorage.getItem('notesgim.db')) localStorage.setItem('notesgim.db', r); }, JSON.stringify(seed));
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push('pageerror (7a revisió, mateix nom): ' + e.message));
    p.on('console', m => { if (m.type() === 'error') errors.push('console (7a revisió, mateix nom): ' + m.text()); });
    const data = () => p.evaluate(() => JSON.parse(JSON.stringify(db)));
    const row = txt => p.locator('#dlg tr', { hasText: txt });
    const toast = async re => { await p.waitForFunction(r => $$('.toast').some(t => new RegExp(r).test(t.textContent)), re.source); return p.evaluate(r => $$('.toast').filter(t => new RegExp(r).test(t.textContent)).pop().textContent, re.source); };
    // obre «Fulls d'inscripció» (a la competició, o a Gimnastes) amb el fitxer
    const sheet = async (hash, file) => {
      await p.goto(url + hash); await p.click('button[data-act=inscOpen] >> visible=true');
      await p.setInputFiles('#inscfile', [fx7(file)]); await p.waitForSelector(`#dlg >> text=${file}`);
    };
    const doImport = async () => { await p.evaluate(() => $$('.toast').forEach(t => t.remove())); await p.click('#dlg button[data-act=inscDo]'); return toast(/Fulls d’inscripció importats/); };
    return { ctx, p, data, row, toast, sheet, doImport };
  };
  const who8 = (d, n) => d.gymnasts.filter(g => g.name + ' ' + g.surname === n);

  await step('dues entitats porten cadascuna una Queralt Mora i una Helena Pons (primer el full de l’altra entitat): cadascuna té la seva fitxa i la seva inscripció, i la de sempre es queda amb les seves notes', async () => {
    const T = await open8(seed8()), { p } = T;
    // 1) el full de l'Escola Pardinyes: per defecte és la mateixa (ha canviat d'entitat)
    await T.sheet('#/competicio/f2/inscripcions', 'inscripcio-mateix-nom.xlsx');
    assert.equal(await p.locator('#dlg select[data-chg=inscClub]').inputValue(), 'c2');
    assert.ok((await T.row('Mora, Queralt').textContent()).includes('ja hi és (abans a CG Lleida)'));
    assert.ok((await p.locator('#dlg').textContent()).includes('2 gimnastes del full ja hi són amb una altra entitat o un altre any (surten marcades «ja hi és (abans a …)»): són les mateixes persones;'));
    let t = await T.doImport();
    assert.ok(t.includes('Han canviat d’entitat: Queralt Mora (abans a CG Lleida) i Helena Pons (abans a CG Lleida)'), t);
    let d = await T.data();
    assert.equal(d.gymnasts.find(g => g.id === 'q1').clubId, 'c2');
    // 2) després, el full del CG Lleida, que també les porta: són dues persones
    await T.sheet('#/competicio/f2/inscripcions', 'inscripcio-canvis-entitat.xlsx');
    assert.equal(await p.locator('#dlg select[data-chg=inscClub]').inputValue(), 'c1');
    assert.ok((await T.row('Mora, Queralt').textContent()).includes('ja hi és (també al full d’Escola Pardinyes: són dues)'), await T.row('Mora, Queralt').textContent());
    assert.equal(await T.row('Mora, Queralt').locator('select[data-chg=inscRowSame]').inputValue(), 'q1');
    assert.ok((await p.locator('#dlg').textContent()).includes('Queralt Mora i Helena Pons: el full d’Escola Pardinyes també en porta unes amb aquests noms'), await p.locator('#dlg').textContent());
    t = await T.doImport();
    assert.ok(t.includes('Són persones diferents amb el mateix nom, cadascuna amb la seva fitxa i la seva inscripció: Queralt Mora (CG Lleida i Escola Pardinyes) i Helena Pons (CG Lleida i Escola Pardinyes).'), t);
    assert.ok(!/Ha canviat d’entitat/.test(t), t);
    d = await T.data();
    const f1 = d.competitions.find(c => c.id === 'f1'), f2 = d.competitions.find(c => c.id === 'f2');
    for (const [n, id] of [['Queralt Mora', 'q1'], ['Helena Pons', 'h1']]) {
      const gs = who8(d, n);
      assert.deepEqual(gs.map(g => g.clubId).sort(), ['c1', 'c2'], 'dues fitxes: ' + n);
      assert.equal(d.gymnasts.find(g => g.id === id).clubId, 'c1', 'la fitxa de sempre torna a CG Lleida: ' + n);
      assert.ok(f1.entries.find(e => e.gymnastId === id && e.clubId === 'c1' && hasSc(e)), 'la 1a Fase (amb notes) és de la de sempre: ' + n);
      for (const g of gs) assert.equal(f2.entries.filter(e => e.gymnastId === g.id).length, 1, 'una inscripció cadascuna a la 2a Fase: ' + n);
      const other = gs.find(g => g.id !== id);
      assert.equal(f2.entries.find(e => e.gymnastId === other.id).clubId, 'c2');
      assert.equal(f2.entries.find(e => e.gymnastId === id).clubId, 'c1');
    }
    assert.equal(f2.entries.find(e => e.gymnastId === 'q1').bib, 1, 'el dorsal es queda amb la de sempre');
    const tn = e => (f2.teams.find(x => x.id === e.teamId) || {}).name || null;
    const helP = who8(d, 'Helena Pons').find(g => g.id !== 'h1');
    assert.equal(tn(f2.entries.find(e => e.gymnastId === 'h1')), 'CG Lleida');
    assert.equal(tn(f2.entries.find(e => e.gymnastId === helP.id)), 'Escola Pardinyes');
    assert.ok(d.teams.find(x => x.id === 'T1').memberIds.includes('h1') && d.teams.some(x => x.clubId === 'c2' && x.memberIds.includes(helP.id) && !x.memberIds.includes('h1')), 'cada una al seu equip de la fitxa');
    // 3) el full de l'Escola Pardinyes una altra vegada: ja són les seves, res de nou
    await T.sheet('#/competicio/f2/inscripcions', 'inscripcio-mateix-nom.xlsx');
    t = await T.doImport();
    assert.ok(t.includes('0 fitxes noves') && t.includes('cap inscripció nova') && !/canviat d’entitat|persones diferents/.test(t), t);
    const d2 = await T.data();
    assert.equal(d2.gymnasts.length, d.gymnasts.length);
    assert.equal(d2.competitions.find(c => c.id === 'f2').entries.length, f2.entries.length);
    await T.ctx.close();
  });

  await step('i en l’altre ordre (primer el full del CG Lleida): per defecte són unes altres, i es diu per què', async () => {
    const T = await open8(seed8()), { p } = T;
    await T.sheet('#/competicio/f2/inscripcions', 'inscripcio-canvis-entitat.xlsx');
    await T.doImport();
    await T.sheet('#/competicio/f2/inscripcions', 'inscripcio-mateix-nom.xlsx');
    assert.ok((await T.row('Mora, Queralt').textContent()).includes('nova (n’hi ha una amb aquest nom: CG Lleida · any 2015, ja és al full de la seva entitat)'), await T.row('Mora, Queralt').textContent());
    assert.equal(await T.row('Mora, Queralt').locator('select[data-chg=inscRowSame]').inputValue(), '__other');
    assert.ok((await p.locator('#dlg').textContent()).includes('2 gimnastes del full es diuen com gimnastes d’una altra entitat que el full de la seva entitat ja ha inscrit a 2a Fase: s’importen com a gimnastes noves (surten marcades «és una altra»). Si alguna és la mateixa persona, tria «és la mateixa».'));
    const t = await T.doImport();
    assert.ok(t.includes('2 fitxes noves') && !/canviat d’entitat/.test(t), t);
    const d = await T.data(), f2 = d.competitions.find(c => c.id === 'f2');
    for (const n of ['Queralt Mora', 'Helena Pons']) {
      assert.deepEqual(who8(d, n).map(g => g.clubId).sort(), ['c1', 'c2'], n);
      for (const g of who8(d, n)) assert.equal(f2.entries.filter(e => e.gymnastId === g.id && e.clubId === g.clubId).length, 1, n);
    }
    await T.ctx.close();
  });

  await step('el dia mateix, un full que arriba tard amb una gimnasta que es diu com una que ja té notes amb una altra entitat: és una altra; i si es diu que és la mateixa, la inscripció amb notes no es toca', async () => {
    const T = await open8(seed8({ f1Date: today })), { p } = T;
    await T.sheet('#/competicio/f1/inscripcions', 'inscripcio-mateix-nom.xlsx');
    assert.ok((await T.row('Mora, Queralt').textContent()).includes('ja hi té notes'), await T.row('Mora, Queralt').textContent());
    assert.equal(await T.row('Mora, Queralt').locator('select[data-chg=inscRowSame]').inputValue(), '__other');
    assert.ok((await p.locator('#dlg').textContent()).includes('2 gimnastes del full es diuen com gimnastes d’una altra entitat que ja tenen notes a 1a Fase'));
    // (la Queralt: l'organitzadora diu que és la mateixa)
    await T.row('Mora, Queralt').locator('select[data-chg=inscRowSame]').selectOption('q1');
    await p.waitForFunction(() => /ja hi és/.test([...document.querySelectorAll('#dlg tr')].find(t => t.textContent.includes('Mora, Queralt')).cells[0].textContent));
    const t = await T.doImport();
    assert.ok(t.includes('Compte: Queralt Mora ja té notes a 1a Fase amb una altra entitat i allà no s’hi ha canviat res'), t);
    const d = await T.data(), f1 = d.competitions.find(c => c.id === 'f1');
    const eq = f1.entries.filter(e => e.gymnastId === 'q1');
    assert.ok(eq.length === 1 && eq[0].clubId === 'c1' && hasSc(eq[0]), 'la inscripció amb notes, com era');
    assert.equal(who8(d, 'Queralt Mora').length, 1);
    const hel = who8(d, 'Helena Pons');
    assert.deepEqual(hel.map(g => g.clubId).sort(), ['c1', 'c2'], 'la Helena de l’Escola Pardinyes és una altra');
    assert.ok(f1.entries.find(e => e.gymnastId === 'h1' && e.clubId === 'c1' && hasSc(e)) && f1.entries.find(e => e.gymnastId === hel.find(g => g.id !== 'h1').id && e.clubId === 'c2'));
    await T.ctx.close();
  });

  await step('fulls d’una competició passada: una gimnasta que ara és d’una altra entitat hi passa a la fitxa (i «Jornada següent» la hi posa), llevat que en una competició posterior hi sigui amb una altra entitat', async () => {
    const gs = [G7('q1', 'Queralt', 'Mora', 'c2', 2015, 'Aleví', { noTeam: true }), G7('j1', 'Júlia', 'Roca', 'c2', 2013, 'Infantil', { noTeam: true })];
    const E = (k, g, bib, scores = {}) => ({ id: k + g.id, gymnastId: g.id, clubId: g.clubId, gender: 'F', category: g.category, level: 'A', bib, teamId: null, status: '', scores, noAuto: true });
    const T = await open8({ app: 'notesgim', version: 1, settings: { org: 'PROVA', rev: 4 }, clubs: [{ id: 'c1', name: 'CG Lleida' }, { id: 'c2', name: 'Escola Pardinyes' }], gymnasts: gs, teams: [],
      competitions: [{ id: 'f0', name: 'Final', date: day(-200), place: 'Lleida', season: 'Curs 7', locked: false, teams: [], entries: gs.map((g, i) => E('f0', g, i + 1, sc(8))) },
        { id: 'fu', name: 'Trofeu', date: day(20), place: 'Lleida', season: 'Curs 8', locked: false, teams: [], entries: [E('fu', gs[1], 1)] },
        { id: 'fp', name: '1a Fase en paper', date: day(-5), place: 'Lleida', season: 'Curs 8', locked: false, autoTeams: true, teams: [], entries: [] }],
      meta: { created: new Date().toISOString(), updated: new Date().toISOString(), dbId: 'proves8b' } }), { p } = T;
    await T.sheet('#/competicio/fp/inscripcions', 'inscripcio-canvis-entitat.xlsx');
    assert.ok((await T.row('Roca, Júlia').textContent()).includes('la fitxa es queda com és'), await T.row('Roca, Júlia').textContent());
    const note = await p.locator('#dlg').textContent();
    assert.ok(note.includes('Com que la competició ja ha passat, cada fitxa només s’actualitza (entitat, any i equip del full) si en cap competició posterior no hi és amb una altra entitat (la fitxa de Júlia Roca es queda com és)'), note);
    assert.ok(!note.includes('se n’actualitzen l’entitat i l’any'));
    const t = await T.doImport();
    assert.ok(t.includes('Ha canviat d’entitat: Queralt Mora (abans a Escola Pardinyes)'), t);
    assert.ok(t.includes('Júlia Roca (Escola Pardinyes): a la fitxa continua com era (en una competició posterior hi és amb una altra entitat)'), t);
    let d = await T.data();
    const q = d.gymnasts.find(g => g.id === 'q1'), j = d.gymnasts.find(g => g.id === 'j1');
    assert.ok(q.clubId === 'c1' && q.noTeam, 'la Queralt, a CG Lleida i «només individual», com diu el full');
    assert.ok(j.clubId === 'c2' && j.birthYear === '2013', 'la Júlia, com era');
    assert.equal(d.competitions.find(c => c.id === 'f0').entries.find(e => e.gymnastId === 'q1').clubId, 'c2', 'la Final no canvia');
    assert.ok(d.competitions.find(c => c.id === 'fp').entries.every(e => e.clubId === 'c1'), 'aquell dia, totes de CG Lleida');
    await p.goto(url + '#/competicions');
    await p.click('button[data-act=dupComp][data-id=fp]'); await p.waitForSelector('#dlg[open] form[data-form=comp]');
    await p.fill('#dlg input[name=name]', '2a Fase'); await p.fill('#dlg input[name=date]', day(15));
    await p.click('#dlg button.primary'); await p.waitForFunction(() => !$('#dlg').open);
    d = await T.data();
    const nc = d.competitions.find(c => c.name === '2a Fase'), eq = nc.entries.find(e => e.gymnastId === 'q1');
    assert.ok(eq && eq.clubId === 'c1' && !eq.teamId, 'a la jornada següent, de CG Lleida i individual');
    await T.ctx.close();
  });

  await step('«Importa» just després d’escriure el nom de l’entitat nova (sense sortir del camp) importa d’un sol clic; i els textos: un noi, una gimnasta, «abans sense entitat»', async () => {
    const T = await open8({ app: 'notesgim', version: 1, settings: { org: 'PROVA', rev: 4 }, clubs: [{ id: 'c1', name: 'CG Lleida' }, { id: 'c5', name: 'C.E. Alpicat' }],
      gymnasts: [G7('q0', 'Queralt', 'Mora', null, 2015, 'Aleví', { noTeam: true }), G7('o5', 'Ona', 'Bosch', 'c5', 2016, 'Benjamí', { gender: 'M' })], teams: [], competitions: [],
      meta: { created: new Date().toISOString(), updated: new Date().toISOString(), dbId: 'proves8c' } }), { p } = T;
    // un full de nois amb l'any d'un corregit
    await T.sheet('#/gimnastes', 'inscripcio-masculina-A.xlsx');
    assert.ok((await T.row('Bosch, Ona').textContent()).includes('ja hi és (any 2016)'));
    assert.deepEqual(await T.row('Bosch, Ona').locator('select[data-chg=inscRowSame] option').allTextContents(), ['és el mateix', 'és un altre']);
    assert.ok((await p.locator('#dlg').textContent()).includes('Un gimnasta del full ja hi és amb una altra entitat o un altre any (surt marcat «ja hi és (abans a …)»): és la mateixa persona; se n’actualitzen l’entitat i l’any, i en cap competició no s’inscriu dues vegades. Si és una altra persona amb el mateix nom, tria «és un altre».'));
    await p.click('#dlg button[data-act=closeDlg]');
    // una fitxa que s'havia quedat sense entitat
    await T.sheet('#/gimnastes', 'inscripcio-canvis-entitat.xlsx');
    assert.ok((await T.row('Mora, Queralt').textContent()).includes('ja hi és (abans sense entitat)'));
    assert.ok((await p.locator('#dlg').textContent()).includes('Una gimnasta del full ja hi és amb una altra entitat o un altre any (surt marcada «ja hi és (abans a …)»): és la mateixa persona;'));
    const t = await T.doImport();
    assert.ok(t.includes('Ha canviat d’entitat: Queralt Mora (abans sense entitat).'), t);
    // el nom de l'entitat nova, i «Importa» directament
    await T.sheet('#/gimnastes', 'inscripcio-inef.xlsx');
    await p.evaluate(() => $$('.toast').forEach(t => t.remove()));
    await p.fill('#dlg input[data-chg=inscClubName]', 'INEF Lleida (Universitat)');
    await p.click('#dlg button[data-act=inscDo]');
    await p.waitForFunction(() => !$('#dlg').open, null, { timeout: 3000 });
    await T.toast(/Fulls d’inscripció importats: 4 fitxes noves/);
    const d = await T.data(), club = d.clubs.find(c => c.name === 'INEF Lleida (Universitat)');
    assert.ok(club && d.gymnasts.filter(g => g.clubId === club.id).length === 4, JSON.stringify(d.clubs));
    assert.equal(d.teams.find(x => x.clubId === club.id).name, 'INEF Lleida (Universitat)');
    await T.ctx.close();
  });
} finally {
  await browser.close();
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('\nArreglos de la revisió correctes.');
