# jobat-cli

CLI for searching jobs on [Jobat.be](https://www.jobat.be), one of the largest Flemish
job boards.

## Requirements

- `bun`
- the **`firecrawl` CLI**, installed, on `PATH`, and authenticated

This is the one portal skill in this repo that is not zero-dependency. Jobat returns
HTTP 403 to every direct request (Cloudflare bot protection), including requests for the
sitemap its own `robots.txt` advertises, so there is no plain-`fetch` path to its pages.
The CLI shells out to `firecrawl`, which renders the page in a real browser.

Consequence: every call takes tens of seconds and consumes firecrawl credits. Keep
`--limit` low and do not loop over pages.

## Install

```bash
bun install        # dev types only; there are no runtime dependencies
bun run typecheck
```

## Usage

```bash
bun run src/cli.ts search -q "marketing director" --format table
bun run src/cli.ts search -q "marketing manager" -l "Hasselt" --jobage 14 --format table
bun run src/cli.ts detail 6102912 --format plain
```

Run without arguments for the full flag reference.

`--location` and `--jobage` are **client-side filters**: Jobat's results page exposes no
verified parameter for either, so results are fetched first and filtered after. Postings
whose date Jobat does not publish are kept rather than dropped, so `--jobage` never
silently hides a real vacancy.

## Tests

```bash
bun test
```

The suite is three files:

- `parsing.test.ts` runs offline against a captured markdown fixture and covers the
  parsers, the relative-to-absolute date conversion, ID normalisation and URL building.
- `cli-flag-validation.test.ts` checks the error contract: bad flags and bad IDs exit 1
  with JSON on stderr, before any network call.
- `search.test.ts` is a **live** smoke test. It hits Jobat through firecrawl, so it is
  slow and needs firecrawl authenticated. It runs a single query by design.

## Personal use only

Jobat's `robots.txt` permits `/nl/jobs*`, but their terms of service may prohibit
automated access regardless; that has not been reviewed. Keep volume low, no commercial
or bulk data collection, own responsibility.

## Maintenance

Parsing anchors, the endpoint contract and the known content gotchas are documented in
`../url-reference.md`. Start there when Jobat changes its markup.

The most likely failure mode is a search that returns zero results while the site works
in a browser: that usually means the page needed longer to render than the 8 second
`--wait-for`, not that the parser broke.
