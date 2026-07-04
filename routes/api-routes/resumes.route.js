const express = require('express');
const multer  = require('multer');
const router  = express.Router();
const { uploadResume, getAllResumes, getResume, deleteResume } = require('../../controllers/resume.controller');
const { upload } = require('../../middleware/upload');

function handleUpload(req, res, next) {
  upload.single('resume')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large — maximum allowed size is 5 MB' });
    }
    if (err) {
      return res.status(400).json({ error: err.message });
    }
  });
}

router.post('/',      handleUpload, uploadResume);
router.get('/',       getAllResumes);
router.get('/:id',    getResume);
router.delete('/:id', deleteResume);

module.exports = router;
