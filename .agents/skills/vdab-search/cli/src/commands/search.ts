import {
  BASE,
  SEARCH_PATH,
  htmlFetch,
  parseJobCards,
  totalJobs,
  slugify,
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
 * VDAB's keyword search is path-based: /vindeenjob/jobs/<keyword-slug>. There is no
 * query parameter to set, so the keywords become the slug.
 */
export function buildUrl(opts: SearchOpts): string {
  const slug = opts.query ? slugify(opts.query) : ""
  return slug ? `${BASE}${SEARCH_PATH}/${slug}` : `${BASE}${SEARCH_PATH}`
}

function applyFilters(cards: JobCard[], opts: SearchOpts, now: Date): JobCard[] {
  let out = cards

  if (opts.jobage > 0 && opts.jobage < 9999) {
    // Postings with an unresolved date are kept rather than dropped.
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
    "ID".padEnd(10) +
    " " +
    "TITLE".padEnd(42) +
    " " +
    "COMPANY".padEnd(26) +
    " " +
    "LOCATION".padEnd(20) +
    " DATE"
  const rows = cards.map(
    (c) =>
      `${c.id.padEnd(10)} ${(c.title || "").slice(0, 42).padEnd(42)} ` +
      `${(c.company || "-").slice(0, 26).padEnd(26)} ` +
      `${(c.location || "-").slice(0, 20).padEnd(20)} ${c.date || "-"}`,
  )
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const html = await htmlFetch(buildUrl(opts))
    if (!html) {
      writeError(
        `VDAB has no results page for "${opts.query ?? ""}". Try broader or differently ` +
          "spelled keywords",
        "NOT_FOUND",
      )
      return 1
    }

    const now = new Date()
    const all = parseJobCards(html)
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
              totalMatches: totalJobs(html),
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
