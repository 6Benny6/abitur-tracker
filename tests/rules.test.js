import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  totalToGrade, gradeToMinTotal, resolveSemester, neededComponent, neededNextMark,
  selectBlockI, blockI, computeAll, requiredUniformLevel,
} from '../js/rules.js';

test('conversion table edges', () => {
  assert.equal(totalToGrade(900), 1.0);
  assert.equal(totalToGrade(823), 1.0);
  assert.equal(totalToGrade(822), 1.1);
  assert.equal(totalToGrade(805), 1.1);
  assert.equal(totalToGrade(804), 1.2);
  assert.equal(totalToGrade(787), 1.2);
  assert.equal(totalToGrade(786), 1.3);
  assert.equal(totalToGrade(769), 1.3);
  assert.equal(totalToGrade(768), 1.4);
  assert.equal(totalToGrade(300), 4.0);
  assert.equal(totalToGrade(299), null);
  assert.equal(gradeToMinTotal(1.3), 769);
  assert.equal(gradeToMinTotal(1.2), 787);
});

test('GK semester: 33% Klausur, 67% other', () => {
  const sem = { items: [{ kind: 'K', points: 7 }, { kind: 'O', points: 13 }, { kind: 'O', points: 14 }] };
  // 1/3*7 + 2/3*13.5 = 11.33 -> 11
  const r = resolveSemester(sem, 1 / 3, 10);
  assert.equal(r.points, 11);
  assert.equal(r.status, 'live');
});

test('final overrides components; empty uses assumption', () => {
  assert.deepEqual(resolveSemester({ final: 12, items: [{ kind: 'K', points: 3 }] }, 0.5, 10), { points: 12, status: 'final' });
  assert.deepEqual(resolveSemester({}, 0.5, 11), { points: 11, status: 'assumed' });
  assert.equal(resolveSemester({ plan: 13 }, 0.5, 11).status, 'planned');
});

test('recovery solver: bad Klausur in GK', () => {
  const sem = { items: [{ kind: 'K', points: 6 }] };
  // target 12: need 1/3*6 + 2/3*x >= 11.5 -> x >= 14.25
  const n = neededComponent(sem, 1 / 3, 12, 'O');
  assert.ok(Math.abs(n.value - 14.25) < 1e-9);
  assert.equal(n.feasible, true);
  // target 13 impossible: x >= 15.75
  assert.equal(neededComponent(sem, 1 / 3, 13, 'O').feasible, false);
});

test('next mark solver', () => {
  // LK 50/50, Klausur 10, one oral 12; target 12 -> need O avg >= 13; next oral (w1): (13*2-12) = 14
  const sem = { items: [{ kind: 'K', points: 10 }, { kind: 'O', points: 12 }] };
  const n = neededNextMark(sem, 0.5, 12, 'O', 1);
  assert.ok(Math.abs(n.value - 14) < 1e-9);
});

function makeState(gkPoints, lkPoints, examPoints) {
  const subjects = [
    { id: 'en', name: 'English', type: 'LK', semesters: {} },
    { id: 'ma', name: 'Maths', type: 'LK', semesters: {} },
  ];
  for (let i = 0; i < 10; i++) subjects.push({ id: 'g' + i, name: 'GK' + i, type: 'GK', minCount: 0, semesters: {} });
  for (const s of subjects) for (const q of ['Q1', 'Q2', 'Q3', 'Q4']) s.semesters[q] = { final: s.type === 'LK' ? lkPoints : gkPoints };
  const exams = [1, 2, 3, 4, 5].map((i) => ({ id: 'e' + i, subjectId: i === 1 ? 'en' : i === 2 ? 'ma' : null, points: examPoints }));
  return { settings: { assume: 10 }, subjects, exams };
}

test('Block I: LK double, 40 courses chosen, max 600', () => {
  const st = makeState(15, 15, 15);
  const courses = selectBlockI(st);
  assert.equal(courses.filter((c) => c.counted).length, 40);
  const b = blockI(courses);
  assert.equal(b.S, 48); // 8 LK doubled + 32 GK
  assert.equal(b.points, 600);
  assert.equal(computeAll(st).total, 900);
});

test('Block I hand calculation', () => {
  // LK all 13, GK all 12: P = 8*13*2 + 32*12 = 208 + 384 = 592, S = 48 -> 592/48*40 = 493.33 -> 493
  const st = makeState(12, 13, 12);
  const b = blockI(selectBlockI(st));
  assert.equal(b.P, 592);
  assert.equal(b.points, 493);
  // Block II: 5*12*4 = 240 -> total 733 -> 1.5
  const all = computeAll(st);
  assert.equal(all.b2.points, 240);
  assert.equal(all.total, 733);
  assert.equal(all.grade, 1.5);
});

test('best courses are chosen over weak ones', () => {
  const st = makeState(12, 13, 12);
  st.subjects[2].semesters.Q1 = { final: 3 }; // weak GK semester, 48 available, 40 chosen
  const courses = selectBlockI(st);
  assert.equal(courses.find((c) => c.key === 'g0:Q1').counted, false);
});

test('admission warnings', () => {
  const st = makeState(4, 4, 4);
  const w = computeAll(st).warnings.join(' ');
  assert.match(w, /under 05/);
  assert.match(w, /Fewer than 3 exams/);
});

test('required uniform level', () => {
  const st = makeState(12, 13, 12);
  // make Q4 + exams open
  for (const s of st.subjects) s.semesters.Q4 = {};
  st.exams.forEach((e) => (e.points = null));
  const r = requiredUniformLevel(st, 769);
  assert.equal(r.reachable, true);
  assert.ok(r.level > 12 && r.level <= 15, `level ${r.level}`);
  // applying it reaches the target, one tenth less does not
  const unreachable = requiredUniformLevel(makeState(0, 0, 0), 769);
  assert.equal(unreachable.reachable, false);
});
