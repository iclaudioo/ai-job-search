import { describe, expect, test } from "bun:test"
import { runCLI, parseJSON } from "./helpers.js"

// Live smoke test. Hits Jobat through firecrawl, so it is slow (tens of seconds)
// and needs the firecrawl CLI authenticated. Keep the volume here to a single
// query. This is a health check, not a crawl.
interface SearchResponse {
  meta: { count: number; page: number }
  results: Array<{
    id: string
    title: string
    company: string | null
    location: string | null
    date: string | null
    url: string
  }>
}

describe("live search", () => {
  test(
    "returns real, complete job cards",
    async () => {
      const r = await runCLI(["search", "-q", "marketing", "--limit", "5", "--format", "json"])
      const data = parseJSON<SearchResponse>(r)

      expect(data.results.length).toBeGreaterThan(0)
      expect(data.meta.count).toBe(data.results.length)

      for (const job of data.results) {
        expect(job.id).toMatch(/^\d+$/)
        expect(job.title.length).toBeGreaterThan(0)
        expect(job.title).not.toContain("<")
        expect(job.url).toContain("jobat.be")
        expect(job.url).toContain(`job_${job.id}`)
        if (job.date !== null) expect(job.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      }
    },
    180000,
  )
})
