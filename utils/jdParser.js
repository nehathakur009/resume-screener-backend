/**
 * Rule-based JD parser.
 * Extracts: required skills (individual tokens), required years, required education.
 *
 * Fix: strips filler language ("proficiency in", "experience with") and splits
 * conjunctions so bullet text like "Proficiency in React and TypeScript" yields
 * ["React", "TypeScript"] rather than the full sentence.
 */

const TECH_SKILLS_VOCAB = require('./techSkills');

// ─── Filler phrase stripping ──────────────────────────────────────────────────
// These patterns appear in JD bullets before the actual skill name.
const FILLER_PATTERNS = [
  /\bstrong\s+/gi,
  /\bproven\s+(?:track\s+record\s+(?:of|in|with)\s+|experience\s+(?:in|with)\s+)/gi,
  /\bhands?[- ]on\s+experience\s+(?:with|in|using)?\s*/gi,
  /\bhands?[- ]on\s+/gi,
  /\b(?:proficien(?:t|cy)|expertise|experience|knowledge|familiarity|understanding|exposure|background)\s+(?:in|with|of|to|using|building|working\s+with)?\s*/gi,
  /\bability\s+to\s+\w+(?:\s+\w+)?\s*/gi,
  /\bworking\s+knowledge\s+of\s*/gi,
  /\b(?:deep|solid|strong|good|excellent|thorough)\s+/gi,
  /\b\d+\+?\s+years?\s+(?:of\s+)?/gi,
  /\b(?:minimum|at\s+least|more\s+than)\s+\d+\+?\s+years?\s+(?:of\s+)?/gi,
  /\bexperience\b\s*/gi,
  /\bfamiliar(?:ity)?\b\s*/gi,
];

function stripFillers(text) {
  let s = text;
  for (const re of FILLER_PATTERNS) s = s.replace(re, ' ');
  return s.replace(/\s{2,}/g, ' ').trim();
}

// Break a cleaned phrase into individual skill tokens by splitting on
// conjunctions, punctuation and common separators.
function splitIntoTokens(phrase) {
  return phrase
    .replace(/[()[\]{}"']/g, ',')          // brackets → commas
    .split(/\s+(?:and|or|&)\s+|[,;|\/]/)  // split on conjunctions / delimiters
    .map((s) =>
      s
        .replace(/[^a-zA-Z0-9\s.#+\-]/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim(),
    )
    .filter((s) => s.length >= 2 && s.length <= 50)
    .filter((s) => !/^\d+$/.test(s))
    .filter(
      (s) =>
        !/^(?:with|and|or|the|a|an|in|of|for|to|on|at|by|from|such|as|etc|including|using|via|through)$/i.test(s),
    );
}

// ─── Years of experience ──────────────────────────────────────────────────────

function extractRequiredYears(text) {
  const patterns = [
    /(\d+)\s*\+\s*years?/i,
    /(\d+)\s*to\s*\d+\s*years?/i,
    /(\d+)\s*[-–]\s*\d+\s*years?/i,
    /minimum\s+(?:of\s+)?(\d+)\s+years?/i,
    /at\s+least\s+(\d+)\s+years?/i,
    /(\d+)\s+years?\s+(?:of\s+)?(?:experience|exp(?:erience)?)/i,
    /experience\s+(?:of\s+)?(\d+)\s+years?/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return parseInt(m[1]);
  }
  return null;
}

// ─── Education level ──────────────────────────────────────────────────────────

const DEGREE_LEVELS = [
  { re: /\bph\.?d\.?|doctorate/i,                                              level: 5, label: 'PhD' },
  { re: /\bmaster(?:'s)?\b|\bmba\b/i,                                          level: 4, label: "Master's" },
  { re: /\bbachelor(?:'s)?\b|\bb\.?e\.?\b|\bundergraduate\b/i,                 level: 3, label: "Bachelor's" },
  { re: /\bassociate(?:'s)?\b/i,                                                level: 2, label: "Associate's" },
  { re: /\bhigh\s+school\b|\bged\b/i,                                           level: 1, label: 'High School' },
];

function extractRequiredEducation(text) {
  for (const { re, level, label } of DEGREE_LEVELS) {
    if (re.test(text)) return { level, label };
  }
  return null;
}

// ─── Skills ───────────────────────────────────────────────────────────────────

function extractSkillsFromJD(text) {
  const required  = new Set();
  const preferred = new Set();

  // 1. Vocab-based matching against curated tech list (most reliable source)
  const lower = text.toLowerCase();
  for (const skill of TECH_SKILLS_VOCAB) {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`).test(lower)) {
      required.add(skill.replace(/\b\w/g, (c) => c.toUpperCase()));
    }
  }

  // 2. Explicit sections — strip filler, split conjunctions, keep short tokens
  const SECTION_RE =
    /(?:required\s+skills?|technical\s+(?:skills?|requirements?)|key\s+skills?|must(?:[- ]have)?|requirements?|qualifications?|what\s+you(?:'ll)?\s+bring|what\s+we(?:'re)?\s+looking\s+for)\s*:?([\s\S]+?)(?:\n\n|(?=\n[A-Z])|\n(?:preferred|nice|bonus|desirable)|$)/gi;

  let sm;
  while ((sm = SECTION_RE.exec(text)) !== null) {
    const section = sm[1];
    const EDUCATION_LINE = /\b(?:bachelor|master|phd|doctorate|degree|diploma|graduate|undergraduate|mba|m\.s\.|b\.s\.)\b/i;
    section
      .split(/[\n•●]/)
      .map((line) => line.replace(/^[\-*\s\d.]+/, '').trim())
      .filter((line) => line.length > 2)
      .filter((line) => !EDUCATION_LINE.test(line)) // skip edu requirement lines
      .forEach((line) => {
        const stripped = stripFillers(line);
        splitIntoTokens(stripped).forEach((tok) => {
          if (tok.length >= 2) required.add(tok);
        });
      });
  }

  // 3. Preferred / nice-to-have section → separate bucket
  const PREFERRED_RE =
    /(?:preferred|nice[- ]to[- ]have|bonus|desirable|optional|plus)\s*:?([\s\S]+?)(?:\n\n|$)/gi;

  let pm;
  while ((pm = PREFERRED_RE.exec(text)) !== null) {
    pm[1]
      .split(/[\n•●,;|]/)
      .map((s) => s.replace(/^[\-*\s\d.]+/, '').trim())
      .filter((s) => s.length > 2)
      .forEach((s) => {
        const stripped = stripFillers(s);
        splitIntoTokens(stripped).forEach((tok) => {
          if (tok.length >= 2) {
            preferred.add(tok);
            required.delete(tok); // move to preferred bucket
          }
        });
      });
  }

  // Remove preferred from required
  for (const p of preferred) required.delete(p);

  // Merge and case-insensitive deduplicate (vocab match wins for casing)
  function dedup(set) {
    const seen = new Map(); // lowercase → best-cased version
    for (const s of set) {
      const k = s.toLowerCase();
      // Prefer the version that matches vocab casing; otherwise keep first seen
      if (!seen.has(k) || TECH_SKILLS_VOCAB.includes(k)) seen.set(k, s);
    }
    return [...seen.values()];
  }

  // Filter out non-skill garbage tokens
  const NON_SKILL = /^(?:bachelor|master|doctor|degree|field|related|science|engineering|equivalent|similar|relevant|required|minimum|least|years?|experience|knowledge|ability|s\s)$/i;

  return {
    required:  dedup(required).filter((s) => !NON_SKILL.test(s.trim())),
    preferred: dedup(preferred).filter((s) => !NON_SKILL.test(s.trim())),
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function parseJD(text) {
  const { required, preferred } = extractSkillsFromJD(text);
  return {
    required_skills:   required,
    preferred_skills:  preferred,
    required_years:    extractRequiredYears(text),
    required_education: extractRequiredEducation(text),
  };
}

module.exports = { parseJD };
