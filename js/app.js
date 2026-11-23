// Wiring: holds state, handles taps and inputs, saves, re-renders.
import { computeAll, Q } from './rules.js';
import { load, save, exportJSON, importJSON, reset, uid } from './state.js';
import * as V from './ui.js';
import { animate, pop, haptic, swipeToClose, reducedMotion } from './motion.js';

let state = load();
let sheet = null;   // { kind: 'subject' | 'exams' | 'settings', sid? }
let opener = null;  // control that opened the sheet (focus returns there)
let lastTap = null;

const $view = document.getElementById('view');
const $sheet = document.getElementById('sheet');
const $body = document.getElementById('sheet-body');
const $panel = $sheet.querySelector('.sheet-panel');
const clamp = (v) => Math.max(0, Math.min(15, v));

/* ---------- render ---------- */
function render() {
  const calc = computeAll(state);
  $view.innerHTML = V.home(state, calc);
  animate($view);
  if (sheet) {
    const wasHidden = $sheet.hidden;
    const top = $panel.scrollTop;
    const active = document.activeElement?.id;
    $body.innerHTML = sheet.kind === 'subject' ? V.subjectSheet(state, calc, sheet.sid)
      : sheet.kind === 'exams' ? V.examsSheet(state, calc) : V.settingsSheet(state);
    $sheet.hidden = false;
    $panel.scrollTop = top;
    animate($body);
    if (wasHidden) document.getElementById('sheet-title')?.focus({ preventScroll: true });
    else if (active && $body.querySelector(`#${CSS.escape(active)}`)) document.getElementById(active).focus({ preventScroll: true });
  } else if (!$sheet.hidden) {
    $sheet.hidden = true;
    if (opener) document.querySelector(opener)?.focus({ preventScroll: true });
    opener = null;
  }
  pop(document, lastTap);
  lastTap = null;
}

function commit() {
  if (!save(state)) toast('Could not save. Is storage blocked?');
  render();
}

/** For typed grades: refresh the home screen and only the computed parts of the open sheet,
 *  so the number fields (and the phone keyboard) stay where they are. */
function softCommit() {
  if (!save(state)) toast('Could not save. Is storage blocked?');
  const calc = computeAll(state);
  $view.innerHTML = V.home(state, calc);
  animate($view);
  if (!sheet) return;
  const tpl = document.createElement('template');
  tpl.innerHTML = sheet.kind === 'subject' ? V.subjectSheet(state, calc, sheet.sid) : V.examsSheet(state, calc);
  $body.querySelectorAll('[data-live]').forEach((el) => {
    const fresh = tpl.content.querySelector(`[data-live="${el.dataset.live}"]`);
    if (fresh && fresh.outerHTML !== el.outerHTML) el.replaceWith(fresh);
  });
}

let toastTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 2400);
}

function openSheet(s, openerSel) { sheet = s; opener = openerSel; $panel.scrollTop = 0; render(); }
function closeSheet() {
  if (!sheet) return;
  document.activeElement?.blur(); // commits a pending input change first
  if (reducedMotion()) { sheet = null; render(); return; }
  $sheet.classList.add('closing');
  setTimeout(() => { $sheet.classList.remove('closing'); sheet = null; render(); }, 220);
}

/* ---------- helpers ---------- */
const subj = (sid) => state.subjects.find((s) => s.id === sid);
const sem = (sid, q) => { const s = subj(sid); s.sem ||= {}; return (s.sem[q] ||= {}); };

/* ---------- tap actions ---------- */
const actions = {
  'open-settings': () => openSheet({ kind: 'settings' }, '[data-act="open-settings"]'),
  'open-exams': () => openSheet({ kind: 'exams' }, '[data-act="open-exams"]'),
  'open-subject': (d) => openSheet({ kind: 'subject', sid: d.sid }, `[data-act="open-subject"][data-sid="${d.sid}"]`),
  'set-target': (d) => { state.settings.target = +d.v; commit(); },
  'toggle-strike': (d, el) => { const m = sem(d.sid, d.q); if (el.checked) m.strike = true; else delete m.strike; commit(); },
  'toggle-exam-done': (d, el) => { state.exams[d.id].done = el.checked; commit(); },
  'toggle-taken': (d) => {
    const s = subj(d.sid);
    const t = new Set(s.taken || Q);
    t.has(d.q) ? t.delete(d.q) : t.add(d.q);
    s.taken = Q.filter((q) => t.has(q));
    commit();
  },
  'set-type': (d) => {
    const s = subj(d.sid); s.type = d.v;
    if (d.v === 'LK') { s.taken = [...Q]; s.role = null; }
    commit();
  },
  'add-subject': () => {
    state.subjects.push({ id: uid(), name: 'New subject', type: 'GK', area: 'other', role: null, taken: [...Q], sem: {} });
    commit();
  },
  'del-subject': (d) => {
    const s = subj(d.sid);
    if (!confirm(`Remove ${s.name} and all its grades?`)) return;
    state.subjects = state.subjects.filter((x) => x.id !== d.sid);
    commit();
  },
  'step-expect': (d) => { state.settings.expect = clamp(state.settings.expect + +d.d); commit(); },
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
    state = reset(); commit(); toast('All data reset');
  },
};

document.addEventListener('click', (ev) => {
  if (ev.target.closest('[data-close]')) { closeSheet(); return; }
  const el = ev.target.closest('[data-act]');
  if (!el || el.disabled) return;
  if (el.type === 'checkbox') return; // handled on change
  haptic();
  lastTap = `[data-act="${el.dataset.act}"]` + ['sid', 'q', 'v', 'id'].filter((k) => el.dataset[k]).map((k) => `[data-${k}="${CSS.escape(el.dataset[k])}"]`).join('');
  actions[el.dataset.act]?.(el.dataset, el);
});

/* ---------- inputs ---------- */
function readPoints(el, decimals) {
  if (el.value.trim() === '') return undefined;
  const v = parseFloat(el.value.replace(',', '.'));
  if (!Number.isFinite(v)) return undefined;
  return decimals ? Math.round(clamp(v) * 10) / 10 : Math.round(clamp(v));
}

document.addEventListener('change', async (ev) => {
  const el = ev.target;
  if (el.type === 'checkbox' && el.dataset.act) { haptic(); actions[el.dataset.act]?.(el.dataset, el); return; }
  const f = el.dataset.field;
  if (!f) return;
  const d = el.dataset;
  if (['k1', 'k2', 'o', 'final'].includes(f)) {
    const v = readPoints(el, f === 'o');
    const m = sem(d.sid, d.q);
    if (v === undefined) delete m[f]; else m[f] = v;
    el.value = v === undefined ? '' : String(v).replace('.', ',');
    softCommit(); return;
  } else if (f === 'exam') {
    const v = readPoints(el, false);
    state.exams[d.id].points = v ?? null;
    if (v === undefined) state.exams[d.id].done = false;
    el.value = v ?? '';
    softCommit(); return;
  } else if (f === 'name') subj(d.sid).name = el.value.trim() || 'Subject';
  else if (f === 'area') subj(d.sid).area = el.value;
  else if (f === 'role') {
    // a role belongs to one subject only
    state.subjects.forEach((s) => { if (el.value && s.role === el.value) s.role = null; });
    subj(d.sid).role = el.value || null;
  } else if (f === 'import') {
    const file = el.files?.[0]; if (!file) return;
    try { state = importJSON(await file.text()); commit(); toast('Backup imported'); } catch (e) { toast(e.message || 'Import failed'); }
    return;
  }
  commit();
});

// Enter on the phone keypad moves to the next field
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && ev.target.matches('input[inputmode]')) {
    ev.preventDefault();
    const inputs = [...$body.querySelectorAll('input[inputmode]')];
    const next = inputs[inputs.indexOf(ev.target) + 1];
    if (next) next.focus(); else ev.target.blur();
    return;
  }
  if (!sheet) return;
  if (ev.key === 'Escape') { closeSheet(); return; }
  if (ev.key === 'Tab') { // keep focus inside the sheet
    const f = [...$sheet.querySelectorAll('button, input, select')].filter((x) => !x.disabled && x.offsetParent);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (ev.shiftKey && (document.activeElement === first || !$sheet.contains(document.activeElement))) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
  }
});

swipeToClose($sheet, closeSheet);
render();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
