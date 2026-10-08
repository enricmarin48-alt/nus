#!/bin/sh
# Compila NotesGim (el programa amb l'app a dins) per a Windows, Mac i Linux (cal Go 1.22 o més nou).
# Si canvies l'app (../index.html), torna a compilar.
#   sh build.sh        → deixa els programes a dist/
# NOTESGIM_VERSION (opcional): la versió que surt al programa (la publicació automàtica hi posa la data i el commit)
set -e
cd "$(dirname "$0")"
mkdir -p web/icons dist
cp ../index.html web/index.html
cp ../icons/*.png web/icons/
export CGO_ENABLED=0
V="-X 'main.appVersion=${NOTESGIM_VERSION:-1.1}'"
# a Windows sense finestra de consola: s'obre directament la finestra de l'app
GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "-s -w -H=windowsgui $V" -o dist/NotesGim.exe .
GOOS=darwin  GOARCH=arm64 go build -trimpath -ldflags "-s -w $V" -o dist/NotesGim-mac-applesilicon .
GOOS=darwin  GOARCH=amd64 go build -trimpath -ldflags "-s -w $V" -o dist/NotesGim-mac-intel .
GOOS=linux   GOARCH=amd64 go build -trimpath -ldflags "-s -w $V" -o dist/NotesGim-linux .
ls -la dist
