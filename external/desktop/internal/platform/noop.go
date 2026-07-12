package platform

import "context"

type noopUI struct{}

func newNoopUI() UI {
	return noopUI{}
}

func (noopUI) SetStatus(StatusViewModel) error {
	return nil
}

func (noopUI) Notify(Notification) error {
	return nil
}

func (noopUI) Run(context.Context, MenuHooks) error {
	return nil
}
