import { describe, expect, test } from "bun:test"
import { runCLI, parseJSON } from "./helpers.js"

// Live smoke test against StepStone's real search endpoint. Search runs over a
// plain fetch, so this is fast and needs no firecrawl. One query by design.
interface SearchResponse {
  meta: { count: number; page: number; totalMatches: number | null; returnedByPortal: number }
  results: Array<{
    id: string
    title: string
    company: string | null
    location: string | null
    date: string | null
    url: string
    snippet: string | null
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
        // The failure mode this portal actually has: markup bleeding into text.
        for (const value of [job.title, job.company, job.location]) {
          expect(value ?? "").not.toContain("<")
          expect(value ?? "").not.toContain("res-")
        }
        expect(job.url).toContain("stepstone.be")
        expect(job.url).toContain(job.id)
        if (job.date !== null) expect(job.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      }
    },
    60000,
  )
})
