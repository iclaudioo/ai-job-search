---
name: vdab-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for jobs in Flanders or Belgium,
  find Flemish vacancies, or look up a specific VDAB posting, even if they do not
  mention vdab.be explicitly. VDAB is the Flemish public employment service and runs
  the largest job bank in Flanders. Trigger phrases include: vdab, vind een job,
  vacatures vlaanderen, vacature zoeken, job zoeken, werk zoeken, openstaande
  vacatures, ledige betrekkingen, vaste job, interimjob, knelpuntberoep,
  job limburg, job hasselt, job genk, job leuven, job antwerpen, job gent,
  job brugge, job vlaams-brabant, vacatures oost-vlaanderen, flemish jobs,
  jobs in flanders, job search belgium, public employment service belgium.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/vdab-search/cli/src/cli.ts *)
---

# VDAB Search Skill

Search live job listings from **[VDAB Vind een job](https://www.vdab.be/vindeenjob)**,
the Flemish public employment service's job bank and the broadest source of vacancies
in Flanders.

## ⚠️ Personal use only

Search reads VDAB's public, server-rendered results pages. Their `robots.txt` does not
disallow those paths. Keep volume low, no commercial or bulk data collection, own
responsibility.

**One access nuance worth knowing.** VDAB's `robots.txt` disallows `/api/vindeenjob/`,
the JSON endpoint their own front end calls. This CLI never requests that endpoint. It
fetches the two public HTML pages, `/vindeenjob/jobs/<slug>` and
`/vindeenjob/vacatures/<id>`, neither of which is disallowed. The detail page loads its
content client-side, so it is rendered the way a browser renders it rather than by
calling the API directly.

## Two access paths, one contract

| Command | How it fetches | Needs firecrawl |
|---------|----------------|-----------------|
| `search` | plain `fetch`, zero runtime dependencies | no |
| `detail` | rendered through the `firecrawl` CLI | **yes** |

Without firecrawl, `search` still works completely, and every result carries a
description snippet.

## Commands

### Search job listings

```bash
bun run .agents/skills/vdab-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>`: keywords. VDAB's search is path-based, so the query
  becomes the URL slug. This is the search; without it you get the unfiltered list.
- `--location <text>` / `-l <text>`: **client-side filter**, substring match on the city.
- `--jobage <days>`: **client-side filter**. Postings whose date could not be resolved
  are kept, not dropped.
- `--limit <n>` / `-n <n>`: cap results emitted.
- `--format json|table|plain`: default `json`.

The JSON `meta` block reports `totalMatches` (VDAB's own count for the query) next to
`returnedByPortal` (how many arrived on this page), so truncation is visible.

### Fetch full job detail

```bash
bun run .agents/skills/vdab-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

Accepts a full vacancy URL or a bare numeric ID. Unlike StepStone, VDAB's slugless URL
`/vindeenjob/vacatures/<id>` is canonical and resolves on its own.

VDAB's detail pages are the richest of the Belgian boards. On top of the description,
`detail` returns three structured arrays that map directly onto a fit assessment:

| Field | Example |
|-------|---------|
| `contract` | `["Vaste job", "Voltijds", "Dagwerk", "Contract van onbepaalde duur"]` |
| `education` | `["Professionele bachelor"]` |
| `experience` | `["Minstens 2 jaar ervaring"]` |

## Usage examples

```bash
# Marketing director roles, readable table
bun run .agents/skills/vdab-search/cli/src/cli.ts search -q "marketing director" --format table

# B2B marketing managers from the last 14 days
bun run .agents/skills/vdab-search/cli/src/cli.ts search -q "marketing manager b2b" --jobage 14 --format table

# Marketing managers near Hasselt
bun run .agents/skills/vdab-search/cli/src/cli.ts search -q "marketing manager" -l "Hasselt" --format table

# Five head-of-marketing roles as JSON, for scripting
bun run .agents/skills/vdab-search/cli/src/cli.ts search -q "head of marketing" -n 5 --format json

# Full posting, including contract, studies and experience requirements
bun run .agents/skills/vdab-search/cli/src/cli.ts detail 73946345 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default. Programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

Search results carry the standard portal-skill fields (`id`, `title`, `company`,
`location`, `date`, `url`) plus `contractType` and `snippet`. Missing values are `null`,
never omitted.

Errors go to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Notes

- **VDAB's keyword matching is very broad.** A search for "marketing director" returns
  draughtsmen, IT programme managers and sales directors alongside real matches. This is
  the portal's behaviour, not a parsing fault. Expect to filter hard, and treat the
  result count as a starting point rather than a shortlist.
- **Interim and recruitment agencies dominate** the senior end of the listings (Michael
  Page, Motmans, Accent, Vivaldis, Actief). The same vacancy often appears under several
  agency names with different IDs.
- **Dates are absolute**, unlike Jobat and StepStone: "Online sinds 15 jun. 2026" is
  parsed to `2026-06-15`. An unrecognised month yields `null` rather than a guess.
- **VDAB ships unsubstituted templating tokens** in its result links
  (`?trefwoord={trefwoordparam}`, `{0} jobs voor ...`). The parser always discards the
  query string and keeps the canonical path.
- **The detail page has two level-1 headings**: VDAB's own "Vind een job" site header
  comes first, the vacancy title second. The parser takes the last one. A regression
  test pins this down.
- Parsing anchors and the endpoint contract live in `url-reference.md`. Start there if
  VDAB changes its markup.
