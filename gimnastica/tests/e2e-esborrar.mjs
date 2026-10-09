// Proves d'esborrar de cop: a cada llista (Gimnastes, Equips, Entitats, Competicions i Inscripcions) es marquen
// les que es vulgui (o «Marca-les totes») i s'esborren d'un cop; «Esborra-ho tot…» a Configuració. Tot es pot desfer.
//   node tests/e2e-esborrar.mjs            (cal Playwright)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(path.join(execSync('npm root -g').toString().trim(), 'playwright')); }

const here = path.dirname(fileURLToPath(import.meta.url));
const url = pathToFileURL(path.join(here, '..', 'index.html')).href;
const out = path.join(here, 'out', 'esborrar');
mkdirSync(out, { recursive: true });
const d0 = new Date(), pad = n => String(n).padStart(2, '0');
const today = `${d0.getFullYear()}-${pad(d0.getMonth() + 1)}-${pad(d0.getDate())}`;

const G = (id, name, clubId) => ({ id, name, surname: 'Prova', clubId, gender: 'F', category: 'Aleví', level: 'A', birthYear: '', notes: '', archived: false });
const E = (id, g, bib, teamId, scores = {}) => ({ id, gymnastId: g.id, clubId: g.clubId, gender: 'F', category: 'Aleví', level: 'A', bib, teamId, status: '', scores });
const gyms = [G('g1', 'Anna', 'c1'), G('g2', 'Berta', 'c1'), G('g3', 'Carla', 'c1'), G('g4', 'Dana', 'c2'), G('g5', 'Elna', 'c2'), G('g6', 'Fiona', 'c2'), G('g7', 'Gina', 'c1')];
const by = id => gyms.find(g => g.id === id);
const s = v => ({ salt: [{ v, at: 1 }] });
const CT = (id, T, clubId, name) => ({ id, name, clubId, gender: 'F', category: 'Aleví', level: 'A', sourceTeamId: T, auto: true });
const seed = {
  app: 'notesgim', version: 1,
  settings: { org: 'ORG PROVA', levels: ['A', 'B'], rev: 4 },
  clubs: [{ id: 'c1', name: 'CG Lleida' }, { id: 'c2', name: 'Escola Pardinyes' }],
  gymnasts: gyms,
  teams: [
    { id: 'T1', name: 'CG Lleida', clubId: 'c1', gender: 'F', category: 'Aleví', level: 'A', memberIds: ['g1', 'g2', 'g3'] },
    { id: 'T2', name: 'Escola Pardinyes', clubId: 'c2', gender: 'F', category: 'Aleví', level: 'A', memberIds: ['g4', 'g5', 'g6'] },
  ],
  competitions: [
    { id: 'kp', name: 'Jornada passada', date: '2026-01-10', place: 'Lleida', season: '2025-2026', locked: false, autoTeams: true,
      teams: [CT('pt1', 'T1', 'c1', 'CG Lleida'), CT('pt2', 'T2', 'c2', 'Escola Pardinyes')],
      entries: [E('p1', by('g1'), 1, 'pt1', s(8)), E('p2', by('g2'), 2, 'pt1', s(8.1)), E('p3', by('g3'), 3, 'pt1', s(8.2)),
        E('p4', by('g4'), 4, 'pt2', s(8.3)), E('p5', by('g5'), 5, 'pt2', s(8.4)), E('p6', by('g6'), 6, 'pt2', s(8.5))] },
    { id: 'kt', name: 'Jornada avui', date: today, place: 'Lleida', season: '', locked: false, autoTeams: true,
      teams: [CT('tt1', 'T1', 'c1', 'CG Lleida'), CT('tt2', 'T2', 'c2', 'Escola Pardinyes')],
      entries: [E('t1', by('g1'), 1, 'tt1', s(9)), E('t2', by('g2'), 2, 'tt1'), E('t3', by('g3'), 3, 'tt1'),
        E('t4', by('g4'), 4, 'tt2'), E('t5', by('g5'), 5, 'tt2'), E('t6', by('g6'), 6, 'tt2'), E('t7', by('g7'), 7, null)] },
    { id: 'kl', name: 'Jornada tancada', date: today, place: 'Lleida', season: '', locked: true, teams: [], entries: [E('l1', by('g7'), 1, null)] },
  ],
  meta: { created: new Date().toISOString(), updated: new Date().toISOString(), dbId: 'proves-esborrar' },
};

const browser = await playwright.chromium.launch();
const errors = [];
const step = async (name, fn) => { process.stdout.write(`· ${name} … `); await fn(); console.log('ok'); };
const wait = ms => new Promise(r => setTimeout(r, ms));
try {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ca-ES', acceptDownloads: true });
  await ctx.addInitScript(r => { if (!localStorage.getItem('notesgim.db')) localStorage.setItem('notesgim.db', r); }, JSON.stringify(seed));
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|manifest|service ?worker/i.test(m.text())) errors.push('console: ' + m.text()); });
  const data = () => page.evaluate(() => JSON.parse(JSON.stringify(db)));
  const go = async hash => { await page.evaluate(h => { location.hash = h; }, hash); await wait(150); };
  const undo = async () => { await page.locator('.toast button:has-text("Desfés")').last().click(); await page.waitForSelector('.toast:has-text("Desfet.")'); await wait(100); };
  const bar = k => page.locator(`.selbar[data-k="${k}"]`);
  await page.goto(url + '#/gimnastes');
  await page.waitForSelector('#gymtable');

  await step('Gimnastes: «Marca-les totes» marca les que es veuen (amb la cerca), i marcar-ne una no mou la llista', async () => {
    await bar('gyms').waitFor();
    assert.match(await bar('gyms').textContent(), /Marca-les totes \(7\)/);
    assert.ok(await bar('gyms').locator('button[data-act=delGymsSel]').isDisabled(), 'sense cap de marcada no es pot esborrar');
    // marcar-ne una: la taula no es torna a pintar (el que hi ha escrit o desplegat no es perd)
    await page.evaluate(() => { document.querySelector('#gymtable table').dataset.same = '1'; });
    await page.check('#gymtable input.selbox[data-id=g2]');
    assert.equal(await page.locator('#gymtable table[data-same="1"]').count(), 1);
    assert.match(await bar('gyms').locator('button[data-act=delGymsSel]').textContent(), /Esborra les marcades \(1\)/);
    await page.uncheck('#gymtable input.selbox[data-id=g2]');
    // si es torna a pintar mentrestant (arriba una nota d'una tutora, desa una altra pestanya), el focus es queda a la mateixa fila
    await page.focus('#gymtable input.selbox[data-id=g6]');
    await page.evaluate(() => renderKeepFocus()); await wait(150);
    assert.equal(await page.evaluate(() => document.activeElement.dataset.id), 'g6');
    await page.focus('#gymtable select[data-chg=gymTeamInline][data-id=g5]');
    await page.evaluate(() => renderKeepFocus()); await wait(150);
    assert.equal(await page.evaluate(() => document.activeElement.dataset.id), 'g5');
    // amb la cerca: només les que es veuen
    await page.fill('input[data-inp=gSearch]', 'anna');
    await wait(100);
    assert.match(await bar('gyms').textContent(), /Marca-les totes \(1\)/);
    await bar('gyms').locator('input[data-chg=selAll]').check();
    assert.match(await bar('gyms').locator('button[data-act=delGymsSel]').textContent(), /\(1\)/);
    await page.fill('input[data-inp=gSearch]', '');
    await wait(100);
    assert.match(await bar('gyms').textContent(), /Marca-les totes \(7\)/);
    assert.ok(!(await bar('gyms').locator('input[data-chg=selAll]').isChecked()), 'no les té totes marcades');
    assert.equal(await page.locator('#gymtable input.selbox:checked').count(), 1);
    await page.screenshot({ path: path.join(out, 'gimnastes.png') });
  });

  await step('Gimnastes: esborrar les marcades (del tot) les treu de les fitxes, els equips i les competicions; Desfés les torna', async () => {
    await page.check('#gymtable input.selbox[data-id=g2]');
    await bar('gyms').locator('button[data-act=delGymsSel]').click();
    await page.waitForSelector('#confirm[open] >> text=Esborrar 2 gimnastes?');
    await page.click('#confirm button:has-text("Esborra-les del tot")');
    // tenen notes: com amb el ✕ d'una sola, s'ha d'escriure ESBORRA
    await page.waitForSelector('#confirm[open] >> text=S’esborraran les notes de 2 gimnastes de 2 competicions');
    await page.fill('#confirm input[name=typed]', 'ESBORRA'); await page.click('#confirm button[value=ok]');
    await page.waitForSelector('.toast:has-text("2 gimnastes esborrades")');
    const d = await data();
    assert.deepEqual(d.gymnasts.map(g => g.id).sort(), ['g3', 'g4', 'g5', 'g6', 'g7']);
    assert.deepEqual(d.teams.find(t => t.id === 'T1').memberIds, ['g3']);
    for (const c of d.competitions) assert.ok(!c.entries.some(e => ['g1', 'g2'].includes(e.gymnastId)), c.id);
    assert.match(await bar('gyms').textContent(), /Marca-les totes \(5\)/);
    assert.equal(await page.locator('#gymtable input.selbox:checked').count(), 0, 'després d’esborrar no en queda cap de marcada');
    await undo();
    const d2 = await data();
    assert.equal(d2.gymnasts.length, 7);
    assert.equal(d2.competitions.find(c => c.id === 'kp').entries.length, 6);
    assert.equal(d2.competitions.find(c => c.id === 'kt').entries.find(e => e.id === 't1').scores.salt[0].v, 9);
  });

  await step('Gimnastes: arxivar les marcades', async () => {
    await page.check('#gymtable input.selbox[data-id=g7]');
    await bar('gyms').locator('button[data-act=delGymsSel]').click();
    await page.waitForSelector('#confirm[open] >> text=Esborrar Gina Prova? Surt a alguna competició.');
    await page.click('#confirm button:has-text("Arxiva-la")');
    await page.waitForSelector('.toast:has-text("Fitxa de Gina Prova arxivada: ja no surt a les llistes")');
    const d = await data();
    assert.equal(d.gymnasts.find(g => g.id === 'g7').archived, true);
    assert.ok(d.competitions.find(c => c.id === 'kl').entries.some(e => e.gymnastId === 'g7'), 'la tancada no es toca');
    await undo();
    assert.equal((await data()).gymnasts.find(g => g.id === 'g7').archived, false);
  });

  await step('Equips: esborrar-los tots d’un cop; les gimnastes queden com a individuals (la jornada passada no canvia)', async () => {
    await go('#/equips');
    await bar('teams').waitFor();
    assert.match(await bar('teams').textContent(), /Marca’ls tots \(2\)/);
    await bar('teams').locator('input[data-chg=selAll]').check();
    await bar('teams').locator('button[data-act=delTeamsSel]').click();
    await page.waitForSelector('#confirm[open] >> text=Esborrar 2 equips?');
    await page.click('#confirm button:has-text("Queden com a individuals")');
    await page.waitForSelector('.toast:has-text("2 equips esborrats: les seves gimnastes queden com a individuals")');
    const d = await data();
    assert.equal(d.teams.length, 0);
    assert.ok(d.gymnasts.filter(g => g.id !== 'g7').every(g => g.noTeam), 'queden com a individuals a la fitxa');
    const kt = d.competitions.find(c => c.id === 'kt'), kp = d.competitions.find(c => c.id === 'kp');
    assert.equal(kt.teams.length, 0); assert.ok(kt.entries.every(e => !e.teamId));
    assert.equal(kp.teams.length, 2, 'la passada es queda com era'); assert.ok(kp.entries.every(e => e.teamId));
    await undo();
    assert.equal((await data()).teams.length, 2);
  });

  await step('Equips: «Es tornen a agrupar soles»; els que va dir l’entitat, sempre com a individuals', async () => {
    await bar('teams').locator('input[data-chg=selAll]').check();
    await bar('teams').locator('button[data-act=delTeamsSel]').click();
    await page.click('#confirm button:has-text("Es tornen a agrupar soles")');
    await page.waitForSelector('.toast:has-text("les seves gimnastes es tornen a agrupar soles")');
    let d = await data();
    assert.ok(!d.teams.some(t => ['T1', 'T2'].includes(t.id)), 'els equips esborrats ja no hi són');
    assert.ok(d.gymnasts.every(g => !g.noTeam), 'no queden marcades com a individuals');
    let kt = d.competitions.find(c => c.id === 'kt');
    // a la jornada d'avui es tornen a fer els equips de cada entitat, sols
    const sizes = Object.fromEntries(kt.teams.map(t => [t.clubId, kt.entries.filter(e => e.teamId === t.id).length]));
    assert.deepEqual(sizes, { c1: 4, c2: 3 }, JSON.stringify(sizes));
    await undo();
    // un equip que va dir l'entitat (full d'inscripció): només es pot esborrar deixant-les com a individuals
    await page.evaluate(() => { db.teams.find(t => t.id === 'T2').form = true; commit(); render(); });
    await page.check('input.selbox[data-k=teams][data-id=T2]');
    await bar('teams').locator('button[data-act=delTeamsSel]').click();
    await page.waitForSelector('#confirm[open] >> text=al full d’inscripció');
    assert.equal(await page.locator('#confirm button:has-text("Es tornen a agrupar soles")').count(), 0);
    await page.click('#confirm button:has-text("Esborra’l (queden com a individuals)")');
    await page.waitForSelector('.toast:has-text("Equip esborrat: les seves gimnastes queden com a individuals")');
    d = await data(); kt = d.competitions.find(c => c.id === 'kt');
    assert.ok(['g4', 'g5', 'g6'].every(id => d.gymnasts.find(g => g.id === id).noTeam));
    assert.ok(kt.entries.filter(e => e.clubId === 'c2').every(e => !e.teamId && e.noAuto));
    await undo();
    await page.evaluate(() => { delete db.teams.find(t => t.id === 'T2').form; commit(); render(); });
  });

  await step('Entitats: esborrar-ne una amb les seves gimnastes', async () => {
    await go('#/entitats');
    await bar('clubs').waitFor();
    await page.check('table.clubs input.selbox[data-id=c2]');
    await bar('clubs').locator('button[data-act=delClubsSel]').click();
    await page.waitForSelector('#confirm[open] >> text=Esborrar Escola Pardinyes? Hi ha 3 gimnastes d’aquesta entitat.');
    await page.click('#confirm button:has-text("Esborra-la amb les seves gimnastes")');
    await page.waitForSelector('#confirm[open] >> text=S’esborraran les notes de');
    await page.fill('#confirm input[name=typed]', 'ESBORRA'); await page.click('#confirm button[value=ok]');
    await page.waitForSelector('.toast:has-text("Entitat esborrada, amb les seves gimnastes")');
    const d = await data();
    assert.deepEqual(d.clubs.map(c => c.id), ['c1']);
    assert.ok(!d.gymnasts.some(g => g.clubId === 'c2'));
    assert.ok(!d.teams.some(t => t.clubId === 'c2'));
    for (const c of d.competitions) { assert.ok(!c.entries.some(e => e.clubId === 'c2'), c.id); assert.ok(!c.teams.some(t => t.clubId === 'c2'), c.id); }
    await undo();
  });

  await step('Entitats: «Només les entitats» deixa les gimnastes sense entitat', async () => {
    await bar('clubs').locator('input[data-chg=selAll]').check();
    await bar('clubs').locator('button[data-act=delClubsSel]').click();
    await page.click('#confirm button:has-text("Només les entitats")');
    await page.waitForSelector('.toast:has-text("2 entitats esborrades; les seves gimnastes es queden sense entitat")');
    const d = await data();
    assert.equal(d.clubs.length, 0); assert.equal(d.gymnasts.length, 7);
    assert.ok(d.gymnasts.every(g => !g.clubId));
    await undo();
    assert.equal((await data()).clubs.length, 2);
  });

  await step('Inscripcions: treure de la competició les marcades (amb la cerca, només les que es veuen)', async () => {
    await go('#/competicio/kt/inscripcions');
    await bar('entries:kt').waitFor();
    assert.match(await bar('entries:kt').textContent(), /Marca-les totes \(7\)/);
    await page.fill('input[data-inp=insSearch]', 'pardinyes');
    await wait(100);
    assert.match(await bar('entries:kt').textContent(), /Marca-les totes \(3\)/, 'el número segueix la cerca');
    await bar('entries:kt').locator('input[data-chg=selAll]').check();
    assert.equal(await page.locator('input.selbox[data-k="entries:kt"]:checked').count(), 3);
    await bar('entries:kt').locator('button[data-act=delEntriesSel]').click();
    await page.waitForSelector('#confirm[open] >> text=Treure 3 gimnastes d’aquesta competició?');
    await page.click('#confirm button[value=ok]');
    await page.waitForSelector('.toast:has-text("3 gimnastes fora de la competició")');
    let kt = (await data()).competitions.find(c => c.id === 'kt');
    assert.deepEqual(kt.entries.map(e => e.id).sort(), ['t1', 't2', 't3', 't7']);
    assert.ok(!kt.teams.some(t => t.clubId === 'c2'), 'l’equip que es queda sense ningú, fora');
    await undo();
    // totes, amb notes: avisa que es perdran
    await page.fill('input[data-inp=insSearch]', '');
    await page.evaluate(() => { ui.insQ = ''; }); await go('#/competicio/kt');
    await go('#/competicio/kt/inscripcions');
    await bar('entries:kt').locator('input[data-chg=selAll]').check();
    await bar('entries:kt').locator('button[data-act=delEntriesSel]').click();
    await page.waitForSelector('#confirm[open] >> text=1 ja té notes');
    await page.click('#confirm button[value=ok]');
    await page.waitForSelector('.toast:has-text("7 gimnastes fora de la competició")');
    kt = (await data()).competitions.find(c => c.id === 'kt');
    assert.equal(kt.entries.length, 0);
    await undo();
    assert.equal((await data()).competitions.find(c => c.id === 'kt').entries.length, 7);
    // competició tancada: no s'hi pot marcar res
    await go('#/competicio/kl/inscripcions');
    await bar('entries:kl').waitFor();
    assert.equal(await page.locator('input.selbox[data-k="entries:kl"]').count(), 0);
    assert.ok(await bar('entries:kl').locator('input[data-chg=selAll]').isDisabled());
  });

  await step('Entitats «amb les seves gimnastes»: les d’una altra entitat del mateix equip s’hi queden, i les notes passades d’una gimnasta que es queda no es toquen', async () => {
    // la Gina (CG Lleida) és a l'equip de l'Escola Pardinyes, i una inscripció passada de la Carla és de l'Escola Pardinyes
    await page.evaluate(() => {
      db.teams.find(t => t.id === 'T2').memberIds.push('g7');
      const kt = db.competitions.find(c => c.id === 'kt'); kt.entries.find(e => e.id === 't7').teamId = 'tt2';
      const kp = db.competitions.find(c => c.id === 'kp'); kp.entries.find(e => e.id === 'p3').clubId = 'c2';
      commit(); render();
    });
    await go('#/entitats');
    await page.check('table.clubs input.selbox[data-id=c2]');
    await bar('clubs').locator('button[data-act=delClubsSel]').click();
    await page.click('#confirm button:has-text("Esborra-la amb les seves gimnastes")');
    await page.waitForSelector('#confirm[open] >> text=S’esborraran les notes de');
    await page.fill('#confirm input[name=typed]', 'ESBORRA'); await page.click('#confirm button[value=ok]');
    await page.waitForSelector('.toast:has-text("Entitat esborrada, amb les seves gimnastes")');
    const d = await data(), kt = d.competitions.find(c => c.id === 'kt'), kp = d.competitions.find(c => c.id === 'kp');
    assert.deepEqual(d.teams.find(t => t.id === 'T2').memberIds, ['g7'], 'la Gina es queda a l’equip (ara sense entitat)');
    assert.equal(d.teams.find(t => t.id === 'T2').clubId, null);
    const t7 = kt.entries.find(e => e.id === 't7');
    assert.ok(kt.teams.some(t => t.id === t7.teamId), 'la seva inscripció continua en un equip que existeix');
    assert.ok(kp.entries.some(e => e.id === 'p3' && e.scores.salt[0].v === 8.2), 'la nota passada de la Carla es queda');
    for (const c of d.competitions) for (const e of c.entries) assert.ok(!e.teamId || c.teams.some(t => t.id === e.teamId), `${c.id}/${e.id}: equip que no existeix`);
    await undo();
    await page.evaluate(() => {
      const T2 = db.teams.find(t => t.id === 'T2'); T2.memberIds = T2.memberIds.filter(x => x !== 'g7');
      db.competitions.find(c => c.id === 'kt').entries.find(e => e.id === 't7').teamId = null;
      db.competitions.find(c => c.id === 'kp').entries.find(e => e.id === 'p3').clubId = 'c1';
      commit(); render();
    });
  });

  await step('Equips: si s’esborren tots els equips de la categoria triada, es tornen a veure els altres', async () => {
    await page.evaluate(() => {
      for (const id of ['g1', 'g2', 'g3']) db.gymnasts.find(g => g.id === id).category = 'Benjamí';
      db.teams.find(t => t.id === 'T1').category = 'Benjamí'; commit(); render();
    });
    await go('#/equips');
    await page.click('button[data-act=pickTCat][data-c="Benjamí"]');
    await bar('teams').locator('input[data-chg=selAll]').check();
    assert.match(await bar('teams').textContent(), /Marca’ls tots \(1\)[\s\S]*Desmarca’ls/);
    await bar('teams').locator('button[data-act=delTeamsSel]').click();
    await page.click('#confirm button:has-text("Queden com a individuals")');
    await page.waitForSelector('.toast:has-text("Equip esborrat")');
    await page.waitForSelector('a[data-act=editTeam]:has-text("Escola Pardinyes")');
    assert.match(await bar('teams').textContent(), /Marca’ls tots \(1\)/);
    await undo();
    await page.evaluate(() => {
      for (const id of ['g1', 'g2', 'g3']) db.gymnasts.find(g => g.id === id).category = 'Aleví';
      db.teams.find(t => t.id === 'T1').category = 'Aleví'; ui.tCat = ''; commit(); render();
    });
  });

  await step('Competicions: esborrar-les totes d’un cop (les gimnastes es queden)', async () => {
    await go('#/competicions');
    await bar('comps').waitFor();
    assert.match(await bar('comps').textContent(), /Marca-les totes \(3\)/);
    await bar('comps').locator('input[data-chg=selAll]').check();
    await bar('comps').locator('button[data-act=delCompsSel]').click();
    await page.waitForSelector('#confirm[open] >> text=Esborrar 3 competicions');
    await page.click('#confirm button[value=ok]');
    await page.waitForSelector('.toast:has-text("3 competicions esborrades")');
    const d = await data();
    assert.equal(d.competitions.length, 0); assert.equal(d.gymnasts.length, 7);
    await undo();
    assert.equal((await data()).competitions.length, 3);
  });

  await step('Configuració: «Esborra-ho tot…» ho esborra d’un cop (i abans en descarrega una còpia); Desfés ho torna', async () => {
    await go('#/configuracio');
    await page.click('button[data-act=wipe]');
    await page.waitForSelector('#dlg form[data-form=wipe]');
    assert.equal(await page.locator('#dlg input[name=w]:checked').count(), 3, 'tot marcat menys la configuració');
    // un Intro no esborra res: el focus és a «Cancel·la», i un Intro sobre una casella no envia el diàleg
    assert.equal(await page.evaluate(() => document.activeElement.dataset.act), 'closeDlg');
    await page.focus('#dlg input[name=w][value=comps]'); await page.keyboard.press('Enter');
    await wait(200);
    assert.ok(await page.locator('#dlg form[data-form=wipe]').isVisible(), 'el diàleg continua obert');
    assert.equal((await data()).gymnasts.length, 7);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#dlg form[data-form=wipe] button.danger')]);
    const copy = JSON.parse(readFileSync(await dl.path(), 'utf8'));
    assert.equal(copy.gymnasts.length, 7, 'la còpia és de com era abans');
    await page.waitForSelector('.toast:has-text("Esborrat: les competicions, les gimnastes i els equips i les entitats")');
    const d = await data();
    assert.equal(d.gymnasts.length + d.teams.length + d.clubs.length + d.competitions.length, 0);
    assert.equal(d.settings.org, 'ORG PROVA', 'la configuració es queda');
    assert.ok((await page.evaluate(() => location.hash)).startsWith('#/competicions'));
    await page.waitForSelector('text=Encara no hi ha cap competició');
    await page.screenshot({ path: path.join(out, 'buit.png') });
    await undo();
    const d2 = await data();
    assert.equal(d2.gymnasts.length, 7); assert.equal(d2.competitions.length, 3); assert.equal(d2.clubs.length, 2);
  });

  await step('Configuració: només les competicions, o tot amb «Marca-ho tot» (també la configuració)', async () => {
    await go('#/configuracio');
    await page.click('button[data-act=wipe]');
    await page.uncheck('#dlg input[name=w][value=gyms]');
    await page.uncheck('#dlg input[name=w][value=clubs]');
    await Promise.all([page.waitForEvent('download'), page.click('#dlg form[data-form=wipe] button.danger')]);
    await page.waitForSelector('.toast:has-text("Esborrat: les competicions.")');
    let d = await data();
    assert.equal(d.competitions.length, 0); assert.equal(d.gymnasts.length, 7); assert.equal(d.clubs.length, 2);
    await go('#/configuracio');
    await page.click('button[data-act=wipe]');
    await page.click('#dlg button[data-act=wipeMarkAll]');
    assert.equal(await page.locator('#dlg input[name=w]:checked').count(), 4);
    await Promise.all([page.waitForEvent('download'), page.click('#dlg form[data-form=wipe] button.danger')]);
    await page.waitForSelector('.toast:has-text("la configuració")');
    d = await data();
    assert.equal(d.gymnasts.length + d.teams.length + d.clubs.length + d.competitions.length, 0);
    assert.notEqual(d.settings.org, 'ORG PROVA', 'la configuració torna a ser la de partida');
    // el que queda desat també és buit, i en tornar-ho a llegir no torna res de les dades d'abans
    // (es llegeix sense recarregar la pàgina: el navegador de proves, sense perfil, a vegades perd el desat en recarregar)
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('notesgim.db')));
    assert.equal(saved.gymnasts.length + saved.teams.length + saved.clubs.length + saved.competitions.length, 0);
    assert.equal(saved.settings.dataGen, 2);
    await page.evaluate(() => { loadDb(); render(); });
    await page.waitForSelector('text=Encara no hi ha cap competició');
    assert.equal((await data()).gymnasts.length, 0);
    // si no s'ha marcat res, no s'esborra res
    await go('#/configuracio');
    await page.click('button[data-act=wipe]');
    for (const v of ['comps', 'gyms', 'clubs']) await page.uncheck(`#dlg input[name=w][value=${v}]`);
    await page.click('#dlg form[data-form=wipe] button.danger');
    await page.waitForSelector('.toast:has-text("No has marcat res")');
  });

  await step('al mòbil: caselles a les targetes de les gimnastes i a les inscripcions, sense sortir de la pantalla', async () => {
    const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ca-ES' });
    await m.addInitScript(r => { if (!localStorage.getItem('notesgim.db')) localStorage.setItem('notesgim.db', r); }, JSON.stringify(seed));
    const p = await m.newPage();
    p.on('pageerror', e => errors.push('mòbil pageerror: ' + e.message));
    await p.goto(url + '#/gimnastes');
    await p.waitForSelector('.gym-cards');
    assert.equal(await p.locator('.gym-card input.selbox').count(), 7);
    const hBar = () => p.locator('.selbar[data-k=gyms]').evaluate(b => b.getBoundingClientRect().height);
    const h0 = await hBar();
    await p.locator('.gym-card input.selbox[data-id=g3]').tap();
    assert.equal(await hBar(), h0, 'en marcar-ne una, la barra no canvia de mida (la llista no salta)');
    assert.match(await p.locator('.selbar[data-k=gyms] button[data-act=delGymsSel]').textContent(), /\(1\)/);
    const wide = () => p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert.ok(await wide() <= 0, 'no hi ha desplaçament de costat');
    await p.screenshot({ path: path.join(out, 'mobil-gimnastes.png') });
    for (const [hash, k] of [['#/competicio/kt/inscripcions', 'entries:kt'], ['#/entitats', 'clubs'], ['#/equips', 'teams'], ['#/competicions', 'comps']]) {
      await p.evaluate(hh => { location.hash = hh; }, hash);
      await p.locator(`.selbar[data-k="${k}"]`).waitFor();
      assert.ok(await wide() <= 0, `${hash}: no hi ha desplaçament de costat`);
      await p.screenshot({ path: path.join(out, `mobil-${k.replace(':', '-')}.png`) });
    }
    await p.locator('.selbar[data-k=comps] input[data-chg=selAll]').tap();
    await p.locator('.selbar[data-k=comps] button[data-act=delCompsSel]').tap();
    await p.waitForSelector('#confirm[open]');
    await p.locator('#confirm button[value=ok]').tap();
    await p.waitForSelector('.toast:has-text("3 competicions esborrades")');
    await m.close();
  });
} finally {
  await browser.close();
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('\nEsborrar de cop correcte.');
