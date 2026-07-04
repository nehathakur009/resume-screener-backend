const pdfParse = require('pdf-parse');
const mammoth  = require('mammoth');
const path     = require('path');

/**
 * Extract plain text from a PDF, DOCX, or DOC buffer.
 * Throws if the file type is unsupported or extraction yields nothing useful.
 */
async function parseDocument(buffer, originalname) {
  const ext = path.extname(originalname || '').toLowerCase();

  if (ext === '.pdf') {
    const result = await pdfParse(buffer);
    return result.text;
  }

  if (ext === '.docx' || ext === '.doc') {
    const result = await mammoth.extractRawText({ buffer });
    if (result.messages?.length) {
      // mammoth warnings (e.g. unsupported .doc features) — log but don't fail
      result.messages.forEach((m) => {
        if (m.type === 'error') console.warn('[docParser]', m.message);
      });
    }
    return result.value;
  }

  throw new Error(`Unsupported file type: ${ext || 'unknown'}`);
}

module.exports = { parseDocument };
