package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// només una finestra de la taula pot canviar les dades alhora (api/claim, api/wait, api/release, PUT /api/db → 423)

type winTest struct {
	t   *testing.T
	s   *store
	srv *httptest.Server
	now atomic.Int64 // rellotge de les proves (ms)
}

func newWinTest(t *testing.T) *winTest {
	t.Helper()
	path := filepath.Join(t.TempDir(), "notesgim-dades.json")
	if err := os.WriteFile(path, []byte(sample), 0o644); err != nil {
		t.Fatal(err)
	}
	wt := &winTest{t: t}
	wt.now.Store(1_000_000_000)
	old := nowMs
	nowMs = func() int64 { return wt.now.Load() }
	t.Cleanup(func() { nowMs = old })
	s, err := newStore(path)
	if err != nil {
		t.Fatal(err)
	}
	wt.s = s
	wt.later(startGrace + 1) // (passat el temps d'engegar)
	wt.srv = httptest.NewServer(s.routes(0))
	t.Cleanup(wt.srv.Close)
	return wt
}

func (wt *winTest) later(ms int64) { wt.now.Add(ms) }

func (wt *winTest) call(method, path string, body any) (int, map[string]any) {
	wt.t.Helper()
	var rd *bytes.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	} else {
		rd = bytes.NewReader(nil)
	}
	req, _ := http.NewRequest(method, wt.srv.URL+path, rd)
	r, err := http.DefaultClient.Do(req)
	if err != nil {
		wt.t.Fatal(err)
	}
	defer r.Body.Close()
	var m map[string]any
	_ = json.NewDecoder(r.Body).Decode(&m)
	return r.StatusCode, m
}

func (wt *winTest) claim(win string, ifFree bool) (int, map[string]any) {
	return wt.call(http.MethodPost, "/api/claim", map[string]any{"window": win, "ifFree": ifFree})
}

func (wt *winTest) put(win string, db map[string]any, base int64) (int, map[string]any) {
	return wt.call(http.MethodPut, "/api/db", map[string]any{"db": db, "base": base, "window": win})
}

func (wt *winTest) wait(win string, since int64, on bool) map[string]any {
	q := "/api/wait?since=" + itoa(since) + "&w=" + win
	if on {
		q += "&on=1"
	}
	_, m := wt.call(http.MethodGet, q, nil)
	return m
}

func itoa(n int64) string { b, _ := json.Marshal(n); return string(b) }

func rev(m map[string]any) int64 { return int64(num(m["dataRev"])) }
func ver(m map[string]any) int64 { return int64(num(m["version"])) }

func renamed(db map[string]any, name string) map[string]any {
	c := deepCopy(db).(map[string]any)
	obj(arr(c["gymnasts"])[0])["name"] = name
	return c
}

func fileHas(t *testing.T, s *store, txt string) bool {
	t.Helper()
	b, _ := os.ReadFile(s.path)
	return strings.Contains(string(b), txt)
}

// la finestra que s'obre passa a ser l'activa; la d'abans ja no pot desar (423, amb les dades del programa per
// mostrar-les) i, en preguntar (api/wait), sap que és en pausa
func TestOnlyActiveWindowWrites(t *testing.T) {
	wt := newWinTest(t)
	code, a := wt.claim("A", false)
	if code != 200 || a["active"] != true || a["db"] == nil {
		t.Fatalf("A: %d %v", code, a)
	}
	db := obj(a["db"])
	code, r := wt.put("A", renamed(db, "Anna A"), rev(a))
	if code != 200 {
		t.Fatalf("PUT de l'activa: %d %v", code, r)
	}
	// (A no espera res ara mateix i fa estona que no se'n sap res: B la té de seguida)
	wt.later(recentMs + 1)
	code, b := wt.claim("B", false)
	if code != 200 || !strings.Contains(string(mustJSON(b["db"])), "Anna A") {
		t.Fatalf("B: %d %v", code, b)
	}
	// A desa amb el dataRev bo: igualment no s'hi escriu
	code, r = wt.put("A", renamed(db, "Anna vella"), rev(b))
	if code != 423 || r["paused"] != true || r["db"] == nil || r["error"] != pausedMsg {
		t.Fatalf("PUT de la finestra en pausa: vull 423 amb les dades, tinc %d %v", code, r)
	}
	if fileHas(t, wt.s, "Anna vella") || !fileHas(t, wt.s, "Anna A") {
		t.Fatal("la finestra en pausa ha escrit al fitxer")
	}
	// A pregunta com si fos l'activa: la resposta és immediata i diu que no ho és
	start := time.Now()
	m := wt.wait("A", ver(b), true)
	if m["active"] != false || m["free"] != false || time.Since(start) > 2*time.Second {
		t.Fatalf("api/wait de la finestra en pausa: %v (%v)", m, time.Since(start))
	}
	// B sí que hi pot escriure
	if code, r = wt.put("B", renamed(obj(b["db"]), "Anna B"), rev(b)); code != 200 {
		t.Fatalf("PUT de B: %d %v", code, r)
	}
	// i una finestra sense id (una pàgina d'abans) tampoc no hi escriu mentre B hi és
	if code, _ = wt.call(http.MethodPut, "/api/db", map[string]any{"db": renamed(db, "Anna sense id"), "base": rev(r)}); code != 423 {
		t.Fatalf("PUT sense id amb una finestra activa: %d", code)
	}
}

// abans de passar-ho a una altra finestra, l'activa ho sap (yield), desa el que té (se li accepta) i la deixa: la nova
// rep les dades amb aquest canvi
func TestHandoffLetsActiveSaveFirst(t *testing.T) {
	wt := newWinTest(t)
	_, a := wt.claim("A", false)
	got := make(chan map[string]any, 1)
	go func() { got <- wt.wait("A", ver(a), true) }()
	time.Sleep(100 * time.Millisecond)
	claimed := make(chan map[string]any, 1)
	go func() { _, b := wt.claim("B", false); claimed <- b }()
	var y map[string]any
	select {
	case y = <-got:
	case <-time.After(2 * time.Second):
		t.Fatal("l'activa no se n'assabenta")
	}
	if y["yield"] != true || y["active"] != true {
		t.Fatalf("vull yield: %v", y)
	}
	select {
	case <-claimed:
		t.Fatal("B no ha d'agafar-la abans que A hagi desat")
	default:
	}
	if code, r := wt.put("A", renamed(obj(a["db"]), "Anna desada abans de deixar-la"), rev(a)); code != 200 {
		t.Fatalf("el darrer canvi de l'activa: %d %v", code, r)
	}
	wt.call(http.MethodPost, "/api/release", map[string]any{"window": "A"})
	// (en deixar-la, passa directament a B: cap altra finestra no la pot agafar entremig)
	if code, _ := wt.claim("C", true); code != 409 {
		t.Fatalf("C ifFree just quan A la deixa per a B: %d", code)
	}
	var b map[string]any
	select {
	case b = <-claimed:
	case <-time.After(2 * time.Second):
		t.Fatal("B no la té")
	}
	if b["active"] != true || !strings.Contains(string(mustJSON(b["db"])), "Anna desada abans de deixar-la") {
		t.Fatalf("B ha de tenir el canvi d'A: %v", b)
	}
	if m := wt.wait("A", ver(y), false); m["active"] != false {
		t.Fatalf("A ara és en pausa: %v", m)
	}
}

// si l'activa no respon (tancada, imprimint…), al cap d'una estona es passa igualment, i el que envia després no s'hi escriu
func TestHandoffTimeout(t *testing.T) {
	wt := newWinTest(t)
	old := handoffMax
	handoffMax = 300 * time.Millisecond
	t.Cleanup(func() { handoffMax = old })
	_, a := wt.claim("A", false)
	go wt.wait("A", ver(a), true) // (A espera canvis però després no fa res)
	time.Sleep(100 * time.Millisecond)
	start := time.Now()
	code, b := wt.claim("B", false)
	if code != 200 || time.Since(start) < 250*time.Millisecond {
		t.Fatalf("B: %d (%v)", code, time.Since(start))
	}
	if code, _ := wt.put("A", renamed(obj(a["db"]), "Anna massa tard"), rev(b)); code != 423 {
		t.Fatalf("A massa tard: %d", code)
	}
	if fileHas(t, wt.s, "Anna massa tard") {
		t.Fatal("no s'hi havia d'escriure")
	}
}

// la finestra activa es tanca (api/release): les que són en pausa ho saben de seguida (free) i la primera que ho vol
// la té (ifFree; la segona, no)
func TestReleaseFreesForPausedWindow(t *testing.T) {
	wt := newWinTest(t)
	_, a := wt.claim("A", false)
	wt.later(recentMs + 1)
	_, b := wt.claim("B", false)
	got := make(chan map[string]any, 1)
	go func() { got <- wt.wait("A", ver(b), false) }()
	time.Sleep(100 * time.Millisecond)
	if code, _ := wt.claim("C", true); code != 409 {
		t.Fatalf("ifFree amb B activa: %d", code)
	}
	wt.call(http.MethodPost, "/api/release", map[string]any{"window": "B"})
	var m map[string]any
	select {
	case m = <-got:
	case <-time.After(2 * time.Second):
		t.Fatal("A no se n'assabenta")
	}
	if m["free"] != true || m["active"] != false {
		t.Fatalf("vull free: %v", m)
	}
	if code, r := wt.claim("A", true); code != 200 || r["active"] != true {
		t.Fatalf("A ifFree: %d %v", code, r)
	}
	if code, _ := wt.claim("C", true); code != 409 {
		t.Fatalf("C ja no la té: %d", code)
	}
	_ = a
}

// la finestra activa fa estona que no hi és (s'ha penjat, sense release): es deixa lliure i la primera que desa (o la
// demana) la té. Mentre imprimeix (keepalive), no
func TestStaleActiveWindowExpires(t *testing.T) {
	wt := newWinTest(t)
	_, a := wt.claim("A", false)
	wt.later(recentMs + 1)
	_, b := wt.claim("B", false)
	// B imprimeix: tot i que no se'n sap res en molta estona, continua sent l'activa
	wt.call(http.MethodPost, "/api/keepalive", map[string]any{"ms": 3600 * 1000, "window": "B"})
	wt.later(activeTTL * 10)
	wt.s.mu.Lock()
	expired := wt.s.expireActiveLocked(nowMs())
	wt.s.mu.Unlock()
	if expired {
		t.Fatal("mentre imprimeix no deixa de ser l'activa")
	}
	if code, _ := wt.put("A", renamed(obj(a["db"]), "Anna A"), rev(b)); code != 423 {
		t.Fatalf("A mentre B imprimeix: %d", code)
	}
	// B ha acabat d'imprimir i ja no hi és
	wt.call(http.MethodPost, "/api/keepalive", map[string]any{"ms": 0, "window": "B"})
	wt.later(activeTTL + 1)
	wt.s.mu.Lock()
	expired = wt.s.expireActiveLocked(nowMs())
	wt.s.mu.Unlock()
	if !expired {
		t.Fatal("B ja no hi és: s'havia de deixar lliure")
	}
	if m := wt.wait("A", 0, false); m["free"] != true {
		t.Fatalf("A ha de saber que és lliure: %v", m)
	}
	// A desa: ara és l'activa
	if code, r := wt.put("A", renamed(obj(a["db"]), "Anna A"), rev(b)); code != 200 {
		t.Fatalf("A, sense cap altra finestra: %d %v", code, r)
	}
	if code, _ := wt.claim("C", true); code != 409 {
		t.Fatal("ara A és l'activa")
	}
}

// el programa es torna a obrir amb les finestres obertes: la que era l'activa (on=1) la torna a agafar; una que era en
// pausa no se'n pot quedar abans (startGrace)
func TestRestartKeepsActiveWindow(t *testing.T) {
	wt := newWinTest(t)
	wt.s.started = nowMs() // (s'acaba d'engegar)
	if m := wt.wait("B", 0, false); m["free"] != false {
		t.Fatalf("en engegar, encara no és lliure per a una en pausa: %v", m)
	}
	if code, _ := wt.claim("B", true); code != 409 {
		t.Fatalf("B ifFree en engegar: %d", code)
	}
	if m := wt.wait("A", 0, true); m["active"] != true {
		t.Fatalf("A torna a ser l'activa: %v", m)
	}
	wt.later(startGrace + 1)
	if m := wt.wait("B", 0, false); m["free"] != false || m["active"] != false {
		t.Fatalf("B continua en pausa: %v", m)
	}
}

func mustJSON(v any) []byte { b, _ := json.Marshal(v); return b }
