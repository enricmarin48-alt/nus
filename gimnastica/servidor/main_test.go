package main

import (
	"encoding/json"
	"errors"
	"testing"
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
