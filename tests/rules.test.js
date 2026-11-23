import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Q, totalToGrade, gradeToMinTotal, semesterEntered, klausurWeight, neededOther,
  selectCourses, computeAll, requiredAverage, mandatoryKeys,
} from '../js/rules.js';
import { migrate, defaultState } from '../js/state.js';

/** 2 LK + `gk` GK subjects (4 semesters each), all report grades fixed. */
function makeState({ lk = 13, gk = 12, nGk = 8, exam = 12 } = {}) {
  const areas = ['de', 'gw', 'nw', 'gw', 'nw', 'fs', 'other', 'other', 'other', 'other'];
  const subjects = [
    { id: 'en', name: 'English', type: 'LK', area: 'fs', taken: [...Q], sem: {} },
    { id: 'ma', name: 'Maths', type: 'LK', area: 'ma', taken: [...Q], sem: {} },
  ];
  for (let i = 0; i < nGk; i++) subjects.push({ id: 'g' + i, name: 'GK' + i, type: 'GK', area: areas[i], role: null, taken: [...Q], sem: {} });
  for (const s of subjects) for (const q of Q) s.sem[q] = { final: s.type === 'LK' ? lk : gk };
  const exams = Object.fromEntries(['PF1', 'PF2', 'PF3', 'PF4', 'PK5'].map((id) => [id, { points: exam, done: true }]));
  return { settings: { expect: 11, target: 769 }, subjects, exams };
}

test('grade conversion edges', () => {
  assert.equal(totalToGrade(823), 1.0);
  assert.equal(totalToGrade(787), 1.2);
  assert.equal(totalToGrade(786), 1.3);
  assert.equal(totalToGrade(769), 1.3);
  assert.equal(totalToGrade(768), 1.4);
  assert.equal(totalToGrade(300), 4.0);
  assert.equal(totalToGrade(299), null);
  assert.equal(gradeToMinTotal(1.2), 787);
});

test('Block I = 2 x 8 LK + best 24 GK, no scaling', () => {
  const st = makeState(); // 8 LK at 13, 32 GK at 12
  const all = computeAll(st);
  assert.equal(all.b1, 2 * 8 * 13 + 24 * 12); // 208 + 288 = 496
  assert.equal(all.b2, 5 * 12 * 4);           // 240
  assert.equal(all.total, 736);
  assert.equal(all.grade, 1.5);
  assert.equal(all.strikes.possible, 8);       // 32 GK taken - 24
  const max = computeAll(makeState({ lk: 15, gk: 15, exam: 15 }));
  assert.equal(max.b1, 600);
  assert.equal(max.total, 900);
});

test('Klausur weighting: GK 1/3, LK Q1-Q3 1/2, LK Q4 1/3', () => {
  const gk = { type: 'GK', sem: { Q1: { k1: 6, o: 13 } } };
  assert.equal(semesterEntered(gk, 'Q1').points, Math.round(6 / 3 + 13 * 2 / 3)); // 10.67 -> 11
  const lk = { type: 'LK', sem: { Q1: { k1: 10, k2: 12, o: 14 }, Q4: { k1: 10, k2: 15, o: 14 } } };
  assert.equal(semesterEntered(lk, 'Q1').points, Math.round(0.5 * 11 + 0.5 * 14)); // 12.5 -> 13
  assert.equal(klausurWeight(lk, 'Q4'), 1 / 3);
  // Q4 has only one Klausur: k2 is ignored
  assert.equal(semesterEntered(lk, 'Q4').raw, 10 / 3 + 14 * 2 / 3);
  // report grade wins
  assert.equal(semesterEntered({ type: 'GK', sem: { Q1: { final: 9, k1: 15 } } }, 'Q1').points, 9);
});

test('recovery: other average needed after a bad GK Klausur', () => {
  const s = { type: 'GK', sem: { Q3: { k1: 6 } } };
  // 1/3*6 + 2/3*x >= 11.5 -> x >= 14.25
  assert.ok(Math.abs(neededOther(s, 'Q3', 12) - 14.25) < 1e-9);
});

test('worst GK semesters are struck automatically', () => {
  const st = makeState();
  st.subjects[5].sem.Q1 = { final: 3 };
  const c = selectCourses(st).find((x) => x.key === 'g3:Q1');
  assert.equal(c.counted, false);
});

test('mandatory: exam subjects 3/4 all semesters, 5th component last semester', () => {
  const st = makeState();
  st.subjects[2].role = 'PF3'; // g0
  st.subjects[9].role = 'PK5'; // g7
  for (const q of Q) st.subjects[2].sem[q] = { final: 4 };
  st.subjects[9].sem.Q4 = { final: 3 }; // 5th GK under 05 -> over the limit of 4
  const keys = mandatoryKeys(st);
  assert.equal(keys.has('g0:Q1') && keys.has('g0:Q4'), true);
  assert.equal(keys.has('g7:Q4') && !keys.has('g7:Q3'), true);
  const all = computeAll(st);
  assert.equal(all.courses.filter((c) => c.sid === 'g0' && c.counted).length, 4); // counted despite 04
  assert.match(all.problems.join(' '), /5 GK semesters under 05/);
});

test('manual strike: excluded unless mandatory', () => {
  const st = makeState();
  st.subjects[3].sem.Q2.strike = true; // g1
  assert.equal(computeAll(st).courses.find((c) => c.key === 'g1:Q2').counted, false);
  assert.equal(computeAll(st).strikes.manual, 1);
  st.subjects[3].role = 'PF4';
  assert.equal(computeAll(st).courses.find((c) => c.key === 'g1:Q2').counted, true);
});

test('area coverage forces 2 social-science semesters', () => {
  const st = makeState();
  // make all gw subjects weak so the best-24 fill would skip them
  for (const s of st.subjects.filter((x) => x.area === 'gw')) for (const q of Q) s.sem[q] = { final: 5 };
  const n = computeAll(st).courses.filter((c) => c.counted && c.area === 'gw').length;
  assert.equal(n, 2);
});

test('not taken semesters reduce strikes; under 24 GK is a problem', () => {
  const st = makeState({ nGk: 6 }); // 24 GK taken -> 0 strikes
  assert.equal(computeAll(st).strikes.possible, 0);
  st.subjects[7].taken = ['Q1', 'Q2'];
  assert.match(computeAll(st).problems.join(' '), /Only 22 GK/);
});

test('Block II conditions', () => {
  const st = makeState();
  st.exams.PF1.points = 3; st.exams.PF2.points = 4; // no LK exam at 05+
  assert.match(computeAll(st).problems.join(' '), /one of them an LK/);
});

test('required average for open items', () => {
  const st = makeState();
  for (const s of st.subjects) s.sem.Q4 = {};
  for (const id of Object.keys(st.exams)) st.exams[id] = { points: null, done: false };
  const r = requiredAverage(st, 769);
  assert.equal(r.open, 10 + 5); // 10 open Q4 semesters + 5 exams
  assert.ok(r.reachable && r.level > 12 && r.level < 15, String(r.level));
  assert.equal(requiredAverage(makeState({ lk: 1, gk: 1, exam: 1 }), 769).reachable, false);
});

test('default state: 8 LK semesters, problems only about the expected areas', () => {
  const all = computeAll(defaultState());
  assert.equal(all.courses.filter((c) => c.lk).length, 8);
  assert.equal(all.problems.length, 0, all.problems.join(' | '));
});

test('migration from v1 data', () => {
  const v1 = {
    schema: 1, settings: { assume: 12, target: 787 },
    subjects: [
      { id: 'a', name: 'English', type: 'LK', semesters: { Q1: { final: 13 } } },
      { id: 'b', name: 'History', type: 'GK', droppedAfter: 'Q3', semesters: {
        Q3: { items: [{ kind: 'K', points: 6 }, { kind: 'O', points: 12, weight: 1 }, { kind: 'O', points: 14, weight: 2 }], strike: 'strike' } } },
    ],
    exams: [{ points: 12, planned: false }, { points: null }, { points: null }, { subjectId: 'b', points: 10 }, {}],
  };
  const s = migrate(v1);
  assert.equal(s.schema, 2);
  assert.equal(s.settings.expect, 12);
  assert.equal(s.subjects[0].sem.Q1.final, 13);
  const h = s.subjects[1];
  assert.deepEqual(h.taken, ['Q1', 'Q2', 'Q3']);
  assert.equal(h.area, 'gw');
  assert.equal(h.role, 'PF4');
  assert.equal(h.sem.Q3.k1, 6);
  assert.ok(Math.abs(h.sem.Q3.o - 13.3) < 1e-9);
  assert.equal(h.sem.Q3.strike, true);
  assert.deepEqual(s.exams.PF1, { points: 12, done: true });
  assert.deepEqual(s.exams.PF4, { points: 10, done: false });
});
