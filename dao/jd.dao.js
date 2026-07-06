const pool = require('../db');

async function createJD({ title, description, criteria }) {
  const { rows } = await pool.query(
    `INSERT INTO job_descriptions (title, description, criteria) VALUES ($1, $2, $3) RETURNING *`,
    [title, description, JSON.stringify(criteria || [])],
  );
  return rows[0];
}

async function getJD(jd_id) {
  const { rows } = await pool.query(
    `SELECT * FROM job_descriptions WHERE id = $1`,
    [jd_id],
  );
  return rows[0] || null;
}

async function getAllJDs() {
  const { rows } = await pool.query(
    `SELECT id, title, description, created_at FROM job_descriptions ORDER BY created_at DESC`,
  );
  return rows;
}

async function updateJD(jd_id, { title, description }) {
  const { rows } = await pool.query(
    `UPDATE job_descriptions SET title = $1, description = $2 WHERE id = $3 RETURNING *`,
    [title, description, jd_id],
  );
  return rows[0];
}

async function deleteJD(jd_id) {
  return await pool.query(
    `DELETE FROM job_descriptions WHERE id = $1`,
    [jd_id],
  );
}

module.exports = { createJD, getJD, getAllJDs, updateJD, deleteJD };