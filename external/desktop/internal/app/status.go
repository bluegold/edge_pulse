package app

import "fmt"

type PublicStatusState string

const (
	StatusHealthy  PublicStatusState = "healthy"
	StatusDegraded PublicStatusState = "degraded"
	StatusDown     PublicStatusState = "down"
)

type AttentionCheck struct {
	CheckID    int    `json:"checkId"`
	CheckName  string `json:"checkName"`
	CheckURL   string `json:"checkUrl"`
	State      string `json:"state"`
	StatusCode *int   `json:"statusCode"`
	Error      string `json:"error"`
	CheckedAt  string `json:"checkedAt"`
	Certificate struct {
		Status        string `json:"status"`
		DaysRemaining *int   `json:"daysRemaining"`
		Error         string `json:"error"`
	} `json:"certificate"`
	MaintenanceEnabled bool `json:"maintenanceEnabled"`
}

type PublicStatusResponse struct {
	Status     PublicStatusState `json:"status"`
	StatusText string            `json:"statusText"`
	UpdatedAt  string            `json:"updatedAt"`
	Summary    struct {
		TotalChecks            int `json:"totalChecks"`
		OKChecks               int `json:"okChecks"`
		FailedChecks           int `json:"failedChecks"`
		CertExpiringSoonChecks int `json:"certExpiringSoonChecks"`
		CertErrorChecks        int `json:"certErrorChecks"`
		CurrentIncidentCount   int `json:"currentIncidentCount"`
	} `json:"summary"`
	Incidents []struct {
		CheckID    int    `json:"checkId"`
		CheckName  string `json:"checkName"`
		CheckURL   string `json:"checkUrl"`
		StartedAt  string `json:"startedAt"`
		Reason     string `json:"reason"`
		StatusCode *int   `json:"statusCode"`
	} `json:"incidents"`
	AttentionChecks []AttentionCheck `json:"attentionChecks"`
}

func (r PublicStatusResponse) NotificationBody() string {
	if r.Summary.CurrentIncidentCount > 0 {
		if len(r.Incidents) > 0 && r.Incidents[0].CheckName != "" {
			return r.Incidents[0].CheckName
		}
		return r.StatusText
	}
	if len(r.AttentionChecks) > 0 {
		return attentionSummary(r.AttentionChecks[0])
	}
	return r.StatusText
}

func (r PublicStatusResponse) TooltipText() string {
	if r.Summary.CurrentIncidentCount > 0 && len(r.Incidents) > 0 {
		incident := r.Incidents[0]
		if incident.Reason != "" {
			return "障害中: " + incident.CheckName + " / " + incident.Reason
		}
		return "障害中: " + incident.CheckName
	}
	if len(r.AttentionChecks) > 0 {
		return attentionSummary(r.AttentionChecks[0])
	}
	return r.StatusText
}

func attentionSummary(check AttentionCheck) string {
	if check.Certificate.Error != "" {
		return check.CheckName + ": 証明書確認失敗"
	}
	if check.Certificate.Status == "warning" && check.Certificate.DaysRemaining != nil {
		return check.CheckName + ": 証明書期限 " + itoa(*check.Certificate.DaysRemaining) + "日"
	}
	if check.MaintenanceEnabled {
		return check.CheckName + ": メンテナンス中"
	}
	if check.Error != "" {
		return check.CheckName + ": " + check.Error
	}
	return check.CheckName
}

func itoa(v int) string {
	return fmt.Sprintf("%d", v)
}
