package app

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return fn(req)
}

func TestClientFetchStatus(t *testing.T) {
	client := NewClient("https://status.example.com/api/public/status")
	client.httpClient.Transport = roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.Method != http.MethodGet {
			t.Fatalf("Method = %s", r.Method)
		}
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body: io.NopCloser(strings.NewReader(
				`{"status":"degraded","statusText":"注意が必要な項目があります","updatedAt":"2026-07-12T00:00:00.000Z","summary":{"totalChecks":2,"okChecks":2,"failedChecks":0,"certExpiringSoonChecks":1,"certErrorChecks":0,"currentIncidentCount":0},"incidents":[],"attentionChecks":[]}`,
			)),
		}, nil
	})
	status, err := client.FetchStatus(context.Background())
	if err != nil {
		t.Fatalf("FetchStatus returned error: %v", err)
	}

	if status.Status != StatusDegraded {
		t.Fatalf("Status = %q", status.Status)
	}
	if status.StatusText != "注意が必要な項目があります" {
		t.Fatalf("StatusText = %q", status.StatusText)
	}
}

func TestClientFetchStatusRejectsNon200(t *testing.T) {
	client := NewClient("https://status.example.com/api/public/status")
	client.httpClient.Transport = roundTripFunc(func(r *http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusBadGateway,
			Body:       io.NopCloser(strings.NewReader("nope")),
		}, nil
	})
	_, err := client.FetchStatus(context.Background())
	if err == nil {
		t.Fatal("FetchStatus succeeded for non-200 response")
	}
}
