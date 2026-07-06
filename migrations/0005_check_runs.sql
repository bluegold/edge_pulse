CREATE TABLE check_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  check_id INTEGER NOT NULL,
  attempt_id TEXT NOT NULL,
  scheduled_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  result_state TEXT,
  dispatched_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(attempt_id),
  UNIQUE(check_id, scheduled_at),
  FOREIGN KEY (check_id) REFERENCES checks(id)
);

CREATE INDEX idx_check_runs_check_id_scheduled_at
ON check_runs(check_id, scheduled_at DESC);

CREATE INDEX idx_check_runs_attempt_id
ON check_runs(attempt_id);
