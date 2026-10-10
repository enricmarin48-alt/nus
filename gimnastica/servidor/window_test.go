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

// una finestra en pausa pregunta (t=0) i el programa contesta de seguida, encara que no hi hagi res de nou: el navegador
// només obre 6 connexions alhora amb el programa, i amb moltes finestres obertes la que treballa ha de poder desar i
// les altres, «Treballa en aquesta finestra». La que treballa sí que espera (fins que hi ha res de nou)
func TestPausedWindowWaitIsShort(t *testing.T) {
	wt := newWinTest(t)
	_, a := wt.claim("A", false)
	start := time.Now()
	m := wt.waitShort("B", ver(a))
	if time.Since(start) > time.Second || m["active"] != false || m["free"] != false || m["db"] != nil {
		t.Fatalf("t=0: %v (%v)", m, time.Since(start))
	}
	got := make(chan map[string]any, 1)
	go func() { got <- wt.wait("A", ver(a), true) }()
	select {
	case m := <-got:
		t.Fatalf("l'activa no havia de tenir resposta encara: %v", m)
	case <-time.After(300 * time.Millisecond):
	}
	if code, r := wt.put("A", renamed(obj(a["db"]), "Anna nova"), rev(a)); code != 200 {
		t.Fatalf("PUT: %d %v", code, r)
	}
	select {
	case m := <-got:
		if m["db"] == nil || m["active"] != true {
			t.Fatalf("l'activa: %v", m)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("l'activa no se n'assabenta")
	}
	if m := wt.waitShort("B", ver(a)); m["db"] == nil {
		t.Fatalf("la de la pausa veu les dades noves: %v", m)
	}
}

func (wt *winTest) waitShort(win string, since int64) map[string]any {
	wt.t.Helper()
	_, m := wt.call(http.MethodGet, "/api/wait?since="+itoa(since)+"&w="+win+"&t=0", nil)
	return m
}

func stamped(db map[string]any, name, stamp string) map[string]any {
	c := renamed(db, name)
	if obj(c["meta"]) == nil {
		c["meta"] = map[string]any{}
	}
	obj(c["meta"])["updated"] = stamp
	return c
}

// la finestra activa es tanca just després d'un canvi que encara s'està enviant (api/release amb stamp abans que arribi
// el PUT): continua sent l'activa fins que arriba (cap altra no la pot agafar, i el canvi no es perd) i llavors es deixa
// de seguida (no al cap de 30 s)
func TestReleaseWaitsForLastChange(t *testing.T) {
	wt := newWinTest(t)
	_, a := wt.claim("A", false)
	const st = "2027-01-22T10:00:00.000Z"
	wt.call(http.MethodPost, "/api/release", map[string]any{"window": "A", "stamp": st})
	if m := wt.waitShort("B", 0); m["free"] != false {
		t.Fatalf("encara és d'A (el canvi no ha arribat): %v", m)
	}
	if code, _ := wt.claim("B", true); code != 409 {
		t.Fatalf("B ifFree abans que arribi el canvi d'A: %d", code)
	}
	if code, r := wt.put("A", stamped(obj(a["db"]), "Anna última", st), rev(a)); code != 200 {
		t.Fatalf("l'últim canvi d'A: %d %v", code, r)
	}
	if !fileHas(t, wt.s, "Anna última") {
		t.Fatal("l'últim canvi d'A s'ha de desar")
	}
	if m := wt.waitShort("B", 0); m["free"] != true {
		t.Fatalf("ara ja és lliure: %v", m)
	}
	if code, r := wt.claim("B", true); code != 200 || r["active"] != true {
		t.Fatalf("B: %d %v", code, r)
	}
	// (i si el canvi ja havia arribat, es deixa de seguida)
	_, b := wt.claim("B", false)
	db := stamped(obj(b["db"]), "Anna de B", "2027-01-22T10:05:00.000Z")
	if code, r := wt.put("B", db, rev(b)); code != 200 {
		t.Fatalf("B desa: %d %v", code, r)
	}
	wt.call(http.MethodPost, "/api/release", map[string]any{"window": "B", "stamp": "2027-01-22T10:05:00.000Z"})
	if m := wt.waitShort("C", 0); m["free"] != true {
		t.Fatalf("B ja ho havia enviat tot: lliure de seguida: %v", m)
	}
}

// si l'últim canvi no arriba mai (la finestra s'ha tancat abans d'enviar-lo), es deixa al cap de releaseWait; i si
// arriba però no es pot desar (409), també de seguida
func TestReleaseWithoutLastChange(t *testing.T) {
	wt := newWinTest(t)
	_, a := wt.claim("A", false)
	wt.call(http.MethodPost, "/api/release", map[string]any{"window": "A", "stamp": "mai"})
	if m := wt.waitShort("B", 0); m["free"] != false {
		t.Fatalf("encara és d'A: %v", m)
	}
	wt.later(releaseWait + 1)
	if m := wt.waitShort("B", 0); m["free"] != true {
		t.Fatalf("al cap de releaseWait, lliure: %v", m)
	}
	// (si al final arriba, es desa, però A no torna a ser l'activa: ja no hi és)
	if code, r := wt.put("A", stamped(obj(a["db"]), "Anna tard", "mai"), rev(a)); code != 200 {
		t.Fatalf("el canvi d'A que arriba tard: %d %v", code, r)
	}
	if !fileHas(t, wt.s, "Anna tard") {
		t.Fatal("el canvi d'A que arriba tard s'ha de desar")
	}
	if m := wt.waitShort("B", 0); m["free"] != true {
		t.Fatalf("A no torna a ser l'activa: %v", m)
	}
	_, b := wt.claim("B", false)
	// (i un que arribés encara més tard, amb B treballant, no s'hi escriu)
	if code, _ := wt.put("A", stamped(obj(a["db"]), "Anna massa tard", "mai2"), rev(b)); code != 423 {
		t.Fatalf("amb B activa: %d", code)
	}
	wt.call(http.MethodPost, "/api/release", map[string]any{"window": "B", "stamp": "tampoc"})
	if code, _ := wt.put("B", stamped(obj(b["db"]), "Anna", "tampoc"), rev(b)-1); code != 409 {
		t.Fatalf("PUT amb un dataRev vell: %d", code)
	}
	if m := wt.waitShort("C", 0); m["free"] != true {
		t.Fatalf("el canvi de B no es pot desar: lliure de seguida: %v", m)
	}
	_ = a
}

// la finestra activa es tanca amb dos canvis seguits: el primer encara s'està enviant i el segon surt en tancar-se (after:
// l'hora del primer). Arribin en l'ordre que arribin, el fitxer es queda amb el segon (que també té el primer)
func TestLastChangeAfterOneInFlight(t *testing.T) {
	for _, order := range []string{"1-2", "2-1"} {
		wt := newWinTest(t)
		_, a := wt.claim("A", false)
		const s1, s2 = "2027-01-22T10:00:00.000Z", "2027-01-22T10:00:00.300Z"
		one := map[string]any{"db": stamped(obj(a["db"]), "Anna primer", s1), "base": rev(a), "window": "A"}
		two := map[string]any{"db": stamped(obj(a["db"]), "Anna segon", s2), "base": rev(a), "window": "A", "after": s1}
		wt.call(http.MethodPost, "/api/release", map[string]any{"window": "A", "stamp": s2})
		first, second := one, two
		if order == "2-1" {
			first, second = two, one
		}
		c1, _ := wt.call(http.MethodPut, "/api/db", first)
		c2, _ := wt.call(http.MethodPut, "/api/db", second)
		if order == "1-2" && (c1 != 200 || c2 != 200) || order == "2-1" && (c1 != 200 || c2 == 200) {
			t.Fatalf("%s: %d %d", order, c1, c2)
		}
		if !fileHas(t, wt.s, "Anna segon") || fileHas(t, wt.s, "Anna primer") {
			t.Fatalf("%s: el fitxer s'ha de quedar amb el segon canvi", order)
		}
		if m := wt.waitShort("B", 0); m["free"] != true {
			t.Fatalf("%s: un cop arribat l'últim canvi, lliure: %v", order, m)
		}
		// (after no serveix per escriure a sobre del que ha desat una altra finestra)
		_, b := wt.claim("B", false)
		if code, _ := wt.put("B", stamped(obj(b["db"]), "Anna de B", "2027-01-22T11:00:00.000Z"), rev(b)); code != 200 {
			t.Fatalf("%s: B: %d", order, code)
		}
		if code, _ := wt.call(http.MethodPut, "/api/db", map[string]any{"db": stamped(obj(b["db"]), "Anna vella", "2027-01-22T11:00:01.000Z"), "base": rev(b), "window": "B", "after": s2}); code != 409 {
			t.Fatalf("%s: after d'unes dades que ja no hi són: %d", order, code)
		}
	}
}

// el programa s'acaba d'engegar i la finestra que hi treballava es tanca: les altres continuen de seguida (startGrace
// només és perquè la que treballava, si encara hi és, la torni a agafar abans que cap altra)
func TestReleaseRightAfterStart(t *testing.T) {
	wt := newWinTest(t)
	wt.s.started = nowMs()
	wt.claim("A", false)
	wt.call(http.MethodPost, "/api/release", map[string]any{"window": "A"})
	if m := wt.waitShort("B", 0); m["free"] != true {
		t.Fatalf("lliure de seguida: %v", m)
	}
}

// «Tanca NotesGim» en una finestra: les que són en pausa ho saben (closing), i no diuen que se'n fa servir una altra
func TestQuitTellsPausedWindows(t *testing.T) {
	wt := newWinTest(t)
	wt.claim("A", false)
	if m := wt.waitShort("B", 0); m["closing"] != nil {
		t.Fatalf("encara no: %v", m)
	}
	if code, _ := wt.call(http.MethodPost, "/api/quit", map[string]any{}); code != 200 {
		t.Fatalf("api/quit: %d", code)
	}
	if m := wt.waitShort("B", 0); m["closing"] != true {
		t.Fatalf("vull closing: %v", m)
	}
}

func mustJSON(v any) []byte { b, _ := json.Marshal(v); return b }
