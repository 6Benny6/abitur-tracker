// Wiring: holds state, handles taps, saves, re-renders.
import { computeAll, RULES } from './rules.js';
import { load, save, exportJSON, importJSON, reset, uid } from './state.js';
import * as V from './ui.js';

let state = load();
const ui = { tab: 'overview', sheet: null, openGroups: new Set() };
let opener = null; // selector of the control that opened the sheet
const $view = document.getElementById('view');
const $sheet = document.getElementById('sheet');
const $sheetBody = document.getElementById('sheet-body');
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp = (v) => Math.max(0, Math.min(15, v));

/* ---------- theme ---------- */
const THEME_KEY = 'abitur-tracker:theme';
let theme = 'auto';
try { theme = localStorage.getItem(THEME_KEY) || 'auto'; } catch { /* ignore */ }
function applyTheme() {
  if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
}
applyTheme();

/* ---------- render ---------- */
function render() {
  const calc = computeAll(state);
  const views = { overview: V.overview, courses: V.courses, plan: (st, c) => V.plan(st, c, ui.openGroups) };
  const scroll = window.scrollY;
  $view.innerHTML = ui.tab === 'settings' ? V.settings(state, theme) : views[ui.tab](state, calc);
  window.scrollTo(0, scroll);
  document.querySelectorAll('.tabs button').forEach((b) => {
    if (b.dataset.tab === ui.tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  if (ui.sheet) {
    const wasHidden = $sheet.hidden;
    const top = $sheet.querySelector('.sheet-panel').scrollTop;
    $sheetBody.innerHTML = V.semesterSheet(state, calc, ui.sheet);
    $sheet.hidden = false;
    $sheet.querySelector('.sheet-panel').scrollTop = top;
    const label = document.getElementById('add-label');
    if (label) label.focus({ preventScroll: true });
    else if (wasHidden) document.getElementById('sheet-title')?.focus({ preventScroll: true });
  } else if (!$sheet.hidden) {
    $sheet.hidden = true;
    if (opener) document.querySelector(opener)?.focus({ preventScroll: true });
    opener = null;
  }
}

function commit() {
  if (!save(state)) toast('Could not save — storage blocked?');
  render();
}

let toastTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 2200);
}

/* ---------- helpers ---------- */
const subj = (sid) => state.subjects.find((s) => s.id === sid);
function sem(sid, q) {
  const s = subj(sid);
  s.semesters ||= {};
  return (s.semesters[q] ||= { items: [] });
}
function defaultMode(sid, q) {
  const m = subj(sid)?.semesters?.[q] || {};
  if (isNum(m.final)) return 'final';
  if ((m.items || []).length) return 'marks';
  if (isNum(m.plan)) return 'estimate';
  return q === 'Q1' || q === 'Q2' ? 'final' : q === 'Q4' ? 'estimate' : 'marks';
}

/* ---------- actions ---------- */
const actions = {
  tab: (d) => { ui.tab = d.tab; window.scrollTo(0, 0); render(); },

  'open-sem': (d) => { opener = `[data-act="open-sem"][data-sid="${d.sid}"][data-q="${d.q}"]`; ui.sheet = { sid: d.sid, q: d.q, mode: defaultMode(d.sid, d.q), adding: null, target: null }; render(); },
  'sem-mode': (d) => { ui.sheet.mode = d.m; ui.sheet.adding = null; render(); },
  'set-final': (d) => { sem(d.sid, d.q).final = +d.v; commit(); },
  'clear-final': (d) => { delete sem(d.sid, d.q).final; commit(); },
  'set-plan': (d) => { sem(d.sid, d.q).plan = +d.v; commit(); },
  'clear-plan': (d) => { delete sem(d.sid, d.q).plan; commit(); },
  'start-add': (d) => { ui.sheet.adding = { kind: d.kind, weight: 1, planned: false, label: '' }; render(); },
  'cancel-add': () => { ui.sheet.adding = null; render(); },
  'add-weight': (d) => { ui.sheet.adding.weight = +d.w; keepLabel(); render(); },
  'add-planned': (d, el) => { ui.sheet.adding.planned = el.checked; keepLabel(); render(); },
  'commit-mark': (d) => {
    const a = ui.sheet.adding; keepLabel();
    const m = sem(d.sid, d.q); m.items ||= [];
    const n = m.items.filter((i) => i.kind === a.kind).length + 1;
    m.items.push({
      id: uid(), kind: a.kind, points: +d.v, planned: a.planned,
      weight: a.kind === 'O' ? a.weight : 1,
      label: a.label.trim() || (a.kind === 'K' ? `Klausur ${n}` : `Mark ${n}`),
    });
    ui.sheet.adding = null; ui.sheet.target = null;
    commit();
  },
  'del-mark': (d) => {
    const m = sem(d.sid, d.q);
    m.items = (m.items || []).filter((i) => i.id !== d.id);
    commit();
  },
  'sem-target': (d) => {
    const cur = $sheetBody.querySelector('[data-act="sem-target"]')?.parentElement.querySelector('output').textContent;
    ui.sheet.target = clamp((parseInt(cur, 10) || 12) + +d.d); render();
  },

  'toggle-group': (d) => { ui.openGroups.has(d.q) ? ui.openGroups.delete(d.q) : ui.openGroups.add(d.q); render(); },
  'set-target': (d) => { state.settings.target = +d.v; commit(); },
  'step-plan': (d) => {
    const c = computeAll(state).courses.find((x) => x.key === `${d.sid}:${d.q}`);
    sem(d.sid, d.q).plan = clamp((c?.points ?? state.settings.assume) + +d.d); commit();
  },
  'step-exam': (d) => {
    const e = state.exams.find((x) => x.id === d.id);
    const base = isNum(e.points) ? e.points : state.settings.assume;
    e.points = clamp(base + +d.d); if (e.planned !== false) e.planned = true; commit();
  },
  'fill-open': (d) => {
    const v = +d.v;
    for (const s of state.subjects) for (const q of RULES.semesters) {
      const m = s.semesters?.[q];
      if (m && (isNum(m.final) || (m.items || []).length || isNum(m.plan))) continue;
      sem(s.id, q).plan = v;
    }
    state.exams.forEach((e) => { if (!isNum(e.points)) { e.points = v; e.planned = true; } });
    toast(`Unplanned items set to ${String(v).padStart(2, '0')}`);
    commit();
  },

  'set-type': (d) => {
    const s = subj(d.sid); s.type = d.t; s.wK = d.t === 'LK' ? 0.5 : 1 / 3; commit();
  },
  'add-subject': () => {
    state.subjects.push({ id: uid(), name: 'New subject', type: 'GK', wK: 1 / 3, minCount: 0, semesters: {} }); commit();
  },
  'del-subject': (d) => {
    const s = subj(d.sid);
    if (!confirm(`Remove ${s.name} and all its grades?`)) return;
    state.subjects = state.subjects.filter((x) => x.id !== d.sid);
    state.exams.forEach((e) => { if (e.subjectId === d.sid) e.subjectId = null; });
    commit();
  },
  'step-assume': (d) => { state.settings.assume = clamp(state.settings.assume + +d.d); commit(); },
  'set-theme': (d) => {
    theme = d.t; try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
    applyTheme(); render();
  },
  export: async () => {
    const name = `abitur-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const blob = new Blob([exportJSON(state)], { type: 'application/json' });
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Abitur backup' }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  reset: () => {
    if (!confirm('Delete all grades on this device? Export a backup first.')) return;
    state = reset(); commit(); toast('Reset');
  },
};

function keepLabel() {
  const el = document.getElementById('add-label');
  if (el && ui.sheet?.adding) ui.sheet.adding.label = el.value;
}

document.addEventListener('click', (ev) => {
  const close = ev.target.closest('[data-close]');
  if (close) { ui.sheet = null; render(); return; }
  const el = ev.target.closest('[data-act], .tabs button');
  if (!el || el.matches('input[type="checkbox"]')) return;
  const act = el.dataset.act || 'tab';
  actions[act]?.(el.dataset, el);
});

document.addEventListener('change', async (ev) => {
  const el = ev.target;
  if (el.dataset.act === 'add-planned') return actions['add-planned'](el.dataset, el);
  const f = el.dataset.field;
  if (!f) return;
  if (f === 'name') { subj(el.dataset.sid).name = el.value.trim() || 'Subject'; }
  else if (f === 'wK') { subj(el.dataset.sid).wK = +el.value; }
  else if (f === 'minCount') { subj(el.dataset.sid).minCount = +el.value; }
  else if (f === 'exam-label') { state.exams.find((e) => e.id === el.dataset.id).label = el.value.trim() || 'Exam'; }
  else if (f === 'exam-subject') { state.exams.find((e) => e.id === el.dataset.id).subjectId = el.value || null; }
  else if (f === 'exam-final') { state.exams.find((e) => e.id === el.dataset.id).planned = !el.checked; }
  else if (f === 'import') {
    const file = el.files?.[0]; if (!file) return;
    try { state = importJSON(await file.text()); commit(); toast('Backup imported'); }
    catch (e) { toast(e.message || 'Import failed'); }
    return;
  }
  commit();
});

document.addEventListener('keydown', (ev) => {
  if (!ui.sheet) return;
  if (ev.key === 'Escape') { ui.sheet = null; render(); return; }
  if (ev.key === 'Tab') { // keep focus inside the open sheet
    const f = [...$sheet.querySelectorAll('button, input, select, [tabindex="0"]')].filter((el) => !el.disabled && el.offsetParent);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (ev.shiftKey && (document.activeElement === first || !$sheet.contains(document.activeElement))) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
  }
});

render();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
