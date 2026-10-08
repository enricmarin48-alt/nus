#!/bin/sh
# Compila el servidor de NotesGim per a Windows, Mac i Linux (cal Go 1.22 o més nou).
# El programa porta l'app (../index.html) a dins: si canvies l'app, torna a compilar.
#   sh build.sh        → deixa els programes a dist/
set -e
cd "$(dirname "$0")"
mkdir -p web dist
cp ../index.html web/index.html
export CGO_ENABLED=0
GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "-s -w" -o dist/NotesGim-servidor-windows.exe .
GOOS=darwin  GOARCH=arm64 go build -trimpath -ldflags "-s -w" -o dist/NotesGim-servidor-mac-applesilicon .
GOOS=darwin  GOARCH=amd64 go build -trimpath -ldflags "-s -w" -o dist/NotesGim-servidor-mac-intel .
GOOS=linux   GOARCH=amd64 go build -trimpath -ldflags "-s -w" -o dist/NotesGim-servidor-linux .
ls -la dist
