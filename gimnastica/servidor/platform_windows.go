//go:build windows

package main

import (
	"os/exec"
	"syscall"
	"unsafe"
)

// carpeta «Documents» de l'usuari (la de veritat, encara que estigui a OneDrive)
func documentsDir() string {
	proc := syscall.NewLazyDLL("shell32.dll").NewProc("SHGetKnownFolderPath")
	if proc.Find() != nil {
		return ""
	}
	// FOLDERID_Documents {FDD39AD0-238F-46AF-ADB4-6C85480369C7}
	guid := [16]byte{0xD0, 0x9A, 0xD3, 0xFD, 0x8F, 0x23, 0xAF, 0x46, 0xAD, 0xB4, 0x6C, 0x85, 0x48, 0x03, 0x69, 0xC7}
	var p *uint16
	r, _, _ := proc.Call(uintptr(unsafe.Pointer(&guid[0])), 0, 0, uintptr(unsafe.Pointer(&p)))
	if p == nil {
		return ""
	}
	defer syscall.NewLazyDLL("ole32.dll").NewProc("CoTaskMemFree").Call(uintptr(unsafe.Pointer(p)))
	if r != 0 {
		return ""
	}
	n := 0
	for *(*uint16)(unsafe.Add(unsafe.Pointer(p), n*2)) != 0 && n < 32767 {
		n++
	}
	return syscall.UTF16ToString(unsafe.Slice(p, n))
}

// obre l'Explorador amb el fitxer de dades seleccionat
func revealPath(path string) error {
	cmd := exec.Command("explorer")
	cmd.SysProcAttr = &syscall.SysProcAttr{CmdLine: `explorer /select,"` + path + `"`}
	return cmd.Start()
}
