// Rendering. One home screen + three sheets (subject, exams, settings).
import {
  Q, AREAS, EXAM_LABEL, isNum, isTaken, klausurCount,
  semesterEntered, neededOther, requiredAverage,
} from './rules.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pp = (n) => (isNum(n) ? String(n).padStart(2, '0') : '–');
const g1 = (g) => (g === null ? '–' : g.toFixed(1));

const GEAR = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M10.3 2h3.4l.5 2.6c.6.2 1.2.5 1.7.9l2.5-.9 1.7 3-2 1.7a7 7 0 0 1 0 1.9l2 1.7-1.7 3-2.5-.9c-.5.4-1.1.7-1.7.9l-.5 2.6h-3.4l-.5-2.6a7 7 0 0 1-1.7-.9l-2.5.9-1.7-3 2-1.7a7 7 0 0 1 0-1.9l-2-1.7 1.7-3 2.5.9c.5-.4 1.1-.7 1.7-.9zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/></svg>';

function seg(key, options, current, act, attrs = '') {
  const i = options.findIndex(([v]) => v === current);
  return `<div class="seg" role="group" data-anim="seg:${key}" style="--n:${options.length};--i:${Math.max(0, i)}">
    ${options.map(([v, label]) => `<button data-act="${act}" data-v="${v}" ${attrs} aria-pressed="${v === current}">${label}</button>`).join('')}</div>`;
}

export function examSubject(state, id) {
  if (id === 'PF1' || id === 'PF2') return state.subjects.filter((s) => s.type === 'LK')[id === 'PF1' ? 0 : 1];
  return state.subjects.find((s) => s.role === id);
}

/* ---------------- home ---------------- */

export function home(state, calc) {
  const target = state.settings.target ?? 769;
  const req = requiredAverage(state, target);
  const diff = calc.total - target;
  const map = new Map(calc.courses.map((c) => [c.key, c]));

  let need;
  if (!req.reachable) need = '<span class="red">Out of reach, even with 15 in everything open.</span>';
  else if (req.open === 0) need = diff >= 0 ? 'Reached.' : '<span class="red">Not reached.</span>';
  else if (req.level === 0) need = 'Already secured.';
  else need = `You need <b>Ø ${req.level.toFixed(1)}</b> in the ${req.open} open semesters and exams.`;

  const courseRows = state.subjects.map((s) => {
    const cells = Q.map((q) => {
      if (!isTaken(s, q)) return '<span class="c none">–</span>';
      const c = map.get(`${s.id}:${q}`);
      const cls = [c.source === 'projected' ? 'proj' : '', c.counted ? '' : 'struck', c.struck ? 'mine' : ''].join(' ');
      return `<span class="c ${cls}">${pp(c.points)}</span>`;
    }).join('');
    return `<button class="row course" data-act="open-subject" data-sid="${s.id}">
      <span class="name">${esc(s.name)}${s.type === 'LK' ? ' <span class="badge">LK</span>' : ''}</span>
      <span class="cells">${cells}</span><span class="chev" aria-hidden="true"></span></button>`;
  }).join('');

  const examRows = calc.exams.map((e) => {
    const s = examSubject(state, e.id);
    return `<button class="row" data-act="open-exams">
      <span>${EXAM_LABEL[e.id]}<span class="sub">${s ? esc(s.name) : 'subject not set'}${e.done ? ' · result' : ''}</span></span>
      <span class="val ${e.entered ? '' : 'proj'}">${pp(e.points)}</span><span class="chev" aria-hidden="true"></span></button>`;
  }).join('');

  return `
    <header class="top">
      <h1>Abitur</h1>
      <button class="icon" data-act="open-settings" aria-label="Settings">${GEAR}</button>
    </header>

    <section class="card hero">
      <div class="hero-main">
        <div><div class="label">Projected grade</div>
          <div class="grade" data-anim="grade" data-count="${calc.grade ?? ''}" data-dec="1">${g1(calc.grade)}</div></div>
        <div class="pts"><b data-anim="total" data-count="${calc.total}">${calc.total}</b><span class="muted"> / 900</span></div>
      </div>
      ${seg('target', [[769, 'Goal 1.3'], [787, 'Goal 1.2']], target, 'set-target')}
      <p class="status"><span class="${diff >= 0 ? 'green' : 'red'}">${diff >= 0 ? `${diff} points above` : `${-diff} points short`}.</span> ${need}</p>
    </section>

    <h2>Blocks</h2>
    <section class="card">
      <div class="row block"><div class="line"><span>Block I · courses</span><span><b data-anim="b1" data-count="${calc.b1}">${calc.b1}</b><span class="muted"> / 600</span></span></div>
        <div class="bar"><i data-anim="bar1" data-bar="${(calc.b1 / 6).toFixed(1)}" style="width:${(calc.b1 / 6).toFixed(1)}%"></i></div>
        <div class="sub">8 LK ×2 + best 24 GK · ${calc.strikes.possible} strikes (${calc.strikes.manual} chosen by you)</div></div>
      <div class="row block"><div class="line"><span>Block II · exams</span><span><b data-anim="b2" data-count="${calc.b2}">${calc.b2}</b><span class="muted"> / 300</span></span></div>
        <div class="bar"><i data-anim="bar2" data-bar="${(calc.b2 / 3).toFixed(1)}" style="width:${(calc.b2 / 3).toFixed(1)}%"></i></div>
        <div class="sub">5 exam components ×4</div></div>
    </section>

    ${calc.problems.length ? `<h2 class="red">Needs attention</h2><section class="card">${calc.problems.map((p) => `<div class="row problem">${esc(p)}</div>`).join('')}</section>` : ''}

    <h2 class="split">Courses <span class="qhead" aria-hidden="true"><span>Q1</span><span>Q2</span><span>Q3</span><span>Q4</span></span></h2>
    <section class="card">${courseRows}</section>
    <p class="note">Grey = projected from the subject's average. Crossed out = struck (not counted).</p>

    <h2>Exams</h2>
    <section class="card">${examRows}</section>
  `;
}

/* ---------------- subject sheet ---------------- */

export function subjectSheet(state, calc, sid) {
  const s = state.subjects.find((x) => x.id === sid);
  if (!s) return '';
  const map = new Map(calc.courses.map((c) => [c.key, c]));
  const { manual, possible } = calc.strikes;
  const weights = s.type === 'LK' ? 'Klausuren count 1/2 in Q1–Q3, 1/3 in Q4' : 'Klausur counts 1/3, other 2/3';

  const cards = Q.filter((q) => isTaken(s, q)).map((q) => {
    const m = s.sem?.[q] || {};
    const c = map.get(`${s.id}:${q}`);
    const e = semesterEntered(s, q);
    const attrs = `data-sid="${s.id}" data-q="${q}"`;
    const input = (f, label, dec) => `<label class="field"><span>${label}</span>
      <input type="text" inputmode="${dec ? 'decimal' : 'numeric'}" autocomplete="off" maxlength="4" id="f-${s.id}-${q}-${f}" data-field="${f}" ${attrs} value="${isNum(m[f]) ? String(m[f]).replace('.', ',') : ''}" placeholder="–"></label>`;
    const kc = klausurCount(s, q);

    const status = c.source === 'final' ? 'Report grade' : c.source === 'marks' ? `From marks (${e.raw.toFixed(2)})` : 'Projected';

    let need = '';
    if (c.source === 'marks' && isNum(e.k) && c.points < 15) {
      const t = c.points + 1;
      const v = neededOther(s, q, t);
      need = v > 15 ? `${pp(t)} is out of reach through other marks.` : `For ${pp(t)} you need an other Ø of <b>${(Math.ceil(Math.max(0, v) * 10 - 1e-9) / 10).toFixed(1)}</b>.`;
    }
    need = `<div class="row need" data-live="need-${q}" ${need ? '' : 'hidden'}>${need}</div>`;

    let strike = '';
    if (s.type === 'GK') {
      const on = !!m.strike && !c.mandatory;
      const blocked = c.mandatory || (!on && manual >= possible);
      const hint = c.mandatory ? 'Must count (exam subject)' : on ? 'Struck by you' : !c.counted ? 'Not counted: struck automatically' : blocked ? `All ${possible} strikes are used` : 'Counts';
      strike = `<label class="row toggle" data-live="strike-${q}"><span>Strike<span class="sub">${hint}</span></span>
        <input type="checkbox" class="switch" data-act="toggle-strike" ${attrs} ${on ? 'checked' : ''} ${blocked ? 'disabled' : ''}></label>`;
    }

    return `<h2>${q}</h2><section class="card">
      <div class="row result" data-live="res-${q}"><span>${status}</span><span class="big ${c.counted ? '' : 'struck'} ${c.source === 'projected' ? 'proj' : ''}">${pp(c.points)}</span></div>
      <div class="row fields">${input('k1', kc === 2 ? 'Klausur 1' : 'Klausur')}${kc === 2 ? input('k2', 'Klausur 2') : ''}${input('o', 'Other Ø', true)}</div>
      ${need}
      <div class="row fields">${input('final', 'Report grade')}<span class="hint">Once graded, this replaces the marks.</span></div>
      ${strike}
    </section>`;
  }).join('');

  return `<h3 class="sheet-title" id="sheet-title" tabindex="-1">${esc(s.name)}${s.type === 'LK' ? ' <span class="badge">LK</span>' : ''}</h3>
    <p class="note top">${weights}. "Other Ø" is your oral and other marks as one average.</p>
    ${cards || '<p class="note">No semesters taken. Change this in Settings.</p>'}`;
}

/* ---------------- exams sheet ---------------- */

export function examsSheet(state, calc) {
  const rows = calc.exams.map((e) => {
    const s = examSubject(state, e.id);
    const x = state.exams[e.id] || {};
    return `<div class="row exam">
      <span>${EXAM_LABEL[e.id]}<span class="sub">${s ? esc(s.name) : 'Set the subject in Settings'}</span></span>
      <input type="text" inputmode="numeric" autocomplete="off" maxlength="2" id="ex-${e.id}" data-field="exam" data-id="${e.id}" value="${isNum(x.points) ? x.points : ''}" placeholder="${pp(state.settings.expect)}" aria-label="${EXAM_LABEL[e.id]} points">
      <label class="done-box" data-live="done-${e.id}"><input type="checkbox" data-act="toggle-exam-done" data-id="${e.id}" ${x.done ? 'checked' : ''} ${isNum(x.points) ? '' : 'disabled'}><span>Result</span></label>
    </div>`;
  }).join('');
  return `<h3 class="sheet-title" id="sheet-title" tabindex="-1">Exams</h3>
    <p class="note top">Points 0–15, each counted ×4. Enter what you expect. Tick "Result" once it is your real grade.</p>
    <section class="card">${rows}</section>
    <p class="note">To pass: Block II at least 100, and 2 of the 4 exam subjects at 05 or more, one of them an LK.</p>`;
}

/* ---------------- settings sheet ---------------- */

export function settingsSheet(state) {
  const subj = state.subjects.map((s) => `
    <section class="card subj">
      <div class="row"><input type="text" id="n-${s.id}" data-field="name" data-sid="${s.id}" value="${esc(s.name)}" aria-label="Subject name">
        ${seg(`type-${s.id}`, [['LK', 'LK'], ['GK', 'GK']], s.type, 'set-type', `data-sid="${s.id}"`)}</div>
      <div class="row selects">
        <label>Area<select id="a-${s.id}" data-field="area" data-sid="${s.id}">${Object.entries(AREAS).map(([k, v]) => `<option value="${k}" ${s.area === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label>Exam<select id="r-${s.id}" data-field="role" data-sid="${s.id}" ${s.type === 'LK' ? 'disabled' : ''}>
          ${[['', s.type === 'LK' ? '1st/2nd' : 'none'], ['PF3', '3rd'], ['PF4', '4th'], ['PK5', '5th']].map(([v, l]) => `<option value="${v}" ${(s.role || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>
      <div class="row taken"><span>Taken</span>
        <span class="chips">${Q.map((q) => `<button data-act="toggle-taken" data-sid="${s.id}" data-q="${q}" aria-pressed="${isTaken(s, q)}" ${s.type === 'LK' ? 'disabled' : ''}>${q}</button>`).join('')}</span></div>
      <button class="row link red" data-act="del-subject" data-sid="${s.id}">Remove ${esc(s.name)}</button>
    </section>`).join('');

  return `<h3 class="sheet-title" id="sheet-title" tabindex="-1">Settings</h3>
    <h2>Subjects</h2>
    ${subj}
    <section class="card"><button class="row link" data-act="add-subject">Add subject</button></section>
    <p class="note">Area: German, a foreign language, maths, a science and a social science each need 2 counted semesters. Exam 3rd/4th: all its semesters must count. Exam 5th: its last semester must count. Untick semesters you did not take.</p>

    <h2>Projection</h2>
    <section class="card">
      <div class="row"><span>Expected points<span class="sub">for exams and for subjects without grades yet</span></span>
        <span class="stepper"><button data-act="step-expect" data-d="-1" aria-label="Less">−</button><output>${pp(state.settings.expect)}</output><button data-act="step-expect" data-d="1" aria-label="More">+</button></span></div>
    </section>

    <h2>Backup</h2>
    <section class="card">
      <button class="row link" data-act="export">Export backup</button>
      <label class="row link">Import backup<input type="file" accept="application/json,.json" data-field="import" hidden></label>
      <button class="row link red" data-act="reset">Reset all data</button>
    </section>
    <p class="note">Your grades are stored only on this device.</p>

    <h2>Rules used</h2>
    <p class="note">Berlin, Abitur 2027. Block I: all 8 LK semesters ×2 plus exactly 24 GK semesters (max 600, at least 200, no 00, at most 2 LK and 4 GK under 05). Block II: 5 components ×4 (max 300, at least 100). Grade = 17/3 − points/180. One Klausur counts 1/3 of a semester grade, two count 1/2. Confirm details with your Oberstufenkoordination.</p>`;
}
