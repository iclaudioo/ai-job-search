import {
  BASE,
  DEFAULT_WAIT_MS,
  fetchMarkdown,
  parseDetailMarkdown,
  writeError,
} from "../helpers.js"

export interface DetailOpts {
  id: string
  native: boolean
  format: "json" | "plain"
}

/**
 * Accept a full Jobat job URL or a bare numeric ID. A bare ID has no slug, but
 * Jobat resolves /nl/jobs/job/job_<id> to the canonical posting, so we can still
 * build a working URL from it.
 */
export function normalizeTarget(input: string): { id: string; url: string } | null {
  const fromUrl = input.match(/^https?:\/\/[^\s]*\/job_(\d+)/)
  if (fromUrl) return { id: fromUrl[1], url: input.split("?")[0] }

  const bare = input.match(/^(?:job_)?(\d{4,})$/)
  if (bare) return { id: bare[1], url: `${BASE}/nl/jobs/job/job_${bare[1]}` }

  return null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const target = normalizeTarget(opts.id)
  if (!target) {
    writeError(
      `Could not parse a Jobat job ID from "${opts.id}". Pass a full job URL or a numeric id`,
      "BAD_ID",
    )
    return 1
  }

  try {
    const md = await fetchMarkdown(target.url, DEFAULT_WAIT_MS, opts.native)
    const job = parseDetailMarkdown(md, target.id, target.url)

    if (!job.description) {
      writeError(
        `No job description found at ${target.url}. The posting may have expired or been removed`,
        "NOT_FOUND",
      )
      return 1
    }

    if (opts.format === "plain") {
      const lines = [job.title, "", job.description, "", `URL: ${job.url}`]
      if (job.applyUrl) lines.push(`Apply: ${job.applyUrl}`)
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
