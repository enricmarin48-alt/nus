// Tests del motor de càlcul. Sense dependències: node --test tests/
// Extreu el bloc ENGINE-START … ENGINE-END d'index.html i el prova sol.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf('const Engine = (', html.indexOf('ENGINE-START'));
const src = html.slice(start, html.indexOf('ENGINE-END', start)).replace(/\/\*[^*]*$/, '');
const ctx = vm.createContext({});
vm.runInContext(src + '\n;globalThis.Engine = Engine;', ctx);
const E = ctx.Engine;
// els objectes creats dins el context vm tenen un altre Array.prototype: els passem a objectes normals
const plain = x => JSON.parse(JSON.stringify(x));

const APPS = () => [
  { id: 'salt', name: 'Salt', enabled: true, inTotal: true, inTeam: true, attempts: 1, rule: 'best' },
  { id: 'barra', name: 'Barra', enabled: true, inTotal: true, inTeam: true, attempts: 1, rule: 'best' },
  { id: 'terra', name: 'Terra', enabled: true, inTotal: true, inTeam: true, attempts: 1, rule: 'best' },
  { id: 'mini', name: 'Minitramp', enabled: true, inTotal: false, inTeam: false, attempts: 1, rule: 'best' },
];
const comp = (over = {}) => Object.assign({ scoring: 'simple', apparatus: APPS(), entries: [], teams: [],
  teamCount: 3, teamMin: 3, teamMax: 6, tieInd: 'shared', tieTeam: 'shared', tieApp: 'shared' }, over);
let n = 0;
const entry = (name, notes, extra = {}) => Object.assign({ id: 'e' + (++n), name, category: 'Aleví', level: 'A', status: '',
  scores: Object.fromEntries(Object.entries(notes).map(([k, v]) => [k, [{ v }]])) }, extra);
const nameOf = e => e.name;
const group = c => E.groupsOf(c, { categories: ['Aleví'], levels: ['A'] })[0];

test('parseScore accepta coma i punt, rebutja brossa', () => {
  assert.equal(E.parseScore('8,35'), 8.35);
  assert.equal(E.parseScore(' 8.350 '), 8.35);
  assert.equal(E.parseScore('10'), 10);
  assert.equal(E.parseScore('9.'), 9);
  assert.equal(E.parseScore(',5'), 0.5);
  assert.equal(E.parseScore(''), null);
  assert.equal(E.parseScore('   '), null);
  assert.ok(Number.isNaN(E.parseScore('8,3,5')));
  assert.ok(Number.isNaN(E.parseScore('abc')));
  assert.ok(Number.isNaN(E.parseScore('-1')));
  assert.equal(E.parseScore('8,2754'), 8.275); // es queda amb 3 decimals
});

test('fmt mostra 2 o 3 decimals amb coma', () => {
  assert.equal(E.fmt(8250), '8,25');
  assert.equal(E.fmt(8275), '8,275');
  assert.equal(E.fmt(12000), '12,00');
  assert.equal(E.fmt(0), '0,00');
  assert.equal(E.fmt(null), '');
  assert.equal(E.fmt(5), '0,005');
});

test('les sumes no tenen errors de coma flotant', () => {
  const c = comp();
  const e = entry('A', { salt: 0.1, barra: 0.2, terra: 0.7 });
  c.entries.push(e);
  assert.equal(E.entryTotal(c, e), 1000);
});

test('general individual: suma només els aparells que compten i el minitramp va a part', () => {
  const c = comp();
  c.entries.push(entry('Anna', { salt: 8, barra: 7.5, terra: 9, mini: 9.9 }), entry('Berta', { salt: 9, barra: 8, terra: 9 }));
  const { rows } = E.individualRanking(c, group(c), { nameOf });
  assert.deepEqual(plain(rows.map(r => [r.name, r.rank, r.total])), [['Berta', 1, 26000], ['Anna', 2, 24500]]);
});

test('empats: mateixa posició i la següent salta (1, 1, 3)', () => {
  const c = comp();
  c.entries.push(entry('Carla', { salt: 8, barra: 8, terra: 8 }), entry('Anna', { salt: 9, barra: 7, terra: 8 }), entry('Dana', { salt: 7, barra: 7, terra: 7 }));
  const { rows } = E.individualRanking(c, group(c), { nameOf });
  assert.deepEqual(plain(rows.map(r => [r.name, r.rank, r.tied])), [['Anna', 1, true], ['Carla', 1, true], ['Dana', 3, false]]);
});

test('desempat per millor nota d’aparell', () => {
  const c = comp({ tieInd: 'bestApp' });
  c.entries.push(entry('Carla', { salt: 8, barra: 8, terra: 8 }), entry('Anna', { salt: 9, barra: 7, terra: 8 }));
  const { rows } = E.individualRanking(c, group(c), { nameOf });
  assert.deepEqual(plain(rows.map(r => [r.name, r.rank])), [['Anna', 1], ['Carla', 2]]);
});

test('no presentades i sense notes no tenen posició i van al final', () => {
  const c = comp();
  c.entries.push(entry('Zoe', { salt: 5, barra: 5, terra: 5 }), entry('Anna', {}), entry('Bea', { salt: 9 }, { status: 'np' }));
  const { rows } = E.individualRanking(c, group(c), { nameOf });
  assert.deepEqual(plain(rows.map(r => [r.name, r.rank])), [['Zoe', 1], ['Anna', null], ['Bea', null]]);
  assert.equal(rows[2].np, true);
});

test('equips: a cada aparell només compten les 3 millors notes', () => {
  const c = comp();
  c.teams.push({ id: 't1', name: 'Club X', category: 'Aleví', level: 'A' }, { id: 't2', name: 'Club Y', category: 'Aleví', level: 'A' });
  // Club X: 6 gimnastes
  const xs = [[9, 8, 7], [8, 9, 6], [7, 7, 9], [6, 6, 8], [5, 9.5, 5], [4, 4, 4]];
  xs.forEach((s, i) => c.entries.push(entry('X' + i, { salt: s[0], barra: s[1], terra: s[2] }, { teamId: 't1' })));
  // Club Y: 3 gimnastes
  [[8, 8, 8], [8, 8, 8], [8, 8, 8]].forEach((s, i) => c.entries.push(entry('Y' + i, { salt: s[0], barra: s[1], terra: s[2] }, { teamId: 't2' })));
  const { rows } = E.teamRanking(c, group(c));
  const x = rows.find(r => r.name === 'Club X');
  assert.equal(x.perApp.salt.value, 24000);   // 9 + 8 + 7
  assert.equal(x.perApp.barra.value, 26500);  // 9.5 + 9 + 8
  assert.equal(x.perApp.terra.value, 24000);  // 9 + 8 + 7
  assert.equal(x.total, 74500);
  assert.equal(rows[0].name, 'Club X');
  assert.equal(rows[1].total, 72000);
  // les que no compten queden marcades
  const x5 = c.entries.find(e => e.name === 'X5');
  assert.equal(x.counted[x5.id], undefined);
  const x4 = c.entries.find(e => e.name === 'X4');
  assert.deepEqual(plain(x.counted[x4.id]), { barra: true });
});

test('equips: el nombre de notes que compten és configurable i el minitramp no hi entra', () => {
  const c = comp({ teamCount: 2 });
  c.teams.push({ id: 't1', name: 'T', category: 'Aleví', level: 'A' });
  [[9, 9, 9, 10], [8, 8, 8, 10], [7, 7, 7, 10]].forEach((s, i) => c.entries.push(entry('T' + i, { salt: s[0], barra: s[1], terra: s[2], mini: s[3] }, { teamId: 't1' })));
  const { rows } = E.teamRanking(c, group(c));
  assert.equal(rows[0].total, 51000);
});

test('equips amb menys gimnastes del mínim no classifiquen; NP no puntua ni compta per al mínim', () => {
  const c = comp();
  c.teams.push({ id: 't1', name: 'Petit', category: 'Aleví', level: 'A' }, { id: 't2', name: 'Bo', category: 'Aleví', level: 'A' });
  c.entries.push(entry('P1', { salt: 9, barra: 9, terra: 9 }, { teamId: 't1' }), entry('P2', { salt: 9, barra: 9, terra: 9 }, { teamId: 't1' }));
  c.entries.push(entry('B1', { salt: 5, barra: 5, terra: 5 }, { teamId: 't2' }), entry('B2', { salt: 5, barra: 5, terra: 5 }, { teamId: 't2' }),
    entry('B3', { salt: 9, barra: 9, terra: 9 }, { teamId: 't2', status: 'np' }));
  const { rows } = E.teamRanking(c, group(c));
  const petit = rows.find(r => r.name === 'Petit'), bo = rows.find(r => r.name === 'Bo');
  assert.equal(petit.eligible, false);
  assert.equal(petit.rank, null);
  assert.equal(petit.rawTotal, 54000);
  // «Bo» té 3 inscrites però una no s'ha presentat: només n'han competit 2, com «Petit»
  assert.equal(bo.eligible, false);
  assert.equal(bo.rank, null);
  assert.equal(bo.rawTotal, 30000);     // la NP no suma
  assert.equal(bo.complete, false);     // només 2 notes per aparell
});

test('equips de més del màxim no classifiquen', () => {
  const c = comp({ teamMax: 6 });
  c.teams.push({ id: 'g', name: 'Gran', category: 'Aleví', level: 'A' }, { id: 'n', name: 'Normal', category: 'Aleví', level: 'A' });
  for (let i = 0; i < 8; i++) c.entries.push(entry('G' + i, { salt: 9, barra: 9, terra: 9 }, { teamId: 'g' }));
  for (let i = 0; i < 6; i++) c.entries.push(entry('N' + i, { salt: 8, barra: 8, terra: 8 }, { teamId: 'n' }));
  const { rows } = E.teamRanking(c, group(c));
  const gran = rows.find(r => r.name === 'Gran');
  assert.equal(gran.oversize, true);
  assert.equal(gran.rank, null);
  assert.equal(rows.find(r => r.name === 'Normal').rank, 1);
});

test('mode detallat: sense E encara no hi ha nota (una E oblidada no passa per bona)', () => {
  assert.equal(E.attemptValue({ d: 2.5 }, 'detailed'), null);
  assert.equal(E.attemptValue({ e: 8 }, 'detailed'), 8000);           // D = 0
  assert.equal(E.attemptValue({ d: 2.5, e: 8, p: 0.3 }, 'detailed'), 10200);
  // nota final entrada en mode simple i després penalització en mode detallat: final − penalització
  assert.equal(E.attemptValue({ v: 8.5, p: 0.3 }, 'detailed'), 8200);
  // si la nota guardada ja ve de D+E (src 'de'), la penalització ja hi és inclosa
  assert.equal(E.attemptValue({ v: 8.2, p: 0.3, src: 'de' }, 'detailed'), 8200);
  const c = comp({ scoring: 'detailed' });
  const r = E.appResult({ scores: { salt: [{ d: 2 }] } }, c.apparatus[0], c);
  assert.equal(r.value, null);
  assert.equal(r.complete, false);
});

test('l’apòstrof també serveix de coma (tecla al costat del 0)', () => {
  assert.equal(E.parseScore("8'5"), 8.5);
});

test('amb 2 intents, una sola nota ja compta (les tutores poden donar només la final)', () => {
  const c = comp();
  c.apparatus[0] = { ...c.apparatus[0], attempts: 2, rule: 'best' };
  c.entries.push({ id: 'x', name: 'X', category: 'Aleví', level: 'A', status: '', scores: { salt: [{ v: 9 }], barra: [{ v: 8 }], terra: [{ v: 8 }] } },
    { id: 'y', name: 'Y', category: 'Aleví', level: 'A', status: '', scores: { salt: [{ v: 9 }], barra: [{ v: 8 }] } });
  const { rows } = E.individualRanking(c, group(c), { nameOf });
  assert.equal(rows[0].total, 25000);
  assert.equal(rows[0].complete, true);
  assert.equal(rows[1].complete, false);   // li falta el terra
});

test('rànquing de jornades: suma les notes de totes les competicions', () => {
  const mk = (id, notes) => {
    const c = comp({ id });
    for (const [name, gid, s, team] of notes) c.entries.push(entry(name, { salt: s, barra: s, terra: s }, { gymnastId: gid, teamId: team || null }));
    return c;
  };
  const j1 = mk('j1', [['Anna', 'g1', 8], ['Berta', 'g2', 9], ['Carla', 'g3', 7]]);
  const j2 = mk('j2', [['Anna', 'g1', 9], ['Carla', 'g3', 7]]);       // la Berta no hi va
  j1.teams.push({ id: 't', name: 'Club X', clubId: 'cx', category: 'Aleví', level: 'A' });
  j2.teams.push({ id: 'u', name: 'Club X', clubId: 'cx', category: 'Aleví', level: 'A' });
  for (const e of j1.entries) e.teamId = 't';
  for (const e of j2.entries) e.teamId = 'u';
  j2.entries.push(entry('Dana', { salt: 6, barra: 6, terra: 6 }, { gymnastId: 'g4', teamId: 'u' }));
  const [g] = E.seasonRanking([j1, j2], { categories: CATS, levels: ['A'] }, { nameOf });
  assert.deepEqual(plain(g.rows.map(r => [r.name, r.total, r.n, r.rank])),
    [['Anna', 51000, 2, 1], ['Carla', 42000, 2, 2], ['Berta', 27000, 1, 3], ['Dana', 18000, 1, 4]]);
  assert.equal(g.rows[0].per.j1, 24000);
  // equip: jornada 1 = 8+9+7 per aparell (72), jornada 2 = 9+7+6 per aparell (66)
  assert.deepEqual(plain(g.teams.map(t => [t.name, t.total, t.n])), [['Club X', 138000, 2]]);
});

test('equips: desempat per millor nota individual que compta', () => {
  const c = comp({ tieTeam: 'bestScore' });
  c.teams.push({ id: 't1', name: 'A', category: 'Aleví', level: 'A' }, { id: 't2', name: 'B', category: 'Aleví', level: 'A' });
  [[8, 8, 8], [8, 8, 8], [8, 8, 8]].forEach((s, i) => c.entries.push(entry('A' + i, { salt: s[0], barra: s[1], terra: s[2] }, { teamId: 't1' })));
  [[9, 8, 8], [7, 8, 8], [8, 8, 8]].forEach((s, i) => c.entries.push(entry('B' + i, { salt: s[0], barra: s[1], terra: s[2] }, { teamId: 't2' })));
  const { rows } = E.teamRanking(c, group(c));
  assert.equal(rows[0].total, rows[1].total);
  assert.deepEqual(plain(rows.map(r => [r.name, r.rank])), [['B', 1], ['A', 2]]);
});

test('mode detallat: D + E − penalització, mai per sota de 0', () => {
  const c = comp({ scoring: 'detailed' });
  const e = { id: 'x', category: 'Aleví', level: 'A', scores: { salt: [{ d: 2.5, e: 8.35, p: 0.3 }], barra: [{ d: 0, e: 0.2, p: 1 }] } };
  assert.equal(E.appScore(e, c.apparatus[0], 'detailed'), 10550);
  assert.equal(E.appScore(e, c.apparatus[1], 'detailed'), 0);
  // només penalització sense D ni E → sense nota
  assert.equal(E.attemptValue({ p: 0.3 }, 'detailed'), null);
  // si el mode és simple es fa servir la nota guardada
  assert.equal(E.attemptValue({ d: 2, e: 8, v: 10 }, 'simple'), 10000);
});

test('aparell amb 2 intents: millor, mitjana i suma', () => {
  const e = { scores: { salt: [{ v: 8.1 }, { v: 8.6 }] } };
  assert.equal(E.appScore(e, { id: 'salt', attempts: 2, rule: 'best' }, 'simple'), 8600);
  assert.equal(E.appScore(e, { id: 'salt', attempts: 2, rule: 'avg' }, 'simple'), 8350);
  assert.equal(E.appScore(e, { id: 'salt', attempts: 2, rule: 'sum' }, 'simple'), 16700);
  const half = { scores: { salt: [{ v: 8.1 }] } };
  const r = E.appResult(half, { id: 'salt', attempts: 2, rule: 'best' }, 'simple');
  assert.equal(r.value, 8100);
  assert.equal(r.complete, false);
});

test('classificació d’aparell amb desempat pel millor intent', () => {
  const c = comp({ tieApp: 'bestAttempt' });
  const app = { id: 'salt', name: 'Salt', enabled: true, attempts: 2, rule: 'avg' };
  c.apparatus = [app];
  c.entries.push({ id: 'a', name: 'A', category: 'Aleví', level: 'A', scores: { salt: [{ v: 8 }, { v: 8 }] } },
    { id: 'b', name: 'B', category: 'Aleví', level: 'A', scores: { salt: [{ v: 9 }, { v: 7 }] } });
  const rows = E.apparatusRanking(c, group(c), app, { nameOf });
  assert.deepEqual(plain(rows.map(r => [r.name, r.rank])), [['B', 1], ['A', 2]]);
});

test('grups ordenats segons la llista de categories i nivells', () => {
  const c = comp();
  c.entries.push(entry('a', {}, { category: 'Infantil', level: 'B' }), entry('b', {}, { category: 'Aleví', level: 'F' }),
    entry('c', {}, { category: 'Aleví', level: 'A' }), entry('d', {}, { category: 'Benjamí', level: 'A' }));
  const gs = E.groupsOf(c, { categories: ['Benjamí', 'Aleví', 'Infantil'], levels: ['A', 'B', 'F'] });
  assert.deepEqual(plain(gs.map(g => g.category + ' ' + g.level)), ['Benjamí A', 'Aleví A', 'Aleví F', 'Infantil B']);
});

test('curs escolar de setembre a agost', () => {
  assert.equal(E.seasonFor('2026-10-08'), '2026-2027');
  assert.equal(E.seasonFor('2027-01-22'), '2026-2027');
  assert.equal(E.seasonFor('2027-09-01'), '2027-2028');
  assert.equal(E.seasonFor(''), '');
});

test('nota mínima: qui fa l’exercici no baixa del mínim; un 0 continua sent 0', () => {
  const c = comp({ minScore: 3 });
  const app = c.apparatus[0];
  assert.equal(E.appScore({ scores: { salt: [{ v: 2.2 }] } }, app, c), 3000);
  assert.equal(E.appScore({ scores: { salt: [{ v: 0 }] } }, app, c), 0);
  assert.equal(E.appScore({ scores: { salt: [{ v: 7.5 }] } }, app, c), 7500);
  const det = comp({ scoring: 'detailed', minScore: 3 });
  assert.equal(E.appScore({ scores: { salt: [{ d: 0.5, e: 2, p: 0.3 }] } }, app, det), 3000);
  // sense mínim configurat no canvia res
  assert.equal(E.appScore({ scores: { salt: [{ v: 2.2 }] } }, app, comp()), 2200);
});

test('desempat FIG: primer la suma d’E, després la de D', () => {
  const c = comp({ scoring: 'detailed', tieInd: 'fig', tieApp: 'fig' });
  c.apparatus = c.apparatus.slice(0, 2);
  const mk = (name, s1, s2) => ({ id: name, name, category: 'Aleví', level: 'A', status: '', scores: { salt: [s1], barra: [s2] } });
  // mateix total (20), A té més E
  c.entries.push(mk('B', { d: 3, e: 7 }, { d: 3, e: 7 }), mk('A', { d: 2, e: 8 }, { d: 2, e: 8 }), mk('C', { d: 2, e: 8 }, { d: 2, e: 8 }));
  const { rows } = E.individualRanking(c, group(c), { nameOf });
  assert.deepEqual(plain(rows.map(r => [r.name, r.rank])), [['A', 1], ['C', 1], ['B', 3]]);
  const ar = E.apparatusRanking(c, group(c), c.apparatus[0], { nameOf });
  assert.deepEqual(plain(ar.map(r => [r.name, r.rank])), [['A', 1], ['C', 1], ['B', 3]]);
  // en mode simple no hi ha E ni D: queda empatat
  const s = comp({ tieInd: 'fig' });
  s.entries.push(entry('X', { salt: 8, barra: 8, terra: 8 }), entry('Y', { salt: 9, barra: 7, terra: 8 }));
  assert.deepEqual(plain(E.individualRanking(s, group(s), { nameOf }).rows.map(r => r.rank)), [1, 1]);
});

test('appDE amb 2 intents segueix la regla de l’aparell', () => {
  const e = { scores: { salt: [{ d: 2, e: 7 }, { d: 3, e: 7.5 }] } };
  assert.deepEqual(plain(E.appDE(e, { id: 'salt', attempts: 2, rule: 'best' }, 'detailed')), { d: 3000, e: 7500 });
  assert.deepEqual(plain(E.appDE(e, { id: 'salt', attempts: 2, rule: 'avg' }, 'detailed')), { d: 2500, e: 7250 });
  assert.deepEqual(plain(E.appDE(e, { id: 'salt', attempts: 2, rule: 'sum' }, 'detailed')), { d: 5000, e: 14500 });
});

const CATS = [
  { name: 'Prebenjamí', from: 2019, to: 2020 }, { name: 'Benjamí', from: 2017, to: 2018 }, { name: 'Aleví', from: 2015, to: 2016 },
  { name: 'Infantil', from: 2013, to: 2014 }, { name: 'Cadet', from: 2011, to: 2012 }, { name: 'Juvenil', from: 2009, to: 2010 },
  { name: 'Sènior', from: null, to: 2008 },
];

test('categoria per any de naixement (taula del curs 2026-2027)', () => {
  const c = y => E.categoryForYear(CATS, y);
  assert.equal(c(2020), 'Prebenjamí'); assert.equal(c(2019), 'Prebenjamí');
  assert.equal(c(2018), 'Benjamí'); assert.equal(c(2016), 'Aleví'); assert.equal(c('2015'), 'Aleví');
  assert.equal(c(2014), 'Infantil'); assert.equal(c(2011), 'Cadet'); assert.equal(c(2010), 'Juvenil');
  assert.equal(c(2008), 'Sènior'); assert.equal(c(1990), 'Sènior');
  assert.equal(c(2021), null);           // massa petita: cap categoria
  assert.equal(c(''), null);
  // una categoria sense cap any no captura ningú
  assert.equal(E.categoryForYear([{ name: 'Lliure', from: null, to: null }], 2015), null);
  // en passar de curs (+1 a tots els anys), qui era aleví de 2n any (2015) passa a infantil
  const next = CATS.map(x => ({ ...x, from: x.from === null ? null : x.from + 1, to: x.to === null ? null : x.to + 1 }));
  assert.equal(E.categoryForYear(next, 2015), 'Infantil');
  assert.equal(E.categoryForYear(next, 2009), 'Sènior');
});

test('noies i nois van en grups i classificacions separats', () => {
  const c = comp();
  c.entries.push(entry('Anna', { salt: 9, barra: 9, terra: 9 }, { gender: 'F' }), entry('Pau', { salt: 8, barra: 8, terra: 8 }, { gender: 'M' }),
    entry('Bet', { salt: 7, barra: 7, terra: 7 }));
  const gs = E.groupsOf(c, { categories: CATS, levels: ['A'] });
  assert.deepEqual(plain(gs.map(g => [g.gender, g.entries.map(e => e.name)])), [['F', ['Anna', 'Bet']], ['M', ['Pau']]]);
  const r = E.individualRanking(c, gs[1], { nameOf });
  assert.equal(r.rows[0].name, 'Pau');
  assert.equal(r.rows[0].rank, 1);
});

test('aparells per gènere: les noies fan barra, els nois minitramp', () => {
  const c = comp({ apparatus: [
    { id: 'salt', name: 'Salt', modes: { F: 'total', M: 'total' }, attempts: 1 },
    { id: 'barra', name: 'Barra', modes: { F: 'total', M: 'off' }, attempts: 1 },
    { id: 'terra', name: 'Terra', modes: { F: 'total', M: 'total' }, attempts: 1 },
    { id: 'mini', name: 'Minitramp', modes: { F: 'apart', M: 'total' }, attempts: 1 },
  ] });
  assert.deepEqual(plain(E.enabledApps(c, 'F').map(a => a.id)), ['salt', 'barra', 'terra', 'mini']);
  assert.deepEqual(plain(E.totalApps(c, 'F').map(a => a.id)), ['salt', 'barra', 'terra']);
  assert.deepEqual(plain(E.totalApps(c, 'M').map(a => a.id)), ['salt', 'terra', 'mini']);
  assert.deepEqual(plain(E.enabledApps(c).map(a => a.id)), ['salt', 'barra', 'terra', 'mini']);
  const girl = entry('Anna', { salt: 8, barra: 8, terra: 8, mini: 9 }, { gender: 'F' });
  const boy = entry('Pau', { salt: 8, barra: 9, terra: 8, mini: 9 }, { gender: 'M' });
  assert.equal(E.entryTotal(c, girl), 24000);   // el minitramp va a part
  assert.equal(E.entryTotal(c, boy), 25000);    // la barra no compta per als nois
  // equips de nois: compten salt, terra i minitramp
  c.teams.push({ id: 'tm', name: 'Nois', category: 'Aleví', gender: 'M', level: 'A' }, { id: 'tf', name: 'Noies', category: 'Aleví', gender: 'F', level: 'A' });
  ['P1', 'P2', 'P3'].forEach(n => c.entries.push(entry(n, { salt: 8, terra: 8, mini: 9, barra: 10 }, { gender: 'M', teamId: 'tm' })));
  const gs = E.groupsOf(c, { categories: CATS, levels: ['A'] });
  const boys = E.teamRanking(c, gs.find(g => g.gender === 'M'));
  assert.deepEqual(plain(boys.rows.map(r => [r.name, r.total])), [['Nois', 75000]]);
  const girls = E.teamRanking(c, gs.find(g => g.gender === 'F') || { category: 'Aleví', gender: 'F', level: 'A', entries: [] });
  assert.deepEqual(plain(girls.rows.map(r => r.name)), ['Noies']);
});

test('fusió de notes entre còpies: de cada intent guanya el més recent', () => {
  const mk = () => ({ competitions: [{ id: 'k', entries: [{ id: 'e', scores: { salt: [{ v: 8, at: 100 }], barra: [{ v: 7, at: 300 }] } }] }] });
  const base = mk(), other = mk();
  other.competitions[0].entries[0].scores.salt = [{ v: 9.5, at: 200, by: 'tutor' }];   // més nova
  other.competitions[0].entries[0].scores.barra = [{ v: 6, at: 250 }];                 // més vella
  other.competitions[0].entries[0].scores.terra = [{ v: 8.8, at: 50 }];                // nova a base
  const ch = E.mergeScores(base, other);
  const sc = base.competitions[0].entries[0].scores;
  assert.equal(sc.salt[0].v, 9.5);
  assert.equal(sc.salt[0].by, 'tutor');
  assert.equal(sc.barra[0].v, 7);
  assert.equal(sc.terra[0].v, 8.8);
  assert.deepEqual(plain(ch.map(x => x.appId).sort()), ['salt', 'terra']);
  // tornar-ho a fer no canvia res
  assert.equal(E.mergeScores(base, other).length, 0);
});
