const pool = require('../db');

async function saveScoringRecord({ resume_id, jd_id, total_score, criterion_breakdown, flags, overall_rationale }) {
  const { rows } = await pool.query(
    `INSERT INTO scoring_records
       (resume_id, jd_id, total_score, criterion_breakdown, flags, overall_rationale)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (resume_id, jd_id) DO UPDATE SET
       total_score         = EXCLUDED.total_score,
       criterion_breakdown = EXCLUDED.criterion_breakdown,
       flags               = EXCLUDED.flags,
       overall_rationale   = EXCLUDED.overall_rationale,
       scored_at           = NOW()
     RETURNING *`,
    [
      resume_id,
      jd_id,
      total_score,
      JSON.stringify(criterion_breakdown),
      JSON.stringify(flags),
      overall_rationale,
    ],
  );
  return rows[0];
}

async function updateRanks(jd_id) {
  await pool.query(
    `UPDATE scoring_records sr
     SET rank = sub.rank
     FROM (
       SELECT id, ROW_NUMBER() OVER (ORDER BY total_score DESC) AS rank
       FROM scoring_records
       WHERE jd_id = $1
     ) sub
     WHERE sr.id = sub.id AND sr.jd_id = $1`,
    [jd_id],
  );
}

async function getScoringResultsByJD(jd_id) {
  const { rows } = await pool.query(
    `SELECT
       sr.id, sr.resume_id, sr.jd_id, sr.total_score,
       sr.criterion_breakdown, sr.flags, sr.overall_rationale, sr.rank, sr.scored_at,
       r.original_filename, r.file_size,
       c.name, c.email AS candidate_email, c.phone,
       pp.roles, pp.education, pp.skills, pp.total_experience_years, pp.summary,
       jd.title AS jd_title
     FROM scoring_records sr
     JOIN resumes          r  ON r.id  = sr.resume_id
     JOIN candidates       c  ON c.id  = r.candidate_id
     LEFT JOIN parsed_profiles pp ON pp.resume_id = sr.resume_id
     LEFT JOIN job_descriptions jd ON jd.id = sr.jd_id
     WHERE sr.jd_id = $1
     ORDER BY sr.rank ASC`,
    [jd_id],
  );
  return rows;
}

async function getAllScoringResults() {
  const { rows } = await pool.query(
    `SELECT
       sr.id, sr.resume_id, sr.jd_id, sr.total_score,
       sr.criterion_breakdown, sr.flags, sr.overall_rationale, sr.rank, sr.scored_at,
       r.original_filename, r.file_size,
       c.name, c.email AS candidate_email, c.phone,
       pp.roles, pp.education, pp.skills, pp.total_experience_years, pp.summary,
       jd.title AS jd_title
     FROM scoring_records sr
     JOIN resumes          r  ON r.id  = sr.resume_id
     JOIN candidates       c  ON c.id  = r.candidate_id
     LEFT JOIN parsed_profiles pp ON pp.resume_id = sr.resume_id
     LEFT JOIN job_descriptions jd ON jd.id = sr.jd_id
     ORDER BY sr.scored_at DESC, sr.rank ASC`,
  );
  return rows;
}

module.exports = { saveScoringRecord, updateRanks, getScoringResultsByJD, getAllScoringResults };
