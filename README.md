# Abitur Tracker

Phone app for the Berlin Abitur 2027: your projected grade, and what you still need for 1.3 or 1.2.

Live: https://6benny6.github.io/abitur-tracker/ (Safari → Share → Add to Home Screen)

## Use it
- **Home**: projected grade, points out of 900, the average you still need, Block I and II, and anything that breaks a rule.
- **Tap a subject**: enter per semester the Klausur grade(s) and your "other" average (oral etc.), or the report grade once it is out. The app applies the official weighting and tells you what you need for the next point. GK semesters have a **Strike** switch.
- **Tap an exam**: expected or real points for the 5 exam components.
- **Gear**: subjects (LK/GK, area, exam role, semesters taken), expected points, backup.

Grades stay on your phone only. Export a backup now and then.

## Rules used (Berlin, Abitur 2027)
| | |
|---|---|
| Block I | all 8 LK semesters ×2 + exactly 24 GK semesters (max 600, min 200) |
| Strikes | GK semesters taken − 24, chosen automatically (you can strike manually) |
| Must count | all GK semesters of the 3rd/4th exam subject; last semester of the 5th component; 2 semesters each in German, a foreign language, maths, a science, a social science |
| Limits | no counted 00; max 2 LK and 4 GK under 05 |
| Block II | 5 components ×4 (max 300, min 100; 2 of the 4 exam subjects at 05+, one an LK) |
| Semester grade | 1 Klausur = 1/3, 2 Klausuren = 1/2 (LK Q1–Q3), LK Q4 = 1/3 |
| Grade | 17/3 − points/180, truncated (1.3 ≥ 769, 1.2 ≥ 787) |

Confirm details with your Oberstufenkoordination. All constants are at the top of `js/rules.js`.

## Code
| File | Role |
|---|---|
| `js/rules.js` | all grade maths |
| `js/state.js` | saving, backup, migration of old data |
| `js/ui.js` | what the screens show |
| `js/app.js` | what happens on a tap |
| `js/motion.js` | small animations, haptics, swipe to close |
| `css/styles.css` | look |
| `tests/rules.test.js` | `npm test` |

`npm run preview` builds `preview/iphone.html` (the app in a drawn iPhone, demo data). After changing files, bump `CACHE` in `sw.js` so phones load the new version.
