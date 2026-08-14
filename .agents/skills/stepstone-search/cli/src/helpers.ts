// Data source: StepStone Belgium public job-search pages (https://www.stepstone.be).
//
// Two different access situations, handled two different ways:
//
//   search  - https://www.stepstone.be/vacatures/?q=<keywords> returns real HTML to a
//             plain fetch with a browser User-Agent. Parsed natively, no dependencies.
//   detail  - the posting pages sit behind an Akamai-style bot manager that answers
//             every direct request with HTTP 403 and a ~440 KB challenge page. Those
//             are rendered through the `firecrawl` CLI instead.
//
// robots.txt is restrictive about query strings on /vacatures/: `Disallow: /*?*` with an
// explicit `Allow: /vacatures/*?q=*`, and `Disallow: /vacatures/*?q=*&*`. A single `q`
// parameter is therefore permitted and anything combined with it is not, which is why
// this CLI sends exactly one search parameter and filters everything else client-side.

export const BASE = "https://www.stepstone.be"
export const SEARCH_URL = `${BASE}/vacatures/`

export const DEFAULT_WAIT_MS = 3000

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
  snippet: string | null
}

export interface JobDetail extends JobCard {
  description: string | null
  employmentType: string | null
  applyUrl: string | null
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"

/** Fetch HTML with exponential backoff on 429/5xx. Returns "" on a 404. */
export async function htmlFetch(url: string): Promise<string> {
  const maxRetries = 5
  let delay = 500

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "nl-BE,nl;q=0.9,fr;q=0.8,en;q=0.7",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    })

    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }
      await new Promise((r) => setTimeout(r, delay + Math.floor(Math.random() * 500)))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404) return ""
    if (response.status === 403) {
      throw new Error(
        "StepStone returned 403 (bot manager). Search normally works over a direct " +
          "fetch, so this is either a temporary block or a policy change",
      )
    }
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return response.text()
  }
  throw new Error("Request failed after max retries")
}

/**
 * Render a page through the firecrawl CLI and return its markdown. Used only for
 * detail pages, which a direct fetch cannot reach.
 */
export async function firecrawlMarkdown(url: string, waitMs: number): Promise<string> {
  const maxRetries = 2
  let delay = 2000

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let proc
    try {
      proc = Bun.spawn(
        [
          "firecrawl",
          "scrape",
          url,
          "--format",
          "markdown",
          "--country",
          "BE",
          "--languages",
          "nl",
          "--only-main-content",
          "--wait-for",
          String(waitMs),
        ],
        { stdout: "pipe", stderr: "pipe" },
      )
    } catch {
      throw new Error(
        "the `firecrawl` CLI is not installed or not on PATH. StepStone detail pages " +
          "are behind a bot manager and cannot be fetched without it (search still works)",
      )
    }

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])

    if (exitCode === 0 && stdout.trim().length > 0) return stdout
    if (/not found|ENOENT/i.test(stderr)) {
      throw new Error(
        "the `firecrawl` CLI is not installed or not on PATH. StepStone detail pages " +
          "are behind a bot manager and cannot be fetched without it (search still works)",
      )
    }
    if (/api key|unauthor|401/i.test(stderr)) {
      throw new Error(`firecrawl rejected the request (check your API key): ${stderr.trim()}`)
    }
    if (attempt === maxRetries) {
      throw new Error(
        `firecrawl failed after ${maxRetries + 1} attempts: ${stderr.trim() || "empty output"}`,
      )
    }
    await new Promise((r) => setTimeout(r, delay + Math.floor(Math.random() * 500)))
    delay = Math.min(delay * 2, 8000)
  }
  throw new Error("firecrawl failed after max retries")
}

function codePoint(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, d) => codePoint(parseInt(d, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, h) => codePoint(parseInt(h, 16)))
}

/**
 * Strip a fragment of StepStone markup down to its text.
 *
 * StepStone inlines an emotion-css <style> block before almost every element and
 * uses inline <svg> icons, so both have to go before tags are stripped or the
 * output fills with CSS rules and SVG path data.
 */
export function textOf(html: string): string {
  return decodeEntities(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<svg[\s\S]*?<\/svg>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " "),
  ).trim()
}

/**
 * Read the text of a `data-at="<name>"` field inside one card.
 *
 * The same `data-at` value can appear more than once per card (an icon container
 * and the text span both carry `job-item-company-name`), and the first occurrence
 * is often the icon. So we walk every occurrence and return the first that yields
 * real text, rather than trusting position.
 */
export function fieldText(card: string, at: string): string | null {
  const re = new RegExp(`data-at="${at}"[^>]*>`, "g")
  let m: RegExpExecArray | null

  while ((m = re.exec(card)) !== null) {
    const start = m.index + m[0].length
    // A field's text never runs past the next data-at anchor. That anchor sits
    // *inside* an opening tag, so cutting at it would leave a half-open tag like
    // `<span class="res-x"` that the tag stripper cannot match and would emit as
    // literal text. Back up to the start of that tag instead.
    const nextAnchor = card.indexOf('data-at="', start)
    const hardEnd = nextAnchor === -1 ? Math.min(start + 2500, card.length) : nextAnchor
    const tagStart = card.lastIndexOf("<", hardEnd)
    const end = tagStart > start ? tagStart : hardEnd

    const text = textOf(card.slice(start, end))
    if (text) return text
  }
  return null
}

/**
 * Convert StepStone's relative posting label ("4 dagen geleden") to an ISO date.
 * `now` is injected so the conversion is deterministic and testable.
 *
 * Dutch plurals are not suffixes: "weken" does not contain "week", "uren" does not
 * contain "uur", "jaren" does not contain "jaar". Each unit spells out both forms.
 */
export function relativeToISO(label: string | null, now: Date): string | null {
  if (!label) return null
  const text = label.toLowerCase().trim()
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const minus = (days: number) => {
    const d = new Date(now.getTime())
    d.setUTCDate(d.getUTCDate() - days)
    return iso(d)
  }

  if (/vandaag|zonet|zojuist|minu(?:u)?t(?:en)?|u(?:u)?r(?:en)?/.test(text)) return iso(now)
  if (/gisteren/.test(text)) return minus(1)

  const num = text.match(/(\d+)/)
  if (!num) return null
  const n = parseInt(num[1], 10)
  if (/dag(?:en)?/.test(text)) return minus(n)
  if (/we(?:e)?k(?:en)?/.test(text)) return minus(n * 7)
  if (/maand(?:en)?/.test(text)) return minus(n * 30)
  if (/ja(?:a)?r(?:en)?/.test(text)) return minus(n * 365)
  return null
}

export function ageInDays(isoDate: string | null, now: Date): number | null {
  if (!isoDate) return null
  const then = Date.parse(isoDate + "T00:00:00Z")
  if (Number.isNaN(then)) return null
  return Math.floor((now.getTime() - then) / 86400000)
}

/** StepStone detail URLs end in `--<id>-inline.html` or `--<id>.html`. */
export function idFromUrl(url: string): string | null {
  const m = url.match(/--(\d+)(?:-inline)?\.html/)
  return m ? m[1] : null
}

/**
 * Parse the search results page.
 *
 * Each result is an `<article ... id="job-item-<id>" data-at="job-item">`. We split
 * on the opening tag and parse each chunk independently so one malformed card
 * cannot break the rest.
 */
export function parseJobCards(html: string, now: Date): JobCard[] {
  const results: JobCard[] = []
  const seen = new Set<string>()
  const chunks = html.split(/(?=<article[^>]*data-at="job-item")/).slice(1)

  for (const chunk of chunks) {
    const idMatch = chunk.match(/id="job-item-(\d+)"/)
    if (!idMatch) continue
    const id = idMatch[1]
    if (seen.has(id)) continue

    const title = fieldText(chunk, "job-item-title")
    if (!title) continue

    const hrefMatch = chunk.match(/href="(\/vacatures--[^"]+)"/)
    const url = hrefMatch ? BASE + decodeEntities(hrefMatch[1]).split("?")[0] : ""
    if (!url) continue

    seen.add(id)

    results.push({
      id,
      title,
      company: fieldText(chunk, "job-item-company-name"),
      location: fieldText(chunk, "job-item-location"),
      date: relativeToISO(fieldText(chunk, "job-item-timeago"), now),
      url,
      snippet: fieldText(chunk, "jobcard-content"),
    })
  }

  return results
}

/** Total number of matches StepStone reports for the query, when present. */
export function totalOffers(html: string): number | null {
  const m = html.match(/data-resultlist-offers-total="(\d+)"/)
  return m ? parseInt(m[1], 10) : null
}

/**
 * Parse a detail page from firecrawl markdown.
 *
 * The rendered posting starts at the level-1 heading (the job title), followed by a
 * bullet list of company, location, contract type and publication date, then the
 * employer's description.
 */
export function parseJobDetail(md: string, id: string, url: string): JobDetail {
  const titleMatch = md.match(/^#\s+(.+)$/m)
  const title = titleMatch ? titleMatch[1].replace(/\\([\\`*_[\]()|~])/g, "$1").trim() : "(untitled)"

  const afterTitle = titleMatch ? md.slice(md.indexOf(titleMatch[0]) + titleMatch[0].length) : md
  const bullets = [...afterTitle.slice(0, 1200).matchAll(/^-\s+(.+)$/gm)].map((m) =>
    textOf(m[1]).replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").trim(),
  )

  const company = bullets[0] || null
  const location = bullets[1] || null
  const employmentType = bullets.slice(2).find((b) => /contract|tijd|voltijds|deeltijds/i.test(b)) || null
  const published = bullets.find((b) => /gepubliceerd/i.test(b)) || null

  // Description.
  //
  // The employer's copy is the run of level-4 sections ("Introductie", "Jouw
  // profiel", "Ons aanbod", ... the names vary per employer, the level does not).
  // Everything before the first one is StepStone's own header chrome: logo image,
  // apply and save buttons, a repeated title line. Everything from "Soortgelijke
  // vacatures" onward is a list of other postings, which must not leak into this
  // job's description.
  let description: string | null = null
  const descStart = afterTitle.search(/^####\s+/m)
  let text = descStart === -1 ? afterTitle : afterTitle.slice(descStart)

  for (const stop of [
    /^####\s+Soortgelijke vacatures/m,
    /^##\s+\[/m,
    /^###\s+Over ons/m,
  ]) {
    const m = text.match(stop)
    if (m && m.index !== undefined && m.index > 100) text = text.slice(0, m.index)
  }

  text = text
    // Inline images, including multi-kilobyte data: URIs for loaders and heroes.
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    // StepStone's own action labels, which sit on their own lines.
    .replace(/^(?:Snel solliciteren|Ik ben ge[ïi]nteresseerd|Bewaren|Delen|Print)\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

  if (text) description = text

  const applyMatch = md.match(/\[(?:Snel solliciteren|Solliciteer[^\]]*)\]\((https?:\/\/[^)]+)\)/i)

  return {
    id,
    title,
    company,
    location,
    date: published,
    url,
    snippet: null,
    description,
    employmentType,
    applyUrl: applyMatch ? applyMatch[1] : null,
  }
}
