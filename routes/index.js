const express = require('express');
const router  = express.Router();

router.use('/resumes', require('./api-routes/resumes.route'));
router.use('/jd',      require('./api-routes/jd.route'));
router.use('/scoring', require('./api-routes/scoring.route'));

module.exports = router;
