//go:build linux && !tray

package platform

import (
	"context"
	"fmt"
	"os/exec"
)

type linuxUI struct{}

func newLinuxUI() UI {
	return linuxUI{}
}

func (linuxUI) SetStatus(status StatusViewModel) error {
	fmt.Printf("[status] %s: %s (%s)\n", status.State, status.StatusText, status.UpdatedAt)
	return nil
}

func (linuxUI) Notify(notification Notification) error {
	cmd := exec.Command("notify-send", notification.Title, notification.Body)
	return cmd.Run()
}

func (linuxUI) Run(ctx context.Context, _ MenuHooks) error {
	<-ctx.Done()
	return nil
}
