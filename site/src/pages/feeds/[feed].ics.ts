/**
 * Static .ics calendar feeds, generated at build time:
 *   /feeds/all.ics            every deadline
 *   /feeds/<conference>.ics   one conference
 *   /feeds/topic-<id>.ics     one topic
 *   /feeds/ws-<slug>.ics      a single workshop's deadline
 * Includes deadlines that are upcoming or passed within the last 30 days.
 */
import type { APIRoute } from 'astro';
import { workshops, conferences, topics, conferenceById } from '../../lib/data';
// @ts-ignore - shared plain-JS module at the repo root
import { buildIcs } from '../../../../lib/ics.mjs';

const WINDOW_MS = 30 * 86_400_000;
const NOW = Date.now();
const feedable = workshops.filter(
  (w) => w.deadlineUtcMs != null && w.deadlineUtcMs > NOW - WINDOW_MS && w.submission_deadline,
);

function toEvent(w: Record<string, any>) {
  const conf = conferenceById.get(w.conference);
  return {
    uid: `${w.slug}@ml-workshop-tracker`,
    dateYmd: String(w.submission_deadline).slice(0, 10),
    summary: `${w.acronym || w.name} deadline (${conf?.name ?? w.conference} ${w.year})`,
    description: `${w.name}\nDeadline: ${w.deadlineWallClock}${w.deadline_notes ? `\nNote: ${w.deadline_notes}` : ''}\n${w.website}`,
    url: w.website,
  };
}

const FEEDS: Record<string, { name: string; items: Record<string, any>[] }> = {
  all: { name: 'AI workshop deadlines — all', items: feedable },
};
for (const c of conferences) {
  const items = feedable.filter((w) => w.conference === c.id);
  if (items.length) FEEDS[c.id] = { name: `AI workshop deadlines — ${c.name}`, items };
}
for (const t of topics) {
  const items = feedable.filter((w) => (w.topics ?? []).includes(t.id));
  if (items.length) FEEDS[`topic-${t.id}`] = { name: `AI workshop deadlines — ${t.label}`, items };
}
for (const w of feedable) {
  FEEDS[`ws-${w.slug}`] = { name: `${w.acronym || w.name} (${w.year}) deadline`, items: [w] };
}

export function getStaticPaths() {
  return Object.keys(FEEDS).map((feed) => ({ params: { feed } }));
}

export const GET: APIRoute = ({ params }) => {
  const feed = FEEDS[params.feed as string];
  const body = buildIcs(feed.name, feed.items.map(toEvent), new Date());
  return new Response(body, {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8' },
  });
};
