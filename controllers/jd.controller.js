const jdDAO = require('../dao/jd.dao');
const logger = require('../utils/logger');

const createJD = async (req, res) => {
  try {
    const { title, description } = req.body;
    if (!description || description.trim().length < 50) {
      return res.status(400).json({ error: 'Job description must be at least 50 characters' });
    }
    const jd = await jdDAO.createJD({
      title: title?.trim() || 'Untitled Position',
      description: description.trim(),
      criteria: [],
    });
    res.status(201).json({ data: jd });
  } catch (err) {
    logger.error('Create JD failed', { error: err.message });
    res.status(500).json({ error: err.message });
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

module.exports = { createJD, getJD, getAllJDs };
