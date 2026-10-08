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
	"io/fs"
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
	"sync/atomic"
	"time"
)

// l'app (web/index.html, que build.sh hi copia de ../index.html) i les icones (web/icons)
//
//go:embed web
var webFS embed.FS

// la publicació automàtica hi posa la data i el commit (-ldflags "-X main.appVersion=…")
var appVersion = "1.1"

/* ═══════════════════════════════════════════ dades */

type store struct {
	lastAdmin atomic.Int64 // última vegada que la finestra de l'app (a aquest ordinador) ha dit alguna cosa
	lastTutor atomic.Int64 // última vegada que una tutora ha entrat o enviat notes
	holdUntil atomic.Int64 // fins quan no s'ha de tancar sol (p. ex. mentre la finestra imprimeix)
	failMu    sync.Mutex   // els codis de tutora equivocats s'atenen d'un en un (que no es puguin provar tots de pressa)
	backedUp  bool         // ja s'ha guardat una còpia del fitxer tal com era en obrir NotesGim
	dirty     bool         // l'últim intent de desar al fitxer ha fallat: es torna a provar sol
	saveErr   string       // per què no s'ha pogut desar (es mostra a la finestra de la taula)
	recovered string       // el fitxer de dades estava malmès i s'ha obert una còpia (què se n'ha de dir)
	dataRev   int64        // canvia cada vegada que la taula desa (no amb les notes de les tutores); < 2^53 perquè JavaScript el llegeixi exacte
	quit      chan struct{}
	quitOnce  sync.Once
	mu        sync.Mutex
	db        map[string]any
	version   int64
	path      string
	backups   string
	lastBak   time.Time
	waiters   []chan struct{}
}

func newStore(path string) (*store, error) {
	s := &store{path: path, backups: filepath.Join(filepath.Dir(path), "copies-notesgim"), version: time.Now().UnixMilli(), dataRev: time.Now().UnixMilli() * 1000, quit: make(chan struct{})}
	b, err := os.ReadFile(path)
	switch {
	case errors.Is(err, os.ErrNotExist):
		s.db = map[string]any{}
	case err != nil:
		return nil, err
	default:
		if err := json.Unmarshal(b, &s.db); err != nil {
			// malmès (p. ex. s'ha apagat l'ordinador mentre es desava): es guarda apart, tal com és, i
			// s'obre la còpia de seguretat més nova
			bad := path + ".malmes-" + time.Now().Format("2006-01-02_150405")
			if rerr := os.Rename(path, bad); rerr != nil {
				return nil, fmt.Errorf("el fitxer %s no és un fitxer de dades de NotesGim (%v).\n\nLes còpies de seguretat són a la carpeta %s", path, err, s.backups)
			}
			s.db = map[string]any{}
			if name, db := newestBackup(s.backups); db != nil {
				s.db = db
				s.dirty = true
				s.recovered = fmt.Sprintf("El fitxer de dades estava malmès (s'ha guardat apart com a %s).\n\nS'ha obert la còpia de seguretat més nova: %s. Si la finestra de NotesGim tenia dades més noves, s'hi tornen a posar soles.", filepath.Base(bad), name)
			} else {
				s.recovered = fmt.Sprintf("El fitxer de dades estava malmès (s'ha guardat apart com a %s) i no hi ha cap còpia de seguretat. Si la finestra de NotesGim tenia les dades, s'hi tornen a posar soles; si no, restaura una còpia des de Configuració.", filepath.Base(bad))
			}
		}
		if s.db == nil {
			s.db = map[string]any{}
		}
	}
	return s, nil
}

// la còpia de seguretat més nova que es pugui llegir (nom del fitxer i dades)
func newestBackup(dir string) (string, map[string]any) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return "", nil
	}
	type cand struct {
		name string
		mod  time.Time
	}
	var list []cand
	for _, e := range entries {
		if !e.IsDir() && strings.HasPrefix(e.Name(), "notesgim-") && strings.HasSuffix(e.Name(), ".json") {
			if fi, err := e.Info(); err == nil {
				list = append(list, cand{e.Name(), fi.ModTime()})
			}
		}
	}
	sort.Slice(list, func(i, j int) bool { return list[i].mod.After(list[j].mod) })
	for _, c := range list {
		b, err := os.ReadFile(filepath.Join(dir, c.name))
		if err != nil {
			continue
		}
		var db map[string]any
		if json.Unmarshal(b, &db) == nil && db != nil {
			return c.name, db
		}
	}
	return "", nil
}

// escriu un fitxer i espera que sigui al disc (si s'apaga l'ordinador just després, no queda buit)
func writeFileSync(name string, b []byte) error {
	f, err := os.Create(name)
	if err != nil {
		return err
	}
	if _, err := f.Write(b); err != nil {
		f.Close()
		return err
	}
	if err := f.Sync(); err != nil {
		f.Close()
		return err
	}
	return f.Close()
}

// abans de la primera vegada que la taula sobreescriu el fitxer, se'n guarda una còpia tal com era
// (per si era d'un altre ordinador o una còpia restaurada a mà)
func (s *store) backupOriginalLocked() {
	if s.backedUp {
		return
	}
	s.backedUp = true
	b, err := os.ReadFile(s.path)
	if err != nil || len(b) == 0 {
		return
	}
	if err := os.MkdirAll(s.backups, 0o755); err == nil {
		_ = os.WriteFile(filepath.Join(s.backups, "notesgim-"+time.Now().Format("2006-01-02_150405")+"-en-obrir.json"), b, 0o644)
		s.pruneBackups(60)
	}
}

// desa de manera segura: primer a un fitxer temporal i després el reanomena (mai queda a mitges).
// Si no es pot (disc ple, OneDrive, USB fora), es torna a provar sol cada pocs segons.
func (s *store) saveLocked() error {
	err := s.writeLocked()
	s.dirty, s.saveErr = err != nil, ""
	if err != nil {
		s.saveErr = "no s'ha pogut desar al fitxer " + s.path + ": " + err.Error()
	}
	return err
}

func (s *store) writeLocked() error {
	b, err := json.MarshalIndent(s.db, "", " ")
	if err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := writeFileSync(tmp, b); err != nil {
		return err
	}
	// a Windows, un antivirus o OneDrive poden tenir el fitxer obert un moment: es torna a provar
	var err2 error
	for i := 0; i < 10; i++ {
		if err2 = os.Rename(tmp, s.path); err2 == nil {
			break
		}
		time.Sleep(time.Duration(50*(i+1)) * time.Millisecond)
	}
	if err2 != nil {
		return err2
	}
	// una còpia de seguretat cada 10 minuts, i se'n guarden les 60 últimes
	if time.Since(s.lastBak) > 10*time.Minute {
		s.lastBak = time.Now()
		if err := os.MkdirAll(s.backups, 0o755); err == nil {
			name := filepath.Join(s.backups, "notesgim-"+time.Now().Format("2006-01-02_1504")+".json")
			_ = writeFileSync(name, b)
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

// un codi equivocat: espera 400 ms, però d'un en un per a tothom (si algú prova molts codis alhora, triga hores)
func (s *store) slowFail() {
	s.failMu.Lock()
	time.Sleep(400 * time.Millisecond)
	s.failMu.Unlock()
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

// un intent amb alguna nota
func hasMark(a map[string]any) bool {
	for _, k := range []string{"v", "d", "e", "p"} {
		if v, ok := a[k]; ok && v != nil {
			return true
		}
	}
	return false
}

// la nota l'ha posada la taula (o és d'una tutora però ja revisada): cap nota de tutora la trepitja
func guarded(a map[string]any) bool {
	return a != nil && hasMark(a) && (str(a["by"]) != "tutor" || truthy(a["ok"]))
}

// mergeScores: a base hi posa, de cada intent de nota, la versió d'other si és més recent (excepte que una
// nota de tutora no passa mai per sobre d'una de la taula o ja revisada).
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
					if num(xm["at"]) > num(ym["at"]) && !(str(xm["by"]) == "tutor" && guarded(ym)) {
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
					atts = append(atts, map[string]any{"v": am["v"], "by": am["by"], "at": am["at"], "ok": truthy(am["ok"]), "locked": guarded(am)})
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

// la taula ja ha posat (o revisat) aquesta nota: la tutora no la pot canviar (resposta 409)
var errLocked = errors.New("Aquesta nota ja l'ha posada o revisada la taula. Si cal canviar-la, digues-ho a la taula.")

// el codi ja no val (l'han canviat, han tancat la competició o han tret les tutores): resposta 401, i la tutora
// es guarda les notes per enviar-les quan torni a entrar
var errAuth = errors.New("El codi ja no val: potser l'han canviat o han tancat la competició. Demana el codi a la taula.")

// nota màxima de la competició (per defecte 20)
func maxScoreOf(comp map[string]any) float64 {
	if m := num(comp["maxScore"]); m > 0 {
		return m
	}
	return 20
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
		return errAuth
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
		if mx := maxScoreOf(comp); math.IsNaN(v) || math.IsInf(v, 0) || v < 0 || v > mx {
			return fmt.Errorf("Aquesta nota no pot ser: ha de ser entre 0 i %s.", strings.Replace(strconv.FormatFloat(mx, 'f', -1, 64), ".", ",", 1))
		}
		att["v"] = math.Round(v*1000) / 1000
	}
	scores := obj(entry["scores"])
	if scores == nil {
		scores = map[string]any{}
		entry["scores"] = scores
	}
	list := arr(scores[r.AppID])
	if r.I < len(list) && guarded(obj(list[r.I])) {
		return errLocked
	}
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

func fail(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]any{"error": msg})
}

// adreces on les tutores poden trobar aquest ordinador. Primer la de la Wi-Fi de debò (192.168.x, 10.x,
// 172.16-31.x) i al final les dels adaptadors virtuals (WSL, Hyper-V, VPN…), que des del mòbil no serveixen
func lanURLs(port int) []string {
	type cand struct {
		url  string
		rank int
	}
	virtual := func(name string) bool {
		n := strings.ToLower(name)
		for _, w := range []string{"vethernet", "wsl", "hyper-v", "virtualbox", "vboxnet", "vmware", "vmnet", "docker", "tailscale", "zerotier", "bluetooth", "utun", "npcap"} {
			if strings.Contains(n, w) {
				return true
			}
		}
		for _, p := range []string{"tap", "tun", "br-", "veth", "virbr"} {
			if strings.HasPrefix(n, p) {
				return true
			}
		}
		return false
	}
	var cs []cand
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
			ip := ipn.IP.To4()
			rank := 3
			switch {
			case ip[0] == 192 && ip[1] == 168:
				rank = 0
			case ip[0] == 10:
				rank = 1
			case ip[0] == 172 && ip[1] >= 16 && ip[1] <= 31:
				rank = 2
			}
			if virtual(ifc.Name) {
				rank += 10
			}
			cs = append(cs, cand{fmt.Sprintf("http://%s:%d", ip.String(), port), rank})
		}
	}
	sort.SliceStable(cs, func(i, j int) bool {
		return cs[i].rank < cs[j].rank || (cs[i].rank == cs[j].rank && cs[i].url < cs[j].url)
	})
	urls := []string{}
	for _, c := range cs {
		urls = append(urls, c.url)
	}
	return urls
}

// manifest per als mòbils de les tutores: «Afegeix a la pantalla d'inici» amb el nom i la icona de NotesGim
const manifestJSON = `{"id":"/","name":"NotesGim · Gimnàstica artística","short_name":"NotesGim","lang":"ca","start_url":"/","scope":"/","display":"standalone",
"background_color":"#f3f5f9","theme_color":"#6d1a33","icons":[{"src":"/icons/icon-192.png","sizes":"192x192","type":"image/png","purpose":"any"},
{"src":"/icons/icon-512.png","sizes":"512x512","type":"image/png","purpose":"any"},{"src":"/icons/maskable-512.png","sizes":"512x512","type":"image/png","purpose":"maskable"}]}`

func (s *store) routes(port int) http.Handler {
	mux := http.NewServeMux()
	index, _ := webFS.ReadFile("web/index.html")
	if web, err := fs.Sub(webFS, "web"); err == nil {
		icons := http.FileServer(http.FS(web))
		mux.HandleFunc("/icons/", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Cache-Control", "max-age=3600")
			icons.ServeHTTP(w, r)
		})
	}
	mux.HandleFunc("/manifest.webmanifest", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/manifest+json; charset=utf-8")
		w.Header().Set("Cache-Control", "max-age=3600")
		_, _ = io.WriteString(w, manifestJSON)
	})

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
			s.lastAdmin.Store(time.Now().UnixMilli())
		}
		writeJSON(w, 200, map[string]any{"app": "notesgim", "version": appVersion, "role": role, "urls": lanURLs(port), "dataFile": s.path})
	})

	// l'app de l'ordinador de la taula (només des del mateix ordinador)
	mux.HandleFunc("/api/db", func(w http.ResponseWriter, r *http.Request) {
		if !isLocal(r) {
			fail(w, 403, "només des de l'ordinador de la taula")
			return
		}
		s.lastAdmin.Store(time.Now().UnixMilli())
		switch r.Method {
		case http.MethodGet:
			s.mu.Lock()
			defer s.mu.Unlock()
			writeJSON(w, 200, map[string]any{"version": s.version, "dataRev": s.dataRev, "db": s.db, "saveErr": s.saveErr})
		case http.MethodPut:
			// base: la versió de les dades de la taula que tenia la finestra. Si no és l'actual, una altra finestra
			// (o un NotesGim d'abans) les ha canviat i no s'hi escriu a sobre: es torna el que hi ha (409).
			// replace: la finestra substitueix totes les dades (restaurar una còpia): no s'hi barregen notes.
			var body struct {
				DB      map[string]any `json:"db"`
				Base    int64          `json:"base"`
				Replace bool           `json:"replace"`
			}
			if err := json.NewDecoder(io.LimitReader(r.Body, 50<<20)).Decode(&body); err != nil || body.DB == nil {
				fail(w, 400, "dades incorrectes")
				return
			}
			s.mu.Lock()
			defer s.mu.Unlock()
			if body.Base != s.dataRev {
				writeJSON(w, 409, map[string]any{"error": "les dades han canviat des d'una altra finestra", "version": s.version, "dataRev": s.dataRev, "db": s.db})
				return
			}
			taken := 0
			if !body.Replace {
				taken = mergeScores(body.DB, s.db) // notes de tutores més noves que les que té l'ordinador
			}
			s.backupOriginalLocked()
			s.db = body.DB
			s.dataRev++
			s.bumpLocked()
			if err := s.saveLocked(); err != nil {
				// les dades ja són al programa (i es tornaran a provar de desar soles): la finestra ho ha de saber
				// per no tornar-les a enviar com si fossin d'una altra finestra
				log.Printf("ERROR desant: %v", err)
				resp := map[string]any{"error": s.saveErr, "version": s.version, "dataRev": s.dataRev, "taken": taken}
				if taken > 0 {
					resp["db"] = s.db
				}
				writeJSON(w, 500, resp)
				return
			}
			resp := map[string]any{"version": s.version, "dataRev": s.dataRev, "taken": taken}
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
		s.lastAdmin.Store(time.Now().UnixMilli())
		changed := s.wait(since, 25*time.Second)
		s.lastAdmin.Store(time.Now().UnixMilli())
		if !changed {
			w.WriteHeader(204)
			return
		}
		s.mu.Lock()
		defer s.mu.Unlock()
		writeJSON(w, 200, map[string]any{"version": s.version, "dataRev": s.dataRev, "db": s.db, "saveErr": s.saveErr})
	})

	// la finestra avisa que imprimeix (mentre la finestra d'impressió és oberta, la pàgina no pot parlar amb el
	// programa): no s'ha de tancar sol. ms=0 ho torna a deixar com sempre.
	mux.HandleFunc("/api/keepalive", func(w http.ResponseWriter, r *http.Request) {
		if !isLocal(r) || r.Method != http.MethodPost {
			fail(w, 403, "no permès")
			return
		}
		var body struct {
			Ms int64 `json:"ms"`
		}
		_ = json.NewDecoder(io.LimitReader(r.Body, 1<<10)).Decode(&body)
		now := time.Now().UnixMilli()
		s.lastAdmin.Store(now)
		s.holdUntil.Store(now + min(max(body.Ms, 0), 3*3600*1000))
		writeJSON(w, 200, map[string]any{"ok": true})
	})

	// botó «Obre la carpeta de les dades» (Configuració)
	mux.HandleFunc("/api/reveal", func(w http.ResponseWriter, r *http.Request) {
		if !isLocal(r) || r.Method != http.MethodPost {
			fail(w, 403, "no permès")
			return
		}
		if err := revealPath(s.path); err != nil {
			fail(w, 500, err.Error())
			return
		}
		writeJSON(w, 200, map[string]any{"ok": true})
	})

	// botó «Tanca NotesGim» de l'app
	mux.HandleFunc("/api/quit", func(w http.ResponseWriter, r *http.Request) {
		if !isLocal(r) || r.Method != http.MethodPost {
			fail(w, 403, "no permès")
			return
		}
		var body struct {
			Force bool `json:"force"`
		}
		_ = json.NewDecoder(io.LimitReader(r.Body, 1<<10)).Decode(&body)
		// abans de tancar, es desa; si no es pot, no es tanca (si no, es perdrien els últims canvis) excepte si
		// la finestra ho demana expressament
		s.mu.Lock()
		err := s.saveLocked()
		msg := s.saveErr
		s.mu.Unlock()
		if err != nil && !body.Force {
			fail(w, 500, msg)
			return
		}
		writeJSON(w, 200, map[string]any{"ok": true})
		s.quitOnce.Do(func() { go func() { time.Sleep(300 * time.Millisecond); close(s.quit) }() })
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
			s.slowFail()
			fail(w, 403, "Codi incorrecte, o no hi ha cap competició oberta a les tutores.")
			return
		}
		s.lastTutor.Store(time.Now().UnixMilli())
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
		err := applyScore(s.db, req, time.Now().UnixMilli())
		if errors.Is(err, errAuth) {
			s.mu.Unlock()
			s.slowFail()
			fail(w, 401, err.Error())
			return
		}
		defer s.mu.Unlock()
		if err != nil {
			code := 403
			if errors.Is(err, errLocked) {
				code = 409
			}
			fail(w, code, err.Error())
			return
		}
		s.lastTutor.Store(time.Now().UnixMilli())
		s.bumpLocked()
		// si ara no es pot escriure al fitxer, la nota ja és al programa i a la finestra de la taula (que
		// en veu l'avís): es tornarà a provar de desar sola, i la tutora no l'ha de tornar a enviar
		if err := s.saveLocked(); err != nil {
			log.Printf("ERROR desant: %v", err)
		}
		writeJSON(w, 200, map[string]any{"ok": true, "version": s.version})
	})
	return mux
}

// obre l'app en una finestra pròpia (sense barres de navegador), com un programa: Edge o Chrome en mode
// «app» amb un perfil separat. Si no n'hi ha cap, s'obre al navegador de sempre.
func openApp(url string) { openAppProc(url) }

// com openApp, però torna el procés de la finestra (nil si s'ha fet servir el navegador de sempre)
func openAppProc(url string) *exec.Cmd {
	profile := filepath.Join(os.TempDir(), "NotesGim-finestra")
	if d, err := os.UserCacheDir(); err == nil {
		profile = filepath.Join(d, "NotesGim", "finestra")
	}
	args := []string{"--app=" + url, "--user-data-dir=" + profile, "--window-size=1280,860", "--no-first-run", "--no-default-browser-check"}
	var candidates []string
	switch runtime.GOOS {
	case "windows":
		for _, env := range []string{"ProgramFiles(x86)", "ProgramFiles", "LocalAppData"} {
			if base := os.Getenv(env); base != "" {
				candidates = append(candidates,
					filepath.Join(base, "Microsoft", "Edge", "Application", "msedge.exe"),
					filepath.Join(base, "Google", "Chrome", "Application", "chrome.exe"))
			}
		}
	case "darwin":
		candidates = []string{"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
			"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
			"/Applications/Chromium.app/Contents/MacOS/Chromium"}
	default:
		for _, n := range []string{"google-chrome", "chromium", "chromium-browser", "microsoft-edge"} {
			if p, err := exec.LookPath(n); err == nil {
				candidates = append(candidates, p)
			}
		}
	}
	for _, c := range candidates {
		if _, err := os.Stat(c); err == nil {
			cmd := exec.Command(c, args...)
			if cmd.Start() == nil {
				return cmd
			}
		}
	}
	openDefault(url)
	return nil
}

// el navegador de sempre
func openDefault(url string) {
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

// hi ha un NotesGim amb aquestes dades al port p? Torna la seva adreça o ""
func instanceAt(p int, dataPath string) string {
	client := &http.Client{Timeout: 700 * time.Millisecond}
	resp, err := client.Get(fmt.Sprintf("http://127.0.0.1:%d/api/info", p))
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	var info struct {
		App      string `json:"app"`
		DataFile string `json:"dataFile"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&info)
	if info.App == "notesgim" && filepath.Clean(info.DataFile) == filepath.Clean(dataPath) {
		return fmt.Sprintf("http://localhost:%d", p)
	}
	return ""
}

// si NotesGim ja està obert (amb les mateixes dades), no se n'obre un altre: només se'n mostra la finestra
func runningInstance(port int, dataPath string) string {
	for p := port; p < port+20; p++ {
		if u := instanceAt(p, dataPath); u != "" {
			return u
		}
	}
	return ""
}

// un sol NotesGim per fitxer de dades, encara que es faci doble clic dues vegades seguides: el fitxer
// <dades>.lock diu en quin port és el que ja està obert. Torna la funció per alliberar-lo, o l'adreça de
// l'altre NotesGim si ja n'hi ha un.
func lockData(dataPath string) (release func(), port func(int), existing string) {
	lock := dataPath + ".lock"
	stale := 0
	for try := 0; try < 60; try++ {
		if f, err := os.OpenFile(lock, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o644); err == nil {
			f.Close()
			return func() { _ = os.Remove(lock) }, func(p int) { _ = os.WriteFile(lock, []byte(strconv.Itoa(p)), 0o644) }, ""
		}
		b, _ := os.ReadFile(lock)
		if p, _ := strconv.Atoi(strings.TrimSpace(string(b))); p > 0 {
			if u := instanceAt(p, dataPath); u != "" {
				return nil, nil, u
			}
			// no respon: és d'un NotesGim que es va tancar malament (es prova unes quantes vegades abans)
			if stale++; stale >= 5 {
				_ = os.Remove(lock)
				stale = 0
				continue
			}
		} else if st, err := os.Stat(lock); err == nil && time.Since(st.ModTime()) > 15*time.Second {
			_ = os.Remove(lock) // buit i vell: el NotesGim que l'havia creat no va arribar a engegar
			continue
		}
		time.Sleep(300 * time.Millisecond) // un altre NotesGim s'està engegant ara mateix
	}
	return func() {}, func(int) {}, ""
}

// on es guarden les dades: a Documents/NotesGim. Al costat del programa només si ja n'hi ha (per exemple en
// un USB), i mai en una carpeta temporal (un programa obert des d'un .zip s'executa des d'allà).
func defaultDataPath(dir string) string {
	const name = "notesgim-dades.json"
	tmp := strings.ToLower(filepath.Clean(os.TempDir()))
	inTemp := strings.HasPrefix(strings.ToLower(filepath.Clean(dir)), tmp)
	if _, err := os.Stat(filepath.Join(dir, name)); err == nil && !inTemp {
		return filepath.Join(dir, name)
	}
	writable := func(d string) bool {
		if os.MkdirAll(d, 0o755) != nil {
			return false
		}
		f, err := os.CreateTemp(d, ".notesgim-prova-*")
		if err != nil {
			return false
		}
		f.Close()
		_ = os.Remove(f.Name())
		return true
	}
	if docs := documentsDir(); docs != "" {
		if d := filepath.Join(docs, "NotesGim"); writable(d) {
			return filepath.Join(d, name)
		}
	}
	if home, err := os.UserHomeDir(); err == nil {
		if d := filepath.Join(home, "NotesGim"); writable(d) {
			return filepath.Join(d, name)
		}
	}
	return filepath.Join(dir, name)
}

// el registre va sempre al fitxer; a la consola només si n'hi ha (a Windows, sense consola, falla i no passa res)
type fileFirst struct{ f *os.File }

func (w fileFirst) Write(p []byte) (int, error) {
	n, err := w.f.Write(p)
	_, _ = os.Stderr.Write(p)
	return n, err
}

func main() {
	exe, _ := os.Executable()
	dir := filepath.Dir(exe)
	dataPath := flag.String("dades", "", "fitxer on es guarden les dades (per defecte, al costat del programa)")
	portFlag := flag.Int("port", 8080, "port (si està ocupat, es prova el següent)")
	noBrowser := flag.Bool("sense-navegador", false, "no obris cap finestra en arrencar")
	keepAlive := flag.Bool("sempre", false, "no es tanca sol quan es tanca la finestra de l'app")
	grace := flag.Int("tanca-als", 120, "segons sense la finestra de l'app abans de tancar-se sol")
	flag.Parse()
	if *dataPath == "" {
		*dataPath = defaultDataPath(dir)
	}
	if abs, err := filepath.Abs(*dataPath); err == nil {
		*dataPath = abs
	}

	// registre al costat de les dades (a Windows no hi ha consola on escriure)
	if lf, err := os.OpenFile(filepath.Join(filepath.Dir(*dataPath), "notesgim-registre.txt"), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644); err == nil {
		if st, _ := lf.Stat(); st != nil && st.Size() > 1<<20 {
			_ = lf.Truncate(0)
		}
		log.SetOutput(fileFirst{lf})
	}

	if url := runningInstance(*portFlag, *dataPath); url != "" {
		log.Printf("NotesGim ja està obert a %s: només se n'obre la finestra", url)
		if !*noBrowser {
			openApp(url)
		}
		return
	}
	release, setPort, other := lockData(*dataPath)
	if other != "" {
		log.Printf("NotesGim ja està obert a %s: només se n'obre la finestra", other)
		if !*noBrowser {
			openApp(other)
		}
		return
	}
	defer release()

	s, err := newStore(*dataPath)
	if err != nil {
		log.Print(err)
		release()
		alert("NotesGim", "No s'han pogut llegir les dades:\n\n"+err.Error())
		os.Exit(1)
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
		log.Printf("no s'ha pogut obrir cap port a partir del %d: %v", *portFlag, err)
		release()
		alert("NotesGim", fmt.Sprintf("No s'ha pogut engegar NotesGim (cap port lliure a partir del %d).", *portFlag))
		os.Exit(1)
	}
	setPort(port)

	fmt.Println("════════════════════════════════════════════════════════════")
	fmt.Println(" NotesGim " + appVersion + " — funciona sense internet")
	fmt.Println("════════════════════════════════════════════════════════════")
	fmt.Printf(" Dades: %s\n\n", s.path)
	fmt.Printf(" A AQUEST ORDINADOR:   http://localhost:%d\n\n", port)
	if urls := lanURLs(port); len(urls) > 0 {
		fmt.Println(" LES TUTORES (mòbil connectat a la mateixa Wi-Fi) obren:")
		for _, u := range urls {
			fmt.Println("     " + u)
		}
	}
	fmt.Println("════════════════════════════════════════════════════════════")
	log.Printf("engegat al port %d, dades a %s", port, s.path)

	var appExited atomic.Bool
	if !*noBrowser {
		go func() {
			time.Sleep(400 * time.Millisecond)
			if cmd := openAppProc(fmt.Sprintf("http://localhost:%d", port)); cmd != nil {
				_ = cmd.Wait()
			}
			appExited.Store(true)
		}()
	}
	if s.recovered != "" {
		log.Print(s.recovered)
		go alert("NotesGim", s.recovered)
	}
	srv := &http.Server{Handler: s.routes(port), ReadHeaderTimeout: 10 * time.Second}
	go func() {
		if err := srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Print(err)
			release()
			alert("NotesGim", "NotesGim s'ha aturat: "+err.Error())
			os.Exit(1)
		}
	}()

	// es tanca sol quan fa 2 minuts que la finestra de l'app no hi és (si s'ha tancat la finestra).
	// Si l'ordinador ha estat adormit, es compta des que es desperta.
	tick := time.NewTicker(time.Duration(min(10, max(1, *grace/4))) * time.Second)
	last, started, fallback := time.Now(), time.Now(), false
	appURL := fmt.Sprintf("http://localhost:%d", port)
	for {
		select {
		case <-s.quit:
			log.Print("tancat des de l'app")
			s.mu.Lock()
			_ = s.saveLocked()
			s.mu.Unlock()
			return
		case now := <-tick.C:
			s.mu.Lock()
			if s.dirty {
				if err := s.saveLocked(); err == nil {
					log.Print("ara sí que s'ha pogut desar al fitxer")
					s.bumpLocked() // la finestra de la taula treu l'avís
				}
			}
			s.mu.Unlock()
			// s'ha despertat d'una suspensió (es mira el rellotge de la paret: el monotònic, a Mac i Linux, s'atura
			// mentre l'ordinador dorm)
			if now.Round(0).Sub(last.Round(0)) > 40*time.Second {
				s.lastAdmin.Store(now.UnixMilli())
			}
			last = now
			seen := s.lastAdmin.Load()
			// la finestra no ha arribat a obrir-se (navegador bloquejat o sense Edge/Chrome): el navegador de
			// sempre i, si al cap de 10 minuts encara res, s'avisa i es tanca (no es queda amagat)
			// (si la finestra d'Edge/Chrome encara s'està obrint, s'hi espera més: una segona finestra en un altre
			// navegador tindria les seves pròpies dades)
			if !*noBrowser && seen == 0 {
				if !fallback && ((appExited.Load() && now.Sub(started) > 20*time.Second) || now.Sub(started) > 90*time.Second) {
					fallback = true
					log.Print("la finestra no s'ha obert: es prova amb el navegador de sempre")
					openDefault(appURL)
				}
				if now.Sub(started) > 10*time.Minute {
					log.Print("no s'ha pogut obrir cap finestra: es tanca")
					alert("NotesGim", "No s'ha pogut obrir la finestra de NotesGim. Obre "+appURL+" al navegador, o torna a obrir NotesGim.")
					return
				}
			}
			gone := func(t int64) bool { return now.UnixMilli()-t > int64(*grace)*1000 }
			// no es tanca mentre la finestra imprimeix ni mentre hi ha tutores enviant notes
			// (ni mentre hi ha dades que no s'han pogut desar al fitxer: quan es torni a obrir, la finestra les recupera)
			s.mu.Lock()
			dirty := s.dirty
			s.mu.Unlock()
			if !*keepAlive && !*noBrowser && seen > 0 && gone(seen) && gone(s.lastTutor.Load()) && now.UnixMilli() > s.holdUntil.Load() && !dirty {
				log.Print("fa estona que la finestra de l'app no hi és: es tanca")
				s.mu.Lock()
				_ = s.saveLocked()
				s.mu.Unlock()
				return
			}
		}
	}
}
