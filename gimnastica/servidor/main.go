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
	"bytes"
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
	"reflect"
	"runtime"
	"slices"
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
	fresh     string       // les dades eren de les versions de proves (d'abans de dataGen 2): s'han guardat apart amb aquest nom i es comença de zero
	preBak    time.Time    // quan la taula ha demanat una còpia abans d'esborrar-ho tot (el replace que ve després no en fa una altra)
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
	ops       map[string]bool // les notes de tutora (op) que ja s'han posat: si el mòbil no rep la resposta i la torna a enviar, no es torna a posar
	opList    []string
	opsFile   string              // on es guarden (al costat de les dades): així se'n recorda encara que es torni a obrir el programa
	opsNew    []string            // les que encara no hi són: s'hi escriuen quan el fitxer de dades (amb la nota) ja s'ha desat
	hosts     map[string][2]int64 // adreces (Host) amb què les tutores han arribat al programa: la primera i l'última vegada (si l'ordinador canvia de Wi-Fi)

	// només una finestra de la taula pot canviar les dades alhora (vegeu claimLocked)
	active   string         // l'id de la finestra activa (el tria la finestra; "" és una finestra que no en diu cap)
	activeOn bool           // hi ha una finestra activa
	seen     int64          // última vegada que se n'ha sabut res (ms)
	hold     int64          // fins quan compta com a oberta encara que no se'n sàpiga res (mentre imprimeix)
	waits    map[string]int // api/wait obert de cada finestra (mentre en té un, hi és)
	handoff  chan struct{}  // una altra finestra hi vol treballar: l'activa desa el que té i la deixa (es tanca llavors)
	handTo   string         // la que hi vol treballar (quan l'activa la deixa, passa a ser l'activa tot seguit)
	started  int64          // quan s'ha engegat el programa (ms)
	relWin   string         // l'activa s'ha tancat just després d'un canvi que encara no ha arribat: es deixa quan arriba (vegeu pendingReleaseLocked)
	relStamp string         // (l'hora de les dades que ha d'enviar, meta.updated)
	relUntil int64          // si no arriben, es deixa igualment a partir d'aquesta hora (ms)
	closing  bool           // s'ha clicat «Tanca NotesGim»: les finestres en pausa ho diuen (no que se'n fa servir una altra)
	hadOne   bool           // des que s'ha engegat, ja hi ha hagut una finestra activa (ja no cal esperar la d'abans: startGrace)
	closed   []string       // les finestres que s'han tancat (api/release amb stamp): un canvi seu que arriba tard no les torna a fer actives
}

// ─── només una finestra de la taula pot canviar les dades alhora
//
// Cada finestra de la taula té un id (a l'atzar, cada vegada que s'obre). La que s'obre, o on es clica «Treballa en
// aquesta finestra», passa a ser l'activa (api/claim); les altres queden en pausa: el programa no n'accepta cap canvi
// (423) i elles ho saben per la resposta d'api/wait. Abans de passar-ho a una altra, l'activa ho sap (yield), desa el
// que té i la deixa (api/release); si no respon de seguida (tancada, imprimint…), es passa igualment, i el que no
// hagués pogut desar es queda a la seva finestra, per descarregar. Si l'activa ja no hi és (tancada, o fa estona que no
// se'n sap res), la primera finestra que fa alguna cosa passa a ser l'activa.
const (
	activeTTL   = 30 * 1000 // ms sense saber res de la finestra activa (ni tenir-ne cap api/wait obert): ja no hi és
	startGrace  = 5 * 1000  // en engegar el programa, la finestra que ja era l'activa la torna a agafar abans que cap altra
	recentMs    = 1500      // la finestra activa, sense cap api/wait obert, encara en farà un de seguida (se li pot demanar que la deixi)
	releaseWait = 10 * 1000 // la finestra activa s'ha tancat i el seu últim canvi no arriba: al cap d'aquests ms es deixa igualment
)

var (
	nowMs      = func() int64 { return time.Now().UnixMilli() } // (les proves fan passar el temps)
	handoffMax = 2500 * time.Millisecond                        // el que s'espera que l'activa desi el que té i la deixi
)

const pausedMsg = "Aquesta finestra està en pausa: NotesGim s'està fent servir en una altra finestra."

// la finestra activa encara hi és
func (s *store) aliveLocked(now int64) bool {
	return s.activeOn && (s.waits[s.active] > 0 || now-s.seen < activeTTL || now < s.hold)
}

// no hi ha cap finestra activa (i, si el programa s'acaba d'engegar, ja ha tingut temps de tornar-la a agafar la que ho era,
// o ja n'hi ha hagut una)
func (s *store) freeLocked(now int64) bool {
	return !s.aliveLocked(now) && s.handoff == nil && (now-s.started >= startGrace || s.hadOne)
}

func (s *store) isActiveLocked(win string) bool { return s.activeOn && s.active == win }

func (s *store) takeLocked(win string, now int64) {
	s.active, s.activeOn, s.seen, s.hold, s.hadOne = win, true, now, 0, true
}

func (s *store) touchLocked(win string, now int64) {
	if s.isActiveLocked(win) {
		s.seen = now
	}
}

// aquesta finestra pot desar? L'activa sí; i qualsevol si no n'hi ha cap (llavors passa a ser l'activa)
func (s *store) mayWriteLocked(win string, now int64) bool {
	if s.isActiveLocked(win) {
		s.seen = now
		return true
	}
	if s.aliveLocked(now) || s.handoff != nil {
		return false
	}
	s.takeLocked(win, now)
	return true
}

// l'hora de les dades (meta.updated, la posa la finestra de la taula cada vegada que hi canvia res)
func stampOf(db map[string]any) string { return str(obj(db["meta"])["updated"]) }

// l'activa la deixa: si una altra l'havia demanada, ara és aquella (cap altra no la pot agafar entremig); si no, cap
func (s *store) releaseLocked() {
	s.relWin, s.relStamp, s.relUntil = "", "", 0
	if s.handoff != nil {
		s.takeLocked(s.handTo, nowMs())
		s.endHandoffLocked(s.handoff)
	} else {
		s.activeOn = false
	}
	s.bumpLocked() // (les altres ho saben: la primera que ho vol passa a ser l'activa, si no n'hi ha cap)
}

// l'activa s'ha tancat just després d'un canvi (api/release amb stamp): quan el programa té aquelles dades, o si no
// arriben al cap de releaseWait, es deixa (les altres continuen de seguida, sense esperar que caduqui)
func (s *store) pendingReleaseLocked(now int64) {
	if s.relWin == "" {
		return
	}
	if !s.isActiveLocked(s.relWin) {
		s.relWin, s.relStamp, s.relUntil = "", "", 0
		return
	}
	if stampOf(s.db) == s.relStamp || now >= s.relUntil {
		s.releaseLocked()
	}
}

func (s *store) endHandoffLocked(ch chan struct{}) {
	if ch != nil && s.handoff == ch {
		close(ch)
		s.handoff = nil
	}
}

// la finestra activa ja no hi és (fa estona que no se'n sap res): les que són en pausa ho saben (api/wait) i la primera
// que ho vol passa a ser l'activa
func (s *store) expireActiveLocked(now int64) bool {
	if s.activeOn && s.handoff == nil && !s.aliveLocked(now) {
		s.activeOn = false
		s.bumpLocked()
		return true
	}
	return false
}

// aquesta finestra passa a ser l'activa. Si n'hi ha una altra que hi és, primer se li demana que desi el que té i la
// deixi (com a molt handoffMax); ifFree: només si no n'hi ha cap. Torna si ho és (amb el lock agafat)
func (s *store) claimLocked(win string, ifFree bool, done <-chan struct{}) bool {
	now := nowMs()
	s.pendingReleaseLocked(now)
	if s.isActiveLocked(win) {
		s.seen = now
		return true
	}
	if ifFree && !s.freeLocked(now) {
		return false
	}
	if s.activeOn && (s.waits[s.active] > 0 || now-s.seen < recentMs || s.handoff != nil) {
		if s.handoff == nil {
			s.handoff = make(chan struct{})
			s.bumpLocked() // (l'api/wait de l'activa respon yield)
		}
		s.handTo = win
		ch := s.handoff
		s.mu.Unlock()
		t := time.NewTimer(handoffMax)
		gone := false
		select {
		case <-ch:
		case <-t.C:
		case <-done:
			gone = true
		}
		t.Stop()
		s.mu.Lock()
		s.endHandoffLocked(ch)
		if gone {
			return false
		}
		now = nowMs()
	}
	s.takeLocked(win, now)
	s.bumpLocked() // (la que ho era se'n assabenta: es posa en pausa)
	return true
}

// recorda que s'ha posat la nota d'una tutora amb aquest id (les 5000 últimes). Al fitxer de les notes posades s'hi
// escriu només quan la nota ja és al fitxer de dades (flushOpsLocked, quan api/score l'ha desat): si el programa s'atura
// mentre desa, el mòbil la torna a enviar i es posa (si s'hi escrivia abans, el programa diria que ja la té i es perdria)
func (s *store) sawOpLocked(op string) {
	if op == "" {
		return
	}
	if s.ops == nil {
		s.ops = map[string]bool{}
	}
	if !s.ops[op] {
		s.ops[op] = true
		s.opList = append(s.opList, op)
		if s.opsFile != "" {
			s.opsNew = append(s.opsNew, op)
		}
	}
	for len(s.opList) > 5000 {
		delete(s.ops, s.opList[0])
		s.opList = s.opList[1:]
	}
}

// el fitxer de dades s'acaba de desar: les notes posades fins ara ja hi són, i es recorden també al fitxer de les notes
// posades (si no s'hi poden escriure, o no s'havien pogut desar, es tornen a provar la vegada següent)
func (s *store) flushOpsLocked() {
	if len(s.opsNew) == 0 || s.opsFile == "" {
		return
	}
	f, err := os.OpenFile(s.opsFile, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return
	}
	_, err = f.WriteString(strings.Join(s.opsNew, "\n") + "\n")
	if f.Close() == nil && err == nil {
		s.opsNew = nil
	}
}

// les que ja s'havien posat abans d'obrir el programa (el fitxer es torna a escriure només amb les 5000 últimes)
func (s *store) loadOps() {
	b, err := os.ReadFile(s.opsFile)
	if err != nil {
		return
	}
	file := s.opsFile
	s.opsFile = "" // (mentre es carreguen, no s'hi tornen a escriure)
	lines := strings.Split(string(b), "\n")
	for _, l := range lines {
		if l = strings.TrimSpace(l); l != "" && len(l) <= 64 {
			s.sawOpLocked(l)
		}
	}
	s.opsFile = file
	if len(lines) > 6000 {
		_ = os.WriteFile(file, []byte(strings.Join(s.opList, "\n")+"\n"), 0o644)
	}
}

// una tutora ha arribat al programa amb aquesta adreça (r.Host). Torna les adreces amb què s'hi arribava ABANS que amb
// aquesta (les últimes hores): l'ordinador de la taula ha canviat de Wi-Fi (una adreça i un codi QR nous), i les notes que
// s'havien quedat al mòbil amb la pàgina de l'adreça d'abans només són en aquella pàgina: el mòbil ho diu. (Dues adreces que
// es fan servir alhora —l'ordinador és a dues xarxes— no en són cap d'abans)
func (s *store) sawHostLocked(r *http.Request) []string {
	host := r.Host
	if host == "" || len(host) > 100 || isLocal(r) {
		return nil
	}
	now := nowMs()
	if s.hosts == nil {
		s.hosts = map[string][2]int64{}
	}
	cur, ok := s.hosts[host]
	if !ok {
		cur[0] = now
	}
	cur[1] = now
	s.hosts[host] = cur
	var out []string
	for h, at := range s.hosts {
		if now-at[1] > 12*3600*1000 {
			delete(s.hosts, h)
		} else if h != host && at[1] < cur[0] {
			out = append(out, h)
		}
	}
	sort.Slice(out, func(i, j int) bool { return s.hosts[out[i]][1] > s.hosts[out[j]][1] })
	if len(out) > 3 {
		out = out[:3]
	}
	return out
}

func newStore(path string) (*store, error) {
	s := &store{path: path, backups: filepath.Join(filepath.Dir(path), "copies-notesgim"), version: time.Now().UnixMilli(), dataRev: time.Now().UnixMilli() * 1000, quit: make(chan struct{}),
		waits: map[string]int{}, started: nowMs()}
	s.opsFile = strings.TrimSuffix(path, ".json") + "-notes-posades.txt"
	s.loadOps()
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
		// la còpia que s'ha obert en lloc del fitxer malmès és de les versions de proves: no es fa servir
		if s.recovered != "" && hasData(s.db) && dataGen(s.db) < 2 {
			s.db = map[string]any{}
			s.dirty = false
			s.recovered = "El fitxer de dades estava malmès i la còpia de seguretat més nova és de les versions de proves: no s'ha obert i es comença de zero. Si la finestra de NotesGim tenia les dades, s'hi tornen a posar soles; si no, restaura una còpia des de Configuració."
		}
		// dades de les versions de proves (cap versió d'ara no les desa sense settings.dataGen): es comença de zero.
		// No s'esborren: el fitxer es queda al costat amb un altre nom («…-proves-<data>.json») i es pot restaurar
		if s.recovered == "" && hasData(s.db) && dataGen(s.db) < 2 {
			old := freeName(strings.TrimSuffix(path, ".json") + "-proves-" + time.Now().Format("2006-01-02_150405"))
			// (a Windows, un antivirus o OneDrive poden tenir el fitxer obert un moment: es torna a provar; si no es
			// pot moure, se'n fa una còpia i el fitxer es substitueix la primera vegada que es desa)
			var rerr error
			for i := 0; i < 10; i++ {
				if rerr = os.Rename(path, old); rerr == nil {
					break
				}
				time.Sleep(time.Duration(50*(i+1)) * time.Millisecond)
			}
			s.db = map[string]any{}
			s.fresh = filepath.Base(old)
			if rerr != nil {
				// (si ja se'n va fer una còpia igual un altre dia, ja es va començar de zero aquell dia: no es torna a dir)
				if same := sameProves(path, b); same != "" {
					s.fresh = ""
				} else if werr := writeFileSync(old, b); werr != nil {
					return nil, fmt.Errorf("no s'han pogut guardar apart les dades de les proves d'abans (%s): %v", path, werr)
				}
			}
		}
	}
	return s, nil
}

// un «…-proves-….json» al costat del fitxer de dades amb exactament aquest contingut (o "")
func sameProves(path string, b []byte) string {
	list, _ := filepath.Glob(strings.TrimSuffix(path, ".json") + "-proves-*.json")
	for _, f := range list {
		if c, err := os.ReadFile(f); err == nil && bytes.Equal(c, b) {
			return filepath.Base(f)
		}
	}
	return ""
}

// base + ".json", o base-2.json, base-3.json… si ja n'hi ha un (mai se n'escriu un a sobre d'un altre)
func freeName(base string) string {
	name := base + ".json"
	for i := 2; i < 1000; i++ {
		if _, err := os.Stat(name); errors.Is(err, os.ErrNotExist) {
			break
		}
		name = fmt.Sprintf("%s-%d.json", base, i)
	}
	return name
}

// hi ha gimnastes, equips, entitats o competicions
func hasData(db map[string]any) bool {
	for _, k := range []string{"gymnasts", "teams", "clubs", "competitions"} {
		if l, ok := db[k].([]any); ok && len(l) > 0 {
			return true
		}
	}
	return false
}

// generació de les dades (settings.dataGen): 2 a partir de les versions que comencen de zero
func dataGen(db map[string]any) float64 {
	st, _ := db["settings"].(map[string]any)
	g, _ := st["dataGen"].(float64)
	return g
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
	// primer les còpies de cada 10 minuts (les d'abans de restaurar o d'esborrar-ho tot, i les d'en obrir, són
	// de com eren les dades abans d'un canvi que es va voler fer: només si no n'hi ha cap altra)
	special := func(n string) bool {
		return strings.Contains(n, "-abans-de-restaurar") || strings.Contains(n, "-abans-d-esborrar") || strings.Contains(n, "-en-obrir")
	}
	sort.Slice(list, func(i, j int) bool {
		if a, b := special(list[i].name), special(list[j].name); a != b {
			return b
		}
		return list[i].mod.After(list[j].mod)
	})
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

// abans de restaurar una còpia (o d'esborrar-ho tot), es guarda com eren les dades
func (s *store) backupBeforeRestoreLocked(why string) error {
	b, err := json.MarshalIndent(s.db, "", " ")
	if err != nil || len(s.db) == 0 {
		return err
	}
	if err := os.MkdirAll(s.backups, 0o755); err != nil {
		return err
	}
	if err := writeFileSync(freeName(filepath.Join(s.backups, "notesgim-"+time.Now().Format("2006-01-02_150405")+"-"+why)), b); err != nil {
		return err
	}
	s.pruneBackups(60)
	return nil
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
	// (les còpies d'abans d'esborrar-ho tot o de restaurar no compten entre les 60: se'n guarden les 20 últimes a part,
	// perquè no se'n vagin al cap de pocs dies de fer servir el programa)
	var names, special []string
	for _, e := range entries {
		if n := e.Name(); strings.HasPrefix(n, "notesgim-") && strings.HasSuffix(n, ".json") {
			if strings.Contains(n, "-abans-de-restaurar") || strings.Contains(n, "-abans-d-esborrar") {
				special = append(special, n)
			} else {
				names = append(names, n)
			}
		}
	}
	sort.Strings(names)
	sort.Strings(special)
	for len(names) > keep {
		_ = os.Remove(filepath.Join(s.backups, names[0]))
		names = names[1:]
	}
	for len(special) > 20 {
		_ = os.Remove(filepath.Join(s.backups, special[0]))
		special = special[1:]
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
func (s *store) wait(since int64, d time.Duration) bool { return s.waitDone(since, d, nil) }

// el mateix, però també s'acaba si la finestra que espera se'n va (done: es tanca la connexió)
func (s *store) waitDone(since int64, d time.Duration, done <-chan struct{}) bool {
	s.mu.Lock()
	if s.version != since || d <= 0 {
		changed := s.version != since
		s.mu.Unlock()
		return changed
	}
	ch := make(chan struct{})
	s.waiters = append(s.waiters, ch)
	s.mu.Unlock()
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ch:
		return true
	case <-t.C:
		return false
	case <-done:
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

// la nota l'ha posada la taula: cap nota de tutora la trepitja en fusionar. Una de tutora ja revisada, sí, si la de
// l'altra còpia és més nova: la taula n'ha revisat una de més vella i aquesta (que el programa ja havia acceptat) no
// l'havia vista; es queda sense revisar i torna a sortir en groc
func tableOwns(a map[string]any) bool {
	return guarded(a) && !(str(a["by"]) == "tutor" && truthy(a["ok"]))
}

// mergeScores: a base hi posa, de cada intent de nota, la versió d'other si és més recent (excepte que una
// nota de tutora no passa mai per sobre d'una de la taula; vegeu tableOwns).
// Retorna quants intents s'han agafat d'other. (Igual que Engine.mergeScores a index.html.)
func mergeScores(base, other map[string]any) int { return mergeScoresSince(base, other, 0) }

// com mergeScores, però de l'altra còpia només els intents desats després de since (ms)
func mergeScoresSince(base, other map[string]any, since float64) int {
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
					if num(xm["at"]) > num(ym["at"]) && num(xm["at"]) > since && !(str(xm["by"]) == "tutor" && tableOwns(ym)) {
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
					// (amb D + E − Pen., la nota final; la tutora només veu que ja hi és i quina és)
					v := am["v"]
					if v == nil && am["d"] != nil && am["e"] != nil {
						v = math.Max(0, num(am["d"])+num(am["e"])-num(am["p"]))
					}
					atts = append(atts, map[string]any{"v": v, "by": am["by"], "at": am["at"], "ok": truthy(am["ok"]), "locked": guarded(am)})
				}
				scores[appID] = atts
			}
			entries = append(entries, map[string]any{
				"id": em["id"], "bib": em["bib"], "name": name, "club": clubs[str(em["clubId"])],
				"gender": genderOf(em), "category": em["category"], "level": em["level"], "status": em["status"], "scores": scores,
				"clubId": em["clubId"], "teamId": em["teamId"],
			})
		}
		comp := map[string]any{
			"id": cm["id"], "name": cm["name"], "date": cm["date"], "scoring": cm["scoring"], "minScore": cm["minScore"],
			"maxScore": cm["maxScore"], "apparatus": cm["apparatus"], "entries": entries,
		}
		if r := tutorRotation(db, cm, clubs); r != nil {
			comp["rotation"] = r
		}
		out = append(out, comp)
	}
	return out
}

// amb les rotacions fetes, el que cal perquè el mòbil sàpiga en quin ordre passen les gimnastes pel seu aparell (el
// calcula la mateixa app, com a la taula): les rotacions, els equips, els noms de les entitats i l'ordre de les
// categories i dels nivells
func tutorRotation(db map[string]any, cm map[string]any, clubs map[string]string) map[string]any {
	rot := obj(cm["rot"])
	if rot == nil || str(rot["made"]) == "" {
		return nil
	}
	used := map[string]any{}
	teams := []any{}
	for _, t := range arr(cm["teams"]) {
		tm := obj(t)
		if tm == nil {
			continue
		}
		teams = append(teams, map[string]any{"id": tm["id"], "name": tm["name"], "clubId": tm["clubId"], "category": tm["category"], "gender": genderOf(tm), "level": tm["level"]})
		if id := str(tm["clubId"]); id != "" {
			used[id] = clubs[id]
		}
	}
	for _, e := range arr(cm["entries"]) {
		if id := str(obj(e)["clubId"]); id != "" {
			used[id] = clubs[id]
		}
	}
	st := obj(db["settings"])
	cats := []any{}
	for _, c := range arr(st["categories"]) {
		if cmap := obj(c); cmap != nil {
			cats = append(cats, cmap["name"])
		} else if s, ok := c.(string); ok {
			cats = append(cats, s)
		}
	}
	levels := arr(st["levels"])
	if levels == nil {
		levels = []any{}
	}
	return map[string]any{"rot": rot, "teams": teams, "clubs": used, "categories": cats, "levels": levels}
}

type scoreReq struct {
	Pin     string   `json:"pin"`
	CompID  string   `json:"compId"`
	EntryID string   `json:"entryId"`
	AppID   string   `json:"appId"`
	I       int      `json:"i"`
	Value   *float64 `json:"value"`
	Who     string   `json:"who"`
	Op      string   `json:"op"`   // id de la nota al mòbil (la mateixa si la torna a enviar)
	Dev     string   `json:"dev"`  // id del mòbil (el mateix per a totes les pestanyes)
	Made    float64  `json:"made"` // quan s'ha escrit la nota, amb el rellotge del mòbil (ms; només es compara amb les del mateix mòbil)
}

// aquesta nota de la tutora ja s'havia posat (el mòbil no va rebre la resposta i la torna a enviar): no es torna a posar
var errDup = errors.New("ja hi és")

// a la casella ja hi ha una nota més nova del mateix mòbil (una correcció): aquesta, que s'havia quedat pel camí (una
// pestanya adormida, la Wi-Fi que l'entrega tard), ja no hi va. Es respon que sí: el mòbil ja no l'ha d'enviar
var errOlder = errors.New("n'hi ha una de més nova")

// la taula ja ha posat (o revisat) aquesta nota: la tutora no la pot canviar (resposta 409)
var errLocked = errors.New("Aquesta nota ja l’ha posada o revisada la taula. Si cal canviar-la, digues-ho a la taula.")

// el codi ja no val (l'han canviat, han tancat la competició o han tret les tutores): resposta 401, i la tutora
// es guarda les notes per enviar-les quan torni a entrar
var errAuth = errors.New("El codi ja no val: potser l’han canviat o han tancat la competició. Demana el codi a la taula.")

// la taula no accepta la nota (resposta 403): el mòbil diu quina nota i per què (amb el codi, en femení o en masculí)
type refusal struct{ code, msg string }

func (r refusal) Error() string { return r.msg }

var (
	errGone   = refusal{"gone", "Ja no és a la competició: la taula n’ha tret la inscripció."}
	errNP     = refusal{"np", "La taula hi ha posat NP (no s’ha presentat)."}
	errNoApp  = refusal{"app", "Aquest aparell no es fa en aquest grup."}
	errAttNum = refusal{"att", "Intent incorrecte."}
)

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
		return errGone
	}
	if str(entry["status"]) == "np" {
		return errNP
	}
	app := findByID(arr(comp["apparatus"]), r.AppID)
	if app == nil || appMode(app, genderOf(entry)) == "off" {
		return errNoApp
	}
	attempts := int(num(app["attempts"]))
	if attempts < 1 {
		attempts = 1
	}
	if r.I < 0 || r.I >= attempts {
		return errAttNum
	}
	att := map[string]any{"by": "tutor", "at": float64(at)}
	if who := strings.TrimSpace(r.Who); who != "" {
		if len(who) > 40 {
			who = who[:40]
		}
		att["who"] = who
	}
	if r.Op != "" {
		att["op"] = r.Op
	}
	dev := r.Dev
	if len(dev) > 64 || math.IsNaN(r.Made) || math.IsInf(r.Made, 0) || r.Made <= 0 {
		dev = ""
	}
	if r.Value != nil {
		v := *r.Value
		if mx := maxScoreOf(comp); math.IsNaN(v) || math.IsInf(v, 0) || v < 0 || v > mx {
			return refusal{"value", fmt.Sprintf("Aquesta nota no pot ser: ha de ser entre 0 i %s.", strings.Replace(strconv.FormatFloat(mx, 'f', -1, 64), ".", ",", 1))}
		}
		att["v"] = math.Round(v*1000) / 1000
	}
	scores := obj(entry["scores"])
	if scores == nil {
		scores = map[string]any{}
		entry["scores"] = scores
	}
	list := arr(scores[r.AppID])
	if r.Op != "" && r.I < len(list) && str(obj(list[r.I])["op"]) == r.Op {
		return errDup
	}
	// de cada mòbil que ha posat una nota en aquesta casella, l'hora (del mòbil) de la més nova: una d'aquest mòbil escrita
	// abans ja no hi va. (Les hores de dos mòbils no es comparen mai: cada rellotge va a la seva)
	seen := map[string]any{}
	if r.I < len(list) {
		for k, v := range obj(obj(list[r.I])["seen"]) {
			seen[k] = v
		}
	}
	if dev != "" {
		if num(seen[dev]) > r.Made {
			return errOlder
		}
		for k := range seen {
			if len(seen) < 16 {
				break
			}
			if k != dev {
				delete(seen, k)
			}
		}
		seen[dev] = r.Made
	}
	if len(seen) > 0 {
		att["seen"] = seen
	}
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

// posa window.NOTESGIM=1 al principi de l'app (just després de <head>)
func markServed(index []byte) []byte {
	return bytes.Replace(index, []byte("<head>"), []byte("<head>\n<script>window.NOTESGIM=1</script>"), 1)
}

func (s *store) routes(port int) http.Handler {
	mux := http.NewServeMux()
	index, _ := webFS.ReadFile("web/index.html")
	// la pàgina sap que l'ha servida el programa: si després triga a respondre (Wi-Fi saturada), no s'obre mai com l'app
	// del navegador sinó que diu «Connectant…» i ho torna a provar (vegeu serverInit a index.html)
	index = markServed(index)
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
		info := map[string]any{"app": "notesgim", "version": appVersion, "role": role, "urls": lanURLs(port), "dataFile": s.path, "dataGen": 2}
		if role == "admin" {
			s.mu.Lock()
			info["fresh"] = s.fresh
			s.mu.Unlock()
		}
		writeJSON(w, 200, info)
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
			// window: l'id de la finestra. Si no és l'activa (n'hi ha una altra on es treballa), no s'hi escriu (423):
			// la finestra es posa en pausa i el que no s'ha desat es queda allà, per descarregar
			// after: la finestra es tanca amb un canvi que encara no havia enviat perquè se n'estava enviant un altre (el de
			// les dades amb aquesta hora): és el següent d'aquell, encara que no en sàpiga el dataRev
			var body struct {
				DB      map[string]any `json:"db"`
				Base    int64          `json:"base"`
				Replace bool           `json:"replace"`
				Since   float64        `json:"since"`
				Window  string         `json:"window"`
				After   string         `json:"after"`
			}
			if err := json.NewDecoder(io.LimitReader(r.Body, 50<<20)).Decode(&body); err != nil || body.DB == nil {
				fail(w, 400, "dades incorrectes")
				return
			}
			s.mu.Lock()
			defer s.mu.Unlock()
			now := nowMs()
			// (una finestra que ja s'ha tancat i el seu canvi arriba tard: es desa si és més nou que el que hi ha i no hi ha cap
			// altra finestra activa, però no torna a ser l'activa, que ja no hi és)
			late := !s.isActiveLocked(body.Window) && slices.Contains(s.closed, body.Window)
			if late && (s.aliveLocked(now) || s.handoff != nil || stampOf(body.DB) <= stampOf(s.db)) || !late && !s.mayWriteLocked(body.Window, now) {
				writeJSON(w, 423, map[string]any{"error": pausedMsg, "paused": true, "version": s.version, "dataRev": s.dataRev, "db": s.db})
				return
			}
			// (una finestra que s'ha tancat esperant que arribin aquestes dades: un cop desades, es deixa; vegeu pendingReleaseLocked)
			defer s.pendingReleaseLocked(nowMs())
			// (after: el programa ja té aquell canvi de la mateixa finestra, l'activa, i res més des d'aleshores)
			if body.Base != s.dataRev && !(body.After != "" && body.After == stampOf(s.db)) {
				if s.relWin == body.Window {
					s.releaseLocked() // (s'ha tancat: ja no les pot tornar a enviar)
				}
				writeJSON(w, 409, map[string]any{"error": "les dades han canviat des d'una altra finestra", "version": s.version, "dataRev": s.dataRev, "db": s.db})
				return
			}
			// una finestra d'una versió de proves (encara oberta d'abans): les seves dades no hi tornen
			if dataGen(body.DB) < 2 {
				writeJSON(w, 409, map[string]any{"error": "aquesta finestra és d'una versió anterior de NotesGim: tanca-la i torna a obrir NotesGim", "version": s.version, "dataRev": s.dataRev, "db": s.db})
				return
			}
			// les mateixes dades que ja té (p. ex. la finestra torna a desar sense cap canvi): no cal tornar a
			// escriure el fitxer (si ara no es pot, no és cap dada perduda)
			if !s.dirty && !body.Replace && reflect.DeepEqual(body.DB, s.db) {
				writeJSON(w, 200, map[string]any{"version": s.version, "dataRev": s.dataRev, "taken": 0})
				return
			}
			taken := 0
			if !body.Replace {
				taken = mergeScores(body.DB, s.db) // notes de tutores més noves que les que té l'ordinador
			} else {
				// es restaura una còpia: abans, una còpia de com era (per si s'ha triat la que no era), i només
				// s'hi afegeixen les notes arribades després de restaurar
				// (si la taula n'acaba de fer guardar una abans d'esborrar-ho tot, ja hi és)
				if time.Since(s.preBak) > 30*time.Second {
					_ = s.backupBeforeRestoreLocked("abans-de-restaurar")
				}
				s.preBak = time.Time{}
				s.lastBak = time.Time{} // (i, en desar, una còpia de com queden: si el fitxer es malmet, és la que s'obre)
				if body.Since > 0 {
					taken = mergeScoresSince(body.DB, s.db, body.Since)
				}
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
			s.fresh = "" // (l'avís «comences de zero» ja s'ha vist: la taula ja hi ha desat)
			resp := map[string]any{"version": s.version, "dataRev": s.dataRev, "taken": taken}
			if taken > 0 {
				resp["db"] = s.db
			}
			writeJSON(w, 200, resp)
		default:
			fail(w, 405, "mètode no permès")
		}
	})

	// la finestra de la taula espera canvis (long polling). w: el seu id; on=1: es pensa que és l'activa (si no n'hi ha
	// cap, ho torna a ser: p. ex. el programa s'ha tornat a obrir). La resposta diu si és l'activa (active), si se li
	// demana que la deixi a una altra (yield) i, a una en pausa, si ja no n'hi ha cap (free); db, només si ha canviat
	mux.HandleFunc("/api/wait", func(w http.ResponseWriter, r *http.Request) {
		if !isLocal(r) {
			fail(w, 403, "només des de l'ordinador de la taula")
			return
		}
		q := r.URL.Query()
		since, _ := strconv.ParseInt(q.Get("since"), 10, 64)
		win, on := q.Get("w"), q.Get("on") == "1"
		s.lastAdmin.Store(time.Now().UnixMilli())
		s.mu.Lock()
		now := nowMs()
		s.pendingReleaseLocked(now)
		if on && !s.isActiveLocked(win) && !s.aliveLocked(now) && s.handoff == nil {
			s.takeLocked(win, now)
		}
		s.touchLocked(win, now)
		d := 25 * time.Second
		mine := s.isActiveLocked(win)
		// (es pensa que és l'activa però no ho és, o se li demana que la deixi: ho ha de saber ara; mentre la deixa ja
		// no ho diu, on=0, i espera com les altres)
		if on && (!mine || s.handoff != nil) {
			d = 0
		} else if !mine && !s.aliveLocked(now) && now-s.started < startGrace {
			d = min(d, time.Duration(startGrace-(now-s.started)+50)*time.Millisecond)
		}
		// t: com a molt aquests ms (una finestra en pausa pregunta i se'n va de seguida: el navegador només obre 6 connexions
		// alhora amb el programa, i les ha de tenir lliures la finestra activa per desar i les altres per «Treballa en aquesta finestra»)
		if tq := q.Get("t"); tq != "" {
			if ms, err := strconv.Atoi(tq); err == nil && ms >= 0 {
				d = min(d, time.Duration(ms)*time.Millisecond)
			}
		}
		if s.waits == nil {
			s.waits = map[string]int{}
		}
		s.waits[win]++
		s.mu.Unlock()
		changed := s.waitDone(since, d, r.Context().Done())
		s.lastAdmin.Store(time.Now().UnixMilli())
		s.mu.Lock()
		defer s.mu.Unlock()
		now = nowMs()
		if s.waits[win]--; s.waits[win] <= 0 {
			delete(s.waits, win)
		}
		s.touchLocked(win, now)
		if r.Context().Err() != nil {
			return
		}
		mine = s.isActiveLocked(win)
		resp := map[string]any{"version": s.version, "active": mine, "yield": mine && s.handoff != nil, "free": !mine && s.freeLocked(now)}
		if s.closing {
			resp["closing"] = true
		}
		if changed {
			resp["dataRev"], resp["db"], resp["saveErr"] = s.dataRev, s.db, s.saveErr
		}
		writeJSON(w, 200, resp)
	})

	// aquesta finestra passa a ser la que pot canviar les dades (en obrir-se, o «Treballa en aquesta finestra»). Torna
	// les dades com GET /api/db (després que l'activa hagi desat el que tenia). ifFree: només si no n'hi ha cap altra
	mux.HandleFunc("/api/claim", func(w http.ResponseWriter, r *http.Request) {
		if !isLocal(r) || r.Method != http.MethodPost {
			fail(w, 403, "no permès")
			return
		}
		var body struct {
			Window string `json:"window"`
			IfFree bool   `json:"ifFree"`
		}
		_ = json.NewDecoder(io.LimitReader(r.Body, 1<<10)).Decode(&body)
		s.lastAdmin.Store(time.Now().UnixMilli())
		s.mu.Lock()
		defer s.mu.Unlock()
		if !s.claimLocked(body.Window, body.IfFree, r.Context().Done()) {
			writeJSON(w, 409, map[string]any{"error": pausedMsg, "active": false, "version": s.version})
			return
		}
		writeJSON(w, 200, map[string]any{"version": s.version, "dataRev": s.dataRev, "db": s.db, "saveErr": s.saveErr, "active": true})
	})

	// la finestra activa la deixa: ja ho ha desat tot per passar-ho a una altra, o es tanca
	mux.HandleFunc("/api/release", func(w http.ResponseWriter, r *http.Request) {
		if !isLocal(r) || r.Method != http.MethodPost {
			fail(w, 403, "no permès")
			return
		}
		// stamp: en tancar-se, l'hora de les últimes dades de la finestra; si encara no han arribat (s'acaba d'enviar el
		// canvi), es deixa quan arribin (o, si no arriben, al cap de releaseWait)
		var body struct {
			Window string `json:"window"`
			Stamp  string `json:"stamp"`
		}
		_ = json.NewDecoder(io.LimitReader(r.Body, 1<<10)).Decode(&body)
		s.mu.Lock()
		if s.isActiveLocked(body.Window) {
			if body.Stamp != "" {
				s.closed = append(s.closed, body.Window)
				if len(s.closed) > 50 {
					s.closed = s.closed[1:]
				}
			}
			if body.Stamp != "" && body.Stamp != stampOf(s.db) {
				s.relWin, s.relStamp, s.relUntil = body.Window, body.Stamp, nowMs()+releaseWait
			} else {
				s.releaseLocked()
			}
		}
		s.mu.Unlock()
		writeJSON(w, 200, map[string]any{"ok": true})
	})

	// la finestra avisa que imprimeix (mentre la finestra d'impressió és oberta, la pàgina no pot parlar amb el
	// programa): no s'ha de tancar sol. ms=0 ho torna a deixar com sempre.
	mux.HandleFunc("/api/keepalive", func(w http.ResponseWriter, r *http.Request) {
		if !isLocal(r) || r.Method != http.MethodPost {
			fail(w, 403, "no permès")
			return
		}
		var body struct {
			Ms     int64  `json:"ms"`
			Window string `json:"window"`
		}
		_ = json.NewDecoder(io.LimitReader(r.Body, 1<<10)).Decode(&body)
		now := time.Now().UnixMilli()
		ms := min(max(body.Ms, 0), 3*3600*1000)
		s.lastAdmin.Store(now)
		s.holdUntil.Store(now + ms)
		// (la finestra activa no deixa de ser-ho mentre imprimeix: mentrestant no pot parlar amb el programa)
		s.mu.Lock()
		if s.isActiveLocked(body.Window) {
			n := nowMs()
			s.seen, s.hold = n, n+ms
		}
		s.mu.Unlock()
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
	// abans d'esborrar-ho tot, la taula en fa guardar una còpia a copies-notesgim (si no es pot, la descarrega ella)
	mux.HandleFunc("/api/backup", func(w http.ResponseWriter, r *http.Request) {
		if !isLocal(r) || r.Method != http.MethodPost {
			fail(w, 403, "no permès")
			return
		}
		s.mu.Lock()
		err := s.backupBeforeRestoreLocked("abans-d-esborrar")
		if err == nil {
			s.preBak = time.Now()
		}
		s.mu.Unlock()
		if err != nil {
			log.Printf("ERROR fent la còpia de seguretat: %v", err)
			fail(w, 500, "no s'ha pogut guardar la còpia a "+s.backups+": "+err.Error())
			return
		}
		writeJSON(w, 200, map[string]any{"ok": true})
	})

	mux.HandleFunc("/api/quit", func(w http.ResponseWriter, r *http.Request) {
		if !isLocal(r) || r.Method != http.MethodPost {
			fail(w, 403, "no permès")
			return
		}
		var body struct {
			Force bool `json:"force"`
		}
		_ = json.NewDecoder(io.LimitReader(r.Body, 1<<10)).Decode(&body)
		// abans de tancar, es desa el que encara no s'ha pogut desar; si no es pot, no es tanca (si no, es
		// perdrien els últims canvis) excepte si la finestra ho demana expressament. Si ja estava tot desat, no
		// cal tornar-hi a escriure (encara que ara la carpeta no es pugui fer servir)
		s.mu.Lock()
		var err error
		if s.dirty {
			err = s.saveLocked()
		}
		msg, saved := s.saveErr, !s.dirty
		s.mu.Unlock()
		if err != nil && !body.Force {
			fail(w, 500, msg)
			return
		}
		s.mu.Lock()
		s.closing = true
		s.mu.Unlock()
		writeJSON(w, 200, map[string]any{"ok": true, "saved": saved})
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
		var hosts []string
		if len(data) > 0 {
			hosts = s.sawHostLocked(r)
		}
		s.mu.Unlock()
		if len(data) == 0 {
			s.slowFail()
			fail(w, 403, "Codi incorrecte, o no hi ha cap competició oberta a les tutores.")
			return
		}
		s.lastTutor.Store(time.Now().UnixMilli())
		writeJSON(w, 200, map[string]any{"version": version, "comps": data, "hosts": hosts})
	})

	mux.HandleFunc("/api/score", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			fail(w, 405, "mètode no permès")
			return
		}
		var req scoreReq
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&req); err != nil {
			fail(w, 400, "Dades incorrectes.")
			return
		}
		if len(req.Op) > 64 {
			req.Op = ""
		}
		s.mu.Lock()
		// (una nota que ja s'havia posat i el mòbil torna a enviar perquè no va rebre la resposta: no es torna a posar,
		// encara que després la taula l'hagi canviat o esborrat)
		if req.Op != "" && s.ops[req.Op] {
			v := s.version
			s.mu.Unlock()
			writeJSON(w, 200, map[string]any{"ok": true, "version": v})
			return
		}
		err := applyScore(s.db, req, time.Now().UnixMilli())
		if errors.Is(err, errDup) || errors.Is(err, errOlder) {
			// (ja hi és, o n'hi ha una de més nova del mateix mòbil: no es posa res. Es recorda quan les dades ja s'han desat)
			s.sawOpLocked(req.Op)
			v := s.version
			s.mu.Unlock()
			writeJSON(w, 200, map[string]any{"ok": true, "version": v, "older": errors.Is(err, errOlder)})
			return
		}
		if errors.Is(err, errAuth) {
			s.mu.Unlock()
			s.slowFail()
			fail(w, 401, err.Error())
			return
		}
		defer s.mu.Unlock()
		if err != nil {
			code, why := 403, ""
			var rf refusal
			if errors.Is(err, errLocked) {
				code, why = 409, "locked"
			} else if errors.As(err, &rf) {
				why = rf.code
			}
			writeJSON(w, code, map[string]any{"error": err.Error(), "code": why})
			return
		}
		s.lastTutor.Store(time.Now().UnixMilli())
		s.sawHostLocked(r)
		s.sawOpLocked(req.Op)
		s.bumpLocked()
		// si ara no es pot escriure al fitxer, la nota ja és al programa i a la finestra de la taula (que
		// en veu l'avís): es tornarà a provar de desar sola, i la tutora no l'ha de tornar a enviar. L'id de la nota es
		// recorda al fitxer de les notes posades només quan ja és al de dades: fins llavors, només aquí (vegeu sawOpLocked)
		if err := s.saveLocked(); err != nil {
			log.Printf("ERROR desant: %v", err)
		} else {
			s.flushOpsLocked()
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

// hi ha un NotesGim amb aquestes dades al port p? Torna la seva adreça o "", i si és d'una versió de proves
// (d'abans de dataGen 2: s'ha de tancar perquè s'obri aquest, que comença de zero)
func instanceAt(p int, dataPath string) (string, bool) {
	client := &http.Client{Timeout: 700 * time.Millisecond}
	resp, err := client.Get(fmt.Sprintf("http://127.0.0.1:%d/api/info", p))
	if err != nil {
		return "", false
	}
	defer resp.Body.Close()
	var info struct {
		App      string  `json:"app"`
		DataFile string  `json:"dataFile"`
		DataGen  float64 `json:"dataGen"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&info)
	if info.App == "notesgim" && filepath.Clean(info.DataFile) == filepath.Clean(dataPath) {
		return fmt.Sprintf("http://localhost:%d", p), info.DataGen < 2
	}
	return "", false
}

// tanca el NotesGim d'una versió de proves que hi ha obert al port p (abans desa el que tingui). Torna si s'ha tancat
func quitOld(p int) bool {
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Post(fmt.Sprintf("http://127.0.0.1:%d/api/quit", p), "application/json", strings.NewReader("{}"))
	if err != nil {
		return false
	}
	resp.Body.Close()
	if resp.StatusCode != 200 {
		return false
	}
	// (s'espera que deixi de respondre: llavors ja ha desat i s'ha tancat)
	probe := &http.Client{Timeout: 300 * time.Millisecond}
	for i := 0; i < 50; i++ {
		time.Sleep(200 * time.Millisecond)
		r, err := probe.Get(fmt.Sprintf("http://127.0.0.1:%d/api/info", p))
		if err != nil {
			return true
		}
		r.Body.Close()
	}
	return false
}

// si NotesGim ja està obert (amb les mateixes dades), no se n'obre un altre: només se'n mostra la finestra.
// Si el que hi ha obert és d'una versió de proves, es tanca i s'obre aquest (old: no s'ha pogut tancar)
func runningInstance(port int, dataPath string) (url string, old bool) {
	for p := port; p < port+20; p++ {
		if u, o := instanceAt(p, dataPath); u != "" {
			if o {
				log.Printf("hi ha obert un NotesGim d'una versió de proves a %s: es tanca", u)
				if quitOld(p) {
					continue
				}
				return u, true
			}
			return u, false
		}
	}
	return "", false
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
			if u, old := instanceAt(p, dataPath); u != "" && !(old && quitOld(p)) {
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

	if url, old := runningInstance(*portFlag, *dataPath); old {
		log.Printf("no s'ha pogut tancar el NotesGim d'abans a %s", url)
		alert("NotesGim", "Hi ha obert un NotesGim d'una versió anterior i no s'ha pogut tancar sol.\n\nTanca'l (amb el botó «Tanca NotesGim» de la seva finestra o, si no n'hi ha, tancant la seva finestra negra; si no la trobes, reinicia l'ordinador) i torna a obrir aquest.")
		os.Exit(1)
	} else if url != "" {
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
	if s.fresh != "" {
		log.Printf("dades de les proves guardades apart com a %s: es comença de zero", s.fresh)
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
				s.mu.Lock()
				if s.activeOn {
					s.seen = nowMs() // (i la finestra activa també: encara s'ha de tornar a connectar)
				}
				s.mu.Unlock()
			}
			// la finestra activa ja no hi és: una de les que són en pausa la pot agafar
			s.mu.Lock()
			s.pendingReleaseLocked(nowMs())
			if s.expireActiveLocked(nowMs()) {
				log.Print("la finestra activa de la taula ja no hi és")
			}
			s.mu.Unlock()
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
