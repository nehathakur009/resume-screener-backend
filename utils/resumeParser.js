/**
 * Rule-based resume parser.
 *
 * Strategy:
 *   1. Normalise raw text from pdf-parse.
 *   2. Split into named sections using common header patterns.
 *   3. Within each section use date-range anchoring + heuristics to extract
 *      roles, education entries, and skills.
 *   4. Fall back to full-document scanning when sections are missing.
 */

// ─── Date helpers ────────────────────────────────────────────────────────────

const MONTH_TO_NUM = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// Build regex fragments
const M = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const Y = '(?:19|20)\\d{2}';
const DATE_UNIT = `(?:(?:${M})[.,]?\\s*${Y}|\\d{1,2}[/\\-]${Y}|${Y})`;
const PRESENT = 'present|current|now|ongoing|till\\s+date|today';
const DATE_RANGE_STR = `(${DATE_UNIT})\\s*(?:[-–—]|\\bto\\b)\\s*(${DATE_UNIT}|${PRESENT})`;
const DATE_RANGE_RE = () => new RegExp(DATE_RANGE_STR, 'gi');
const SINGLE_DATE_RE = () => new RegExp(DATE_UNIT, 'gi');

function parseDate(raw) {
  if (!raw) return null;
  const s = raw.toLowerCase().replace(/[.,]/g, '').trim();

  // "jan 2020" / "january 2020"
  const my = s.match(new RegExp(`^(${M})\\s*(${Y})$`, 'i'));
  if (my) {
    const num = MONTH_TO_NUM[my[1].slice(0, 3)];
    if (num) return `${my[2]}-${String(num).padStart(2, '0')}`;
  }

  // "01/2020" or "01-2020"
  const slash = s.match(/^(\d{1,2})[\/\-](\d{4})$/);
  if (slash) return `${slash[2]}-${String(parseInt(slash[1])).padStart(2, '0')}`;

  // bare year "2020"
  const yr = s.match(/^(\d{4})$/);
  if (yr) return `${yr[1]}-01`;

  return null;
}

function isPresent(s) {
  return /present|current|now|ongoing|till\s*date|today/i.test(s.trim());
}

function extractDatesFromText(text) {
  const re = DATE_RANGE_RE();
  const m = re.exec(text);
  if (m) {
    return {
      start_date: parseDate(m[1]),
      end_date: isPresent(m[2]) ? 'present' : parseDate(m[2]),
      is_current: isPresent(m[2]),
    };
  }
  const sm = SINGLE_DATE_RE().exec(text);
  if (sm) return { start_date: null, end_date: parseDate(sm[0]), is_current: false };
  return { start_date: null, end_date: null, is_current: false };
}

// ─── Section detection ────────────────────────────────────────────────────────

const SECTION_KEYWORDS = {
  experience: [
    'work experience', 'experience', 'employment history', 'professional experience',
    'career history', 'work history', 'relevant experience', 'professional background',
    'employment', 'positions held',
  ],
  education: [
    'education', 'academic background', 'educational background', 'qualifications',
    'academic qualifications', 'degrees', 'academic history',
  ],
  skills: [
    'skills', 'technical skills', 'core competencies', 'competencies', 'technologies',
    'programming languages', 'expertise', 'key skills', 'tools & technologies',
    'technical expertise', 'technologies & tools', 'tech stack', 'tools and technologies',
    'areas of expertise', 'professional skills',
  ],
  summary: [
    'summary', 'professional summary', 'executive summary', 'objective',
    'career objective', 'profile', 'professional profile', 'about me',
    'overview', 'career summary', 'personal statement', 'introduction',
  ],
  certifications: [
    'certifications', 'certification', 'licenses', 'credentials',
    'professional development', 'training', 'courses', 'certificates',
  ],
};

function matchSectionHeader(line) {
  const clean = line.trim().toLowerCase().replace(/[:\-_=*#+|]+/g, '').trim();
  if (clean.length < 3 || clean.length > 50) return null;

  for (const [section, keywords] of Object.entries(SECTION_KEYWORDS)) {
    if (keywords.some((kw) => clean === kw || clean.startsWith(kw + ' '))) {
      return section;
    }
  }
  // All-caps header e.g. "WORK EXPERIENCE"
  if (/^[A-Z\s&\-/]+$/.test(line.trim()) && line.trim().length >= 4) {
    const norm = line.trim().toLowerCase();
    for (const [section, keywords] of Object.entries(SECTION_KEYWORDS)) {
      if (keywords.some((kw) => norm.includes(kw))) return section;
    }
  }
  return null;
}

function detectSections(text) {
  const lines = text.split('\n');
  const sections = {};
  let current = 'preamble';
  let buffer = [];

  for (const line of lines) {
    const hit = matchSectionHeader(line);
    if (hit) {
      sections[current] = (sections[current] || '') + buffer.join('\n') + '\n';
      current = hit;
      buffer = [];
    } else {
      buffer.push(line);
    }
  }
  sections[current] = (sections[current] || '') + buffer.join('\n');
  return sections;
}

// ─── Contact info ─────────────────────────────────────────────────────────────

function extractEmail(text) {
  const m = text.match(/[\w.+\-]+@[\w\-]+\.[\w.]{2,}/);
  return m ? m[0] : null;
}

function extractPhone(text) {
  const m = text.match(/(?:\+?\d[\s\-().]*){10,15}/);
  return m ? m[0].trim() : null;
}

// function extractName(lines) {
//   const RESUME_HEADERS = [
//         'curriculum vitae', 'cv', 'resume', 'personal profile', 'professional profile',
//         'summary', 'objective', 'profile', 'experience', 'employment', 'education',
//         'skills', 'qualifications', 'certifications', 'training', 'contact', 'contact information'
//     ];

//   for (const line of lines.slice(0, 10)) {
//     const t = line.trim();
//     // if (!t || /@/.test(t) || /^\d/.test(t)) continue;
//     // if (/^(summary|objective|profile|experience|education|skills|contact)/i.test(t)) continue;
//     // 2–4 capitalised words

//     if (/^[A-Z][a-z'-]+(\s+[A-Z][a-z'-]+){0,3}$/.test(t)) return t;
//     // All caps name e.g. "JOHN DOE"
//     if (/^[A-Z'-]+(\s+[A-Z'-]+){0,3}$/.test(t) && t.length < 60) {
//       return t.split(' ').map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
//     }

//      // Pattern 3: Common name patterns with middle name/initial
//         // John D. Smith, Jane A Smith, Robert J. Smith
//         if (/^[A-Z][a-z'-]+\s+[A-Z]\.?\s+[A-Z][a-z'-]+$/.test(t)) return t;

//         // Pattern 4: Simple first name last name without capitalization rules
//         if (/^[A-Za-z'-]+\s+[A-Za-z'-]+$/.test(t) && t.length < 60 && t.length >= 5) {
//             // Check if it looks like a name (at least one capital letter after first letter)
//             if (/[A-Z]/.test(t.slice(1))) {
//                 return t;
//             }       
//     }
//   }
//   return null;
// }

// ─── Title / company heuristics ───────────────────────────────────────────────

function extractName(lines) {
    const RESUME_HEADERS = [
        'curriculum vitae', 'cv', 'resume', 'personal profile', 'professional profile',
        'summary', 'objective', 'profile', 'experience', 'employment', 'education',
        'skills', 'qualifications', 'certifications', 'training', 'contact', 'contact information'
    ];

    // Pre-compile regex for headers to match exact phrases or lines starting with "Header:"
    // This prevents the "McVey" bug where .includes('cv') would accidentally skip a real name
    const headerRegex = new RegExp(`^(${RESUME_HEADERS.join('|')})(:|\\s*$)`, 'i');

    for (const line of lines.slice(0, 10)) {
        const t = line.trim();
        if (!t) continue;

        // Skip lines that contain emails, start with digits, or look like URLs
        if (/@/.test(t) || /^\d/.test(t) || /^https?:\/\//i.test(t)) continue;

        // Skip exact headers or headers with colons
        if (headerRegex.test(t)) continue;

        // Pattern 1: Standard Names (1-4 words)
        // Fixed to allow internal capitals (McDonald, O'Connor) and initials (John D. Smith)
        if (/^[A-Z][a-zA-Z'-]*\.?(?:\s+[A-Z][a-zA-Z'-]*\.?){0,3}$/.test(t)) {
            return t;
        }

        // Pattern 2: All caps name (e.g., JOHN SMITH) - Converts to Title Case
        if (/^[A-Z'-]+(?:\s+[A-Z'-]+){0,3}$/.test(t) && t.length < 60) {
            return t.split(/\s+/)
                    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
                    .join(' ');
        }

        // Pattern 3: Fallback for names lacking proper capitalization (e.g., "john smith", "John smith")
        // Ensures it looks like a 2-4 word string.
        if (/^[A-Za-z'-]+(?:\s+[A-Za-z'-]+){1,3}$/.test(t) && t.length < 60 && t.length >= 5) {
            // Converts to proper Title Case just to be safe
            return t.split(/\s+/)
                    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                    .join(' ');
        }
    }
    return null;
}
const TITLE_KEYWORDS = /\b(engineer|developer|manager|analyst|designer|architect|consultant|director|lead|senior|junior|intern|specialist|coordinator|officer|administrator|executive|president|head|vp|cto|cfo|ceo|researcher|scientist|associate|assistant|staff|principal|fellow|devops|sre|qa|tester|scrum|product)\b/i;

function isTitleLike(text) {
  return TITLE_KEYWORDS.test(text) && text.length < 100;
}

function isCompanyLike(text) {
  return (
    /\b(inc|ltd|corp|llc|llp|co\b|company|technologies|solutions|systems|group|services|labs|studio|agency|consulting|enterprises|ventures|holdings)\b/i.test(text) ||
    (/^([A-Z][a-z'-]+\s*){1,5}$/.test(text) && text.split(' ').length <= 5)
  );
}

// ─── Experience parsing ───────────────────────────────────────────────────────

function parseExperienceSection(text) {
  const roles = [];
  if (!text || text.trim().length < 10) return roles;

  const re = DATE_RANGE_RE();
  const matches = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    const startDate = parseDate(m[1]);
    if (!startDate) continue;
    matches.push({
      index: m.index,
      end: m.index + m[0].length,
      start_date: startDate,
      end_date: isPresent(m[2]) ? 'present' : parseDate(m[2]),
      is_current: isPresent(m[2]),
    });
  }

  for (let i = 0; i < matches.length; i++) {
    const dm = matches[i];
    const nextDm = matches[i + 1];

    const before = text.slice(Math.max(0, dm.index - 400), dm.index);
    const after = text.slice(dm.end, nextDm ? nextDm.index : dm.end + 600);

    const linesBefore = before.split('\n').map((l) => l.trim()).filter(Boolean).slice(-4);
    const linesAfter = after.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 5);

    let title = null;
    let company = null;

    // Try structured patterns first: "Title | Company", "Title at Company", "Title — Company"
    for (const line of [...linesBefore.slice(-2), ...linesAfter.slice(0, 2)]) {
      if (!line || line.length < 3) continue;
      if (new RegExp(DATE_UNIT, 'i').test(line) && /\d{4}/.test(line)) continue; // date line

      const pipeM = line.match(/^(.+?)\s*\|\s*(.+)$/);
      const atM = line.match(/^(.+?)\s+(?:at|@)\s+(.+)$/i);
      const dashM = line.match(/^(.+?)\s*[-–—]\s*(.+)$/) ;

      if (pipeM && !title) { title = pipeM[1].trim(); company = pipeM[2].trim(); break; }
      if (atM && !title) { title = atM[1].trim(); company = atM[2].trim(); break; }
      if (dashM && !title && !/\d{4}/.test(line)) { title = dashM[1].trim(); company = dashM[2].trim(); break; }
    }

    // Fallback: scan nearby lines individually
    if (!title) {
      for (const line of [...linesBefore.slice(-3), ...linesAfter.slice(0, 3)]) {
        if (!line || line.length < 3) continue;
        if (new RegExp(DATE_UNIT, 'i').test(line) && /\d{4}/.test(line)) continue;
        if (isTitleLike(line) && !title) { title = line; continue; }
        if (title && !company && isCompanyLike(line)) { company = line; break; }
      }
    }

    const description = linesAfter.slice(0, 6).join(' ').replace(/\s+/g, ' ').slice(0, 600);

    roles.push({
      title: title || 'Unknown Role',
      company: company || 'Unknown Company',
      start_date: dm.start_date,
      end_date: dm.end_date,
      is_current: dm.is_current,
      description: description.trim(),
    });
  }

  // ── Fallback: no date ranges found ──────────────────────────────────────────
  // Scan for "Title | Company", "Title at Company", or title-keyword lines.
  // Roles will have no dates; the unverifiable_timeline flag fires automatically.
  if (roles.length === 0) {
    return parseExperienceFallback(text);
  }

  return roles;
}

function parseExperienceFallback(text) {
  const roles = [];
  if (!text || text.trim().length < 10) return roles;

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const seen = new Set();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.length < 3 || line.length > 120) continue;

    let title = null;
    let company = null;

    // Patterns: "Title | Company"  /  "Title at Company"  /  "Title – Company"
    const pipeM = line.match(/^(.+?)\s*\|\s*(.+)$/);
    const atM   = line.match(/^(.+?)\s+(?:at|@)\s+(.+)$/i);
    const dashM = line.match(/^(.+?)\s*[-–—]\s*(.+)$/);

    if (pipeM && isTitleLike(pipeM[1].trim())) {
      title = pipeM[1].trim(); company = pipeM[2].trim();
    } else if (atM && isTitleLike(atM[1].trim())) {
      title = atM[1].trim(); company = atM[2].trim();
    } else if (isTitleLike(line)) {
      title = line;
      // Look ahead for company name
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        const next = lines[j];
        if (next && !isTitleLike(next) && isCompanyLike(next)) {
          company = next; break;
        }
      }
    } else if (dashM && isTitleLike(dashM[1].trim()) && !/\d{4}/.test(line)) {
      title = dashM[1].trim(); company = dashM[2].trim();
    }

    if (!title || seen.has(title.toLowerCase())) continue;
    seen.add(title.toLowerCase());

    // Collect description from the next few non-title lines
    const descLines = [];
    for (let j = i + 1; j < Math.min(i + 7, lines.length); j++) {
      const next = lines[j];
      if (isTitleLike(next) || isCompanyLike(next)) break;
      descLines.push(next);
    }

    roles.push({
      title,
      company: company || 'Unknown Company',
      start_date: null,
      end_date:   null,
      is_current: false,
      description: descLines.join(' ').replace(/\s+/g, ' ').slice(0, 500).trim(),
    });
  }

  return roles;
}

// ─── Education parsing ────────────────────────────────────────────────────────

const DEGREE_PATTERNS = [
  { re: /\bph\.?d\.?|doctorate|doctor\s+of\b/i, label: 'PhD' },
  { re: /\bm\.?\s*(?:sc|s|eng|tech|ba|a|ed|arch|div|pub|mus)\b|\bmaster(?:'s)?\b|\bmba\b/i, label: "Master's" },
  { re: /\bb\.?\s*(?:sc|s|eng|tech|ba|a|ed|e|n|mus)\b|\bbachelor(?:'s)?\b|\bb\.?e\.?\b|\bundergraduate\b/i, label: "Bachelor's" },
  { re: /\bassociate(?:'s)?\b/i, label: "Associate's" },
  { re: /\bhigh\s+school\b|\bsecondary\b|\bged\b/i, label: 'High School' },
];

const INSTITUTE_RE = /\b(university|college|institute|school|academy|polytechnic)\b/i;

function parseEducationSection(text) {
  const education = [];
  if (!text || text.trim().length < 5) return education;
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    for (const { re, label } of DEGREE_PATTERNS) {
      if (!re.test(lines[i])) continue;

      const context = lines.slice(Math.max(0, i - 2), i + 4);
      const contextText = context.join(' ');

      let institution = null;
      for (const cl of context) {
        if (INSTITUTE_RE.test(cl)) { institution = cl.replace(/^[^A-Za-z]+/, '').trim().slice(0, 100); break; }
      }
      if (!institution) {
        for (const cl of context) {
          if (/^([A-Z][a-z'-]+\s+){1,4}[A-Z][a-z'-]+$/.test(cl) && cl !== lines[i]) {
            institution = cl; break;
          }
        }
      }

      const dateInfo = extractDatesFromText(contextText);
      const fieldM = lines[i].match(/(?:\bin\b|\bof\b)\s+([A-Z][a-z]+(?:\s+[A-Za-z]+){0,3})/);

      education.push({
        degree: label,
        institution: institution || 'Unknown Institution',
        field: fieldM ? fieldM[1] : null,
        start_date: dateInfo.start_date || null,
        end_date: dateInfo.end_date || null,
      });
      break; // one degree per line
    }
  }
  return education;
}

// ─── Skills parsing ───────────────────────────────────────────────────────────

// Curated list of common technical skills for fallback extraction from full text
const TECH_SKILLS_VOCAB = [
  'javascript','typescript','python','java','c++','c#','go','rust','ruby','php','swift','kotlin',
  'scala','r','matlab','perl','bash','shell script',
  'react','react.js','angular','vue','vue.js','next.js','nuxt','svelte','node.js','express',
  'django','flask','fastapi','spring','spring boot','rails','laravel','asp.net',
  'postgresql','mysql','mongodb','redis','elasticsearch','cassandra','sqlite','oracle','mssql',
  'aws','azure','gcp','google cloud','docker','kubernetes','terraform','ansible','helm',
  'git','github','gitlab','jenkins','circleci','github actions','travis','bitbucket',
  'rest','graphql','grpc','microservices','kafka','rabbitmq','celery','websocket',
  'machine learning','deep learning','tensorflow','pytorch','scikit-learn','pandas','numpy','spark',
  'html','css','sass','tailwind','bootstrap','webpack','vite','babel',
  'linux','unix','nginx','apache',
  'agile','scrum','kanban','jira','confluence',
  'figma','sketch','adobe xd',
  'tableau','power bi','excel','sql',
  'oauth','jwt','tls','https','cybersecurity',
  'ci/cd','devops','sre','site reliability',
];

// Common sub-category prefixes that some resumes use inside the Skills section.
// "Languages: Java, Python" → strip "Languages:" → "Java, Python"
const SKILL_SUBCATEGORY_RE = /^(?:languages?|frameworks?|libraries?|tools?|databases?|db|platforms?|cloud|os|operating\s+systems?|version\s+control|methodologies?|soft\s+skills?|certifications?|others?|web|mobile|front[-\s]?end|back[-\s]?end|devops|testing|ide|editors?)\s*[:\-–—]\s*/i;

function cleanSkillLine(line) {
  // Strip leading bullets/numbers
  let s = line.replace(/^[\-*•●\s\d.]+/, '').trim();
  // Strip sub-category prefix ("Languages: ..." → "...")
  s = s.replace(SKILL_SUBCATEGORY_RE, '');
  return s;
}

function parseSkillsSection(text) {
  if (!text || text.trim().length < 2) return [];

  // First split by newline so we can handle each line's sub-category prefix
  const lines = text.split('\n');
  const rawItems = [];
  for (const line of lines) {
    const cleaned = cleanSkillLine(line);
    if (!cleaned) continue;
    // Each cleaned line may itself be comma/pipe-separated
    cleaned.split(/[,|;\/]/).forEach((part) => rawItems.push(part.trim()));
  }

  const seen = new Set();
  return rawItems
    .filter((s) => s.length >= 2 && s.length <= 60)
    .filter((s) => !/^\d+$/.test(s))
    .filter((s) => !SKILL_SUBCATEGORY_RE.test(s + ':')) // skip bare category words
    .filter((s) => {
      const k = s.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

function extractSkillsFromFullText(text) {
  const lower = text.toLowerCase();
  const found = [];
  for (const skill of TECH_SKILLS_VOCAB) {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`).test(lower)) {
      found.push(skill.replace(/\b\w/g, (c) => c.toUpperCase()));
    }
  }
  return found;
}

// ─── Experience calculation ───────────────────────────────────────────────────

function calculateTotalExperience(roles) {
  const intervals = roles
    .filter((r) => r.start_date)
    .map((r) => {
      const start = new Date(r.start_date + '-01').getTime();
      const end =
        r.is_current || r.end_date === 'present'
          ? Date.now()
          : r.end_date
          ? new Date(r.end_date + '-01').getTime()
          : null;
      return end && end > start ? { start, end } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);

  if (!intervals.length) return null;

  const merged = [{ ...intervals[0] }];
  for (let i = 1; i < intervals.length; i++) {
    const last = merged[merged.length - 1];
    if (intervals[i].start <= last.end) last.end = Math.max(last.end, intervals[i].end);
    else merged.push({ ...intervals[i] });
  }

  const totalMs = merged.reduce((s, iv) => s + (iv.end - iv.start), 0);
  return Math.round((totalMs / (1000 * 60 * 60 * 24 * 365.25)) * 10) / 10;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

function normalise(text) {
  return text
    .replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\f/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseResume(rawText) {
  const text = normalise(rawText);
  const lines = text.split('\n');

  const email = extractEmail(text);
  const phone = extractPhone(text);
  const name = extractName(lines);

  const sections = detectSections(text);

  const roles = parseExperienceSection(sections.experience || sections.preamble || '');
  const education = parseEducationSection(sections.education || '');

  let skills = parseSkillsSection(sections.skills || '');
  if (skills.length < 3) skills = extractSkillsFromFullText(text);

  const certifications = parseSkillsSection(sections.certifications || '');
  const summary = (sections.summary || '').trim().slice(0, 600) || null;
  const total_experience_years = calculateTotalExperience(roles);

  return { name, email, phone, summary, roles, education, skills, certifications, total_experience_years };
}

module.exports = { parseResume };
