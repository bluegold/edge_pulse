package platform

import (
	"context"
	"runtime"
)

type StatusViewModel struct {
	State      string
	StatusText string
	UpdatedAt  string
	Tooltip    string
}

type Notification struct {
	Title string
	Body  string
}

type MenuHooks struct {
	Version       string
	OpenDashboard func() error
	RefreshNow    func() error
	Quit          func()
}

type UI interface {
	SetStatus(StatusViewModel) error
	Notify(Notification) error
	Run(context.Context, MenuHooks) error
}

func New() UI {
	switch runtime.GOOS {
	case "linux":
		return newLinuxUI()
	default:
		return newNoopUI()
	}
}
