// Grade maths for the Berlin Abitur 2027 (VO-GO). Pure functions, no UI.
// Sources: Senatsverwaltung brochure "Auf Kurs zum Abitur" (2025/26, 2026/27) and VO-GO, cross-checked.
// Anything uncertain is a constant here so it can be corrected in one place.

export const Q = ['Q1', 'Q2', 'Q3', 'Q4'];

export const RULES = {
  lkCount: 8,          // all 8 LK semesters count, double
  gkCount: 24,         // exactly 24 GK semesters count, single
  minBlockI: 200,      // of max 600
  maxLkUnder5: 2,      // at least 6 of 8 LK with >= 5 points
  maxGkUnder5: 4,      // at least 20 of 24 GK with >= 5 points
  areaMin: 2,          // at least 2 counted courses in each core area (LK count too)
  examFactor: 4,       // each of the 5 exam components x4 (max 300)
  minBlockII: 100,
  minExamsAt5: 2,      // >= 2 of PF1-PF4 with >= 5 points, one of them an LK
  minTotal: 300,
};

export const AREAS = {
  de: 'German', fs: 'Foreign language', ma: 'Maths', nw: 'Natural science', gw: 'Social science', other: 'Other',
};
export const CORE_AREAS = ['de', 'fs', 'ma', 'nw', 'gw'];

export const EXAMS = ['PF1', 'PF2', 'PF3', 'PF4', 'PK5'];
export const EXAM_LABEL = { PF1: '1st exam · written', PF2: '2nd exam · written', PF3: '3rd exam · written', PF4: '4th exam · oral', PK5: '5th component' };

export const TARGETS = { '1.0': 823, '1.1': 805, '1.2': 787, '1.3': 769, '1.4': 751, '1.5': 733 };

export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/* ---------- grade conversion ---------- */

/** Total points (300–900) -> Abitur grade, N = 17/3 - E/180 truncated to one decimal. */
export function totalToGrade(total) {
  if (!isNum(total) || total < RULES.minTotal) return null;
  if (total >= 823) return 1.0;
  return Math.floor((3060 - 3 * total) / 54) / 10; // integer maths, no float truncation errors
}

export function gradeToMinTotal(grade) {
  for (let t = 300; t <= 900; t++) if (totalToGrade(t) <= grade + 1e-9) return t;
  return null;
}

/* ---------- one semester ---------- */

export const isTaken = (s, q) => (s.taken || Q).includes(q);

/** LK has 2 Klausuren in Q1–Q3 (1/2 of the grade), otherwise 1 Klausur (1/3). */
export const klausurCount = (s, q) => (s.type === 'LK' && q !== 'Q4' ? 2 : 1);
export const klausurWeight = (s, q) => (klausurCount(s, q) === 2 ? 1 / 2 : 1 / 3);

/** Grade from what was entered: report grade, or Klausur(en) + other average. */
export function semesterEntered(s, q) {
  const m = s.sem?.[q] || {};
  if (isNum(m.final)) return { points: m.final, raw: m.final, source: 'final' };
  const ks = [m.k1, klausurCount(s, q) === 2 ? m.k2 : undefined].filter(isNum);
  const k = avg(ks);
  const o = isNum(m.o) ? m.o : null;
  if (k === null && o === null) return null;
  const w = klausurWeight(s, q);
  const raw = k === null ? o : o === null ? k : w * k + (1 - w) * o;
  return { points: Math.round(raw), raw, k, o, source: 'marks' };
}

/** Average of the semesters entered so far (used to project the open ones). */
export function subjectAverage(s) {
  return avg(Q.filter((q) => isTaken(s, q)).map((q) => semesterEntered(s, q)?.points).filter(isNum));
}

export function semesterValue(s, q, expect) {
  const e = semesterEntered(s, q);
  if (e) return e;
  const a = subjectAverage(s);
  return { points: Math.round(a ?? expect), source: 'projected' };
}

/** Other-performance average needed for `target` points, given the Klausur(en). */
export function neededOther(s, q, target) {
  const e = semesterEntered(s, q);
  if (!e || e.k === null || e.k === undefined) return null;
  const w = klausurWeight(s, q);
  return (target - 0.5 - w * e.k) / (1 - w);
}

/* ---------- Block I ---------- */

/** Which GK semesters must count (exam subjects 3/4: all; 5th component: its last semester). */
export function mandatoryKeys(state) {
  const keys = new Set();
  for (const s of state.subjects) {
    if (s.type !== 'GK') continue;
    const taken = Q.filter((q) => isTaken(s, q));
    if (s.role === 'PF3' || s.role === 'PF4') taken.forEach((q) => keys.add(`${s.id}:${q}`));
    if (s.role === 'PK5' && taken.length) keys.add(`${s.id}:${taken[taken.length - 1]}`);
  }
  return keys;
}

/**
 * All taken semesters with points; LK all counted; GK: manual strikes out, then
 * mandatory, then area coverage (2 per core area), then the best up to 24.
 */
export function selectCourses(state, overrides = {}) {
  const expect = state.settings?.expect ?? 11;
  const mand = mandatoryKeys(state);
  const all = [];
  for (const s of state.subjects) {
    for (const q of Q) {
      if (!isTaken(s, q)) continue;
      const key = `${s.id}:${q}`;
      const v = key in overrides ? { points: overrides[key], source: 'projected' } : semesterValue(s, q, expect);
      const mandatory = mand.has(key);
      all.push({
        key, sid: s.id, q, lk: s.type === 'LK', area: s.area || 'other', mandatory,
        struck: s.type === 'GK' && !mandatory && !!s.sem?.[q]?.strike,
        ...v,
      });
    }
  }
  const lk = all.filter((c) => c.lk);
  const pool = all.filter((c) => !c.lk && !c.struck);
  const best = (a, b) => b.points - a.points;
  const chosen = new Set(pool.filter((c) => c.mandatory).map((c) => c.key));

  for (const area of CORE_AREAS) {
    const have = lk.filter((c) => c.area === area).length + pool.filter((c) => chosen.has(c.key) && c.area === area).length;
    pool.filter((c) => !chosen.has(c.key) && c.area === area).sort(best)
      .slice(0, Math.max(0, RULES.areaMin - have)).forEach((c) => chosen.add(c.key));
  }
  for (const c of pool.filter((x) => !chosen.has(x.key)).sort(best)) {
    if (chosen.size >= RULES.gkCount) break;
    chosen.add(c.key);
  }
  return all.map((c) => ({ ...c, counted: c.lk || chosen.has(c.key) }));
}

/* ---------- everything ---------- */

export function examValue(state, id, overrides = {}) {
  const e = state.exams?.[id] || {};
  if (`exam:${id}` in overrides) return { points: overrides[`exam:${id}`], done: false };
  return { points: isNum(e.points) ? e.points : (state.settings?.expect ?? 11), done: !!e.done, entered: isNum(e.points) };
}

export function computeAll(state, overrides = {}) {
  const courses = selectCourses(state, overrides);
  const lk = courses.filter((c) => c.lk);
  const gk = courses.filter((c) => !c.lk && c.counted);
  const b1 = 2 * lk.reduce((a, c) => a + c.points, 0) + gk.reduce((a, c) => a + c.points, 0);

  const exams = EXAMS.map((id) => ({ id, ...examValue(state, id, overrides) }));
  const b2 = exams.reduce((a, e) => a + e.points * RULES.examFactor, 0);
  const total = b1 + b2;

  const problems = [];
  if (lk.length !== RULES.lkCount) problems.push(`${lk.length} LK semesters set up, 8 expected (2 LK × 4).`);
  const gkTaken = courses.filter((c) => !c.lk).length;
  if (gk.length < RULES.gkCount) problems.push(`Only ${gk.length} GK semesters can count, 24 are required.`);
  if (gk.length > RULES.gkCount) problems.push(`${gk.length} GK semesters are mandatory, but only 24 can count. Check the exam roles.`);
  const zeros = [...lk, ...gk].filter((c) => c.points === 0).length;
  if (zeros) problems.push(`${zeros} counted semester(s) with 00 points. Not allowed.`);
  const lkU5 = lk.filter((c) => c.points < 5).length;
  if (lkU5 > RULES.maxLkUnder5) problems.push(`${lkU5} LK semesters under 05 points (max ${RULES.maxLkUnder5}).`);
  const gkU5 = gk.filter((c) => c.points < 5).length;
  if (gkU5 > RULES.maxGkUnder5) problems.push(`${gkU5} GK semesters under 05 points (max ${RULES.maxGkUnder5}).`);
  if (b1 < RULES.minBlockI) problems.push(`Block I under ${RULES.minBlockI} points.`);
  for (const area of CORE_AREAS) {
    const n = courses.filter((c) => c.counted && c.area === area).length;
    if (n < RULES.areaMin) problems.push(`${AREAS[area]}: ${n} of ${RULES.areaMin} required semesters counted.`);
  }
  if (b2 < RULES.minBlockII) problems.push(`Block II under ${RULES.minBlockII} points.`);
  const at5 = exams.filter((e) => e.id !== 'PK5' && e.points >= 5);
  if (at5.length < RULES.minExamsAt5 || !at5.some((e) => e.id === 'PF1' || e.id === 'PF2')) {
    problems.push('Exams: at least 2 of the 4 exam subjects need 05+, one of them an LK.');
  }

  const manual = courses.filter((c) => c.struck).length;
  const strikes = { possible: Math.max(0, gkTaken - RULES.gkCount), manual, auto: Math.max(0, gkTaken - gk.length - manual) };

  return { courses, b1, b2, exams, total, grade: totalToGrade(total), problems, strikes };
}

/**
 * Average level (0–15, in tenths) that every OPEN item needs so the total reaches `target`.
 * Open = semesters without entered grades + exams not marked done.
 */
export function requiredAverage(state, target) {
  const keys = [];
  for (const s of state.subjects) for (const q of Q) if (isTaken(s, q) && !semesterEntered(s, q)) keys.push(`${s.id}:${q}`);
  for (const id of EXAMS) if (!state.exams?.[id]?.done) keys.push(`exam:${id}`);
  const n = keys.length;
  if (!n) return { open: 0, level: null, reachable: computeAll(state).total >= target };
  const totalAt = (tenths) => {
    const f = Math.floor(tenths / 10), high = Math.round(((tenths / 10) - f) * n);
    const ov = {};
    keys.forEach((k, i) => (ov[k] = Math.min(15, i < high ? f + 1 : f)));
    return computeAll(state, ov).total;
  };
  if (totalAt(150) < target) return { open: n, level: null, reachable: false };
  if (totalAt(0) >= target) return { open: n, level: 0, reachable: true };
  let lo = 0, hi = 150;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (totalAt(mid) >= target) hi = mid; else lo = mid; }
  return { open: n, level: hi / 10, reachable: true };
}
