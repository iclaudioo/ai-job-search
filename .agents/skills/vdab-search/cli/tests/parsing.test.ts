import { describe, expect, test } from "bun:test"
import {
  parseJobCards,
  parseJobDetail,
  totalJobs,
  dutchDateToISO,
  ageInDays,
  idFromUrl,
  slugify,
} from "../src/helpers.js"
import { normalizeTarget } from "../src/commands/detail.js"
import { buildUrl } from "../src/commands/search.js"

// Faithful reduction of VDAB's result markup, captured 2026-08-04. Note the
// unsubstituted templating tokens in the href: VDAB ships those verbatim.
const TILE = (id: string, title: string, company: string, city: string, date: string) => `
<div class="product-tile">
  <a class="product-link" href="https://www.vdab.be/vindeenjob/vacatures/${id}/${slugify(title)}?trefwoord={trefwoordparam}&amp;source=trefwoordpagina&amp;sort=standaard">
    <div class="product-wrapper-tile">
      <div class="product-info">
        <h2 class="product-title">
          ${title}
        </h2>
        <div class="location-job">
          <strong>
            ${company}
          </strong>
          in
          <strong>${city}</strong>
        </div>
        <span class="type-contract">Vaste jobs</span>
      </div>
    </div>
    <div class="job-type">
      <span class="online-sinds">Online sinds  ${date}</span>
    </div>
    <div class="product-description">
      Beheren van marketingbudgetten &amp; onderhandelen met externe partners.
    </div>
  </a>
</div>`

const FIXTURE =
  `<div class="numbers-job"><strong> 12 </strong><span>jobs gevonden</span></div>` +
  `<div class="product-wrapper">` +
  TILE("73946345", "Marketing Director", "OXIDA", "VEURNE", "15 jun. 2026") +
  TILE("74272200", "Sales Director", "MICHAEL PAGE", "BRUSSEL", "30 jul. 2026") +
  `<div class="product-tile"><a class="product-link" href="https://www.vdab.be/opleidingen/x">geen vacature</a></div>` +
  `</div>`

const NOW = new Date("2026-08-04T12:00:00Z")

describe("parseJobCards", () => {
  const cards = parseJobCards(FIXTURE)

  test("parses job tiles and skips tiles that are not vacancies", () => {
    expect(cards.length).toBe(2)
  })

  test("extracts every field as clean text", () => {
    const c = cards[0]
    expect(c.id).toBe("73946345")
    expect(c.title).toBe("Marketing Director")
    expect(c.company).toBe("OXIDA")
    expect(c.location).toBe("VEURNE")
    expect(c.contractType).toBe("Vaste jobs")
    expect(c.date).toBe("2026-06-15")
    expect(c.snippet).toContain("budgetten & onderhandelen")
    for (const v of [c.title, c.company, c.location, c.snippet]) {
      expect(v).not.toContain("<")
    }
  })

  test("strips VDAB's unsubstituted templating tokens from the URL", () => {
    expect(cards[0].url).toBe(
      "https://www.vdab.be/vindeenjob/vacatures/73946345/marketing-director",
    )
    expect(cards[0].url).not.toContain("{")
    expect(cards[0].url).not.toContain("trefwoord")
  })

  test("never omits a contract field", () => {
    for (const c of cards) {
      for (const key of ["id", "title", "company", "location", "date", "url"]) {
        expect(c).toHaveProperty(key)
      }
    }
  })
})

describe("totalJobs", () => {
  test("reads the portal's own match count", () => {
    expect(totalJobs(FIXTURE)).toBe(12)
  })

  test("returns null when absent", () => {
    expect(totalJobs("<html></html>")).toBeNull()
  })
})

describe("dutchDateToISO", () => {
  test("parses abbreviated Dutch months, with or without the dot", () => {
    expect(dutchDateToISO("Online sinds  15 jun. 2026")).toBe("2026-06-15")
    expect(dutchDateToISO("3 okt 2026")).toBe("2026-10-03")
    expect(dutchDateToISO("1 mrt. 2026")).toBe("2026-03-01")
    expect(dutchDateToISO("28 mei 2026")).toBe("2026-05-28")
  })

  test("returns null rather than guessing on an unknown month or shape", () => {
    expect(dutchDateToISO("15 xyz 2026")).toBeNull()
    expect(dutchDateToISO("binnenkort")).toBeNull()
    expect(dutchDateToISO(null)).toBeNull()
  })
})

describe("ageInDays", () => {
  test("counts whole days, null for unknown", () => {
    expect(ageInDays("2026-07-28", NOW)).toBe(7)
    expect(ageInDays(null, NOW)).toBeNull()
  })
})

describe("slugify and buildUrl", () => {
  test("turns a query into VDAB's path slug", () => {
    expect(slugify("Marketing Director")).toBe("marketing-director")
    expect(slugify("marketing manager b2b")).toBe("marketing-manager-b2b")
    expect(slugify("  Coördinator  Marketing ")).toBe("coordinator-marketing")
  })

  test("builds a path-based search URL with no query string", () => {
    const url = buildUrl({ query: "Marketing Director", jobage: 9999, format: "json" })
    expect(url).toBe("https://www.vdab.be/vindeenjob/jobs/marketing-director")
    expect(url).not.toContain("?")
  })
})

describe("idFromUrl and normalizeTarget", () => {
  test("reads the vacancy id from a VDAB URL", () => {
    expect(idFromUrl("https://www.vdab.be/vindeenjob/vacatures/73946345/x")).toBe("73946345")
    expect(idFromUrl("https://www.vdab.be/opleidingen/x")).toBeNull()
  })

  test("accepts a full URL or a bare id, and normalises to the canonical URL", () => {
    expect(normalizeTarget("https://www.vdab.be/vindeenjob/vacatures/73946345/slug")?.url).toBe(
      "https://www.vdab.be/vindeenjob/vacatures/73946345",
    )
    expect(normalizeTarget("73946345")?.id).toBe("73946345")
    expect(normalizeTarget("geen-id")).toBeNull()
  })
})

// Reduced form of the rendered detail page. The two site-chrome level-1 headings
// before the vacancy title are what this fixture exists to pin down.
const DETAIL_MD = `
# Vind een job

Terug naar Vind een job

# Marketing Director

Print

OXIDA voor een job in VEURNE

Online sinds: 15 jun 2026

##### Contract

- Vaste job

- Voltijds

##### Vereiste studies

- Professionele bachelor

##### Werkervaring

- Minstens 2 jaar ervaring

### Functieomschrijving

Ben jij een strategische denker met een passie voor groei?

- Bepalen en uitrollen van de marketingstrategie

Toon meer (12)

### Aanbod

- Sleutelpositie met directe impact

#### OXIDA

Meer info over dit bedrijf

##### Bedrijfswebsite

[oxida.be/](https://www.oxida.be/)
`

describe("parseJobDetail", () => {
  const job = parseJobDetail(DETAIL_MD, "73946345", "https://www.vdab.be/vindeenjob/vacatures/73946345")

  test("takes the vacancy title, not VDAB's site header", () => {
    expect(job.title).toBe("Marketing Director")
  })

  test("splits the company and city out of the single meta line", () => {
    expect(job.company).toBe("OXIDA")
    expect(job.location).toBe("VEURNE")
  })

  test("captures the requirement sections as arrays", () => {
    expect(job.contract).toEqual(["Vaste job", "Voltijds"])
    expect(job.education).toEqual(["Professionele bachelor"])
    expect(job.experience).toEqual(["Minstens 2 jaar ervaring"])
    expect(job.contractType).toBe("Vaste job")
  })

  test("keeps the employer's copy and stops before the company profile", () => {
    expect(job.description).toContain("strategische denker")
    expect(job.description).toContain("Sleutelpositie")
    expect(job.description).not.toContain("Meer info over dit bedrijf")
    expect(job.description).not.toContain("Bedrijfswebsite")
    expect(job.description).not.toContain("Toon meer")
  })

  test("parses the posting date", () => {
    expect(job.date).toBe("2026-06-15")
  })
})
