---
name: stepstone-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for jobs in Belgium, find Belgian
  vacancies, or look up a specific StepStone Belgium posting, even if they do not
  mention stepstone.be explicitly. StepStone is the strongest Belgian board for senior
  and management roles. Trigger phrases include: stepstone, vacatures belgië,
  jobs belgium, senior vacature, managementvacature, directiefunctie, kaderfunctie,
  marketing director vacature, head of marketing belgië, job zoeken belgië,
  werk zoeken vlaanderen, offres emploi belgique, emploi cadre, job brussel,
  job antwerpen, job gent, job leuven, job hasselt, belgian job board,
  job search belgium, executive jobs belgium.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/stepstone-search/cli/src/cli.ts *)
---

# StepStone Belgium Search Skill

Search live job listings from **[StepStone.be](https://www.stepstone.be)**. Of the
Belgian boards, this one carries the highest share of senior, management and
director-level vacancies.

## ⚠️ Personal use only

Search runs over StepStone's public results page with no authentication. Their
`robots.txt` explicitly permits it (see below). Their terms of service may still
restrict automated access; that has not been reviewed. Keep volume low, no commercial
or bulk data collection, own responsibility.

## Two access paths, one contract

| Command | How it fetches | Needs firecrawl |
|---------|----------------|-----------------|
| `search` | plain `fetch`, zero runtime dependencies | no |
| `detail` | rendered through the `firecrawl` CLI | **yes** |

StepStone's posting pages sit behind a bot manager that answers every direct request
with HTTP 403 and a roughly 440 KB challenge page. The results page does not. So
`search` is fast and free, and `detail` costs a browser render and takes seconds.

If firecrawl is unavailable, `search` still works completely. Each result carries a
description snippet of roughly 300 characters, which is often enough to judge fit
without opening the posting.

## Commands

### Search job listings

```bash
bun run .agents/skills/stepstone-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>`: keyword search. Strongly recommended.
- `--location <text>` / `-l <text>`: **client-side filter**, substring match on the
  posting's location.
- `--jobage <days>`: **client-side filter**. Postings whose date could not be resolved
  are kept, not dropped.
- `--limit <n>` / `-n <n>`: cap results emitted.
- `--format json|table|plain`: default `json`.

**There is no `--page` flag, deliberately.** StepStone's `robots.txt` allows
`/vacatures/*?q=*` but disallows `q` combined with any other parameter
(`/vacatures/*?q=*&*`), and pagination needs one. Passing `--page` exits 1 with
`PAGINATION_UNSUPPORTED` rather than quietly breaking the rule. One request returns
roughly 25 cards; narrow the query instead of paging.

The JSON `meta` block reports `totalMatches` (how many results StepStone claims for the
query) next to `returnedByPortal` (how many arrived in this single page), so a truncated
result set is visible rather than silent.

### Fetch full job detail

```bash
bun run .agents/skills/stepstone-search/cli/src/cli.ts detail <url> [--format json|plain]
```

**Requires the full posting URL**, which is the `url` field of any search result. A bare
numeric ID is rejected with `NEEDS_FULL_URL`: the slugless form
`/vacatures--<id>-inline.html` was verified to return StepStone's own 403 page rather
than the posting, so constructing it would fail silently.

## Usage examples

```bash
# Marketing director roles, readable table
bun run .agents/skills/stepstone-search/cli/src/cli.ts search -q "marketing director" --format table

# Value proposition roles from the last 14 days
bun run .agents/skills/stepstone-search/cli/src/cli.ts search -q "value proposition" --jobage 14 --format table

# Head of marketing roles around Antwerp
bun run .agents/skills/stepstone-search/cli/src/cli.ts search -q "head of marketing" -l "Antwerpen" --format table

# Five product marketing roles as JSON, for scripting
bun run .agents/skills/stepstone-search/cli/src/cli.ts search -q "product marketing" -n 5 --format json

# Full description of one posting
bun run .agents/skills/stepstone-search/cli/src/cli.ts detail "https://www.stepstone.be/vacatures--Marketing-Manager-Antwerpen-Dixon-Sales-Marketing--2229955-inline.html" --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default. Programmatic use, and the source of the `url` needed by `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

Search results carry the standard portal-skill fields (`id`, `title`, `company`,
`location`, `date`, `url`) plus `snippet`. Missing values are `null`, never omitted.

All errors go to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.
Error codes: `SEARCH_FAILED`, `DETAIL_FAILED`, `BAD_ARG`, `BAD_CMD`, `NO_ID`, `BAD_ID`,
`NEEDS_FULL_URL`, `PAGINATION_UNSUPPORTED`, `BLOCKED`, `NOT_FOUND`.

## Notes

- **The markup is hostile to naive parsing.** StepStone inlines an emotion-css `<style>`
  block before nearly every element and uses inline `<svg>` icons that carry the *same*
  `data-at` value as the text span next to them. The parser strips styles and svgs first,
  then walks every occurrence of an anchor and takes the first that yields real text.
  Tests cover both traps.
- **Dates are relative** ("4 dagen geleden") and are converted to ISO at parse time.
  Dutch plurals are irregular: "weken" does not contain "week", "uren" does not contain
  "uur", "jaren" does not contain "jaar". Both forms are spelled out per unit.
- **Error pages arrive with HTTP 200** through the renderer, so `detail` inspects the
  content for StepStone's "toegang geweigerd" text and reports `BLOCKED` rather than
  returning a description that is really an error page.
- **Recruitment agencies are heavily represented** (Michael Page, Robert Half, Hays,
  Sander, Bright Plus). Expect the same underlying vacancy under several agency names.
- Parsing anchors and the endpoint contract live in `url-reference.md`. Start there if
  StepStone changes its markup.
