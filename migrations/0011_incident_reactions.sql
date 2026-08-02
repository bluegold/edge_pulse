CREATE TABLE IF NOT EXISTS incident_reactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction_key TEXT NOT NULL CHECK (reaction_key IN ('investigating', 'responding', 'acknowledged')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (incident_id, user_id, reaction_key)
);

CREATE INDEX IF NOT EXISTS idx_incident_reactions_incident_id
ON incident_reactions(incident_id, reaction_key);

CREATE INDEX IF NOT EXISTS idx_incident_reactions_user_id
ON incident_reactions(user_id, incident_id);
