/**
 * Board behaviour: countdown timers, local-time conversion, keyword-chip
 * filters with URL persistence, and the masthead "next deadline" ticker.
 * Plain JS, no dependencies; safe on pages where some controls are absent.
 */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

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

/* ---------- keyword chips ---------- */
let keywords = [];

function renderChips() {
  const box = $('#kwChips');
  if (!box) return;
  box.innerHTML = keywords
    .map(
      (k, i) =>
        `<span class="kw-chip">${escapeHtml(k)}<button type="button" class="kw-x" data-i="${i}" aria-label="Remove keyword ${escapeHtml(k)}">×</button></span>`,
    )
    .join('');
}

function commitKeyword() {
  const input = $('#q');
  const v = (input?.value || '').trim().toLowerCase();
  if (!v) return false;
  if (!keywords.includes(v)) keywords.push(v);
  input.value = '';
  renderChips();
  return true;
}

/* ---------- filters (URL-persisted) ---------- */
function collectState() {
  const live = ($('#q')?.value || '').trim().toLowerCase();
  return {
    terms: [...keywords, live].filter(Boolean),
    conf: new Set($$('.f-conf:checked').map((el) => el.value)),
    topic: new Set($$('.f-topic:checked').map((el) => el.value)),
    passed: $('#showPassed')?.checked ?? false,
  };
}

function writeState(state) {
  const p = new URLSearchParams();
  if (keywords.length) p.set('q', keywords.join(','));
  if (state.conf.size) p.set('conf', [...state.conf].join(','));
  if (state.topic.size) p.set('topic', [...state.topic].join(','));
  if ($('#showPassed')) p.set('passed', state.passed ? '1' : '0');
  const qs = p.toString();
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
}

function applyFilters(state) {
  let visible = 0;
  for (const row of $$('[data-ws-row]')) {
    const search = row.dataset.search || '';
    const okTerms = state.terms.every((t) => search.includes(t));
    const okConf = state.conf.size === 0 || state.conf.has(row.dataset.conf);
    const rowTopics = (row.dataset.topics || '').split(' ');
    const okTopic = state.topic.size === 0 || rowTopics.some((t) => state.topic.has(t));
    const okPassed = row.dataset.status !== 'deadline_passed' || state.passed;
    const show = okTerms && okConf && okTopic && okPassed;
    row.hidden = !show;
    if (show) visible++;
  }
  // Hide any group container (year block, conference section) with no visible rows.
  for (const g of $$('[data-group]')) {
    g.hidden = ![...g.querySelectorAll('[data-ws-row]')].some((r) => !r.hidden);
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
  const input = $('#q');
  const hasControls = input || $$('.f-conf').length;
  if (!hasControls) return;

  const onChange = () => {
    const state = collectState();
    writeState(state);
    applyFilters(state);
  };

  // hydrate from URL (only override rendered defaults when a param is present)
  const p = new URLSearchParams(location.search);
  keywords = (p.get('q') || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  renderChips();
  const conf = new Set((p.get('conf') || '').split(',').filter(Boolean));
  for (const el of $$('.f-conf')) el.checked = conf.has(el.value);
  const topic = new Set((p.get('topic') || '').split(',').filter(Boolean));
  for (const el of $$('.f-topic')) el.checked = topic.has(el.value);
  if ($('#showPassed') && p.has('passed')) $('#showPassed').checked = p.get('passed') === '1';

  if (input) {
    input.addEventListener('input', onChange);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        commitKeyword();
        onChange();
      } else if (e.key === 'Backspace' && input.value === '' && keywords.length) {
        keywords.pop();
        renderChips();
        onChange();
      }
    });
  }
  $('#kwChips')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.kw-x');
    if (!btn) return;
    keywords.splice(Number(btn.dataset.i), 1);
    renderChips();
    onChange();
    $('#q')?.focus();
  });
  for (const el of $$('.f-conf')) el.addEventListener('change', onChange);
  for (const el of $$('.f-topic')) el.addEventListener('change', onChange);
  $('#showPassed')?.addEventListener('input', onChange);
  $('#clearFilters')?.addEventListener('click', () => {
    keywords = [];
    renderChips();
    if (input) input.value = '';
    for (const el of [...$$('.f-conf'), ...$$('.f-topic')]) el.checked = false;
    if ($('#showPassed')) $('#showPassed').checked = $('#showPassed').dataset.default === '1';
    onChange();
  });

  // "/" focuses the filter box from anywhere on the page
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')) {
      e.preventDefault();
      input?.focus();
    }
  });

  applyFilters(collectState());
}

/* ---------- boot ---------- */
localizeTimes();
initFilters();
tickCountdowns();
if ($$('[data-deadline-ms]').length) setInterval(tickCountdowns, 1000);
