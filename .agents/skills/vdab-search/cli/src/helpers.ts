// Data source: VDAB "Vind een job", the Flemish public employment service's job bank
// (https://www.vdab.be/vindeenjob).
//
// Two different access situations:
//
//   search  - https://www.vdab.be/vindeenjob/jobs/<keyword-slug> is server-rendered
//             plain HTML and answers a direct fetch. Parsed natively, no dependencies.
//   detail  - https://www.vdab.be/vindeenjob/vacatures/<id> is an Angular shell. The
//             posting itself is loaded client-side, so a direct fetch returns 46 KB of
//             navigation and no vacancy. Rendered through the `firecrawl` CLI instead.
//
// robots.txt note: VDAB disallows `/api/vindeenjob/`, the JSON endpoint the Angular app
// calls. This CLI never requests that endpoint. It fetches the two public HTML pages,
// which are not disallowed, and lets the renderer load the page the way a browser does.

export const BASE = "https://www.vdab.be"
export const SEARCH_PATH = "/vindeenjob/jobs"
export const DETAIL_PATH = "/vindeenjob/vacatures"

export const DEFAULT_WAIT_MS = 6000

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
  contractType: string | null
  snippet: string | null
}

export interface JobDetail extends JobCard {
  description: string | null
  contract: string[]
  education: string[]
  experience: string[]
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
        "Accept-Language": "nl-BE,nl;q=0.9,en;q=0.8",
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
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return response.text()
  }
  throw new Error("Request failed after max retries")
}

/** Render a page through the firecrawl CLI. Used only for detail pages. */
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
        "the `firecrawl` CLI is not installed or not on PATH. VDAB detail pages render " +
          "client-side and cannot be read without it (search still works)",
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
        "the `firecrawl` CLI is not installed or not on PATH. VDAB detail pages render " +
          "client-side and cannot be read without it (search still works)",
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

export function textOf(html: string): string {
  return decodeEntities(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " "),
  ).trim()
}

/** Turn a free-text query into VDAB's URL slug ("Marketing Director" -> "marketing-director"). */
export function slugify(query: string): string {
  return query
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mrt: 3, maa: 3, apr: 4, mei: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, okt: 10, nov: 11, dec: 12,
}

/**
 * Parse VDAB's absolute Dutch date format ("15 jun. 2026", "3 okt 2026") to ISO.
 * Returns null on an unrecognised month rather than guessing.
 */
export function dutchDateToISO(label: string | null): string | null {
  if (!label) return null
  const m = label.match(/(\d{1,2})\s+([a-z]{3,4})\.?\s+(\d{4})/i)
  if (!m) return null
  const month = MONTHS[m[2].toLowerCase().slice(0, 3)]
  if (!month) return null
  const day = parseInt(m[1], 10)
  const year = parseInt(m[3], 10)
  if (day < 1 || day > 31) return null
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

export function ageInDays(isoDate: string | null, now: Date): number | null {
  if (!isoDate) return null
  const then = Date.parse(isoDate + "T00:00:00Z")
  if (Number.isNaN(then)) return null
  return Math.floor((now.getTime() - then) / 86400000)
}

export function idFromUrl(url: string): string | null {
  const m = url.match(/\/vindeenjob\/vacatures\/(\d+)/)
  return m ? m[1] : null
}

/**
 * Parse the search results page.
 *
 * Each result is a `<div class="product-tile">` wrapping a single `<a class="product-link">`.
 * The markup is plain server-rendered HTML with stable class names, so a chunked
 * split plus per-field regexes is enough. Each chunk is parsed independently so one
 * malformed tile cannot break the rest.
 */
export function parseJobCards(html: string): JobCard[] {
  const results: JobCard[] = []
  const seen = new Set<string>()
  const chunks = html.split(/(?=<div class="product-tile")/).slice(1)

  for (const chunk of chunks) {
    const hrefMatch = chunk.match(/href="(https?:\/\/[^"]*\/vindeenjob\/vacatures\/\d+[^"]*)"/)
    if (!hrefMatch) continue

    // VDAB leaves unsubstituted templating tokens in these hrefs
    // ({trefwoordparam}, {0}), so the query string is always discarded.
    const url = decodeEntities(hrefMatch[1]).split("?")[0]
    const id = idFromUrl(url)
    if (!id || seen.has(id)) continue

    const title = pick(chunk, /<h2[^>]*class="product-title"[^>]*>([\s\S]*?)<\/h2>/)
    if (!title) continue
    seen.add(id)

    // The company and city sit in two <strong> elements inside .location-job,
    // separated by the literal word "in".
    let company: string | null = null
    let location: string | null = null
    const locBlock = chunk.match(/<div[^>]*class="location-job"[^>]*>([\s\S]*?)<\/div>/)
    if (locBlock) {
      const strongs = [...locBlock[1].matchAll(/<strong>([\s\S]*?)<\/strong>/g)].map((m) =>
        textOf(m[1]),
      )
      company = strongs[0] || null
      location = strongs[1] || null
    }

    results.push({
      id,
      title,
      company,
      location,
      date: dutchDateToISO(pick(chunk, /class="online-sinds"[^>]*>([\s\S]*?)<\/span>/)),
      url,
      contractType: pick(chunk, /class="type-contract"[^>]*>([\s\S]*?)<\/span>/),
      snippet: pick(chunk, /<div[^>]*class="product-description"[^>]*>([\s\S]*?)<\/div>/),
    })
  }

  return results
}

function pick(html: string, re: RegExp): string | null {
  const m = html.match(re)
  if (!m) return null
  return textOf(m[1]) || null
}

/** Total number of matches VDAB reports for the query, when present. */
export function totalJobs(html: string): number | null {
  const m = html.match(/<div[^>]*class="numbers-job"[^>]*>[\s\S]{0,200}?<strong>\s*(\d+)\s*<\/strong>/)
  return m ? parseInt(m[1], 10) : null
}

/** Collect the bullet items under a markdown heading, stopping at the next heading. */
function bulletsUnder(md: string, heading: string): string[] {
  const re = new RegExp(`^#{2,6}\\s+${heading}\\s*$`, "im")
  const m = md.match(re)
  if (!m || m.index === undefined) return []
  const after = md.slice(m.index + m[0].length)
  const section = after.split(/^#{2,6}\s+/m)[0]
  return [...section.matchAll(/^-\s+(.+)$/gm)].map((b) => b[1].trim()).filter(Boolean)
}

/**
 * Parse a detail page from firecrawl markdown.
 *
 * VDAB's rendered posting is unusually well structured: a level-1 title, a company and
 * location line, an "Online sinds" line, then labelled requirement sections and the
 * employer's own copy. The requirement sections are captured as arrays because they are
 * exactly the fields a fit assessment needs.
 */
export function parseJobDetail(md: string, id: string, url: string): JobDetail {
  // The page carries more than one level-1 heading: VDAB's own "Vind een job" site
  // header comes first, the vacancy title second. Anchoring on the first h1 returns
  // the chrome, so we take the last one, which is the posting.
  const h1s = [...md.matchAll(/^#\s+(.+)$/gm)]
  const titleMatch = h1s.length > 0 ? h1s[h1s.length - 1] : null
  const title = titleMatch
    ? titleMatch[1].replace(/\\([\\`*_[\]()|~])/g, "$1").trim()
    : "(untitled)"
  const after =
    titleMatch && titleMatch.index !== undefined
      ? md.slice(titleMatch.index + titleMatch[0].length)
      : md

  // "OXIDA voor een job inVEURNE" - the renderer drops the space before the city.
  let company: string | null = null
  let location: string | null = null
  const who = after.match(/^(.+?)\s+voor een job in\s*(.+?)$/m)
  if (who) {
    company = who[1].trim() || null
    location = who[2].trim() || null
  }

  const date = dutchDateToISO(after.match(/Online sinds:?\s*([^\n]+)/)?.[1] ?? null)

  const contract = bulletsUnder(after, "Contract")
  const education = bulletsUnder(after, "Vereiste studies")
  const experience = bulletsUnder(after, "Werkervaring")

  // Description: from the employer's own first section to the company block that
  // closes the posting. Without the cut, VDAB's company profile and social links
  // land inside the description.
  let description: string | null = null
  const descStart = after.search(/^###\s+Functieomschrijving/m)
  if (descStart !== -1) {
    let text = after.slice(descStart)
    for (const stop of [/^#####\s+Bedrijfswebsite/m, /^####\s+/m, /^###\s+Sociale media/m]) {
      const s = text.match(stop)
      if (s && s.index !== undefined && s.index > 100) text = text.slice(0, s.index)
    }
    description =
      text
        .replace(/^Toon meer \(\d+\)\s*$/gm, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim() || null
  }

  return {
    id,
    title,
    company,
    location,
    date,
    url,
    contractType: contract[0] ?? null,
    snippet: null,
    description,
    contract,
    education,
    experience,
  }
}
