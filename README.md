# Abitur Tracker

Phone-first tracker for the Berlin Abitur (VO-GO): shows the projected final grade, and what each remaining Klausur, oral mark, semester and exam must be to reach a target (e.g. 1.3 = 769 points, 1.2 = 787).

## Use it
1. Open the GitHub Pages link on your phone (Safari).
2. Share → **Add to Home Screen**. It now works like an app, also offline.
3. **Courses** → tap a cell → enter a final grade (Q1/Q2), single marks (Q3) or an estimate (Q4).
4. **Overview** → projected grade, Block I/II, cheapest next points.
5. **Plan** → pick a target, see the average you need, play with what-if values.
6. **Settings** → edit subjects, LK/GK, Klausur share, exams, "Taken" chips per subject (untick semesters you did not take / dropped), haptics. **Export a backup** regularly.
7. **Strike / force a semester**: tap a grade cell → *Counts in Block I*: Auto · Count · Strike. Strikes possible = semesters taken − 40 (48 taken = 8 strikes). When all are used, Strike is disabled.

Your grades are stored only in your phone's browser, never in this repository.

## How it is built
No build step: the files here are exactly what runs.

| File | Role |
|---|---|
| `js/rules.js` | All grade maths (rules in the `RULES` object at the top) |
| `js/state.js` | Saving / backup |
| `js/ui.js` | What each screen shows |
| `js/app.js` | What happens on a tap |
| `js/motion.js` | Animations, haptics, swipe-to-close |
| `js/contours.js` | Contour-line decoration on the overview |
| `css/styles.css` | Look (colours at the top) |
| `tests/rules.test.js` | Checks the maths: `npm test` |

Preview in a drawn iPhone (for the Claude chat): `npm run preview` writes `preview/iphone.html` (demo data, not committed).

When you change files, bump `CACHE` in `sw.js` (e.g. `abitur-v2`) so phones pick up the new version.

## Rules used (verify against your school's handout)
- Block I: best 40 semester courses, 8 LK semesters double, E = P / S × 40 (max 600, min 200, max 8 under 05).
- Block II: 5 exam components × 4 (max 300, min 100, ≥ 3 at 05+ incl. one LK).
- Grade = 17/3 − E/180, truncated to one decimal.
- Semester grade estimate: GK 33 % Klausur / 67 % other, LK 50 / 50, rounded x.5 up. The teacher's actual grade can deviate.
