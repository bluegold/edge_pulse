package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestListenAddrFromEnv(t *testing.T) {
	tests := []struct {
		name string
		port string
		want string
	}{
		{name: "default", port: "", want: ":8080"},
		{name: "valid port", port: "9090", want: ":9090"},
		{name: "trimmed port", port: " 3000 ", want: ":3000"},
		{name: "invalid port", port: "not-a-number", want: ":8080"},
		{name: "too small", port: "0", want: ":8080"},
		{name: "too large", port: "65536", want: ":8080"},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			if tc.port == "" {
				t.Setenv("PORT", "")
			} else {
				t.Setenv("PORT", tc.port)
			}

			if got := listenAddrFromEnv(); got != tc.want {
				t.Fatalf("unexpected listen addr: got %q want %q", got, tc.want)
			}
		})
	}
}

func TestValidateProbeInputRejectsBlockedHosts(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		host string
	}{
		{name: "localhost", host: "localhost"},
		{name: "localhost subdomain", host: "foo.localhost"},
		{name: "loopback ipv4", host: "127.0.0.1"},
		{name: "private ipv4", host: "10.0.0.1"},
		{name: "private ipv4 2", host: "192.168.0.1"},
		{name: "link local ipv4", host: "169.254.1.1"},
		{name: "loopback ipv6", host: "::1"},
		{name: "ula ipv6", host: "fc00::1"},
		{name: "link local ipv6", host: "fe80::1"},
		{name: "ipv4 mapped loopback", host: "::ffff:127.0.0.1"},
		{name: "ipv4 mapped private", host: "::ffff:10.0.0.1"},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			_, _, _, err := validateProbeInput(tc.host, 443, "")
			if err == nil {
				t.Fatalf("expected %q to be rejected", tc.host)
			}
		})
	}
}

func TestValidateProbeInputRejectsInvalidPorts(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		port int
	}{
		{name: "zero", port: 0},
		{name: "too large", port: 65536},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			_, _, _, err := validateProbeInput("example.com", tc.port, "")
			if err == nil {
				t.Fatalf("expected port %d to be rejected", tc.port)
			}
		})
	}
}

func TestValidateProbeInputAllowsPublicDomain(t *testing.T) {
	t.Parallel()

	host, port, serverName, err := validateProbeInput("example.com", 443, "")
	if err != nil {
		t.Fatalf("expected public domain to be allowed: %v", err)
	}
	if host != "example.com" {
		t.Fatalf("unexpected host: %q", host)
	}
	if port != 443 {
		t.Fatalf("unexpected port: %d", port)
	}
	if serverName != "example.com" {
		t.Fatalf("unexpected serverName: %q", serverName)
	}
}

func TestValidateProbeInputRejectsControlCharsInServerName(t *testing.T) {
	t.Parallel()

	_, _, _, err := validateProbeInput("example.com", 443, "bad\nname")
	if err == nil {
		t.Fatal("expected serverName with control characters to be rejected")
	}
}

func TestHandlerRejectsNonGET(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodPost, "/probe?host=example.com&port=443", nil)
	rec := httptest.NewRecorder()

	handler(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("unexpected status: %d", rec.Code)
	}
	if got := rec.Header().Get("Allow"); got != http.MethodGet {
		t.Fatalf("unexpected Allow header: %q", got)
	}
}
