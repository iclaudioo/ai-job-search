import { describe, expect, test } from "bun:test"
import {
  parseSearchMarkdown,
  relativeToISO,
  ageInDays,
  idFromUrl,
} from "../src/helpers.js"
import { normalizeTarget } from "../src/commands/detail.js"
import { buildUrl } from "../src/commands/search.js"

// Verbatim shape of firecrawl's markdown for a Jobat results page, captured
// 2026-08-04. See url-reference.md for the full structure.
const FIXTURE = `
Some site chrome and navigation links.

## [Marketing en sales coördinator](https://www.jobat.be/nl/jobs/marketing-en-sales-coordinator/job_6104454)

- [Unique Turnhout](https://www.jobat.be/nl/jobs/bedrijven/unique/63851)
- Turnhout
- Interim optie vast

Van **€ 2.700** tot **€ 3.800** per maand


Sinds **vandaag**

## [Marketing- & Communicatiecoördinator](https://www.jobat.be/nl/jobs/marketing-communicatiecoordinator/job_6081271)

- [Unique Waregem](https://www.jobat.be/nl/jobs/bedrijven/unique/63851)
- Tielt
- Onbepaalde duur

Sinds **6 dagen**

## [Retailmarketing Coördinator M/V](https://www.jobat.be/nl/jobs/retailmarketing-coordinator-m-v/job_6009814)

- [Meat&More](https://www.jobat.be/nl/jobs/bedrijven/meatmore/1032)
- Oost-Vlaanderen
- Onbepaalde duur

## [Not a job, a category link](https://www.jobat.be/nl/jobs/categories)

- ignore me
`

const NOW = new Date("2026-08-04T12:00:00Z")

describe("parseSearchMarkdown", () => {
  const cards = parseSearchMarkdown(FIXTURE, NOW)

  test("parses only real job entries, skipping non-job headings", () => {
    expect(cards.length).toBe(3)
    expect(cards.some((c) => c.title.includes("category link"))).toBe(false)
  })

  test("extracts every contract field from a full entry", () => {
    const c = cards[0]
    expect(c.id).toBe("6104454")
    expect(c.title).toBe("Marketing en sales coördinator")
    expect(c.company).toBe("Unique Turnhout")
    expect(c.companyUrl).toBe("https://www.jobat.be/nl/jobs/bedrijven/unique/63851")
    expect(c.location).toBe("Turnhout")
    expect(c.contractType).toBe("Interim optie vast")
    expect(c.salary).toBe("Van € 2.700 tot € 3.800 per maand")
    expect(c.date).toBe("2026-08-04")
    expect(c.url).toBe(
      "https://www.jobat.be/nl/jobs/marketing-en-sales-coordinator/job_6104454",
    )
  })

  test("resolves a relative posting date to an absolute one", () => {
    expect(cards[1].date).toBe("2026-07-29")
  })

  test("returns null rather than guessing when no date is present", () => {
    expect(cards[2].date).toBeNull()
    expect(cards[2].company).toBe("Meat&More")
  })

  test("never omits a contract field, even when absent", () => {
    for (const c of cards) {
      for (const key of ["id", "title", "company", "location", "date", "url"]) {
        expect(c).toHaveProperty(key)
      }
    }
  })
})

describe("relativeToISO", () => {
  test("maps Dutch relative labels to absolute dates", () => {
    expect(relativeToISO("vandaag", NOW)).toBe("2026-08-04")
    expect(relativeToISO("gisteren", NOW)).toBe("2026-08-03")
    expect(relativeToISO("3 dagen", NOW)).toBe("2026-08-01")
    expect(relativeToISO("2 weken", NOW)).toBe("2026-07-21")
    expect(relativeToISO("16 uur", NOW)).toBe("2026-08-04")
  })

  test("returns null for labels it cannot map", () => {
    expect(relativeToISO("ooit", NOW)).toBeNull()
    expect(relativeToISO(null, NOW)).toBeNull()
  })
})

describe("ageInDays", () => {
  test("counts whole days back from now", () => {
    expect(ageInDays("2026-08-04", NOW)).toBe(0)
    expect(ageInDays("2026-07-28", NOW)).toBe(7)
  })

  test("returns null for an unknown or unparseable date", () => {
    expect(ageInDays(null, NOW)).toBeNull()
    expect(ageInDays("niet-een-datum", NOW)).toBeNull()
  })
})

describe("idFromUrl / normalizeTarget", () => {
  test("pulls the id out of a Jobat job URL", () => {
    expect(idFromUrl("https://www.jobat.be/nl/jobs/x/job_123456")).toBe("123456")
    expect(idFromUrl("https://www.jobat.be/nl/jobs/categories")).toBeNull()
  })

  test("accepts a full URL, a bare id, and a job_-prefixed id", () => {
    expect(normalizeTarget("https://www.jobat.be/nl/jobs/x/job_6078904")?.id).toBe("6078904")
    expect(normalizeTarget("6078904")?.id).toBe("6078904")
    expect(normalizeTarget("job_6078904")?.id).toBe("6078904")
    expect(normalizeTarget("not-a-job")).toBeNull()
  })
})

describe("buildUrl", () => {
  const base = { jobage: 9999, page: 1, native: false, format: "json" } as const

  test("puts the keyword on the results endpoint", () => {
    expect(buildUrl({ ...base, query: "marketing director" })).toBe(
      "https://www.jobat.be/nl/jobs/results?keyword=marketing+director",
    )
  })

  test("only adds a page parameter beyond page 1", () => {
    expect(buildUrl({ ...base, query: "x", page: 2 })).toContain("page=2")
    expect(buildUrl({ ...base, query: "x", page: 1 })).not.toContain("page=")
  })

  test("keeps location out of the URL, it is a client-side filter", () => {
    expect(buildUrl({ ...base, query: "x", location: "Hasselt" })).not.toContain("Hasselt")
  })
})
