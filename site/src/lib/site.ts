/** Site-wide constants. Override the repo URL with PUBLIC_REPO_URL in CI/.env. */
export const SITE_NAME = 'AI Workshop Tracker';
export const SITE_TAGLINE =
  'Workshop deadlines and accepted papers across major AI and robotics conferences.';
export const REPO_URL =
  import.meta.env.PUBLIC_REPO_URL || 'https://github.com/Yeping-Hu/ai-workshop-tracker';

/**
 * Calendar feeds & .ics links are paused until workshop dates are verified —
 * flip to true to re-enable. While false, feed URLs still resolve but contain
 * zero events, so existing subscribers' calendars clear out on their next
 * refresh instead of keeping possibly-wrong dates.
 */
export const CALENDAR_ENABLED = false;

/** Prefix an absolute path with the configured base (for GitHub project pages). */
const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
export const href = (p: string) => `${base}${p.startsWith('/') ? p : '/' + p}`;
