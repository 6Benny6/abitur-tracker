// App data: stored only in this browser (localStorage). Export/import JSON as backup.
import { Q, EXAMS, isNum } from './rules.js';

const KEY = 'abitur-tracker:v1';
export const SCHEMA = 2;
export const uid = () => Math.random().toString(36).slice(2, 9);

function subject(name, type, area, role = null) {
  return { id: uid(), name, type, area, role, taken: [...Q], sem: {} };
}

export function defaultState() {
  return {
    schema: SCHEMA,
    settings: { target: 769, expect: 11 },
    subjects: [
      subject('English', 'LK', 'fs'),
      subject('Mathematics', 'LK', 'ma'),
      subject('German', 'GK', 'de', 'PF3'),
      subject('History', 'GK', 'gw', 'PF4'),
      subject('Biology', 'GK', 'nw', 'PK5'),
      subject('Politics', 'GK', 'gw'),
      subject('Physics', 'GK', 'nw'),
      subject('French', 'GK', 'fs'),
      subject('Art', 'GK', 'other'),
      subject('Sport', 'GK', 'other'),
    ],
    exams: Object.fromEntries(EXAMS.map((id) => [id, { points: null, done: false }])),
    updated: Date.now(),
  };
}

/* ---------- migration from schema 1 (app v1.x) ---------- */
const AREA_GUESS = [
  [/deutsch|german/i, 'de'], [/englisch|english|franz|french|spanisch|spanish|latein|latin|russ|ital|chines/i, 'fs'],
  [/mathe|math/i, 'ma'], [/bio|chem|physi|informatik|computer/i, 'nw'],
  [/geschicht|history|politik|politics|geograf|geograph|erdkunde|wirtschaft|economics|philosoph|ethik|psycholog|sozial/i, 'gw'],
];
const guessArea = (name) => (AREA_GUESS.find(([re]) => re.test(name)) || [null, 'other'])[1];

function weightedAvg(items) {
  let s = 0, w = 0;
  for (const i of items) { if (!isNum(i.points)) continue; const k = i.weight > 0 ? i.weight : 1; s += i.points * k; w += k; }
  return w ? Math.round((s / w) * 10) / 10 : undefined;
}

export function migrate(st) {
  if (st.schema === SCHEMA) return st;
  const roleByIndex = { 2: 'PF3', 3: 'PF4', 4: 'PK5' };
  const oldExams = Array.isArray(st.exams) ? st.exams : [];
  const subjects = st.subjects.map((s) => {
    let taken = Array.isArray(s.taken) ? s.taken : Q.slice(0, (s.droppedAfter ? Q.indexOf(s.droppedAfter) : 3) + 1);
    const sem = {};
    for (const q of Q) {
      const m = s.semesters?.[q];
      if (!m) continue;
      const n = {};
      if (isNum(m.final)) n.final = m.final;
      const ks = (m.items || []).filter((i) => i.kind === 'K' && !i.planned && isNum(i.points));
      if (ks[0]) n.k1 = ks[0].points;
      if (ks[1]) n.k2 = ks[1].points;
      const o = weightedAvg((m.items || []).filter((i) => i.kind === 'O' && !i.planned));
      if (isNum(o)) n.o = o;
      if (m.strike === 'strike') n.strike = true;
      if (Object.keys(n).length) sem[q] = n;
    }
    const idx = oldExams.findIndex((e) => e.subjectId === s.id);
    return {
      id: s.id, name: s.name, type: s.type === 'LK' ? 'LK' : 'GK', area: guessArea(s.name),
      role: s.type === 'LK' ? null : roleByIndex[idx] || null, taken, sem,
    };
  });
  const exams = Object.fromEntries(EXAMS.map((id, i) => {
    const e = oldExams[i] || {};
    return [id, { points: isNum(e.points) ? e.points : null, done: e.planned === false && isNum(e.points) }];
  }));
  return {
    schema: SCHEMA,
    settings: { target: st.settings?.target ?? 769, expect: st.settings?.assume ?? 11 },
    subjects, exams, updated: st.updated || Date.now(),
  };
}

const valid = (s) => s && typeof s === 'object' && Array.isArray(s.subjects) && s.exams && s.settings;

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const s = JSON.parse(raw); if (valid(s)) return migrate(s); }
  } catch { /* storage blocked or corrupt */ }
  return defaultState();
}

export function save(state) {
  state.updated = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(state)); return true; } catch { return false; }
}

export const exportJSON = (state) => JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2);

export function importJSON(text) {
  const s = JSON.parse(text);
  if (!valid(s)) throw new Error('This is not a backup file from this app.');
  delete s.exportedAt;
  return migrate(s);
}

export function reset() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  return defaultState();
}
