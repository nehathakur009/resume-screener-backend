const jdDAO = require('../dao/jd.dao');
const logger = require('../utils/logger');

const createJD = async (req, res) => {
  try {
    // title and description are already sanitized + validated by validateJDBody middleware
    const { title, description } = req.body;
    const jd = await jdDAO.createJD({ title, description, criteria: [] });
    res.status(201).json({ data: jd });
  } catch (err) {
    logger.error('Create JD failed', { error: err.message });
    res.status(500).json({ error: 'Failed to save job description' });
  }
};

const getJD = async (req, res) => {
  try {
    const jd = await jdDAO.getJD(req.params.id);
    if (!jd) return res.status(404).json({ error: 'Job description not found' });
    res.json({ data: jd });
  } catch (err) {
    logger.error('Get JD failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
};

const getAllJDs = async (req, res) => {
  try {
    const jds = await jdDAO.getAllJDs();
    res.json({ data: jds, total: jds.length });
  } catch (err) {
    logger.error('Get all JDs failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
};

const updateJD = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description } = req.body;

    // Check if JD exists
    const existingJD = await jdDAO.getJD(id);
    if (!existingJD) {
      return res.status(404).json({ error: 'Job description not found' });
    }

    const updatedJD = await jdDAO.updateJD(id, { title, description });
    res.json({ data: updatedJD });
  } catch (err) {
    logger.error('Update JD failed', { error: err.message });
    res.status(500).json({ error: 'Failed to update job description' });
  }
};

const deleteJD = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if JD exists
    const existingJD = await jdDAO.getJD(id);
    if (!existingJD) {
      return res.status(404).json({ error: 'Job description not found' });
    }

    const result = await jdDAO.deleteJD(id);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Job description not found' });
    }

    res.status(204).send();
  } catch (err) {
    logger.error('Delete JD failed', { error: err.message });
    res.status(500).json({ error: 'Failed to delete job description' });
  }
};

module.exports = { createJD, getJD, getAllJDs, updateJD, deleteJD };