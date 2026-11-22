// Decorative topographic contour lines for the left and right edges.
// Deterministic (seeded), so the pattern is the same on every load.

function rng(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

function side(seed, mirror) {
  const r = rng(seed);
  const W = 400, H = 1000, lines = 13;
  // a few overlapping sine waves = organic but smooth
  const waves = Array.from({ length: 3 }, () => ({ f: 0.004 + r() * 0.008, p: r() * Math.PI * 2, a: 10 + r() * 26 }));
  const bump = { y: 250 + r() * 500, s: 140 + r() * 120, a: 40 + r() * 50 }; // a "hill" the lines bend around
  let d = '';
  for (let i = 0; i < lines; i++) {
    const base = 14 + i * 22 + i * i * 0.6;
    const k = 1 - i / (lines + 4); // inner lines follow the hill more
    let path = '';
    for (let y = 0; y <= H; y += 20) {
      let x = base;
      for (const w of waves) x += Math.sin(y * w.f + w.p + i * 0.18) * w.a * (0.6 + 0.4 * k);
      x += bump.a * k * Math.exp(-((y - bump.y) ** 2) / (2 * bump.s ** 2));
      if (mirror) x = W - x;
      path += `${y === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y}`;
    }
    d += `<path d="${path}"/>`;
  }
  return `<svg class="${mirror ? 'r' : 'l'}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${d}</svg>`;
}

export function mountContours() {
  const el = document.createElement('div');
  el.className = 'contours';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = side(7, false) + side(23, true);
  document.body.prepend(el);
}
