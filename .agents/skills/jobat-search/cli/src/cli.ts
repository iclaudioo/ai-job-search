#!/usr/bin/env bun
// Self-contained CLI for searching jobs on Jobat.be, the largest Flemish job board.
//
// Personal use only. Jobat is behind Cloudflare bot protection; this CLI renders
// its public pages through the `firecrawl` CLI rather than fetching them directly.
// Jobat's robots.txt permits /nl/jobs*, but their terms of service may still
// prohibit automated access. Keep volume low, no commercial or bulk use, and run
// it on your own responsibility.

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

const HELP = `jobat-cli: search jobs on Jobat.be (Belgium / Flanders, Dutch)

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <id|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>      Keywords (job title, skill, role). Strongly recommended.
  --location, -l <text>   Filter results by location. Applied client-side.
                          Jobat's results page has no verified location parameter.
  --jobage <days>         Keep postings from the last N days. Applied client-side.
                          Postings with an unresolved date are kept, not dropped.
  --page <n>              1-indexed results page. Default 1.
  --limit, -n <n>         Cap results emitted (client-side).
  --native                Try a direct fetch before falling back to firecrawl.
                          Only useful if Jobat ever drops its Cloudflare block.
  --format <fmt>          json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search -q "marketing director" --format table
  bun run src/cli.ts search -q "value proposition" --jobage 14 --format table
  bun run src/cli.ts search -q "marketing manager" -l "Hasselt" --format table
  bun run src/cli.ts search -q "head of marketing" -n 5 --format json
  bun run src/cli.ts detail https://www.jobat.be/nl/jobs/marketing-manager/job_6102912 --format plain

REQUIREMENTS
  The \`firecrawl\` CLI must be installed and authenticated. Jobat returns HTTP 403
  to direct requests, so there is no zero-dependency path to its pages.

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
    for (const name of ["jobage", "page", "limit"]) {
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
      page: flags.page ? Math.max(1, parseInt(flags.page as string, 10)) : 1,
      limit: flags.limit ? parseInt(flags.limit as string, 10) : undefined,
      native: flags.native === true,
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
      native: flags.native === true,
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
