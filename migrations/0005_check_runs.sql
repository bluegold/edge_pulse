CREATE TABLE check_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  check_id INTEGER NOT NULL,
  attempt_id TEXT NOT NULL,
  scheduled_at TEXT NOT NULL,
  started_at TEXT,
  lease_until TEXT,
  finished_at TEXT,
  result_state TEXT,
  skip_reason TEXT,
  dispatched_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(attempt_id),
  UNIQUE(check_id, scheduled_at),
  FOREIGN KEY (check_id) REFERENCES checks(id)
);

CREATE INDEX idx_check_runs_lease_until
ON check_runs(lease_until);

CREATE INDEX idx_check_runs_check_id_scheduled_at
ON check_runs(check_id, scheduled_at DESC);

CREATE INDEX idx_check_runs_attempt_id
ON check_runs(attempt_id);

ALTER TABLE check_results ADD COLUMN check_run_id INTEGER;

CREATE UNIQUE INDEX idx_check_results_check_run_id
ON check_results(check_run_id)
WHERE check_run_id IS NOT NULL;

CREATE UNIQUE INDEX idx_incidents_one_unresolved_per_check
ON incidents(check_id)
WHERE resolved_at IS NULL;
