const resumeDAO = require('../dao/resume.dao');
const { parsePDF }     = require('../utils/pdfParser');
const { parseResume }  = require('../utils/resumeParser');
const { detectAllFlags } = require('../utils/flagDetector');
const logger = require('../utils/logger');

const uploadResume = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const rawText = await parsePDF(req.file.buffer);
    if (!rawText || rawText.trim().length < 50) {
      return res.status(422).json({ error: 'Could not extract meaningful text from this PDF — it may be scanned/image-based' });
    }

    const profile       = parseResume(rawText);
    const structuralFlags = detectAllFlags(profile);

    // ── De-duplication: same filename → update existing, don't create a second record ──
    const existing = await resumeDAO.findResumeByFilename(req.file.originalname);

    let resumeId;
    let isDuplicate = false;

    if (existing) {
      // Re-parse the existing resume in place (content may have changed)
      resumeId     = existing.id;
      isDuplicate  = true;
      await resumeDAO.updateResumeRawText(resumeId, rawText, req.file.size);
      await resumeDAO.saveParsedProfile({
        resume_id:              resumeId,
        roles:                  profile.roles          || [],
        education:              profile.education       || [],
        skills:                 profile.skills          || [],
        certifications:         profile.certifications  || [],
        summary:                profile.summary         || null,
        total_experience_years: profile.total_experience_years || null,
        structural_flags:       structuralFlags,
      });
      logger.info(`Resume refreshed (duplicate filename): ${resumeId} – ${profile.name || 'unknown'}`);
    } else {
      const candidate = await resumeDAO.createCandidate({
        name:  profile.name  || 'Unknown',
        email: profile.email || null,
        phone: profile.phone || null,
      });

      const resume = await resumeDAO.createResume({
        candidate_id:      candidate.id,
        original_filename: req.file.originalname,
        raw_text:          rawText,
        file_size:         req.file.size,
      });
      resumeId = resume.id;

      await resumeDAO.saveParsedProfile({
        resume_id:              resumeId,
        roles:                  profile.roles          || [],
        education:              profile.education       || [],
        skills:                 profile.skills          || [],
        certifications:         profile.certifications  || [],
        summary:                profile.summary         || null,
        total_experience_years: profile.total_experience_years || null,
        structural_flags:       structuralFlags,
      });
      logger.info(`Resume parsed: ${resumeId} – ${profile.name || 'unknown'}`);
    }

    const data = await resumeDAO.getResumeWithProfile(resumeId);
    res.status(isDuplicate ? 200 : 201).json({
      resume_id: resumeId,
      duplicate: isDuplicate,
      profile,
      structural_flags: structuralFlags,
      data,
    });
  } catch (err) {
    logger.error('Resume upload failed', { error: err.message });
    res.status(500).json({ error: err.message || 'Failed to process resume' });
  }
};

const getAllResumes = async (req, res) => {
  try {
    const resumes = await resumeDAO.getAllResumesWithProfiles();
    res.json({ data: resumes, total: resumes.length });
  } catch (err) {
    logger.error('Get resumes failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
};

const getResume = async (req, res) => {
  try {
    const resume = await resumeDAO.getResumeWithProfile(req.params.id);
    if (!resume) return res.status(404).json({ error: 'Resume not found' });
    res.json({ data: resume });
  } catch (err) {
    logger.error('Get resume failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
};

const deleteResume = async (req, res) => {
  try {
    const deleted = await resumeDAO.deleteResume(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Resume not found' });
    res.json({ message: 'Resume deleted', id: deleted.id });
  } catch (err) {
    logger.error('Delete resume failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
};

module.exports = { uploadResume, getAllResumes, getResume, deleteResume };
