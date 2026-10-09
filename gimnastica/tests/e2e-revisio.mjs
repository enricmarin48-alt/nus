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
    const t = page.locator('.toast', { hasText: 'Final de' });
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
    // un grup llarg, avall de tot: una altra pestanya desa i la graella no torna a dalt (la casella es continua veient)
    await p3.evaluate(() => { const g = groupsOf(curComp()).sort((a, b) => b.entries.length - a.entries.length)[0]; ui.group = g.key; ui.app = 'all'; render(); });
    const ids = await p3.evaluate(() => $$('#scoregrid input.sc[data-a=salt]').map(x => x.dataset.e));
    const low = p3.locator(`#scoregrid input.sc[data-a=salt][data-e=${ids[ids.length - 2]}]`);
    await low.scrollIntoViewIfNeeded(); await low.click();
    const top0 = await p3.evaluate(() => $('#scoregrid').closest('.grid-wrap').scrollTop);
    assert.ok(top0 > 100, 'la graella té la seva barra i és avall: ' + top0);
    const other = await ctx3.newPage(); await other.goto(url + '#/gimnastes'); await other.waitForTimeout(200);
    await other.evaluate(() => { db.clubs.push({ id: 'cx', name: 'Club nou' }); commit(); flush(); });
    await other.close();
    await p3.waitForFunction(() => db.clubs.some(c => c.id === 'cx'));
    await p3.waitForTimeout(150);
    const inf = await p3.evaluate(() => { const w = $('#scoregrid').closest('.grid-wrap'), a = document.activeElement, wr = w.getBoundingClientRect(), r = a.getBoundingClientRect(); return { top: w.scrollTop, e: a.dataset.e, vis: r.top >= wr.top && r.bottom <= wr.bottom }; });
    assert.deepEqual(inf, { top: top0, e: ids[ids.length - 2], vis: true });
  });

  await step('dues pestanyes: si l’altra desa just després d’un Intro, la nota que s’està escrivint no es perd (8,50 i 9,25)', async () => {
    await load3('#/competicio/c418/notes');
    await p3.evaluate(() => flush());
    const other = await ctx3.newPage(); await other.goto(url + '#/gimnastes'); await other.waitForTimeout(200);
    await p3.bringToFront();
    const ids = await p3.evaluate(() => $$('#scoregrid input.sc[data-a=salt]').map(x => x.dataset.e));
    await p3.click(`#scoregrid input.sc[data-a=salt][data-e=${ids[0]}]`);
    await p3.keyboard.type('8,5'); await p3.keyboard.press('Enter');
    await other.evaluate(() => { db.clubs.push({ id: 'cz', name: 'Club Z' }); commit(); flush(); });
    await p3.keyboard.type('9,25', { delay: 70 }); await p3.keyboard.press('Enter'); await p3.waitForTimeout(500);
    await other.close();
    const v = await p3.evaluate(ids => ids.map(id => (((curComp().entries.find(e => e.id === id).scores || {}).salt || [])[0] || {}).v ?? null), ids.slice(0, 2));
    assert.deepEqual(v, [8.5, 9.25]);
    assert.ok(await p3.evaluate(() => db.clubs.some(c => c.id === 'cz')), 'i les dades de l’altra pestanya hi són');
    await p3.evaluate(() => $$('#fixtip').forEach(t => t.remove()));
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

  await step('dues pestanyes: si l’altra desa mentre aquí s’escriu a «Cerca…», el clic següent a un dorsal no en treu el focus (777 es desa)', async () => {
    await load3('#/competicio/c418/inscripcions');
    await p3.evaluate(() => flush());
    const other = await ctx3.newPage(); await other.goto(url + '#/gimnastes'); await other.waitForTimeout(300);
    await p3.bringToFront();
    await p3.click('input[data-inp=insSearch]'); await p3.keyboard.type('Laia');
    await other.evaluate(() => { db.clubs.push({ id: 'cq', name: 'Club Q' }); commit(); flush(); });
    await p3.waitForTimeout(300);
    assert.ok(await p3.evaluate(() => remotePending));
    const bib = p3.locator('input[data-chg=bib]:visible').first(), id = await bib.getAttribute('data-id');
    await bib.click(); await p3.waitForTimeout(100);
    assert.deepEqual(await act3(), { tag: 'INPUT', chg: 'bib', act: '', id });
    await p3.keyboard.press('Control+A'); await p3.keyboard.type('777'); await p3.keyboard.press('Tab'); await p3.waitForTimeout(300);
    await other.close();
    assert.equal(await p3.evaluate(id => curComp().entries.find(e => e.id === id).bib, id), 777);
    assert.ok(await p3.evaluate(() => db.clubs.some(c => c.id === 'cq')), 'i les dades de l’altra pestanya hi són');
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
} finally {
  await browser.close();
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('\nArreglos de la revisió correctes.');
