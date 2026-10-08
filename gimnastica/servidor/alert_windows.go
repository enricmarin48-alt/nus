//go:build windows

package main

import (
	"syscall"
	"unsafe"
)

// a Windows, el programa no té consola: els errors es mostren en una finestra
func alert(title, msg string) {
	box := syscall.NewLazyDLL("user32.dll").NewProc("MessageBoxW")
	t, _ := syscall.UTF16PtrFromString(title)
	m, _ := syscall.UTF16PtrFromString(msg)
	_, _, _ = box.Call(0, uintptr(unsafe.Pointer(m)), uintptr(unsafe.Pointer(t)), 0x30)
}
