/**
 * Deterministic resume scorer — no AI required.
 *
 * Techniques used per criterion:
 *   Skills Match         → keyword matching + Jaro-Winkler fuzzy distance (natural)
 *   Experience Relevance → TF-IDF cosine similarity between role text and JD text
 *   Years of Experience  → arithmetic comparison against parsed JD requirement
 *   Education            → ordinal degree-level comparison
 *   Career Progression   → seniority keyword detection + role trajectory
 *
 * Every score has an attached reason string derived from the same calculation.
 * The total is always Σ(score × weight), derivable from the breakdown — never opaque.
 */

const natural = require('natural');

const Tokenizer  = new natural.WordTokenizer();
const Stemmer    = natural.PorterStemmer;
const { JaroWinklerDistance } = natural;

// ─── Scoring criteria definition (public) ────────────────────────────────────

const CRITERIA = [
  { criterion: 'Skills Match',         weight: 0.30, description: 'Keyword + fuzzy coverage of required skills from JD' },
  { criterion: 'Experience Relevance', weight: 0.25, description: 'TF-IDF cosine similarity between role history and JD text' },
  { criterion: 'Years of Experience',  weight: 0.20, description: 'Actual calculated years vs required years in JD' },
  { criterion: 'Education',            weight: 0.15, description: 'Highest degree vs required degree level' },
  { criterion: 'Career Progression',   weight: 0.10, description: 'Seniority signals and trajectory across dated roles' },
];

// ─── TF-IDF cosine similarity ─────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with','by','from',
  'is','are','was','were','be','been','have','has','had','do','does','did','will',
  'would','could','should','may','might','shall','must','can','not','no','this',
  'that','these','those','we','our','you','your','they','their','it','its',
  'as','if','so','than','then','when','where','who','which','what','how',
  'also','well','more','most','some','any','all','both','each','such',
]);

function tokenise(text) {
  return Tokenizer.tokenize(text.toLowerCase())
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t))
    .map((t) => Stemmer.stem(t));
}

function cosineSimilarity(text1, text2) {
  const t1 = tokenise(text1);
  const t2 = tokenise(text2);
  if (!t1.length || !t2.length) return 0;

  const vocab = [...new Set([...t1, ...t2])];

  const freq = (tokens) => {
    const f = {};
    tokens.forEach((t) => (f[t] = (f[t] || 0) + 1));
    return f;
  };

  const f1 = freq(t1);
  const f2 = freq(t2);
  const total1 = t1.length;
  const total2 = t2.length;

  let dot = 0, mag1 = 0, mag2 = 0;
  for (const v of vocab) {
    const a = (f1[v] || 0) / total1;
    const b = (f2[v] || 0) / total2;
    dot  += a * b;
    mag1 += a * a;
    mag2 += b * b;
  }

  return mag1 && mag2 ? dot / (Math.sqrt(mag1) * Math.sqrt(mag2)) : 0;
}

// ─── 1. Skills Match ──────────────────────────────────────────────────────────

function scoreSkillsMatch(candidateSkills, requiredSkills) {
  if (!requiredSkills.length) {
    return {
      score: 5,
      reason: 'No explicit required skills identified in JD — scored 5/10 by default',
      matched: [],
      missing: [],
    };
  }

  const matched = [];
  const missing = [];

  for (const req of requiredSkills) {
    const reqLow = req.toLowerCase();

    // 1. Exact (case-insensitive)
    if (candidateSkills.some((s) => s.toLowerCase() === reqLow)) {
      matched.push(req); continue;
    }

    // 2. Substring containment (handles "Node.js" vs "Node")
    if (candidateSkills.some((s) =>
      s.toLowerCase().includes(reqLow) || reqLow.includes(s.toLowerCase())
    )) {
      matched.push(req); continue;
    }

    // 3. Jaro-Winkler fuzzy ≥ 0.88  (catches "PostgreSQL" vs "Postgres", "JS" variations)
    const best = candidateSkills.reduce(
      (max, s) => Math.max(max, JaroWinklerDistance(reqLow, s.toLowerCase())),
      0,
    );
    if (best >= 0.88) { matched.push(req); continue; }

    missing.push(req);
  }

  const ratio = matched.length / requiredSkills.length;
  const score = Math.min(10, Math.round(ratio * 10));

  const reason =
    missing.length === 0
      ? `All ${matched.length} required skills found: ${matched.slice(0, 5).join(', ')}`
      : matched.length === 0
      ? `0 of ${requiredSkills.length} required skills found; missing: ${missing.slice(0, 4).join(', ')}`
      : `${matched.length}/${requiredSkills.length} skills matched (${matched.slice(0, 3).join(', ')}); missing: ${missing.slice(0, 3).join(', ')}`;

  return { score, reason, matched, missing };
}

// ─── 2. Experience Relevance (TF-IDF cosine) ─────────────────────────────────

function scoreExperienceRelevance(roles, jdText) {
  if (!roles.length) {
    return { score: 0, reason: 'No work experience entries found in resume' };
  }

  const expText = roles.map((r) => `${r.title} ${r.company} ${r.description}`).join(' ');
  const sim = cosineSimilarity(expText, jdText);

  // Raw cosine between resume & JD text typically ranges 0.05–0.5 for good matches.
  // Scale: 0.30+ → 9-10,  0.20 → 6,  0.10 → 3,  <0.05 → 0-1
  const score = Math.min(10, Math.round(sim * 30));

  const topTitles = roles.slice(0, 2).map((r) => r.title).join(', ');
  const pct = (sim * 100).toFixed(0);
  const reason =
    score >= 7
      ? `High relevance — role history (${topTitles}) closely matches JD vocabulary (${pct}% TF-IDF similarity)`
      : score >= 4
      ? `Moderate relevance — ${topTitles} partially aligns with JD (${pct}% TF-IDF similarity)`
      : `Low relevance — work history (${topTitles || 'unknown'}) has limited overlap with JD (${pct}% TF-IDF similarity)`;

  return { score, reason };
}

// ─── 3. Years of Experience ───────────────────────────────────────────────────

function scoreYearsOfExperience(actualYears, requiredYears) {
  if (actualYears == null) {
    return { score: 0, reason: 'No dateable work experience found — cannot calculate years' };
  }

  if (!requiredYears) {
    const score = Math.min(10, Math.round(actualYears * 1.2));
    return { score, reason: `${actualYears} years of experience (JD specifies no minimum)` };
  }

  const ratio = actualYears / requiredYears;
  const score =
    ratio >= 1.5 ? 10 :
    ratio >= 1.0 ? 9  :
    ratio >= 0.8 ? 7  :
    ratio >= 0.6 ? 5  :
    ratio >= 0.4 ? 3  : 1;

  const reason =
    ratio >= 1.0
      ? `${actualYears} yrs meets the ${requiredYears}+ yr requirement (ratio ${ratio.toFixed(1)}×)`
      : `${actualYears} yrs is below the ${requiredYears}+ yr requirement (ratio ${ratio.toFixed(1)}×)`;

  return { score, reason };
}

// ─── 4. Education ─────────────────────────────────────────────────────────────

const DEGREE_LEVEL = { 'PhD': 5, "Master's": 4, "Bachelor's": 3, "Associate's": 2, 'High School': 1 };

function scoreEducation(education, requiredEducation) {
  if (!education.length) {
    return { score: 2, reason: 'No education entries found in resume' };
  }

  const highest = education.reduce((best, e) =>
    (DEGREE_LEVEL[e.degree] || 0) > (DEGREE_LEVEL[best.degree] || 0) ? e : best,
    education[0],
  );

  const candidateLevel = DEGREE_LEVEL[highest.degree] || 0;
  const institutionNote = highest.institution && highest.institution !== 'Unknown Institution'
    ? ` from ${highest.institution}` : '';

  if (!requiredEducation) {
    const score = Math.min(10, candidateLevel * 2);
    return {
      score,
      reason: `Highest degree: ${highest.degree}${institutionNote} (JD specifies no education requirement)`,
    };
  }

  const diff = candidateLevel - requiredEducation.level;
  const score = diff >= 2 ? 10 : diff === 1 ? 10 : diff === 0 ? 9 : diff === -1 ? 5 : 2;

  const reason =
    diff >= 0
      ? `${highest.degree}${institutionNote} meets or exceeds required ${requiredEducation.label}`
      : `${highest.degree}${institutionNote} is below the required ${requiredEducation.label}`;

  return { score, reason };
}

// ─── 5. Career Progression ───────────────────────────────────────────────────

const SENIORITY = [
  [10, ['cto','ceo','coo','chief','vp','vice president']],
  [8,  ['director','head of','principal']],
  [7,  ['staff','tech lead','senior lead']],
  [6,  ['senior','sr.','sr ']],
  [5,  ['engineer','developer','analyst','specialist','architect','designer','scientist']],
  [4,  ['associate','junior','jr.']],
  [3,  ['intern','trainee','graduate','apprentice']],
];

function getSeniority(title) {
  const lower = title.toLowerCase();
  for (const [level, keywords] of SENIORITY) {
    if (keywords.some((k) => lower.includes(k))) return level;
  }
  return 5;
}

function scoreCareerProgression(roles) {
  if (!roles.length) {
    return { score: 0, reason: 'No work history found to assess progression' };
  }

  const levels = roles.map((r) => getSeniority(r.title));
  const maxLevel = Math.max(...levels);
  const distinctRoles = new Set(roles.map((r) => r.title.toLowerCase())).size;

  // Sort by start_date ascending to check trajectory
  const sorted = [...roles]
    .filter((r) => r.start_date)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));

  let upMoves = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (getSeniority(sorted[i].title) > getSeniority(sorted[i - 1].title)) upMoves++;
  }

  // Score: max seniority drives base, upward moves add bonus
  const baseScore  = Math.round((maxLevel / 10) * 7);
  const bonus      = Math.min(3, upMoves);
  const score      = Math.min(10, baseScore + bonus);

  const topRole = roles.find((r) => getSeniority(r.title) === maxLevel);
  const reason  =
    `${distinctRoles} distinct role(s), highest: ${topRole?.title || 'unknown'}` +
    (upMoves > 0 ? `, ${upMoves} clear upward step(s)` : ', no clear upward steps detected');

  return { score, reason };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function scoreCandidate(parsedProfile, jdText, jdParsed) {
  const skillsResult = scoreSkillsMatch(parsedProfile.skills || [], jdParsed.required_skills || []);
  const expResult    = scoreExperienceRelevance(parsedProfile.roles || [], jdText);
  const yrsResult    = scoreYearsOfExperience(parsedProfile.total_experience_years, jdParsed.required_years);
  const eduResult    = scoreEducation(parsedProfile.education || [], jdParsed.required_education);
  const progResult   = scoreCareerProgression(parsedProfile.roles || []);

  const criterion_breakdown = [
    { ...CRITERIA[0], score: skillsResult.score, reason: skillsResult.reason },
    { ...CRITERIA[1], score: expResult.score,    reason: expResult.reason    },
    { ...CRITERIA[2], score: yrsResult.score,    reason: yrsResult.reason    },
    { ...CRITERIA[3], score: eduResult.score,    reason: eduResult.reason    },
    { ...CRITERIA[4], score: progResult.score,   reason: progResult.reason   },
  ];

  const total_score = Math.round(
    criterion_breakdown.reduce((sum, c) => sum + c.score * c.weight, 0) * 10,
  ) / 10;

  // Derive overall rationale from breakdown — never hand-written, always reproducible
  const byImpact = [...criterion_breakdown].sort((a, b) => b.score * b.weight - a.score * a.weight);
  const strong = byImpact.filter((c) => c.score >= 7).slice(0, 2);
  const weak   = byImpact.filter((c) => c.score < 5).slice(0, 2);

  const overall_rationale =
    (strong.length ? `Strong: ${strong.map((c) => c.criterion).join(', ')}. ` : '') +
    (weak.length   ? `Gaps: ${weak.map((c) => c.criterion).join(', ')}. `     : '') +
    (skillsResult.matched?.length
      ? `Key matching skills: ${skillsResult.matched.slice(0, 4).join(', ')}.`
      : 'No specific skill matches found.');

  return { total_score, criterion_breakdown, overall_rationale };
}

module.exports = { scoreCandidate, CRITERIA };
