package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"edge-pulse/external/desktop/internal/app"
	"edge-pulse/external/desktop/internal/platform"
)

type serviceRunner interface {
	OpenDashboard() error
	PollNow(context.Context) error
}

var version = "dev"

func main() {
	logger := log.New(os.Stdout, "pulse-tray ", log.LstdFlags|log.Lmsgprefix)

	cfg, err := app.LoadConfigFromEnv()
	if err != nil {
		logger.Fatalf("load config: %v", err)
	}

	ui := platform.New()
	service := app.NewService(cfg, ui, logger)

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	logger.Printf("starting desktop notifier: version=%s endpoint=%s interval=%s", version, cfg.StatusURL, cfg.PollInterval)

	if err := service.Start(ctx); err != nil {
		logger.Fatalf("run notifier: %v", err)
	}

	if err := ui.Run(ctx, buildMenuHooks(ctx, cfg, service, cancel)); err != nil {
		logger.Fatalf("ui run: %v", err)
	}

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()
	if err := service.Stop(shutdownCtx); err != nil {
		logger.Printf("shutdown error: %v", err)
	}
}

func buildMenuHooks(ctx context.Context, cfg app.Config, service serviceRunner, quit func()) platform.MenuHooks {
	var openDashboard func() error
	if cfg.DashboardURL != "" {
		openDashboard = service.OpenDashboard
	}

	return platform.MenuHooks{
		Version: version,
		OpenDashboard: openDashboard,
		RefreshNow: func() error {
			return service.PollNow(ctx)
		},
		Quit: quit,
	}
}
