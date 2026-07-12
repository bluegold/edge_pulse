package main

import (
	"context"
	"errors"
	"testing"

	"edge-pulse/external/desktop/internal/app"
)

type stubService struct {
	openCalls int
	pollCalls int
	pollErr   error
}

func (s *stubService) OpenDashboard() error {
	s.openCalls++
	return nil
}

func (s *stubService) PollNow(context.Context) error {
	s.pollCalls++
	return s.pollErr
}

func TestBuildMenuHooksDisablesDashboardWhenURLIsEmpty(t *testing.T) {
	service := &stubService{}
	hooks := buildMenuHooks(context.Background(), app.Config{}, service, func() {})

	if hooks.Version != version {
		t.Fatalf("Version = %q", hooks.Version)
	}
	if hooks.OpenDashboard != nil {
		t.Fatal("OpenDashboard should be nil when dashboard URL is empty")
	}
}

func TestBuildMenuHooksWiresActions(t *testing.T) {
	service := &stubService{pollErr: errors.New("boom")}
	quitCalled := false
	hooks := buildMenuHooks(context.Background(), app.Config{
		DashboardURL: "https://dashboard.example.com",
	}, service, func() {
		quitCalled = true
	})

	if hooks.OpenDashboard == nil {
		t.Fatal("OpenDashboard should be set")
	}
	if err := hooks.OpenDashboard(); err != nil {
		t.Fatalf("OpenDashboard returned error: %v", err)
	}
	if service.openCalls != 1 {
		t.Fatalf("openCalls = %d", service.openCalls)
	}

	if err := hooks.RefreshNow(); !errors.Is(err, service.pollErr) {
		t.Fatalf("RefreshNow error = %v", err)
	}
	if service.pollCalls != 1 {
		t.Fatalf("pollCalls = %d", service.pollCalls)
	}

	hooks.Quit()
	if !quitCalled {
		t.Fatal("Quit was not called")
	}
}
