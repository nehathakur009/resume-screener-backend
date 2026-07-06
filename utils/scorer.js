/**
 * Deterministic resume scorer — no AI required.
 *
 * Techniques used per criterion:
 * Skills Match → keyword matching + Jaro-Winkler fuzzy distance (natural)
 * Experience Relevance → TF-IDF cosine similarity between role text and JD text
 * Years of Experience → arithmetic comparison against parsed JD requirement
 * Education → ordinal degree-level comparison with field relevance
 * Career Progression → seniority band tracking (not keywords)
 *
 * Every score has an attached reason string derived from the same calculation.
 * The total is always Σ(score × weight), derivable from the breakdown — never opaque.
 */
const natural = require('natural');
const techSynonyms = require('./techSynonyms.js');
const degreeDomains = require('./degreeDomains.js');
const titleBands = require('./titleBands.js');

const Tokenizer = new natural.WordTokenizer();
const Stemmer = natural.PorterStemmer;
const { JaroWinklerDistance } = natural;

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
    dot += a * b;
    mag1 += a * a;
    mag2 += b * b;
  }

  return mag1 && mag2 ? dot / (Math.sqrt(mag1) * Math.sqrt(mag2)) : 0;
}

// ─── 1. Skills Match ──────────────────────────────────────────────────────────
function getCanonicalSkill(skill) {
  if (!skill) return '';
  const low = skill.toLowerCase();
  for (const [canonical, variants] of Object.entries(techSynonyms)) {
    if (variants.includes(low)) return canonical;
  }
  return low;
}

function scoreSkillsMatch(candidateSkills, requiredSkills, skillEntities) {
  if (!requiredSkills.length) {
    return {
      score: 5,
      reason: 'No explicit required skills identified in JD — scored 5/10 by default',
      matched: [],
      missing: [],
      evidence: {
        matched_skills: [],
        missing_skills: [],
        raw_text_references: [],
        matched_entity_ids: []
      }
    };
  }

  const matched = [];
  const missing = [];
  const matchedEntityIds = [];
  const rawTextReferences = [];
  const canonicalRequired = requiredSkills.map(getCanonicalSkill);

  if (!candidateSkills.length) {
    return {
      score: 0,
      reason: `0 of ${requiredSkills.length} required skills found; missing: ${requiredSkills.join(', ')}`,
      matched: [],
      missing: [...requiredSkills],
      evidence: {
        matched_skills: [],
        missing_skills: [...requiredSkills],
        raw_text_references: [],
        matched_entity_ids: []
      }
    };
  }

  const canonicalCandidate = candidateSkills.map(getCanonicalSkill);

  for (const req of canonicalRequired) {
    const found = canonicalCandidate.some((can, idx) => {
      const skillText = candidateSkills[idx];
      const match = can === req;
      const fuzzy = JaroWinklerDistance(can, req) >= 0.88;
      if (match || fuzzy) {
        matched.push(req);
        matchedEntityIds.push(skillEntities.find(s => getCanonicalSkill(s.text) === can)?.id || `unknown_${idx}`);
        rawTextReferences.push(skillText);
        return true;
      }
      return false;
    });

    if (!found) missing.push(req);
  }

  const ratio = matched.length / requiredSkills.length;
  const score = Math.min(10, Math.round(ratio * 10));

  const displayMatched = matched.map(r => requiredSkills.find(s => getCanonicalSkill(s) === r));
  const displayMissing = missing.map(r => requiredSkills.find(s => getCanonicalSkill(s) === r));

  const reason = displayMissing.length === 0
  ? `All ${displayMatched.length} required skills found: ${displayMatched.slice(0, 5).join(', ')}`
  : displayMatched.length === 0
  ? `0 of ${requiredSkills.length} required skills found; missing: ${displayMissing.slice(0, 4).join(', ')}`
  : `${displayMatched.length}/${requiredSkills.length} skills matched (${displayMatched.slice(0, 3).join(', ')}); missing: ${displayMissing.slice(0, 3).join(', ')}`;

  return {
    score,
    reason,
    matched: displayMatched,
    missing: displayMissing,
    evidence: {
      matched_skills: displayMatched,
      missing_skills: displayMissing,
      raw_text_references: rawTextReferences,
      matched_entity_ids: matchedEntityIds,
      skill_source: "skills_section"
    }
  };
}

// ─── 2. Experience Relevance (TF-IDF cosine) ─────────────────────────────────
function scoreExperienceRelevance(roles, jdText) {
  if (!roles.length) {
    return { score: 0, reason: 'No work experience entries found in resume' };
  }

  const expText = roles.map((r) => `${r.title} ${r.company} ${r.description}`).join(' ');
  const sim = cosineSimilarity(expText, jdText);

  const score = Math.min(10, Math.round(sim * 30));
  const topTitles = roles.slice(0, 2).map((r) => r.title).join(', ');
  const pct = (sim * 100).toFixed(0);

  const reason = score >= 7
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
  const score = ratio >= 1.5 ? 10 : ratio >= 1.0 ? 9 : ratio >= 0.8 ? 7 : ratio >= 0.6 ? 5 : ratio >= 0.4 ? 3 : 1;

  const reason = ratio >= 1.0
  ? `${actualYears} yrs meets the ${requiredYears}+ yr requirement (ratio ${ratio.toFixed(1)}×)`
  : `${actualYears} yrs is below the ${requiredYears}+ yr requirement (ratio ${ratio.toFixed(1)}×)`;

  return { score, reason };
}

// ─── 4. Education ─────────────────────────────────────────────────────────────
const DEGREE_LEVEL = {
  'PhD': 5,
  "Master's": 4,
  "Bachelor's": 3,
  "Associate's": 2,
  'High School': 1
};

function scoreEducation(education, requiredEducation) {
  if (!education.length) {
    return { score: 2, reason: 'No education entries found in resume' };
  }

  const highest = education.reduce((best, e) => {
    const level = DEGREE_LEVEL[e.degree] || 0;
    return (level > (DEGREE_LEVEL[best.degree] || 0)) ? e : best;
  }, education[0]);

  const candidateField = (highest.field || '').toLowerCase();
  const candidateLevel = DEGREE_LEVEL[highest.degree] || 0;

  const isTechnical = degreeDomains.technical_fields.some(field => candidateField.includes(field));
  const isBusiness = degreeDomains.business_fields.some(field => candidateField.includes(field));
  const isOther = degreeDomains.other_fields.some(field => candidateField.includes(field));

  let score = 0;
  let reason = '';

  if (!requiredEducation) {
    score = Math.min(10, candidateLevel * 2);
    reason = `Highest degree: ${highest.degree} from ${highest.institution || 'Unknown'}`;
  } else {
    const diff = candidateLevel - requiredEducation.level;

    if (diff >= 0) {
      score = 10;
      let baseReason = `${highest.degree} from ${highest.institution || 'Unknown'} meets or exceeds required ${requiredEducation.label}`;
      if (requiredEducation.level >= 3 && !isTechnical) {
        score = Math.floor(score * 0.5);
        baseReason += ' — but field of study is unrelated to technical requirements';
      }
      reason = baseReason;
    } else if (diff === -1) {
      score = 5;
      reason = `${highest.degree} from ${highest.institution || 'Unknown'} is one level below required ${requiredEducation.label}`;
    } else if (diff === -2) {
      score = 3;
      reason = `${highest.degree} from ${highest.institution || 'Unknown'} is two levels below required ${requiredEducation.label}`;
    } else {
      score = 0;
      reason = `Highest degree: ${highest.degree} from ${highest.institution || 'Unknown'} — insufficient level for ${requiredEducation.label}`;
    }
  }

  return { score, reason };
}

// ─── 5. Career Progression ───────────────────────────────────────────────────
const bandPriority = {
  "band_1": 1,
  "band_2": 2,
  "band_3": 3,
  "band_4": 4,
  "band_5": 5,
  "band_6": 6
};

function getBand(title) {
  if (!title) return "band_3";
  const low = title.toLowerCase();
  for (const [band, titles] of Object.entries(titleBands)) {
    if (titles.some(t => low.includes(t))) return band;
  }
  return "band_3";
}

function scoreCareerProgression(roles) {
  if (!roles.length) {
    return { score: 0, reason: 'No work history found to assess progression' };
  }

  const bands = roles.map(r => getBand(r.title));
  const sorted = [...roles]
  .filter(r => r.start_date)
  .sort((a, b) => a.start_date.localeCompare(b.start_date));

  let upMoves = 0;
  for (let i = 1; i < sorted.length; i++) {
    const prevBand = getBand(sorted[i - 1].title);
    const currBand = getBand(sorted[i].title);
    if (bandPriority[currBand] > bandPriority[prevBand]) upMoves++;
  }

  const maxBandLabel = bands.reduce((max, b) => bandPriority[b] > bandPriority[max] ? b : max, "band_1");
  const maxBandValue = bandPriority[maxBandLabel];

  const baseScore = [1, 3, 5, 7, 8, 9][maxBandValue - 1] || 5;
  const score = Math.min(10, baseScore + Math.min(3, upMoves));

  const highestRole = roles.find(r => getBand(r.title) === maxBandLabel);

  const reason = `Career progression: ${sorted.length} roles, highest band: ${maxBandLabel.replace("_", " ").toUpperCase()} (e.g., '${highestRole?.title || 'Unknown'}'), ${upMoves} upward step${upMoves !== 1 ? 's' : ''}.`;

  return { score, reason };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const CRITERIA = [
  { criterion: 'Skills Match', weight: 0.30, description: 'Keyword + fuzzy coverage of required skills from JD' },
  { criterion: 'Experience Relevance', weight: 0.25, description: 'TF-IDF cosine similarity between role history and JD text' },
  { criterion: 'Years of Experience', weight: 0.20, description: 'Actual calculated years vs required years in JD' },
  { criterion: 'Education', weight: 0.15, description: 'Highest degree vs required degree level' },
  { criterion: 'Career Progression', weight: 0.10, description: 'Seniority signals and trajectory across dated roles' },
];

function scoreCandidate(parsedProfile, jdText, jdParsed) {
  const skillsResult = scoreSkillsMatch(
    parsedProfile.skills || [],
    jdParsed.required_skills || [],
    (parsedProfile.skills || []).map((s, i) => ({ id: `skill_${i}`, text: s, source: 'skills_section' }))
  );

  const expResult = scoreExperienceRelevance(parsedProfile.roles || [], jdText);
  const yrsResult = scoreYearsOfExperience(parsedProfile.total_experience_years, jdParsed.required_years);
  const eduResult = scoreEducation(parsedProfile.education || [], jdParsed.required_education);
  const progResult = scoreCareerProgression(parsedProfile.roles || []);

  const criterion_breakdown = [
    { ...CRITERIA[0], score: skillsResult.score, reason: skillsResult.reason, evidence: skillsResult.evidence },
    { ...CRITERIA[1], score: expResult.score, reason: expResult.reason },
    { ...CRITERIA[2], score: yrsResult.score, reason: yrsResult.reason },
    { ...CRITERIA[3], score: eduResult.score, reason: eduResult.reason },
    { ...CRITERIA[4], score: progResult.score, reason: progResult.reason },
  ];

  const total_score = Math.round(
    criterion_breakdown.reduce((sum, c) => sum + c.score * c.weight, 0) * 10,
  ) / 10;

  const byImpact = [...criterion_breakdown].sort((a, b) => b.score * b.weight - a.score * a.weight);
  const strong = byImpact.filter((c) => c.score >= 7).slice(0, 2);
  const weak = byImpact.filter((c) => c.score < 5).slice(0, 2);

  const overall_rationale =
    (strong.length ? `Strong: ${strong.map((c) => c.criterion).join(', ')}. ` : '') +
    (weak.length ? `Gaps: ${weak.map((c) => c.criterion).join(', ')}. ` : '') +
    (skillsResult.matched?.length ? `Key matching skills: ${skillsResult.matched.slice(0, 4).join(', ')}.` : 'No specific skill matches found.');

  return { total_score, criterion_breakdown, overall_rationale };
}

module.exports = { scoreCandidate, CRITERIA };