/**
 * Board behaviour: countdown timers, local-time conversion, filters with
 * URL persistence, and the masthead "next deadline" ticker.
 * Plain JS, no dependencies; safe on pages where some controls are absent.
 */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ---------- local-time conversion ---------- */
function localizeTimes() {
  for (const el of $$('.js-local[data-iso]')) {
    const d = new Date(el.dataset.iso);
    if (Number.isNaN(d.getTime())) { el.textContent = ''; continue; }
    el.textContent =
      'Your time: ' +
      d.toLocaleString(undefined, {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
      });
  }
}

/* ---------- countdowns ---------- */
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

function tickCountdowns() {
  const now = Date.now();
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
  }
  updateNextLine(now);
}

function updateNextLine(now) {
  const target = $('#next-deadline');
  if (!target) return;
  let best = null;
  for (const row of $$('[data-ws-row]:not([hidden])')) {
    const el = row.querySelector('[data-deadline-ms]');
    if (!el) continue;
    const rem = Number(el.dataset.deadlineMs) - now;
    if (rem > 0 && (!best || rem < best.rem)) best = { rem, name: el.dataset.name || 'next deadline' };
  }
  target.innerHTML = best
    ? `Next deadline: <b>${escapeHtml(best.name)}</b> in <b>${fmtRemaining(best.rem)}</b>`
    : 'No upcoming deadlines match your filters.';
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- filters (URL-persisted) ---------- */
function readState() {
  const p = new URLSearchParams(location.search);
  return {
    q: (p.get('q') || '').toLowerCase(),
    conf: new Set((p.get('conf') || '').split(',').filter(Boolean)),
    topic: new Set((p.get('topic') || '').split(',').filter(Boolean)),
    passed: p.get('passed') === '1',
  };
}

function writeState(state) {
  const p = new URLSearchParams();
  if (state.q) p.set('q', state.q);
  if (state.conf.size) p.set('conf', [...state.conf].join(','));
  if (state.topic.size) p.set('topic', [...state.topic].join(','));
  if (state.passed) p.set('passed', '1');
  const qs = p.toString();
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
}

function collectState() {
  return {
    q: ($('#q')?.value || '').trim().toLowerCase(),
    conf: new Set($$('.f-conf:checked').map((el) => el.value)),
    topic: new Set($$('.f-topic:checked').map((el) => el.value)),
    passed: $('#showPassed')?.checked ?? false,
  };
}

function applyFilters(state) {
  let visible = 0;
  for (const row of $$('[data-ws-row]')) {
    const okConf = state.conf.size === 0 || state.conf.has(row.dataset.conf);
    const rowTopics = (row.dataset.topics || '').split(' ');
    const okTopic = state.topic.size === 0 || rowTopics.some((t) => state.topic.has(t));
    const okQ = !state.q || (row.dataset.search || '').includes(state.q);
    const okPassed = row.dataset.status !== 'deadline_passed' || state.passed;
    const show = okConf && okTopic && okQ && okPassed;
    row.hidden = !show;
    if (show) visible++;
  }
  const count = $('#resultCount');
  if (count) count.textContent = `${visible} shown`;
  const empty = $('#emptyState');
  if (empty) empty.hidden = visible !== 0;
  const summary = $('#topicSummary');
  if (summary) summary.textContent = state.topic.size ? `Topics · ${state.topic.size}` : 'Topics';
  updateNextLine(Date.now());
}

function initFilters() {
  const hasControls = $('#q') || $$('.f-conf').length;
  if (!hasControls) return;

  // hydrate controls from URL
  const init = readState();
  if ($('#q')) $('#q').value = new URLSearchParams(location.search).get('q') || '';
  for (const el of $$('.f-conf')) el.checked = init.conf.has(el.value);
  for (const el of $$('.f-topic')) el.checked = init.topic.has(el.value);
  if ($('#showPassed')) $('#showPassed').checked = init.passed;

  const onChange = () => {
    const state = collectState();
    writeState(state);
    applyFilters(state);
  };
  for (const el of ['#q', '#showPassed'].map((s) => $(s)).filter(Boolean)) {
    el.addEventListener('input', onChange);
  }
  for (const el of [...$$('.f-conf'), ...$$('.f-topic')]) el.addEventListener('change', onChange);
  $('#clearFilters')?.addEventListener('click', () => {
    if ($('#q')) $('#q').value = '';
    for (const el of [...$$('.f-conf'), ...$$('.f-topic')]) el.checked = false;
    if ($('#showPassed')) $('#showPassed').checked = false;
    onChange();
  });

  applyFilters(collectState());
}

/* ---------- boot ---------- */
localizeTimes();
initFilters();
tickCountdowns();
if ($$('[data-deadline-ms]').length) setInterval(tickCountdowns, 1000);
