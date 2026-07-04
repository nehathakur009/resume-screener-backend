/**
 * Migration: add structural_flags column to parsed_profiles.
 * Safe to run multiple times (uses IF NOT EXISTS / DO NOTHING).
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const pool = require('../db');

(async () => {
  await pool.query(`
    ALTER TABLE parsed_profiles
    ADD COLUMN IF NOT EXISTS structural_flags JSONB DEFAULT '[]'
  `);
  console.log('✓ structural_flags column ready on parsed_profiles');
  await pool.end();
})().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});