import {
  SEARCH_URL,
  htmlFetch,
  parseJobCards,
  totalOffers,
  ageInDays,
  writeError,
  type JobCard,
} from "../helpers.js"

export interface SearchOpts {
  query?: string
  location?: string
  jobage: number
  limit?: number
  format: "json" | "table" | "plain"
}

/**
 * StepStone's robots.txt allows `/vacatures/*?q=*` but disallows `q` combined with
 * any other parameter (`/vacatures/*?q=*&*`). So exactly one parameter goes on the
 * wire and every other filter is applied client-side.
 */
export function buildUrl(opts: SearchOpts): string {
  if (!opts.query) return SEARCH_URL
  return `${SEARCH_URL}?q=${encodeURIComponent(opts.query)}`
}

function applyFilters(cards: JobCard[], opts: SearchOpts, now: Date): JobCard[] {
  let out = cards

  if (opts.jobage > 0 && opts.jobage < 9999) {
    // Postings with an unresolved date are kept, not dropped: hiding a real
    // vacancy is worse than showing one whose age we could not determine.
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
    const html = await htmlFetch(buildUrl(opts))
    const now = new Date()
    const all = parseJobCards(html, now)
    let cards = applyFilters(all, opts, now)
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
        JSON.stringify(
          {
            meta: {
              count: cards.length,
              page: 1,
              totalMatches: totalOffers(html),
              returnedByPortal: all.length,
            },
            results: cards,
          },
          null,
          2,
        ) + "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
