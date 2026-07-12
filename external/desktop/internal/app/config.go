package app

import (
	"fmt"
	"os"
	"time"
)

type Config struct {
	StatusURL    string
	DashboardURL string
	PollInterval time.Duration
}

func LoadConfigFromEnv() (Config, error) {
	statusURL := os.Getenv("EDGE_PULSE_STATUS_URL")
	if statusURL == "" {
		return Config{}, fmt.Errorf("EDGE_PULSE_STATUS_URL is required")
	}

	dashboardURL := os.Getenv("EDGE_PULSE_DASHBOARD_URL")

	pollInterval := 30 * time.Second
	if raw := os.Getenv("EDGE_PULSE_POLL_INTERVAL"); raw != "" {
		parsed, err := time.ParseDuration(raw)
		if err != nil {
			return Config{}, fmt.Errorf("parse EDGE_PULSE_POLL_INTERVAL: %w", err)
		}
		if parsed <= 0 {
			return Config{}, fmt.Errorf("EDGE_PULSE_POLL_INTERVAL must be positive")
		}
		pollInterval = parsed
	}

	return Config{
		StatusURL:    statusURL,
		DashboardURL: dashboardURL,
		PollInterval: pollInterval,
	}, nil
}
