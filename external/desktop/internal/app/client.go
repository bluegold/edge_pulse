package app

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
)

type Client struct {
	httpClient *http.Client
	statusURL  string
}

func NewClient(statusURL string) *Client {
	return &Client{
		httpClient: &http.Client{},
		statusURL:  statusURL,
	}
}

func (c *Client) FetchStatus(ctx context.Context) (PublicStatusResponse, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.statusURL, nil)
	if err != nil {
		return PublicStatusResponse{}, fmt.Errorf("build request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return PublicStatusResponse{}, fmt.Errorf("fetch status: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return PublicStatusResponse{}, fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}

	var payload PublicStatusResponse
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return PublicStatusResponse{}, fmt.Errorf("decode status response: %w", err)
	}

	return payload, nil
}
