// App data: lives in this browser's localStorage. Export/import as JSON for backup.

const KEY = 'abitur-tracker:v1';
export const SCHEMA = 1;

export const uid = () => Math.random().toString(36).slice(2, 9);

export const ALL_Q = ['Q1', 'Q2', 'Q3', 'Q4'];

function subject(name, type = 'GK', minCount = 0) {
  return { id: uid(), name, type, wK: type === 'LK' ? 0.5 : 1 / 3, minCount, taken: [...ALL_Q], semesters: {} };
}

/** Bring older saved data up to date (v1.2 used `droppedAfter`). */
export function migrate(s) {
  for (const sub of s.subjects) {
    if (!Array.isArray(sub.taken)) {
      const last = sub.droppedAfter ? ALL_Q.indexOf(sub.droppedAfter) : 3;
      sub.taken = ALL_Q.slice(0, last + 1);
    }
    delete sub.droppedAfter;
  }
  return s;
}

export function defaultState() {
  const subjects = [
    subject('English', 'LK', 4),
    subject('Mathematics', 'LK', 4),
    subject('German', 'GK', 4),
    subject('History', 'GK', 2),
    subject('Politics', 'GK', 0),
    subject('Biology', 'GK', 2),
    subject('Physics', 'GK', 0),
    subject('French', 'GK', 0),
    subject('Art', 'GK', 0),
    subject('Sport', 'GK', 0),
    subject('Geography', 'GK', 0),
    subject('Music', 'GK', 0),
  ];
  const [en, ma, de] = subjects;
  return {
    schema: SCHEMA,
    settings: { assume: 11, target: 769 },
    subjects,
    exams: [
      { id: uid(), label: '1st exam · written', subjectId: en.id, points: null, planned: true },
      { id: uid(), label: '2nd exam · written', subjectId: ma.id, points: null, planned: true },
      { id: uid(), label: '3rd exam · written', subjectId: de.id, points: null, planned: true },
      { id: uid(), label: '4th exam · oral', subjectId: null, points: null, planned: true },
      { id: uid(), label: '5th component · PK', subjectId: null, points: null, planned: true },
    ],
    updated: Date.now(),
  };
}

function valid(s) {
  return s && typeof s === 'object' && Array.isArray(s.subjects) && Array.isArray(s.exams) && s.settings;
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (valid(s)) return migrate(s);
    }
  } catch { /* storage blocked or corrupt: fall through */ }
  return defaultState();
}

export function save(state) {
  state.updated = Date.now();
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function exportJSON(state) {
  return JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2);
}

export function importJSON(text) {
  const s = JSON.parse(text);
  if (!valid(s)) throw new Error('Not a tracker backup file.');
  delete s.exportedAt;
  return migrate(s);
}

export function reset() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  return defaultState();
}
