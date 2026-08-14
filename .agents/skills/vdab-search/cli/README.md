# vdab-cli

CLI for searching jobs on [VDAB Vind een job](https://www.vdab.be/vindeenjob), the
Flemish public employment service's job bank and the broadest vacancy source in Flanders.

## Requirements

- `bun` for `search`. Zero runtime dependencies.
- the **`firecrawl` CLI**, installed and authenticated, for `detail` only.

VDAB's results pages are server-rendered and answer a plain fetch. Its vacancy pages are
an Angular shell whose content loads client-side, so `detail` renders through firecrawl.
The JSON API behind that shell is disallowed in VDAB's robots.txt and is deliberately
never called; see `../url-reference.md`.

Without firecrawl, `search` still works completely, snippet included.

## Install

```bash
bun install        # dev types only
bun run typecheck
```

## Usage

```bash
bun run src/cli.ts search -q "marketing director" --format table
bun run src/cli.ts search -q "marketing manager" -l "Hasselt" --jobage 14 --format table
bun run src/cli.ts detail 73946345 --format plain
```

Run without arguments for the full flag reference.

The search is **path-based**: your query becomes the URL slug, so `-q` is the search
rather than a filter on it. `--location` and `--jobage` are applied client-side after
parsing, and postings whose date could not be resolved are kept rather than dropped.

`detail` returns more than prose. Alongside the description it gives `contract`,
`education` and `experience` as arrays, taken from VDAB's own labelled sections. Those
are the most directly usable fit-assessment inputs of any Belgian board.

## Expect noise

VDAB matches keywords loosely across its occupation taxonomy. A search for "marketing
director" returns technical draughtsmen and IT programme managers alongside real
matches. That is the portal, not the parser. Filter on top of these results; do not treat
them as a shortlist.

## Tests

```bash
bun test
```

- `parsing.test.ts` runs offline against fixtures for both the results page and the
  rendered detail page. It pins down the two real bugs this portal produced: VDAB's
  unsubstituted `{trefwoordparam}` templating tokens leaking into URLs, and the detail
  page's two level-1 headings where the first is site chrome.
- `cli-flag-validation.test.ts` covers the error contract and carries a live smoke test
  over the plain-fetch path. Fast, no firecrawl needed.

## Personal use only

Keep volume low, no commercial or bulk data collection, own responsibility.

## Maintenance

`../url-reference.md` documents the endpoints, the robots.txt nuance, every parsing
anchor and the known content gotchas. Start there when VDAB changes its markup.
