package app

import (
	"testing"
	"time"
)

func TestLoadConfigFromEnv(t *testing.T) {
	t.Setenv("EDGE_PULSE_STATUS_URL", "https://status.example.com/api/public/status")
	t.Setenv("EDGE_PULSE_DASHBOARD_URL", "https://dashboard.example.com")
	t.Setenv("EDGE_PULSE_POLL_INTERVAL", "45s")

	cfg, err := LoadConfigFromEnv()
	if err != nil {
		t.Fatalf("LoadConfigFromEnv returned error: %v", err)
	}

	if cfg.StatusURL != "https://status.example.com/api/public/status" {
		t.Fatalf("StatusURL = %q", cfg.StatusURL)
	}
	if cfg.DashboardURL != "https://dashboard.example.com" {
		t.Fatalf("DashboardURL = %q", cfg.DashboardURL)
	}
	if cfg.PollInterval != 45*time.Second {
		t.Fatalf("PollInterval = %s", cfg.PollInterval)
	}
}

func TestLoadConfigFromEnvRequiresStatusURL(t *testing.T) {
	t.Setenv("EDGE_PULSE_STATUS_URL", "")

	_, err := LoadConfigFromEnv()
	if err == nil {
		t.Fatal("LoadConfigFromEnv succeeded without status URL")
	}
}

func TestLoadConfigFromEnvDefaultsPollInterval(t *testing.T) {
	t.Setenv("EDGE_PULSE_STATUS_URL", "https://status.example.com/api/public/status")
	t.Setenv("EDGE_PULSE_DASHBOARD_URL", "")
	t.Setenv("EDGE_PULSE_POLL_INTERVAL", "")

	cfg, err := LoadConfigFromEnv()
	if err != nil {
		t.Fatalf("LoadConfigFromEnv returned error: %v", err)
	}

	if cfg.PollInterval != 30*time.Second {
		t.Fatalf("PollInterval = %s", cfg.PollInterval)
	}
}

func TestLoadConfigFromEnvRejectsInvalidPollInterval(t *testing.T) {
	t.Setenv("EDGE_PULSE_STATUS_URL", "https://status.example.com/api/public/status")
	t.Setenv("EDGE_PULSE_POLL_INTERVAL", "0s")

	_, err := LoadConfigFromEnv()
	if err == nil {
		t.Fatal("LoadConfigFromEnv succeeded with invalid poll interval")
	}
}
