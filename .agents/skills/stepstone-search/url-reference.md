# StepStone Belgium endpoint and parsing reference

Verified live on 2026-08-04. Read this first if the CLI starts returning empty or
garbled results.

## Access

| Path | Direct fetch | Notes |
|------|--------------|-------|
| `/vacatures/?q=<kw>` (search) | **200**, ~160 KB HTML | Parsed natively. No dependencies. |
| `/vacatures--<slug>--<id>-inline.html` (detail) | **403**, ~440 KB | Bot-manager challenge page. Rendered through firecrawl instead. |
| `/vacatures--<slug>--<id>.html` (detail, no `-inline`) | **403** | Same. |
| `/5/index.cfm?event=offerView.dsp&id=<id>` | **302** to an obfuscated path | Bot-manager redirect. Not used. |

### robots.txt, the part that matters

```
Disallow: /*?*
...
Disallow: /vacatures/*?*
Allow:    /vacatures/*?q=*
Disallow: /vacatures/*?q*&*
```

A **single** `q` parameter on `/vacatures/` is explicitly allowed. `q` combined with
anything else is explicitly disallowed. That is the whole reason this CLI sends one
parameter and filters location and posting age client-side, and why `--page` is refused
with `PAGINATION_UNSUPPORTED` instead of being implemented: the pagination URL StepStone
itself links to is `/vacatures/<slug>?page=N`, which the rule above disallows.

Detail URLs use the `/vacatures--` prefix (double hyphen, no slash), which is a different
path from `/vacatures/` and is not covered by those rules.

## Search endpoint

```
https://www.stepstone.be/vacatures/?q=<urlencoded keywords>
```

Returns roughly 25 job cards per request. The page also carries the portal's own total:

```html
data-resultlist-offers-total="328"
```

which the CLI surfaces as `meta.totalMatches` so a truncated result set is visible.

## Search result structure

Each result is an `<article>` with a stable id and anchor:

```html
<article ... id="job-item-2229955" data-at="job-item" data-testid="job-item">
```

Field anchors, all `data-at` attributes:

| Field | Anchor |
|-------|--------|
| `id` | `id="job-item-(\d+)"` |
| `title` | `data-at="job-item-title"` |
| `company` | `data-at="job-item-company-name"` |
| `location` | `data-at="job-item-location"` |
| `date` | `data-at="job-item-timeago"`, relative label inside a `<time>` element |
| `snippet` | `data-at="jobcard-content"` |
| `url` | the card's `href="/vacatures--..."`, made absolute |

### Two traps this markup sets

**1. Duplicate anchors, icon first.** `job-item-company-name` and `job-item-location`
each appear twice per card: once on the `<svg>` icon container, once on the text span.
Taking the first occurrence returns SVG path data. `fieldText` walks every occurrence
and returns the first that yields non-empty text after stripping.

**2. Field boundaries fall inside tags.** A field's text ends where the next `data-at="`
begins, but that anchor sits *inside* an opening tag. Cutting there leaves a half-open
`<span class="res-x"` that no tag-stripping regex can match, and it lands in the output
as literal markup. `fieldText` backs up to the last `<` before the boundary. This was a
real bug caught during the live test, and there is a regression test for it.

On top of that, StepStone inlines an emotion-css `<style>` block before almost every
element, so `textOf` removes `<style>` and `<svg>` blocks before stripping tags.

## Detail endpoint

```
https://www.stepstone.be/vacatures--<slug>-<location>-<company>--<id>-inline.html
```

**The full URL is required.** `/vacatures--<id>-inline.html` (built from the ID alone)
was verified to return StepStone's own error page: "Je probeert toegang te krijgen tot
een pagina waartoe je geen machtiging hebt. Fout 403: toegang geweigerd". A bare ID is
therefore rejected up front with `NEEDS_FULL_URL` rather than turned into a URL that
fails silently.

Rendered markdown structure:

```markdown
# <job title>

- <company>
- <location>
- <contract type>
- Gepubliceerd: <relative date>

... StepStone chrome: logo image, apply and save buttons, repeated title ...

#### Introductie
#### Jouw verantwoordelijkheden
#### Jouw profiel
#### Ons aanbod
#### Locatie
### In het kort
### Over ons
#### Soortgelijke vacatures
## [another posting](...)
```

Parsing contract:
- Title from the level-1 heading.
- Company, location and contract type from the bullet list right below it.
- Description is the run of **level-4 sections**. Section names vary per employer, the
  heading level does not, so the parser anchors on the level and not on the names.
- Extraction stops at `#### Soortgelijke vacatures`, `### Over ons`, or the first
  `## [` (the related-postings list). Without that cut, other companies' vacancies leak
  into this job's description.
- Markdown images are removed before output. StepStone embeds multi-kilobyte
  `data:image/svg+xml` URIs for loaders and hero images.
- StepStone's own action labels ("Snel solliciteren", "Ik ben geïnteresseerd", "Bewaren")
  are stripped as standalone lines.

### Error pages arrive with HTTP 200

Through the renderer, a blocked or withdrawn posting comes back as a normal page whose
content is an error message. `detail` therefore inspects the parsed description for
"Fout 403", "toegang geweigerd" or "geen machtiging" and reports `BLOCKED`.

## Content quality warnings

- Recruitment agencies (Michael Page, Robert Half, Hays, Sander, Bright Plus, Adecco)
  account for a large share of listings. The same vacancy often appears under several
  agency names with different IDs, which dedup on ID alone will not catch.
- Locations are inconsistently cased and formatted: "Antwerpen", "ANTWERPEN",
  "Antwerpen, BE, 2030", "Destelbergen of Gent". The `--location` filter matches
  case-insensitively on substrings for that reason.
