package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

func parse(t *testing.T, s string) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal([]byte(s), &m); err != nil {
		t.Fatal(err)
	}
	return m
}

const sample = `{
 "settings":{"dataGen":2},
 "gymnasts":[{"id":"g1","name":"Anna","surname":"Puig"},{"id":"g2","name":"Pau","surname":"Gil"}],
 "clubs":[{"id":"c1","name":"CG Lleida"}],
 "competitions":[{"id":"k1","name":"Fase","tutorsOn":true,"tutorPin":"1234","scoring":"simple",
   "apparatus":[{"id":"salt","name":"Salt","modes":{"F":"total","M":"total"},"attempts":1},
                {"id":"barra","name":"Barra","modes":{"F":"total","M":"off"},"attempts":1},
                {"id":"mini","name":"Minitramp","modes":{"F":"off","M":"total"},"attempts":2}],
   "entries":[{"id":"e1","gymnastId":"g1","clubId":"c1","gender":"F","category":"Aleví","level":"A","status":"","scores":{"salt":[{"v":8.5,"at":100}]}},
              {"id":"e2","gymnastId":"g2","clubId":"c1","gender":"M","category":"Aleví","level":"A","status":"","scores":{}}]}]}`

func TestMergeScoresNewestWins(t *testing.T) {
	base := parse(t, sample)
	other := parse(t, sample)
	// a l'altra còpia, una tutora ha posat barra (més nova) i el salt és més vell; i el salt de la taula
	// no el trepitja una tutora encara que sigui més nova (vegeu TestMergeKeepsTableScores)
	e := obj(arr(obj(arr(other["competitions"])[0])["entries"])[0])
	obj(e["scores"])["barra"] = []any{map[string]any{"v": 9.1, "at": float64(200), "by": "tutor"}}
	obj(e["scores"])["salt"] = []any{map[string]any{"v": 7.0, "at": float64(50)}}
	if n := mergeScores(base, other); n != 1 {
		t.Fatalf("taken = %d, vull 1", n)
	}
	be := obj(arr(obj(arr(base["competitions"])[0])["entries"])[0])
	if v := num(obj(arr(obj(be["scores"])["barra"])[0])["v"]); v != 9.1 {
		t.Fatalf("barra = %v", v)
	}
	if v := num(obj(arr(obj(be["scores"])["salt"])[0])["v"]); v != 8.5 {
		t.Fatalf("salt hauria de seguir 8.5, és %v", v)
	}
}

func TestApplyScoreRules(t *testing.T) {
	db := parse(t, sample)
	v := 9.25
	if err := applyScore(db, scoreReq{Pin: "0000", CompID: "k1", EntryID: "e1", AppID: "salt", Value: &v}, 1); err == nil {
		t.Fatal("un codi incorrecte s'ha acceptat")
	}
	if err := applyScore(db, scoreReq{Pin: "1234", CompID: "k1", EntryID: "e2", AppID: "barra", Value: &v}, 1); err == nil {
		t.Fatal("els nois no fan barra")
	}
	if err := applyScore(db, scoreReq{Pin: "1234", CompID: "k1", EntryID: "e2", AppID: "mini", I: 1, Value: &v, Who: "Marta"}, 777); err != nil {
		t.Fatal(err)
	}
	e2 := obj(arr(obj(arr(db["competitions"])[0])["entries"])[1])
	att := obj(arr(obj(e2["scores"])["mini"])[1])
	if num(att["v"]) != 9.25 || str(att["by"]) != "tutor" || str(att["who"]) != "Marta" || num(att["at"]) != 777 {
		t.Fatalf("intent desat malament: %v", att)
	}
	bad := 120.0
	if err := applyScore(db, scoreReq{Pin: "1234", CompID: "k1", EntryID: "e1", AppID: "salt", Value: &bad}, 1); err == nil {
		t.Fatal("nota fora de límits acceptada")
	}
	// competició tancada: res
	obj(arr(db["competitions"])[0])["locked"] = true
	if err := applyScore(db, scoreReq{Pin: "1234", CompID: "k1", EntryID: "e1", AppID: "salt", Value: &v}, 1); err == nil {
		t.Fatal("s'ha acceptat una nota en una competició tancada")
	}
}

func TestTutorDataOnlyWithPin(t *testing.T) {
	db := parse(t, sample)
	if len(tutorData(db, "")) != 0 || len(tutorData(db, "9999")) != 0 {
		t.Fatal("sense el codi bo no s'ha de veure res")
	}
	d := tutorData(db, "1234")
	if len(d) != 1 {
		t.Fatalf("vull 1 competició, n'hi ha %d", len(d))
	}
	entries := arr(obj(d[0])["entries"])
	if str(obj(entries[0])["name"]) != "Anna Puig" || str(obj(entries[0])["club"]) != "CG Lleida" {
		t.Fatalf("noms mal resolts: %v", entries[0])
	}
	// sense rotacions fetes, el mòbil no en rep res (puntua per categoria, com sempre)
	if _, ok := obj(d[0])["rotation"]; ok {
		t.Fatal("sense rotacions fetes no s'han d'enviar")
	}
}

// amb les rotacions fetes, el mòbil rep el que cal per saber l'ordre en què passen les gimnastes pel seu aparell
func TestTutorDataSendsRotations(t *testing.T) {
	db := parse(t, sample)
	obj(db["settings"])["categories"] = []any{map[string]any{"name": "Benjamí", "from": 2017}, map[string]any{"name": "Aleví"}}
	obj(db["settings"])["levels"] = []any{"A", "B"}
	comp := obj(arr(db["competitions"])[0])
	comp["teams"] = []any{map[string]any{"id": "t1", "name": "CG Lleida", "clubId": "c1", "category": "Aleví", "gender": "F", "level": "A", "sourceTeamId": "x"}}
	obj(arr(comp["entries"])[0])["teamId"] = "t1"
	comp["rot"] = map[string]any{"made": "", "subs": []any{}}
	if _, ok := obj(tutorData(db, "1234")[0])["rotation"]; ok {
		t.Fatal("unes rotacions encara no fetes no s'envien")
	}
	comp["rot"] = map[string]any{"made": "2026-04-18T07:00:00.000Z", "subs": []any{map[string]any{"id": "s1", "g": "F", "keys": []any{"Aleví||F||A"}, "k": 3}},
		"at": map[string]any{"e1": map[string]any{"s": "s1", "g": 1}}}
	c := obj(tutorData(db, "1234")[0])
	r := obj(c["rotation"])
	if r == nil || str(obj(r["rot"])["made"]) == "" || len(arr(obj(r["rot"])["subs"])) != 1 {
		t.Fatalf("falten les rotacions: %v", c["rotation"])
	}
	if str(obj(r["clubs"])["c1"]) != "CG Lleida" || len(arr(r["teams"])) != 1 || str(obj(arr(r["teams"])[0])["name"]) != "CG Lleida" {
		t.Fatalf("falten les entitats o els equips: %v", r)
	}
	if _, ok := obj(arr(r["teams"])[0])["sourceTeamId"]; ok {
		t.Fatal("dels equips, només el que cal")
	}
	if fmt.Sprint(r["categories"]) != "[Benjamí Aleví]" || fmt.Sprint(r["levels"]) != "[A B]" {
		t.Fatalf("ordre de les categories i dels nivells: %v %v", r["categories"], r["levels"])
	}
	e := obj(arr(c["entries"])[0])
	if str(e["teamId"]) != "t1" || str(e["clubId"]) != "c1" {
		t.Fatalf("cada inscripció ha de dir el seu equip i la seva entitat: %v", e)
	}
}

func TestMergeKeepsTableScores(t *testing.T) {
	base := parse(t, sample)
	other := parse(t, sample)
	// la taula té el salt (8,5 a les 100); al servidor hi ha una nota de tutora més nova: no hi entra
	e := obj(arr(obj(arr(other["competitions"])[0])["entries"])[0])
	obj(e["scores"])["salt"] = []any{map[string]any{"v": 9.9, "at": float64(500), "by": "tutor"}}
	if n := mergeScores(base, other); n != 0 {
		t.Fatalf("taken = %d, vull 0", n)
	}
	be := obj(arr(obj(arr(base["competitions"])[0])["entries"])[0])
	if v := num(obj(arr(obj(be["scores"])["salt"])[0])["v"]); v != 8.5 {
		t.Fatalf("salt = %v, vull 8.5 (el de la taula)", v)
	}
}

func TestApplyScoreMaxAndLocked(t *testing.T) {
	db := parse(t, sample)
	v := 20.5
	// per defecte la nota màxima és 20
	if err := applyScore(db, scoreReq{Pin: "1234", CompID: "k1", EntryID: "e2", AppID: "salt", Value: &v}, 1); err == nil {
		t.Fatal("s'ha acceptat 20,5 amb màxim 20")
	}
	obj(arr(db["competitions"])[0])["maxScore"] = 30.0
	if err := applyScore(db, scoreReq{Pin: "1234", CompID: "k1", EntryID: "e2", AppID: "salt", Value: &v}, 1); err != nil {
		t.Fatal(err)
	}
	// el salt de l'e1 l'ha posat la taula: 409
	ok := 9.0
	err := applyScore(db, scoreReq{Pin: "1234", CompID: "k1", EntryID: "e1", AppID: "salt", Value: &ok}, 2)
	if !errors.Is(err, errLocked) {
		t.Fatalf("vull errLocked, tinc %v", err)
	}
	// una nota de tutora sense revisar sí que la pot tornar a canviar; revisada, ja no
	if err := applyScore(db, scoreReq{Pin: "1234", CompID: "k1", EntryID: "e2", AppID: "salt", Value: &ok}, 3); err != nil {
		t.Fatal(err)
	}
	e2 := obj(arr(obj(arr(db["competitions"])[0])["entries"])[1])
	obj(arr(obj(e2["scores"])["salt"])[0])["ok"] = true
	if err := applyScore(db, scoreReq{Pin: "1234", CompID: "k1", EntryID: "e2", AppID: "salt", Value: &v}, 4); !errors.Is(err, errLocked) {
		t.Fatalf("revisada: vull errLocked, tinc %v", err)
	}
}

// PUT /api/db: una finestra amb una versió vella de les dades no les trepitja (409); «replace» no hi barreja notes;
// i abans de la primera escriptura es guarda una còpia del fitxer tal com era
func TestPutConflictReplaceAndBackup(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "notesgim-dades.json")
	if err := os.WriteFile(path, []byte(sample), 0o644); err != nil {
		t.Fatal(err)
	}
	s, err := newStore(path)
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(s.routes(0))
	defer srv.Close()
	get := func() (rev int64, db map[string]any) {
		r, err := http.Get(srv.URL + "/api/db")
		if err != nil {
			t.Fatal(err)
		}
		defer r.Body.Close()
		var j struct {
			DataRev int64          `json:"dataRev"`
			DB      map[string]any `json:"db"`
		}
		_ = json.NewDecoder(r.Body).Decode(&j)
		return j.DataRev, j.DB
	}
	put := func(body map[string]any) int {
		b, _ := json.Marshal(body)
		req, _ := http.NewRequest(http.MethodPut, srv.URL+"/api/db", bytes.NewReader(b))
		r, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		r.Body.Close()
		return r.StatusCode
	}
	rev, db := get()
	if code := put(map[string]any{"db": db, "base": rev - 1}); code != 409 {
		t.Fatalf("base vell: vull 409, tinc %d", code)
	}
	// una tutora ha posat una nota més nova al servidor; la finestra restaura una còpia sense aquesta nota
	e := obj(arr(obj(arr(s.db["competitions"])[0])["entries"])[1])
	obj(e["scores"])["salt"] = []any{map[string]any{"v": 9.0, "at": float64(999), "by": "tutor"}}
	restored := parse(t, sample)
	if code := put(map[string]any{"db": restored, "base": rev, "replace": true}); code != 200 {
		t.Fatalf("replace: %d", code)
	}
	_, now := get()
	e2 := obj(arr(obj(arr(now["competitions"])[0])["entries"])[1])
	if len(obj(e2["scores"])) != 0 {
		t.Fatalf("amb replace no s'hi havien de barrejar notes: %v", e2["scores"])
	}
	files, _ := filepath.Glob(filepath.Join(dir, "copies-notesgim", "*-en-obrir.json"))
	if len(files) != 1 {
		t.Fatalf("vull 1 còpia del fitxer d'abans, n'hi ha %d", len(files))
	}
	if b, _ := os.ReadFile(files[0]); string(b) != sample {
		t.Fatal("la còpia no és el fitxer d'abans")
	}
}

// si no es pot escriure al fitxer (disc ple, USB fora…), la finestra ho sap (500 amb el dataRev nou, no un
// conflicte) i el programa ho torna a provar sol fins que pot
func TestPutSaveFailureKeepsRevAndRetries(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "notesgim-dades.json")
	if err := os.WriteFile(path, []byte(sample), 0o644); err != nil {
		t.Fatal(err)
	}
	s, err := newStore(path)
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(s.routes(0))
	defer srv.Close()
	if err := os.Mkdir(path+".tmp", 0o755); err != nil { // no s'hi podrà escriure
		t.Fatal(err)
	}
	db := parse(t, sample)
	obj(arr(db["gymnasts"])[0])["name"] = "Anna Nova"
	b, _ := json.Marshal(map[string]any{"db": db, "base": s.dataRev})
	req, _ := http.NewRequest(http.MethodPut, srv.URL+"/api/db", bytes.NewReader(b))
	r, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	var j struct {
		Error   string `json:"error"`
		DataRev int64  `json:"dataRev"`
	}
	_ = json.NewDecoder(r.Body).Decode(&j)
	r.Body.Close()
	if r.StatusCode != 500 || j.DataRev != s.dataRev || j.Error == "" {
		t.Fatalf("vull 500 amb el dataRev nou (%d): %d %+v", s.dataRev, r.StatusCode, j)
	}
	if !s.dirty || s.saveErr == "" {
		t.Fatal("hauria de quedar pendent de desar")
	}
	// el mateix canvi un altre cop, amb el dataRev que ha rebut: no és cap conflicte
	b, _ = json.Marshal(map[string]any{"db": db, "base": j.DataRev})
	req, _ = http.NewRequest(http.MethodPut, srv.URL+"/api/db", bytes.NewReader(b))
	if r, err = http.DefaultClient.Do(req); err != nil {
		t.Fatal(err)
	}
	r.Body.Close()
	if r.StatusCode == 409 {
		t.Fatal("tornar-ho a enviar amb el dataRev rebut no pot ser un conflicte")
	}
	// el disc torna a funcionar: el reintent (el que fa el programa cada pocs segons) ho desa
	_ = os.Remove(path + ".tmp")
	s.mu.Lock()
	err = s.saveLocked()
	s.mu.Unlock()
	if err != nil || s.dirty || s.saveErr != "" {
		t.Fatalf("reintent: %v dirty=%v", err, s.dirty)
	}
	got, _ := os.ReadFile(path)
	if !bytes.Contains(got, []byte("Anna Nova")) {
		t.Fatal("el fitxer no té el canvi")
	}
}

// fitxer de dades malmès (p. ex. un tall de llum): es guarda apart i s'obre la còpia de seguretat més nova
func TestCorruptDataFileOpensNewestBackup(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "notesgim-dades.json")
	bak := filepath.Join(dir, "copies-notesgim")
	if err := os.MkdirAll(bak, 0o755); err != nil {
		t.Fatal(err)
	}
	_ = os.WriteFile(filepath.Join(bak, "notesgim-2026-10-01_1000.json"), []byte(`{"gymnasts":[{"id":"old"}]}`), 0o644)
	newest := filepath.Join(bak, "notesgim-2026-10-02_1000.json")
	_ = os.WriteFile(newest, []byte(sample), 0o644)
	_ = os.WriteFile(filepath.Join(bak, "notesgim-2026-10-03_1000.json"), []byte("{trencat"), 0o644) // il·legible: se salta
	old := time.Now().Add(-2 * time.Hour)
	_ = os.Chtimes(filepath.Join(bak, "notesgim-2026-10-01_1000.json"), old, old)
	_ = os.Chtimes(newest, old.Add(time.Hour), old.Add(time.Hour))
	if err := os.WriteFile(path, make([]byte, 64), 0o644); err != nil { // ple de zeros
		t.Fatal(err)
	}
	s, err := newStore(path)
	if err != nil {
		t.Fatal(err)
	}
	if s.recovered == "" || len(arr(s.db["gymnasts"])) != 2 {
		t.Fatalf("hauria d'haver obert la còpia més nova: %q %v", s.recovered, s.db["gymnasts"])
	}
	bad, _ := filepath.Glob(path + ".malmes-*")
	if len(bad) != 1 {
		t.Fatalf("el fitxer malmès s'havia de guardar apart: %v", bad)
	}
	// i es desa al seu lloc
	s.mu.Lock()
	err = s.saveLocked()
	s.mu.Unlock()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := newStore(path); err != nil {
		t.Fatal(err)
	}
	// sense cap còpia: s'obre buit (i ho diu)
	dir2 := t.TempDir()
	p2 := filepath.Join(dir2, "notesgim-dades.json")
	_ = os.WriteFile(p2, nil, 0o644)
	s2, err := newStore(p2)
	if err != nil || s2.recovered == "" || len(s2.db) != 0 {
		t.Fatalf("sense còpies: %v %q %v", err, s2.recovered, s2.db)
	}
}

// «Tanca NotesGim» quan no es pot desar al fitxer: no es tanca (si no, es perdrien els últims canvis), excepte
// si la finestra ho demana expressament
func TestQuitRefusesWhenCannotSave(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "notesgim-dades.json")
	if err := os.WriteFile(path, []byte(sample), 0o644); err != nil {
		t.Fatal(err)
	}
	s, err := newStore(path)
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(s.routes(0))
	defer srv.Close()
	_ = os.Mkdir(path+".tmp", 0o755)
	s.mu.Lock()
	_ = s.saveLocked() // un canvi que no s'ha pogut desar
	s.mu.Unlock()
	post := func(body string) int {
		r, err := http.Post(srv.URL+"/api/quit", "application/json", bytes.NewReader([]byte(body)))
		if err != nil {
			t.Fatal(err)
		}
		r.Body.Close()
		return r.StatusCode
	}
	if code := post(`{}`); code != 500 {
		t.Fatalf("sense poder desar no s'havia de tancar: %d", code)
	}
	select {
	case <-s.quit:
		t.Fatal("s'ha tancat")
	case <-time.After(400 * time.Millisecond):
	}
	if code := post(`{"force":true}`); code != 200 {
		t.Fatalf("amb force: %d", code)
	}
	if code := post(`{"force":true}`); code != 200 { // dues vegades no peta
		t.Fatalf("segona vegada: %d", code)
	}
	select {
	case <-s.quit:
	case <-time.After(2 * time.Second):
		t.Fatal("no s'ha tancat")
	}
}

// si ja estava tot desat, «Tanca NotesGim» tanca encara que ara no es pugui escriure a la carpeta
func TestQuitWhenAlreadySaved(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "notesgim-dades.json")
	if err := os.WriteFile(path, []byte(sample), 0o644); err != nil {
		t.Fatal(err)
	}
	s, err := newStore(path)
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(s.routes(0))
	defer srv.Close()
	_ = os.Mkdir(path+".tmp", 0o755)
	r, err := http.Post(srv.URL+"/api/quit", "application/json", bytes.NewReader([]byte(`{}`)))
	if err != nil {
		t.Fatal(err)
	}
	var j struct {
		Saved bool `json:"saved"`
	}
	_ = json.NewDecoder(r.Body).Decode(&j)
	r.Body.Close()
	if r.StatusCode != 200 || !j.Saved {
		t.Fatalf("vull 200 i saved: %d %+v", r.StatusCode, j)
	}
	select {
	case <-s.quit:
	case <-time.After(2 * time.Second):
		t.Fatal("no s'ha tancat")
	}
}

// la finestra torna a desar les mateixes dades (sense cap canvi): no es reescriu el fitxer, i si ara la carpeta
// no es pot fer servir no és cap error (no hi ha res per perdre)
func TestPutSameDataDoesNotRewrite(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "notesgim-dades.json")
	if err := os.WriteFile(path, []byte(sample), 0o644); err != nil {
		t.Fatal(err)
	}
	s, err := newStore(path)
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(s.routes(0))
	defer srv.Close()
	_ = os.Mkdir(path+".tmp", 0o755)
	rev := s.dataRev
	b, _ := json.Marshal(map[string]any{"db": parse(t, sample), "base": rev})
	req, _ := http.NewRequest(http.MethodPut, srv.URL+"/api/db", bytes.NewReader(b))
	r, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	r.Body.Close()
	if r.StatusCode != 200 || s.dirty || s.dataRev != rev {
		t.Fatalf("dades iguals: %d dirty=%v rev %d→%d", r.StatusCode, s.dirty, rev, s.dataRev)
	}
}

// dades de les versions de proves (sense settings.dataGen): es guarden apart i es comença de zero; les d'ara, no
func TestOldTestDataStartsFresh(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "notesgim-dades.json")
	_ = os.WriteFile(path, []byte(`{"gymnasts":[{"id":"g1","name":"Anna"}],"settings":{"rev":4}}`), 0o644)
	s, err := newStore(path)
	if err != nil {
		t.Fatal(err)
	}
	if s.fresh == "" || hasData(s.db) {
		t.Fatalf("havia de començar de zero: %q %v", s.fresh, s.db)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("el fitxer de les proves havia de quedar apart: %v", err)
	}
	b, err := os.ReadFile(filepath.Join(dir, s.fresh))
	if err != nil || !strings.Contains(string(b), `"Anna"`) {
		t.Fatalf("les dades de les proves no s'han d'esborrar: %v %s", err, b)
	}
	// la taula ho sap (api/info) fins que hi desa per primer cop; les tutores no
	srv := httptest.NewServer(s.routes(0))
	defer srv.Close()
	info := func() map[string]any {
		r, err := http.Get(srv.URL + "/api/info")
		if err != nil {
			t.Fatal(err)
		}
		defer r.Body.Close()
		var m map[string]any
		_ = json.NewDecoder(r.Body).Decode(&m)
		return m
	}
	if m := info(); m["fresh"] != s.fresh || m["role"] != "admin" {
		t.Fatalf("api/info havia de dir que es comença de zero: %v", m)
	}
	pb, _ := json.Marshal(map[string]any{"db": parse(t, `{"settings":{"dataGen":2},"gymnasts":[]}`), "base": s.dataRev})
	req, _ := http.NewRequest(http.MethodPut, srv.URL+"/api/db", bytes.NewReader(pb))
	r, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	r.Body.Close()
	if m := info(); r.StatusCode != 200 || m["fresh"] != "" {
		t.Fatalf("després de desar, l'avís ja no hi ha de ser: %d %v", r.StatusCode, m)
	}
	if b, _ := os.ReadFile(path); !strings.Contains(string(b), `"dataGen"`) {
		t.Fatalf("el fitxer nou havia de ser de les dades d'ara: %s", b)
	}
	// un fitxer buit (sense gimnastes ni competicions) no cal guardar-lo apart
	_ = os.WriteFile(path, []byte(`{"settings":{"rev":4}}`), 0o644)
	if s2, err := newStore(path); err != nil || s2.fresh != "" {
		t.Fatalf("un fitxer sense dades no es toca: %v %q", err, s2.fresh)
	}
	// les dades d'ara (amb dataGen 2) s'obren tal qual
	_ = os.WriteFile(path, []byte(sample), 0o644)
	s3, err := newStore(path)
	if err != nil || s3.fresh != "" || len(arr(s3.db["gymnasts"])) != 2 {
		t.Fatalf("les dades d'ara s'havien d'obrir: %v %q", err, s3.fresh)
	}
}

// després d'un fitxer malmès s'obre la còpia de cada 10 minuts més nova (no la d'abans d'esborrar-ho tot), i mai
// una de les versions de proves
func TestCorruptFilePrefersRegularBackupAndNeverTestData(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "notesgim-dades.json")
	bak := filepath.Join(dir, "copies-notesgim")
	_ = os.MkdirAll(bak, 0o755)
	reg := filepath.Join(bak, "notesgim-2026-10-02_1000.json")
	_ = os.WriteFile(reg, []byte(`{"settings":{"dataGen":2},"gymnasts":[]}`), 0o644)
	before := filepath.Join(bak, "notesgim-2026-10-02_100500-abans-de-restaurar.json")
	_ = os.WriteFile(before, []byte(sample), 0o644)
	old := time.Now().Add(-time.Hour)
	_ = os.Chtimes(reg, old, old) // (la d'abans d'esborrar és més nova, però no és la que s'obre)
	_ = os.WriteFile(path, []byte("{trencat"), 0o644)
	s, err := newStore(path)
	if err != nil || s.recovered == "" || hasData(s.db) || dataGen(s.db) != 2 {
		t.Fatalf("havia d'obrir la còpia de cada 10 minuts (buida després d'esborrar-ho tot): %v %q %v", err, s.recovered, s.db)
	}
	// només hi ha una còpia de les versions de proves: no s'obre
	dir2 := t.TempDir()
	p2 := filepath.Join(dir2, "notesgim-dades.json")
	_ = os.MkdirAll(filepath.Join(dir2, "copies-notesgim"), 0o755)
	_ = os.WriteFile(filepath.Join(dir2, "copies-notesgim", "notesgim-2026-10-01_1000.json"), []byte(`{"gymnasts":[{"id":"vella"}]}`), 0o644)
	_ = os.WriteFile(p2, []byte("{trencat"), 0o644)
	s2, err := newStore(p2)
	if err != nil || hasData(s2.db) || !strings.Contains(s2.recovered, "versions de proves") {
		t.Fatalf("una còpia de les versions de proves no s'ha d'obrir: %v %q %v", err, s2.recovered, s2.db)
	}
}

// una finestra d'una versió de proves no pot tornar a posar les seves dades al fitxer
func TestPutRefusesTestVersionData(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "notesgim-dades.json")
	_ = os.WriteFile(path, []byte(sample), 0o644)
	s, err := newStore(path)
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(s.routes(0))
	defer srv.Close()
	b, _ := json.Marshal(map[string]any{"db": parse(t, `{"gymnasts":[{"id":"vella"}]}`), "base": s.dataRev})
	req, _ := http.NewRequest(http.MethodPut, srv.URL+"/api/db", bytes.NewReader(b))
	r, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	r.Body.Close()
	if r.StatusCode != 409 || len(arr(s.db["gymnasts"])) != 2 {
		t.Fatalf("les dades d'una versió de proves no s'han d'acceptar: %d %v", r.StatusCode, s.db["gymnasts"])
	}
	// i abans d'esborrar-ho tot, la taula en pot demanar una còpia
	r, err = http.Post(srv.URL+"/api/backup", "application/json", strings.NewReader("{}"))
	if err != nil {
		t.Fatal(err)
	}
	r.Body.Close()
	got, _ := filepath.Glob(filepath.Join(dir, "copies-notesgim", "*-abans-d-esborrar.json"))
	if r.StatusCode != 200 || len(got) != 1 {
		t.Fatalf("api/backup: %d %v", r.StatusCode, got)
	}
	// dues còpies el mateix segon: no se n'escriu una a sobre de l'altra
	if err := s.backupBeforeRestoreLocked("abans-d-esborrar"); err != nil {
		t.Fatal(err)
	}
	if got, _ = filepath.Glob(filepath.Join(dir, "copies-notesgim", "*-abans-d-esborrar*.json")); len(got) != 2 {
		t.Fatalf("havien de ser dues còpies: %v", got)
	}
}

// si hi ha obert un NotesGim d'una versió de proves amb les mateixes dades, es tanca (i s'obre el nou); un d'ara, no
func TestOldRunningInstanceIsClosed(t *testing.T) {
	path := filepath.Join(t.TempDir(), "notesgim-dades.json")
	fake := func(gen int) (*httptest.Server, int, *bool) {
		quit := false
		var srv *httptest.Server
		srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			switch r.URL.Path {
			case "/api/info":
				info := map[string]any{"app": "notesgim", "dataFile": path}
				if gen > 0 {
					info["dataGen"] = gen
				}
				writeJSON(w, 200, info)
			case "/api/quit":
				quit = true
				writeJSON(w, 200, map[string]any{"ok": true})
				go func() { time.Sleep(100 * time.Millisecond); srv.CloseClientConnections(); srv.Listener.Close() }()
			}
		}))
		port, _ := strconv.Atoi(srv.URL[strings.LastIndex(srv.URL, ":")+1:])
		return srv, port, &quit
	}
	srv, port, quit := fake(0)
	defer srv.Close()
	if u, old := runningInstance(port, path); u != "" || old || !*quit {
		t.Fatalf("el NotesGim de proves s'havia de tancar: %q %v quit=%v", u, old, *quit)
	}
	srv2, port2, quit2 := fake(2)
	defer srv2.Close()
	if u, old := runningInstance(port2, path); u == "" || old || *quit2 {
		t.Fatalf("un NotesGim d'ara obert: se n'obre la finestra: %q %v quit=%v", u, old, *quit2)
	}
}

// les còpies d'abans d'esborrar-ho tot (o de restaurar) no se'n van amb les 60 de cada 10 minuts
func TestPruneKeepsWipeBackups(t *testing.T) {
	dir := t.TempDir()
	s := &store{backups: dir}
	_ = os.WriteFile(filepath.Join(dir, "notesgim-2026-01-01_100000-abans-d-esborrar.json"), []byte("{}"), 0o644)
	for i := 0; i < 70; i++ {
		_ = os.WriteFile(filepath.Join(dir, fmt.Sprintf("notesgim-2026-02-%02d_%02d00.json", 1+i/24, i%24)), []byte("{}"), 0o644)
	}
	s.pruneBackups(60)
	list, _ := filepath.Glob(filepath.Join(dir, "*.json"))
	keep, _ := filepath.Glob(filepath.Join(dir, "*-abans-d-esborrar.json"))
	if len(list) != 61 || len(keep) != 1 {
		t.Fatalf("havien de quedar les 60 últimes i la d'abans d'esborrar: %d %v", len(list), keep)
	}
}

// el fitxer de les proves no es pot moure (antivirus, OneDrive): se'n fa una còpia, i un altre dia no se'n fa cap
// altra ni es torna a dir «comences de zero»
func TestOldTestDataCopyOnlyOnce(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "notesgim-dades.json")
	b := []byte(`{"gymnasts":[{"id":"g1","name":"Anna"}]}`)
	_ = os.WriteFile(path, b, 0o644)
	_ = os.WriteFile(filepath.Join(dir, "notesgim-dades-proves-2026-10-01_100000.json"), b, 0o644)
	if got := sameProves(path, b); got != "notesgim-dades-proves-2026-10-01_100000.json" {
		t.Fatalf("havia de trobar la còpia igual: %q", got)
	}
	if got := sameProves(path, []byte(`{}`)); got != "" {
		t.Fatalf("una còpia diferent no compta: %q", got)
	}
}

// la taula dona per revisada una nota de tutora (8,50) just quan la tutora la corregeix (9,50) i el programa ja l'ha
// acceptada: quan arriba la revisió, la correcció no es perd; es queda sense revisar (torna a sortir en groc)
func TestReviewedOlderTutorNoteDoesNotHideNewerOne(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "notesgim-dades.json")
	if err := os.WriteFile(path, []byte(sample), 0o644); err != nil {
		t.Fatal(err)
	}
	s, err := newStore(path)
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(s.routes(0))
	defer srv.Close()
	cell := func(db map[string]any) map[string]any {
		e := obj(arr(obj(arr(db["competitions"])[0])["entries"])[1])
		return obj(arr(obj(e["scores"])["salt"])[0])
	}
	// el que té la taula: la nota de la tutora (8,5 a les 1000), que acaba de donar per revisada
	table := parse(t, sample)
	obj(arr(obj(arr(table["competitions"])[0])["entries"])[1])["scores"] = map[string]any{"salt": []any{map[string]any{"v": 8.5, "at": float64(1000), "by": "tutor", "ok": true}}}
	// al programa ja hi ha la correcció de la tutora (9,5 a les 2000), que la taula encara no ha vist
	s.mu.Lock()
	obj(arr(obj(arr(s.db["competitions"])[0])["entries"])[1])["scores"] = map[string]any{"salt": []any{map[string]any{"v": 9.5, "at": float64(2000), "by": "tutor"}}}
	rev := s.dataRev
	s.mu.Unlock()
	b, _ := json.Marshal(map[string]any{"db": table, "base": rev})
	req, _ := http.NewRequest(http.MethodPut, srv.URL+"/api/db", bytes.NewReader(b))
	r, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	var j struct {
		Taken int            `json:"taken"`
		DB    map[string]any `json:"db"`
	}
	_ = json.NewDecoder(r.Body).Decode(&j)
	r.Body.Close()
	if r.StatusCode != 200 || j.Taken != 1 || j.DB == nil {
		t.Fatalf("vull 200 amb la nota nova de tornada: %d taken=%d", r.StatusCode, j.Taken)
	}
	if c := cell(s.db); num(c["v"]) != 9.5 || truthy(c["ok"]) {
		t.Fatalf("s'havia de quedar la correcció 9,5 sense revisar: %v", c)
	}
	// i al revés: una nota de tutora més vella no passa per sobre d'una de revisada, ni cap de tutora per sobre d'una de la taula
	base, other := parse(t, sample), parse(t, sample)
	obj(arr(obj(arr(base["competitions"])[0])["entries"])[1])["scores"] = map[string]any{"salt": []any{map[string]any{"v": 9.5, "at": float64(2000), "by": "tutor", "ok": true}}, "barra": []any{map[string]any{"v": 7.0, "at": float64(1000)}}}
	obj(arr(obj(arr(other["competitions"])[0])["entries"])[1])["scores"] = map[string]any{"salt": []any{map[string]any{"v": 8.5, "at": float64(1000), "by": "tutor"}}, "barra": []any{map[string]any{"v": 9.0, "at": float64(3000), "by": "tutor"}}}
	if n := mergeScores(base, other); n != 0 {
		t.Fatalf("no s'havia d'agafar res: %d", n)
	}
}

// la tutora desa una nota, el programa la posa però la resposta es perd (Wi-Fi) i el mòbil la torna a enviar al cap d'uns
// segons: no es torna a posar (encara que mentrestant la taula l'hagi esborrada, o revisada)
func TestTutorResendIsIdempotent(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "notesgim-dades.json")
	if err := os.WriteFile(path, []byte(sample), 0o644); err != nil {
		t.Fatal(err)
	}
	s, err := newStore(path)
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(s.routes(0))
	defer srv.Close()
	post := func(op string, v float64) int {
		b, _ := json.Marshal(map[string]any{"pin": "1234", "compId": "k1", "entryId": "e2", "appId": "salt", "i": 0, "value": v, "op": op})
		r, err := http.Post(srv.URL+"/api/score", "application/json", bytes.NewReader(b))
		if err != nil {
			t.Fatal(err)
		}
		r.Body.Close()
		return r.StatusCode
	}
	salt := func() map[string]any {
		s.mu.Lock()
		defer s.mu.Unlock()
		e := obj(arr(obj(arr(s.db["competitions"])[0])["entries"])[1])
		l := arr(obj(e["scores"])["salt"])
		if len(l) == 0 {
			return nil
		}
		return obj(l[0])
	}
	if code := post("op-1", 7.5); code != 200 {
		t.Fatalf("primer enviament: %d", code)
	}
	if a := salt(); num(a["v"]) != 7.5 || str(a["op"]) != "op-1" {
		t.Fatalf("nota desada malament: %v", a)
	}
	// la taula l'esborra (era d'una altra gimnasta)
	s.mu.Lock()
	obj(arr(obj(arr(s.db["competitions"])[0])["entries"])[1])["scores"] = map[string]any{"salt": []any{map[string]any{"at": float64(time.Now().UnixMilli())}}}
	s.mu.Unlock()
	if code := post("op-1", 7.5); code != 200 {
		t.Fatalf("el mateix enviament un altre cop ha de dir que sí: %d", code)
	}
	if a := salt(); hasMark(a) {
		t.Fatalf("la nota esborrada ha tornat: %v", a)
	}
	// una nota nova (un altre id) sí que hi entra
	if code := post("op-2", 8.0); code != 200 || num(salt()["v"]) != 8 {
		t.Fatalf("una nota nova: %d %v", code, salt())
	}
	// el programa s'ha tornat a obrir (ja no recorda els ids) i la nota s'ha revisat: el mateix enviament no és un «409»
	s.mu.Lock()
	s.ops, s.opList = nil, nil
	obj(arr(obj(obj(arr(obj(arr(s.db["competitions"])[0])["entries"])[1])["scores"])["salt"])[0])["ok"] = true
	s.mu.Unlock()
	if code := post("op-2", 8.0); code != 200 {
		t.Fatalf("reenviament després de revisar-la: %d", code)
	}
}

// la pàgina que serveix el programa porta la marca window.NOTESGIM (si després el programa triga a respondre, la
// pàgina no s'obre mai com l'app del navegador)
func TestServedPageIsMarked(t *testing.T) {
	if got := string(markServed([]byte("<!DOCTYPE html>\n<html>\n<head>\n<title>x</title></head>"))); !strings.Contains(got, "<head>\n<script>window.NOTESGIM=1</script>") {
		t.Fatalf("sense marca: %s", got)
	}
	s := &store{db: map[string]any{}, quit: make(chan struct{})}
	srv := httptest.NewServer(s.routes(0))
	defer srv.Close()
	r, err := http.Get(srv.URL + "/")
	if err != nil {
		t.Fatal(err)
	}
	b, _ := io.ReadAll(r.Body)
	r.Body.Close()
	if !bytes.Contains(b, []byte("window.NOTESGIM=1")) {
		t.Fatal("la pàgina servida no porta la marca")
	}
}

// el programa recorda les notes de tutora ja posades encara que es torni a obrir (un mòbil que no va rebre la resposta)
func TestTutorOpsSurviveRestart(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "notesgim-dades.json")
	_ = os.WriteFile(path, []byte(sample), 0o644)
	s, err := newStore(path)
	if err != nil {
		t.Fatal(err)
	}
	s.mu.Lock()
	s.sawOpLocked("op-abc")
	err = s.saveLocked()
	s.flushOpsLocked()
	s.mu.Unlock()
	if err != nil {
		t.Fatal(err)
	}
	s2, err := newStore(path)
	if err != nil || !s2.ops["op-abc"] {
		t.Fatalf("la nota ja posada s'havia de recordar: %v %v", err, s2.ops)
	}
}

// sisena revisió: l'id d'una nota de tutora es recorda al fitxer de les notes posades només quan la nota ja és al fitxer de
// dades. Si el programa s'atura mentre desa (o no pot desar), el mòbil la torna a enviar en tornar-lo a obrir i es posa
func TestTutorOpRecordedOnlyAfterSave(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "notesgim-dades.json")
	if err := os.WriteFile(path, []byte(sample), 0o644); err != nil {
		t.Fatal(err)
	}
	s, err := newStore(path)
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(s.routes(0))
	defer srv.Close()
	post := func(url, op string, v float64) int {
		b, _ := json.Marshal(map[string]any{"pin": "1234", "compId": "k1", "entryId": "e2", "appId": "salt", "i": 0, "value": v, "op": op})
		r, err := http.Post(url+"/api/score", "application/json", bytes.NewReader(b))
		if err != nil {
			t.Fatal(err)
		}
		r.Body.Close()
		return r.StatusCode
	}
	opsFile := strings.TrimSuffix(path, ".json") + "-notes-posades.txt"
	inOps := func(op string) bool { b, _ := os.ReadFile(opsFile); return bytes.Contains(b, []byte(op+"\n")) }
	if err := os.Mkdir(path+".tmp", 0o755); err != nil { // no s'hi podrà escriure
		t.Fatal(err)
	}
	if code := post(srv.URL, "op-x", 7.5); code != 200 {
		t.Fatalf("la nota és al programa (i a la taula): %d", code)
	}
	if inOps("op-x") {
		t.Fatal("l'id s'ha recordat al fitxer abans que la nota fos al fitxer de dades")
	}
	if !s.ops["op-x"] || post(srv.URL, "op-x", 7.5) != 200 {
		t.Fatal("mentre el programa és obert, un reenviament no la torna a posar")
	}
	// el programa es torna a obrir sense que s'hagi pogut desar: el reenviament es posa
	s2, err := newStore(path)
	if err != nil {
		t.Fatal(err)
	}
	if s2.ops["op-x"] {
		t.Fatal("el programa nou no la pot donar per posada")
	}
	srv2 := httptest.NewServer(s2.routes(0))
	defer srv2.Close()
	_ = os.Remove(path + ".tmp")
	if code := post(srv2.URL, "op-x", 7.5); code != 200 {
		t.Fatalf("reenviament: %d", code)
	}
	got, _ := os.ReadFile(path)
	if !bytes.Contains(got, []byte(`"op": "op-x"`)) || !inOps("op-x") {
		t.Fatalf("la nota s'havia de posar i recordar: %s", got)
	}
	// al primer programa, la nota següent que es desa hi posa també la d'abans (ja és al fitxer de dades)
	if code := post(srv.URL, "op-y", 8); code != 200 || len(s.opsNew) != 0 {
		t.Fatalf("la següent: %d %v", code, s.opsNew)
	}
}

// sisena revisió: una nota que s'ha quedat pel camí (una pestanya adormida, o la Wi-Fi que entrega tard una petició que el
// mòbil ja havia donat per perduda) no es posa a sobre d'una de més nova del mateix mòbil a la mateixa casella; les hores
// de dos mòbils no es comparen mai
func TestTutorOlderNoteFromSamePhoneIsIgnored(t *testing.T) {
	db := parse(t, sample)
	put := func(op, dev string, made, v float64) error {
		return applyScore(db, scoreReq{Pin: "1234", CompID: "k1", EntryID: "e2", AppID: "salt", Value: &v, Op: op, Dev: dev, Made: made}, 1)
	}
	salt := func() float64 {
		e2 := obj(arr(obj(arr(db["competitions"])[0])["entries"])[1])
		return num(obj(arr(obj(e2["scores"])["salt"])[0])["v"])
	}
	if err := put("a", "mobil-1", 1000, 7.5); err != nil || salt() != 7.5 {
		t.Fatal(err, salt())
	}
	if err := put("b", "mobil-1", 2000, 9); err != nil || salt() != 9 {
		t.Fatal(err, salt())
	}
	// la de 7,5 arriba tard (un altre id, mai vist): no es posa i es respon que sí
	if err := put("a", "mobil-1", 1000, 7.5); !errors.Is(err, errOlder) || salt() != 9 {
		t.Fatalf("la vella ha trepitjat la correcció: %v %v", err, salt())
	}
	// un altre mòbil (amb el rellotge endarrerit) sí que la pot canviar
	if err := put("c", "mobil-2", 10, 8); err != nil || salt() != 8 {
		t.Fatal(err, salt())
	}
	// i la vella del primer mòbil tampoc no trepitja aquesta (el primer ja hi havia posat una de més nova)
	if err := put("a2", "mobil-1", 1500, 6); !errors.Is(err, errOlder) || salt() != 8 {
		t.Fatalf("una nota vella del primer mòbil: %v %v", err, salt())
	}
	// una de nova del primer mòbil, sí
	if err := put("d", "mobil-1", 3000, 9.5); err != nil || salt() != 9.5 {
		t.Fatal(err, salt())
	}
	// sense id de mòbil (una versió d'abans): com fins ara
	if err := put("e", "", 0, 7); err != nil || salt() != 7 {
		t.Fatal(err, salt())
	}
	// per HTTP: «ok» sense posar-la
	dir := t.TempDir()
	path := filepath.Join(dir, "notesgim-dades.json")
	_ = os.WriteFile(path, []byte(sample), 0o644)
	s, err := newStore(path)
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(s.routes(0))
	defer srv.Close()
	post := func(op string, made, v float64) (int, map[string]any) {
		b, _ := json.Marshal(map[string]any{"pin": "1234", "compId": "k1", "entryId": "e2", "appId": "salt", "i": 0, "value": v, "op": op, "dev": "mobil-1", "made": made})
		r, err := http.Post(srv.URL+"/api/score", "application/json", bytes.NewReader(b))
		if err != nil {
			t.Fatal(err)
		}
		defer r.Body.Close()
		var j map[string]any
		_ = json.NewDecoder(r.Body).Decode(&j)
		return r.StatusCode, j
	}
	if code, _ := post("h-new", 2000, 9); code != 200 {
		t.Fatal(code)
	}
	if code, j := post("h-old", 1000, 7.5); code != 200 || j["ok"] != true || j["older"] != true {
		t.Fatalf("la vella: %d %v", code, j)
	}
	got, _ := os.ReadFile(path)
	if bytes.Contains(got, []byte("h-old")) || !bytes.Contains(got, []byte("h-new")) {
		t.Fatalf("al fitxer hi ha d'haver la correcció: %s", got)
	}
}

// sisena revisió: quan la taula no accepta una nota, el programa diu per què amb un codi (el mòbil ho diu amb la gimnasta o
// el gimnasta i la nota), i el text, en majúscula i sense dir «gimnasta» (pot ser un noi)
func TestTutorRefusalsHaveCodes(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "notesgim-dades.json")
	db := parse(t, sample)
	c := obj(arr(db["competitions"])[0])
	obj(arr(c["entries"])[1])["status"] = "np"
	b, _ := json.Marshal(db)
	_ = os.WriteFile(path, b, 0o644)
	s, err := newStore(path)
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(s.routes(0))
	defer srv.Close()
	post := func(entry, app string) (int, string, string) {
		b, _ := json.Marshal(map[string]any{"pin": "1234", "compId": "k1", "entryId": entry, "appId": app, "i": 0, "value": 8})
		r, err := http.Post(srv.URL+"/api/score", "application/json", bytes.NewReader(b))
		if err != nil {
			t.Fatal(err)
		}
		defer r.Body.Close()
		var j struct{ Error, Code string }
		_ = json.NewDecoder(r.Body).Decode(&j)
		return r.StatusCode, j.Code, j.Error
	}
	for _, c := range []struct {
		entry, app, code string
		status           int
	}{
		{"e2", "salt", "np", 403}, {"nobody", "salt", "gone", 403}, {"e1", "salt", "locked", 409}, {"e1", "mini", "app", 403},
	} {
		st, code, msg := post(c.entry, c.app)
		if st != c.status || code != c.code || msg == "" || strings.ContainsAny(msg[:1], "abcdefghijklmnopqrstuvwxyz") || strings.Contains(msg, "'") || strings.Contains(msg, "gimnasta") {
			t.Fatalf("%s/%s: %d %q %q", c.entry, c.app, st, code, msg)
		}
	}
}

// sisena revisió: el programa diu a les tutores amb quines altres adreces s'hi ha arribat (l'ordinador ha canviat de Wi-Fi:
// les notes de la pàgina de l'adreça d'abans només són en aquella pàgina)
func TestTutorHostsReported(t *testing.T) {
	clock := int64(1_000_000)
	defer func(f func() int64) { nowMs = f }(nowMs)
	nowMs = func() int64 { clock += 1000; return clock }
	s := &store{}
	req := func(host, remote string) *http.Request {
		r := httptest.NewRequest(http.MethodGet, "http://"+host+"/api/tutor", nil)
		r.Host, r.RemoteAddr = host, remote
		return r
	}
	if got := s.sawHostLocked(req("192.168.1.20:8765", "192.168.1.40:5000")); len(got) != 0 {
		t.Fatalf("la primera adreça: %v", got)
	}
	if got := s.sawHostLocked(req("127.0.0.1:8765", "127.0.0.1:5000")); len(got) != 0 {
		t.Fatalf("la de la taula no compta: %v", got)
	}
	if got := s.sawHostLocked(req("10.0.0.5:8765", "10.0.0.7:5000")); len(got) != 1 || got[0] != "192.168.1.20:8765" {
		t.Fatalf("l'adreça d'abans: %v", got)
	}
	// la pàgina de l'adreça d'abans hi torna a arribar (l'ordinador torna a la Wi-Fi d'abans): per a ella, la nova no és «d'abans»
	if got := s.sawHostLocked(req("192.168.1.20:8765", "192.168.1.40:5000")); len(got) != 0 {
		t.Fatalf("l'adreça nova no és d'abans: %v", got)
	}
	if got := s.sawHostLocked(req("10.0.0.5:8765", "10.0.0.7:5000")); len(got) != 0 {
		t.Fatalf("dues adreces que es fan servir alhora: %v", got)
	}
}
