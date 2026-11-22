// Rendering: each view is a function returning an HTML string.
import {
  RULES, TARGETS, totalToGrade, componentAverages, rawFromComponents,
  neededComponent, neededNextMark, requiredUniformLevel, computeAll, semesterExists,
} from './rules.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const f1 = (n) => (n === null || n === undefined ? '–' : n.toFixed(1));
const g1 = (g) => (g === null ? '–' : g.toFixed(1));
const pp = (n) => String(n).padStart(2, '0');
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const wKof = (s) => s.wK ?? (s.type === 'LK' ? 0.5 : 1 / 3);
const pct = (w) => `${Math.round(w * 100)}%`;
const STATUS_LABEL = { final: 'final', live: 'live', planned: 'planned', assumed: 'assumed' };

function targetLabel(total) {
  const e = Object.entries(TARGETS).find(([, t]) => t === total);
  return e ? e[0] : `${total} P`;
}

function picker(selected, act, extra = '') {
  let h = '<div class="picker">';
  for (let p = 15; p >= 0; p--) {
    h += `<button data-act="${act}" data-v="${p}" ${extra} aria-pressed="${selected === p}">${pp(p)}</button>`;
  }
  return h + '</div>';
}

function stepper(value, act, attrs) {
  const key = `step:${act}:${attrs.replace(/\W+/g, '')}`;
  return `<span class="stepper">
    <button data-act="${act}" data-d="-1" ${attrs} aria-label="minus">−</button>
    <output data-anim="${key}" data-tick="${isNum(value) ? value : ''}">${isNum(value) ? pp(value) : '–'}</output>
    <button data-act="${act}" data-d="1" ${attrs} aria-label="plus">+</button></span>`;
}

/** Segmented control with a sliding thumb. options: [[value, label, disabled?]] */
function seg(key, options, current, act, dataKey, attrs = '', style = '') {
  const i = options.findIndex(([v]) => v === current);
  return `<div class="seg" role="group" data-anim="seg:${key}" style="--n:${options.length};--i:${Math.max(0, i)};${style}" ${i < 0 ? 'data-none' : ''}>
    ${options.map(([v, label, dis]) => `<button data-act="${act}" data-${dataKey}="${v}" ${attrs} aria-pressed="${v === current}" ${dis ? 'disabled' : ''}>${label}</button>`).join('')}
  </div>`;
}

/* ---------------- Overview ---------------- */

export function overview(state, calc) {
  const { total, grade, b1, b2, statusCount, warnings, strikes } = calc;
  const targets = [['1.3', 769], ['1.2', 787]];
  const tRows = targets.map(([g, t]) => {
    const d = total - t;
    return `<div class="row"><span>${g} <span class="muted small">≥ ${t}</span></span>
      <span class="${d >= 0 ? 'good' : 'bad'}">${d >= 0 ? `+${d} above` : `${-d} short`}</span></div>`;
  }).join('');

  const target = state.settings.target ?? 769;
  const req = requiredUniformLevel(state, target);
  const reqText = !req.reachable
    ? `<span class="bad">out of reach</span>`
    : req.level === null || req.open === 0 ? 'nothing open' : `Ø ${f1(req.level)}`;

  // levers: live semesters closest to the next rounding step
  const levers = [];
  for (const s of state.subjects) {
    for (const q of RULES.semesters) {
      const sem = s.semesters?.[q];
      if (!sem || isNum(sem.final) || !semesterExists(s, q)) continue;
      const raw = rawFromComponents(sem, wKof(s));
      if (raw === null || raw >= 14.5) continue;
      const next = Math.round(raw) + 0.5;
      const { k, o } = componentAverages(sem);
      const wO = k === null || o === null ? 1 : 1 - wKof(s);
      levers.push({ s, q, raw, up: Math.round(raw) + 1, needO: (next - raw) / wO });
    }
  }
  levers.sort((a, b) => a.needO - b.needO);
  const leverRows = levers.slice(0, 4).map((l) => `
    <button class="row" data-act="open-sem" data-sid="${l.s.id}" data-q="${l.q}">
      <span>${esc(l.s.name)} <span class="muted">${l.q}</span><span class="row-sub">now ${l.raw.toFixed(2)} → ${pp(Math.round(l.raw))}</span></span>
      <span>+${l.needO.toFixed(2)} other Ø<span class="row-sub">lifts to ${pp(l.up)}</span></span>
    </button>`).join('');

  return `
    <div class="hero">
      <div><div class="hero-label">Projected Abitur</div>
        <div class="hero-grade" data-anim="grade" data-count="${grade ?? ''}" data-dec="1">${g1(grade)}</div></div>
      <div class="hero-side"><div class="hero-total"><span data-anim="total" data-count="${total}">${total}</span><span class="muted"> / 900</span></div>
        <div class="muted small">points</div></div>
    </div>
    <div class="rows">${tRows}
      <button class="row" data-act="tab" data-tab="plan"><span>Open items need for ${targetLabel(target)}</span><span class="chev">${reqText}</span></button>
    </div>

    <h2>Blocks</h2>
    <div class="rows">
      <div class="row" style="display:block">
        <div style="display:flex;justify-content:space-between"><span>Block I · courses</span><span><strong data-anim="b1" data-count="${b1.points}">${b1.points}</strong><span class="muted"> / 600</span></span></div>
        <div class="bar"><i data-anim="bar1" data-bar="${(b1.points / 6).toFixed(1)}" style="width:${(b1.points / 6).toFixed(1)}%"></i></div>
        <div class="row-sub" style="margin-top:6px">${b1.count} courses · Ø ${(b1.P / Math.max(1, b1.S)).toFixed(2)} weighted · ${b1.under5} under 05</div>
      </div>
      <div class="row" style="display:block">
        <div style="display:flex;justify-content:space-between"><span>Block II · exams</span><span><strong data-anim="b2" data-count="${b2.points}">${b2.points}</strong><span class="muted"> / 300</span></span></div>
        <div class="bar"><i data-anim="bar2" data-bar="${(b2.points / 3).toFixed(1)}" style="width:${(b2.points / 3).toFixed(1)}%"></i></div>
        <div class="row-sub" style="margin-top:6px">${b2.list.map((e) => pp(e.value)).join(' · ')} × ${RULES.blockII.multiplier}</div>
      </div>
      <button class="row" data-act="tab" data-tab="courses"><span>Strikes<span class="row-sub">semesters not counted in Block I</span></span>
        <span>${strikes.possible} possible<span class="row-sub">${strikes.manual} manual · ${strikes.auto} auto</span></span></button>
    </div>

    <h2>Basis of projection</h2>
    <div class="basis">
      <div><strong>${statusCount.final}</strong><span class="muted small">final</span></div>
      <div><strong class="${statusCount.live ? '' : 'muted'}">${statusCount.live}</strong><span class="muted small">live</span></div>
      <div><strong>${statusCount.planned}</strong><span class="muted small">planned</span></div>
      <div><strong class="${statusCount.assumed ? 'bad' : ''}">${statusCount.assumed}</strong><span class="muted small">assumed</span></div>
    </div>
    <p class="muted small">Assumed = nothing entered yet, counted as ${pp(state.settings.assume)} points (change in Settings). Live values are estimates: the teacher sets the final grade.</p>

    ${leverRows ? `<h2>Cheapest next points</h2><div class="rows">${leverRows}</div>
      <p class="muted small">How much the other-performance average must rise to round up one point.</p>` : ''}

    ${warnings.length ? `<h2>Admission checks</h2>${warnings.map((w) => `<div class="callout warn small">${esc(w)}</div>`).join('')}` : ''}
  `;
}

/* ---------------- Courses ---------------- */

export function courses(state, calc) {
  const map = new Map(calc.courses.map((c) => [c.key, c]));
  const rows = state.subjects.map((s) => {
    const cells = RULES.semesters.map((q) => {
      if (!semesterExists(s, q)) return `<td><button class="cell" disabled aria-label="${esc(s.name)} ${q}: dropped">—</button></td>`;
      const c = map.get(`${s.id}:${q}`);
      const v = c ? pp(c.points) : '·';
      const m = c?.mode && c.mode !== 'auto' ? c.mode : '';
      return `<td><button class="cell" data-act="open-sem" data-sid="${s.id}" data-q="${q}"
        data-s="${c?.status ?? 'assumed'}" data-c="${c?.counted ? 1 : 0}" ${m ? `data-m="${m}"` : ''}
        aria-label="${esc(s.name)} ${q}: ${v}, ${c?.status ?? ''}${c && !c.counted ? ', not counted' : ''}${m ? `, ${m} set manually` : ''}">${v}</button></td>`;
    }).join('');
    return `<tr><td class="name">${esc(s.name)}${s.type === 'LK' ? '<small>LK</small>' : ''}${s.droppedAfter ? `<em>dropped after ${s.droppedAfter}</em>` : ''}</td>${cells}</tr>`;
  }).join('');
  return `
    <h1>Courses</h1>
    <table class="grid">
      <tr><th>Subject</th>${RULES.semesters.map((q) => `<th>${q}</th>`).join('')}</tr>
      ${rows}
    </table>
    <div class="legend">
      <span style="font-weight:600;color:var(--text)">12 final</span>
      <span style="color:var(--accent)">12 live</span>
      <span style="font-style:italic">12 planned</span>
      <span style="color:var(--muted);font-size:11px">11 assumed</span>
      <span style="text-decoration:line-through">struck</span>
      <span><b style="color:var(--bad);font-size:10px">S</b> struck by you</span>
      <span><b style="color:var(--accent);font-size:8px">●</b> forced to count</span>
    </div>
    <p class="muted small">Tap a cell to enter grades or to strike / force a semester. ${calc.strikes.possible} strikes possible: the best ${RULES.blockI.courses} semesters count (LK semesters double).</p>
  `;
}

/* ---------------- Semester sheet ---------------- */

export function semesterSheet(state, calc, ui) {
  const s = state.subjects.find((x) => x.id === ui.sid);
  if (!s) return '';
  const q = ui.q;
  const sem = s.semesters?.[q] || {};
  const wK = wKof(s);
  const c = calc.courses.find((x) => x.key === `${s.id}:${q}`);
  const mode = ui.mode;
  const attrs = `data-sid="${s.id}" data-q="${q}"`;

  const head = `
    <h3 class="sheet-title" id="sheet-title" tabindex="-1">${esc(s.name)} · ${q}</h3>
    <p class="muted small" style="margin:4px 0 14px">${s.type} · Klausur ${pct(wK)} / other ${pct(1 - wK)} ·
      counts now: <strong style="color:var(--text)">${c ? pp(c.points) : '–'}</strong> (${c ? STATUS_LABEL[c.status] : '–'}${c && !c.counted ? ', not counted' : ''})</p>
    ${seg('sem-mode', [['final', 'Final grade'], ['marks', 'Marks'], ['estimate', 'Estimate']], mode, 'sem-mode', 'm')}`;

  let body = '';
  if (mode === 'final') {
    body = `<h2>Report grade</h2>${picker(sem.final ?? null, 'set-final', attrs)}
      <div class="actions">${isNum(sem.final) ? `<button class="btn" data-act="clear-final" ${attrs}>Clear final grade</button>` : ''}</div>
      <p class="muted small">A final grade overrides marks and estimates.</p>`;
  } else if (mode === 'estimate') {
    body = `<h2>Expected points</h2>${picker(sem.plan ?? null, 'set-plan', attrs)}
      <div class="actions">${isNum(sem.plan) ? `<button class="btn" data-act="clear-plan" ${attrs}>Clear estimate</button>` : ''}</div>
      <p class="muted small">Used until marks or a final grade exist.</p>`;
  } else {
    body = marksBody(s, sem, wK, ui, attrs);
  }
  const overridden = mode !== 'final' && isNum(sem.final)
    ? `<div class="callout small">Final grade ${pp(sem.final)} is set and overrides this. Clear it under Final grade.</div>` : '';
  return head + overridden + body + strikeSection(state, s, q, attrs);
}

function strikeSection(state, s, q, attrs) {
  const sem = s.semesters?.[q] || {};
  const lk = s.type === 'LK';
  const cur = lk ? 'auto' : (sem.strike || 'auto');
  // live effect of each option on Block I
  const effect = ['auto', 'count', 'strike'].map((m) => {
    if (lk && m === 'strike') return '<span>–</span>';
    const st = structuredClone(state);
    const t = st.subjects.find((x) => x.id === s.id);
    t.semesters ||= {}; t.semesters[q] = { ...(t.semesters[q] || {}), strike: m };
    const r = computeAll(st).b1;
    return `<span>Block I <b>${r.points}</b>${r.count < RULES.blockI.courses ? `<br><span class="bad">only ${r.count} courses</span>` : ''}</span>`;
  }).join('');
  return `<h2>Counts in Block I</h2>
    ${seg('strike', [['auto', 'Auto'], ['count', 'Count'], ['strike', 'Strike', lk]], cur, 'set-strike', 'v', attrs)}
    <div class="effect">${effect}</div>
    <p class="muted small">${lk ? 'LK semesters always count (double).' : 'Auto = counted only if it is among your best semesters. Strike = never counts. Count = always counts.'}</p>`;
}

function markList(sem, kind, attrs) {
  const items = (sem.items || []).filter((i) => i.kind === kind);
  if (!items.length) return '<div class="row muted small">None yet</div>';
  return items.map((i) => `
    <div class="row mark">
      <span>${esc(i.label || (kind === 'K' ? 'Klausur' : 'Mark'))}
        ${kind === 'O' && i.weight && i.weight !== 1 ? `<span class="muted small"> ×${i.weight}</span>` : ''}
        ${i.planned ? ' <span class="tag">plan</span>' : ''}</span>
      <span class="pts">${pp(i.points)}</span>
      <button class="x" data-act="del-mark" data-id="${i.id}" ${attrs} aria-label="Delete">×</button>
    </div>`).join('');
}

function marksBody(s, sem, wK, ui, attrs) {
  const { k, o } = componentAverages(sem);
  const raw = rawFromComponents(sem, wK);
  const add = ui.adding;

  const adder = (kind) => {
    if (!add || add.kind !== kind) {
      return `<button class="btn link" data-act="start-add" data-kind="${kind}">+ ${kind === 'K' ? 'Klausur' : 'Other mark'}</button>`;
    }
    return `<div style="padding:12px 0">
      <div class="line" style="display:flex;gap:8px;align-items:center;margin-bottom:10px">
        <input type="text" id="add-label" placeholder="${kind === 'K' ? 'Klausur' : 'Oral, Referat, Test …'}" value="${esc(add.label || '')}" autocomplete="off">
      </div>
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
        ${kind === 'O' ? `<div class="chips">${[0.5, 1, 2].map((w) => `<button data-act="add-weight" data-w="${w}" aria-pressed="${(add.weight ?? 1) === w}">×${w}</button>`).join('')}</div>` : ''}
        <label class="check"><input type="checkbox" data-act="add-planned" ${add.planned ? 'checked' : ''}> planned (what-if)</label>
        <button class="btn link" data-act="cancel-add">Cancel</button>
      </div>
      ${picker(null, 'commit-mark', attrs)}
    </div>`;
  };

  let result = '<p class="muted small">Add marks to compute the semester grade.</p>';
  if (raw !== null) {
    result = `<div class="rows">
      <div class="row"><span>Klausur Ø <span class="muted small">${pct(wK)}</span></span><span>${f1(k)}</span></div>
      <div class="row"><span>Other Ø <span class="muted small">${pct(1 - wK)}</span></span><span>${f1(o)}</span></div>
      <div class="row"><span>Semester</span><span><span class="muted">${raw.toFixed(2)} →</span> <strong>${pp(Math.round(raw))}</strong></span></div>
    </div>`;
  }

  // recovery solver
  const target = ui.target ?? Math.min(15, raw !== null ? Math.round(raw) + 1 : 12);
  const line = (label, r) => {
    if (r.value <= 0) return `<div class="row"><span>${label}</span><span class="good">reached</span></div>`;
    if (!r.feasible) return `<div class="row"><span>${label}</span><span class="bad">not reachable <span class="small">(${r.value.toFixed(1)})</span></span></div>`;
    return `<div class="row"><span>${label}</span><span><strong>${r.value.toFixed(1)}</strong></span></div>`;
  };
  let solver = '';
  if (k !== null || o !== null) {
    const nO = neededComponent(sem, wK, target, 'O');
    const nK = neededComponent(sem, wK, target, 'K');
    solver = `<h2>What do I need?</h2>
      <div class="rows">
        <div class="row"><span>Target semester points</span>${stepper(target, 'sem-target', '')}</div>
        ${k !== null ? line(`Other Ø needed<span class="row-sub">now ${f1(o)}</span>`, nO) : ''}
        ${k !== null && o !== null ? line('Next other mark (×1)', neededNextMark(sem, wK, target, 'O', 1)) : ''}
        ${o !== null ? line(`Klausur Ø needed<span class="row-sub">now ${f1(k)}</span>`, nK) : ''}
        ${k !== null ? line('Next Klausur', neededNextMark(sem, wK, target, 'K', 1)) : ''}
      </div>
      <p class="muted small">Assumes the teacher weights exactly ${pct(wK)} / ${pct(1 - wK)} and rounds x.5 up.</p>`;
  }

  return `
    <h2>Klausuren</h2><div class="rows">${markList(sem, 'K', attrs)}</div>${adder('K')}
    <h2>Other performance</h2><div class="rows">${markList(sem, 'O', attrs)}</div>${adder('O')}
    <h2>Result</h2>${result}
    ${solver}`;
}

/* ---------------- Plan ---------------- */

export function plan(state, calc, openGroups = new Set()) {
  const target = state.settings.target ?? 769;
  const req = requiredUniformLevel(state, target);
  const map = new Map(calc.courses.map((c) => [c.key, c]));

  let headline;
  if (!req.reachable) {
    headline = `<div class="big bad">Out of reach</div><p class="muted small">Even 15 points in every open item does not reach ${target}.</p>`;
  } else if (req.open === 0 || req.level === null) {
    headline = `<div class="big">Nothing open</div>`;
  } else if (req.level === 0) {
    headline = `<div class="big good">Secured</div><p class="muted small">Reached even with 00 in every open item (admission rules aside).</p>`;
  } else {
    headline = `<div class="big">Ø <span data-anim="req" data-count="${req.level}" data-dec="1">${f1(req.level)}</span> <span class="muted" style="font-size:18px;font-weight:500">points</span></div>
      <p class="muted small">needed on average across ${req.open} open items (open semesters + exams) to reach ${target}.</p>`;
  }

  const diff = calc.total - target;
  const groups = {};
  for (const q of RULES.semesters) {
    const openRows = (groups[q] = []);
    for (const s of state.subjects) {
      const sem = s.semesters?.[q] || {};
      if (isNum(sem.final) || !semesterExists(s, q)) continue;
      const c = map.get(`${s.id}:${q}`);
      const hasItems = (sem.items || []).length > 0;
      const right = hasItems
        ? `<button class="btn link" data-act="open-sem" data-sid="${s.id}" data-q="${q}">${pp(c.points)} · marks</button>`
        : stepper(c?.points, 'step-plan', `data-sid="${s.id}" data-q="${q}"`);
      openRows.push(`<div class="row"><span>${esc(s.name)} <span class="muted">${q}</span>
        <span class="row-sub">${c ? STATUS_LABEL[c.status] : ''}${c && !c.counted ? ' · not counted' : ''}</span></span>${right}</div>`);
    }
  }

  const examRows = state.exams.map((e, i) => {
    const subj = state.subjects.find((s) => s.id === e.subjectId);
    const v = calc.b2.list[i];
    return `<div class="row"><span>${esc(e.label)}<span class="row-sub">${subj ? esc(subj.name) : 'subject not set'} · ${STATUS_LABEL[v.status]}</span></span>
      <span style="display:flex;gap:10px;align-items:center">
        ${stepper(v.value, 'step-exam', `data-id="${e.id}"`)}
      </span></div>`;
  }).join('');

  return `
    <h1>Plan</h1>
    <div class="chips" role="group" aria-label="Target">
      ${Object.entries(TARGETS).map(([g, t]) => `<button data-act="set-target" data-v="${t}" aria-pressed="${t === target}">${g}</button>`).join('')}
    </div>
    <div style="margin:22px 0 8px">${headline}</div>
    <div class="rows">
      <div class="row"><span>Current projection</span><span><strong>${calc.total}</strong> <span class="muted">→ ${g1(calc.grade)}</span></span></div>
      <div class="row"><span>vs. target ${target}</span><span class="${diff >= 0 ? 'good' : 'bad'}">${diff >= 0 ? '+' : ''}${diff}</span></div>
    </div>
    ${req.reachable && req.level > 0 ? `<div class="actions"><button class="btn" data-act="fill-open" data-v="${Math.ceil(req.level)}">Set unplanned items to ${pp(Math.ceil(req.level))}</button></div>` : ''}

    ${Object.entries(groups).filter(([, r]) => r.length).map(([q, r], i) => {
      const open = i === 0 || openGroups.has(q);
      return `<button class="group-toggle" data-act="toggle-group" data-q="${q}" aria-expanded="${open}">
          <h2>${q} · ${r.length} open</h2><span class="muted small">${open ? 'Hide' : 'Show'}</span></button>
        ${open ? `<div class="rows">${r.join('')}</div>` : ''}`;
    }).join('') || '<h2>Open semesters</h2><div class="rows"><div class="row muted">All semesters final</div></div>'}

    <h2>Exams · Block II</h2>
    <div class="rows">${examRows}</div>
    <p class="muted small">Exam values are plans until you mark one as a real result in Settings.</p>
  `;
}

/* ---------------- Settings ---------------- */

export function settings(state, theme, haptics) {
  const subj = state.subjects.map((s) => `
    <div class="subject-edit ${s.droppedAfter ? 'dropped' : ''}">
      <div class="line">
        <input type="text" value="${esc(s.name)}" data-field="name" data-sid="${s.id}" aria-label="Subject name" style="flex:1;min-width:140px">
        ${seg(`type-${s.id}`, [['LK', 'LK'], ['GK', 'GK']], s.type, 'set-type', 't', `data-sid="${s.id}"`, 'width:110px')}
      </div>
      <div class="meta">
        <label>Klausur
          <select data-field="wK" data-sid="${s.id}">
            ${[0.25, 1 / 3, 0.4, 0.5, 0.6].map((w) => `<option value="${w}" ${Math.abs(wKof(s) - w) < 1e-6 ? 'selected' : ''}>${pct(w)}</option>`).join('')}
          </select></label>
        <label>Must count
          <select data-field="minCount" data-sid="${s.id}" ${s.type === 'LK' ? 'disabled' : ''}>
            ${[0, 1, 2, 3, 4].map((n) => `<option value="${n}" ${(s.type === 'LK' ? 4 : s.minCount ?? 0) === n ? 'selected' : ''}>${n}</option>`).join('')}
          </select></label>
        <label>Dropped after
          <select data-field="droppedAfter" data-sid="${s.id}" ${s.type === 'LK' ? 'disabled' : ''}>
            ${['', 'Q1', 'Q2', 'Q3'].map((q) => `<option value="${q}" ${(s.droppedAfter || '') === q ? 'selected' : ''}>${q || '–'}</option>`).join('')}
          </select></label>
        <button class="x" data-act="del-subject" data-sid="${s.id}" aria-label="Remove ${esc(s.name)}">×</button>
      </div>
    </div>`).join('');

  const subjOptions = (sel) => `<option value="">–</option>` + state.subjects.map((s) => `<option value="${s.id}" ${s.id === sel ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
  const exams = state.exams.map((e) => `
    <div class="subject-edit">
      <div class="line">
        <input type="text" value="${esc(e.label)}" data-field="exam-label" data-id="${e.id}" style="flex:1;min-width:140px" aria-label="Exam name">
        <select data-field="exam-subject" data-id="${e.id}" style="width:auto">${subjOptions(e.subjectId)}</select>
      </div>
      <div class="line"><label class="check small"><input type="checkbox" data-field="exam-final" data-id="${e.id}" ${e.planned === false && isNum(e.points) ? 'checked' : ''} ${isNum(e.points) ? '' : 'disabled'}> real result (not a plan)</label></div>
    </div>`).join('');

  return `
    <h1>Settings</h1>
    <h2>Subjects</h2>
    <div class="rows">${subj}</div>
    <div class="actions"><button class="btn" data-act="add-subject">Add subject</button></div>
    <p class="muted small">"Must count" = semesters of this subject that have to be brought into Block I (e.g. exam subjects: 4). The rest is filled with your best semesters. "Dropped after" (Abwahl) removes the later semesters; earlier grades stay.</p>

    <h2>Exams</h2>
    <div class="rows">${exams}</div>

    <h2>Projection</h2>
    <div class="rows">
      <div class="row"><span>Assume for empty semesters / exams</span>${stepper(state.settings.assume, 'step-assume', '')}</div>
      <div class="row"><span>Theme</span>${seg('theme', [['auto', 'auto'], ['light', 'light'], ['dark', 'dark']], theme, 'set-theme', 't', '', 'width:180px')}</div>
      <div class="row"><span>Haptics<span class="row-sub">vibration tick on taps (iPhone: iOS 18+)</span></span>${seg('haptics', [['on', 'on'], ['off', 'off']], haptics ? 'on' : 'off', 'set-haptics', 'v', '', 'width:120px')}</div>
    </div>

    <h2>Backup</h2>
    <p class="muted small" style="margin-top:0">Your data is stored only in this browser on this device. Export a backup after entering grades.</p>
    <div class="actions">
      <button class="btn primary" data-act="export">Export backup</button>
      <label class="btn" style="display:inline-flex;align-items:center">Import<input type="file" accept="application/json,.json" data-field="import" hidden></label>
      <button class="btn danger" data-act="reset">Reset all</button>
    </div>
    <p class="muted small">Last saved ${new Date(state.updated).toLocaleString('de-DE')}</p>

    <h2>Rules used</h2>
    <p class="muted small">Berlin VO-GO. Block I: best ${RULES.blockI.courses} semester courses, LK semesters ×${RULES.blockI.lkMultiplier}, E = P / S × ${RULES.blockI.scale} (max 600, min ${RULES.blockI.min}, max ${RULES.blockI.maxUnder5} under 05).
    Block II: ${RULES.blockII.exams} components ×${RULES.blockII.multiplier} (max 300, min ${RULES.blockII.min}, ≥${RULES.blockII.minExamsAt5} at 05+ incl. one LK).
    Grade = 17/3 − E/180, truncated. Check subject-specific obligations (German, maths, languages, sciences) against your school's handout.</p>
  `;
}
