CREATE INDEX IF NOT EXISTS idx_status_events_to_state_check_id_occurred_at
ON status_events (to_state, check_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_checks_created_at_id
ON checks (created_at, id);
