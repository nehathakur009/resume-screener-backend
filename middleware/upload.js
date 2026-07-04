const multer = require('multer');
const path   = require('path');

const storage = multer.memoryStorage();

const ALLOWED_MIMES = new Set([
  'application/pdf',
  'application/msword',                                                        // .doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',  // .docx
]);

const ALLOWED_EXTS = new Set(['.pdf', '.doc', '.docx']);

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_MIMES.has(file.mimetype) && ALLOWED_EXTS.has(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF, DOC, and DOCX files are allowed'), false);
  }
};

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

module.exports.MAX_FILE_SIZE = MAX_FILE_SIZE;

module.exports = { upload, ALLOWED_MIMES, ALLOWED_EXTS };
