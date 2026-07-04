const pool = require('../db');

async function createCandidate({ name, email, phone }) {
  const { rows } = await pool.query(
    `INSERT INTO candidates (name, email, phone) VALUES ($1, $2, $3) RETURNING *`,
    [name, email, phone],
  );
  return rows[0];
}

async function findResumeByFilename(original_filename) {
  const { rows } = await pool.query(
    `SELECT r.id FROM resumes r WHERE r.original_filename = $1 LIMIT 1`,
    [original_filename],
  );
  return rows[0] || null;
}

async function updateResumeRawText(resume_id, raw_text, file_size) {
  await pool.query(
    `UPDATE resumes SET raw_text = $1, file_size = $2 WHERE id = $3`,
    [raw_text, file_size, resume_id],
  );
}

async function createResume({ candidate_id, original_filename, raw_text, file_size }) {
  const { rows } = await pool.query(
    `INSERT INTO resumes (candidate_id, original_filename, raw_text, file_size)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [candidate_id, original_filename, raw_text, file_size],
  );
  return rows[0];
}

async function saveParsedProfile({ resume_id, roles, education, skills, certifications, summary, total_experience_years, structural_flags }) {
  const { rows } = await pool.query(
    `INSERT INTO parsed_profiles
       (resume_id, roles, education, skills, certifications, summary, total_experience_years, structural_flags)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (resume_id) DO UPDATE SET
       roles                  = EXCLUDED.roles,
       education              = EXCLUDED.education,
       skills                 = EXCLUDED.skills,
       certifications         = EXCLUDED.certifications,
       summary                = EXCLUDED.summary,
       total_experience_years = EXCLUDED.total_experience_years,
       structural_flags       = EXCLUDED.structural_flags,
       parsed_at              = NOW()
     RETURNING *`,
    [
      resume_id,
      JSON.stringify(roles),
      JSON.stringify(education),
      JSON.stringify(skills),
      JSON.stringify(certifications),
      summary,
      total_experience_years,
      JSON.stringify(structural_flags || []),
    ],
  );
  return rows[0];
}

async function getResumeWithProfile(resume_id) {
  const { rows } = await pool.query(
    `SELECT r.id, r.original_filename, r.file_size, r.created_at,
            c.id AS candidate_id, c.name, c.email AS candidate_email, c.phone,
            pp.roles, pp.education, pp.skills, pp.certifications,
            pp.summary, pp.total_experience_years, pp.structural_flags, pp.parsed_at
     FROM resumes r
     LEFT JOIN candidates       c  ON c.id  = r.candidate_id
     LEFT JOIN parsed_profiles  pp ON pp.resume_id = r.id
     WHERE r.id = $1`,
    [resume_id],
  );
  return rows[0] || null;
}

async function getAllResumesWithProfiles() {
  const { rows } = await pool.query(
    `SELECT r.id, r.original_filename, r.file_size, r.created_at,
            c.id AS candidate_id, c.name, c.email AS candidate_email, c.phone,
            pp.roles, pp.education, pp.skills, pp.certifications,
            pp.summary, pp.total_experience_years, pp.structural_flags, pp.parsed_at
     FROM resumes r
     LEFT JOIN candidates       c  ON c.id  = r.candidate_id
     LEFT JOIN parsed_profiles  pp ON pp.resume_id = r.id
     ORDER BY r.created_at DESC`,
  );
  return rows;
}

async function updateStructuralFlags(resume_id, structural_flags) {
  await pool.query(
    `UPDATE parsed_profiles SET structural_flags = $1 WHERE resume_id = $2`,
    [JSON.stringify(structural_flags || []), resume_id],
  );
}

async function deleteResume(resume_id) {
  const { rows } = await pool.query(
    `DELETE FROM resumes WHERE id = $1 RETURNING id`,
    [resume_id],
  );
  return rows[0] || null;
}

module.exports = { createCandidate, createResume, findResumeByFilename, updateResumeRawText, saveParsedProfile, updateStructuralFlags, getResumeWithProfile, getAllResumesWithProfiles, deleteResume };
