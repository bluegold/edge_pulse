package main

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/netip"
	"os"
	"strconv"
	"strings"
	"time"
	"unicode"
)

type CertResult struct {
	Host          string   `json:"host"`
	Port          int      `json:"port"`
	ServerName    string   `json:"servername"`
	Subject       string   `json:"subject,omitempty"`
	Issuer        string   `json:"issuer,omitempty"`
	Class         string   `json:"class,omitempty"`
	ValidFrom     string   `json:"valid_from,omitempty"`
	ValidTo       string   `json:"valid_to,omitempty"`
	DaysRemaining int      `json:"days_remaining,omitempty"`
	DNSNames      []string `json:"dns_names,omitempty"`
	Error         string   `json:"error,omitempty"`
}

type ProbeLog struct {
	Timestamp string     `json:"timestamp"`
	Event     string     `json:"event"`
	Method    string     `json:"method"`
	Path      string     `json:"path"`
	Query     string     `json:"query,omitempty"`
	Status    int        `json:"status"`
	Duration  int64      `json:"duration_ms"`
	Result    CertResult `json:"result"`
	Error     string     `json:"error,omitempty"`
}

var lookupIPAddrs = func(ctx context.Context, host string) ([]netip.Addr, error) {
	addrs, err := net.DefaultResolver.LookupIPAddr(ctx, host)
	if err != nil {
		return nil, err
	}

	resolved := make([]netip.Addr, 0, len(addrs))
	for _, addr := range addrs {
		if ip, ok := netip.AddrFromSlice(addr.IP); ok {
			resolved = append(resolved, ip.Unmap())
		}
	}

	return resolved, nil
}

func probeCert(host string, port int, serverName string) CertResult {
	result := CertResult{
		Host:       host,
		Port:       port,
		ServerName: serverName,
	}

	if host == "" {
		result.Error = "host is required"
		return result
	}
	if port <= 0 {
		port = 443
		result.Port = port
	}
	if serverName == "" {
		serverName = host
		result.ServerName = serverName
	}

	dialAddr, err := resolveProbeDialAddr(host, port)
	if err != nil {
		result.Error = err.Error()
		return result
	}

	dialer := &net.Dialer{Timeout: 5 * time.Second}
	conn, err := tls.DialWithDialer(dialer, "tcp", dialAddr, &tls.Config{
		ServerName: serverName,
		// InsecureSkipVerify is used only to retrieve the peer certificate
		// even when it is expired or self-signed. This probe does not treat
		// the connection as certificate-verified.
		InsecureSkipVerify: true,
	})
	if err != nil {
		result.Error = err.Error()
		return result
	}
	defer conn.Close()

	certs := conn.ConnectionState().PeerCertificates
	if len(certs) == 0 {
		result.Error = "no peer certificates"
		return result
	}

	cert := certs[0]
	result.Subject = cert.Subject.String()
	result.Issuer = cert.Issuer.String()
	result.Class = fmt.Sprint(cert.PublicKeyAlgorithm)
	result.ValidFrom = cert.NotBefore.UTC().Format(time.RFC3339)
	result.ValidTo = cert.NotAfter.UTC().Format(time.RFC3339)
	result.DaysRemaining = int(time.Until(cert.NotAfter).Hours() / 24)
	result.DNSNames = cert.DNSNames

	return result
}

func resolveProbeDialAddr(host string, port int) (string, error) {
	if addr, err := netip.ParseAddr(host); err == nil {
		if isBlockedIP(addr) {
			return "", fmt.Errorf("host is not allowed")
		}
		return net.JoinHostPort(addr.String(), strconv.Itoa(port)), nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	addrs, err := lookupIPAddrs(ctx, host)
	if err != nil {
		return "", fmt.Errorf("failed to resolve host: %w", err)
	}
	if len(addrs) == 0 {
		return "", fmt.Errorf("failed to resolve host")
	}

	for _, addr := range addrs {
		if isBlockedIP(addr) {
			return "", fmt.Errorf("host resolved to blocked address")
		}
	}

	return net.JoinHostPort(addrs[0].String(), strconv.Itoa(port)), nil
}

func validateProbeInput(host string, port int, serverName string) (string, int, string, error) {
	if host == "" {
		return "", 0, "", fmt.Errorf("host is required")
	}
	if hasControlChars(host) {
		return "", 0, "", fmt.Errorf("invalid host")
	}
	if port < 1 || port > 65535 {
		return "", 0, "", fmt.Errorf("invalid port")
	}
	if isBlockedHost(host) {
		return "", 0, "", fmt.Errorf("host is not allowed")
	}

	if serverName == "" {
		serverName = host
	}
	if hasControlChars(serverName) {
		return "", 0, "", fmt.Errorf("invalid serverName")
	}

	return host, port, serverName, nil
}

func hasControlChars(s string) bool {
	return strings.IndexFunc(s, unicode.IsControl) >= 0
}

func isBlockedHost(host string) bool {
	lower := strings.ToLower(strings.TrimSuffix(host, "."))
	if lower == "localhost" || strings.HasSuffix(lower, ".localhost") {
		return true
	}

	addr, err := netip.ParseAddr(host)
	if err != nil {
		return false
	}
	if addr.Is4In6() {
		return isBlockedIP(addr.Unmap())
	}
	return isBlockedIP(addr)
}

func isBlockedIP(addr netip.Addr) bool {
	if addr.IsLoopback() || addr.IsUnspecified() || addr.IsLinkLocalUnicast() || addr.IsMulticast() || addr.IsPrivate() {
		return true
	}

	if !addr.Is4() {
		return false
	}

	octets := addr.As4()
	return octets[0] == 100 && octets[1]&0xc0 == 0x40
}

func handler(w http.ResponseWriter, r *http.Request) {
	started := time.Now()
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		result := CertResult{Error: "method not allowed"}
		logProbe(r, http.StatusMethodNotAllowed, time.Since(started), result)
		writeJSON(w, http.StatusMethodNotAllowed, result)
		return
	}

	q := r.URL.Query()
	origHost := q.Get("host")
	origServerName := q.Get("servername")
	host := origHost
	serverName := origServerName

	port := 443
	if p := q.Get("port"); p != "" {
		parsed, err := strconv.Atoi(p)
		if err != nil {
			result := CertResult{Host: origHost, Port: port, ServerName: origServerName, Error: "invalid port"}
			logProbe(r, http.StatusBadRequest, time.Since(started), result)
			writeJSON(w, http.StatusBadRequest, result)
			return
		}
		port = parsed
	}

	host, port, serverName, err := validateProbeInput(host, port, serverName)
	if err != nil {
		result := CertResult{Host: origHost, Port: port, ServerName: origServerName, Error: err.Error()}
		logProbe(r, http.StatusBadRequest, time.Since(started), result)
		writeJSON(w, http.StatusBadRequest, result)
		return
	}

	result := probeCert(host, port, serverName)
	status := http.StatusOK
	if result.Error != "" {
		status = http.StatusBadGateway
	}
	logProbe(r, status, time.Since(started), result)
	writeJSON(w, status, result)
}

func pingHandler(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func logProbe(r *http.Request, status int, duration time.Duration, result CertResult) {
	entry := ProbeLog{
		Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
		Event:     "probe",
		Method:    r.Method,
		Path:      r.URL.Path,
		Query:     r.URL.RawQuery,
		Status:    status,
		Duration:  duration.Milliseconds(),
		Result:    result,
	}

	if result.Error != "" {
		entry.Error = result.Error
	}

	encoder := json.NewEncoder(os.Stdout)
	_ = encoder.Encode(entry)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("content-type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func listenAddrFromEnv() string {
	port := 8080
	if raw := strings.TrimSpace(os.Getenv("PORT")); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed >= 1 && parsed <= 65535 {
			port = parsed
		}
	}

	return ":" + strconv.Itoa(port)
}

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/ping", pingHandler)
	mux.HandleFunc("/probe", handler)

	server := &http.Server{
		Addr:              listenAddrFromEnv(),
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       30 * time.Second,
	}
	_ = server.ListenAndServe()
}
