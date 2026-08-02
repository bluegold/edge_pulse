CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  identity_provider TEXT NOT NULL,
  identity_subject TEXT NOT NULL,
  display_name TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'superadmin')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(identity_provider, identity_subject)
);

CREATE TABLE groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO groups (id, name, slug)
VALUES (1, '未割り当て', 'orphan');

CREATE TABLE group_members (
  group_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (group_id, user_id),
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

ALTER TABLE checks ADD COLUMN group_id INTEGER REFERENCES groups(id);

UPDATE checks
SET group_id = 1
WHERE group_id IS NULL;

CREATE INDEX idx_group_members_user_id
ON group_members(user_id, group_id);

CREATE INDEX idx_checks_group_id
ON checks(group_id, id);
