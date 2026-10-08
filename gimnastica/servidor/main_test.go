package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
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
