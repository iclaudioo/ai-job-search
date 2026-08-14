// Data source: Jobat.be public job-search pages (https://www.jobat.be/nl/jobs/results).
//
// Jobat sits behind Cloudflare bot protection that returns HTTP 403 to every
// non-browser client, including plain `fetch`, curl, and even requests for the
// sitemap that jobat.be's own robots.txt advertises. Their robots.txt does NOT
// disallow /nl/jobs*, so the block is a blanket anti-bot measure rather than a
// path-level rule.
//
// Because of that, this CLI does not fetch Jobat directly. It shells out to the
// `firecrawl` CLI, which renders the page in a real browser and returns markdown.
// That markdown is highly regular (see url-reference.md), so we parse it with
// line-oriented regexes rather than an HTML parser.
//
// This is a deliberate deviation from the repo's zero-runtime-dependency default:
// `firecrawl` must be installed and authenticated. Everything else is plain bun.

export const BASE = "https://www.jobat.be"
export const SEARCH_URL = `${BASE}/nl/jobs/results`

/** Jobat renders results client-side; give the page time to settle. */
export const DEFAULT_WAIT_MS = 8000

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

export interface JobCard {
  id: string
  title: string
  company: string | null
  companyUrl: string | null
  location: string | null
  date: string | null
  url: string
  contractType: string | null
  salary: string | null
}

export interface JobDetail extends JobCard {
  description: string | null
  applyUrl: string | null
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"

/**
 * Direct fetch, used only when the caller passes --native. Kept so the CLI can
 * skip firecrawl for free if Jobat ever drops the block. Returns null when the
 * response looks like a Cloudflare interstitial rather than a real page.
 */
export async function nativeFetch(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "nl-BE,nl;q=0.9,en;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) return null
    const body = await response.text()
    if (/Attention Required|cf-browser-verification|__cf_chl/i.test(body)) return null
    return body
  } catch {
    return null
  }
}

/**
 * Render a page through the firecrawl CLI and return its markdown.
 * Retries with backoff on transient failure; distinguishes "firecrawl is not
 * installed" from "the scrape failed" so the error message is actionable.
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
          "--wait-for",
          String(waitMs),
        ],
        { stdout: "pipe", stderr: "pipe" },
      )
    } catch {
      throw new Error(
        "the `firecrawl` CLI is not installed or not on PATH. Jobat is behind " +
          "Cloudflare and cannot be fetched without it (install: npm i -g @mendable/firecrawl-cli)",
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
        "the `firecrawl` CLI is not installed or not on PATH. Jobat is behind " +
          "Cloudflare and cannot be fetched without it",
      )
    }
    if (/api key|unauthor|401|403/i.test(stderr)) {
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

/** Fetch a Jobat page as markdown, optionally trying a direct fetch first. */
export async function fetchMarkdown(
  url: string,
  waitMs: number,
  native: boolean,
): Promise<string> {
  if (native) {
    const html = await nativeFetch(url)
    if (html) return htmlToMarkdownish(html)
  }
  return firecrawlMarkdown(url, waitMs)
}

/**
 * Minimal HTML → markdown-ish conversion, used only on the --native path so the
 * same parsers work. Deliberately crude: it only needs to survive if Cloudflare
 * is ever lifted, and the firecrawl path stays the tested default.
 */
function htmlToMarkdownish(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, t) => `\n## ${stripTags(t)}\n`)
    .replace(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, h, t) => `[${stripTags(t)}](${h})`)
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, t) => `\n- ${stripTags(t)}`)
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
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

function codePoint(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

/**
 * Strip markdown emphasis, undo the backslash escaping firecrawl applies to
 * markdown punctuation (a title like "Manager | Retail" arrives as
 * "Manager \| Retail"), and collapse whitespace.
 */
function plain(s: string): string {
  return decodeEntities(
    s
      .replace(/\*\*/g, "")
      .replace(/\\([\\`*_{}[\]()#+\-.!|>~])/g, "$1")
      .replace(/\s+/g, " ")
      .trim(),
  )
}

/** Jobat job URLs end in /job_<id>. */
export function idFromUrl(url: string): string | null {
  const m = url.match(/\/job_(\d+)/)
  return m ? m[1] : null
}

/**
 * Convert Jobat's relative posting label ("vandaag", "6 dagen", "1 maand") to an
 * ISO date. `now` is injected so the conversion is testable and deterministic.
 * Returns null for labels we cannot map rather than guessing a date.
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

  // Dutch plurals are not simple suffixes: "weken" does not contain "week",
  // "jaren" does not contain "jaar", "uren" does not contain "uur". Each unit
  // therefore needs both forms spelled out rather than a substring check.
  if (/vandaag|zonet|minu(?:u)?t(?:en)?|u(?:u)?r(?:en)?/.test(text)) return iso(now)
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

/** Days between an ISO date and `now`, or null when the date is unknown. */
export function ageInDays(isoDate: string | null, now: Date): number | null {
  if (!isoDate) return null
  const then = Date.parse(isoDate + "T00:00:00Z")
  if (Number.isNaN(then)) return null
  return Math.floor((now.getTime() - then) / 86400000)
}

/**
 * Parse the search-results markdown.
 *
 * Each result is a level-2 heading holding the title and job URL, followed by a
 * bullet list (company link, location, contract type) and an optional
 * "Sinds **<relative date>**" line. We split on the heading and parse each chunk
 * independently so one malformed entry cannot break the rest.
 */
export function parseSearchMarkdown(md: string, now: Date): JobCard[] {
  const results: JobCard[] = []
  const seen = new Set<string>()
  const chunks = md.split(/\n##\s+/).slice(1)

  for (const chunk of chunks) {
    const head = chunk.match(/^\[([^\]]+)\]\((https?:\/\/[^)]*\/job_\d+)\)/)
    if (!head) continue

    const title = plain(head[1])
    const url = head[2].split("?")[0]
    const id = idFromUrl(url)
    if (!id || !title || seen.has(id)) continue
    seen.add(id)

    // Body runs until the next heading of any level.
    const body = chunk.slice(head[0].length).split(/\n#{2,3}\s/)[0]
    const bullets = [...body.matchAll(/^-\s+(.+)$/gm)].map((m) => m[1].trim())

    let company: string | null = null
    let companyUrl: string | null = null
    if (bullets.length > 0) {
      const link = bullets[0].match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)/)
      if (link) {
        company = plain(link[1])
        companyUrl = link[2].split("?")[0]
      } else {
        company = plain(bullets[0]) || null
      }
    }

    const location = bullets.length > 1 ? plain(bullets[1]) || null : null
    const contractType = bullets.length > 2 ? plain(bullets[2]) || null : null

    const salaryMatch = body.match(/^(Van\s+\*\*.+?per\s+\w+|\*\*€[^\n]+)$/m)
    const salary = salaryMatch ? plain(salaryMatch[1]) : null

    const sinds = body.match(/Sinds\s+\*\*([^*]+)\*\*/)
    const date = relativeToISO(sinds ? sinds[1] : null, now)

    results.push({ id, title, company, companyUrl, location, date, url, contractType, salary })
  }

  return results
}

/**
 * Parse a job detail page.
 *
 * The rendered page carries a lot of site chrome before the posting itself. The
 * posting starts at the level-2 heading immediately followed by a
 * "### Functieomschrijving" section, and ends at Jobat's own call-to-action.
 */
export function parseDetailMarkdown(md: string, id: string, url: string): JobDetail {
  const start = md.search(/\n##\s+[^\n]+\n+###\s+Functieomschrijving/)
  const body = start === -1 ? md : md.slice(start + 1)

  const titleMatch = body.match(/^##\s+(.+)$/m)
  const title = titleMatch ? plain(titleMatch[1]) : "(untitled)"

  let description: string | null = null
  const descStart = body.indexOf("### Functieomschrijving")
  if (descStart !== -1) {
    let text = body.slice(descStart)
    // Cut Jobat's trailing conversion funnel and related-jobs blocks.
    const stops = [
      "Maak je Jobat profiel aan",
      "## Anderen bekeken ook",
      "## Solliciteer",
      "Job alert",
    ]
    for (const stop of stops) {
      const i = text.indexOf(stop)
      if (i > 0) text = text.slice(0, i)
    }
    description =
      decodeEntities(text)
        .replace(/\n{3,}/g, "\n\n")
        .trim() || null
  }

  const applyMatch = body.match(/\[(?:Solliciteer[^\]]*)\]\((https?:\/\/[^)]+)\)/i)

  return {
    id,
    title,
    company: null,
    companyUrl: null,
    location: null,
    date: null,
    url,
    contractType: null,
    salary: null,
    description,
    applyUrl: applyMatch ? applyMatch[1] : null,
  }
}
