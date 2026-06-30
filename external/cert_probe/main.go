package main

import (
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"strconv"
	"time"
)

type CertResult struct {
	Host          string `json:"host"`
	Port          int    `json:"port"`
	ServerName    string `json:"servername"`
	Subject       string `json:"subject,omitempty"`
	Issuer        string `json:"issuer,omitempty"`
	Class         string `json:"class,omitempty"`
	ValidFrom     string `json:"valid_from,omitempty"`
	ValidTo       string `json:"valid_to,omitempty"`
	DaysRemaining int    `json:"days_remaining,omitempty"`
	DNSNames      []string `json:"dns_names,omitempty"`
	Error         string `json:"error,omitempty"`
}

type ProbeLog struct {
	Timestamp string      `json:"timestamp"`
	Event     string      `json:"event"`
	Method    string      `json:"method"`
	Path      string      `json:"path"`
	Query     string      `json:"query,omitempty"`
	Status    int         `json:"status"`
	Duration  int64       `json:"duration_ms"`
	Result    CertResult  `json:"result"`
	Error     string      `json:"error,omitempty"`
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

	dialer := &net.Dialer{Timeout: 5 * time.Second}
	conn, err := tls.DialWithDialer(dialer, "tcp", net.JoinHostPort(host, strconv.Itoa(port)), &tls.Config{
		ServerName:         serverName,
		InsecureSkipVerify: true, // 期限切れ・自己署名でも証明書自体は取得する
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

func handler(w http.ResponseWriter, r *http.Request) {
	started := time.Now()
	q := r.URL.Query()
	host := q.Get("host")
	serverName := q.Get("servername")

	port := 443
	if p := q.Get("port"); p != "" {
		parsed, err := strconv.Atoi(p)
		if err != nil {
			result := CertResult{Host: host, Error: errors.New("invalid port").Error()}
			logProbe(r, http.StatusBadRequest, time.Since(started), result)
			writeJSON(w, http.StatusBadRequest, result)
			return
		}
		port = parsed
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

func main() {
	http.HandleFunc("/ping", pingHandler)
	http.HandleFunc("/probe", handler)
	http.ListenAndServe(":8080", nil)
}
