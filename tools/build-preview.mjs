// Builds preview/iphone.html: the whole app bundled into one file and shown
// inside a drawn iPhone frame. Used for the in-chat preview (Claude Artifact).
// Run: npm run preview
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

/* ---- 1. bundle the ES modules into one classic script ---- */
const ORDER = ['rules', 'state', 'motion', 'ui', 'app'];
function wrap(name) {
  let code = read(`js/${name}.js`);
  code = code.replace(/import\s*\{([^}]*)\}\s*from\s*'\.\/(\w+)\.js';/g, (_, names, mod) => `const {${names}} = __${mod};`);
  code = code.replace(/import\s*\*\s*as\s*(\w+)\s*from\s*'\.\/(\w+)\.js';/g, (_, alias, mod) => `const ${alias} = __${mod};`);
  const exported = [...code.matchAll(/export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)/g)].map((m) => m[1]);
  code = code.replace(/export\s+(?=(?:async\s+)?(?:function|const|let|class)\s)/g, '');
  return `const __${name} = (() => {\n${code}\nreturn { ${exported.join(', ')} };\n})();`;
}

// demo grades so the preview opens in a realistic state (only if nothing is stored yet)
const DEMO = `
(() => {
  const K = 'abitur-tracker:v1';
  try { const old = JSON.parse(localStorage.getItem(K) || 'null'); if (old && old.schema === 2) return; } catch { return; }
  const s = __state.defaultState();
  s.settings.expect = 12;
  const fin = { English: [13, 14], Mathematics: [12, 13], German: [12, 11], History: [13, 12], Biology: [11, 12], Politics: [12, 13], Physics: [10, 11], French: [12, 12], Art: [14, 14], Sport: [13, 13] };
  for (const sub of s.subjects) { const [a, c] = fin[sub.name] || [12, 12]; sub.sem.Q1 = { final: a }; sub.sem.Q2 = { final: c }; }
  const by = (n) => s.subjects.find((x) => x.name === n);
  by('English').sem.Q3 = { k1: 14, k2: 12, o: 13.5 };
  by('Mathematics').sem.Q3 = { k1: 11, o: 13 };
  by('History').sem.Q3 = { k1: 6, o: 12 };
  by('Physics').sem.Q1.strike = true;
  s.exams.PF1.points = 13; s.exams.PF2.points = 12;
  try { localStorage.setItem(K, JSON.stringify(s)); } catch {}
})();`;

const bundle = [ORDER.slice(0, 2).map(wrap).join('\n'), DEMO, ORDER.slice(2).map(wrap).join('\n')].join('\n');

/* ---- 2. the app as one HTML document (goes into the phone's iframe) ---- */
const body = read('index.html').match(/<body>([\s\S]*)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/g, '');
const deviceCSS = `
/* inside the drawn phone: room for status bar + home indicator */
main { padding-top: 62px !important; }
.sheet-panel { max-height: calc(100% - 56px) !important; padding-bottom: 40px !important; }
main { padding-bottom: 40px !important; }
html { scrollbar-width: none; } ::-webkit-scrollbar { display: none; }`;
const appDoc = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${read('css/styles.css')}${deviceCSS}</style></head><body>${body}<script>${bundle}<\/script></body></html>`;

/* ---- 3. the artifact page: phone frame + notes ---- */
const page = read('tools/preview-frame.html').replace('__APP_JSON__', () => JSON.stringify(appDoc).replace(/<\//g, '<\\/'));
mkdirSync(new URL('preview/', root), { recursive: true });
writeFileSync(new URL('preview/iphone.html', root), page);
console.log(`preview/iphone.html written (${(page.length / 1024).toFixed(0)} KB)`);
