package app

import (
	"context"
	"fmt"
	"log"
	"os/exec"
	"sync"
	"time"

	"edge-pulse/external/desktop/internal/platform"
)

type Service struct {
	cfg    Config
	client *Client
	ui     platform.UI
	logger *log.Logger

	mu         sync.Mutex
	lastStatus *PublicStatusResponse
	done       chan struct{}
}

func NewService(cfg Config, ui platform.UI, logger *log.Logger) *Service {
	return &Service{
		cfg:    cfg,
		client: NewClient(cfg.StatusURL),
		ui:     ui,
		logger: logger,
		done:   make(chan struct{}),
	}
}

func (s *Service) Start(ctx context.Context) error {
	if err := s.pollOnce(ctx); err != nil {
		s.logger.Printf("initial poll failed: %v", err)
	}

	go s.loop(ctx)
	return nil
}

func (s *Service) Stop(_ context.Context) error {
	select {
	case <-s.done:
	default:
		close(s.done)
	}
	return nil
}

func (s *Service) PollNow(ctx context.Context) error {
	return s.pollOnce(ctx)
}

func (s *Service) OpenDashboard() error {
	if s.cfg.DashboardURL == "" {
		return fmt.Errorf("dashboard URL is not configured")
	}
	cmd := exec.Command("xdg-open", s.cfg.DashboardURL)
	return cmd.Run()
}

func (s *Service) loop(ctx context.Context) {
	ticker := time.NewTicker(s.cfg.PollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-s.done:
			return
		case <-ticker.C:
			if err := s.pollOnce(ctx); err != nil {
				s.logger.Printf("poll failed: %v", err)
			}
		}
	}
}

func (s *Service) pollOnce(ctx context.Context) error {
	status, err := s.client.FetchStatus(ctx)
	if err != nil {
		if notifyErr := s.ui.Notify(platform.Notification{
			Title: "edge-pulse",
			Body:  fmt.Sprintf("status fetch failed: %v", err),
		}); notifyErr != nil {
			s.logger.Printf("notify failure: %v", notifyErr)
		}
		return err
	}

	if err := s.ui.SetStatus(platform.StatusViewModel{
		State:      string(status.Status),
		StatusText: status.StatusText,
		UpdatedAt:  status.UpdatedAt,
		Tooltip:    status.TooltipText(),
	}); err != nil {
		s.logger.Printf("set status failure: %v", err)
	}

	s.mu.Lock()
	previous := s.lastStatus
	s.lastStatus = &status
	s.mu.Unlock()

	if previous == nil || previous.Status != status.Status {
		if err := s.ui.Notify(platform.Notification{
			Title: "edge-pulse",
			Body:  status.NotificationBody(),
		}); err != nil {
			s.logger.Printf("notify failure: %v", err)
		}
	}

	return nil
}
