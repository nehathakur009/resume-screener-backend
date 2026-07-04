-- Create database
CREATE DATABASE resume_screener;

-- Connect to the database
\c resume_screener;

-- Create tables
CREATE TABLE candidates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE resumes (
  id SERIAL PRIMARY KEY,
  candidate_id INTEGER REFERENCES candidates(id) ON DELETE CASCADE,
  original_filename VARCHAR(500) UNIQUE,
  raw_text TEXT,
  file_size INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE parsed_profiles (
  id SERIAL PRIMARY KEY,
  resume_id INTEGER UNIQUE REFERENCES resumes(id) ON DELETE CASCADE,
  roles JSONB,
  education JSONB,
  skills JSONB,
  certifications JSONB,
  summary TEXT,
  total_experience_years FLOAT,
  structural_flags JSONB,
  parsed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE job_descriptions (
  id SERIAL PRIMARY KEY,
  title VARCHAR(500),
  description TEXT,
  criteria JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE scoring_records (
  id SERIAL PRIMARY KEY,
  resume_id INTEGER REFERENCES resumes(id) ON DELETE CASCADE,
  jd_id INTEGER REFERENCES job_descriptions(id) ON DELETE CASCADE,
  total_score FLOAT,
  criterion_breakdown JSONB,
  flags JSONB,
  overall_rationale TEXT,
  rank INTEGER,
  scored_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(resume_id, jd_id)
);

-- Create indexes for performance
CREATE INDEX idx_resumes_candidate_id ON resumes(candidate_id);
CREATE INDEX idx_parsed_profiles_resume_id ON parsed_profiles(resume_id);
CREATE INDEX idx_scoring_records_resume_id ON scoring_records(resume_id);
CREATE INDEX idx_scoring_records_jd_id ON scoring_records(jd_id);
CREATE INDEX idx_scoring_records_total_score ON scoring_records(total_score);