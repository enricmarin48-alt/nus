package main

import (
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"testing"
	"time"
)

// dos NotesGim alhora amb les mateixes dades: només un agafa el fitxer .lock; l'altre troba el primer
func TestLockDataSingleInstance(t *testing.T) {
	dir := t.TempDir()
	data := filepath.Join(dir, "notesgim-dades.json")
	s, err := newStore(data)
	if err != nil {
		t.Fatal(err)
	}
	var mu sync.Mutex
	owners, found := 0, 0
	var wg sync.WaitGroup
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			release, setPort, other := lockData(data)
			mu.Lock()
			defer mu.Unlock()
			if other != "" {
				found++
				return
			}
			owners++
			ln, err := net.Listen("tcp", "127.0.0.1:0")
			if err != nil {
				t.Error(err)
				return
			}
			go http.Serve(ln, s.routes(ln.Addr().(*net.TCPAddr).Port))
			setPort(ln.Addr().(*net.TCPAddr).Port)
			t.Cleanup(func() { ln.Close(); release() })
		}()
	}
	wg.Wait()
	if owners != 1 || found != 1 {
		t.Fatalf("propietaris=%d trobats=%d, vull 1 i 1", owners, found)
	}
}

// un .lock d'un NotesGim que es va tancar malament no impedeix tornar-lo a obrir
func TestLockDataStale(t *testing.T) {
	dir := t.TempDir()
	data := filepath.Join(dir, "notesgim-dades.json")
	ln, _ := net.Listen("tcp", "127.0.0.1:0")
	port := ln.Addr().(*net.TCPAddr).Port
	ln.Close() // ningú no escolta en aquest port
	if err := os.WriteFile(data+".lock", []byte(strconv.Itoa(port)), 0o644); err != nil {
		t.Fatal(err)
	}
	start := time.Now()
	release, _, other := lockData(data)
	if other != "" || release == nil {
		t.Fatalf("no s'ha agafat el lock vell: %q", other)
	}
	release()
	if time.Since(start) > 5*time.Second {
		t.Fatal("ha trigat massa")
	}
	if _, err := os.Stat(data + ".lock"); !os.IsNotExist(err) {
		t.Fatal("el lock no s'ha esborrat en alliberar-lo")
	}
}

func TestDefaultDataPathNotInTemp(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	p := defaultDataPath(os.TempDir())
	if filepath.Dir(p) == filepath.Clean(os.TempDir()) {
		t.Fatalf("les dades no han d'anar a la carpeta temporal: %s", p)
	}
}
