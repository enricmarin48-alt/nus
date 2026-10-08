#!/bin/sh
# Compila NotesGim (el programa amb l'app a dins) per a Windows, Mac i Linux (cal Go 1.22 o més nou).
# Si canvies l'app (../index.html), torna a compilar.
#   sh build.sh        → deixa els programes a dist/
set -e
cd "$(dirname "$0")"
mkdir -p web dist
cp ../index.html web/index.html
export CGO_ENABLED=0
# a Windows sense finestra de consola: s'obre directament la finestra de l'app
GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "-s -w -H=windowsgui" -o dist/NotesGim.exe .
GOOS=darwin  GOARCH=arm64 go build -trimpath -ldflags "-s -w" -o dist/NotesGim-mac-applesilicon .
GOOS=darwin  GOARCH=amd64 go build -trimpath -ldflags "-s -w" -o dist/NotesGim-mac-intel .
GOOS=linux   GOARCH=amd64 go build -trimpath -ldflags "-s -w" -o dist/NotesGim-linux .
ls -la dist
