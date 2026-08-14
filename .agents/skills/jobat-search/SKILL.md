---
name: jobat-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for jobs in Belgium or Flanders,
  find Belgian job listings, or look up a specific Jobat posting, even if they do
  not mention jobat.be explicitly. Jobat is one of the largest Flemish job boards,
  strong in marketing, management and office roles. Trigger phrases include:
  jobat, jobs belgië, vacatures vlaanderen, vacature zoeken, job zoeken belgië,
  werk zoeken vlaanderen, openstaande vacatures, ledige jobs, marketing vacature,
  managementvacature, job hasselt, job leuven, job antwerpen, job brussel,
  job gent, job limburg, vacatures vlaams-brabant, belgian jobs, jobs in belgium,
  job search belgium, find work flanders, dutch language job board.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/jobat-search/cli/src/cli.ts *)
---

# Jobat Search Skill

Search live job listings from **[Jobat.be](https://www.jobat.be)**, one of the largest
Flemish job boards. Strong coverage of marketing, management and office roles across
Belgium, in Dutch.

## ⚠️ Personal use only

Jobat sits behind **Cloudflare bot protection**: every direct request, plain `fetch`,
curl, even a request for the sitemap that jobat.be's own `robots.txt` advertises, comes
back HTTP 403. This CLI therefore does not fetch Jobat directly; it renders the public
pages through the `firecrawl` CLI.

Jobat's `robots.txt` does **not** disallow `/nl/jobs*`, so no path-level rule is being
broken. Their terms of service may still prohibit automated access; that has not been
reviewed. **Keep volume low, do not use this commercially or for bulk data collection,
and run it on your own responsibility.**

## Requirements

Unlike the other portal skills in this repo, this one is **not zero-dependency**. It
needs the `firecrawl` CLI installed, on `PATH`, and authenticated. Without it, every
command fails with an actionable error rather than silently returning nothing.

Because each request renders a real browser page, calls take **tens of seconds**, not
milliseconds. Budget accordingly and keep `--limit` low.

## When to use this skill

- Search Belgian/Flemish job openings by keyword
- Filter results by location or posting age
- Read the full description of a specific Jobat posting

## Commands

### Search job listings

```bash
bun run .agents/skills/jobat-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>`: keyword search (title, skill, role). Strongly recommended.
- `--location <text>` / `-l <text>`: **client-side filter.** Jobat's results page exposes
  no location parameter we could verify, so results are fetched first and filtered after.
  Matches on the posting's location field as a substring, e.g. `-l "Hasselt"`.
- `--jobage <days>`: **client-side filter.** Keep postings from the last N days. Postings
  whose date Jobat does not show are **kept**, not dropped, so real vacancies are never
  silently hidden.
- `--page <n>`: 1-indexed results page.
- `--limit <n>` / `-n <n>`: cap total results emitted (client-side).
- `--native`: attempt a direct fetch before falling back to firecrawl. Useful only if
  Jobat ever drops the Cloudflare block; today it always falls through.
- `--format json|table|plain`: default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/jobat-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

Accepts a full Jobat job URL, a bare numeric ID (e.g. `6102912`), or a `job_`-prefixed ID.
A bare ID is resolved via `/nl/jobs/job/job_<id>`, which has been verified to return the
same posting as the canonical slug URL.

## Usage examples

```bash
# Marketing director roles, readable table
bun run .agents/skills/jobat-search/cli/src/cli.ts search -q "marketing director" --format table

# Value proposition roles posted in the last 14 days
bun run .agents/skills/jobat-search/cli/src/cli.ts search -q "value proposition" --jobage 14 --format table

# Marketing managers near Hasselt
bun run .agents/skills/jobat-search/cli/src/cli.ts search -q "marketing manager" -l "Hasselt" --format table

# Five head-of-marketing roles as JSON, for scripting
bun run .agents/skills/jobat-search/cli/src/cli.ts search -q "head of marketing" -n 5 --format json

# Full description of one posting
bun run .agents/skills/jobat-search/cli/src/cli.ts detail 6102912 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default. Programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

Search results carry the standard portal-skill fields (`id`, `title`, `company`,
`location`, `date`, `url`) plus two Jobat-specific extras: `contractType`
(e.g. "Onbepaalde duur", "Interim optie vast") and `salary` when the employer published
a range. Missing values are `null`, never omitted.

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the
process exits with code `1`.

## Notes

- **Dates are relative on Jobat** ("Sinds vandaag", "Sinds 6 dagen") and are converted to
  absolute ISO dates at parse time. Postings with no date label at all get `date: null`
  rather than a guessed value. A meaningful share of listings have no date.
- **Dutch plurals are irregular** for date parsing: "weken" does not contain "week",
  "jaren" does not contain "jaar", "uren" does not contain "uur". The parser spells out
  both forms per unit. A regression test covers this.
- **Interim agencies dominate Jobat.** Many results come from Actief, Unique, Konvert,
  Bright Plus and similar. Expect duplicates of the same underlying vacancy under
  different agency names.
- **Title and description can disagree.** Agencies sometimes post a role under a generic
  title (a "Commercial Manager" description under a "Marketing Manager" title). That is
  Jobat's own content, not a parsing fault. Read the description before judging fit.
- **`detail` does not return company or location.** Those fields come from the search
  result; the detail page carries the description and apply link. They are present as
  `null` in the JSON so the shape stays stable.
- Parsing anchors and the endpoint contract live in `url-reference.md`. Start there if
  Jobat changes its markup.
