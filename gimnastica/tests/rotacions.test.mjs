// Proves del càlcul de les rotacions i l'horari (bloc ENGINE d'index.html), amb les dades reals de la
// 3a fase del 18/04/2026 (154 gimnastes). Sense dependències: node --test tests/
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
const RULES = (o = {}) => Object.assign({ joins: null, apart: [], allM: true, maxGroup: 15, order: ORDER, final: FINAL, subOrder: [] }, o);
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

test('subdivisions automàtiques (com el Consell): Benjamí es parteix, Cadet i Juvenil s’ajunten amb Infantil, els nois junts', () => {
  const c = fixture();
  assert.equal(c.entries.length, 154);
  const p = E.rotPlan(c, settings, RULES(), { clubName });
  assert.deepEqual(plain(p.subs.map(s => [s.g, s.n, s.k])), [['F', 25, 3], ['F', 26, 3], ['F', 29, 3], ['F', 41, 3], ['F', 27, 3], ['M', 6, 3]]);
  assert.deepEqual(plain(p.subs[4].keys), [K('Infantil', 'A'), K('Infantil', 'B'), K('Cadet', 'A'), K('Cadet', 'B'), K('Juvenil', 'A')]);
  assert.deepEqual(plain(p.subs[1].keys), [K('Benjamí', 'A')]);
  const t = plain(p.notes).map(x => x.t);
  assert.ok(t.includes('split') && t.includes('allM'));
  assert.deepEqual(plain(p.notes.filter(x => x.t === 'joined').map(x => [x.cat, x.n, x.into])), [['Cadet', 7, 'Infantil'], ['Juvenil', 1, 'Infantil']]);
  const sp = plain(p.notes.find(x => x.t === 'split'));
  assert.deepEqual([sp.label, sp.n, sp.cap, sp.parts], ['Benjamí', 55, 45, ['Benjamí A', 'Benjamí B']]);
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
      const op = rnd(7), e = c.entries[rnd(c.entries.length)];
      if (op === 0) c.entries.splice(c.entries.indexOf(e), 1);
      if (op === 1) c.entries.push({ id: 'n' + k, clubId: 'K' + rnd(14), gender: 'F', category: 'Aleví', level: 'B', teamId: null, status: '', scores: {} });
      if (op === 2 && c.teams.length) e.teamId = c.teams[rnd(c.teams.length)].id;
      if (op === 3) e.category = cats[rnd(6)];
      if (op === 4) e.status = e.status ? '' : 'np';
      if (op === 5 && c.rot.subs.length) { const s = c.rot.subs[rnd(c.rot.subs.length)]; c.rot.at[e.id] = { s: s.id, g: rnd(4), m: 1 }; }
      if (op === 6 && c.rot.subs.length) c.rot.subs[rnd(c.rot.subs.length)].k = 1 + rnd(5);
      const v = E.rotView(c, settings, { clubName });
      assert.equal(v.place.size, c.entries.length, 'tothom un sol cop');
      const seen = new Set(); for (const sv of v.subs) for (const g of sv.groups) for (const x of g.entries) { assert.ok(!seen.has(x)); seen.add(x); }
      assert.equal(seen.size, c.entries.length);
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
