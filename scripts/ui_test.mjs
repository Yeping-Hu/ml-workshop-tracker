/**
 * Headless UI tests for the search-first homepage.
 * Run a build first, then:  node scripts/ui_test.mjs [http://localhost:4321]
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:4321';
let pass = 0, fail = 0;
const errors = [];
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

await page.goto(BASE, { waitUntil: 'networkidle' });

console.log('— facet panels populate on idle (no typing) —');
await page.waitForFunction(() => document.querySelector('[data-facet="conference"]')?.children.length >= 5, null, { timeout: 8000 });
const confOptions = () => page.$$eval('[data-facet="conference"] input[data-f]', (els) => els.map((e) => e.value));
import { readFileSync as rfTop } from 'node:fs';
const expectedConfs = new Set(JSON.parse(rfTop('site/dist/api/workshops.json', 'utf8')).workshops.map((w) => w.conference)).size;
let opts = await confOptions();
check(`conference panel lists all ${expectedConfs} conferences`, opts.length === expectedConfs, `got ${opts}`);
const eyebrow = await page.$eval('.hero .eyebrow', (el) => el.textContent.trim().replace(/ workshops\s*$/, '').split(' · '));
check('eyebrow order matches conference dropdown', JSON.stringify(eyebrow) === JSON.stringify(opts), `${eyebrow} vs ${opts}`);
const initialIclrCount = await page.$eval('[data-count="conference:ICLR"]', (el) => el.textContent);
check('counts rendered', /\(\d+\)/.test(initialIclrCount), initialIclrCount);

console.log('— facet bar centering —');
const centering = await page.$eval('.hero .facetbar', (el) => {
  const cs = getComputedStyle(el);
  const rc = el.querySelector('.resultcount');
  return { jc: cs.justifyContent, rcMargin: rc ? getComputedStyle(rc).marginLeft : null };
});
check('justify-content is center', centering.jc === 'center', centering.jc);
check('resultcount auto-margin removed', centering.rcMargin !== 'auto', String(centering.rcMargin));
const box = await page.$eval('.hero .facetbar details.dd', (el) => el.getBoundingClientRect().left);
check('dropdowns visually not flush-left', box > 150, `left=${box}`);

console.log('— EXACT USER REPRO: check ICML, uncheck, reopen panel —');
await page.click('summary[data-facet-summary="conference"]');
await page.check('[data-facet="conference"] input[value="ICML"]');
await page.waitForSelector('#searchPanel:not([hidden])');
await page.waitForFunction(() => document.querySelectorAll('#results .pf-result').length > 0);
check('selecting ICML shows results', true);
check('board hidden in search mode', await page.$eval('#homeDefault', (el) => el.hidden));
check('URL carries facet', (await page.url()).includes('conference=ICML'));
await page.uncheck('[data-facet="conference"] input[value="ICML"]');
await page.waitForSelector('#homeDefault:not([hidden])');
check('unchecking returns to default mode', true);
await page.click('summary[data-facet-summary="conference"]'); // close
await page.click('summary[data-facet-summary="conference"]'); // reopen
opts = await confOptions();
check('REPRO FIXED: all conferences still listed after uncheck', opts.length === expectedConfs, `got ${opts}`);
check('ICLR count restored to initial', (await page.$eval('[data-count="conference:ICLR"]', (el) => el.textContent)) === initialIclrCount);

console.log('— cross-facet count consistency (select ICML) —');
import { readFileSync as rf } from 'node:fs';
const apiAll = JSON.parse(rf('site/dist/api/workshops.json', 'utf8')).workshops;
await page.check('[data-facet="conference"] input[value="ICML"]');
await page.waitForFunction(() => document.querySelectorAll('#results .pf-result').length > 0);
const numOf = async (f, v) => Number((await page.$eval(`[data-count="${f}:${v}"]`, (el) => el.textContent)).replace(/[()]/g, ''));
const icmlTotal = apiAll.filter((w) => w.conference === 'icml').length;
const icml2026 = apiAll.filter((w) => w.conference === 'icml' && w.year === 2026).length;
check('year counts reflect ICML selection', (await numOf('year', '2026')) === icml2026, `got ${await numOf('year', '2026')} want ${icml2026}`);
const statusSum = await page.$$eval('[data-facet="status"] [data-count]', (els) => els.reduce((n, e) => n + Number(e.textContent.replace(/[()]/g, '')), 0));
check('status counts sum to ICML total', statusSum === icmlTotal, `sum ${statusSum} want ${icmlTotal}`);
check("conference's own counts stay global (any-semantics)", (await numOf('conference', 'ICLR')) === Number(initialIclrCount.replace(/[()]/g, '')));
await page.uncheck('[data-facet="conference"] input[value="ICML"]');
await page.waitForSelector('#homeDefault:not([hidden])');
check('counts restore when cleared', (await numOf('year', '2026')) !== icml2026 || icml2026 === apiAll.filter((w) => w.year === 2026).length);

console.log('— keyword chips + nested paper sublists —');
await page.fill('#q', 'diffusion');
await page.keyboard.press('Enter');
await page.waitForFunction(() => document.querySelectorAll('#results .pf-result').length > 0);
check('chip created', (await page.$$eval('.kw-chip', (els) => els.length)) === 1);
check('nested papers sublist rendered', (await page.$$('.pf-papers')).length > 0);
check('paper rows have attribution anchors', (await page.$$eval('.pf-papers .pf-ptitle', (els) => els.length)) > 0);
const hrefs = await page.$$eval('#results .pf-title', (els) => els.map((e) => e.getAttribute('href')));
check('no duplicate workshop entries (single merge)', new Set(hrefs).size === hrefs.length, `dupes in ${hrefs.length}`);
const count = await page.$eval('#searchCount', (el) => el.textContent);
check('combined count format', /^\d+ workshops? · \d+ matching papers? · by relevance( · page \d+\/\d+)?$/.test(count), count);
{
  const headlineN = Number(count.match(/^(\d+) workshop/)[1]);
  let seen = (await page.$$('#results > .pf-result')).length;
  const pages = await page.$$eval('#results .pager button[data-page]', (els) => els.map((b) => Number(b.dataset.page)));
  for (const n of pages.slice(1)) {
    await page.click(`#results .pager button[data-page="${n}"]`);
    await page.waitForFunction((m) => document.querySelector('.pager button.is-on')?.dataset.page === String(m), n);
    seen += (await page.$$('#results > .pf-result')).length;
  }
  check('headline workshops == total entries across pages', seen === headlineN, `saw ${seen}, headline ${headlineN}`);
  if (pages.length > 1) {
    await page.click('#results .pager button[data-page="1"]');
    await page.waitForFunction(() => document.querySelector('.pager button.is-on')?.dataset.page === '1');
  }
}
check('workshop links open new tabs', await page.$eval('#results .pf-title', (a) => a.target === '_blank'));
check('paper links open new tabs', await page.$eval('.pf-papers .pf-ptitle', (a) => a.target === '_blank'));
await page.click('.kw-chip .kw-x');
await page.waitForSelector('#homeDefault:not([hidden])');
check('removing chip restores default mode', true);

console.log('— multi-keyword AND is consistent at both levels —');
const parseCount = (s) => {
  const m = s.match(/^(\d+) workshops?(?: · (\d+) matching papers?)?/);
  return { ws: Number(m[1]), papers: Number(m[2] || 0) };
};
await page.fill('#q', 'robot');
await page.keyboard.press('Enter');
await page.waitForFunction(() => /workshop/.test(document.querySelector('#searchCount')?.textContent || ''));
const c1 = parseCount(await page.$eval('#searchCount', (el) => el.textContent));
await page.fill('#q', 'llm');
await page.keyboard.press('Enter');
// URL syncs only when the new render completes — deterministic wait
await page.waitForFunction(() => new URL(location.href).searchParams.get('q') === 'robot,llm');
await page.waitForFunction(() => /workshop/.test(document.querySelector('#searchCount')?.textContent || ''));
const c2 = parseCount(await page.$eval('#searchCount', (el) => el.textContent));
check('adding a keyword narrows workshops', c2.ws <= c1.ws, `${c1.ws} -> ${c2.ws}`);
check('adding a keyword narrows papers too', c2.papers <= c1.papers, `${c1.papers} -> ${c2.papers}`);
const dual = await page.$$eval('.pf-papers li:not(.pf-subhead):not(.pf-more):not(.pf-xfall) .pf-excerpt', (els) =>
  els.slice(0, 10).map((e) => {
    const marks = [...e.querySelectorAll('mark')].map((m) => m.textContent.toLowerCase());
    return marks.some((w) => w.startsWith('robot')) && marks.some((w) => w.startsWith('llm'));
  }),
);
check('every listed paper carries both keywords', dual.length > 0 && dual.every(Boolean), JSON.stringify(dual));
await page.click('#clearSearch');
await page.waitForSelector('#homeDefault:not([hidden])');

console.log('— facet-only browse: clean headline, no paper sublists —');
await page.click('summary[data-facet-summary="status"]');
await page.check('[data-facet="status"] input[value="Open call"]');
await page.waitForFunction(() => document.querySelectorAll('#results .pf-result').length > 0);
const browseCount = await page.$eval('#searchCount', (el) => el.textContent);
check('browse headline omits papers segment', /^\d+ workshops? · open calls first$/.test(browseCount), browseCount);
check('browse entries have no paper sublists', (await page.$$('.pf-papers')).length === 0);
await page.uncheck('[data-facet="status"] input[value="Open call"]');
await page.waitForSelector('#homeDefault:not([hidden])');

console.log('— facet counts mean workshops (vs API ground truth) —');
import { readFileSync } from 'node:fs';
const api = JSON.parse(readFileSync('site/dist/api/workshops.json', 'utf8')).workshops;
const apiCount = (c) => api.filter((w) => w.conference === c).length;
const facetNum = async (v) => Number((await page.$eval(`[data-count="conference:${v}"]`, (el) => el.textContent)).replace(/[()]/g, ''));
await page.click('#clearSearch');
await page.waitForSelector('#homeDefault:not([hidden])');
check('ICML facet count == ICML editions in API', (await facetNum('ICML')) === apiCount('icml'), `facet ${await facetNum('ICML')} vs api ${apiCount('icml')}`);
check('ICRA facet count == ICRA editions in API', (await facetNum('ICRA')) === apiCount('icra'), `facet ${await facetNum('ICRA')} vs api ${apiCount('icra')}`);
await page.click('summary[data-facet-summary="conference"]');
await page.check('[data-facet="conference"] input[value="ICML"]');
await page.waitForFunction(() => /workshops/.test(document.querySelector('#searchCount')?.textContent || ''));
const icmlHead = await page.$eval('#searchCount', (el) => el.textContent);
check('ICML headline matches facet count', icmlHead.startsWith(`${apiCount('icml')} workshop`), icmlHead);
console.log('— pagination —');
const expPages = Math.ceil(apiCount('icml') / 50);
await page.waitForFunction((n) => document.querySelectorAll('#results .pager button').length === n, expPages);
check('pager shows all pages', true);
check('page 1 renders at most 50 entries', (await page.$$('#results > .pf-result')).length <= 50);
await page.click(`#results .pager button[data-page="${expPages}"]`);
await page.waitForFunction((n) => new URL(location.href).searchParams.get('page') === String(n), expPages);
check('URL carries page param', true);
const lastCount = (await page.$$('#results > .pf-result')).length;
check('last page renders the remainder', lastCount === apiCount('icml') % 50 || lastCount === 50, `got ${lastCount}`);
check('headline shows page position', /page \d+\/\d+/.test(await page.$eval('#searchCount', (el) => el.textContent)));
await page.click('#results .pager button[data-page="1"]');
await page.waitForFunction(() => !new URL(location.href).searchParams.get('page'));
// pager click sits outside the dropdown, so click-away closed it — reopen
await page.click('summary[data-facet-summary="conference"]');
await page.uncheck('[data-facet="conference"] input[value="ICML"]');
await page.waitForSelector('#homeDefault:not([hidden])');

console.log('— topic options left-aligned —');
await page.click('summary[data-facet-summary="topic"]');
const align = await page.$eval('[data-facet="topic"] label.check', (el) => {
  const cs = getComputedStyle(el);
  return { ta: cs.textAlign, js: cs.justifySelf };
});
check('topic labels left-aligned', align.ta !== 'center' && align.js === 'start', JSON.stringify(align));
const tw = await page.$eval('[data-facet="topic"]', (el) => el.getBoundingClientRect().width);
check('topic panel wide enough for one-line options', tw >= 330, `width ${tw}`);
const oneLine = await page.$$eval('[data-facet="topic"] label.check', (els) => els.every((el) => el.getBoundingClientRect().height < 2 * parseFloat(getComputedStyle(el).lineHeight || '20')));
check('every topic fits on one line', oneLine);
await page.click('h2');

console.log('— deep-linked paper highlight —');
await page.goto(`${BASE}/workshop/icml-2025-taig/#p-1`, { waitUntil: 'networkidle' });
const hl = await page.$eval('#p-1', (el) => getComputedStyle(el).backgroundColor);
check('clicked paper is highlighted via :target', hl !== 'rgba(0, 0, 0, 0)', hl);
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.querySelector('[data-facet="conference"]')?.children.length >= 5);

console.log('— Clear all —');
await page.fill('#q', 'robot');
await page.click('summary[data-facet-summary="year"]');
await page.check('[data-facet="year"] input[value="2026"]');
await page.waitForSelector('#searchPanel:not([hidden])');
await page.click('#clearSearch');
await page.waitForSelector('#homeDefault:not([hidden])');
check('Clear all resets query + facets', (await page.url()).split('?')[1] === undefined);
check('Clear all unchecks boxes', (await page.$$eval('input[data-f]:checked', (els) => els.length)) === 0);

console.log('— dropdown exclusivity + click-away —');
await page.click('summary[data-facet-summary="conference"]');
await page.click('summary[data-facet-summary="topic"]');
check('opening Topic closes Conference', !(await page.$eval('summary[data-facet-summary="conference"]', (s) => s.parentElement.open)));
check('Topic is open', await page.$eval('summary[data-facet-summary="topic"]', (s) => s.parentElement.open));
await page.click('h2');
check('click-away closes all dropdowns', (await page.$$eval('.facetbar details.dd', (els) => els.filter((d) => d.open).length)) === 0);

console.log('— countdown timers tick live —');
await page.evaluate(() => {
  const s = document.createElement('span');
  s.id = 'cd-test';
  s.dataset.deadlineMs = String(Date.now() + 95_000);
  document.body.append(s);
});
await page.waitForTimeout(1300);
const t1 = await page.$eval('#cd-test', (el) => el.textContent);
await page.waitForTimeout(1300);
const t2 = await page.$eval('#cd-test', (el) => el.textContent);
check('countdown format', /^\d+m \d{2}s$/.test(t1), t1);
check('countdown advances every second', t1 !== t2, `${t1} -> ${t2}`);

console.log('— URL state round-trip —');
await page.goto(`${BASE}/?q=diffusion&conference=ICML`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.querySelectorAll('#results .pf-result').length > 0, null, { timeout: 8000 });
check('deep link hydrates chips', (await page.$$eval('.kw-chip', (els) => els.length)) === 1);
check('deep link hydrates facet checkbox', await page.$eval('[data-facet="conference"] input[value="ICML"]', (el) => el.checked));

console.log('— browse order (filters only) vs relevance order (keywords) —');
// Browse = no keywords: open calls first, soonest deadline on top, papers
// index excluded (it has no sort keys and would interleave unsorted).
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.querySelector('[data-facet="conference"]')?.children.length >= 5, null, { timeout: 8000 });
await page.click('summary[data-facet-summary="conference"]');
await page.check('[data-facet="conference"] input[value="IROS"]');
await page.waitForFunction(() => document.querySelectorAll('#results .pf-result').length > 0, null, { timeout: 8000 });
const ordBrowseCount = await page.$eval('#searchCount', (el) => el.textContent);
check('browse count line says "open calls first"', /open calls first/.test(ordBrowseCount), ordBrowseCount);
const ordPills = await page.$$eval('#results .pf-result .pill', (els) => els.map((e) => e.textContent.trim()));
check('first browse result is an Open call', ordPills[0] === 'Open call', ordPills.slice(0, 3).join(','));
const ordLastOpen = ordPills.lastIndexOf('Open call');
check('open calls form a contiguous leading band', ordPills.slice(0, ordLastOpen + 1).every((p) => p === 'Open call'), ordPills.join(','));
const ordDues = await page.$$eval('#results .pf-result .result-meta', (els) =>
  els.map((e) => (e.textContent.match(/due (.+)$/) || [])[1]).filter(Boolean));
const ordDueMs = ordDues.map((d) => Date.parse(d.replace(' AoE (UTC−12)', ' UTC-12')));
check('open-call deadlines ascend', ordDueMs.every((v, i) => i === 0 || !(v < ordDueMs[i - 1])), ordDues.slice(0, 4).join(' | '));
check('due dates shown on open-call rows', ordDues.length >= 2, `got ${ordDues.length}`);
await page.uncheck('[data-facet="conference"] input[value="IROS"]');

// Keywords = relevance: count line says so; ordering is Pagefind's, not the bands.
await page.fill('#q', 'surgical robotics');
await page.waitForFunction(() => document.querySelectorAll('#results .pf-result').length > 0, null, { timeout: 8000 });
const ordKwCount = await page.$eval('#searchCount', (el) => el.textContent);
check('keyword count line says "by relevance"', /by relevance/.test(ordKwCount), ordKwCount);
const ordKwTitle = await page.$eval('#results .pf-result .pf-title', (el) => el.textContent);
check('top relevance hit matches the query topic', /surgical/i.test(ordKwTitle), ordKwTitle);
await page.fill('#q', '');

console.log('— deadline board pagination —');
await page.goto(BASE, { waitUntil: 'networkidle' });
const bRows = await page.$$eval('.board [data-ws-row]', (els) => els.length);
if (bRows > 25) {
  const expPages = Math.ceil(bRows / 25);
  check(`board pager rendered with ${expPages} pages`, (await page.$$('.board-pager button')).length === expPages);
  const vis1 = await page.$$eval('.board [data-ws-row]:not(.pg-off)', (els) => els.map((e) => e.dataset.search));
  check('board page 1 shows 25 rows', vis1.length === 25, String(vis1.length));
  await page.click('.board-pager button[data-page="2"]');
  const vis2 = await page.$$eval('.board [data-ws-row]:not(.pg-off)', (els) => els.map((e) => e.dataset.search));
  check('board page 2 swaps in different rows', vis2.length > 0 && vis2[0] !== vis1[0], `n=${vis2.length}`);
  check('board pager marks page 2 active', (await page.$eval('.board-pager button.is-on', (el) => el.dataset.page)) === '2');
  check('board page survives in URL as bpage', (await page.url()).includes('bpage=2'));
  await page.goto(`${BASE}/?bpage=2`, { waitUntil: 'networkidle' });
  check('deep link ?bpage=2 lands on page 2', (await page.$eval('.board-pager button.is-on', (el) => el.dataset.page)) === '2');
  await page.click('.board-pager button[data-page="1"]');
  check('returning to page 1 cleans the URL', !(await page.url()).includes('bpage'));
} else {
  check(`board has ${bRows} rows (≤25) — pager correctly absent`, (await page.$$('.board-pager')).length === 0);
}

console.log('— device-local favorites (star → /saved/ → unstar) —');
await page.goto(BASE, { waitUntil: 'networkidle' });
check('nav badge hidden when nothing saved', await page.$eval('#navSavedCount', (el) => el.hidden));
const firstStar = await page.$('.board [data-star-ws]');
if (firstStar) {
  const starredSlug = await firstStar.getAttribute('data-star-ws');
  await firstStar.click();
  check('star fills on click', (await firstStar.textContent()) === '★');
  check('aria-pressed flips true', (await firstStar.getAttribute('aria-pressed')) === 'true');
  check('nav badge shows 1', (await page.$eval('#navSavedCount', (el) => el.textContent)) === '1');

  // detail page: header Save button reflects board star; star one paper there or elsewhere
  await page.goto(`${BASE}/workshop/${starredSlug}/`, { waitUntil: 'networkidle' });
  check('detail Save button hydrates as saved', await page.$eval('[data-star-ws]', (el) => el.classList.contains('is-on')));

  // find any workshop page with papers and star the first paper
  const { readFileSync } = await import('node:fs');
  const { readdirSync } = await import('node:fs');
  const paperWs = readdirSync('site/dist/workshop').find((d) => {
    try { return readFileSync(`site/dist/workshop/${d}/index.html`, 'utf8').includes('data-star-paper'); } catch { return false; }
  });
  let paperTitle = null;
  if (paperWs) {
    await page.goto(`${BASE}/workshop/${paperWs}/`, { waitUntil: 'networkidle' });
    const pBtn = await page.$('[data-star-paper]');
    paperTitle = await pBtn.getAttribute('data-title');
    await pBtn.click();
    check('paper star fills on click', (await pBtn.textContent()) === '★');
    check('nav badge counts workshop + paper', (await page.$eval('#navSavedCount', (el) => el.textContent)) === '2');
  }

  // saved page: live workshop row + paper snapshot, both removable
  await page.goto(`${BASE}/saved/`, { waitUntil: 'networkidle' });
  await page.waitForSelector(`[data-saved-ws="${starredSlug}"]`, { timeout: 8000 });
  check('saved page lists the starred workshop', true);
  check('saved row carries a status pill', (await page.$(`[data-saved-ws="${starredSlug}"] .pill`)) !== null);
  if (paperWs) {
    const savedPaper = await page.$eval('.saved-papers li a, .saved-papers li', (el) => el.textContent.trim());
    check('saved page lists the starred paper by title', savedPaper.includes(paperTitle.slice(0, 30)), savedPaper);
    await page.click('.saved-papers li [data-star-paper]');
    await page.waitForSelector('#savedPaperList .empty-state', { timeout: 4000 });
    check('unstarring last paper shows the empty state', true);
  }
  await page.click(`[data-saved-ws="${starredSlug}"] [data-star-ws]`);
  await page.waitForSelector('#savedWsList .empty-state', { timeout: 4000 });
  check('unstarring last workshop shows the empty state', true);
  check('nav badge hides again at zero', await page.$eval('#navSavedCount', (el) => el.hidden));

  // persistence: re-star, reload, still starred
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.click('.board [data-star-ws]');
  await page.reload({ waitUntil: 'networkidle' });
  check('star survives a reload (localStorage)', await page.$eval('.board [data-star-ws]', (el) => el.classList.contains('is-on')));
  await page.click('.board [data-star-ws]'); // leave storage clean
} else {
  check('board empty — favorites flow skipped (no open calls to star)', true);
}

check('no page/console errors during the whole run', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
