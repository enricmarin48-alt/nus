// NotesGim servidor: fa que les tutores puguin entrar les notes des del mòbil SENSE INTERNET.
//
// S'executa a l'ordinador de la taula. Serveix l'app (index.html, que va dins del programa) per la
// xarxa Wi-Fi local i guarda les dades en un fitxer al costat del programa (notesgim-dades.json).
//
//   - Des del mateix ordinador (http://localhost:PORT) s'obre l'app sencera, com sempre.
//   - Des d'un altre aparell de la mateixa Wi-Fi (http://IP:PORT) s'obre el mode tutora: amb el codi
//     (PIN) de la competició, la tutora tria el seu aparell i entra les notes.
//
// Cada intent de nota porta l'hora en què s'ha escrit (camp "at"). Quan hi ha dues versions de la
// mateixa nota (la de l'ordinador i la d'una tutora) guanya la més recent, i així no es perd res si
// algú perd la connexió una estona. La mateixa regla és a Engine.mergeScores (index.html).
package main

import (
	"embed"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"math"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

//go:embed web/index.html
var webFS embed.FS

const appVersion = "1.0"

/* ═══════════════════════════════════════════ dades */

type store struct {
	mu      sync.Mutex
	db      map[string]any
	version int64
	path    string
	backups string
	lastBak time.Time
	waiters []chan struct{}
}

func newStore(path string) (*store, error) {
	s := &store{path: path, backups: filepath.Join(filepath.Dir(path), "copies-notesgim"), version: time.Now().UnixMilli()}
	b, err := os.ReadFile(path)
	switch {
	case errors.Is(err, os.ErrNotExist):
		s.db = map[string]any{}
	case err != nil:
		return nil, err
	default:
		if err := json.Unmarshal(b, &s.db); err != nil {
			return nil, fmt.Errorf("el fitxer %s no és un fitxer de dades de NotesGim: %w", path, err)
		}
		if s.db == nil {
			s.db = map[string]any{}
		}
	}
	return s, nil
}

// desa de manera segura: primer a un fitxer temporal i després el reanomena (mai queda a mitges)
func (s *store) saveLocked() error {
	b, err := json.MarshalIndent(s.db, "", " ")
	if err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return err
	}
	if err := os.Rename(tmp, s.path); err != nil {
		return err
	}
	// una còpia de seguretat cada 10 minuts, i se'n guarden les 60 últimes
	if time.Since(s.lastBak) > 10*time.Minute {
		s.lastBak = time.Now()
		if err := os.MkdirAll(s.backups, 0o755); err == nil {
			name := filepath.Join(s.backups, "notesgim-"+time.Now().Format("2006-01-02_1504")+".json")
			_ = os.WriteFile(name, b, 0o644)
			s.pruneBackups(60)
		}
	}
	return nil
}

func (s *store) pruneBackups(keep int) {
	entries, err := os.ReadDir(s.backups)
	if err != nil {
		return
	}
	var names []string
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), "notesgim-") && strings.HasSuffix(e.Name(), ".json") {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)
	for len(names) > keep {
		_ = os.Remove(filepath.Join(s.backups, names[0]))
		names = names[1:]
	}
}

// avisa tothom qui espera canvis (long polling)
func (s *store) bumpLocked() {
	s.version++
	for _, w := range s.waiters {
		close(w)
	}
	s.waiters = nil
}

// espera fins que la versió sigui diferent de since (o fins al temps màxim)
func (s *store) wait(since int64, d time.Duration) bool {
	s.mu.Lock()
	if s.version != since {
		s.mu.Unlock()
		return true
	}
	ch := make(chan struct{})
	s.waiters = append(s.waiters, ch)
	s.mu.Unlock()
	select {
	case <-ch:
		return true
	case <-time.After(d):
		return false
	}
}

/* ═══════════════════════════════════════════ JSON genèric */

func arr(v any) []any          { a, _ := v.([]any); return a }
func obj(v any) map[string]any { m, _ := v.(map[string]any); return m }
func str(v any) string         { s, _ := v.(string); return s }
func num(v any) float64        { f, _ := v.(float64); return f }
func truthy(v any) bool {
	switch x := v.(type) {
	case bool:
		return x
	case string:
		return x != ""
	case float64:
		return x != 0
	}
	return v != nil
}

func findByID(list []any, id string) map[string]any {
	for _, x := range list {
		if m := obj(x); m != nil && str(m["id"]) == id {
			return m
		}
	}
	return nil
}

func deepCopy(v any) any {
	b, _ := json.Marshal(v)
	var out any
	_ = json.Unmarshal(b, &out)
	return out
}

// mergeScores: a base hi posa, de cada intent de nota, la versió d'other si és més recent.
// Retorna quants intents s'han agafat d'other. (Igual que Engine.mergeScores a index.html.)
func mergeScores(base, other map[string]any) int {
	taken := 0
	for _, c := range arr(base["competitions"]) {
		cm := obj(c)
		oc := findByID(arr(other["competitions"]), str(cm["id"]))
		if oc == nil {
			continue
		}
		for _, e := range arr(cm["entries"]) {
			em := obj(e)
			oe := findByID(arr(oc["entries"]), str(em["id"]))
			if oe == nil || obj(oe["scores"]) == nil {
				continue
			}
			scores := obj(em["scores"])
			if scores == nil {
				scores = map[string]any{}
				em["scores"] = scores
			}
			for appID, oa := range obj(oe["scores"]) {
				olist := arr(oa)
				list := arr(scores[appID])
				for i, x := range olist {
					xm := obj(x)
					if xm == nil {
						continue
					}
					var ym map[string]any
					if i < len(list) {
						ym = obj(list[i])
					}
					if num(xm["at"]) > num(ym["at"]) {
						for len(list) <= i {
							list = append(list, map[string]any{})
						}
						list[i] = deepCopy(xm)
						taken++
					}
				}
				if len(list) > 0 {
					scores[appID] = list
				}
			}
		}
	}
	return taken
}

// el que és cada aparell per a noies (F) o nois (M): "total", "apart" o "off"
func appMode(app map[string]any, gender string) string {
	if modes := obj(app["modes"]); modes != nil {
		if gender != "M" {
			gender = "F"
		}
		if m := str(modes[gender]); m != "" {
			return m
		}
		return "off"
	}
	if en, ok := app["enabled"].(bool); ok && !en {
		return "off"
	}
	if t, ok := app["inTotal"].(bool); ok && !t {
		return "apart"
	}
	return "total"
}

func genderOf(m map[string]any) string {
	if str(m["gender"]) == "M" {
		return "M"
	}
	return "F"
}

// competicions on les tutores poden entrar notes amb aquest codi
func tutorComps(db map[string]any, pin string) []map[string]any {
	var out []map[string]any
	if strings.TrimSpace(pin) == "" {
		return out
	}
	for _, c := range arr(db["competitions"]) {
		cm := obj(c)
		if cm != nil && truthy(cm["tutorsOn"]) && !truthy(cm["locked"]) && str(cm["tutorPin"]) == strings.TrimSpace(pin) {
			out = append(out, cm)
		}
	}
	return out
}

// el que veu una tutora: només les competicions del seu codi i el mínim per entrar notes
func tutorData(db map[string]any, pin string) []any {
	gyms := map[string]map[string]any{}
	for _, g := range arr(db["gymnasts"]) {
		if gm := obj(g); gm != nil {
			gyms[str(gm["id"])] = gm
		}
	}
	clubs := map[string]string{}
	for _, c := range arr(db["clubs"]) {
		if cm := obj(c); cm != nil {
			clubs[str(cm["id"])] = str(cm["name"])
		}
	}
	out := []any{}
	for _, cm := range tutorComps(db, pin) {
		entries := []any{}
		for _, e := range arr(cm["entries"]) {
			em := obj(e)
			if em == nil {
				continue
			}
			g := gyms[str(em["gymnastId"])]
			name := strings.TrimSpace(str(g["name"]) + " " + str(g["surname"]))
			scores := map[string]any{}
			for appID, list := range obj(em["scores"]) {
				var atts []any
				for _, a := range arr(list) {
					am := obj(a)
					atts = append(atts, map[string]any{"v": am["v"], "by": am["by"], "at": am["at"]})
				}
				scores[appID] = atts
			}
			entries = append(entries, map[string]any{
				"id": em["id"], "bib": em["bib"], "name": name, "club": clubs[str(em["clubId"])],
				"gender": genderOf(em), "category": em["category"], "level": em["level"], "status": em["status"], "scores": scores,
			})
		}
		out = append(out, map[string]any{
			"id": cm["id"], "name": cm["name"], "date": cm["date"], "scoring": cm["scoring"], "minScore": cm["minScore"],
			"maxScore": cm["maxScore"], "apparatus": cm["apparatus"], "entries": entries,
		})
	}
	return out
}

type scoreReq struct {
	Pin     string   `json:"pin"`
	CompID  string   `json:"compId"`
	EntryID string   `json:"entryId"`
	AppID   string   `json:"appId"`
	I       int      `json:"i"`
	Value   *float64 `json:"value"`
	Who     string   `json:"who"`
}

// posa la nota d'una tutora a les dades. at = ara (rellotge de l'ordinador de la taula)
func applyScore(db map[string]any, r scoreReq, at int64) error {
	var comp map[string]any
	for _, c := range tutorComps(db, r.Pin) {
		if str(c["id"]) == r.CompID {
			comp = c
		}
	}
	if comp == nil {
		return errors.New("codi incorrecte, o la competició està tancada")
	}
	entry := findByID(arr(comp["entries"]), r.EntryID)
	if entry == nil {
		return errors.New("aquesta gimnasta ja no és a la competició")
	}
	if str(entry["status"]) == "np" {
		return errors.New("aquesta gimnasta consta com a no presentada")
	}
	app := findByID(arr(comp["apparatus"]), r.AppID)
	if app == nil || appMode(app, genderOf(entry)) == "off" {
		return errors.New("aquest aparell no es fa en aquest grup")
	}
	attempts := int(num(app["attempts"]))
	if attempts < 1 {
		attempts = 1
	}
	if r.I < 0 || r.I >= attempts {
		return errors.New("intent incorrecte")
	}
	att := map[string]any{"by": "tutor", "at": float64(at)}
	if who := strings.TrimSpace(r.Who); who != "" {
		if len(who) > 40 {
			who = who[:40]
		}
		att["who"] = who
	}
	if r.Value != nil {
		v := *r.Value
		if math.IsNaN(v) || v < 0 || v > 100 {
			return errors.New("nota fora de límits")
		}
		att["v"] = math.Round(v*1000) / 1000
	}
	scores := obj(entry["scores"])
	if scores == nil {
		scores = map[string]any{}
		entry["scores"] = scores
	}
	list := arr(scores[r.AppID])
	for len(list) <= r.I {
		list = append(list, map[string]any{})
	}
	list[r.I] = att
	scores[r.AppID] = list
	return nil
}

/* ═══════════════════════════════════════════ HTTP */

func isLocal(r *http.Request) bool {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return false
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func fail(w http.ResponseWriter, code int, msg string) { writeJSON(w, code, map[string]any{"error": msg}) }

func lanURLs(port int) []string {
	var urls []string
	ifaces, _ := net.Interfaces()
	for _, ifc := range ifaces {
		if ifc.Flags&net.FlagUp == 0 || ifc.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, _ := ifc.Addrs()
		for _, a := range addrs {
			ipn, ok := a.(*net.IPNet)
			if !ok || ipn.IP.To4() == nil || ipn.IP.IsLinkLocalUnicast() {
				continue
			}
			urls = append(urls, fmt.Sprintf("http://%s:%d", ipn.IP.String(), port))
		}
	}
	sort.Strings(urls)
	return urls
}

func (s *store) routes(port int) http.Handler {
	mux := http.NewServeMux()
	index, _ := webFS.ReadFile("web/index.html")

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" && r.URL.Path != "/index.html" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		_, _ = w.Write(index)
	})

	mux.HandleFunc("/api/info", func(w http.ResponseWriter, r *http.Request) {
		role := "tutor"
		if isLocal(r) {
			role = "admin"
		}
		writeJSON(w, 200, map[string]any{"app": "notesgim", "version": appVersion, "role": role, "urls": lanURLs(port), "dataFile": s.path})
	})

	// l'app de l'ordinador de la taula (només des del mateix ordinador)
	mux.HandleFunc("/api/db", func(w http.ResponseWriter, r *http.Request) {
		if !isLocal(r) {
			fail(w, 403, "només des de l'ordinador de la taula")
			return
		}
		switch r.Method {
		case http.MethodGet:
			s.mu.Lock()
			defer s.mu.Unlock()
			writeJSON(w, 200, map[string]any{"version": s.version, "db": s.db})
		case http.MethodPut:
			var body struct {
				DB map[string]any `json:"db"`
			}
			if err := json.NewDecoder(io.LimitReader(r.Body, 50<<20)).Decode(&body); err != nil || body.DB == nil {
				fail(w, 400, "dades incorrectes")
				return
			}
			s.mu.Lock()
			defer s.mu.Unlock()
			taken := mergeScores(body.DB, s.db) // notes de tutores més noves que les que té l'ordinador
			s.db = body.DB
			s.bumpLocked()
			if err := s.saveLocked(); err != nil {
				log.Printf("ERROR desant: %v", err)
				fail(w, 500, "no s'ha pogut desar al fitxer: "+err.Error())
				return
			}
			resp := map[string]any{"version": s.version, "taken": taken}
			if taken > 0 {
				resp["db"] = s.db
			}
			writeJSON(w, 200, resp)
		default:
			fail(w, 405, "mètode no permès")
		}
	})

	mux.HandleFunc("/api/wait", func(w http.ResponseWriter, r *http.Request) {
		if !isLocal(r) {
			fail(w, 403, "només des de l'ordinador de la taula")
			return
		}
		since, _ := strconv.ParseInt(r.URL.Query().Get("since"), 10, 64)
		if !s.wait(since, 25*time.Second) {
			w.WriteHeader(204)
			return
		}
		s.mu.Lock()
		defer s.mu.Unlock()
		writeJSON(w, 200, map[string]any{"version": s.version, "db": s.db})
	})

	// tutores
	mux.HandleFunc("/api/tutor", func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		pin := q.Get("pin")
		if since := q.Get("since"); since != "" {
			n, _ := strconv.ParseInt(since, 10, 64)
			if !s.wait(n, 25*time.Second) {
				w.WriteHeader(204)
				return
			}
		}
		s.mu.Lock()
		data, version := tutorData(s.db, pin), s.version
		s.mu.Unlock()
		if len(data) == 0 {
			time.Sleep(400 * time.Millisecond) // per no deixar provar codis a tota velocitat
			fail(w, 403, "Codi incorrecte, o no hi ha cap competició oberta a les tutores.")
			return
		}
		writeJSON(w, 200, map[string]any{"version": version, "comps": data})
	})

	mux.HandleFunc("/api/score", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			fail(w, 405, "mètode no permès")
			return
		}
		var req scoreReq
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&req); err != nil {
			fail(w, 400, "dades incorrectes")
			return
		}
		s.mu.Lock()
		defer s.mu.Unlock()
		if err := applyScore(s.db, req, time.Now().UnixMilli()); err != nil {
			fail(w, 403, err.Error())
			return
		}
		s.bumpLocked()
		if err := s.saveLocked(); err != nil {
			log.Printf("ERROR desant: %v", err)
			fail(w, 500, "no s'ha pogut desar")
			return
		}
		writeJSON(w, 200, map[string]any{"ok": true, "version": s.version})
	})
	return mux
}

func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	case "darwin":
		cmd = exec.Command("open", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	_ = cmd.Start()
}

func main() {
	exe, _ := os.Executable()
	dir := filepath.Dir(exe)
	dataPath := flag.String("dades", filepath.Join(dir, "notesgim-dades.json"), "fitxer on es guarden les dades")
	portFlag := flag.Int("port", 8080, "port (si està ocupat, es prova el següent)")
	noBrowser := flag.Bool("sense-navegador", false, "no obris el navegador en arrencar")
	flag.Parse()

	s, err := newStore(*dataPath)
	if err != nil {
		log.Fatal(err)
	}

	var ln net.Listener
	port := *portFlag
	for p := port; p < port+20; p++ {
		if ln, err = net.Listen("tcp", fmt.Sprintf(":%d", p)); err == nil {
			port = p
			break
		}
	}
	if ln == nil {
		log.Fatalf("no s'ha pogut obrir cap port a partir del %d: %v", *portFlag, err)
	}

	fmt.Println("════════════════════════════════════════════════════════════")
	fmt.Println(" NotesGim servidor " + appVersion + " — funciona sense internet")
	fmt.Println("════════════════════════════════════════════════════════════")
	fmt.Printf(" Dades: %s\n\n", s.path)
	fmt.Printf(" A AQUEST ORDINADOR obre:   http://localhost:%d\n\n", port)
	urls := lanURLs(port)
	if len(urls) == 0 {
		fmt.Println(" (Aquest ordinador no està connectat a cap Wi-Fi: les tutores no hi podran entrar.)")
	} else {
		fmt.Println(" LES TUTORES (mòbil connectat a la mateixa Wi-Fi) obren:")
		for _, u := range urls {
			fmt.Println("     " + u)
		}
	}
	fmt.Println("\n Deixa aquesta finestra oberta mentre dura la competició.")
	fmt.Println(" Per aturar-lo, tanca la finestra o prem Ctrl+C.")
	fmt.Println("════════════════════════════════════════════════════════════")

	if !*noBrowser {
		go func() { time.Sleep(600 * time.Millisecond); openBrowser(fmt.Sprintf("http://localhost:%d", port)) }()
	}
	srv := &http.Server{Handler: s.routes(port), ReadHeaderTimeout: 10 * time.Second}
	log.Fatal(srv.Serve(ln))
}
