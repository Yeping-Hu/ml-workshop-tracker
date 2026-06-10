/**
 * Loads and resolves all repository data (workshops, conferences, topics,
 * cached paper lists). Used by the Astro site at build time and by every
 * script. The repo root is derived from this file's location, so it works
 * from any working directory.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import {
  resolveDeadlineUtcMs,
  parseDateUtcMs,
  computeStatus,
  formatDeadlineWallClock,
  formatDateYmd,
} from './dates.mjs';

/**
 * Locate the repo root by walking upward until `data/workshops` is found.
 * (A plain `../` from this file breaks once a bundler relocates the module,
 * e.g. into the Astro build output.) Override with env REPO_ROOT if needed.
 */
function findRepoRoot() {
  const starts = [
    process.env.REPO_ROOT,
    path.dirname(fileURLToPath(import.meta.url)),
    process.cwd(),
  ].filter(Boolean);
  for (const start of starts) {
    let dir = path.resolve(start);
    for (let i = 0; i < 10; i++) {
      if (fs.existsSync(path.join(dir, 'data', 'workshops'))) return dir;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  throw new Error('ai-workshop-tracker: could not locate the repo root (no data/workshops directory found).');
}
export const REPO_ROOT = findRepoRoot();
export const WORKSHOPS_DIR = path.join(REPO_ROOT, 'data', 'workshops');
export const CACHE_DIR = path.join(REPO_ROOT, 'cache', 'openreview');

export function loadConferences() {
  const raw = yaml.load(fs.readFileSync(path.join(REPO_ROOT, 'data', 'conferences.yml'), 'utf8'));
  return Array.isArray(raw) ? raw : [];
}

export function loadTopics() {
  const raw = yaml.load(fs.readFileSync(path.join(REPO_ROOT, 'data', 'topics.yml'), 'utf8'));
  return Array.isArray(raw) ? raw : [];
}

/** List workshop YAML files (absolute paths), excluding the template. */
export function listWorkshopFiles() {
  return fs
    .readdirSync(WORKSHOPS_DIR)
    .filter((f) => (f.endsWith('.yml') || f.endsWith('.yaml')) && !f.startsWith('_'))
    .sort()
    .map((f) => path.join(WORKSHOPS_DIR, f));
}

/** Parse one workshop file without resolving derived fields. Throws on YAML errors. */
export function readWorkshopFile(filePath) {
  const raw = yaml.load(fs.readFileSync(filePath, 'utf8'));
  const slug = path.basename(filePath).replace(/\.ya?ml$/, '');
  return { slug, file: path.relative(REPO_ROOT, filePath), raw };
}

/**
 * Resolve one raw workshop record into the shape the site renders.
 * `confMonths` maps conference id -> typical month (1-12); when a workshop has
 * no explicit workshop_date, the end of that month is used as a coarse
 * fallback so e.g. an April conference's workshops turn "past" in June.
 */
export function resolveWorkshop({ slug, file, raw }, nowMs = Date.now(), confMonths = {}) {
  const deadlineUtcMs = raw.submission_deadline
    ? resolveDeadlineUtcMs(raw.submission_deadline, raw.timezone || 'AoE')
    : null;
  let workshopDateUtcMs = raw.workshop_date ? parseDateUtcMs(raw.workshop_date) : null;
  if (workshopDateUtcMs == null && confMonths[raw.conference]) {
    // Last day of the conference's typical month (month index = typical_month -> day 0 of next).
    workshopDateUtcMs = Date.UTC(raw.year, confMonths[raw.conference], 0);
  }
  const status = computeStatus({ deadlineUtcMs, workshopDateUtcMs, year: raw.year }, nowMs);
  return {
    ...raw,
    slug,
    file,
    timezone: raw.timezone || (raw.submission_deadline ? 'AoE' : undefined),
    deadlineUtcMs,
    deadlineIso: deadlineUtcMs != null ? new Date(deadlineUtcMs).toISOString() : null,
    deadlineWallClock: raw.submission_deadline
      ? formatDeadlineWallClock(raw.submission_deadline, raw.timezone || 'AoE')
      : null,
    workshopDateUtcMs,
    workshopDateLabel: raw.workshop_date ? formatDateYmd(raw.workshop_date) : null,
    notificationDateLabel: raw.notification_date ? formatDateYmd(raw.notification_date) : null,
    status,
  };
}

/** Load every workshop, resolved. Invalid YAML throws (CI catches it first). */
export function loadWorkshops(nowMs = Date.now()) {
  const confMonths = Object.fromEntries(
    loadConferences().filter((c) => c.typical_month).map((c) => [c.id, c.typical_month]),
  );
  return listWorkshopFiles().map((f) => {
    const w = resolveWorkshop(readWorkshopFile(f), nowMs, confMonths);
    const cache = loadPaperCache(w.slug);
    w.paperCount = cache?.paper_count ?? 0;
    // Accepted papers prove the call closed — even when the venue never
    // published its deadline metadata (so we couldn't compute it).
    if (w.status === 'upcoming' && w.deadlineUtcMs == null && w.paperCount > 0) {
      w.status = 'deadline_passed';
    }
    w.statusLabel =
      w.status === 'past' ? 'Past'
      : w.status === 'deadline_passed' ? 'Deadline passed'
      : w.deadlineUtcMs == null ? 'Deadline unknown'
      : 'Open call';
    return w;
  });
}

/** Sort: upcoming by soonest deadline (TBA last), others by year desc then name. */
export function sortByDeadline(workshops) {
  return [...workshops].sort((a, b) => {
    const da = a.deadlineUtcMs ?? Number.POSITIVE_INFINITY;
    const db = b.deadlineUtcMs ?? Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    return (a.name || '').localeCompare(b.name || '');
  });
}

/** Load the cached OpenReview paper list for a workshop slug, or null. */
export function loadPaperCache(slug) {
  const p = path.join(CACHE_DIR, `${slug}.json`);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

/** Load workshop *proposal* calls (data/proposal_calls.yml), resolved. */
export function loadProposalCalls(nowMs = Date.now()) {
  const p = path.join(REPO_ROOT, 'data', 'proposal_calls.yml');
  if (!fs.existsSync(p)) return [];
  const raw = yaml.load(fs.readFileSync(p, 'utf8'));
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c) => {
      const deadlineUtcMs = c.proposal_deadline
        ? resolveDeadlineUtcMs(c.proposal_deadline, c.timezone || 'AoE')
        : null;
      return {
        ...c,
        deadlineUtcMs,
        deadlineWallClock: c.proposal_deadline
          ? formatDeadlineWallClock(c.proposal_deadline, c.timezone || 'AoE')
          : null,
        open: deadlineUtcMs != null && deadlineUtcMs > nowMs,
      };
    })
    .sort((a, b) => (b.deadlineUtcMs ?? 0) - (a.deadlineUtcMs ?? 0));
}
