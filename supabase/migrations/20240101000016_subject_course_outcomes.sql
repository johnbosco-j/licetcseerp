-- Course outcomes (CO1–CO6) per subject, used by the curriculum module.
-- These columns already exist on the live database; this keeps new setups in sync.
ALTER TABLE subjects
  ADD COLUMN IF NOT EXISTS co1 TEXT, ADD COLUMN IF NOT EXISTS co2 TEXT, ADD COLUMN IF NOT EXISTS co3 TEXT,
  ADD COLUMN IF NOT EXISTS co4 TEXT, ADD COLUMN IF NOT EXISTS co5 TEXT, ADD COLUMN IF NOT EXISTS co6 TEXT;
