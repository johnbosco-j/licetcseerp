-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enums
CREATE TYPE user_role AS ENUM ('HOD', 'PROFESSOR', 'STUDENT');
CREATE TYPE leave_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE attendance_val AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');
CREATE TYPE asset_status AS ENUM ('OPERATIONAL', 'MAINTENANCE', 'RETIRED');
CREATE TYPE txn_type AS ENUM ('CREDIT', 'DEBIT');
CREATE TYPE risk_level AS ENUM ('SAFE', 'WATCH', 'AT_RISK', 'CRITICAL');

-- Departments
CREATE TABLE departments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  code       TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Profiles
CREATE TABLE profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  role          user_role NOT NULL DEFAULT 'STUDENT',
  department_id UUID REFERENCES departments(id),
  full_name     TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  phone         TEXT,
  avatar_url    TEXT,
  roll_no       TEXT,
  employee_id   TEXT,
  batch_year    INT,
  section       TEXT,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Subjects
CREATE TABLE subjects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT NOT NULL,
  name          TEXT NOT NULL,
  department_id UUID REFERENCES departments(id),
  semester      SMALLINT NOT NULL,
  credits       SMALLINT DEFAULT 3,
  section       TEXT,
  academic_year TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Attendance
CREATE TABLE attendance (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES profiles(id),
  subject_id UUID NOT NULL REFERENCES subjects(id),
  faculty_id UUID NOT NULL REFERENCES profiles(id),
  date       DATE NOT NULL DEFAULT CURRENT_DATE,
  status     attendance_val NOT NULL DEFAULT 'ABSENT',
  marked_via TEXT DEFAULT 'MANUAL',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (student_id, subject_id, date)
);

-- Marks
CREATE TABLE marks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     UUID NOT NULL REFERENCES profiles(id),
  subject_id     UUID NOT NULL REFERENCES subjects(id),
  faculty_id     UUID NOT NULL REFERENCES profiles(id),
  exam_type      TEXT NOT NULL,
  marks_obtained NUMERIC(5,2) NOT NULL,
  max_marks      NUMERIC(5,2) NOT NULL DEFAULT 100,
  recorded_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Finance Ledger
CREATE TABLE finance_ledger (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES departments(id),
  txn_type      txn_type NOT NULL,
  category      TEXT NOT NULL,
  amount        NUMERIC(12,2) NOT NULL,
  description   TEXT NOT NULL,
  reference_no  TEXT,
  created_by    UUID NOT NULL REFERENCES profiles(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  prev_hash     TEXT,
  entry_hash    TEXT UNIQUE,
  sequence_no   BIGSERIAL
);

-- Hash chain trigger
CREATE OR REPLACE FUNCTION compute_ledger_hash()
RETURNS TRIGGER AS $$
DECLARE prev_entry RECORD;
BEGIN
  SELECT entry_hash INTO prev_entry FROM finance_ledger
  WHERE department_id = NEW.department_id
  ORDER BY sequence_no DESC LIMIT 1;
  NEW.prev_hash := COALESCE(prev_entry.entry_hash, 'GENESIS_BLOCK_EXCELSIOR');
  NEW.entry_hash := encode(digest(
    COALESCE(prev_entry.entry_hash, 'GENESIS_BLOCK_EXCELSIOR') || '::' ||
    NEW.id::TEXT || '::' || NEW.amount::TEXT || '::' || NOW()::TEXT, 'sha256'), 'hex');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER ledger_hash_trigger
  BEFORE INSERT ON finance_ledger
  FOR EACH ROW EXECUTE FUNCTION compute_ledger_hash();

-- Leaves
CREATE TABLE leaves (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id UUID NOT NULL REFERENCES profiles(id),
  leave_type   TEXT NOT NULL,
  from_date    DATE NOT NULL,
  to_date      DATE NOT NULL,
  reason       TEXT NOT NULL,
  document_url TEXT,
  status       leave_status NOT NULL DEFAULT 'PENDING',
  reviewed_by  UUID REFERENCES profiles(id),
  review_note  TEXT,
  reviewed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Grievances
CREATE TABLE grievances (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   UUID NOT NULL REFERENCES profiles(id),
  category     TEXT NOT NULL,
  subject_line TEXT NOT NULL,
  description  TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'OPEN',
  assigned_to  UUID REFERENCES profiles(id),
  resolution   TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Inventory
CREATE TABLE inventory (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id     UUID NOT NULL REFERENCES departments(id),
  asset_tag         TEXT UNIQUE NOT NULL,
  name              TEXT NOT NULL,
  category          TEXT NOT NULL,
  status            asset_status NOT NULL DEFAULT 'OPERATIONAL',
  location          TEXT,
  purchase_date     DATE,
  purchase_value    NUMERIC(10,2),
  next_service_date DATE,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Announcements
CREATE TABLE announcements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID REFERENCES departments(id),
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,
  audience      TEXT NOT NULL DEFAULT 'ALL',
  is_urgent     BOOLEAN DEFAULT FALSE,
  expires_at    TIMESTAMPTZ,
  created_by    UUID NOT NULL REFERENCES profiles(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Placements
CREATE TABLE placements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES departments(id),
  company_name  TEXT NOT NULL,
  role_title    TEXT NOT NULL,
  package_lpa   NUMERIC(6,2),
  visit_date    DATE,
  description   TEXT,
  apply_url     TEXT,
  is_active     BOOLEAN DEFAULT TRUE,
  created_by    UUID NOT NULL REFERENCES profiles(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Student risk scores
CREATE TABLE student_risk_scores (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     UUID NOT NULL REFERENCES profiles(id) UNIQUE,
  risk_score     NUMERIC(5,2) DEFAULT 100,
  risk_level     risk_level DEFAULT 'SAFE',
  attendance_pct NUMERIC(5,2) DEFAULT 0,
  avg_marks_pct  NUMERIC(5,2) DEFAULT 0,
  grade_trend    TEXT DEFAULT 'STABLE',
  last_computed  TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_attendance_student ON attendance(student_id, date DESC);
CREATE INDEX idx_attendance_subject ON attendance(subject_id, date DESC);
CREATE INDEX idx_marks_student ON marks(student_id);
CREATE INDEX idx_finance_dept ON finance_ledger(department_id, sequence_no);
CREATE INDEX idx_profiles_section ON profiles(section);
