//go:build !windows

package main

import (
	"fmt"
	"os"
)

func alert(title, msg string) { fmt.Fprintln(os.Stderr, title+": "+msg) }
