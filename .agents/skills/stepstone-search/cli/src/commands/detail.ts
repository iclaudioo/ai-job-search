import {
  DEFAULT_WAIT_MS,
  firecrawlMarkdown,
  parseJobDetail,
  writeError,
} from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

/**
 * StepStone requires the full posting URL.
 *
 * Unlike Jobat, a slugless URL built from the ID alone does not resolve here:
 * `/vacatures--<id>-inline.html` was verified to return StepStone's own 403 page
 * ("toegang geweigerd") rather than the posting. Rather than construct a URL that
 * silently fails, a bare ID is rejected with an explanation.
 */
export function normalizeTarget(input: string): { id: string; url: string } | null {
  const fromUrl = input.match(/^https?:\/\/[^\s]*--(\d+)(?:-inline)?\.html/)
  if (fromUrl) return { id: fromUrl[1], url: input.split("?")[0] }
  return null
}

export function isBareId(input: string): boolean {
  return /^\d{4,}$/.test(input.trim())
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const target = normalizeTarget(opts.id)
  if (!target) {
    if (isBareId(opts.id)) {
      writeError(
        `StepStone needs the full posting URL, not a bare id. "${opts.id}" cannot be ` +
          "resolved: the slugless form returns a 403 page. Use the `url` field from a " +
          "search result",
        "NEEDS_FULL_URL",
      )
      return 1
    }
    writeError(
      `Could not parse a StepStone posting URL from "${opts.id}"`,
      "BAD_ID",
    )
    return 1
  }

  try {
    const md = await firecrawlMarkdown(target.url, DEFAULT_WAIT_MS)
    const job = parseJobDetail(md, target.id, target.url)

    // StepStone serves an error page with HTTP 200 through the renderer, so a
    // blocked or expired posting has to be detected from its content.
    if (/Fout 403|toegang geweigerd|geen machtiging/i.test(job.description || "")) {
      writeError(
        `StepStone refused this posting (${target.url}). It may have expired or been withdrawn`,
        "BLOCKED",
      )
      return 1
    }

    if (!job.description) {
      writeError(
        `No job description found at ${target.url}. The posting may have expired, or ` +
          "the id may not resolve without its slug (retry with the full URL)",
        "NOT_FOUND",
      )
      return 1
    }

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "-"} · ${job.location || "-"}`,
        job.employmentType ? `Contract: ${job.employmentType}` : "",
        job.date ? job.date : "",
        "",
        job.description,
        "",
        `URL: ${job.url}`,
        job.applyUrl ? `Apply: ${job.applyUrl}` : "",
      ].filter((l) => l !== "")
      process.stdout.write(lines.join("\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
