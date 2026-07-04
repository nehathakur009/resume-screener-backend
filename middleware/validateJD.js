// Strips all HTML/script tags from a string to prevent XSS storage
function stripTags(str) {
  return str.replace(/<[^>]*>/g, '').trim();
}

function isPositiveInt(val) {
  return Number.isInteger(Number(val)) && Number(val) > 0;
}

const TITLE_MIN = 3;
const TITLE_MAX = 150;
const DESC_MIN  = 50;
const DESC_MAX  = 10000;

function validateJDBody(req, res, next) {
  let { title, description } = req.body;

  // Sanitize — strip any HTML/script tags
  title       = title       ? stripTags(String(title))       : '';
  description = description ? stripTags(String(description)) : '';

  const errors = [];

  if (!title) {
    errors.push('Position title is required.');
  } else if (title.length < TITLE_MIN) {
    errors.push(`Position title must be at least ${TITLE_MIN} characters.`);
  } else if (title.length > TITLE_MAX) {
    errors.push(`Position title must not exceed ${TITLE_MAX} characters (got ${title.length}).`);
  }

  if (!description) {
    errors.push('Job description is required.');
  } else if (description.length < DESC_MIN) {
    errors.push(`Job description must be at least ${DESC_MIN} characters.`);
  } else if (description.length > DESC_MAX) {
    errors.push(`Job description must not exceed ${DESC_MAX} characters (got ${description.length}).`);
  }

  if (errors.length) {
    return res.status(400).json({ errors, error: errors[0] });
  }

  // Write sanitized values back so the controller receives clean data
  req.body.title       = title;
  req.body.description = description;
  next();
}

function validateJDId(req, res, next) {
  if (!isPositiveInt(req.params.id)) {
    return res.status(400).json({ error: 'Invalid JD id — must be a positive integer.' });
  }
  req.params.id = Number(req.params.id);
  next();
}

module.exports = { validateJDBody, validateJDId };
