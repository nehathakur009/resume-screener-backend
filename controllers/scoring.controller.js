const scoringDAO = require('../dao/scoring.dao');
const resumeDAO = require('../dao/resume.dao');
const jdDAO = require('../dao/jd.dao');
const { scoreCandidate } = require('../utils/scorer');
const { parseJD } = require('../utils/jdParser');
const { detectAllFlags } = require('../utils/flagDetector');
const logger = require('../utils/logger');

// Merge two flag arrays — scoring-time flags override upload-time flags of the same type
function mergeFlags(fresh, stored) {
  const seenTypes = new Set(fresh.map((f) => f.type));
  return [...fresh, ...(stored || []).filter((f) => !seenTypes.has(f.type))];
}

const scoreResumes = async (req, res) => {
  try {
    const { jd_id, resume_ids } = req.body;
    if (!jd_id) return res.status(400).json({ error: 'jd_id is required' });

    const jd = await jdDAO.getJD(jd_id);
    if (!jd) return res.status(404).json({ error: 'Job description not found' });

    // Parse JD once (rule-based extraction of skills, years, education)
    const jdParsed = parseJD(jd.description);

    let resumeList = resume_ids?.length
      ? (await Promise.all(resume_ids.map((id) => resumeDAO.getResumeWithProfile(id)))).filter(Boolean)
      : await resumeDAO.getAllResumesWithProfiles();

    if (!resumeList.length) {
      return res.status(400).json({ error: 'No resumes found to score' });
    }

    const outcomes = await Promise.all(
      resumeList.map(async (resume) => {
        try {
          const profile = {
            name: resume.name,
            roles: resume.roles || [],
            education: resume.education || [],
            skills: resume.skills || [],
            certifications: resume.certifications || [],
            total_experience_years: resume.total_experience_years || null,
            summary: resume.summary || null,
          };

          // Deterministic scoring — fully reproducible, no network calls
          const result = scoreCandidate(profile, jd.description, jdParsed);
          // Re-run flag detection with latest logic (fixes bugs from upload-time computation)
          const freshFlags = detectAllFlags(profile);
          // Merge with any stored upload-time flags (same-type fresh flags win)
          const mergedFlags = mergeFlags(freshFlags, resume.structural_flags || []);

          // Sync corrected flags back into parsed_profiles so ResumeTable stays in sync
          await resumeDAO.updateStructuralFlags(resume.id, mergedFlags);

          await scoringDAO.saveScoringRecord({
            resume_id: resume.id,
            jd_id,
            total_score: result.total_score,
            criterion_breakdown: result.criterion_breakdown,
            flags: mergedFlags,
            overall_rationale: result.overall_rationale,
          });

          return { resume_id: resume.id, success: true };
        } catch (err) {
          logger.error(`Scoring failed for resume ${resume.id}`, { error: err.message });
          return { resume_id: resume.id, success: false, error: err.message };
        }
      }),
    );

    await scoringDAO.updateRanks(jd_id);
    const ranked = await scoringDAO.getScoringResultsByJD(jd_id);

    res.json({
      jd_id,
      jd_parsed: jdParsed, // expose what the JD parser extracted (transparency)
      total_scored: outcomes.filter((o) => o.success).length,
      failed: outcomes.filter((o) => !o.success).length,
      data: ranked,
    });
  } catch (err) {
    logger.error('Score resumes failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
};

const getResults = async (req, res) => {
  try {
    const results = await scoringDAO.getScoringResultsByJD(req.params.jd_id);
    res.json({ data: results, total: results.length });
  } catch (err) {
    logger.error('Get results failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
};

const getAllResults = async (req, res) => {
  try {
    const results = await scoringDAO.getAllScoringResults();
    res.json({ data: results, total: results.length });
  } catch (err) {
    logger.error('Get all results failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
};

const getAverageScoreTrend = async (req, res) => {
  try {
    // Get daily average scores for the last 30 days
    const { days } = req.query;
    const period = parseInt(days) || 30;

    const { rows } = await pool.query(
      `SELECT
        DATE_TRUNC('day', scored_at) as date,
        AVG(total_score) as avg_score,
        COUNT(*) as count
      FROM scoring_records
      WHERE scored_at >= NOW() - INTERVAL '${period} days'
      GROUP BY DATE_TRUNC('day', scored_at)
      ORDER BY date ASC`);

    const trendData = rows.map(row => ({
      date: row.date,
      avg_score: parseFloat(row.avg_score.toFixed(1)),
      count: parseInt(row.count)
    }));

    res.json({ data: trendData, period });
  } catch (err) {
    logger.error('Get average score trend failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
};

module.exports = { scoreResumes, getResults, getAllResults, getAverageScoreTrend };