// Motion + haptics. The app re-renders whole views; this module remembers
// the previous values of marked elements and animates from old to new.

export const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const prev = new Map();

/**
 * After a render, animate elements marked with:
 *   data-count="12.3" data-dec="1" data-anim="key"  → number counts from old to new
 *   data-bar="78.4"   data-anim="key"               → bar width grows from old to new
 *   .seg[data-anim]   style="--i:n"                 → segmented thumb slides from old to new
 *   data-tick="7"     data-anim="key"               → value ticks up/down
 */
export function animate(root) {
  const still = reducedMotion();
  root.querySelectorAll('[data-anim]').forEach((el) => {
    const key = el.dataset.anim;
    const old = prev.get(key);

    if ('count' in el.dataset) {
      const to = parseFloat(el.dataset.count);
      prev.set(key, to);
      if (still || old === undefined || old === to || !Number.isFinite(to)) return;
      countUp(el, old, to, +(el.dataset.dec || 0));
    } else if ('bar' in el.dataset) {
      const to = parseFloat(el.dataset.bar);
      prev.set(key, to);
      if (still || old === undefined || old === to) return;
      el.style.width = `${old}%`;
      el.getBoundingClientRect(); // commit start width
      requestAnimationFrame(() => (el.style.width = `${to}%`));
    } else if (el.classList.contains('seg')) {
      const to = el.style.getPropertyValue('--i');
      prev.set(key, to);
      if (still || old === undefined || old === to) return;
      el.style.setProperty('--i', old);
      el.getBoundingClientRect();
      requestAnimationFrame(() => el.style.setProperty('--i', to));
    } else if ('tick' in el.dataset) {
      const to = parseFloat(el.dataset.tick);
      prev.set(key, to);
      if (still || old === undefined || old === to) return;
      el.classList.add(to > old ? 'tick-up' : 'tick-down');
    }
  });
}

function countUp(el, from, to, dec) {
  const t0 = performance.now(), dur = 450;
  const fmt = (v) => v.toFixed(dec);
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(from + (to - from) * e);
    if (k < 1) requestAnimationFrame(step);
    else el.textContent = fmt(to);
  };
  el.textContent = fmt(from);
  requestAnimationFrame(step);
}

/** Re-apply a short "pop" to the control matching `selector` (it was re-created by render). */
export function pop(root, selector) {
  if (!selector || reducedMotion()) return;
  let el;
  try { el = root.querySelector(selector); } catch { return; }
  if (!el) return;
  el.classList.remove('pop');
  el.getBoundingClientRect();
  el.classList.add('pop');
}

/* ---------- haptics ---------- */
// Android/Chrome: Vibration API. iPhone (iOS 18+): Safari has no vibration API,
// but toggling a native <input type="checkbox" switch> plays the system haptic tick.
let enabled = true;
let iosLabel = null;
export function setHaptics(on) { enabled = on; }

function iosSwitch() {
  if (iosLabel) return iosLabel;
  const label = document.createElement('label');
  label.className = 'haptic-switch';
  label.setAttribute('aria-hidden', 'true');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  input.tabIndex = -1;
  label.appendChild(input);
  document.body.appendChild(label);
  return (iosLabel = label);
}

export function haptic() {
  if (!enabled) return;
  try {
    if (navigator.vibrate) { navigator.vibrate(8); return; }
    iosSwitch().click();
  } catch { /* no haptics available */ }
}

/* ---------- swipe down to close a sheet ---------- */
export function swipeToClose(sheet, onClose) {
  const panel = sheet.querySelector('.sheet-panel');
  let y0 = null, dy = 0;
  panel.addEventListener('touchstart', (e) => {
    const onHandle = e.target.closest('.sheet-top');
    if (!onHandle && panel.scrollTop > 0) return;
    y0 = e.touches[0].clientY; dy = 0;
  }, { passive: true });
  panel.addEventListener('touchmove', (e) => {
    if (y0 === null) return;
    dy = Math.max(0, e.touches[0].clientY - y0);
    if (dy > 4) { sheet.classList.add('dragging'); panel.style.transform = `translateY(${dy}px)`; }
  }, { passive: true });
  panel.addEventListener('touchend', () => {
    if (y0 === null) return;
    sheet.classList.remove('dragging');
    panel.style.transform = '';
    if (dy > 110) onClose();
    y0 = null;
  });
}
