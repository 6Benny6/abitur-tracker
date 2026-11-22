// Grade maths for the Berlin Abitur (VO-GO). Pure functions, no UI.
// Every rule constant lives in RULES so it can be checked against the
// school's official handout and corrected in one place.

export const RULES = {
  blockI: {
    courses: 40,          // number of semester courses brought into Block I
    lkMultiplier: 2,      // LK semester courses count double
    scale: 40,            // E_I = P / S * scale  (max 600)
    max: 600,
    min: 200,
    maxUnder5: 8,         // max courses below 05 points among those counted
  },
  blockII: {
    exams: 5,
    multiplier: 4,        // each exam component counts four-fold (max 300)
    max: 300,
    min: 100,
    minExamsAt5: 3,       // at least 3 exam components with >= 5 points ...
    lkAt5: true,          // ... one of them an LK
  },
  total: { max: 900, min: 300 },
  semesters: ['Q1', 'Q2', 'Q3', 'Q4'],
};

export const TARGETS = { '1.0': 823, '1.1': 805, '1.2': 787, '1.3': 769, '1.4': 751, '1.5': 733 };

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Total points (300–900) -> Abitur grade, standard KMK formula N = 17/3 - E/180, truncated. */
export function totalToGrade(total) {
  if (!isNum(total) || total < RULES.total.min) return null;
  if (total >= 823) return 1.0;
  // integer maths avoids float truncation errors: N*10 = floor((3060 - 3E) / 54)
  return Math.floor((3060 - 3 * total) / 54) / 10;
}

/** Lowest total that still yields the given grade (e.g. 1.3 -> 769). */
export function gradeToMinTotal(grade) {
  for (let t = 300; t <= 900; t++) if (totalToGrade(t) <= grade + 1e-9) return t;
  return null;
}

/* ---------- semester (course) level ---------- */

function weightedAvg(items) {
  let s = 0, w = 0;
  for (const it of items) {
    if (!isNum(it.points)) continue;
    const wt = isNum(it.weight) && it.weight > 0 ? it.weight : 1;
    s += it.points * wt; w += wt;
  }
  return w > 0 ? s / w : null;
}

/** Components of one semester: Klausur average, other-performance average. */
export function componentAverages(sem, { includePlanned = true } = {}) {
  const items = (sem?.items || []).filter((i) => includePlanned || !i.planned);
  return {
    k: weightedAvg(items.filter((i) => i.kind === 'K')),
    o: weightedAvg(items.filter((i) => i.kind === 'O')),
  };
}

/**
 * Exact (unrounded) semester value from components.
 * If only one component exists, it stands alone (it is all we know).
 */
export function rawFromComponents(sem, wK, opts) {
  const { k, o } = componentAverages(sem, opts);
  if (k === null && o === null) return null;
  if (k === null) return o;
  if (o === null) return k;
  return wK * k + (1 - wK) * o;
}

/**
 * Resolve one semester to points + status.
 * status: 'final' (grade on report) | 'live' (computed from actual marks)
 *         | 'planned' (what-if value or planned marks) | 'assumed' (nothing entered)
 */
export function resolveSemester(sem, wK, assume) {
  sem = sem || {};
  if (isNum(sem.final)) return { points: sem.final, status: 'final' };
  const hasActual = (sem.items || []).some((i) => !i.planned && isNum(i.points));
  const raw = rawFromComponents(sem, wK);
  if (raw !== null) {
    return { points: Math.round(raw), raw, status: hasActual ? 'live' : 'planned' };
  }
  if (isNum(sem.plan)) return { points: sem.plan, status: 'planned' };
  return { points: assume, status: 'assumed' };
}

/**
 * Per-course solver: what average is needed in one component to reach
 * `target` semester points, given the other component as it stands.
 * Returns { value, feasible } where value may be < 0 (already safe) or > 15 (impossible).
 */
export function neededComponent(sem, wK, target, which /* 'O' | 'K' */) {
  const { k, o } = componentAverages(sem);
  const threshold = target - 0.5; // rounding: x.5 rounds up
  const wThis = which === 'O' ? 1 - wK : wK;
  const other = which === 'O' ? k : o;
  if (other === null) return { value: threshold, feasible: threshold <= 15, alone: true };
  const value = (threshold - (1 - wThis) * other) / wThis;
  return { value, feasible: value <= 15 };
}

/**
 * Points needed in the NEXT single mark of a component (weight `w`),
 * given the marks already in that component.
 */
export function neededNextMark(sem, wK, target, which, w = 1) {
  const need = neededComponent(sem, wK, target, which);
  const existing = (sem?.items || []).filter((i) => i.kind === which && isNum(i.points));
  const sw = existing.reduce((a, i) => a + (i.weight > 0 ? i.weight : 1), 0);
  const sp = existing.reduce((a, i) => a + i.points * (i.weight > 0 ? i.weight : 1), 0);
  const value = (need.value * (sw + w) - sp) / w;
  return { value, feasible: value <= 15 };
}

/* ---------- Block I ---------- */

/**
 * Choose the courses for Block I: for each subject its best `minCount`
 * semesters are mandatory (LKs: all 4), then fill up to RULES.blockI.courses
 * with the best remaining semesters.
 */
export function selectBlockI(state, overrides = {}) {
  const assume = state.settings?.assume ?? 10;
  const all = [];
  for (const s of state.subjects) {
    const wK = s.wK ?? (s.type === 'LK' ? 0.5 : 1 / 3);
    for (const q of RULES.semesters) {
      const key = `${s.id}:${q}`;
      const r = key in overrides
        ? { points: overrides[key], status: 'planned' }
        : resolveSemester(s.semesters?.[q], wK, assume);
      if (!isNum(r.points)) continue;
      all.push({ key, subjectId: s.id, name: s.name, q, lk: s.type === 'LK', ...r });
    }
  }
  const byPoints = (a, b) => b.points - a.points;
  const chosen = new Set();
  for (const s of state.subjects) {
    const min = s.type === 'LK' ? 4 : clamp(s.minCount ?? 0, 0, 4);
    all.filter((c) => c.subjectId === s.id).sort(byPoints).slice(0, min)
      .forEach((c) => chosen.add(c.key));
  }
  // fill with best rest; prefer GK rest (LK are all mandatory anyway)
  const rest = all.filter((c) => !chosen.has(c.key)).sort(byPoints);
  for (const c of rest) {
    if (chosen.size >= RULES.blockI.courses) break;
    chosen.add(c.key);
  }
  const courses = all.map((c) => ({ ...c, counted: chosen.has(c.key) }));
  return courses;
}

export function blockI(courses) {
  const counted = courses.filter((c) => c.counted);
  let P = 0, S = 0;
  for (const c of counted) {
    const m = c.lk ? RULES.blockI.lkMultiplier : 1;
    P += c.points * m; S += m;
  }
  const points = S > 0 ? Math.round((P / S) * RULES.blockI.scale) : 0;
  return {
    points, P, S,
    count: counted.length,
    under5: counted.filter((c) => c.points < 5).length,
    zeros: counted.filter((c) => c.points === 0).length,
  };
}

/* ---------- Block II ---------- */

export function blockII(exams, state, assume) {
  const lkIds = new Set(state.subjects.filter((s) => s.type === 'LK').map((s) => s.id));
  const list = exams.map((e) => {
    const has = isNum(e.points);
    return { ...e, value: has ? e.points : assume, status: has ? (e.planned ? 'planned' : 'final') : 'assumed' };
  });
  const points = list.reduce((a, e) => a + e.value * RULES.blockII.multiplier, 0);
  const at5 = list.filter((e) => e.value >= 5);
  return {
    points,
    list,
    at5: at5.length,
    lkAt5: at5.some((e) => lkIds.has(e.subjectId)),
  };
}

/* ---------- whole Abitur ---------- */

export function computeAll(state, overrides = {}) {
  const assume = state.settings?.assume ?? 10;
  const courses = selectBlockI(state, overrides);
  const b1 = blockI(courses);
  const examOv = state.exams.map((e) => (`exam:${e.id}` in overrides ? { ...e, points: overrides[`exam:${e.id}`], planned: true } : e));
  const b2 = blockII(examOv, state, assume);
  const total = b1.points + b2.points;
  const grade = totalToGrade(total);

  const warnings = [];
  if (b1.count < RULES.blockI.courses) warnings.push(`Only ${b1.count} of ${RULES.blockI.courses} Block I courses available.`);
  if (b1.points < RULES.blockI.min) warnings.push(`Block I below ${RULES.blockI.min}.`);
  if (b1.under5 > RULES.blockI.maxUnder5) warnings.push(`${b1.under5} counted courses under 05 points (max ${RULES.blockI.maxUnder5}).`);
  if (b1.zeros > 0) warnings.push(`${b1.zeros} counted course(s) with 00 points.`);
  if (b2.points < RULES.blockII.min) warnings.push(`Block II below ${RULES.blockII.min}.`);
  if (b2.at5 < RULES.blockII.minExamsAt5) warnings.push(`Fewer than ${RULES.blockII.minExamsAt5} exams with 05+ points.`);
  if (RULES.blockII.lkAt5 && !b2.lkAt5) warnings.push('No LK exam with 05+ points.');

  const statusCount = { final: 0, live: 0, planned: 0, assumed: 0 };
  courses.filter((c) => c.counted).forEach((c) => statusCount[c.status]++);
  b2.list.forEach((e) => statusCount[e.status]++);

  return { courses, b1, b2, total, grade, warnings, statusCount };
}

/**
 * Global solver: the single uniform level p (0..15, step 0.1 shown) that all
 * OPEN items (not final) would need so the total reaches `targetTotal`.
 * Open items = semesters not marked final + exams without an actual result.
 * Returns null if unreachable even at 15.
 */
export function requiredUniformLevel(state, targetTotal) {
  const openKeys = [];
  for (const s of state.subjects) {
    for (const q of RULES.semesters) {
      const sem = s.semesters?.[q];
      if (!isNum(sem?.final)) openKeys.push(`${s.id}:${q}`);
    }
  }
  const openExams = state.exams.filter((e) => !(isNum(e.points) && !e.planned)).map((e) => `exam:${e.id}`);
  const keys = [...openKeys, ...openExams];
  if (keys.length === 0) return { level: null, open: 0, reachable: computeAll(state).total >= targetTotal };
  // Average level L (in tenths) is realised as a mix of integer points:
  // a share (L - floor L) of open items at ceil, the rest at floor.
  const totalAt = (tenths) => {
    const L = tenths / 10, f = Math.floor(L);
    const high = Math.round((L - f) * keys.length);
    const ov = {};
    keys.forEach((k, i) => (ov[k] = Math.min(15, i < high ? f + 1 : f)));
    return computeAll(state, ov).total;
  };
  if (totalAt(150) < targetTotal) return { level: null, open: keys.length, reachable: false };
  if (totalAt(0) >= targetTotal) return { level: 0, open: keys.length, reachable: true };
  let lo = 0, hi = 150; // invariant: totalAt(lo) < target <= totalAt(hi)
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (totalAt(mid) >= targetTotal) hi = mid; else lo = mid;
  }
  return { level: hi / 10, open: keys.length, reachable: true };
}
