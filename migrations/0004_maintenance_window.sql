ALTER TABLE checks ADD COLUMN maintenance_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE checks ADD COLUMN maintenance_until TEXT;
