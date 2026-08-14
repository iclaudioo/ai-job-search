# VDAB Vind een job endpoint and parsing reference

Verified live on 2026-08-04. Read this first if the CLI starts returning empty or
garbled results.

## Access

| Path | Direct fetch | Notes |
|------|--------------|-------|
| `/vindeenjob/jobs/<slug>` (search) | **200**, ~106 KB server-rendered HTML | Parsed natively. No dependencies. |
| `/vindeenjob/vacatures/<id>` (detail) | **200**, but only ~1.8 KB of visible text | Angular shell. The vacancy loads client-side. Rendered through firecrawl. |
| `/api/vindeenjob/*` | not requested | **Disallowed in robots.txt.** This CLI never calls it. |

### robots.txt, the parts that matter

```
Disallow: /api/vindeenjob/
Disallow: /include/vacature/
Disallow: /vac/
Disallow: /vacatures/          # the OLD path, not /vindeenjob/vacatures/
Disallow: /vindeenjob/prive/
```

`/vindeenjob/jobs/` and `/vindeenjob/vacatures/` are **not** disallowed. Note the trap:
the legacy `/vacatures/` path is disallowed while the current
`/vindeenjob/vacatures/<id>` path is not. They are different paths.

The JSON API that the Angular front end calls **is** disallowed, which is why the detail
command renders the public page rather than calling the API. That distinction is
deliberate; do not "optimise" it by pointing the CLI at the API.

## Search endpoint

```
https://www.vdab.be/vindeenjob/jobs/<keyword-slug>
```

The search is **path-based**. There is no query parameter: the keywords become the slug,
lowercased, accent-stripped, non-alphanumerics collapsed to hyphens. "Marketing Director"
becomes `marketing-director`.

Location variants exist on the site (`/vindeenjob/jobs/marketing-manager-limburg-provincie`
and `?f=provincie:oost-vlaanderen-provincie`) but are **not** used by the CLI: province
slugs are an undocumented vocabulary and a wrong guess silently returns an empty page.
`--location` filters client-side on the city instead.

The portal's own result count sits in:

```html
<div class="numbers-job"><strong> 12 </strong><span>jobs gevonden</span></div>
```

surfaced as `meta.totalMatches`.

## Search result structure

Plain, stable, server-rendered HTML. Each result:

```html
<div class="product-tile">
  <a class="product-link" href="https://www.vdab.be/vindeenjob/vacatures/73946345/marketing-director?trefwoord={trefwoordparam}&source=...">
    <h2 class="product-title">Marketing Director</h2>
    <div class="location-job"><strong>OXIDA</strong> in <strong>VEURNE</strong></div>
    <span class="type-contract">Vaste jobs</span>
    <span class="online-sinds">Online sinds  15 jun. 2026</span>
    <div class="product-description">...snippet...</div>
  </a>
</div>
```

| Field | Anchor |
|-------|--------|
| `id` | `/vindeenjob/vacatures/(\d+)` in the href |
| `title` | `<h2 class="product-title">` |
| `company` | first `<strong>` inside `.location-job` |
| `location` | second `<strong>` inside `.location-job` |
| `contractType` | `.type-contract` |
| `date` | `.online-sinds`, absolute Dutch date |
| `snippet` | `.product-description` |
| `url` | the href with its **query string discarded** |

### Gotchas

- **Unsubstituted templating tokens.** VDAB ships hrefs containing literal
  `{trefwoordparam}`, `{locatieparam}`, `{locatiecodeparam}` and even
  `?trefwoord={0} jobs voor marketing director gevonden` in an inline `onclick`. The
  query string is always stripped; only the canonical path is kept. There is a test
  asserting no `{` survives into the output.
- **Dates are absolute**, not relative: "15 jun. 2026". Month abbreviations are
  `jan feb mrt apr mei jun jul aug sep okt nov dec` (with `maa` accepted as an alternate
  for March). An unrecognised month returns `null` rather than a guessed date.
- **Non-vacancy tiles exist** on some pages (training courses under `/opleidingen/`).
  Tiles whose href does not match `/vindeenjob/vacatures/<id>` are skipped.

## Detail endpoint

```
https://www.vdab.be/vindeenjob/vacatures/<id>
```

The slugless form is canonical and resolves on its own, so a bare numeric ID is safe
here (unlike StepStone).

Rendered markdown structure:

```markdown
# Vind een job          <- VDAB site header, NOT the vacancy

# Marketing Director    <- the vacancy title

OXIDA voor een job inVEURNE
Online sinds: 15 jun 2026

##### Contract
- Vaste job
- Voltijds
##### Vereiste studies
- Professionele bachelor
##### Werkervaring
- Minstens 2 jaar ervaring

### Functieomschrijving
### Profiel
### Professionele vaardigheden
### Aanbod

#### <Company>
##### Bedrijfswebsite
```

Parsing contract:
- **Title comes from the LAST level-1 heading.** The page has two; the first is VDAB's
  own "Vind een job" chrome. Anchoring on the first returns the wrong title, which was a
  real bug caught during the live test. There is a regression test.
- Company and location come from the single line `<company> voor een job in<city>`. The
  renderer drops the space before the city, so the pattern tolerates it.
- `contract`, `education` and `experience` are the bullet lists under the level-5
  headings `Contract`, `Vereiste studies` and `Werkervaring`, returned as arrays. These
  are the most directly useful fields on any of the three Belgian portals for scoring
  fit.
- Description runs from `### Functieomschrijving` and stops at the first of
  `##### Bedrijfswebsite`, `#### ` (the company block) or `### Sociale media`. Without
  the cut, VDAB's company profile and social links land inside the description.
- The "Toon meer (12)" expander label is stripped.

## Content quality warnings

- **Broad keyword matching is the headline caveat.** A search for "marketing director"
  returned, among 12 results: a technical draughtsman, a senior IT programme manager, and
  several sales directors. VDAB matches loosely across its own occupation taxonomy. Any
  consumer of this CLI must filter on top.
- Interim and recruitment agencies dominate the senior listings. Expect the same
  underlying vacancy under several agency names with different IDs.
- Locations are uppercase in the results ("VEURNE", "SINT-JOOST-TEN-NODE"), so the
  `--location` filter matches case-insensitively.
