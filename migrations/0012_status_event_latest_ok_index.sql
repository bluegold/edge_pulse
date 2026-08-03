CREATE INDEX IF NOT EXISTS idx_status_events_check_state_time
ON status_events(check_id, to_state, occurred_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_incidents_started_at_id
ON incidents(started_at DESC, id DESC);
