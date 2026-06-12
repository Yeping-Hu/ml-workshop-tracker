/**
 * Device-local favorites — star workshops & papers, no account needed.
 *
 * Everything lives in this browser's localStorage; nothing is sent to a
 * server. Two keys:
 *   awt-fav-workshops  ["<slug>", ...]            (slugs only — the saved
 *                       page re-fetches live data from /api/workshops.json,
 *                       so deadlines/status are never stale)
 *   awt-fav-papers     [{id,title,url,ws,wsName}] (tiny snapshot — there is
 *                       no global papers JSON to re-fetch ~10k papers from,
 *                       and titles don't change)
 *
 * Loaded on every page via Base.astro. Star buttons are plain <button>s
 * carrying data-star-ws="<slug>" or data-star-paper="<id>" (+ snapshot data
 * attributes); this module hydrates their state and handles clicks through
 * one delegated listener. If a future login feature lands, migrating is one
 * read of these two keys.
 */

const WS_KEY = 'awt-fav-workshops';
const P_KEY = 'awt-fav-papers';

function read(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return []; // storage blocked (some private modes) or corrupt — behave as empty
  }
}
function write(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
    return true;
  } catch {
    return false;
  }
}

export const favWorkshops = () => read(WS_KEY);
export const favPapers = () => read(P_KEY);

/** Anonymous usage signal (GoatCounter custom event) — fires only on ADD,
 *  so the dashboard shows whether the feature earns a real backend later. */
function track(path, title) {
  try {
    window.goatcounter?.count?.({ path, title, event: true });
  } catch {}
}

function setBtn(btn, on) {
  btn.textContent = on ? '★' : '☆';
  btn.classList.toggle('is-on', on);
  btn.setAttribute('aria-pressed', String(on));
  btn.title = on ? 'Remove from saved' : 'Save for later (stays in this browser)';
}

/** Paint every star button on the page to match storage. */
export function hydrate(root = document) {
  const ws = new Set(favWorkshops());
  const ps = new Set(favPapers().map((p) => p.id));
  for (const b of root.querySelectorAll('[data-star-ws]')) setBtn(b, ws.has(b.dataset.starWs));
  for (const b of root.querySelectorAll('[data-star-paper]')) setBtn(b, ps.has(b.dataset.starPaper));
  updateBadge();
}

function updateBadge() {
  const el = document.getElementById('navSavedCount');
  if (!el) return;
  const n = favWorkshops().length + favPapers().length;
  el.textContent = n ? String(n) : '';
  el.hidden = n === 0;
}

function announce(type, id, on) {
  updateBadge();
  document.dispatchEvent(new CustomEvent('awt:favs-changed', { detail: { type, id, on } }));
}

function toggleWorkshop(btn) {
  const slug = btn.dataset.starWs;
  let list = favWorkshops();
  const on = !list.includes(slug);
  list = on ? [...list, slug] : list.filter((s) => s !== slug);
  if (!write(WS_KEY, list)) return storageFailed(btn);
  // A workshop can have several stars on one page (row + detail header).
  for (const b of document.querySelectorAll(`[data-star-ws="${CSS.escape(slug)}"]`)) setBtn(b, on);
  if (on) track('fav/star-workshop', slug);
  announce('workshop', slug, on);
}

function togglePaper(btn) {
  const id = btn.dataset.starPaper;
  let list = favPapers();
  const on = !list.some((p) => p.id === id);
  list = on
    ? [
        ...list,
        {
          id,
          title: btn.dataset.title || 'Untitled paper',
          url: btn.dataset.url || '',
          ws: btn.dataset.ws || '',
          wsName: btn.dataset.wsname || '',
        },
      ]
    : list.filter((p) => p.id !== id);
  if (!write(P_KEY, list)) return storageFailed(btn);
  for (const b of document.querySelectorAll(`[data-star-paper="${CSS.escape(id)}"]`)) setBtn(b, on);
  if (on) track('fav/star-paper', id);
  announce('paper', id, on);
}

function storageFailed(btn) {
  btn.title = "Couldn't save — this browser is blocking site storage (private mode?)";
  btn.classList.add('star-err');
  setTimeout(() => btn.classList.remove('star-err'), 1200);
}

// Module side effects can only run once per page even if this file is both
// loaded by Base.astro and imported by a page script — but guard anyway so a
// future double-include can't double-toggle every click.
if (!window.__awtFavsInit) {
  window.__awtFavsInit = true;

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-star-ws],[data-star-paper]');
    if (!btn) return;
    e.preventDefault();
    if (btn.dataset.starWs != null) toggleWorkshop(btn);
    else togglePaper(btn);
  });

  // Another tab changed the list — repaint stars and badge here too.
  window.addEventListener('storage', (e) => {
    if (e.key === WS_KEY || e.key === P_KEY) {
      hydrate();
      document.dispatchEvent(new CustomEvent('awt:favs-changed', { detail: { type: 'sync' } }));
    }
  });

  hydrate();
}
