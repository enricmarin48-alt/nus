// Dades de la 3a fase del 18/04/2026 (154 gimnastes, 6 entitats) per a les proves de les rotacions.
const CLUBS = [['CGL', 'C.G. Lleida'], ['LSR', 'La Salle Reus'], ['INEF', 'INEF Lleida'], ['BP', 'Baix Penedès'], ['FEDAC', 'FEDAC Lleida'], ['ART', 'C.G. Artesa de Segre']];
const NAMES = ['Laia', 'Júlia', 'Martina', 'Ona', 'Carla', 'Paula', 'Emma', 'Aina', 'Jana', 'Lucía', 'Abril', 'Berta', 'Clàudia', 'Daniela', 'Elna', 'Fiona', 'Gina', 'Helena', 'Iris', 'Judit'];
const SUR = ['Garcia', 'Puig', 'Serra', 'Vidal', 'Roca', 'Pla', 'Font', 'Ros', 'Gil', 'Mas', 'Coll', 'Bosch', 'Soler', 'Pons', 'Riu', 'Mora', 'Llop', 'Jové', 'Ferrer', 'Duran'];
export function fixture(date = '2026-04-18') {
  const db = { app: 'notesgim', version: 1, settings: { org: 'CONSELL ESPORTIU DEL SEGRIÀ', rev: 4, levels: ['A', 'B'] }, clubs: CLUBS.map(([id, name]) => ({ id, name })), gymnasts: [], teams: [], competitions: [] };
  const c = { id: 'c418', name: '3a FASE COMARCAL GIMNÀSTICA ARTÍSTICA', date, place: 'Lleida', season: '', locked: false, autoTeams: true, teams: [], entries: [] };
  let n = 0;
  const add = (category, gender, level, club, team, count) => {
    let ct = null;
    if (team !== null) {
      const tid = `T${club}${category}${gender}${level}${team}`.normalize('NFD').replace(/[^\w-]/g, '');
      const name = CLUBS.find(x => x[0] === club)[1] + (team > 1 ? ' ' + team : '');
      if (!db.teams.find(t => t.id === tid)) db.teams.push({ id: tid, name, clubId: club, gender, category, level, memberIds: [] });
      ct = c.teams.find(t => t.sourceTeamId === tid);
      if (!ct) c.teams.push(ct = { id: 'c' + tid, name, clubId: club, gender, category, level, sourceTeamId: tid, auto: true });
    }
    for (let i = 0; i < count; i++) {
      n++;
      const g = { id: 'g' + n, name: NAMES[n % 20], surname: SUR[(n * 7) % 20] + ' ' + SUR[(n * 3) % 20], clubId: club, gender, category, level, birthYear: '', notes: '', archived: false };
      db.gymnasts.push(g);
      if (ct) db.teams.find(t => t.id === ct.sourceTeamId).memberIds.push(g.id);
      c.entries.push({ id: 'e' + String(n).padStart(3, '0'), gymnastId: g.id, clubId: club, gender, category, level, teamId: ct ? ct.id : null, bib: n, status: '', scores: {} });
    }
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
  db.competitions.push(c);
  return db;
}
