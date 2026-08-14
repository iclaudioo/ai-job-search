#!/usr/bin/env bun
// Self-contained CLI for searching jobs on StepStone Belgium.
//
// Search runs over a plain fetch with no runtime dependencies. Detail pages sit
// behind a bot manager that answers direct requests with HTTP 403, so those are
// rendered through the `firecrawl` CLI.
//
// Personal use only. Keep volume low, no commercial or bulk data collection.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", l: "location", n: "limit" }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("-")) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      const next = argv[i + 1]
      if (next === undefined || next.startsWith("-")) {
        flags[key] = true
      } else {
        flags[key] = next
        i++
      }
    } else {
      ;(flags._ as string[]).push(a)
    }
  }
  return flags
}

const HELP = `stepstone-cli: search jobs on StepStone Belgium (Dutch/French/English)

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <id|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>      Keywords (job title, skill, role). Strongly recommended.
  --location, -l <text>   Filter results by location. Applied client-side.
  --jobage <days>         Keep postings from the last N days. Applied client-side.
                          Postings with an unresolved date are kept, not dropped.
  --limit, -n <n>         Cap results emitted (client-side).
  --format <fmt>          json (default) | table | plain.

  There is no --page flag. StepStone's robots.txt allows /vacatures/*?q=* but
  disallows q combined with any other parameter, and pagination needs one. One
  request returns roughly 25 cards; narrow the query instead of paging.

EXAMPLES
  bun run src/cli.ts search -q "marketing director" --format table
  bun run src/cli.ts search -q "value proposition" --jobage 14 --format table
  bun run src/cli.ts search -q "head of marketing" -l "Antwerpen" --format table
  bun run src/cli.ts search -q "product marketing" -n 5 --format json
  bun run src/cli.ts detail https://www.stepstone.be/vacatures--Marketing-Manager-Antwerpen-Dixon-Sales-Marketing--2229955-inline.html --format plain

REQUIREMENTS
  search needs only bun. detail needs the \`firecrawl\` CLI installed and
  authenticated, because StepStone blocks direct requests to posting pages.

Personal use only. Keep volume low (see SKILL.md).
`

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const flags = parseFlags(argv)
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }

  const parseIntFlag = (name: string, raw: string | boolean | string[]): number | null => {
    const val = parseInt(raw as string, 10)
    if (isNaN(val)) {
      process.stderr.write(
        JSON.stringify({ error: `--${name} must be a number, got "${raw}"`, code: "BAD_ARG" }) + "\n",
      )
      return null
    }
    return val
  }

  if (cmd === "search") {
    if (flags.page !== undefined) {
      process.stderr.write(
        JSON.stringify({
          error:
            "StepStone pagination is not supported: robots.txt disallows combining the " +
            "q parameter with any other, and pagination requires one. Narrow the query instead",
          code: "PAGINATION_UNSUPPORTED",
        }) + "\n",
      )
      return 1
    }

    for (const name of ["jobage", "limit"]) {
      if (flags[name] !== undefined) {
        const v = parseIntFlag(name, flags[name])
        if (v === null) return 1
        flags[name] = String(v)
      }
    }

    const fmt = (flags.format as string) || "json"
    const opts: SearchOpts = {
      query: typeof flags.query === "string" ? flags.query : undefined,
      location: typeof flags.location === "string" ? flags.location : undefined,
      jobage: flags.jobage ? parseInt(flags.jobage as string, 10) : 9999,
      limit: flags.limit ? parseInt(flags.limit as string, 10) : undefined,
      format: (["json", "table", "plain"].includes(fmt) ? fmt : "json") as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) {
      process.stderr.write(
        JSON.stringify({ error: "detail requires an <id|url>", code: "NO_ID" }) + "\n",
      )
      return 1
    }
    const fmt = (flags.format as string) || "json"
    const opts: DetailOpts = {
      id,
      format: (fmt === "plain" ? "plain" : "json") as DetailOpts["format"],
    }
    return runDetail(opts)
  }

  process.stderr.write(JSON.stringify({ error: `Unknown command "${cmd}"`, code: "BAD_CMD" }) + "\n")
  return 1
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    process.stderr.write(
      JSON.stringify({
        error: e instanceof Error ? e.message : String(e),
        code: "INTERNAL_ERROR",
      }) + "\n",
    )
    process.exit(1)
  })
