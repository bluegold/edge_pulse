//go:build linux && tray

package platform

import (
	"context"
	"encoding/base64"
	"os/exec"
	"sync"

	"github.com/getlantern/systray"
)

const (
	healthyIconBase64  = "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAnklEQVR42u2XwQ2AMAwDOwVDsSaDgnjwq0rsOK2RsMSXu6qpkrT2J5nt2M+psOi3DCwXycDTEgo4LaGEwxIq4B1YQgl/Akmo4T2JpfChRIUAVJCzTl8igMBhgbefofCuAPOc0HuHJSInY04PXcEIwMKpGogk3RfQQmPh9DMsF2AlpG052+kkcwHb6y2HEpux7JtTscVeYLEZ2eyGFbkAIfeK3E6Kx9kAAAAASUVORK5CYII="
	degradedIconBase64 = "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAmUlEQVR42u3XUQ6AIAgGYB87WWfqXt2qS9iTWzlMQODPTTde4ROxWUozr+vccglocQhiAeAzsIbw2FOuI3T3FCCsC1BAOe8WwB0BBTwn/gvghoAC6jvfA5giqI8OB2CGgAKopBLAMAIKaCXUxHwATlJO+9UISXEuwm33Jl2QnqkWQGK0gzVS/IWwnHYzQPhDNup1C/+X+N26AbrrlVMNfceZAAAAAElFTkSuQmCC"
	downIconBase64     = "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAnklEQVR42u2XUQ7AIAhDPY33P9DusmUf+5NJKUqXrIl/zNcoQ2jtF6mj93MrzLvKwOlGGDhtIgMeNpEJh02MPr6FwKz4MPyRF/4WDxkYyQu34uF795pAzMKJN9scPalQ5lsQFB42YMFQOGVgZiJcE9CiwsBpE0tO4BM5UPoXlNaBbZWw/C2QeA3L+wGJjkiiJ5ToiiXmAonJSGY2XKELgowbZ2zlkCEAAAAASUVORK5CYII="
)

type linuxUI struct {
	ready     chan struct{}
	menuHooks MenuHooks
	mu        sync.Mutex
	last      StatusViewModel
	versionItem *systray.MenuItem
	statusItem *systray.MenuItem
	detailItem *systray.MenuItem
	updateItem *systray.MenuItem
	openItem   *systray.MenuItem
}

func newLinuxUI() UI {
	ui := &linuxUI{
		ready: make(chan struct{}),
	}

	go systray.Run(ui.onReady, ui.onExit)
	return ui
}

func (ui *linuxUI) SetStatus(status StatusViewModel) error {
	ui.mu.Lock()
	ui.last = status
	ui.mu.Unlock()

	<-ui.ready
	tooltip := status.StatusText
	if status.Tooltip != "" {
		tooltip = status.Tooltip
	}
	systray.SetTooltip(tooltip)
	systray.SetTitle("")

	switch status.State {
	case "down":
		systray.SetIcon(decodeIcon(downIconBase64))
	case "degraded":
		systray.SetIcon(decodeIcon(degradedIconBase64))
	default:
		systray.SetIcon(decodeIcon(healthyIconBase64))
	}

	if ui.statusItem != nil {
		ui.statusItem.SetTitle("状態: " + status.State)
	}
	if ui.detailItem != nil {
		detail := status.StatusText
		if status.Tooltip != "" {
			detail = status.Tooltip
		}
		ui.detailItem.SetTitle("詳細: " + limitMenuText(detail))
	}
	if ui.updateItem != nil {
		ui.updateItem.SetTitle("更新: " + formatUpdatedAt(status.UpdatedAt))
	}

	return nil
}

func (ui *linuxUI) Notify(notification Notification) error {
	cmd := exec.Command("notify-send", notification.Title, notification.Body)
	return cmd.Run()
}

func (ui *linuxUI) Run(ctx context.Context, hooks MenuHooks) error {
	ui.menuHooks = hooks
	if ui.openItem != nil {
		if hooks.OpenDashboard == nil {
			ui.openItem.Disable()
		} else {
			ui.openItem.Enable()
		}
	}

	select {
	case <-ctx.Done():
		systray.Quit()
		return nil
	}
}

func (ui *linuxUI) onReady() {
	systray.SetTitle("")
	systray.SetTooltip("edge-pulse")
	systray.SetIcon(decodeIcon(healthyIconBase64))

	ui.versionItem = systray.AddMenuItem("edge-pulse " + displayVersion(ui.menuHooks.Version), "Application version")
	ui.versionItem.Disable()
	ui.statusItem = systray.AddMenuItem("状態: unknown", "Current state")
	ui.statusItem.Disable()
	ui.detailItem = systray.AddMenuItem("詳細: 取得待ち", "Current detail")
	ui.detailItem.Disable()
	ui.updateItem = systray.AddMenuItem("更新: -", "Last update")
	ui.updateItem.Disable()
	systray.AddSeparator()
	ui.openItem = systray.AddMenuItem("Open Dashboard", "Open dashboard in browser")
	if ui.menuHooks.OpenDashboard == nil {
		ui.openItem.Disable()
	}
	refreshItem := systray.AddMenuItem("Refresh Now", "Fetch current status immediately")
	systray.AddSeparator()
	quitItem := systray.AddMenuItem("Quit", "Quit edge-pulse")

	close(ui.ready)

	go func() {
		for {
			select {
			case <-ui.openItem.ClickedCh:
				if ui.menuHooks.OpenDashboard != nil {
					_ = ui.menuHooks.OpenDashboard()
				}
			case <-refreshItem.ClickedCh:
				if ui.menuHooks.RefreshNow != nil {
					_ = ui.menuHooks.RefreshNow()
				}
			case <-quitItem.ClickedCh:
				if ui.menuHooks.Quit != nil {
					ui.menuHooks.Quit()
				}
				systray.Quit()
				return
			}
		}
	}()
}

func (ui *linuxUI) onExit() {}

func decodeIcon(value string) []byte {
	decoded, err := base64.StdEncoding.DecodeString(value)
	if err != nil {
		return nil
	}
	return decoded
}

func limitMenuText(value string) string {
	runes := []rune(value)
	if len(runes) <= 48 {
		return value
	}
	return string(runes[:48]) + "..."
}

func formatUpdatedAt(value string) string {
	if value == "" {
		return "-"
	}
	if len(value) >= 16 {
		return value[:16] + "Z"
	}
	return value
}

func displayVersion(value string) string {
	if value == "" {
		return "dev"
	}
	return value
}
