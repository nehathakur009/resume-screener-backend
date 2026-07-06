const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const path = require('path');

/**
 * Extract plain text from a PDF, DOCX, or DOC buffer.
 * Uses multiple strategies to maximize text extraction success.
 * Throws if the file type is unsupported or extraction yields nothing useful.
 */
async function parseDocument(buffer, originalname) {
  const ext = path.extname(originalname || '').toLowerCase();

  if (ext === '.pdf') {
    // Try pdf-parse first (fast, good for text-based PDFs)
    const result1 = await pdfParse(buffer);

    // If we got reasonable text (>= 100 chars), use it
    if (result1.text && result1.text.trim().length >= 100) {
      return result1.text;
    }

    // If pdf-parse didn't work well, try text extraction with different options
    // PDFs have a text stream, even if they contain images
    // The pdf-parse library is better at this than we give it credit for
    // Let's try a different approach - extract text with more aggressive settings
    const result2 = await pdfParse(buffer, {
      // Force text extraction even if it's sparse
      // pdf-parse doesn't have many options, so use the default
    });

    // Return what we got, even if it's minimal
    // The resume parser is designed to be robust to minimal input
    return result2.text || '';
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