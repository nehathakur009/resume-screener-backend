const express = require('express');
const router  = express.Router();
const { scoreResumes, getResults, getAllResults } = require('../../controllers/scoring.controller');

router.post('/run',           scoreResumes);
router.get('/results',        getAllResults);
router.get('/results/:jd_id', getResults);

module.exports = router;
