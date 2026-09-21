CREATE TABLE IF NOT EXISTS participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  participant_uid TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  institution TEXT NOT NULL,
  latest_degree TEXT NOT NULL,
  years_experience INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assignments (
  id TEXT PRIMARY KEY,
  participant_uid TEXT NOT NULL,
  session_id TEXT NOT NULL,
  stratum_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'completed')),
  study_version TEXT NOT NULL,
  assigned_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE(participant_uid, stratum_id),
  UNIQUE(participant_uid, session_id),
  UNIQUE(participant_uid, ordinal)
);

CREATE TABLE IF NOT EXISTS ratings (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL UNIQUE,
  participant_uid TEXT NOT NULL,
  participant_email TEXT NOT NULL,
  session_id TEXT NOT NULL,
  stratum_id TEXT NOT NULL,
  scores_json TEXT NOT NULL,
  total_score INTEGER NOT NULL CHECK (total_score BETWEEN 0 AND 66),
  comments TEXT,
  started_at_utc TEXT NOT NULL,
  timestamp_utc TEXT NOT NULL,
  duration_seconds INTEGER,
  user_agent TEXT,
  page_url TEXT,
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(participant_uid, session_id),
  UNIQUE(participant_uid, stratum_id)
);

CREATE INDEX IF NOT EXISTS idx_assignments_participant ON assignments(participant_uid);
CREATE INDEX IF NOT EXISTS idx_assignments_stratum ON assignments(stratum_id);
CREATE INDEX IF NOT EXISTS idx_ratings_participant ON ratings(participant_uid);
CREATE INDEX IF NOT EXISTS idx_ratings_session ON ratings(session_id);
CREATE INDEX IF NOT EXISTS idx_ratings_stratum ON ratings(stratum_id);
