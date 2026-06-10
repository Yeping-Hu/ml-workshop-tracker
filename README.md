# ML Workshop Tracker

A static website that aggregates **ML conference workshop** information in one place:

- 📅 **Upcoming submission deadlines** for ICML, ICLR, and NeurIPS workshops — with live countdowns, AoE → local-time conversion, and subscribable `.ics` calendar feeds
- 🗂 **An archive of past workshops** with links to their sites and proceedings
- 📄 **Auto-generated accepted-paper listings** for OpenReview-hosted workshops, searchable alongside workshop metadata

Conference deadline trackers exist; *workshop* deadlines never had one. This fills that gap — built to cost **$0/month** and need almost no maintenance.

## How it works

```
GitHub repo (single source of truth)
 ├── data/workshops/*.yml      one YAML file per workshop edition (community-edited)
 ├── data/conferences.yml      conference metadata
 ├── data/topics.yml           controlled topic vocabulary
 ├── cache/openreview/*.json   committed paper-list caches (fetched monthly)
 ├── lib/                      shared date/AoE, data-loading, and ICS code
 ├── scripts/                  validation, OpenReview fetcher, automation helpers
 ├── site/                     Astro static site (reads ../data at build time)
 └── .github/workflows/        CI validation + scheduled automation
```

Key design decisions (all in service of zero cost / low maintenance):

- **No backend, no database.** The Git repo *is* the database; the site is fully static (Astro), searchable via a build-time [Pagefind](https://pagefind.app) index, hosted free on GitHub Pages or Cloudflare Pages.
- **Statuses are derived, never stored.** `upcoming` / `deadline_passed` / `past` are computed from dates at build time; a weekly scheduled rebuild keeps them fresh with zero commits.
- **Calendar feeds instead of email.** Static `.ics` feeds (all / per-conference / per-topic / per-workshop) with built-in 7-day and 1-day alarms replace any notification infrastructure.
- **OpenReview only, cached.** Paper lists are fetched from the OpenReview API by a monthly job into committed JSON; builds never touch the live API. Non-OpenReview workshops just link out — no scraping.
- **Contributors are validated by CI, not by you.** Schema + sanity checks comment on PRs with exactly what to fix; an issue form auto-converts to PRs for non-technical contributors.

## Quickstart (local)

Requires Node 20+.

```bash
npm ci                         # root deps (validation/scripts)
npm ci --prefix site           # site deps (Astro, Pagefind)

node scripts/validate.mjs      # validate all workshop data
npm run dev --prefix site      # dev server at localhost:4321 (search needs a full build)
npm run build --prefix site    # full build incl. search index -> site/dist
```

## Deploying (pick one)

### Option A — GitHub Pages (zero config beyond one click)

1. Push this repo to GitHub.
2. Repo **Settings → Pages → Source: "GitHub Actions"**.
3. Done. `.github/workflows/deploy.yml` builds on every push to `main`, weekly, and on demand. The site appears at `https://<owner>.github.io/<repo>/`.

Using a custom domain or an `<owner>.github.io` repo? In `deploy.yml`, set `SITE_URL` to your domain and `SITE_BASE` to `/`.

### Option B — Cloudflare Pages (unlimited bandwidth, also free)

1. Cloudflare dashboard → Workers & Pages → **Create → Pages → Connect to Git**.
2. Build settings:
   - **Build command:** `npm ci && npm ci --prefix site && npm run build --prefix site`
   - **Build output directory:** `site/dist`
   - **Environment variables:** `SITE_URL=https://<your-project>.pages.dev` (and `PUBLIC_REPO_URL=https://github.com/<you>/<repo>`)
3. Optionally delete `deploy.yml` (Cloudflare builds on push by itself) — but keep the weekly rebuild by leaving it and pointing it at Cloudflare's [deploy hook](https://developers.cloudflare.com/pages/configuration/deploy-hooks/), or simply keep GitHub Pages as a mirror.

### Environment variables

| Var | Used by | Meaning | Default |
|---|---|---|---|
| `SITE_URL` | site build | Canonical origin (sitemap, RSS, OG tags) | `https://ml-workshop-tracker.pages.dev` |
| `SITE_BASE` | site build | Path prefix for GitHub *project* pages | `/` |
| `PUBLIC_REPO_URL` | site build | "Edit"/"Add a workshop" links | placeholder — **set this** |

## Automation reference

| Workflow | Trigger | What it does |
|---|---|---|
| `validate.yml` | PRs & pushes touching data | Schema + sanity checks; comments fixes on the PR |
| `deploy.yml` | push to `main`, weekly, manual | Build & deploy (weekly run refreshes derived statuses) |
| `openreview-refresh.yml` | monthly | Re-fetch paper caches for recent years → auto-PR on diff |
| `issue-to-pr.yml` | "Add a workshop" issue form | Converts the form to a YAML file + PR, validates, reports back |
| `stale-check.yml` | weekly | One consolidated issue listing entries needing follow-up |
| `link-check.yml` | monthly | One consolidated issue listing broken URLs |

The maintainer's whole job: review PRs and skim two auto-updated "Data health" issues. (~1–2 h/week in deadline season, ~0 otherwise.)

## Adding / fixing workshops

See [CONTRIBUTING.md](CONTRIBUTING.md). Short version: use the **"Add a workshop" issue form** (no Git needed — a bot opens the PR), or copy `data/workshops/_template.yml` and open a PR yourself. Every page on the site has a ✎ Edit link.

> **Note on the included seed data:** the 10 entries in `data/workshops/` exist so the site renders meaningfully out of the box. Past-workshop entries were seeded from real OpenReview venue records (papers included), but **deadlines and 2026 editions are estimates marked `SEED DATA — verify`**. Verify or replace them before launching publicly.

## Data & API

- Machine-readable dump: `/api/workshops.json` (regenerated on every deploy)
- New-workshop announcements: `/rss.xml`
- Calendar feeds: `/feeds/all.ics`, `/feeds/<conference>.ics`, `/feeds/topic-<id>.ics`, `/feeds/ws-<slug>.ics`

## Licensing

- **Code:** MIT (see `LICENSE`)
- **Data** (`data/`, `cache/`): [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/) — reuse freely with attribution

## Scope (deliberately) excluded

No accounts, no backend, no email alerts, no scraping of non-OpenReview portals, no LLM pipelines, no PDF rehosting. These are the things that make trackers expensive to run and easy to abandon.
