const express = require('express');
const router = express.Router();
const { createJD, getJD, getAllJDs, updateJD, deleteJD } = require('../../controllers/jd.controller');

router.post('/', createJD);
router.get('/', getAllJDs);
router.get('/:id', getJD);
router.put('/:id', updateJD);
router.delete('/:id', deleteJD);

module.exports = router;