// Proves dels arreglos de la revisió: fitxa, importació, inscripció, equips, D + E, «Grup següent»,
// nivells repetits, curs de la competició i mida de pantalla de les tauletes. Obre l'app des del disc.
//   node tests/e2e-revisio.mjs            (cal Playwright)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

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
    assert.ok(t.includes('Comp kf') && t.includes('no s’hi ha tocat res'), 'es diu que l’altra competició té uns altres equips: ' + t);
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
} finally {
  await browser.close();
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('\nArreglos de la revisió correctes.');
