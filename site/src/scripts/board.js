/**
 * Board behaviour: countdown timers, local-time conversion, the masthead
 * "next deadline" ticker, and the show-passed toggle. (All filtering and
 * search lives in the homepage's unified Pagefind search.)
 */
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- local-time conversion ---------- */
for (const el of $$('.js-local[data-iso]')) {
  const d = new Date(el.dataset.iso);
  el.textContent = Number.isNaN(d.getTime())
    ? ''
    : 'Your time: ' +
      d.toLocaleString(undefined, {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
      });
}

/* ---------- countdowns + ticker ---------- */
const HOUR = 3_600_000, DAY = 24 * HOUR;

function fmtRemaining(ms) {
  const d = Math.floor(ms / DAY);
  const h = Math.floor((ms % DAY) / HOUR);
  const m = Math.floor((ms % HOUR) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  if (d >= 1) return `${d}d ${String(h).padStart(2, '0')}h`;
  if (h >= 1) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function tick() {
  const now = Date.now();
  let best = null;
  for (const el of $$('[data-deadline-ms]')) {
    const rem = Number(el.dataset.deadlineMs) - now;
    el.classList.remove('is-soon', 'is-critical', 'is-over');
    if (rem <= 0) {
      el.textContent = 'passed';
      el.classList.add('is-over');
      continue;
    }
    el.textContent = fmtRemaining(rem);
    if (rem < 48 * HOUR) el.classList.add('is-critical');
    else if (rem < 7 * DAY) el.classList.add('is-soon');
    if (!best || rem < best.rem) best = { rem, name: el.dataset.name || 'next deadline' };
  }
  const ticker = document.getElementById('next-deadline');
  if (ticker) {
    ticker.innerHTML = best
      ? `Next deadline: <b>${escapeHtml(best.name)}</b> in <b>${fmtRemaining(best.rem)}</b>`
      : 'No upcoming deadlines right now — new cycles are imported automatically.';
  }
}

/* ---------- show-passed toggle ---------- */
const toggle = document.getElementById('showPassed');
function applyPassed() {
  for (const row of $$('[data-ws-row][data-status="deadline_passed"]')) row.hidden = !toggle.checked;
}
if (toggle) {
  toggle.addEventListener('input', applyPassed);
  applyPassed();
}

tick();
if ($$('[data-deadline-ms]').length) setInterval(tick, 1000);
