CREATE TABLE native_geometry (
 id TEXT PRIMARY KEY NOT NULL, owner TEXT NOT NULL, request_id TEXT NOT NULL,
 input_hash TEXT NOT NULL, input TEXT NOT NULL, status TEXT NOT NULL,
 document TEXT, report TEXT, error TEXT, execution_ms INTEGER,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX native_geometry_owner_request ON native_geometry(owner,request_id);
CREATE INDEX native_geometry_owner_created ON native_geometry(owner,created_at);
