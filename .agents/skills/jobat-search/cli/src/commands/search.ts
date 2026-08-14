import {
  SEARCH_URL,
  DEFAULT_WAIT_MS,
  fetchMarkdown,
  parseSearchMarkdown,
  ageInDays,
  writeError,
  type JobCard,
} from "../helpers.js"

export interface SearchOpts {
  query?: string
  location?: string
  jobage: number
  page: number
  limit?: number
  native: boolean
  format: "json" | "table" | "plain"
}

export function buildUrl(opts: SearchOpts): string {
  const params = new URLSearchParams()
  if (opts.query) params.set("keyword", opts.query)
  if (opts.page > 1) params.set("page", String(opts.page))
  const qs = params.toString()
  return qs ? `${SEARCH_URL}?${qs}` : SEARCH_URL
}

/**
 * Jobat's results page has no server-side recency or location parameter we could
 * verify, so both filters are applied client-side after parsing. Postings whose
 * date could not be resolved are kept (and reported as null) rather than dropped:
 * silently discarding them would hide real vacancies.
 */
function applyFilters(cards: JobCard[], opts: SearchOpts, now: Date): JobCard[] {
  let out = cards

  if (opts.jobage > 0 && opts.jobage < 9999) {
    out = out.filter((c) => {
      const age = ageInDays(c.date, now)
      return age === null || age <= opts.jobage
    })
  }

  if (opts.location) {
    const needle = opts.location.toLowerCase()
    out = out.filter((c) => (c.location || "").toLowerCase().includes(needle))
  }

  return out
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const header =
    "ID".padEnd(9) +
    " " +
    "TITLE".padEnd(44) +
    " " +
    "COMPANY".padEnd(26) +
    " " +
    "LOCATION".padEnd(20) +
    " DATE"
  const rows = cards.map(
    (c) =>
      `${c.id.padEnd(9)} ${(c.title || "").slice(0, 44).padEnd(44)} ` +
      `${(c.company || "-").slice(0, 26).padEnd(26)} ` +
      `${(c.location || "-").slice(0, 20).padEnd(20)} ${c.date || "-"}`,
  )
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const md = await fetchMarkdown(buildUrl(opts), DEFAULT_WAIT_MS, opts.native)
    const now = new Date()
    let cards = applyFilters(parseSearchMarkdown(md, now), opts, now)
    if (opts.limit !== undefined && opts.limit >= 0) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards
          .map(
            (c) =>
              `${c.title}\n  ${c.company || "-"} · ${c.location || "-"} · ${c.date || "-"}\n` +
              `  id: ${c.id}\n  ${c.url}`,
          )
          .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify({ meta: { count: cards.length, page: opts.page }, results: cards }, null, 2) +
          "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
