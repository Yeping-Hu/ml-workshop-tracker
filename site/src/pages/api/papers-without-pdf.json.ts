/**
 * Forum ids of cached papers that have NO pdf_url (~8% of papers). Every
 * paper that does have one follows the exact pattern
 * `https://openreview.net/pdf?id=<forum id>` (verified across the full
 * cache), so the saved page derives PDF links from ids and uses this
 * (much smaller) negative list to suppress the link where no PDF exists —
 * instead of shipping a ~20k-entry id→pdf map.
 */
import type { APIRoute } from 'astro';
import { workshops, loadPaperCache } from '../../lib/data';

export const GET: APIRoute = () => {
  const ids = new Set<string>();
  for (const w of workshops) {
    for (const p of loadPaperCache(w.slug)?.papers ?? []) {
      if (!p.pdf_url) {
        const m = String(p.forum_url ?? '').match(/[?&]id=([^&#]+)/);
        if (m) ids.add(m[1]);
      }
    }
  }
  return new Response(JSON.stringify({ count: ids.size, ids: [...ids] }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
