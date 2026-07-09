CREATE INDEX idx_check_runs_pending
ON check_runs (scheduled_at, id, check_id, attempt_id)
WHERE dispatched_at IS NULL AND finished_at IS NULL;

CREATE INDEX idx_check_results_sort
ON check_results (checked_at DESC, id DESC);
