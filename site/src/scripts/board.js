/**
 * Board behaviour: countdown timers, local-time conversion, the masthead
 * "next deadline" ticker, and board pagination. (All filtering and search
 * lives in the homepage's unified Pagefind search.)
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

tick();
if ($$('[data-deadline-ms]').length) setInterval(tick, 1000);

/* ---------- board pagination ---------- */
// The deadline board lists every open call; after a big import wave (e.g.
// the NeurIPS cycle) that's 60+ tall rows — far too much scroll. Chunk it
// into pages using the same numbered pager as the search results (global
// `.pager` styles). Rows stay in the DOM (`.pg-off` class — the rows are
// display:grid, so the `hidden` attribute wouldn't take) so countdowns and
// the "next deadline" ticker keep seeing every row.
const BOARD_PAGE_SIZE = 25;
const board = document.querySelector('.board');
const boardRows = board ? $$('[data-ws-row]', board) : [];
if (boardRows.length > BOARD_PAGE_SIZE) {
  const nPages = Math.ceil(boardRows.length / BOARD_PAGE_SIZE);
  const nav = document.createElement('nav');
  nav.className = 'pager board-pager';
  nav.setAttribute('aria-label', 'Deadline board pages');
  let cur = 1;
  const render = (p) => {
    cur = Math.min(Math.max(1, p), nPages);
    boardRows.forEach((r, i) => r.classList.toggle('pg-off', Math.floor(i / BOARD_PAGE_SIZE) !== cur - 1));
    nav.innerHTML = Array.from({ length: nPages }, (_, i) => i + 1)
      .map((n) => `<button type="button" data-page="${n}" class="${n === cur ? 'is-on' : ''}" ${n === cur ? 'aria-current="page"' : ''}>${n}</button>`)
      .join('');
  };
  nav.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-page]');
    if (!b) return;
    render(Number(b.dataset.page));
    // Parity with the search pager: the page survives reload/share. `bpage`
    // so it never collides with the search panel's `page` param.
    const u = new URL(location.href);
    if (cur === 1) u.searchParams.delete('bpage');
    else u.searchParams.set('bpage', String(cur));
    history.replaceState(null, '', u);
    board.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  board.after(nav);
  render(Number(new URLSearchParams(location.search).get('bpage')) || 1);
}
