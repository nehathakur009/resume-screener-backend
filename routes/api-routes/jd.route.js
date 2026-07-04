const express = require('express');
const router  = express.Router();
const { createJD, getJD, getAllJDs } = require('../../controllers/jd.controller');

router.post('/',    createJD);
router.get('/',     getAllJDs);
router.get('/:id',  getJD);

module.exports = router;
