CREATE TABLE checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'GET',
  enabled INTEGER NOT NULL DEFAULT 1,
  expected_status_min INTEGER NOT NULL DEFAULT 200,
  expected_status_max INTEGER NOT NULL DEFAULT 399,
  timeout_ms INTEGER NOT NULL DEFAULT 10000,
  interval_minutes INTEGER NOT NULL DEFAULT 5,
  next_check_at TEXT,
  last_enqueued_at TEXT,
  last_checked_at TEXT,
  last_state TEXT NOT NULL DEFAULT 'unknown',
  last_status_code INTEGER,
  last_latency_ms INTEGER,
  last_error TEXT,
  fail_threshold INTEGER NOT NULL DEFAULT 2,
  recovery_threshold INTEGER NOT NULL DEFAULT 1,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  consecutive_successes INTEGER NOT NULL DEFAULT 0,
  first_failure_at TEXT,
  first_success_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_checks_enabled_next_check_at
ON checks(enabled, next_check_at);

CREATE TABLE check_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  check_id INTEGER NOT NULL,
  state TEXT NOT NULL,
  status_code INTEGER,
  latency_ms INTEGER,
  error TEXT,
  checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (check_id) REFERENCES checks(id)
);

CREATE INDEX idx_check_results_check_id_checked_at
ON check_results(check_id, checked_at DESC);

CREATE TABLE status_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  check_id INTEGER NOT NULL,
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,
  reason TEXT,
  status_code INTEGER,
  error TEXT,
  latency_ms INTEGER,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (check_id) REFERENCES checks(id)
);

CREATE INDEX idx_status_events_check_id_occurred_at
ON status_events(check_id, occurred_at DESC);

CREATE TABLE incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  check_id INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  resolved_at TEXT,
  start_reason TEXT,
  end_reason TEXT,
  start_status_code INTEGER,
  end_status_code INTEGER,
  failure_count INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (check_id) REFERENCES checks(id)
);

CREATE INDEX idx_incidents_check_id_started_at
ON incidents(check_id, started_at DESC);

CREATE INDEX idx_incidents_unresolved
ON incidents(check_id)
WHERE resolved_at IS NULL;
