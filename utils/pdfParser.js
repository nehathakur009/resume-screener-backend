const pdfParse = require('pdf-parse');

async function parsePDF(buffer) {
  const data = await pdfParse(buffer);
  return data.text;
}

module.exports = { parsePDF };

