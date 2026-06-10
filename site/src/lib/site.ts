/** Site-wide constants. Override the repo URL with PUBLIC_REPO_URL in CI/.env. */
export const SITE_NAME = 'ML Workshop Tracker';
export const SITE_TAGLINE =
  'Submission deadlines and accepted papers for ICML, ICLR, and NeurIPS workshops.';
export const REPO_URL =
  import.meta.env.PUBLIC_REPO_URL || 'https://github.com/your-username/ml-workshop-tracker';

/** Prefix an absolute path with the configured base (for GitHub project pages). */
const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
export const href = (p: string) => `${base}${p.startsWith('/') ? p : '/' + p}`;
