import {
  BASE,
  DETAIL_PATH,
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
 * Accept a full VDAB vacancy URL or a bare numeric ID. Unlike StepStone, VDAB's
 * slugless form /vindeenjob/vacatures/<id> is the canonical URL and resolves on its
 * own, so a bare ID is safe here.
 */
export function normalizeTarget(input: string): { id: string; url: string } | null {
  const fromUrl = input.match(/^https?:\/\/[^\s]*\/vindeenjob\/vacatures\/(\d+)/)
  if (fromUrl) return { id: fromUrl[1], url: `${BASE}${DETAIL_PATH}/${fromUrl[1]}` }

  const bare = input.match(/^(\d{5,})$/)
  if (bare) return { id: bare[1], url: `${BASE}${DETAIL_PATH}/${bare[1]}` }

  return null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const target = normalizeTarget(opts.id)
  if (!target) {
    writeError(
      `Could not parse a VDAB vacancy id from "${opts.id}". Pass a full vacancy URL or ` +
        "a numeric id",
      "BAD_ID",
    )
    return 1
  }

  try {
    const md = await firecrawlMarkdown(target.url, DEFAULT_WAIT_MS)
    const job = parseJobDetail(md, target.id, target.url)

    if (!job.description) {
      writeError(
        `No job description found at ${target.url}. The vacancy may have been filled or ` +
          "withdrawn, or the page needed longer to render",
        "NOT_FOUND",
      )
      return 1
    }

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "-"} · ${job.location || "-"}`,
        job.date ? `Online sinds: ${job.date}` : "",
        job.contract.length ? `Contract: ${job.contract.join(", ")}` : "",
        job.education.length ? `Studies: ${job.education.join(", ")}` : "",
        job.experience.length ? `Ervaring: ${job.experience.join(", ")}` : "",
        "",
        job.description,
        "",
        `URL: ${job.url}`,
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
