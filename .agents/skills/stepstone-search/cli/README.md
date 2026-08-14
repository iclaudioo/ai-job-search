# stepstone-cli

CLI for searching jobs on [StepStone Belgium](https://www.stepstone.be), the strongest
Belgian board for senior and management roles.

## Requirements

- `bun` for `search`. Zero runtime dependencies.
- the **`firecrawl` CLI**, installed and authenticated, for `detail` only.

StepStone's results page answers a plain fetch. Its posting pages do not: they sit behind
a bot manager that returns HTTP 403 with a challenge page. `detail` therefore renders
through firecrawl and costs seconds per call, while `search` stays fast and free.

Without firecrawl, `search` still works completely. Every result carries a description
snippet of roughly 300 characters.

## Install

```bash
bun install        # dev types only
bun run typecheck
```

## Usage

```bash
bun run src/cli.ts search -q "marketing director" --format table
bun run src/cli.ts search -q "head of marketing" -l "Antwerpen" --jobage 14 --format table
bun run src/cli.ts detail "https://www.stepstone.be/vacatures--Marketing-Manager-Antwerpen-Dixon-Sales-Marketing--2229955-inline.html" --format plain
```

Run without arguments for the full flag reference.

Two behaviours worth knowing before you script against this:

- **No pagination.** StepStone's robots.txt permits `/vacatures/*?q=*` but forbids `q`
  combined with any other parameter, and paging needs one. `--page` exits 1 with
  `PAGINATION_UNSUPPORTED`. One request yields roughly 25 cards; narrow the query.
- **`detail` needs the full URL**, not a bare ID. Use the `url` field from a search
  result. The slugless form returns a 403 page, so a bare ID is refused up front with
  `NEEDS_FULL_URL`.

`meta.totalMatches` versus `meta.returnedByPortal` in the JSON output shows how much of
the result set you are actually seeing.

## Tests

```bash
bun test
```

- `parsing.test.ts` runs offline against a fixture that reproduces the two traps in
  StepStone's markup: duplicate `data-at` anchors where the icon comes first, and field
  boundaries that fall inside an opening tag. Both were real bugs.
- `cli-flag-validation.test.ts` checks the error contract, including that `--page` and
  bare IDs are refused with the right codes before any network call.
- `search.test.ts` is a live smoke test over the plain-fetch path. Fast, no firecrawl
  needed, one query by design.

## Personal use only

Keep volume low, no commercial or bulk data collection, own responsibility. StepStone's
terms of service have not been reviewed.

## Maintenance

`../url-reference.md` documents the endpoints, both robots.txt constraints, every
parsing anchor and the known content gotchas. Start there when StepStone changes its
markup.

The likely failure mode is markup bleeding into `title`, `company` or `location`. That
means the field-boundary logic in `fieldText` no longer matches the DOM, not that the
site is down. The live test asserts against exactly that symptom.
