package app

import "testing"

func TestNotificationBodyUsesIncidentName(t *testing.T) {
	response := PublicStatusResponse{
		StatusText: "障害を検知しています",
	}
	response.Summary.CurrentIncidentCount = 1
	response.Incidents = []struct {
		CheckID    int    `json:"checkId"`
		CheckName  string `json:"checkName"`
		CheckURL   string `json:"checkUrl"`
		StartedAt  string `json:"startedAt"`
		Reason     string `json:"reason"`
		StatusCode *int   `json:"statusCode"`
	}{
		{CheckName: "api-a", Reason: "http_status"},
	}

	if got := response.NotificationBody(); got != "api-a" {
		t.Fatalf("NotificationBody = %q", got)
	}
	if got := response.TooltipText(); got != "障害中: api-a / http_status" {
		t.Fatalf("TooltipText = %q", got)
	}
}

func TestNotificationBodyUsesCertificateWarning(t *testing.T) {
	days := 9
	response := PublicStatusResponse{
		StatusText: "注意が必要な項目があります",
		AttentionChecks: []AttentionCheck{
			{
				CheckName: "api-b",
				Certificate: struct {
					Status        string `json:"status"`
					DaysRemaining *int   `json:"daysRemaining"`
					Error         string `json:"error"`
				}{
					Status:        "warning",
					DaysRemaining: &days,
				},
			},
		},
	}

	want := "api-b: 証明書期限 9日"
	if got := response.NotificationBody(); got != want {
		t.Fatalf("NotificationBody = %q", got)
	}
	if got := response.TooltipText(); got != want {
		t.Fatalf("TooltipText = %q", got)
	}
}

func TestNotificationBodyUsesMaintenanceAndErrorFallbacks(t *testing.T) {
	response := PublicStatusResponse{
		StatusText: "注意が必要な項目があります",
		AttentionChecks: []AttentionCheck{
			{
				CheckName:          "api-c",
				MaintenanceEnabled: true,
			},
		},
	}

	if got := response.NotificationBody(); got != "api-c: メンテナンス中" {
		t.Fatalf("NotificationBody = %q", got)
	}

	response.AttentionChecks = []AttentionCheck{
		{
			CheckName: "api-d",
			Error:     "DNS lookup failed",
		},
	}

	if got := response.NotificationBody(); got != "api-d: DNS lookup failed" {
		t.Fatalf("NotificationBody = %q", got)
	}
}
