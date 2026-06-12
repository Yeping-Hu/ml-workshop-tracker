#!/usr/bin/env python3
"""
Probe OpenReview for a conference's workshop presence and classify it.

  python3 probe_conference.py --prefix 'EMNLP/{year}/Workshop' [--prefix '...'] \
      [--years 2024,2025,2026] [--families]

Reports, per prefix pattern x year: top-level workshop venue count, deadline-
metadata coverage (human-written venue date lines, plus a sample of submission
invitations checked for machine-readable `duedate`s — discover_openreview.mjs
imports from both, expired invitations included), then samples public
accepted-paper availability for the strongest pattern, and prints a verdict:

  fully-hosted (CoRL-like)  - papers are public notes; full pipeline works
  review-only  (CVPR-like)  - deadlines/links import; papers live elsewhere
  absent                    - not on OpenReview; issue-form path only

Pure stdlib. Pacing sleeps included — do NOT remove them (the API 429s).
"""
import argparse, json, re, sys, time, urllib.parse, urllib.request

API = 'https://api2.openreview.net'
FAMILIES = """Known venue-id families (use as --prefix candidates):
  ICML.cc/{year}/Workshop                ML conferences hosting on OR
  ICLR.cc/{year}/Workshop
  NeurIPS.cc/{year}/Workshop
  IEEE.org/ICRA/{year}/Workshop          IEEE robotics pattern
  IEEE.org/IROS/{year}/Workshop
  thecvf.com/CVPR/{year}/Workshop        CVF vision pattern (review-only)
  robot-learning.org/CoRL/{year}/Workshop
  colmweb.org/COLM/{year}/Workshop
  EMNLP/{year}/Workshop                  bare prefix (no domain)
  aclweb.org/ACL/{year}/Workshop         ACL family
  AAAI.org/{year}/Workshop
  KDD.org/{year}/Workshop
  rl-conference.cc/RLC/{year}/Workshop
Tip: open any known workshop of the conference on openreview.net and read its
venue id — the pattern is everything before the workshop's own name."""


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'ai-workshop-tracker-probe/1.0'})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--prefix', action='append', default=[], help='pattern with {year}')
    ap.add_argument('--years', default=None, help='comma list; default: last, current, next')
    ap.add_argument('--families', action='store_true', help='print known patterns and exit')
    a = ap.parse_args()
    if a.families or not a.prefix:
        print(FAMILIES)
        return 0 if a.families else 1
    import datetime
    Y = datetime.datetime.now(datetime.timezone.utc).year
    years = [int(y) for y in (a.years.split(',') if a.years else [Y - 1, Y, Y + 1])]

    best, best_total = None, -1
    for pat in a.prefix:
        if '{year}' not in pat:
            print(f'! skipping "{pat}" — no {{year}} placeholder')
            continue
        total = 0
        for y in years:
            prefix = pat.replace('{year}', str(y))
            try:
                d = get(f'{API}/groups?prefix={urllib.parse.quote(prefix, safe="")}&limit=500')
            except Exception as e:
                print(f'{pat}  {y}: request failed ({e})')
                time.sleep(0.6)
                continue
            top = re.compile('^' + re.escape(prefix) + r'/[^/]+$')
            gs = [g for g in d.get('groups', []) if top.match(g['id'])]
            with_dl = sum(1 for g in gs if 'Deadline' in str(g.get('content', {})))
            # A blank date line often hides a machine-readable duedate on the
            # submission invitation; sample a few venues to estimate that too.
            no_dl = [g for g in gs if 'Deadline' not in str(g.get('content', {}))]
            inv_hits = sampled = 0
            for g in no_dl[:5]:
                sub = ((g.get('content', {}).get('submission_id') or {}).get('value')
                       or f"{g['id']}/-/Submission")
                try:
                    j = get(f'{API}/invitations?id={urllib.parse.quote(sub, safe="")}&expired=true')
                    if (j.get('invitations') or [{}])[0].get('duedate'):
                        inv_hits += 1
                except Exception:
                    pass
                sampled += 1
                time.sleep(0.6)
            inv_note = f' | {inv_hits}/{sampled} sampled invitations carry a duedate' if sampled else ''
            ex = next((str((g.get('content', {}).get('date') or {}).get('value', ''))[:60]
                       for g in gs if (g.get('content', {}).get('date') or {}).get('value')), '')
            print(f'{pat}  {y}: {len(gs)} venues | {with_dl} expose date lines{inv_note}'
                  + (f' | e.g. "{ex}"' if ex else ''))
            total += len(gs)
            time.sleep(0.6)
        if total > best_total:
            best, best_total = pat, total

    if best_total <= 0:
        print('\nVERDICT: absent — no top-level workshop venues found on OpenReview.')
        print('Path: add entries via the issue form with proceedings_url; no auto-discovery.')
        return 1

    # sample public papers on the most recent non-empty year of the best pattern
    print(f'\nSampling public papers for strongest pattern: {best}')
    sampled, nonzero = [], 0
    for y in sorted(years, reverse=True):
        prefix = best.replace('{year}', str(y))
        d = get(f'{API}/groups?prefix={urllib.parse.quote(prefix, safe="")}&limit=500')
        top = re.compile('^' + re.escape(prefix) + r'/[^/]+$')
        ids = [g['id'] for g in d.get('groups', []) if top.match(g['id'])]
        time.sleep(0.6)
        if not ids:
            continue
        for vid in ids[:4]:
            try:
                # NOTE: the response has NO 'count' field — use len(notes).
                n = len(get(f'{API}/notes?content.venueid={urllib.parse.quote(vid, safe="")}&limit=1000').get('notes', []))
            except Exception:
                n = -1
            sampled.append(f"{vid.split('/')[-1][:22]}={n}")
            if n > 0:
                nonzero += 1
            time.sleep(0.6)
        break
    print('  ' + ', '.join(sampled))
    verdict = 'fully-hosted (CoRL-like): papers import inline' if nonzero >= 2 else \
              'review-only (CVPR-like): deadlines + links import; papers live off-platform'
    print(f'\nVERDICT: {verdict}')
    print(f'\nWire it with (fill name/full-name/color/month):\n'
          f"  node scripts/add_conference.mjs --id <id> --name <NAME> \\\n"
          f"    --full-name \"<Full Name>\" --prefix '{best}' --color '#______' --month <1-12>")
    return 0


if __name__ == '__main__':
    sys.exit(main())
