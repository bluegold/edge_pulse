set shell := ["bash", "-cu"]

desktop_dir := "external/desktop"
cert_probe_dir := "external/cert_probe"
desktop_version := `git describe --tags --always --dirty 2>/dev/null || echo dev`

default:
  @just --list

check:
  npm run check
  npm run typecheck

test-web:
  npm run test

test: test-web test-desktop test-cert-probe

test-tray:
  @just test-desktop-tray

verify: check test test-tray

build-desktop:
  cd {{desktop_dir}} && GOCACHE="$(pwd)/../.tmp-go-build-cache" go build -ldflags "-X main.version={{desktop_version}}" -o edge-pulse-desktop ./cmd/pulse-tray

build-desktop-tray:
  cd {{desktop_dir}} && GOCACHE="$(pwd)/../.tmp-go-build-cache" go build -tags tray -ldflags "-X main.version={{desktop_version}}" -o pulse-tray ./cmd/pulse-tray

test-desktop:
  cd {{desktop_dir}} && GOCACHE="$(pwd)/../.tmp-go-build-cache" go test ./...

test-desktop-tray:
  cd {{desktop_dir}} && GOCACHE="$(pwd)/../.tmp-go-build-cache" go test -tags tray ./...

build-cert-probe:
  cd {{cert_probe_dir}} && GOCACHE="$(pwd)/../.tmp-go-build-cache" go build -o cert-probe .

test-cert-probe:
  cd {{cert_probe_dir}} && GOCACHE="$(pwd)/../.tmp-go-build-cache" go test ./...
