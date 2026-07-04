// Rule-based flag detection — all checks are deterministic, no AI.

// ─── Date helpers ────────────────────────────────────────────────────────────

function parseDate(str) {
  if (!str || str === 'present') return null;
  // "YYYY-MM" (the format resumeParser stores)
  const m = str.match(/^(\d{4})-(\d{2})$/);
  if (m) return new Date(parseInt(m[1]), parseInt(m[2]) - 1, 1);
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function monthsBetween(a, b) {
  return Math.max(0, (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()));
}

function resolveEnd(role) {
  if (role.is_current || role.end_date === 'present') return new Date();
  return parseDate(role.end_date);
}

function buildIntervals(roles) {
  return roles
    .map((r) => ({ ...r, start: parseDate(r.start_date), end: resolveEnd(r) }))
    .filter((r) => r.start && r.end && r.end > r.start)
    .sort((a, b) => a.start - b.start);   // ← sort by START (was sorting by end — bug fix)
}

// ─── Flag: overlapping date ranges ───────────────────────────────────────────

function detectDateOverlaps(roles) {
  const flags = [];
  const intervals = buildIntervals(roles);

  for (let i = 0; i < intervals.length; i++) {
    for (let j = i + 1; j < intervals.length; j++) {
      const a = intervals[i];
      const b = intervals[j];
      if (b.start >= a.end) break; // sorted by start — no further overlap possible with a
      // Cap at min(a.end, b.end) so nested roles don't over-report overlap
      const overlapEnd    = a.end < b.end ? a.end : b.end;
      const overlapMonths = monthsBetween(b.start, overlapEnd);
      if (overlapMonths > 1) {
        flags.push({
          type: 'date_overlap',
          description: `"${a.title} at ${a.company}" (${a.start_date}–${a.end_date || 'present'}) overlaps "${b.title} at ${b.company}" (${b.start_date}–${b.end_date || 'present'}) by ~${overlapMonths} month${overlapMonths !== 1 ? 's' : ''}`,
          severity: overlapMonths > 6 ? 'high' : 'medium',
        });
      }
    }
  }
  return flags;
}

// ─── Flag: experience exaggeration ───────────────────────────────────────────
//
// BUG FIX: previously used total_experience_years (which WE calculated from roles)
// and compared it against the same calculated value — always a no-op.
//
// Now we extract a "claimed" years figure from the summary/profile text.
// If the candidate wrote "10+ years of experience" in their summary but their
// date history only supports 6 years, that's a meaningful discrepancy.

const CLAIMED_YEARS_RE = [
  /(\d{1,2})\+?\s*years?\s+of\s+(?:professional\s+)?(?:experience|exp(?:erience)?)/i,
  /over\s+(\d{1,2})\s*(?:\+)?\s*years?/i,
  /more\s+than\s+(\d{1,2})\s*years?/i,
  /(\d{1,2})\+?\s*years?\s+(?:in\s+(?:the\s+)?(?:industry|field|software|tech))/i,
  /(\d{1,2})\+?\s*years?\s+(?:as\s+a?n?\s+\w+)/i,
];

function extractClaimedYearsFromText(text) {
  if (!text) return null;
  for (const re of CLAIMED_YEARS_RE) {
    const m = text.match(re);
    if (m) return parseInt(m[1]);
  }
  return null;
}

function detectExperienceExaggeration(roles, summary) {
  // BUG FIX: extract claimed years from summary text (not from calculated value)
  const claimedYears = extractClaimedYearsFromText(summary);
  if (!claimedYears || !roles.length) return [];

  const intervals = buildIntervals(roles);
  if (!intervals.length) return [];

  // Merge overlapping intervals to get real total
  const merged = [{ start: intervals[0].start, end: intervals[0].end }];
  for (let i = 1; i < intervals.length; i++) {
    const last = merged[merged.length - 1];
    if (intervals[i].start <= last.end) {
      last.end = intervals[i].end > last.end ? intervals[i].end : last.end;
    } else {
      merged.push({ start: intervals[i].start, end: intervals[i].end });
    }
  }

  const actualMonths = merged.reduce((sum, iv) => sum + monthsBetween(iv.start, iv.end), 0);
  const actualYears  = actualMonths / 12;

  if (claimedYears > actualYears + 2) {
    return [{
      type: 'experience_exaggeration',
      description: `Summary claims ${claimedYears}+ years of experience but work history accounts for only ~${actualYears.toFixed(1)} years`,
      severity: claimedYears - actualYears > 4 ? 'high' : 'medium',
    }];
  }
  return [];
}

// ─── Flag: employment gaps ────────────────────────────────────────────────────

function detectEmploymentGaps(roles) {
  const flags = [];
  // BUG FIX: sort by START date (was sorting by end date — wrong chronological order)
  const pastRoles = roles
    .filter((r) => !r.is_current && r.end_date && r.end_date !== 'present')
    .map((r) => ({ ...r, start: parseDate(r.start_date), end: parseDate(r.end_date) }))
    .filter((r) => r.start && r.end)
    .sort((a, b) => a.start - b.start);  // ← was a.end - b.end

  for (let i = 0; i < pastRoles.length - 1; i++) {
    const cur  = pastRoles[i];
    const next = pastRoles[i + 1];
    const gap  = monthsBetween(cur.end, next.start);
    if (gap > 6) {
      flags.push({
        type: 'employment_gap',
        description: `${gap}-month gap between "${cur.title} at ${cur.company}" (ended ${cur.end_date}) and "${next.title} at ${next.company}" (started ${next.start_date})`,
        severity: gap > 18 ? 'medium' : 'low',
      });
    }
  }
  return flags;
}

// ─── Flag: no parseable timeline ─────────────────────────────────────────────

function detectUnverifiableTimeline(roles) {
  if (!roles.length) {
    return [{
      type: 'unverifiable_timeline',
      description: 'No work history found — experience timeline cannot be verified from this resume',
      severity: 'medium',
    }];
  }
  const datedRoles = roles.filter((r) => r.start_date);
  if (datedRoles.length === 0) {
    return [{
      type: 'unverifiable_timeline',
      description: `${roles.length} role(s) detected but no start/end dates could be parsed — experience cannot be verified`,
      severity: 'medium',
    }];
  }
  if (datedRoles.length < roles.length) {
    return [{
      type: 'partial_dates',
      description: `${roles.length - datedRoles.length} of ${roles.length} role(s) are missing parseable dates`,
      severity: 'low',
    }];
  }
  return [];
}

// ─── Flag: skill padding ─────────────────────────────────────────────────────

function detectSkillPadding(skills) {
  if (skills.length > 25) {   // ← lowered from 30 to 25
    return [{
      type: 'skill_padding',
      description: `${skills.length} skills listed — unusually high count may indicate keyword stuffing`,
      severity: 'low',
    }];
  }
  return [];
}

// ─── Flag: thin role descriptions ────────────────────────────────────────────

function detectThinDescriptions(roles) {
  if (!roles.length) return [];
  const thin = roles.filter((r) => !r.description || r.description.trim().length < 20);
  // BUG FIX: was thin.length === roles.length (only ALL thin). Changed to majority (>= 50%).
  if (thin.length >= Math.ceil(roles.length / 2)) {
    return [{
      type: 'missing_role_details',
      description: `${thin.length} of ${roles.length} role(s) have no meaningful description — difficult to assess actual responsibilities`,
      severity: 'low',
    }];
  }
  return [];
}

// ─── Main ────────────────────────────────────────────────────────────────────

function detectAllFlags(parsedProfile) {
  const roles  = parsedProfile.roles  || [];
  const skills = parsedProfile.skills || [];

  return [
    ...detectDateOverlaps(roles),
    ...detectExperienceExaggeration(roles, parsedProfile.summary || ''),
    ...detectEmploymentGaps(roles),
    ...detectUnverifiableTimeline(roles),
    ...detectSkillPadding(skills),
    ...detectThinDescriptions(roles),
  ];
}

module.exports = { detectAllFlags };
