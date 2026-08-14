# Jobat.be endpoint and parsing reference

Everything below was verified live on 2026-08-04. This is the file to read first if
the CLI starts returning empty or garbled results.

## Access

| Check | Result |
|-------|--------|
| `robots.txt` on `/nl/jobs*` | **Allowed.** Disallow rules cover `/nl/artikels-zoeken*`, `*/secure/login*`, `*/myjobat/login*`, `/*.aspx*`, article archives, and query strings containing `joblanguage=`, `action=`, `Pref_Lang=`, `favorites=`. Nothing blocks the job-search paths. |
| Direct `fetch` / curl with browser headers | **HTTP 403** on every path, including `/` and the `sitemap.xml` that robots.txt itself advertises. Body is a Cloudflare "Attention Required" interstitial. |
| Via `firecrawl scrape` | **Works.** Renders in a real browser and returns markdown. |

The block is blanket anti-bot, not a path-level policy. Jobat's terms of service have
not been reviewed and may prohibit automated access regardless. The skill carries a
personal-use-only warning for that reason.

## Search endpoint

```
https://www.jobat.be/nl/jobs/results?keyword=<urlencoded keywords>
```

| Parameter | Status |
|-----------|--------|
| `keyword` | **Verified.** The only search parameter the CLI relies on. |
| `page` | **Sent but unverified.** Passed through as `&page=<n>` for `--page 2` and up. Pagination has not been confirmed against live output; treat page 2+ results with suspicion. |
| location | **None found.** No location parameter could be identified, so `--location` filters client-side after parsing. |
| posting age | **None found.** No recency parameter could be identified, so `--jobage` filters client-side. |

Results are rendered client-side. Firecrawl is called with `--wait-for 8000`; a shorter
wait returns the page chrome with no job cards, which is the failure mode to look for if
searches suddenly come back empty.

Other URL shapes seen on the site but **not** used by the CLI:
- `/nl/jobs/results/<keyword-slug>/<category-slug>` for faceted category browsing
- `/nl/jobs/<location-slug>` for location landing pages
- `/nl/jobs/bedrijven/<company-slug>/<companyId>` for company pages (this is what
  `companyUrl` points at)

## Search result structure (firecrawl markdown)

Each result is a level-2 heading whose text is a markdown link to the posting, followed
by a bullet list and an optional relative-date line:

```markdown
## [Marketing en sales coördinator](https://www.jobat.be/nl/jobs/marketing-en-sales-coordinator/job_6104454)

- [Unique Turnhout](https://www.jobat.be/nl/jobs/bedrijven/unique/63851)
- Turnhout
- Interim optie vast

Van **€ 2.700** tot **€ 3.800** per maand

Sinds **vandaag**
```

Parsing contract, implemented in `parseSearchMarkdown`:

| Field | Anchor |
|-------|--------|
| `id` | `/job_(\d+)` in the heading link |
| `title` | heading link text |
| `url` | heading link target, query string stripped |
| `company` | first bullet, link text if it is a link |
| `companyUrl` | first bullet, link target |
| `location` | second bullet |
| `contractType` | third bullet |
| `salary` | line matching `Van **…** tot **…** per <period>`, optional |
| `date` | `Sinds **<label>**`, converted from relative to ISO, optional |

The parser splits on `\n## ` and handles each chunk independently, so one malformed
entry cannot break the rest. Headings that do not link to a `/job_<id>` URL (category
links, site chrome) are skipped. Duplicate IDs within one response are dropped.

### Gotchas

- **Not every posting has a date.** `Sinds **…**` is absent on a meaningful share of
  entries. Those get `date: null` rather than a guessed value, and `--jobage` keeps them.
- **Dutch plurals break substring matching.** "weken" does not contain "week", "jaren"
  does not contain "jaar", "uren" does not contain "uur". `relativeToISO` spells out both
  forms per unit. There is a regression test for this; it caught a real bug.
- **Firecrawl backslash-escapes markdown punctuation.** A title containing a pipe arrives
  as `Manager \| Retail`. `plain()` unescapes before output.

## Detail endpoint

```
https://www.jobat.be/nl/jobs/<slug>/job_<id>
https://www.jobat.be/nl/jobs/job/job_<id>     # slugless form, verified equivalent
```

Both were fetched for job `6102912` and returned byte-identical descriptions, so a bare
numeric ID is safe to resolve through the slugless form.

The posting body starts at the level-2 heading immediately followed by
`### Functieomschrijving`, and typically continues through `### Profiel` and
`### Aanbod`. Everything before that heading is site chrome (navigation, category trees,
save-job modals) and is discarded.

Extraction stops at the first of these markers, which begin Jobat's own conversion
funnel rather than employer content:
- `Maak je Jobat profiel aan`
- `## Anderen bekeken ook`
- `## Solliciteer`
- `Job alert`

`detail` returns `company`, `location`, `date`, `contractType` and `salary` as `null`:
those anchors were not identified on the detail page and the values are already available
from the search result. The fields are present so the JSON shape stays stable.

## Content quality warnings

- Interim agencies (Actief, Unique, Konvert, Bright Plus, AGO, Synergie) account for a
  large share of listings. The same underlying vacancy often appears under several agency
  names with different IDs, which dedup on ID alone will not catch.
- Titles and descriptions sometimes disagree: job `6102912` is titled "Marketing Manager"
  but describes a Commercial Manager role. This is employer-supplied content, not a
  parsing fault.
