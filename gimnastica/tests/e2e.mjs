// Prova de punta a punta amb un navegador de veritat, obrint l'app des del disc (file://),
// tal com la faran servir sense internet.
//   node tests/e2e.mjs            (cal Playwright: npm i -g playwright)
// Desa captures i el .xlsx exportat a tests/out/.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(path.join(execSync('npm root -g').toString().trim(), 'playwright')); }

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'out');
mkdirSync(out, { recursive: true });
const url = pathToFileURL(path.join(here, '..', 'index.html')).href;

const browser = await playwright.chromium.launch();
const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1366, height: 900 }, locale: 'ca-ES' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

const step = async (name, fn) => { process.stdout.write(`· ${name} … `); await fn(); console.log('ok'); };
const shot = name => page.screenshot({ path: path.join(out, name + '.png'), fullPage: true });

await page.goto(url);

await step('importa gimnastes enganxant des d’Excel', async () => {
  await page.click('a[data-nav=gimnastes]');
  await page.click('button[data-act=importGyms]');
  // la categoria només ve escrita en algunes files: a les altres surt de l'any de naixement
  const rows = [
    ['Nom', 'Cognoms', 'Entitat', 'Gènere', 'Categoria', 'Nivell', 'Any'],
    ['Anna', 'Puig', 'CG Lleida', 'F', 'aleví', 'A', '2015'],
    ['Berta', 'Soler', 'CG Lleida', 'F', '', 'A', '2015'],
    ['Carla', 'Vidal', 'CG Lleida', 'noia', '', 'A', '2016'],
    ['Dana', 'Roca', 'CG Lleida', 'Femení', 'Aleví', 'A', '2016'],
    ['Elna', 'Mas', 'Escola Pardinyes', 'F', '', 'A', '2015'],
    ['Fiona', 'Camps', 'Escola Pardinyes', 'F', '', 'A', '2015'],
    ['Gina', 'Ros', 'Escola Pardinyes', 'F', '', 'A', '12/03/2016'],
    ['Helena', 'Pons', 'Club Balaguer', 'F', '', 'A', '2015'],
    ['Iris', 'Font', 'Club Balaguer', 'F', '', 'B', '2015'],
    ['Pau', 'Gil', 'CG Lleida', 'M', '', 'A', '2016'],
  ];
  await page.fill('#imptext', rows.map(r => r.join('\t')).join('\n'));
  await page.click('button[data-act=impAnalyze]');
  await page.waitForSelector('text=10 fitxes noves');
  await page.click('button[data-act=impDo]');
  await page.waitForSelector('#gymtable >> text=Helena');
  assert.equal(await page.locator('#gymtable tbody tr').count(), 10);
  // «aleví» en minúscules → «Aleví», i les que no en tenien l'han treta de l'any
  assert.equal(await page.locator('#gymtable td', { hasText: /^Aleví$/ }).count(), 10);
  assert.equal(await page.locator('#gymtable td', { hasText: /^Masc\.$/ }).count(), 1);
});

await step('afegeix una gimnasta a mà amb «Desa i afegeix-ne una altra»', async () => {
  await page.click('button[data-act=newGym]');
  await page.fill('#dlg input[name=name]', 'Júlia');
  await page.fill('#dlg input[name=surname]', 'Bosch');
  await page.fill('#dlg input[name=club]', 'Club Balaguer');
  await page.selectOption('#dlg select[name=category]', 'Aleví');
  await page.selectOption('#dlg select[name=level]', 'A');
  await page.click('#dlg button[name=again]');
  // el formulari nou recorda entitat, categoria i nivell
  assert.equal(await page.inputValue('#dlg input[name=club]'), 'Club Balaguer');
  await page.fill('#dlg input[name=name]', 'Laia');
  await page.fill('#dlg input[name=surname]', 'Serra');
  await page.click('#dlg button.primary');
  await page.waitForSelector('#gymtable >> text=Laia');
  assert.equal(await page.locator('#gymtable tbody tr').count(), 12);
});

await step('l’any de naixement posa la categoria sola', async () => {
  await page.click('button[data-act=newGym]');
  await page.fill('#dlg input[name=birthYear]', '2013');
  assert.equal(await page.inputValue('#dlg select[name=category]'), 'Infantil');
  await page.fill('#dlg input[name=birthYear]', '2008');
  assert.equal(await page.inputValue('#dlg select[name=category]'), 'Sènior');
  await page.click('#dlg button[data-act=closeDlg]');
});

await step('fa els equips per entitat (3 a 6) i queden a la fitxa de cada gimnasta', async () => {
  await page.click('a[data-nav=gimnastes]');
  await page.click('.seg a:has-text("Equips")');
  await page.click('button[data-act=autoTeams]');
  const n = await page.locator('#dlg input[name=p]').count();
  assert.equal(n, 3, 'CG Lleida (4), Escola Pardinyes (3), Club Balaguer (3); el Pau sol no fa equip');
  await page.click('#dlg button.primary');
  await page.waitForSelector('main >> text=Escola Pardinyes');
  await shot('equips');
  await page.goto(url + '#/gimnastes');
  const anna = page.locator('#gymtable tr:has(td:text-is("Puig"))');
  assert.match(await anna.locator('select.teamsel option:checked').textContent(), /^CG Lleida — 4\/6/);
  const pau = page.locator('#gymtable tr:has(td:text-is("Gil"))');
  assert.match(await pau.locator('select.teamsel option:checked').textContent(), /^Automàtic/);
});

await step('crea una competició i hi inscriu tothom: cadascú va al seu equip', async () => {
  await page.click('a[data-nav=competicions]');
  await page.click('button[data-act=newComp]');
  await page.fill('#dlg input[name=name]', 'Fase comarcal de gim. artística');
  await page.fill('#dlg input[name=date]', '2027-01-22');
  await page.click('#dlg button.primary');
  await page.waitForSelector('button[data-act=enrollGyms]');
  await page.click('button[data-act=enrollGyms]');
  await page.click('#dlg button[data-act=checkAll]');
  await page.click('#dlg button.primary');
  await page.waitForSelector('text=Aleví femení · Nivell A');
  await page.waitForSelector('text=Aleví femení · Nivell B');
  await page.waitForSelector('text=Aleví masculí · Nivell A');
  assert.equal(await page.locator('table.tbl tbody tr').count(), 12);
  const chips = await page.locator('.chip b').allTextContents();
  assert.deepEqual(chips.sort(), ['CG Lleida', 'Club Balaguer', 'Escola Pardinyes']);
  await shot('inscripcions');
});

await step('entra notes amb el teclat (Intro baixa a la següent)', async () => {
  await page.click('.tabs a:has-text("Notes")');
  // els nois no tenen barra; les noies sí
  await page.click('button[data-act=pickGroup]:has-text("masculí")');
  assert.equal(await page.locator('button[data-act=pickApp][data-a=barra]').count(), 0);
  assert.equal(await page.locator('button[data-act=pickApp][data-a=mini]').count(), 1);
  await page.click('button[data-act=pickGroup]:has-text("Aleví femení · Nivell A")');
  await page.click('button[data-act=pickApp][data-a=salt]');
  const salt = ['8,5', '9', '7.25', '8', '8,1', '7,9', '8,3', '9,2', '6,5', '7'];
  const first = page.locator('#scoregrid input.sc').first();
  await first.focus();
  for (const v of salt) { await page.keyboard.type(v); await page.keyboard.press('Enter'); }
  // el salt és una sola casella (la tutora dona la nota final)
  assert.equal(await page.locator('#scoregrid input.sc[data-col="salt:1:v"]').count(), 0);
  await page.click('button[data-act=pickApp][data-a=all]');
  // Totes: omplim barra i terra per columnes
  for (const app of ['barra', 'terra']) {
    const col = page.locator(`#scoregrid input.sc[data-a=${app}]`);
    await col.first().focus();
    const vals = app === 'barra' ? ['7', '8', '9', '6', '8,5', '7,5', '8', '9', '7', '8'] : ['9', '8', '7', '8', '9', '8', '7', '8,8', '7', '8'];
    for (const v of vals) { await page.keyboard.type(v); await page.keyboard.press('Enter'); }
  }
  const tot = await page.locator('#scoregrid td[data-out^="tot:"]').allTextContents();
  assert.ok(tot.every(t => /\d+,\d\d/.test(t)), 'tots els totals calculats: ' + tot.join(' | '));
  await shot('notes');
});

await step('nota impossible (835 amb màxim 20): no es desa i proposa 8,35', async () => {
  const col = page.locator('#scoregrid input.sc[data-col="salt:0:v"]');
  const before = await col.nth(5).inputValue();
  await col.nth(5).click();
  await page.keyboard.type('835');
  await page.keyboard.press('Enter');
  assert.ok(await col.nth(5).evaluate(el => el === document.activeElement && el.classList.contains('invalid')));
  await page.waitForSelector('#fixtip:has-text("el màxim és 20")');
  await page.click('#fixtip button:has-text("8,35")');
  assert.equal(await col.nth(5).inputValue(), '8,35');
  assert.ok(await col.nth(6).evaluate(el => el === document.activeElement), 'passa a la següent');
  // la torna a deixar com estava
  await col.nth(5).click(); await page.keyboard.type(before); await page.keyboard.press('Enter');
});

await step('«NP» escrit a la casella: no presentada (i es pot desfer)', async () => {
  const col = page.locator('#scoregrid input.sc[data-col="terra:0:v"]');
  const id = await col.nth(2).getAttribute('data-e');
  await col.nth(2).click();
  await page.keyboard.type('np');
  await page.keyboard.press('Enter');
  await page.waitForSelector(`#scoregrid tr[data-row="${id}"].np`);
  await page.click('.toast:has-text("no presentada") button:has-text("Desfés")');
  await page.waitForSelector(`#scoregrid tr[data-row="${id}"]:not(.np)`);
});

await step('nota no vàlida queda marcada i no es desa', async () => {
  const inp = page.locator('#scoregrid input.sc[data-a=salt]').first();
  const before = await inp.inputValue();
  await inp.fill('8,3,1');
  await inp.press('Tab');
  assert.ok(await inp.evaluate(el => el.classList.contains('invalid')));
  await page.reload();
  await page.waitForSelector('#scoregrid');
  assert.equal(await page.locator('#scoregrid input.sc[data-a=salt]').first().inputValue(), before);
});

await step('nota escrita sense Intro es desa igualment si es tanca o es recarrega', async () => {
  const inp = page.locator('#scoregrid input.sc[data-col="salt:0:v"]').nth(2);
  await inp.click();
  await page.keyboard.type('7,6');
  await page.reload();
  await page.waitForSelector('#scoregrid');
  assert.equal(await page.locator('#scoregrid input.sc[data-col="salt:0:v"]').nth(2).inputValue(), '7,60');
});

await step('nota no vàlida + Intro: es queda a la mateixa casella', async () => {
  const col = page.locator('#scoregrid input.sc[data-col="salt:0:v"]');
  await col.nth(3).click();
  await page.keyboard.type('7..1');
  await page.keyboard.press('Enter');
  assert.ok(await col.nth(3).evaluate(el => el === document.activeElement && el.classList.contains('invalid')));
  await page.keyboard.type('7,1');
  await page.keyboard.press('Enter');
  assert.ok(await col.nth(4).evaluate(el => el === document.activeElement));
  assert.equal(await col.nth(3).inputValue(), '7,10');
});

await step('minitramp dels nois: 2 salts, compta el millor', async () => {
  await page.click('button[data-act=pickGroup]:has-text("masculí")');
  const mini = page.locator('#scoregrid input.sc[data-col="mini:0:v"]');
  await mini.first().fill('8,2'); await mini.first().press('Tab');
  const mini2 = page.locator('#scoregrid input.sc[data-col="mini:1:v"]');
  await mini2.first().fill('8,9'); await mini2.first().press('Tab');
  assert.equal(await page.locator('#scoregrid td[data-out$=":mini"]').first().textContent(), '8,90');
  await page.click('button[data-act=pickGroup]:has-text("Aleví femení · Nivell A")');
});

await step('canviar d’equip el mateix dia des de la graella (només aquell dia; la fitxa no canvia)', async () => {
  const sel = page.locator('#scoregrid select.teamsel').first();
  assert.equal(await sel.getAttribute('tabindex'), '-1', 'amb Tab i Intro no s’hi entra');
  const before = await sel.inputValue(), eid = await sel.getAttribute('data-id');
  await sel.selectOption('');
  await page.waitForSelector('.toast:has-text("en aquesta competició") button:has-text("També a la fitxa")');
  assert.equal(await page.locator('#scoregrid select.teamsel').first().inputValue(), '');
  await page.waitForTimeout(300);
  const d = JSON.parse(await page.evaluate(() => localStorage.getItem('notesgim.db')));
  const gid = d.competitions[0].entries.find(e => e.id === eid).gymnastId;
  assert.ok(d.teams.some(t => t.memberIds.includes(gid)), 'a la fitxa continua al seu equip');
  await page.locator('#scoregrid select.teamsel').first().selectOption(before);
  await page.waitForSelector('#scoregrid');
  assert.equal(await page.locator('#scoregrid select.teamsel').first().inputValue(), before);
});

await step('classificacions: individual, per aparells i equips (3 millors)', async () => {
  await page.click('.tabs a:has-text("Classificacions")');
  await page.waitForSelector('text=General individual');
  const firstPos = await page.locator('table.tbl tbody tr').first().locator('td').first().textContent();
  assert.equal(firstPos.trim(), '1');
  await page.click('button[data-act=pickClsType][data-t=teams]');
  await page.waitForSelector('tr.team-row');
  assert.equal(await page.locator('tr.team-row').count(), 3);
  // CG Lleida té 4 gimnastes: a cada aparell n'hi ha una de ratllada
  assert.ok(await page.locator('td.disc').count() >= 3);
  // les gimnastes de cada equip surten en un desplegable
  const firstTeam = page.locator('tr.team-row').first();
  assert.equal(await page.locator('tr.member:not(.hidden)').count(), 0);
  await firstTeam.locator('button.tg').click();
  assert.ok(await page.locator('tr.member:not(.hidden)').count() >= 3);
  await page.click('button[data-act=toggleAllTeams][data-open="1"]');
  assert.equal(await page.locator('tr.member.hidden').count(), 0);
  await shot('classificacio-equips');
  await page.click('button[data-act=pickClsType][data-t=apps]');
  await page.waitForSelector('h3:has-text("Salt")');
  await page.click('button[data-act=pickClsType][data-t=podium]');
  await page.waitForSelector('table.podium');
  assert.ok((await page.locator('table.podium').first().textContent()).includes('Or'));
  // al podi d'equips, el desplegable diu qui cal cridar
  const det = page.locator('details.mem').first();
  await det.locator('summary').click();
  assert.ok((await det.textContent()).includes('Anna Puig') || (await det.textContent()).includes('Elna Mas') || (await det.locator('li').count()) >= 3);
  await shot('podi');
  await page.click('button[data-act=pickClsType][data-t=general]');
});

await step('un equip que es queda amb 2 per una NP s’anul·la', async () => {
  await page.click('.tabs a:has-text("Inscripcions")');
  const row = page.locator('tr', { hasText: 'Laia Serra' });
  await row.locator('select[data-chg=entryStatus]').selectOption('np');
  await page.click('.tabs a:has-text("Classificacions")');
  await page.click('button[data-act=pickClsType][data-t=teams]');
  await page.waitForSelector('text=Equips anul·lats');
  assert.equal(await page.locator('tr.team-row').count(), 2);
  await page.click('.tabs a:has-text("Inscripcions")');
  await page.locator('tr', { hasText: 'Laia Serra' }).locator('select[data-chg=entryStatus]').selectOption('');
  await page.click('.tabs a:has-text("Classificacions")');
  await page.waitForSelector('tr.team-row');
  assert.equal(await page.locator('tr.team-row').count(), 3);
});

await step('les dades es mantenen després de tancar i tornar a obrir', async () => {
  const p2 = await ctx.newPage();
  await p2.goto(url + '#/gimnastes');
  await p2.waitForSelector('#gymtable >> text=Laia');
  assert.equal(await p2.locator('#gymtable tbody tr').count(), 12);
  await p2.close();
});

await step('jornada següent: es proposa copiar l’anterior, i els equips surten de les fitxes', async () => {
  await page.click('a[data-nav=competicions]');
  await page.click('button[data-act=newComp]');
  // del mateix curs: proposa copiar la jornada anterior i el nom
  assert.ok((await page.locator('#dlg select[name=copyFrom] option:checked').textContent()).includes('Fase comarcal'));
  await page.fill('#dlg input[name=name]', 'Segona fase');
  await page.fill('#dlg input[name=date]', '2027-03-05');
  await page.click('#dlg button.primary');
  await page.waitForSelector('.toast:has-text("Competició creada amb 12 gimnastes")');
  await page.click('.tabs a:has-text("Inscripcions")');
  await page.waitForSelector('text=Aleví femení · Nivell A');
  const chips = await page.locator('.chip b').allTextContents();
  assert.deepEqual(chips.sort(), ['CG Lleida', 'Club Balaguer', 'Escola Pardinyes']);
  // treure una gimnasta d'un equip a mà: «Fes equips per entitat» no la torna a posar
  const row = page.locator('tr', { hasText: 'Dana Roca' });
  await row.locator('select[data-chg=entryTeam]').selectOption('');
  await page.waitForSelector('.toast:has-text("Dana Roca → individual")');
  await page.click('button[data-act=enrollGyms]');
  await page.waitForSelector('#dlg[open]');
  assert.ok((await page.locator('#gympick').textContent()).includes('Ja està tothom inscrit'));
  await page.click('#dlg button[data-act=closeDlg]');
  await page.click('button[data-act=autoCompTeams]');
  assert.equal(await page.locator('tr', { hasText: 'Dana Roca' }).locator('select[data-chg=entryTeam]').inputValue(), '');
  // la cerca amaga les que no hi coincideixen
  await page.fill('input[data-inp=insSearch]', 'pardinyes');
  assert.equal(await page.locator('table.ins tbody tr:not(.hidden)').count(), 3);
  await page.fill('input[data-inp=insSearch]', '');
  // tornem a la primera competició (la de gener, que surt la segona a la llista)
  await page.goto(url + '#/competicions');
  await page.locator('.comp-card', { hasText: '22/01/2027' }).locator('a.btn').click();
  await page.waitForSelector('.tabs');
});

await step('rànquing de jornades: suma les competicions del curs', async () => {
  await page.goto(url + '#/ranquing');
  await page.waitForSelector('text=Rànquing de jornades');
  await page.waitForSelector('table.tbl');
  const first = page.locator('table.tbl tbody tr').first();
  assert.equal((await first.locator('td').first().textContent()).trim(), '1');
  // dues jornades al curs 2026-2027: J1 amb notes i J2 encara sense
  assert.equal(await page.locator('input[data-chg=rkComp]').count(), 2);
  await shot('ranquing');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button[data-act=exportRanking]')]);
  await dl.saveAs(path.join(out, 'ranquing.xlsx'));
  await page.goto(url + '#/competicions');
  await page.locator('.comp-card', { hasText: '22/01/2027' }).locator('a.btn').click();
  await page.waitForSelector('.tabs');
});

await step('exporta a Excel (.xlsx)', async () => {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button[data-act=exportComp]')]);
  await dl.saveAs(path.join(out, 'competicio.xlsx'));
});

await step('impressió: avisa de les notes que falten i genera el PDF', async () => {
  await page.evaluate(() => { window.print = () => {}; });
  await page.click('.comp-head .hide-ph button[data-act=printDlg]');
  for (const t of ['podium', 'apps', 'notes', 'judge', 'list']) await page.check(`#dlg input[name=t][value=${t}]`);
  await page.click('#dlg button.primary');
  // l'Iris (nivell B) i el Pau encara no tenen totes les notes
  await page.waitForSelector('#confirm[open] >> text=Encara falten');
  await page.click('#confirm button[value=print]');
  await page.waitForFunction(() => document.querySelectorAll('#print .sheet').length > 0);
  const n = await page.locator('#print .sheet').count();
  assert.ok(n >= 10, 'fulls: ' + n);
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: path.join(out, 'impresos.pdf'), format: 'A4', printBackground: true });
  await page.emulateMedia({ media: 'screen' });
});

await step('passar de curs: +1 any i les gimnastes canvien de categoria', async () => {
  await page.goto(url + '#/configuracio');
  await page.click('button[data-act=shiftYears][data-d="1"]');
  await page.waitForSelector('#confirm[open]');
  await page.click('#confirm button[value=ok]');
  await page.goto(url + '#/gimnastes');
  await page.waitForSelector('#gymtable');
  // nascudes el 2015 → Infantil; 2016 → segueixen a Aleví
  const anna = page.locator('#gymtable tr', { hasText: 'Anna' });
  assert.ok((await anna.textContent()).includes('Infantil'));
  const carla = page.locator('#gymtable tr', { hasText: 'Carla' });
  assert.ok((await carla.textContent()).includes('Aleví'));
  // les competicions ja fetes conserven la categoria d'aquell dia
  await page.goto(url + '#/competicions');
  await page.locator('.comp-card', { hasText: '22/01/2027' }).locator('a.btn').click();
  await page.click('.tabs a:has-text("Inscripcions")');
  await page.waitForSelector('text=Aleví femení · Nivell A');
});

await step('l’equip es tria a la mateixa fitxa (i la competició oberta la segueix)', async () => {
  await page.goto(url + '#/gimnastes');
  await page.waitForSelector('#gymtable');
  const carla = page.locator('#gymtable tr:has(td:text-is("Vidal"))');
  await carla.locator('a[data-act=editGym]').click();
  await page.selectOption('#dlg select[name=team]', '__new');
  await page.fill('#dlg input[name=newTeam]', 'Equip de prova');
  await page.click('#dlg button.primary');
  await page.waitForSelector('.toast:has-text("Equip de prova")');
  await page.waitForTimeout(400);
  const d = JSON.parse(await page.evaluate(() => localStorage.getItem('notesgim.db')));
  const g = d.gymnasts.find(x => x.name === 'Carla');
  const t = d.teams.find(x => x.name === 'Equip de prova');
  assert.ok(t.memberIds.includes(g.id));
  assert.equal(d.teams.filter(x => x.memberIds.includes(g.id)).length, 1, 'només en un equip');
  for (const c of d.competitions) {
    const e = c.entries.find(x => x.gymnastId === g.id);
    if (!e || c.locked) continue;
    assert.equal(c.teams.find(x => x.id === e.teamId).name, 'Equip de prova');
  }
  // a la llista es pot canviar directament (i es pot desfer)
  const sel = page.locator(`#gymtable select.teamsel[data-id="${g.id}"]`);
  assert.match(await sel.locator('option:checked').textContent(), /^Equip de prova — 1\/6/);
  const lleida = d.teams.find(x => x.name === 'CG Lleida');
  await sel.selectOption(lleida.id);
  await page.waitForSelector('.toast:has-text("→ CG Lleida")');
  await page.click('.toast:has-text("→ CG Lleida") button:has-text("Desfés")');
  await page.waitForSelector('.toast:has-text("Desfet")');
  // «Només individual»: no entra a cap equip, tampoc als automàtics
  await page.locator(`#gymtable select.teamsel[data-id="${g.id}"]`).selectOption('__none');
  await page.waitForSelector('.toast:has-text("només individual")');
  await page.waitForTimeout(400);
  const d2 = JSON.parse(await page.evaluate(() => localStorage.getItem('notesgim.db')));
  assert.equal(d2.teams.filter(x => x.memberIds.includes(g.id)).length, 0);
  for (const c of d2.competitions) { const e = c.entries.find(x => x.gymnastId === g.id); if (e) assert.equal(e.teamId, null); }
});

await step('al mòbil: navegació a baix, res no desborda i entrada ràpida amb el teclat gran', async () => {
  const raw = await page.evaluate(() => localStorage.getItem('notesgim.db'));
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ca-ES' });
  await mctx.addInitScript(r => { if (!localStorage.getItem('notesgim.db')) localStorage.setItem('notesgim.db', r); }, raw);
  const ph = await mctx.newPage();
  ph.on('pageerror', e => errors.push('mòbil pageerror: ' + e.message));
  ph.on('console', m => { if (m.type() === 'error') errors.push('mòbil console: ' + m.text()); });
  const comp = JSON.parse(raw).competitions.find(c => c.date === '2027-01-22');
  for (const v of ['#/competicions', '#/gimnastes', '#/equips', '#/ranquing', '#/configuracio', '#/entitats',
    ...['inscripcions', 'notes', 'classificacions', 'configuracio'].map(t => `#/competicio/${comp.id}/${t}`)]) {
    await ph.goto(url + v); await ph.waitForTimeout(120);
    assert.ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'desborda a ' + v);
  }
  assert.ok(await ph.locator('nav.bottom').isVisible());
  assert.equal(await ph.locator('header.top nav').isVisible(), false);
  // a l'inici, la competició del dia amb accés directe
  await ph.goto(url + '#/competicions');
  await ph.locator('.avui a:has-text("Notes")').click();
  await ph.waitForSelector('.gsel select');
  assert.equal(await ph.locator('button[data-act=pickApp][data-a=all]').count(), 0, 'al mòbil, un aparell cada vegada');
  const key = await ph.locator('.gsel select option', { hasText: 'masculí' }).getAttribute('value');
  await ph.locator('.gsel select').selectOption(key);
  await ph.click('button[data-act=pickApp][data-a=salt]');
  await ph.click('button[data-act=toggleQe]');
  await ph.waitForSelector('#qe');
  assert.ok((await ph.locator('.qe-who b').textContent()).includes('Pau'));
  // 950 no pot ser: proposa 9,50
  for (const k of ['9', '5', '0']) await ph.click(`.qe-keys button[data-k="${k}"]`);
  assert.ok(await ph.locator('#qesave').isDisabled());
  await ph.click('#qehint button:has-text("9,50")');
  assert.equal(await ph.locator('#qedisp').textContent(), '9,50');
  for (let i = 0; i < 4; i++) await ph.click('.qe-keys button[data-k="del"]');
  for (const k of ['9', ',', '2', '5']) await ph.click(`.qe-keys button[data-k="${k}"]`);
  await ph.click('#qesave');
  await ph.waitForSelector('.toast:has-text("Desada 9,25")');
  await ph.waitForTimeout(400);
  const d = JSON.parse(await ph.evaluate(() => localStorage.getItem('notesgim.db')));
  const pau = d.gymnasts.find(g => g.name === 'Pau');
  assert.equal(d.competitions.find(c => c.id === comp.id).entries.find(e => e.gymnastId === pau.id).scores.salt[0].v, 9.25);
  await ph.screenshot({ path: path.join(out, 'mobil-entrada-rapida.png') });
  await ph.goto(url + `#/competicio/${comp.id}/classificacions`);
  await ph.waitForSelector('.gsel select');
  await ph.screenshot({ path: path.join(out, 'mobil-classificacio.png') });
  await mctx.close();
});

await step('còpia de seguretat: es descarrega i es pot restaurar', async () => {
  await page.goto(url + '#/configuracio');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button[data-act=backup]')]);
  const file = path.join(out, 'copia.json');
  await dl.saveAs(file);
  // esborrem-ho tot i restaurem
  await page.click('button[data-act=wipe]');
  await page.fill('#confirm input[name=typed]', 'ESBORRA');
  await page.click('#confirm button[value=ok]');
  await page.goto(url + '#/gimnastes');
  await page.waitForSelector('text=Encara no hi ha cap gimnasta');
  await page.goto(url + '#/configuracio');
  await page.evaluate(() => { window.showOpenFilePicker = undefined; });
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('button[data-act=restore]')]);
  await chooser.setFiles(file);
  await page.click('#confirm button[value=ok]');
  await page.goto(url + '#/gimnastes');
  await page.waitForSelector('#gymtable >> text=Laia');
});

await step('una còpia trucada no executa codi (noms, dates, ids i logo)', async () => {
  const evil = {
    app: 'notesgim',
    settings: { org: '<img src=x onerror="window.__xss=1">', logoL: 'x" onerror="window.__xss=2', categories: ['Aleví'], levels: ['A'] },
    clubs: [{ id: '"><img src=x onerror=window.__xss=3>', name: '<b onmouseover=window.__xss=4>Club</b>' }],
    gymnasts: [{ id: 'g"><svg onload=window.__xss=5>', name: '<img src=x onerror=window.__xss=6>', surname: 'X', clubId: '"><img src=x onerror=window.__xss=3>', category: 'Aleví', level: 'A' }],
    teams: [],
    competitions: [{ id: 'c1" onclick="window.__xss=7', name: 'Mala', date: '<img src=x onerror=window.__xss=8>', season: '<i>', entries: [
      { id: 'e"><img src=x onerror=window.__xss=9>', gymnastId: 'g"><svg onload=window.__xss=5>', category: 'Aleví', level: 'A', bib: '<x>', scores: { 'salt"><img src=x onerror=window.__xss=10>': [{ v: 8 }] } }], teams: [] }],
    meta: { lastBackup: '<img src=x onerror=window.__xss=11>', updated: 5 },
  };
  const file = path.join(out, 'trucada.json');
  writeFileSync(file, JSON.stringify(evil));
  await page.goto(url + '#/configuracio');
  await page.evaluate(() => { window.showOpenFilePicker = undefined; });
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('button[data-act=restore]')]);
  await chooser.setFiles(file);
  await page.click('#confirm button[value=ok]');
  for (const v of ['#/competicions', '#/gimnastes', '#/entitats', '#/configuracio', '#/ranquing']) { await page.goto(url + v); await page.waitForTimeout(150); }
  await page.goto(url + '#/competicions');
  await page.locator('.comp-card a.btn').first().click();
  for (const t of ['inscripcions', 'notes', 'classificacions', 'configuracio']) { await page.click(`.tabs a[href$="/${t}"]`); await page.waitForTimeout(150); }
  assert.equal(await page.evaluate(() => window.__xss), undefined);
});

await shot('final');
await browser.close();
if (errors.length) { console.error('\nErrors a la consola:\n' + errors.join('\n')); process.exit(1); }
console.log('\nTot correcte. Captures i fitxers a tests/out/');
