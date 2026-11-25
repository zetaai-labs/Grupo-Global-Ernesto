-- SCORM 1.2 / SCORM 2004 / xAPI (Tin Can) course packages for Courses & Events.
-- A course can carry one package. Each learner has one attempt per package; its runtime
-- data (cmi.*) is stored as JSON. xAPI packages report to a minimal built-in LRS.

CREATE TABLE IF NOT EXISTS course_packages (
  package_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL UNIQUE REFERENCES community_events_courses(item_id) ON DELETE CASCADE,
  standard TEXT NOT NULL CHECK (standard IN ('SCORM_12', 'SCORM_2004', 'XAPI')),
  title VARCHAR(255),
  launch_path TEXT NOT NULL,
  activity_id TEXT,
  mastery_score INT CHECK (mastery_score BETWEEN 0 AND 100),
  file_count INT NOT NULL DEFAULT 0,
  total_bytes BIGINT NOT NULL DEFAULT 0,
  original_name VARCHAR(255),
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS course_attempts (
  attempt_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES course_packages(package_id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cmi JSONB NOT NULL DEFAULT '{}'::jsonb,
  lesson_status TEXT NOT NULL DEFAULT 'not attempted',
  score INT CHECK (score BETWEEN 0 AND 100),
  total_seconds INT NOT NULL DEFAULT 0,
  launches INT NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (package_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_course_attempts_user ON course_attempts(user_id);

CREATE TABLE IF NOT EXISTS xapi_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id UUID NOT NULL UNIQUE,
  attempt_id UUID NOT NULL REFERENCES course_attempts(attempt_id) ON DELETE CASCADE,
  verb TEXT NOT NULL,
  statement JSONB NOT NULL,
  stored_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_xapi_statements_attempt ON xapi_statements(attempt_id);

CREATE TABLE IF NOT EXISTS xapi_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL REFERENCES course_attempts(attempt_id) ON DELETE CASCADE,
  activity_id TEXT NOT NULL,
  state_id TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'application/json',
  body TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, activity_id, state_id)
);
