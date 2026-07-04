const resumeDAO = require('../dao/resume.dao');
const { parseDocument } = require('../utils/docParser');
const { parseResume } = require('../utils/resumeParser');
const { detectAllFlags } = require('../utils/flagDetector');
const logger = require('../utils/logger');

const uploadResume = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        let rawText;
        try {
            rawText = await parseDocument(req.file.buffer, req.file.originalname);
        } catch (parseErr) {
            // Handle different parsing error types with specific messages
            if (parseErr.message.includes('unsupported format') || parseErr.message.includes('invalid')) {
                return res.status(422).json({
                    error: 'Unsupported file format. Please upload a PDF, DOC, or DOCX file.'
                });
            } else if (parseErr.message.includes('corrupt') || parseErr.message.includes('damaged')) {
                return res.status(422).json({
                    error: 'The file appears to be corrupted or damaged. Please try uploading a different copy.'
                });
            } else {
                return res.status(422).json({
                    error: `Could not read file: ${parseErr.message}`
                });
            }
        }

        if (!rawText || rawText.trim().length < 20) {
            return res.status(422).json({
                error: 'Could not extract meaningful text from the resume. This usually happens when:'
                + '\n• The file is a scanned image (not selectable text)'
                + '\n• The file is an empty or corrupted document'
                + '\n• The resume is in an unsupported format'
                + '\n\nPlease try uploading a text-based PDF, DOC, or DOCX file.'
            });
        }

        const profile = parseResume(rawText);
        const structuralFlags = detectAllFlags(profile);

        // ── De-duplication: same filename → update existing, don't create a second record ──
        const existing = await resumeDAO.findResumeByFilename(req.file.originalname);

        let resumeId;
        let isDuplicate = false;

        if (existing) {
            // Re-parse the existing resume in place (content may have changed)
            resumeId = existing.id;
            isDuplicate = true;
            await resumeDAO.updateResumeRawText(resumeId, rawText, req.file.size);
            await resumeDAO.saveParsedProfile({
                resume_id: resumeId,
                roles: profile.roles || [],
                education: profile.education || [],
                skills: profile.skills || [],
                certifications: profile.certifications || [],
                summary: profile.summary || null,
                total_experience_years: profile.total_experience_years || null,
                structural_flags: structuralFlags,
            });
            logger.info(`Resume refreshed (duplicate filename): ${resumeId} – ${profile.name || 'unknown'}`);
        } else {
            const candidate = await resumeDAO.createCandidate({
                name: profile.name || 'Unknown',
                email: profile.email || null,
                phone: profile.phone || null,
            });

            const resume = await resumeDAO.createResume({
                candidate_id: candidate.id,
                original_filename: req.file.originalname,
                raw_text: rawText,
                file_size: req.file.size,
            });
            resumeId = resume.id;

            await resumeDAO.saveParsedProfile({
                resume_id: resumeId,
                roles: profile.roles || [],
                education: profile.education || [],
                skills: profile.skills || [],
                certifications: profile.certifications || [],
                summary: profile.summary || null,
                total_experience_years: profile.total_experience_years || null,
                structural_flags: structuralFlags,
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