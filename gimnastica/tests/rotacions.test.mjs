// Proves del càlcul de les rotacions i l'horari (bloc ENGINE d'index.html), amb les dades reals de la
// 3a fase del 18/04/2026 (154 gimnastes). Sense dependències: node --test tests/*.test.mjs
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
const plain = x => JSON.parse(JSON.stringify(x));

const settings = { categories: ['Prebenjamí', 'Benjamí', 'Aleví', 'Infantil', 'Cadet', 'Juvenil', 'Sènior'].map(name => ({ name })), levels: ['A', 'B'] };
const CLUBS = { CGL: 'C.G. LLEIDA', LSR: 'LA SALLE REUS', INEF: 'INEF LLEIDA', BP: 'BAIX PENEDÈS', FEDAC: 'FEDAC LLEIDA', ART: 'C.G. ARTESA DE SEGRE' };
const clubName = id => CLUBS[id] || '';
const TIME = () => ({ start: '8:30', warmGen: 30, place: 'pista annexa', awards: 5, round: 5, warmF: 180, warmM: 90, gymM: 60, change: 0,
  gymF: settings.categories.map((c, i) => ({ cat: c.name, s: i >= 3 ? 108 : 88 })) });

// la competició del 18/04/2026
function fixture() {
  const c = { id: 'c418', name: '3a FASE', date: '2026-04-18', place: 'Lleida', entries: [], teams: [], apparatus: [
    { id: 'salt', name: 'Salt', icon: 'salt', modes: { F: 'total', M: 'total' } }, { id: 'barra', name: 'Barra', icon: 'barra', modes: { F: 'total', M: 'off' } },
    { id: 'terra', name: 'Terra', icon: 'terra', modes: { F: 'total', M: 'total' } }, { id: 'mini', name: 'Minitramp', icon: 'mini', modes: { F: 'off', M: 'total' } },
    { id: 'paral', name: 'Paral·leles', icon: 'paral', modes: { F: 'off', M: 'off' } }, { id: 'bfixa', name: 'Barra fixa', icon: 'altre', modes: { F: 'off', M: 'total' } }] };
  let n = 0;
  const add = (category, gender, level, club, team, count) => {
    let teamId = null;
    if (team !== null) {
      teamId = `t_${club}_${category}_${gender}${level}_${team}`.normalize('NFD').replace(/[^\w-]/g, '');
      if (!c.teams.find(t => t.id === teamId)) c.teams.push({ id: teamId, name: CLUBS[club] + (team > 1 ? ' ' + team : ''), clubId: club, gender, category, level });
    }
    for (let i = 0; i < count; i++) c.entries.push({ id: 'e' + String(++n).padStart(3, '0'), gymnastId: 'g' + n, clubId: club, gender, category, level, teamId, status: '', bib: n, scores: {} });
  };
  add('Infantil', 'F', 'A', 'FEDAC', 1, 3); add('Infantil', 'F', 'A', 'CGL', 1, 3);
  add('Infantil', 'F', 'B', 'INEF', 1, 5); add('Infantil', 'F', 'B', 'CGL', 1, 4); add('Infantil', 'F', 'B', 'LSR', 1, 3); add('Infantil', 'F', 'B', 'BP', null, 1);
  add('Cadet', 'F', 'A', 'CGL', null, 1); add('Cadet', 'F', 'B', 'LSR', null, 1); add('Cadet', 'F', 'B', 'CGL', 1, 5); add('Juvenil', 'F', 'A', 'CGL', null, 1);
  add('Benjamí', 'F', 'A', 'FEDAC', 1, 4); add('Benjamí', 'F', 'A', 'CGL', 1, 5); add('Benjamí', 'F', 'A', 'CGL', 2, 6); add('Benjamí', 'F', 'A', 'INEF', 1, 6); add('Benjamí', 'F', 'A', 'BP', 1, 5);
  add('Benjamí', 'F', 'B', 'FEDAC', 1, 6); add('Benjamí', 'F', 'B', 'INEF', 1, 4); add('Benjamí', 'F', 'B', 'CGL', 1, 5); add('Benjamí', 'F', 'B', 'CGL', 2, 4); add('Benjamí', 'F', 'B', 'BP', 1, 3); add('Benjamí', 'F', 'B', 'ART', 1, 3); add('Benjamí', 'F', 'B', 'LSR', 1, 4);
  add('Prebenjamí', 'M', 'A', 'CGL', null, 2); add('Benjamí', 'M', 'A', 'CGL', null, 1); add('Aleví', 'M', 'A', 'CGL', null, 1); add('Aleví', 'M', 'A', 'FEDAC', null, 2);
  add('Prebenjamí', 'F', 'A', 'INEF', 1, 4); add('Prebenjamí', 'F', 'A', 'INEF', 2, 4);
  add('Prebenjamí', 'F', 'B', 'ART', 1, 6); add('Prebenjamí', 'F', 'B', 'FEDAC', 1, 3); add('Prebenjamí', 'F', 'B', 'LSR', 1, 3); add('Prebenjamí', 'F', 'B', 'BP', 1, 5);
  add('Aleví', 'F', 'A', 'CGL', 1, 6); add('Aleví', 'F', 'A', 'CGL', 2, 4); add('Aleví', 'F', 'A', 'LSR', null, 1); add('Aleví', 'F', 'A', 'FEDAC', null, 1);
  add('Aleví', 'F', 'B', 'LSR', null, 2); add('Aleví', 'F', 'B', 'CGL', 1, 5); add('Aleví', 'F', 'B', 'CGL', 2, 4); add('Aleví', 'F', 'B', 'CGL', 3, 3); add('Aleví', 'F', 'B', 'ART', null, 2);
  add('Aleví', 'F', 'B', 'INEF', 1, 5); add('Aleví', 'F', 'B', 'FEDAC', 1, 6); add('Aleví', 'F', 'B', 'FEDAC', null, 1); add('Aleví', 'F', 'B', 'BP', null, 1);
  return c;
}
const ORDER = { F: ['salt', 'barra', 'terra'], M: ['salt', 'mini', 'terra'] }, FINAL = { F: [], M: ['bfixa'] };
// (el 18/04 ella va ajuntar Infantil, Cadet i Juvenil: és la regla recordada de les proves; l'app no n'ajunta cap sola)
const ICJ = { g: 'F', cats: ['Infantil', 'Cadet', 'Juvenil'] };
const RULES = (o = {}) => Object.assign({ joins: [ICJ], apart: [], allM: true, maxGroup: 15, order: ORDER, final: FINAL, subOrder: [] }, o);
const K = (cat, lv, g = 'F') => E.groupKey(cat, g, lv);
const MODEL_ORDER = [
  JSON.stringify(['F', ['Cadet', 'Infantil', 'Juvenil'], ['A', 'B']]), JSON.stringify(['F', ['Benjamí'], ['A']]), JSON.stringify(['F', ['Benjamí'], ['B']]),
  JSON.stringify(['M', ['Aleví', 'Benjamí', 'Prebenjamí'], ['A']]), JSON.stringify(['F', ['Prebenjamí'], ['A', 'B']]), JSON.stringify(['F', ['Aleví'], ['A', 'B']])];
// fa les rotacions com ho farà l'app: subdivisions + repartiment de cada una
function make(c, rules = RULES(), mode = 'cat') {
  const plan = E.rotPlan(c, settings, rules, { clubName });
  c.rot = { v: 1, made: '2026-04-01T10:00:00.000Z', mode, maxGroup: rules.maxGroup, order: ORDER, final: FINAL, time: TIME(), notes: '', coaches: {}, at: {}, printed: { sig: '', at: null },
    subs: plan.subs.map((s, i) => ({ id: 's' + (i + 1), g: s.g, keys: s.keys, k: s.k, kSet: false, name: '', dur: null, awards: null, start: null, extras: [] })) };
  for (const s of c.rot.subs) solve(c, s.id, mode);
  return plan;
}
const svOf = (c, id) => E.rotView(c, settings, { clubName }).subs.find(s => s.id === id);
function solve(c, subId, mode = c.rot.mode, extra = {}) {
  const sv = svOf(c, subId);
  const units = sv.units.filter(u => u.n > 0).map(u => ({ id: u.id, size: u.n, ko: u.ko, cat: u.cat, clubId: u.clubId, sortName: u.sortName }));
  const r = E.rotPartition(units, Object.assign({ k: sv.k, maxGroup: c.rot.maxGroup, mode, coaches: c.rot.coaches }, extra));
  for (const u of sv.units) for (const e of u.entries) c.rot.at[e.id] = { s: subId, g: u.n > 0 ? r.assign[u.id] : u.g };
  return { sv, r, units };
}
const sizes = sv => sv.groups.map(g => g.n).join('/');

test('subdivisions (com el Consell): Benjamí es parteix, Infantil, Cadet i Juvenil juntes perquè ella les ha ajuntat, els nois junts', () => {
  const c = fixture();
  assert.equal(c.entries.length, 154);
  const p = E.rotPlan(c, settings, RULES(), { clubName });
  assert.deepEqual(plain(p.subs.map(s => [s.g, s.n, s.k])), [['F', 25, 3], ['F', 26, 3], ['F', 29, 3], ['F', 41, 3], ['F', 27, 3], ['M', 6, 3]]);
  assert.deepEqual(plain(p.subs[4].keys), [K('Infantil', 'A'), K('Infantil', 'B'), K('Cadet', 'A'), K('Cadet', 'B'), K('Juvenil', 'A')]);
  assert.deepEqual(plain(p.subs[1].keys), [K('Benjamí', 'A')]);
  const t = plain(p.notes).map(x => x.t);
  assert.ok(t.includes('split') && t.includes('allM'));
  assert.deepEqual(plain(p.notes.filter(x => x.t === 'joins').map(x => x.label)), ['Infantil, Cadet i Juvenil']);
  assert.ok(!t.includes('small') && !t.includes('joined'));
  const sp = plain(p.notes.find(x => x.t === 'split'));
  assert.deepEqual([sp.label, sp.n, sp.cap, sp.parts], ['Benjamí', 55, 45, ['Benjamí A', 'Benjamí B']]);
});

test('sense cap regla, cap categoria s’ajunta sola: Cadet i Juvenil van en la seva, i només es diu que són petites', () => {
  for (const joins of [null, []]) {
    const p = E.rotPlan(fixture(), settings, RULES({ joins }), { clubName });
    assert.deepEqual(plain(p.subs.map(s => [s.g, s.n])), [['F', 25], ['F', 26], ['F', 29], ['F', 41], ['F', 19], ['F', 7], ['F', 1], ['M', 6]], JSON.stringify(joins));
    assert.deepEqual(plain(p.subs.filter(s => s.g === 'F').map(s => E.rotSubLabel(s.keys, fixture()))), ['PREBENJAMÍ A i B', 'BENJAMÍ A', 'BENJAMÍ B', 'ALEVÍ A i B', 'INFANTIL A i B', 'CADET A i B', 'JUVENIL']);
    assert.deepEqual(plain(p.notes.filter(x => x.t === 'small')), [{ t: 'small', cat: 'Cadet', n: 7 }, { t: 'small', cat: 'Juvenil', n: 1 }]);
    assert.ok(!p.notes.some(x => x.t === 'joined' || x.t === 'joins'));
  }
  // els nois sí que van junts (allM), si ella no ho treu
  assert.equal(E.rotPlan(fixture(), settings, RULES({ joins: null }), { clubName }).subs.filter(s => s.g === 'M').length, 1);
  assert.equal(E.rotPlan(fixture(), settings, RULES({ joins: null, allM: false }), { clubName }).subs.filter(s => s.g === 'M').length, 3);
});

test('categories que van juntes, ordre recordat, una categoria sense partir i nivells separats', () => {
  const c = fixture();
  const a = E.rotPlan(c, settings, RULES({ joins: [{ g: 'F', cats: ['Infantil', 'Cadet', 'Juvenil'] }] }), { clubName });
  assert.deepEqual(plain(a.subs.map(s => s.n)), [25, 26, 29, 41, 27, 6]);
  const b = E.rotPlan(c, settings, RULES({ subOrder: MODEL_ORDER }), { clubName });
  assert.deepEqual(plain(b.subs.map(s => s.n)), [27, 26, 29, 6, 25, 41]);
  const one = E.rotPlan(c, settings, RULES({ joins: [{ g: 'F', cats: ['Benjamí'] }] }), { clubName });
  const bj = one.subs.find(s => s.keys.includes(K('Benjamí', 'A')));
  assert.deepEqual([bj.n, bj.k, bj.keys.length], [55, 4, 2]);
  const ap = E.rotPlan(c, settings, RULES({ apart: [{ g: 'F', cat: 'Aleví' }] }), { clubName });
  assert.ok(ap.subs.some(s => s.keys.length === 1 && s.keys[0] === K('Aleví', 'A')) && ap.subs.some(s => s.keys.length === 1 && s.keys[0] === K('Aleví', 'B')));
  const sep = E.rotPlan(c, settings, RULES({ allM: false }), { clubName });
  assert.equal(sep.subs.filter(s => s.g === 'M').length, 3);
});

test('noms dels fulls (com el model)', () => {
  const c = fixture();
  const p = E.rotPlan(c, settings, RULES(), { clubName });
  assert.deepEqual(plain(p.subs.map(s => E.rotSubLabel(s.keys, c))), ['PREBENJAMÍ A i B', 'BENJAMÍ A', 'BENJAMÍ B', 'ALEVÍ A i B', 'INFANTIL A i B, CADET A i B i JUVENIL', 'MASCULINA']);
  make(c);
  const v = E.rotView(c, settings, { clubName });
  const s1 = v.subs.find(s => s.label.startsWith('INFANTIL')), sm = v.subs.find(s => s.g === 'M');
  assert.deepEqual(plain(s1.groups.map(g => g.label)), ['INFANTIL A', 'INFANTIL B', 'CADET A i B – JUVENIL A']);
  assert.deepEqual(plain(sm.groups.map(g => g.label)), ['PREBENJAMÍ', 'BENJAMÍ', 'ALEVÍ']);
  assert.equal(E.rotSubLabel([K('Prebenjamí', 'A', 'M')], c), 'MASCULINA – PREBENJAMÍ');
});

test('grups: equilibrats, sense separar equips ni entitats, cada categoria i nivell al seu grup (dades reals)', () => {
  const c = fixture();
  make(c);
  const v = E.rotView(c, settings, { clubName });
  const by = l => v.subs.find(s => s.label === l);
  assert.equal(sizes(by('INFANTIL A i B, CADET A i B i JUVENIL')), '6/13/8');
  assert.equal(sizes(by('BENJAMÍ A')), '9/11/6');
  assert.equal(sizes(by('BENJAMÍ B')), '10/9/10');
  assert.equal(sizes(by('MASCULINA')), '2/1/3');
  assert.equal(sizes(by('PREBENJAMÍ A i B')), '8/8/9');
  assert.equal(sizes(by('ALEVÍ A i B')), '12/15/14');
  // ningú repartit, cap equip partit, totes un sol cop
  assert.equal(v.place.size, 154);
  for (const sv of v.subs) for (const u of sv.units) assert.ok(!u.split, u.id);
  assert.ok(!v.issues.some(i => i.t === 'derived' || i.t.startsWith('orphan')));
  // el 1r grup de la 1a subdivisió és Infantil A sencer; CG Lleida i CG Lleida 2 (Benjamí A), juntes
  const bA = by('BENJAMÍ A'), g2 = bA.groups.find(g => g.units.some(u => u.team && u.team.name === 'C.G. LLEIDA 2'));
  assert.ok(g2.units.some(u => u.team && u.team.name === 'C.G. LLEIDA'));
  assert.equal(by('ALEVÍ A i B').groups[0].label, 'ALEVÍ A');
  // mode «grups igualats»
  const c2 = fixture(); make(c2, RULES(), 'bal');
  const v2 = E.rotView(c2, settings, { clubName });
  assert.deepEqual(plain(v2.subs.map(sizes)), ['8/8/9', '9/11/6', '10/9/10', '14/13/14', '10/9/8', '2/1/3']);
});

test('el repartiment és el millor possible (comparat amb provar-ho tot) i sempre el mateix', () => {
  let seed = 99; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648; const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  for (const mode of ['cat', 'bal']) {
    for (let t = 0; t < 400; t++) {
      const k = ri(1, 4), U = k >= 4 ? ri(1, 6) : ri(1, 8), nK = ri(1, 4), units = [];
      for (let i = 0; i < U; i++) { const ko = ri(0, nK - 1), club = 'c' + ri(0, 4); units.push({ id: 'u' + i, ko, cat: Math.floor(ko / 2), clubId: club, sortName: club, size: rnd() < 0.1 ? 0 : ri(1, 6) }); }
      const opts = { k, maxGroup: ri(5, 15), mode };
      if (rnd() < 0.4) { opts.pins = {}; for (const u of units) if (rnd() < 0.3) opts.pins[u.id] = ri(0, k - 1); }
      if (rnd() < 0.3) { opts.prev = {}; for (const u of units) opts.prev[u.id] = ri(0, k - 1); }
      if (rnd() < 0.5) opts.coaches = { c0: 1, c1: ri(1, 2), c2: 1 };
      const r = E.rotPartition(units, opts);
      assert.ok(r.ok && r.exact);
      const live = units.filter(u => u.size > 0), a = new Array(live.length).fill(0);
      let best = Infinity;
      const rec = i => { if (i === live.length) { const as = {}; live.forEach((u, j) => { as[u.id] = a[j]; }); best = Math.min(best, E.rotEval(units, as, opts).total); return; }
        for (let g = 0; g < k; g++) { if (opts.pins && opts.pins[live[i].id] !== undefined && g !== opts.pins[live[i].id]) continue; a[i] = g; rec(i + 1); } };
      rec(0);
      assert.equal(r.cost.total, best, JSON.stringify(opts));
      if (!opts.pins) assert.equal(r.cost.coach, 0);
      for (const v of Object.values(plain(r.cost))) if (typeof v === 'number') assert.ok(Number.isInteger(v));
      // l'ordre de les dades no canvia res
      const r2 = E.rotPartition(units.slice().reverse(), opts);
      assert.deepEqual(plain(r2.assign), plain(r.assign));
    }
  }
});

test('entrenadores: una entitat amb 1 entrenadora va en un sol grup', () => {
  const c = fixture(); make(c);
  const alevi = E.rotView(c, settings, { clubName }).subs.find(s => s.label === 'ALEVÍ A i B');
  c.rot.coaches = { LSR: 1 };
  solve(c, alevi.id);
  let sv = svOf(c, alevi.id);
  assert.equal(sizes(sv), '14/13/14');
  assert.equal(new Set(sv.units.filter(u => u.clubId === 'LSR').map(u => u.g)).size, 1);
  assert.equal(sv.clubs.find(x => x.clubId === 'LSR').groups, 1);
  c.rot.coaches = { CGL: 1 }; solve(c, alevi.id); sv = svOf(c, alevi.id);
  assert.equal(new Set(sv.units.filter(u => u.clubId === 'CGL').map(u => u.g)).size, 1);
  // fixades en dos grups: no es pot complir i es diu
  c.rot.coaches = { LSR: 1 };
  const ls = sv.units.filter(u => u.clubId === 'LSR');
  for (const e of ls[0].entries) c.rot.at[e.id] = { s: alevi.id, g: 0, m: 1 };
  for (const e of ls[1].entries) c.rot.at[e.id] = { s: alevi.id, g: 1, m: 1 };
  sv = svOf(c, alevi.id);
  assert.ok(sv.warnings.some(w => w.t === 'coach' && w.clubId === 'LSR' && w.q === 2 && w.L === 1));
});

test('Reequilibra: després de moure un equip a mà, només es mou el mínim', () => {
  const c = fixture(); make(c);
  const v = E.rotView(c, settings, { clubName }), bA = v.subs.find(s => s.label === 'BENJAMÍ A');
  const cgl2 = bA.units.find(u => u.team && u.team.name === 'C.G. LLEIDA 2'), inef = bA.units.find(u => u.clubId === 'INEF');
  for (const e of cgl2.entries) c.rot.at[e.id] = { s: bA.id, g: inef.g, m: 1 };
  let sv = svOf(c, bA.id);
  const pins = {}, prev = {};
  for (const u of sv.units) { if (u.pinned) pins[u.id] = u.g; prev[u.id] = u.g; }
  const { r } = solve(c, bA.id, 'cat', { pins, prev });
  sv = svOf(c, bA.id);
  assert.equal(r.cost.stab, 6);
  assert.deepEqual(sizes(sv).split('/').map(Number).sort((a, b) => a - b), [6, 9, 11]);
  assert.equal(sv.units.find(u => u.id === cgl2.id).g, inef.g, 'la fixada no es mou');
  // tornar a reequilibrar el que ja és el millor no mou res
  for (const s of E.rotView(c, settings, { clubName }).subs) {
    const p = {}; for (const u of s.units) if (u.n > 0) p[u.id] = u.g;
    const pn = {}; for (const u of s.units) if (u.pinned) pn[u.id] = u.g;
    const units = s.units.filter(u => u.n > 0).map(u => ({ id: u.id, size: u.n, ko: u.ko, cat: u.cat, clubId: u.clubId, sortName: u.sortName }));
    const rr = E.rotPartition(units, { k: s.k, maxGroup: 15, mode: 'cat', prev: p, pins: pn });
    assert.equal(rr.cost.stab, 0, s.label);
  }
});

test('noves inscripcions, NP, canvis d’equip i de categoria: tothom surt un sol cop i ningú es mou sol', () => {
  const c = fixture(); make(c);
  const at0 = JSON.stringify(c.rot.at);
  const where = id => { const v = E.rotView(c, settings, { clubName }); for (const [e, p] of v.place) if (e.id === id) return p; return null; };
  // (a) una gimnasta nova de «C.G. Lleida 2» (Benjamí A): amb el seu equip
  const t2 = c.teams.find(t => t.name === 'C.G. LLEIDA 2' && t.category === 'Benjamí' && t.level === 'A');
  const mate = c.entries.find(e => e.teamId === t2.id);
  c.entries.push({ id: 'n1', gymnastId: 'gn1', clubId: 'CGL', gender: 'F', category: 'Benjamí', level: 'A', teamId: t2.id, status: '', scores: {} });
  assert.deepEqual([where('n1').subId, where('n1').g, where('n1').derived], [where(mate.id).subId, where(mate.id).g, true]);
  // (b) una individual d'una entitat nova: al grup amb menys gimnastes que té la seva categoria i nivell
  c.entries.push({ id: 'n2', gymnastId: 'gn2', clubId: 'NOU', gender: 'F', category: 'Benjamí', level: 'B', teamId: null, status: '', scores: {} });
  const sB = E.rotView(c, settings, { clubName }).subs.find(s => s.label === 'BENJAMÍ B');
  assert.equal(sB.groups[where('n2').g].n, Math.min(...sB.groups.map(g => g.n)));
  // (c) NP: no es mou ningú i el grup en té una menys
  const victim = c.entries.find(e => e.category === 'Aleví' && e.level === 'B' && e.clubId === 'INEF');
  const before = svOf(c, where(victim.id).subId).groups[where(victim.id).g].n;
  victim.status = 'np';
  assert.equal(svOf(c, where(victim.id).subId).groups[where(victim.id).g].n, before - 1);
  assert.equal(JSON.stringify(c.rot.at), at0);
  // (d) canvi d'equip: es queda on era i l'equip nou surt «repartit»
  const cgl3 = c.teams.find(t => t.name === 'C.G. LLEIDA 3'), fed = c.teams.find(t => t.name === 'FEDAC LLEIDA' && t.category === 'Aleví' && t.level === 'B');
  const mover = c.entries.find(e => e.teamId === cgl3.id);
  const g0 = where(mover.id).g;
  mover.teamId = fed.id;
  assert.equal(where(mover.id).g, g0);
  const fedU = svOf(c, where(mover.id).subId).units.find(u => u.teamId === fed.id);
  assert.equal(fedU.split, svOf(c, where(mover.id).subId).units.find(u => u.teamId === fed.id).entries.some(e => where(e.id).g !== g0));
  // (f) Cadet B → Juvenil B (clau nova): va amb Juvenil A
  const cad = c.entries.find(e => e.category === 'Cadet' && e.level === 'B' && e.clubId === 'LSR');
  cad.category = 'Juvenil';
  const v = E.rotView(c, settings, { clubName });
  assert.equal(v.place.size, c.entries.length);
  assert.ok(v.issues.some(i => i.t === 'orphanJoined' && i.key === K('Juvenil', 'B')));
  assert.equal(where(cad.id).subId, where(c.entries.find(e => e.category === 'Juvenil' && e.level === 'A').id).subId);
  // (g) Sènior A (nova): subdivisió nova al final
  for (let i = 0; i < 3; i++) c.entries.push({ id: 'sn' + i, gymnastId: 'gs' + i, clubId: 'CGL', gender: 'F', category: 'Sènior', level: 'A', teamId: null, status: '', scores: {} });
  const v2 = E.rotView(c, settings, { clubName });
  assert.ok(v2.issues.some(i => i.t === 'orphanNew' && i.key === K('Sènior', 'A') && i.n === 3));
  assert.ok(v2.subs[v2.subs.length - 1].id.startsWith('auto-'));
  // (h) menys grups (3 → 2): les del grup 3 van als grups on hi ha la seva categoria i nivell
  const s1 = c.rot.subs.find(s => s.keys.includes(K('Infantil', 'A')));
  s1.k = 2;
  const v3 = E.rotView(c, settings, { clubName });
  // tothom un sol cop, sempre
  for (const vv of [v2, v3]) assert.equal(vv.place.size, c.entries.length);
  // i el mateix resultat sigui quin sigui l'ordre de les inscripcions
  const shuffled = Object.assign({}, c, { entries: c.entries.slice().reverse() });
  const v4 = E.rotView(shuffled, settings, { clubName });
  for (const [e, p] of v3.place) { const q = v4.place.get(e); assert.deepEqual([q.subId, q.g], [p.subId, p.g], e.id); }
});

test('mai es perd ningú: 40 competicions a l’atzar amb canvis', () => {
  let seed = 7; const rnd = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const cats = ['Prebenjamí', 'Benjamí', 'Aleví', 'Infantil', 'Cadet', 'Juvenil'];
  for (let trial = 0; trial < 40; trial++) {
    const c = fixture(); c.entries = []; c.teams = [];
    let n = 0; const N = 80 + rnd(260);
    while (n < N) {
      const cat = cats[rnd(6)], g = rnd(10) < 9 ? 'F' : 'M', lvl = rnd(2) ? 'A' : 'B', club = 'K' + rnd(12), size = 1 + rnd(7);
      const teamId = size >= 3 ? 'T' + trial + '_' + n : null;
      if (teamId) c.teams.push({ id: teamId, name: 'Team ' + n, clubId: club, gender: g, category: cat, level: g === 'M' ? 'A' : lvl });
      for (let i = 0; i < size; i++) c.entries.push({ id: 'e' + (++n), clubId: club, gender: g, category: cat, level: g === 'M' ? 'A' : lvl, teamId, status: rnd(20) ? '' : 'np', scores: {} });
    }
    make(c);
    for (let k = 0; k < 30; k++) {
      const op = rnd(8), e = c.entries[rnd(c.entries.length)];
      if (op === 0) c.entries.splice(c.entries.indexOf(e), 1);
      if (op === 1) c.entries.push({ id: 'n' + k, clubId: 'K' + rnd(14), gender: 'F', category: 'Aleví', level: 'B', teamId: null, status: '', scores: {} });
      if (op === 2 && c.teams.length) e.teamId = c.teams[rnd(c.teams.length)].id;
      if (op === 3) e.category = cats[rnd(6)];
      if (op === 4) e.status = e.status ? '' : 'np';
      if (op === 5 && c.rot.subs.length) { const s = c.rot.subs[rnd(c.rot.subs.length)]; c.rot.at[e.id] = { s: s.id, g: rnd(4), m: 1 }; }
      if (op === 6 && c.rot.subs.length) c.rot.subs[rnd(c.rot.subs.length)].k = 1 + rnd(5);
      // (a una altra subdivisió, a mà: del seu gènere o no, amb un grup que potser no hi és, o a una que no hi és)
      if (op === 7 && c.rot.subs.length) { const s = c.rot.subs[rnd(c.rot.subs.length)]; c.rot.at[e.id] = { s: rnd(5) ? s.id : 'cap', g: rnd(4), m: 1, x: 1, k: E.groupKey(e.category, e.gender, e.level) }; }
      const v = E.rotView(c, settings, { clubName });
      assert.equal(v.place.size, c.entries.length, 'tothom un sol cop');
      const seen = new Set(); for (const sv of v.subs) for (const g of sv.groups) for (const x of g.entries) { assert.ok(!seen.has(x)); seen.add(x); }
      assert.equal(seen.size, c.entries.length);
      // mai en una subdivisió de l'altre gènere; els premis de cada categoria i nivell, en una sola subdivisió
      for (const [x, p] of v.place) assert.equal(v.subs.find(sv => sv.id === p.subId).g, x.gender === 'M' ? 'M' : 'F');
      const ak = v.subs.flatMap(sv => sv.awardKeys), act = new Set(c.entries.filter(x => x.status !== 'np').map(x => E.groupKey(x.category, x.gender, x.level)));
      assert.equal(ak.length, new Set(ak).size); assert.deepEqual(plain([...ak].sort()), plain([...act].sort()));
    }
  }
});

test('temps calculat: igual que l’horari del model (80, 55, 55, 20, 50 i 75 minuts)', () => {
  const c = fixture(); make(c, RULES({ subOrder: MODEL_ORDER }));
  const v = E.rotView(c, settings, { clubName });
  assert.deepEqual(plain(v.subs.map(s => [s.est.secs, s.est.min])), [[4752, 80], [3444, 55], [3180, 55], [1260, 20], [2916, 50], [4500, 75]]);
  assert.deepEqual(plain(v.subs.map(s => s.awards)), [10, 5, 5, 5, 5, 5]);
  // arrodoniment: a mitges, cap amunt
  const sv = { g: 'F', P: 1, final: [], groups: [{ g: 0, entries: [] }] };
  const one = secs => E.rotEstimate(Object.assign({}, sv, { groups: [{ g: 0, entries: [{ category: 'X', gender: 'F', status: '' }] }] }), { warmF: secs - 88, gymF: [], round: 5 }).min;
  assert.equal(one(3150), 55); assert.equal(one(3149), 50);
  assert.equal(E.rotEstimate(sv, {}).min, 0);
  const t = TIME(); t.round = 10; assert.equal(E.rotEstimate(v.subs[0], t).min, 80);
  t.round = 1; assert.equal(E.rotEstimate(v.subs[0], t).min, 79);
});

test('horari: les 19 files del model, amb una exhibició i els premis de la 5a a 10 minuts', () => {
  const c = fixture(); make(c, RULES({ subOrder: MODEL_ORDER }));
  c.rot.subs[4].awards = 10;
  c.rot.subs[3].extras = [{ id: 'x1', text: 'EXHIBICIÓ I3 / I4 / I5', min: 15, when: 'abans' }];
  const v = E.rotView(c, settings, { clubName });
  const sch = E.rotSchedule(v, c.rot);
  const rows = sch.blocks.flatMap(b => b.rows).map(r => `${E.rotHM(r.from)} – ${E.rotHM(r.to)} ${r.text}`);
  assert.deepEqual(plain(rows), [
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
  assert.equal(sch.warnings.length, 0);
  assert.deepEqual([E.rotHM(sch.start), E.rotHM(sch.end)], ['8:00', '15:00']);
  // sense l'exhibició, l'escalfament de la 5a comença abans que acabi el de la 4a
  c.rot.subs[3].extras = [];
  assert.ok(E.rotSchedule(E.rotView(c, settings, { clubName }), c.rot).warnings.some(w => w.t === 'warm' && w.i === 5));
  c.rot.subs[2].start = '9:00';
  assert.ok(E.rotSchedule(E.rotView(c, settings, { clubName }), c.rot).warnings.some(w => w.t === 'start' && w.i === 3));
  c.rot.subs[2].start = null; c.rot.subs[0].dur = 50;
  assert.ok(E.rotSchedule(E.rotView(c, settings, { clubName }), c.rot).warnings.some(w => w.t === 'short' && w.i === 1));
});

test('hores, temps i dates', () => {
  assert.equal(E.rotHM(510), '8:30'); assert.equal(E.rotParseHM('08:30'), 510);
  for (const x of ['24:00', '9:60', 'x', '', null]) assert.equal(E.rotParseHM(x), null);
  assert.equal(E.rotFmtMS(180), '3’'); assert.equal(E.rotFmtMS(90), '1’30’’'); assert.equal(E.rotFmtMS(4752), '79’12’’');
  assert.equal(E.rotFmtIn(88), '1:28');
  assert.equal(E.rotParseMS('1:28'), 88); assert.equal(E.rotParseMS('1,5'), 90); assert.equal(E.rotParseMS('1′30″'), 90);
  assert.equal(E.rotParseMS("1'30''"), 90); assert.equal(E.rotParseMS(''), null); assert.ok(Number.isNaN(E.rotParseMS('abc')));
  assert.equal(E.rotDateLong('2026-04-18'), '18 d’abril de 2026'); assert.equal(E.rotDateLong('2026-05-03'), '3 de maig de 2026');
  assert.equal(E.rotDateLong('2026-08-01'), '1 d’agost de 2026'); assert.equal(E.rotDateLong('2026-10-12'), '12 d’octubre de 2026');
  assert.equal(E.rotDateDash('2026-04-18'), '18-04-2026');
});

test('empremta: una NP no la canvia; moure, inscriure o reordenar, sí', () => {
  const c = fixture(); make(c);
  const sig = () => E.rotView(c, settings, { clubName }).sig;
  const s0 = sig();
  c.entries[5].status = 'np'; assert.equal(sig(), s0);
  c.entries[5].status = '';
  const e = c.entries[0], a = c.rot.at[e.id]; c.rot.at[e.id] = { s: a.s, g: (a.g + 1) % 3 }; assert.notEqual(sig(), s0);
  c.rot.at[e.id] = a; assert.equal(sig(), s0);
  c.rot.subs.reverse(); assert.notEqual(sig(), s0);
});

test('claus estranyes: una categoria amb «||» no peta i va a una subdivisió', () => {
  assert.equal(E.rotKeyParts('A||B||F||A'), null);
  assert.deepEqual(plain(E.rotKeyParts('Aleví||F||A')), { category: 'Aleví', gender: 'F', level: 'A' });
  const c = fixture(); make(c);
  c.entries.push({ id: 'z1', clubId: 'CGL', gender: 'F', category: 'X||Y', level: 'A', teamId: null, status: '', scores: {} });
  const v = E.rotView(c, settings, { clubName });
  assert.equal(v.place.size, c.entries.length);
  const cmp = E.rotKeyCmp(settings);
  assert.ok(cmp(K('Benjamí', 'A'), K('Aleví', 'A')) < 0 && cmp(K('Aleví', 'A'), K('Aleví', 'B')) < 0 && cmp(K('Aleví', 'B'), K('Aleví', 'A', 'M')) < 0);
});

// ── correccions de la revisió
const APPS3 = [{ id: 'salt', name: 'Salt', modes: { F: 'total', M: 'total' } }, { id: 'barra', name: 'Barra', modes: { F: 'total', M: 'off' } }, { id: 'terra', name: 'Terra', modes: { F: 'total', M: 'total' } }];
// competició feta a mà: [categoria, gènere, nivell, quantes, quantes NP]
const mkc = (spec, apparatus = APPS3) => { const c = { id: 'c', teams: [], apparatus, entries: [] }; let n = 0;
  for (const [cat, g, lv, count, np = 0] of spec) for (let i = 0; i < count; i++) c.entries.push({ id: 'e' + (++n), gender: g, category: cat, level: lv, clubId: 'C' + (n % 7), teamId: null, status: i < np ? 'np' : '', scores: {} });
  return c; };
const R2 = o => Object.assign({ joins: [], apart: [], allM: true, maxGroup: 15, order: { F: ['salt', 'barra', 'terra'], M: [] }, final: { F: [], M: [] }, subOrder: [] }, o);
const planOf = (c, rules) => plain(E.rotPlan(c, settings, rules, {}).subs.map(s => [s.keys, s.n]));
const rotOf = (c, rules, o = {}) => { const p = E.rotPlan(c, settings, rules, {}); c.rot = Object.assign({ v: 1, made: 'x', mode: 'cat', maxGroup: 15, order: rules.order, final: rules.final, coaches: {}, at: {}, printed: { sig: '', at: null }, time: TIME(),
  subs: p.subs.map((s, i) => ({ id: 's' + i, g: s.g, keys: s.keys, k: s.k, extras: [] })) }, o); return p; };

test('si s’acaba el pressupost de passos, el repartiment encara és el millor movent o intercanviant equips', () => {
  // Benjamí A i B junts (una sola subdivisió de 94 gimnastes, 27 equips o grups d'individuals, 7 grups)
  let s = 33; const R = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }, ri = (a, b) => a + Math.floor(R() * (b - a + 1));
  const c = { id: 'c', entries: [], teams: [], apparatus: APPS3 }; let n = 0;
  for (let cl = 1, nc = ri(12, 25); cl <= nc; cl++) {
    const LV = ['A', 'B'][ri(0, 1)];
    for (let t = 1, nt = ri(1, 2); t <= nt; t++) { const tid = 'T' + cl + '_' + t; c.teams.push({ id: tid, name: 'Club ' + cl + (t > 1 ? ' ' + t : ''), clubId: 'C' + cl, gender: 'F', category: 'Benjamí', level: LV });
      for (let i = 0, m = ri(3, 6); i < m; i++) c.entries.push({ id: 'e' + String(++n).padStart(4, '0'), clubId: 'C' + cl, gender: 'F', category: 'Benjamí', level: LV, teamId: tid, status: '' }); }
    for (let i = 0, m = ri(0, 2); i < m; i++) c.entries.push({ id: 'e' + String(++n).padStart(4, '0'), clubId: 'C' + cl, gender: 'F', category: 'Benjamí', level: LV, teamId: null, status: '' });
  }
  rotOf(c, R2({ joins: [{ g: 'F', cats: ['Benjamí'] }], order: { F: ['salt', 'barra', 'terra'], M: [] } }));
  const sv = E.rotView(c, { categories: [{ name: 'Benjamí' }], levels: ['A', 'B'] }, {}).subs[0];
  const units = sv.units.filter(u => u.n > 0).map(u => ({ id: u.id, size: u.n, ko: u.ko, cat: u.cat, clubId: u.clubId, sortName: u.sortName }));
  const opts = { k: sv.k, maxGroup: 15, mode: 'cat', coaches: {} };
  assert.deepEqual([sv.N, units.length, sv.k], [94, 27, 7]);
  const r = E.rotPartition(units, opts);
  assert.ok(r.ok && !r.exact, 'aquest cas esgota el pressupost');
  const a = plain(r.assign), cost = x => E.rotEval(units, x, opts).total;
  assert.equal(cost(a), r.cost.total);
  for (const u of units) for (let g = 0; g < sv.k; g++) if (g !== a[u.id]) assert.ok(cost(Object.assign({}, a, { [u.id]: g })) >= r.cost.total, `moure ${u.id}`);
  for (const u of units) for (const w of units) if (u.id < w.id && a[u.id] !== a[w.id]) assert.ok(cost(Object.assign({}, a, { [u.id]: a[w.id], [w.id]: a[u.id] })) >= r.cost.total, `canviar ${u.id} i ${w.id}`);
});

test('tots els aparells «tots junts al final»: sense rotacions (ni «Descans»), el temps bo i sense l’error «no tenen cap aparell»', () => {
  const c = mkc([['Aleví', 'M', 'A', 6]], APPS3.map(a => Object.assign({}, a, { modes: { F: 'off', M: 'total' } })));
  const rules = R2({ order: { F: [], M: [] }, final: { F: [], M: ['salt', 'barra', 'terra'] } });
  rotOf(c, rules);
  const v = E.rotView(c, settings, {}), sv = v.subs[0];
  assert.deepEqual([sv.A, sv.final.length, sv.P, sv.stations.length], [0, 3, 0, 0]);
  assert.deepEqual([sv.est.secs, sv.est.min], [3 * (90 + 360), 25]);
  assert.ok(!v.issues.some(i => i.t === 'noApps'));
  const row = E.rotSchedule(v, c.rot).blocks[0].rows.find(r => r.kind === 'comp').text;
  assert.equal(row, 'Competició 1a subdivisió MASCULINA - 1’30’’ escalfament per aparell');
  // sense cap aparell de debò, sí que avisa
  c.apparatus = []; assert.ok(E.rotView(c, settings, {}).issues.some(i => i.t === 'noApps' && i.g === 'M'));
  // una sola rotació: «1 rotació»
  const c1 = mkc([['Aleví', 'M', 'A', 4]], [{ id: 'terra', name: 'Terra', modes: { F: 'off', M: 'total' } }]);
  rotOf(c1, R2({ order: { F: [], M: [] } }));
  c1.rot.subs[0].k = 1;
  const v1 = E.rotView(c1, settings, {});
  assert.equal(E.rotSchedule(v1, c1.rot).blocks[0].rows.find(r => r.kind === 'comp').text, 'Competició 1a subdivisió MASCULINA - 1 rotació - 1’30’’ escalfament per aparell');
});

test('mai una subdivisió on totes són NP ni una de 2 gimnastes per partir un bloc d’ajuntades', () => {
  const J = R2({ joins: [{ g: 'F', cats: ['Infantil', 'Cadet', 'Juvenil'] }] });
  // Infantil A: 2, totes NP; Cadet A 50; Juvenil A 50 (més de 45 cadascuna): Infantil va amb la del costat
  assert.deepEqual(planOf(mkc([['Infantil', 'F', 'A', 2, 2], ['Cadet', 'F', 'A', 50], ['Juvenil', 'F', 'A', 50]]), J),
    [[[K('Infantil', 'A'), K('Cadet', 'A')], 50], [[K('Juvenil', 'A')], 50]]);
  // Infantil A amb 2 que competeixen, 46 i 46: no fa una subdivisió de 2
  assert.deepEqual(planOf(mkc([['Infantil', 'F', 'A', 2], ['Cadet', 'F', 'A', 46], ['Juvenil', 'F', 'A', 46]]), J),
    [[[K('Infantil', 'A'), K('Cadet', 'A')], 48], [[K('Juvenil', 'A')], 46]]);
  // regles desades, Juvenil només amb NP: va amb Infantil
  assert.deepEqual(planOf(mkc([['Infantil', 'F', 'A', 20], ['Juvenil', 'F', 'A', 1, 1]]), R2()), [[[K('Infantil', 'A'), K('Juvenil', 'A')], 20]]);
  // si és l'única, es queda (i no se n'explica res)
  const p = E.rotPlan(mkc([['Aleví', 'F', 'A', 2, 2]]), settings, R2({ joins: null }), {});
  assert.deepEqual([p.subs.length, p.notes.length], [1, 0]);
});

test('notes de «Fes les rotacions»: certes i una sola vegada per categoria', () => {
  const notes = (spec, apps = APPS3, o = {}) => plain(E.rotPlan(mkc(spec, apps), settings, R2(Object.assign({ joins: null }, o)), {}).notes);
  // una sola categoria petita: no hi ha res a dir
  assert.deepEqual(notes([['Aleví', 'F', 'A', 2]]), []);
  // dues petites: cadascuna en la seva subdivisió, i es diu de totes dues (cap no s'ajunta sola)
  assert.deepEqual(notes([['Prebenjamí', 'F', 'A', 5], ['Benjamí', 'F', 'A', 6], ['Aleví', 'F', 'A', 18]]),
    [{ t: 'small', cat: 'Prebenjamí', n: 5 }, { t: 'small', cat: 'Benjamí', n: 6 }]);
  assert.equal(E.rotPlan(mkc([['Prebenjamí', 'F', 'A', 5], ['Benjamí', 'F', 'A', 6], ['Aleví', 'F', 'A', 18]]), settings, R2({ joins: null }), {}).subs.length, 3);
  // petita al costat d'una de massa gran o d'una partida per nivells: el mateix
  assert.deepEqual(notes([['Prebenjamí', 'F', 'A', 5], ['Benjamí', 'F', 'A', 44]]), [{ t: 'small', cat: 'Prebenjamí', n: 5 }]);
  assert.deepEqual(notes([['Prebenjamí', 'F', 'A', 5], ['Benjamí', 'F', 'A', 26], ['Benjamí', 'F', 'B', 29]]).filter(x => x.t === 'small'), [{ t: 'small', cat: 'Prebenjamí', n: 5 }]);
  // totes NP: cap nota
  assert.deepEqual(notes([['Aleví', 'F', 'A', 2, 2], ['Infantil', 'F', 'A', 20]]), []);
  // les que ella ha ajuntat: es diu que van juntes; si són poques, no se'n diu res més
  assert.deepEqual(notes([['Aleví', 'F', 'A', 2], ['Infantil', 'F', 'A', 4], ['Cadet', 'F', 'A', 20]], APPS3, { joins: [{ g: 'F', cats: ['Aleví', 'Infantil'] }] }),
    [{ t: 'joins', g: 'F', label: 'Aleví i Infantil', nc: 2 }]);
});

test('regles recordades: ella decideix quines van juntes; de les petites que no ha vist mai, només es diu que són petites', () => {
  const c = fixture();
  const sub = (p, cat) => p.subs.find(s => s.keys.includes(K(cat, 'A'))).keys;
  // desat en una jornada sense Cadet ni Juvenil (no les ha vistes): es queden soles, i es diu que són petites
  const seenB = ['Prebenjamí', 'Benjamí', 'Aleví', 'Infantil'].map(cat => ({ g: 'F', cat }));
  const a = E.rotPlan(c, settings, RULES({ joins: [], seen: seenB }), { clubName });
  assert.deepEqual(plain(sub(a, 'Infantil')), [K('Infantil', 'A'), K('Infantil', 'B')]);
  assert.deepEqual(plain(a.notes.filter(x => x.t === 'small').map(x => x.cat)), ['Cadet', 'Juvenil']);
  // les ha vistes i les va deixar soles: es queden soles, sense dir-ne res
  const b = E.rotPlan(c, settings, RULES({ joins: [], seen: seenB.concat({ g: 'F', cat: 'Cadet' }, { g: 'F', cat: 'Juvenil' }) }), { clubName });
  assert.deepEqual(plain(sub(b, 'Juvenil')), [K('Juvenil', 'A')]);
  assert.ok(!b.notes.some(x => x.t === 'small'));
  // les va ajuntar en una jornada d'abans: encara van juntes
  assert.ok(sub(E.rotPlan(c, settings, RULES({ seen: seenB }), { clubName }), 'Juvenil').includes(K('Infantil', 'B')));
});

test('«només té N gimnastes» no surt a l’única subdivisió dels nois; «no era a cap subdivisió» diu per què', () => {
  const c = fixture(); make(c, RULES({ joins: [] }));
  const v = E.rotView(c, settings, { clubName, small: true });
  assert.ok(!v.subs.find(s => s.g === 'M').warnings.some(w => w.t === 'small'));
  // una noia sola en una subdivisió seva sí que ho diu (hi ha altres subdivisions de noies)
  c.rot.subs.push({ id: 'sx', g: 'F', keys: [K('Sènior', 'A')], k: 1, extras: [] });
  c.entries.push({ id: 'x1', clubId: 'CGL', gender: 'F', category: 'Sènior', level: 'A', teamId: null, status: '', scores: {} });
  assert.ok(E.rotView(c, settings, { clubName, small: true }).subs.find(s => s.id === 'sx').warnings.some(w => w.t === 'small'));
  // un noi d'Infantil va a l'única subdivisió dels nois: «amb els altres nois»
  c.entries.push({ id: 'x2', clubId: 'CGL', gender: 'M', category: 'Infantil', level: 'A', teamId: null, status: '', scores: {} });
  c.entries.push({ id: 'x3', clubId: 'CGL', gender: 'F', category: 'Juvenil', level: 'B', teamId: null, status: '', scores: {} });
  const iss = plain(E.rotView(c, settings, { clubName }).issues.filter(i => i.t === 'orphanJoined').map(i => [i.key, i.via]));
  assert.deepEqual(iss, [[K('Infantil', 'A', 'M'), 'boys'], [K('Juvenil', 'B'), 'cat']]);
});

test('temps m:ss: el que passa de 30:00 no es retalla sense dir res', () => {
  assert.equal(E.rotParseMS('30:00'), 1800); assert.equal(E.rotParseMS('30'), 1800);
  for (const x of ['99:00', '31', '30:01', 'abc']) assert.ok(Number.isNaN(E.rotParseMS(x)), x);
});

test('inscripcions sense categoria o sense nivell: subdivisió pròpia i noms sencers', () => {
  const c = fixture();
  for (let i = 0; i < 2; i++) c.entries.push({ id: 'q' + i, clubId: 'CGL', gender: 'F', category: '', level: 'A', teamId: null, status: '', scores: {} });
  c.entries.push({ id: 'ql', clubId: 'CGL', gender: 'F', category: 'Aleví', level: '', teamId: null, status: '', scores: {} });
  const p = E.rotPlan(c, settings, RULES(), { clubName });
  assert.deepEqual(plain(p.subs.find(s => s.keys.includes(K('', 'A'))).keys), [K('', 'A')], 'no s’ajunta amb cap altra');
  assert.ok(!p.notes.some(n => n.t === 'joined' && n.cat === ''));
  make(c);
  const v = E.rotView(c, settings, { clubName });
  const labels = plain(v.subs.map(s => [s.label, s.groups.map(g => g.label)]));
  assert.ok(labels.some(([l, g]) => l === 'SENSE CATEGORIA' && g.every(x => x === 'SENSE CATEGORIA A')), JSON.stringify(labels));
  assert.ok(labels.some(([l]) => l === 'ALEVÍ A, B i SENSE NIVELL'), JSON.stringify(labels));
  for (const [l, g] of labels) for (const x of [l, ...g]) assert.ok(!/ i $| – $|–  /.test(x), x);
});

// ── segona revisió
test('una categoria petita: es diu (primer el que s’ha partit), però no s’ajunta amb cap altra', () => {
  // les dades reals amb només 5 Prebenjamí (noies): la nota hi és, després de la de Benjamí partit, i fa la seva subdivisió
  const c = fixture(); let keep = 5; c.entries = c.entries.filter(e => !(e.gender === 'F' && e.category === 'Prebenjamí') || keep-- > 0);
  const p = E.rotPlan(c, settings, RULES(), { clubName }), ts = plain(p.notes.map(x => x.t + (x.cat ? ':' + x.cat : '')));
  assert.ok(ts.includes('small:Prebenjamí') && ts.indexOf('split') < ts.indexOf('small:Prebenjamí'), ts.join());
  assert.ok(p.subs.some(s => s.g === 'F' && s.n === 5 && s.keys.every(k => k.startsWith('Prebenjamí'))));
});

test('un bloc de categories que van juntes partit per nivells: cada part amb els seus nivells i primer el «l’he partit»', () => {
  const J = R2({ joins: [{ g: 'F', cats: ['Infantil', 'Cadet', 'Juvenil'] }] });
  const p = plain(E.rotPlan(mkc([['Infantil', 'F', 'A', 2], ['Cadet', 'F', 'A', 46], ['Juvenil', 'F', 'A', 46]]), settings, J, {}).notes);
  assert.deepEqual(p.map(x => x.t), ['split', 'big', 'big']);
  assert.deepEqual(p[0].parts, ['Infantil A i Cadet A', 'Juvenil A']);
  assert.deepEqual(p.slice(1).map(x => x.label), ['Infantil A i Cadet A', 'Juvenil A']);
  // dos nivells: «Infantil A, Cadet A i Juvenil A» i «Infantil B i Cadet B»
  const q = plain(E.rotPlan(mkc([['Infantil', 'F', 'A', 12], ['Infantil', 'F', 'B', 14], ['Cadet', 'F', 'A', 10], ['Cadet', 'F', 'B', 6], ['Juvenil', 'F', 'A', 5]]), settings, J, {}).notes);
  assert.deepEqual(q.find(x => x.t === 'split').parts, ['Infantil A, Cadet A i Juvenil A', 'Infantil B i Cadet B']);
  // una sola categoria, com sempre: «Benjamí A» i «Benjamí B»
  assert.deepEqual(plain(E.rotPlan(fixture(), settings, RULES(), { clubName }).notes.find(x => x.t === 'split').parts), ['Benjamí A', 'Benjamí B']);
});

// ─── setena revisió: l'ordre en què passen per cada aparell (el del full de rotacions), el que s'ha imprès i les que canvien de subdivisió
const CTX = { clubName, name: e => e.id };
test('ordre de pas a cada aparell: rotació 1 el grup que hi comença, després els altres; cada gimnasta un sol cop i cada grup com al full', () => {
  const c = fixture(); make(c);
  const v = E.rotView(c, settings, CTX);
  for (const sv of v.subs) for (const a of sv.apps.concat(sv.final)) {
    const seq = E.rotAppSeq(sv, a.id, settings, CTX), all = seq.flatMap(b => b.entries.map(e => e.id));
    // tothom de la subdivisió, un sol cop
    assert.deepEqual(plain([...all].sort()), plain(sv.groups.flatMap(G => G.entries.map(e => e.id)).sort()), `${sv.idx}a · ${a.id}`);
    if (sv.final.includes(a)) { assert.deepEqual(plain(seq.map(b => [b.r, b.G.g])), plain(sv.groups.map(G => [null, G.g]))); continue; }
    const s = sv.stations.indexOf(a);
    // el Grup g comença a l'aparell g i a cada rotació passa al següent
    assert.deepEqual(plain(seq.map(b => b.G.g)), [...Array(sv.P).keys()].map(r => (s - r + sv.P) % sv.P).filter(g => g < sv.k), `${sv.idx}a · ${a.id}`);
    for (const b of seq) {
      // cada grup: per categoria i nivell, entitat, primer els equips (per nom) i després les individuals; i per dorsal
      const us = E.rotGroupOrder(b.G, settings, CTX);
      assert.deepEqual(plain(b.entries.map(e => e.id)), plain(us.flatMap(x => x.entries.map(e => e.id))));
      for (let i = 1; i < us.length; i++) {
        const x = us[i - 1].u, y = us[i].u, k = E.rotKeyCmp(settings)(x.key, y.key);
        assert.ok(k < 0 || (k === 0 && (clubName(x.clubId) < clubName(y.clubId) || (x.clubId === y.clubId && (!!x.team >= !!y.team)))), `${x.id} abans de ${y.id}`);
      }
      for (const x of us) assert.deepEqual(plain(x.entries.map(e => e.bib)), plain([...x.entries.map(e => e.bib)].sort((p, q) => p - q)));
    }
  }
  // Benjamí A (2a), barra: rotació 1 = Grup 2, i dins del grup, el primer equip de C.G. Lleida sencer abans del segon
  const sv = v.subs.find(x => x.keys.length === 1 && x.keys[0] === K('Benjamí', 'A')), seq = E.rotAppSeq(sv, 'barra', settings, CTX);
  assert.equal(seq[0].G.g, 1);
  const runs = seq.flatMap(b => b.entries).map(e => e.teamId).filter((t, i, l) => i === 0 || l[i - 1] !== t);
  assert.equal(runs.length, new Set(runs).size, 'cada equip passa sencer, sense barrejar-se amb un altre');
  assert.ok(runs.length >= 4);
  // un dorsal canviat dins d'un equip canvia l'ordre del full i del mòbil
  const u = E.rotGroupOrder(seq[0].G, settings, CTX).find(x => x.entries.length > 1), [e1, e2] = u.entries;
  [e1.bib, e2.bib] = [e2.bib, e1.bib];
  assert.deepEqual(plain(E.rotGroupOrder(seq[0].G, settings, CTX).find(x => x.u === u.u).entries.slice(0, 2).map(e => e.id)), [e2.id, e1.id]);
});

test('el que s’ha imprès: els grups, l’ordre dels fulls i les hores de l’horari (una NP no fa tornar a imprimir les rotacions, però sí l’horari si en canvia les hores)', () => {
  const c = fixture(); make(c);
  let v = E.rotView(c, settings, CTX);
  const pr = () => E.rotView(c, settings, CTX).issues.find(i => i.t === 'printed');
  c.rot.printed = { sig: v.sig, ord: v.ord, at: '2026-04-18T06:00:00.000Z', hor: { at: '2026-04-18T06:05:00.000Z', rows: E.rotHorRows(E.rotSchedule(v, c.rot)) } };
  assert.equal(pr(), undefined);
  // dues NP al grup més llarg de l'Aleví: les rotacions no han canviat, però l'horari sí (de la subdivisió de l'Aleví endavant)
  const sv = v.subs.find(x => x.keys.includes(K('Aleví', 'B'))), G = sv.groups.reduce((a, x) => (x.n > a.n ? x : a));
  G.entries.slice(0, 2).forEach(e => { e.status = 'np'; });
  let p = pr();
  assert.ok(p && !p.rot && !p.ord && p.hor.length, JSON.stringify(p && p.hor));
  const comp = p.hor.find(d => d.k === 'comp');
  assert.equal(comp.i, sv.idx);
  assert.ok(comp.now.t < comp.was.t, 'la subdivisió s’acaba abans');
  assert.ok(p.hor.every(d => d.i >= sv.idx), 'les d’abans no canvien');
  G.entries.slice(0, 2).forEach(e => { e.status = ''; });
  assert.equal(pr(), undefined);
  // un dorsal canviat dins d'un equip (p. ex. després de renumerar): ha canviat l'ordre dels fulls, no els grups
  const u = E.rotGroupOrder(v.subs[0].groups[0], settings, CTX).find(x => x.entries.length > 1), [e1, e2] = u.entries;
  [e1.bib, e2.bib] = [e2.bib, e1.bib];
  p = pr();
  assert.ok(p && !p.rot && p.ord && !p.hor.length);
  [e1.bib, e2.bib] = [e2.bib, e1.bib];
  // imprès amb una versió d'abans (sense ord ni hor): només els grups
  c.rot.printed = { sig: v.sig, at: '2026-04-18T06:00:00.000Z' };
  [e1.bib, e2.bib] = [e2.bib, e1.bib]; G.entries[0].status = 'np';
  assert.equal(pr(), undefined);
  // una exhibició nova, després d'imprimir l'horari: surt com a fila nova
  v = E.rotView(c, settings, CTX);
  c.rot.printed = { sig: v.sig, ord: v.ord, at: null, hor: { at: null, rows: E.rotHorRows(E.rotSchedule(v, c.rot)) } };
  c.rot.subs[0].extras = [{ id: 'x1', text: 'Exhibició', min: 10, when: 'abans' }];
  p = pr();
  assert.ok(p.hor.some(d => d.k === 'extra' && d.x === 'Exhibició' && !d.was && d.now), JSON.stringify(p.hor.slice(0, 3)));
  // un altre lloc per a l'escalfament general: les mateixes hores, però el full diu una altra cosa
  c.rot.subs[0].extras = [];
  c.rot.time.place = 'pavelló 2';
  p = pr();
  assert.ok(p.hor.length && p.hor.every(d => d.k === 'warm' && d.was && d.now && d.was.f === d.now.f && d.was.x !== d.now.x), JSON.stringify(p.hor[0]));
});

test('dues exhibicions amb el mateix text a la mateixa subdivisió: just després d’imprimir l’horari no ha canviat res, i si se’n treu una es diu quina', () => {
  const c = fixture(); make(c);
  c.rot.subs[1].extras = [{ id: 'x1', text: 'EXHIBICIÓ', min: 15, when: 'abans' }, { id: 'x2', text: 'EXHIBICIÓ', min: 15, when: 'abans' }];
  const v = E.rotView(c, settings, CTX), rows = E.rotHorRows(E.rotSchedule(v, c.rot));
  assert.deepEqual(plain(rows.filter(r => r.k === 'extra').map(r => r.id)), ['x1', 'x2']);
  assert.ok(rows.filter(r => r.k !== 'extra').every(r => !('id' in r)));
  const pr = () => E.rotView(c, settings, CTX).issues.find(i => i.t === 'printed');
  c.rot.printed = { sig: v.sig, ord: v.ord, at: null, hor: { at: null, rows } };
  assert.equal(pr(), undefined);
  assert.deepEqual(plain(E.rotHorDiff(rows, rows)), []);
  // sense id (fet amb una altra versió): pel text i per quina és de les que el tenen
  const noId = rows.map(({ id, ...r }) => r);
  assert.deepEqual(plain(E.rotHorDiff(noId, noId)), []);
  // se'n treu la primera: la segona passa a l'hora de la primera, i la primera ja no hi és
  c.rot.subs[1].extras = c.rot.subs[1].extras.slice(1);
  const p = pr(), ex = p.hor.filter(d => d.k === 'extra');
  assert.equal(ex.length, 2, JSON.stringify(ex));
  const x1 = rows.find(r => r.id === 'x1'), x2 = rows.find(r => r.id === 'x2');
  assert.ok(ex.some(d => d.was && d.was.id === 'x2' && d.now && d.now.f === x1.f && d.now.t === x1.t));
  assert.ok(ex.some(d => d.was && d.was.id === 'x1' && !d.now));
  assert.ok(x2.f === x1.t);
});

test('una gimnasta que canvia de subdivisió (se li corregeix el nivell) no és «nova»: es diu d’on a on ha passat', () => {
  const c = fixture(); make(c);
  const v0 = E.rotView(c, settings, CTX), e = c.entries.find(x => x.category === 'Benjamí' && x.level === 'A' && x.teamId);
  const from = v0.place.get(e).subId;
  e.level = 'B'; e.teamId = null;
  const v = E.rotView(c, settings, CTX), d = v.issues.find(i => i.t === 'derived');
  assert.equal(d.n, 1);
  assert.deepEqual(plain(d.moved.map(m => [m.e.id, m.from, m.to])), [[e.id, from, v.place.get(e).subId]]);
  assert.notEqual(from, v.place.get(e).subId);
  // una inscripció nova de debò no hi surt
  c.entries.push({ ...e, id: 'enova', gymnastId: 'gnova', level: 'A', bib: 999 });
  const d2 = E.rotView(c, settings, CTX).issues.find(i => i.t === 'derived');
  assert.equal(d2.n, 2);
  assert.deepEqual(plain(d2.moved.map(m => m.e.id)), [e.id]);
});

// ─── moure-ho tot: un equip o unes gimnastes a una altra subdivisió (at.x, amb la clau at.k per a la qual s'ha fet)
const X = (c, e, s, g, m = 1) => { c.rot.at[e.id] = Object.assign({ s, g }, m ? { m: 1 } : {}, { x: 1, k: K(e.category, e.level, e.gender) }); };
const model = () => { const c = fixture(); make(c, RULES({ subOrder: MODEL_ORDER })); const v = E.rotView(c, settings, CTX); return { c, v, by: l => v.subs.find(s => s.label === l) }; };
const teamOf = (c, name, cat, lv) => c.teams.find(t => t.name === name && t.category === cat && t.level === lv);
test('un equip d’Aleví A a la subdivisió de Benjamí B i tornada: hi competeix (amb la seva categoria), els premis i l’horari', () => {
  const { c, by } = model(), sB = by('BENJAMÍ B').id, sAl = by('ALEVÍ A i B').id;
  const t = teamOf(c, 'C.G. LLEIDA 2', 'Aleví', 'A'), mem = c.entries.filter(e => e.teamId === t.id);
  assert.equal(mem.length, 4);
  const at0 = JSON.stringify(c.rot.at), sch0 = E.rotHorRows(E.rotSchedule(E.rotView(c, settings, CTX), c.rot));
  for (const e of mem) X(c, e, sB, 1);
  let v = E.rotView(c, settings, CTX), b = v.subs.find(s => s.id === sB), al = v.subs.find(s => s.id === sAl);
  assert.equal(v.place.size, 154);
  for (const e of mem) assert.deepEqual(plain(v.place.get(e)), { subId: sB, g: 1, derived: false, x: true, pin: true });
  const u = b.units.find(x => x.teamId === t.id);
  assert.ok(u.guest && u.pinned && !u.fresh && u.home === sAl && !u.xs);
  assert.ok(!al.units.some(x => x.teamId === t.id));
  assert.deepEqual([b.N, al.N], [33, 37]);
  assert.deepEqual(plain(b.keys), [K('Benjamí', 'B')]);
  assert.deepEqual(plain(b.guestKeys), [K('Aleví', 'A')]);
  assert.equal(b.label, 'BENJAMÍ B', 'el nom és el de les seves categories');
  assert.ok(b.groups[1].label.includes('ALEVÍ A'), b.groups[1].label);
  // l'ordre de pas: les d'Aleví A, després de les de Benjamí B del seu grup; a l'Aleví, ja no hi són
  const seq = E.rotAppSeq(b, 'salt', settings, CTX).find(x => x.G.g === 1).entries;
  assert.deepEqual(plain(seq.slice(-4).map(e => e.id)), plain(mem.map(e => e.id).sort((p, q) => c.entries.find(e => e.id === p).bib - c.entries.find(e => e.id === q).bib)));
  assert.ok(!E.rotAppSeq(al, 'salt', settings, CTX).some(x => x.entries.some(e => mem.includes(e))));
  // Aleví A també competeix a la 6a: els premis, allà (com sempre), i cap avís
  assert.deepEqual(plain(v.late), []);
  assert.deepEqual([b.awardsLabel, al.awardsLabel], ['BENJAMÍ B', 'ALEVÍ A i B']);
  // l'horari: la 3a dura més (un grup de 13 a 1’28’’), l'Aleví, el mateix (el seu grup més llarg no era aquest)
  assert.ok(b.est.min >= by('BENJAMÍ B').est.min);
  assert.notEqual(v.sig, E.rotView(fixture(), settings, CTX).sig);
  // tornada: un grup de la seva subdivisió (sense x) i tot torna a ser com abans
  for (const e of mem) c.rot.at[e.id] = JSON.parse(at0)[e.id];
  assert.equal(JSON.stringify(c.rot.at), at0);
  assert.deepEqual(plain(E.rotHorRows(E.rotSchedule(E.rotView(c, settings, CTX), c.rot))), plain(sch0));
});

test('tot Aleví A a la 3a: els premis d’Aleví A, després de la 3a (abans); un equip de Benjamí B a la 6a: els de Benjamí B, després de la 6a, i es diu', () => {
  const { c, by } = model(), sB = by('BENJAMÍ B').id, sAl = by('ALEVÍ A i B').id;
  const alA = c.entries.filter(e => e.gender === 'F' && e.category === 'Aleví' && e.level === 'A');
  assert.equal(alA.length, 12);
  for (const e of alA) X(c, e, sB, 0);
  let v = E.rotView(c, settings, CTX), b = v.subs.find(s => s.id === sB), al = v.subs.find(s => s.id === sAl);
  assert.deepEqual(plain(b.awardKeys), [K('Benjamí', 'B'), K('Aleví', 'A')]);
  assert.deepEqual([b.awardsLabel, al.awardsLabel], ['BENJAMÍ B i ALEVÍ A', 'ALEVÍ B']);
  assert.deepEqual(plain(v.late), [], 'Aleví A competeix abans: no s’ha d’esperar');
  let rows = E.rotSchedule(v, c.rot).blocks.flatMap(x => x.rows).filter(r => r.kind === 'awards').map(r => r.text);
  assert.deepEqual(plain(rows), ['PREMIS INFANTIL A i B, CADET A i B i JUVENIL', 'PREMIS BENJAMÍ A', 'PREMIS BENJAMÍ B i ALEVÍ A', 'PREMIS MASCULINA', 'PREMIS PREBENJAMÍ A i B', 'PREMIS ALEVÍ B']);
  // un equip de Benjamí B a l'Aleví (6a): Benjamí B s'ha d'esperar a la 6a
  for (const e of alA) delete c.rot.at[e.id];
  make(c, RULES({ subOrder: MODEL_ORDER }));
  const fed = c.entries.filter(e => e.teamId === teamOf(c, 'FEDAC LLEIDA', 'Benjamí', 'B').id);
  for (const e of fed) X(c, e, sAl, 2);
  v = E.rotView(c, settings, CTX); b = v.subs.find(s => s.id === sB); al = v.subs.find(s => s.id === sAl);
  assert.deepEqual(plain(v.late.map(l => [l.key, l.home, l.last, l.units.map(u => u.team.name)])), [[K('Benjamí', 'B'), sB, sAl, ['FEDAC LLEIDA']]]);
  assert.deepEqual(plain([b.awardKeys, b.awards, al.awardsLabel, al.awards]), [[], 0, 'BENJAMÍ B i ALEVÍ A i B', 5]);
  rows = E.rotSchedule(v, c.rot).blocks.flatMap(x => x.rows).filter(r => r.kind === 'awards').map(r => r.text);
  assert.ok(!rows.includes('PREMIS BENJAMÍ B') && rows.includes('PREMIS BENJAMÍ B i ALEVÍ A i B'), rows.join(' | '));
  // si ella hi posa minuts a mà, la fila hi és (sense categories)
  c.rot.subs.find(s => s.id === sB).awards = 3;
  rows = E.rotSchedule(E.rotView(c, settings, CTX), c.rot).blocks.flatMap(x => x.rows).filter(r => r.kind === 'awards' && r.subId === sB);
  assert.deepEqual(plain(rows.map(r => [r.text, r.to - r.from])), [['PREMIS', 3]]);
});

test('només 2 de les 5 d’un equip a una altra subdivisió: l’equip queda repartit (es diu a totes dues) i les entrenadores hi compten', () => {
  const { c, by } = model(), sB = by('BENJAMÍ B').id, sAl = by('ALEVÍ A i B').id;
  const t = teamOf(c, 'C.G. LLEIDA', 'Aleví', 'B'), mem = c.entries.filter(e => e.teamId === t.id);
  assert.equal(mem.length, 5);
  X(c, mem[0], sB, 2); X(c, mem[1], sB, 2);
  const v = E.rotView(c, settings, CTX), b = v.subs.find(s => s.id === sB), al = v.subs.find(s => s.id === sAl);
  const ub = b.units.find(u => u.teamId === t.id), ua = al.units.find(u => u.teamId === t.id);
  assert.deepEqual([ub.entries.length, ua.entries.length], [2, 3]);
  assert.deepEqual(plain(ub.xs.map(x => [x.subId, x.entries.length])), [[sAl, 3]]);
  assert.deepEqual(plain(ua.xs.map(x => [x.subId, x.entries.length])), [[sB, 2]]);
  assert.ok(b.warnings.some(w => w.t === 'xsplit' && w.unit === ub) && al.warnings.some(w => w.t === 'xsplit' && w.unit === ua));
  assert.ok(!ub.split && !ua.split, 'dins de cada subdivisió, en un sol grup');
  // C.G. Lleida amb 1 entrenadora: a la 3a ara surt en 2 grups (les seves de Benjamí B i les 2 d'Aleví B)
  c.rot.coaches = { CGL: 1 };
  const b2 = E.rotView(c, settings, CTX).subs.find(s => s.id === sB);
  assert.ok(b2.clubs.find(x => x.clubId === 'CGL').groups >= 2 && b2.warnings.some(w => w.t === 'coach' && w.clubId === 'CGL'));
  // una NP també es pot moure, i no compta per als premis ni per a les mides
  mem[1].status = 'np';
  const v3 = E.rotView(c, settings, CTX), b3 = v3.subs.find(s => s.id === sB);
  assert.equal(v3.place.get(mem[1]).subId, sB);
  assert.equal(b3.N, 30); assert.equal(b3.np, 1);
});

test('només 2 de les 5 a una altra subdivisió, i la seva categoria passa a una altra (o a una de nova): les 3 que no ha mogut van amb la categoria, no amb les 2', () => {
  const where = (v, l) => l.map(e => v.place.get(e).subId);
  for (const to of ['nova', 'prebenjamí', 'perduda']) {
    const { c, by } = model(), sB = by('BENJAMÍ B').id, sAl = by('ALEVÍ A i B').id, sP = by('PREBENJAMÍ A i B').id;
    const t = teamOf(c, 'C.G. LLEIDA', 'Aleví', 'B'), mem = c.entries.filter(e => e.teamId === t.id), [m1, m2, ...rest] = mem;
    X(c, m1, sB, 2); X(c, m2, sB, 2);
    assert.deepEqual(where(E.rotView(c, settings, CTX), rest), [sAl, sAl, sAl]);
    // «Quines categories van juntes…»: Aleví B surt de la 6a, a una de nova o a la de Prebenjamí (o un fitxer d'abans on la
    // subdivisió on eren ja no hi és)
    const al = c.rot.subs.find(s => s.id === sAl), kB = K('Aleví', 'B');
    al.keys = al.keys.filter(k => k !== kB);
    let home;
    if (to === 'nova') { c.rot.subs.push({ id: 'sAlB', g: 'F', keys: [kB], k: 3, kSet: false, name: '', dur: null, awards: null, start: null, extras: [] }); home = 'sAlB'; }
    else if (to === 'prebenjamí') { c.rot.subs.find(s => s.id === sP).keys.push(kB); home = sP; }
    else { c.rot.subs.push({ id: 'sAlB', g: 'F', keys: [kB], k: 3, kSet: false, name: '', dur: null, awards: null, start: null, extras: [] }); home = 'sAlB'; for (const e of rest) c.rot.at[e.id].s = 'jaNoHiEs'; }
    const v = E.rotView(c, settings, CTX);
    assert.deepEqual(where(v, [m1, m2]), [sB, sB], to + ': les 2 que ha mogut es queden a la 3a');
    assert.deepEqual(where(v, rest), [home, home, home], to + ': les 3 que no ha mogut van amb la seva categoria');
    for (const e of rest) assert.ok(v.place.get(e).derived && !v.place.get(e).x, to);
    // (i l'equip queda repartit com ella l'havia deixat: es diu a totes dues)
    const hv = v.subs.find(s => s.id === home), ub = v.subs.find(s => s.id === sB).units.find(u => u.teamId === t.id);
    assert.ok(hv.warnings.some(w => w.t === 'xsplit') && ub.xs.length === 1 && ub.xs[0].subId === home, to);
    // (una inscripció nova de l'equip, sense cap lloc desat, sí que va on en són més: aquí, amb les 3)
    c.entries.push({ id: 'nova', gymnastId: 'gnova', clubId: 'CGL', gender: 'F', category: 'Aleví', level: 'B', teamId: t.id, status: '', bib: 500, scores: {} });
    assert.equal(E.rotView(c, settings, CTX).place.get(c.entries.at(-1)).subId, home, to);
  }
});

test('un equip repartit en dues subdivisions que no són la seva: les que tornen a la seva (sense x) hi van, no a l’altra', () => {
  const { c, by } = model(), sB = by('BENJAMÍ B').id, sBA = by('BENJAMÍ A').id, sAl = by('ALEVÍ A i B').id;
  const t = teamOf(c, 'C.G. LLEIDA', 'Aleví', 'B'), mem = c.entries.filter(e => e.teamId === t.id);
  for (const e of mem.slice(0, 3)) X(c, e, sB, 2);
  for (const e of mem.slice(3)) X(c, e, sBA, 0);
  let v = E.rotView(c, settings, CTX);
  assert.deepEqual(mem.map(e => v.place.get(e).subId), [sB, sB, sB, sBA, sBA]);
  // «Treu les fixacions» de la 3a (o «Torna-ho a fer tot»): treu x, k i m, i es queda on era (s), per dir d'on a on ha passat
  for (const e of mem.slice(0, 3)) { const a = c.rot.at[e.id]; delete a.x; delete a.k; delete a.m; }
  v = E.rotView(c, settings, CTX);
  assert.deepEqual(mem.map(e => v.place.get(e).subId), [sAl, sAl, sAl, sBA, sBA]);
  for (const e of mem.slice(0, 3)) assert.ok(v.place.get(e).derived && !v.place.get(e).x);
  assert.deepEqual(plain(v.issues.find(i => i.t === 'derived').moved.map(m => [m.from, m.to, m.back])), [[sB, sAl, false], [sB, sAl, false], [sB, sAl, false]]);
});

test('canvis de subdivisió que ja no valen: grups de menys, la subdivisió ja no hi és, una altra categoria o un altre gènere', () => {
  const { c, by } = model(), sB = by('BENJAMÍ B').id, sAl = by('ALEVÍ A i B').id;
  const t = teamOf(c, 'C.G. LLEIDA 2', 'Aleví', 'A'), mem = c.entries.filter(e => e.teamId === t.id);
  for (const e of mem) X(c, e, sB, 2);
  // (a) la 3a passa a tenir 2 grups: continuen a la 3a, on aniria una inscripció nova (amb la seva entitat), marcades NOU
  c.rot.subs.find(s => s.id === sB).k = 2;
  let v = E.rotView(c, settings, CTX);
  for (const e of mem) { const p = v.place.get(e); assert.ok(p.subId === sB && p.derived && p.x && p.g < 2, JSON.stringify(p)); }
  assert.equal(new Set(mem.map(e => v.place.get(e).g)).size, 1, 'l’equip, junt');
  assert.ok(v.issues.find(i => i.t === 'derived').n >= 4);
  c.rot.subs.find(s => s.id === sB).k = 3;
  // (b) una subdivisió que ja no hi és (o que no té cap gimnasta seva): tornen a la seva, i es diu (back)
  for (const e of mem) c.rot.at[e.id].s = 'jaNoHiEs';
  v = E.rotView(c, settings, CTX);
  for (const e of mem) assert.equal(v.place.get(e).subId, sAl);
  assert.deepEqual(plain(v.issues.find(i => i.t === 'derived').moved.map(m => [m.e.id, m.from, m.to, m.back])), plain(mem.map(e => [e.id, 'jaNoHiEs', sAl, true])));
  c.rot.subs.push({ id: 'sSen', g: 'F', keys: [K('Sènior', 'A')], k: 2, extras: [] });
  for (const e of mem) c.rot.at[e.id].s = 'sSen';
  v = E.rotView(c, settings, CTX);
  assert.ok(mem.every(e => v.place.get(e).subId === sAl) && !v.subs.some(s => s.id === 'sSen'));
  c.rot.subs.pop();
  // (c) se li canvia el nivell (Aleví A → B): ja no val, va a la de la seva clau nova i es diu d'on a on
  for (const e of mem) X(c, e, sB, 2);
  const m0 = mem[0]; m0.level = 'B'; m0.teamId = null;
  v = E.rotView(c, settings, CTX);
  assert.equal(v.place.get(m0).subId, sAl);
  assert.deepEqual(plain(v.issues.find(i => i.t === 'derived').moved.filter(m => m.e === m0).map(m => [m.from, m.to, m.back])), [[sB, sAl, false]]);
  // (d) a una subdivisió dels nois: no s'hi va mai
  m0.level = 'A'; m0.teamId = t.id; X(c, m0, by('MASCULINA').id, 0);
  v = E.rotView(c, settings, CTX);
  assert.equal(v.place.get(m0).subId, sAl);
  for (const vv of [v]) assert.equal(vv.place.size, c.entries.length);
});

test('una gimnasta nova d’un equip que ella ha portat a una altra subdivisió hi va amb el seu equip (NOU); les dades d’abans, com sempre', () => {
  const { c, by } = model(), sB = by('BENJAMÍ B').id;
  const t = teamOf(c, 'C.G. LLEIDA 2', 'Aleví', 'A'), mem = c.entries.filter(e => e.teamId === t.id);
  for (const e of mem) X(c, e, sB, 1);
  c.entries.push({ id: 'nova', gymnastId: 'gnova', clubId: 'CGL', gender: 'F', category: 'Aleví', level: 'A', teamId: t.id, status: '', bib: 500, scores: {} });
  const v = E.rotView(c, settings, CTX), p = v.place.get(c.entries.find(e => e.id === 'nova'));
  assert.deepEqual(plain(p), { subId: sB, g: 1, derived: true, x: true, pin: true });
  // les dades d'abans d'aquesta versió (sense x) no canvien gens: cap equip fora de la seva subdivisió
  const c2 = fixture(); make(c2, RULES({ subOrder: MODEL_ORDER }));
  const v2 = E.rotView(c2, settings, CTX);
  for (const sv of v2.subs) { assert.deepEqual(plain(sv.guestKeys), []); assert.ok(sv.units.every(u => !u.guest && !u.xs)); assert.equal(sv.awardsLabel, sv.label); }
  assert.deepEqual(plain(v2.late), []);
  // una x sense m (ella li ha tret el 📌): continua a la subdivisió triada, però «Reequilibra» la pot moure de grup
  X(c2, c2.entries[0], v2.subs[1].id, 0, 0);
  const p2 = E.rotView(c2, settings, CTX).place.get(c2.entries[0]);
  assert.ok(p2.subId === v2.subs[1].id && p2.x && !p2.pin && !p2.derived);
  assert.ok(!E.rotView(c2, settings, CTX).subs[1].units.find(u => u.entries.includes(c2.entries[0])).pinned);
});
