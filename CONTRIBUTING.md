# Contributing

Thanks for helping keep workshop data accurate! There are three ways to contribute, from easiest to most hands-on.

## 1. The 2-minute form (no Git needed)

Open the **["Add a workshop" issue form](../../issues/new?template=add-workshop.yml)** and fill in what you know. A bot converts your answers into a data file, validates it, opens a pull request, and replies on the issue with the result. If validation fails, just edit the issue — the bot retries automatically.

## 2. Edit on GitHub

Every workshop page and board row on the site has a **✎ Edit** link straight to its YAML file. Fix the field, propose the change, done — CI validates it and a maintainer merges.

## 3. Full pull request

```bash
cp data/workshops/_template.yml data/workshops/<conference>-<year>-<short-name>.yml
# fill it in, then:
npm ci && node scripts/validate.mjs
```

The filename **must** start with `<conference>-<year>-` (e.g. `neurips-2026-math-ai.yml`) and use only lowercase letters, digits, and hyphens.

## Field reference

One YAML file per workshop **edition** (same series ⇒ new file each year).

| Field | Required | Format / notes |
|---|---|---|
| `name` | ✅ | Full official name |
| `acronym` |  | Short name; `""` if none |
| `conference` | ✅ | An id from `data/conferences.yml` (`icml`, `iclr`, `neurips`) |
| `year` | ✅ | Integer |
| `website` | ✅ | Full `http(s)` URL |
| `topics` | ✅ | 1–5 ids from `data/topics.yml` |
| `submission_deadline` |  | `YYYY-MM-DD HH:MM` or `YYYY-MM-DD` (means 23:59) — **wall-clock time in `timezone`** |
| `timezone` |  | `AoE` (default, = UTC−12), `UTC`, or an IANA name like `America/Los_Angeles` |
| `deadline_notes` |  | e.g. `"extended from Aug 15"` |
| `notification_date` |  | `YYYY-MM-DD` |
| `workshop_date` |  | `YYYY-MM-DD` |
| `openreview_venue_id` |  | e.g. `NeurIPS.cc/2026/Workshop/MATH-AI` — enables the automatic paper list |
| `proceedings_url` |  | Accepted-papers page for non-OpenReview workshops |
| `submission_portal` |  | `openreview` \| `cmt` \| `email` \| `other` \| `unknown` |
| `organizers` |  | List of names |
| `previous_editions` |  | List of `{ year, website, proceedings_url }` |
| `notes` |  | Free text |
| `added` |  | `YYYY-MM-DD` — feeds the "new workshops" RSS |

**Never add a `status` field** — upcoming/passed/past is computed from the dates at build time.

## What CI checks

`node scripts/validate.mjs` (also run on every PR) enforces:

- JSON Schema (`schema/workshop.schema.json`) — types, required fields, URL/date formats, no unknown fields
- `conference` and every `topics` id exist in their vocabulary files
- Filename matches `conference` + `year`
- Deadline parses, is within ±2 years of today, and precedes `workshop_date`
- No duplicate entries (same conference + year + near-identical name)

Failures are posted as a PR comment listing every problem at once.

## Paper lists

Don't paste papers by hand. Set `openreview_venue_id` and the monthly `openreview-refresh` workflow fetches the accepted papers into `cache/openreview/<slug>.json` (a maintainer can also run `node scripts/fetch_openreview.mjs --slug <slug>` immediately). For workshops elsewhere, set `proceedings_url`.

## For maintainers

- **Review queue:** PRs from contributors and from the two bots (`issue-to-pr`, `openreview-refresh`). CI has already validated data PRs — skim and merge.
- **Health issues:** two auto-maintained issues labelled `data-health` (stale entries, broken links). They update in place and close themselves when clean.
- **Seed data:** entries whose `notes` contain `SEED DATA` are unverified placeholders from the initial build — verify or replace them.
- Data is licensed CC-BY-4.0; by contributing you agree your additions are too.
