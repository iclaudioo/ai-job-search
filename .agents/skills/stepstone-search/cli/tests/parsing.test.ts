import { describe, expect, test } from "bun:test"
import {
  parseJobCards,
  totalOffers,
  relativeToISO,
  ageInDays,
  idFromUrl,
  fieldText,
  textOf,
} from "../src/helpers.js"
import { normalizeTarget, isBareId } from "../src/commands/detail.js"
import { buildUrl } from "../src/commands/search.js"

// Faithful reduction of StepStone's result markup, captured 2026-08-04. It keeps
// the two traits that break naive parsing: an inline emotion-css <style> block
// before almost every element, and an <svg> icon that carries the same data-at
// value as the text span that follows it.
const CARD = (id: string, title: string, company: string, loc: string, ago: string) => `
<article class="res-x" data-genesis-element="CARD" id="job-item-${id}" data-at="job-item" data-testid="job-item">
<style data-emotion="res a1">.res-a1{box-sizing:border-box;margin:0;}</style>
<div class="res-a1" data-at="jobcard-content">Een korte omschrijving van de functie met &amp; een entiteit.</div>
<a href="/vacatures--${title.replace(/ /g, "-")}-${loc}--${id}-inline.html" data-at="job-item-title" tabindex="-1">
<style data-emotion="res b2">.res-b2{color:#0C2577;}</style>
<div class="res-b2">${title}</div></a>
<span data-at="job-item-company-name"><svg viewBox="0 0 20 20"><path d="M3.75 16.58C3.38 16.58 3.06 16.45Z"/></svg></span>
<span class="res-c3" data-at="job-item-company-name">${company}</span>
<span data-at="job-item-location"><svg viewBox="0 0 20 20"><path d="M9.99 16.15Z"/></svg></span>
<div class="res-d4" data-at="job-item-location">${loc}</div>
<span data-at="job-item-timeago"><time class="">${ago}</time></span>
</article>`

const FIXTURE =
  `<html><body data-resultlist-offers-total="328">` +
  CARD("2229955", "Marketing Manager", "Dixon Sales &amp; Marketing", "Antwerpen", "4 dagen geleden") +
  CARD("2224670", "Online Marketing Manager", "IDcreation", "GULLEGEM", "16 uur geleden") +
  `<article data-at="job-item">no id here, must be skipped</article>` +
  `</body></html>`

const NOW = new Date("2026-08-04T12:00:00Z")

describe("parseJobCards", () => {
  const cards = parseJobCards(FIXTURE, NOW)

  test("parses every well-formed card and skips the broken one", () => {
    expect(cards.length).toBe(2)
  })

  test("extracts clean text, never raw markup", () => {
    const c = cards[0]
    expect(c.id).toBe("2229955")
    expect(c.title).toBe("Marketing Manager")
    expect(c.company).toBe("Dixon Sales & Marketing")
    expect(c.location).toBe("Antwerpen")
    for (const value of [c.title, c.company, c.location, c.snippet]) {
      expect(value).not.toContain("<")
      expect(value).not.toContain("res-")
      expect(value).not.toContain("box-sizing")
    }
  })

  test("skips the icon occurrence and reads the text one for repeated anchors", () => {
    // Both the svg container and the text span carry job-item-company-name.
    expect(cards[0].company).not.toContain("path")
    expect(cards[0].company).not.toContain("M3.75")
  })

  test("builds an absolute URL on the portal's own host", () => {
    expect(cards[0].url.startsWith("https://www.stepstone.be/vacatures--")).toBe(true)
    expect(idFromUrl(cards[0].url)).toBe("2229955")
  })

  test("converts relative posting labels to absolute dates", () => {
    expect(cards[0].date).toBe("2026-07-31")
    expect(cards[1].date).toBe("2026-08-04")
  })

  test("decodes html entities in the snippet", () => {
    expect(cards[0].snippet).toContain("met & een entiteit")
  })

  test("never omits a contract field", () => {
    for (const c of cards) {
      for (const key of ["id", "title", "company", "location", "date", "url"]) {
        expect(c).toHaveProperty(key)
      }
    }
  })
})

describe("totalOffers", () => {
  test("reads the portal's own match count", () => {
    expect(totalOffers(FIXTURE)).toBe(328)
  })

  test("returns null when the attribute is absent", () => {
    expect(totalOffers("<html></html>")).toBeNull()
  })
})

describe("textOf", () => {
  test("drops style blocks and svg payloads before stripping tags", () => {
    const html = `<style>.a{color:red}</style><svg><path d="M1 2"/></svg><span>Hallo</span>`
    expect(textOf(html)).toBe("Hallo")
  })
})

describe("fieldText", () => {
  test("returns null when the anchor is absent", () => {
    expect(fieldText("<div>niets</div>", "job-item-title")).toBeNull()
  })
})

describe("relativeToISO", () => {
  test("handles irregular Dutch plurals", () => {
    expect(relativeToISO("1 week geleden", NOW)).toBe("2026-07-28")
    expect(relativeToISO("2 weken geleden", NOW)).toBe("2026-07-21")
    expect(relativeToISO("1 jaar geleden", NOW)).toBe("2025-08-04")
    expect(relativeToISO("16 uur geleden", NOW)).toBe("2026-08-04")
    expect(relativeToISO("3 dagen geleden", NOW)).toBe("2026-08-01")
  })

  test("returns null rather than guessing", () => {
    expect(relativeToISO("ergens ooit", NOW)).toBeNull()
    expect(relativeToISO(null, NOW)).toBeNull()
  })
})

describe("ageInDays", () => {
  test("counts whole days, and reports null for unknown dates", () => {
    expect(ageInDays("2026-07-28", NOW)).toBe(7)
    expect(ageInDays(null, NOW)).toBeNull()
  })
})

describe("buildUrl", () => {
  const base = { jobage: 9999, format: "json" } as const

  test("sends exactly one parameter, as robots.txt requires", () => {
    const url = buildUrl({ ...base, query: "marketing director", location: "Antwerpen" })
    expect(url).toBe("https://www.stepstone.be/vacatures/?q=marketing%20director")
    expect(url).not.toContain("&")
    expect(url).not.toContain("Antwerpen")
  })
})

describe("normalizeTarget", () => {
  test("accepts a full posting URL", () => {
    const t = normalizeTarget(
      "https://www.stepstone.be/vacatures--Marketing-Manager-Antwerpen--2229955-inline.html",
    )
    expect(t?.id).toBe("2229955")
  })

  test("rejects a bare id, which StepStone cannot resolve", () => {
    expect(normalizeTarget("2229955")).toBeNull()
    expect(isBareId("2229955")).toBe(true)
    expect(isBareId("https://www.stepstone.be/x--1.html")).toBe(false)
  })
})
