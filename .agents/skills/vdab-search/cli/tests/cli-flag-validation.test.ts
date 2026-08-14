import { describe, expect, test } from "bun:test"
import { runCLI, parseJSON } from "./helpers.js"

interface SearchResponse {
  meta: { count: number; totalMatches: number | null; returnedByPortal: number }
  results: Array<{
    id: string
    title: string
    company: string | null
    location: string | null
    date: string | null
    url: string
  }>
}

describe("CLI contract", () => {
  test("no arguments prints help and exits 1", async () => {
    const r = await runCLI([])
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toContain("vdab-cli")
  })

  test("an unknown command exits 1 with a JSON error on stderr", async () => {
    const r = await runCLI(["frobnicate"])
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toBe("")
    expect(JSON.parse(r.stderr).code).toBe("BAD_CMD")
  })

  test("a non-numeric --jobage exits 1 with a JSON error on stderr", async () => {
    const r = await runCLI(["search", "-q", "marketing", "--jobage", "recent"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).code).toBe("BAD_ARG")
  })

  test("detail without an id exits 1", async () => {
    const r = await runCLI(["detail"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).code).toBe("NO_ID")
  })

  test("detail with an unparseable id exits 1 before any network call", async () => {
    const r = await runCLI(["detail", "geen-geldig-id"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).code).toBe("BAD_ID")
  })
})

// Live smoke test over the plain-fetch path. Fast, no firecrawl needed.
describe("live search", () => {
  test(
    "returns real, complete job cards",
    async () => {
      const r = await runCLI([
        "search",
        "-q",
        "marketing manager",
        "--limit",
        "5",
        "--format",
        "json",
      ])
      const data = parseJSON<SearchResponse>(r)

      expect(data.results.length).toBeGreaterThan(0)
      expect(data.meta.count).toBe(data.results.length)

      for (const job of data.results) {
        expect(job.id).toMatch(/^\d+$/)
        expect(job.title.length).toBeGreaterThan(0)
        expect(job.title).not.toContain("<")
        expect(job.url).toContain("vdab.be/vindeenjob/vacatures/")
        expect(job.url).not.toContain("{")
        if (job.date !== null) expect(job.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      }
    },
    60000,
  )
})
