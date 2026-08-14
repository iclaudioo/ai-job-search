# Search Queries for Job Scraper

## Installed portal CLIs (primary for `/scrape`)

`/scrape` discovers every portal skill under `.agents/skills/*/SKILL.md` and runs its CLI first. Shipped country-agnostic CLIs include `linkedin-search` and `freehire-search`; Danish demos and any skill you add with `/add-portal` are included the same way. You do **not** need a matching `site:` line below for those CLIs to run.

De Deense portal-CLI's (jobindex, jobbank, jobdanmark, jobnet) zijn irrelevant voor de Belgische markt: negeren.

Belgische CLI's, gebouwd met `/add-portal` op 2026-08-04:

| Skill | Zoeken | Detail | Let op |
|-------|--------|--------|--------|
| `linkedin-search` | native | native | Breedste dekking op senior niveau |
| `jobat-search` | via firecrawl | via firecrawl | Jobat blokkeert alle directe requests met Cloudflare. Trage calls, houd `--limit` laag |
| `stepstone-search` | native | via firecrawl | Geen paginatie: robots.txt verbiedt `q` samen met een tweede parameter |
| `vdab-search` | native | via firecrawl | Breedste aanbod maar losse keyword-matching, veel ruis. `detail` geeft contract, studies en ervaring als aparte velden |

`jobat-search`, `stepstone-search` en `vdab-search` hebben de **firecrawl CLI** nodig voor `detail` (Jobat ook voor `search`). Ontbreekt firecrawl, dan blijft zoeken werken op StepStone en VDAB, en falen de detailcalls met een expliciete foutmelding in plaats van stil leeg te lopen. Elke zoekhit bevat een snippet, dus een fitinschatting kan ook zonder detail.

The `site:` query templates in this file are the **WebSearch fallback**: for portals without a CLI, company career pages, or when a CLI fails. Merk op dat Jobat de WebSearch- en WebFetch-user-agents blokkeert, dus voor dat board is de CLI de enige werkende weg.

## Search Sites

Primary (Belgische job boards):
- **vdab.be** - grootste Vlaamse vacaturebank
- **jobat.be** - groot Vlaams job board, sterk in marketing- en managementprofielen
- **linkedin.com/jobs** - LinkedIn (filter: België / Limburg / Vlaams-Brabant); also covered by `linkedin-search` CLI
- **stepstone.be** - sterk in senior en managementrollen
- **indeed.be** - breed aanbod (optioneel)

Secondary (company career pages via Google):
- Direct Google searches with `site:` filters for known target companies (KBC, energie- en telcospelers, B2B-scale-ups)

## Query Categories

Queries are grouped by priority. Combineer elke query met locatietermen (Limburg, Vlaams-Brabant, Hasselt, Leuven, Antwerpen, Brussel) waar de site dat ondersteunt.

### Priority 1: Value proposition / propositie

Sterkste en meest gewenste richting.

```
site:jobat.be "value proposition" OR "propositiemanager" OR "proposition manager"
site:vdab.be "value proposition manager" OR "propositie"
site:linkedin.com/jobs "value proposition manager" België
site:linkedin.com/jobs "proposition lead" OR "propositions" Belgium
site:stepstone.be "value proposition" marketing
```

### Priority 2: Marketing director / strategie

Marketingleiderschap met strategisch mandaat.

```
site:jobat.be "marketing director" OR "head of marketing" OR "marketingdirecteur" Limburg OR "Vlaams-Brabant"
site:vdab.be "marketing manager" strategie B2B
site:linkedin.com/jobs "head of marketing" B2B Vlaanderen
site:stepstone.be "marketing director" OR "marketingverantwoordelijke" België
```

### Priority 3: Strategisch adjacente rollen

Rollen waar het propositie- en gedragsprofiel direct inzetbaar is.

```
site:jobat.be "go-to-market" OR "product marketing lead" OR "brand strategist"
site:linkedin.com/jobs "customer experience" strategie manager België
site:linkedin.com/jobs "growth" "behavioural" OR "behavioral" Belgium
site:vdab.be "business development manager" strategie B2B Limburg
```

### Priority 4: Breder net, consulting en interim

```
site:linkedin.com/jobs "marketing strategy consultant" Belgium hybrid
site:jobat.be "strategisch consultant" marketing
site:linkedin.com/jobs "fractional CMO" OR "interim marketing director" Belgium
```

## Location Filter

When evaluating results, verify the job location is within reasonable commute distance from Lummen. Define acceptable areas:
- Ideaal: Limburg en Vlaams-Brabant (Hasselt, Diest, Leuven, Genk, Aarschot)
- Aanvaardbaar: Antwerpen, Mechelen, Brussel (mits hybride)
- Aanvaardbaar: elders in Vlaanderen mits grotendeels remote/hybride
- Borderline: Gent en Oost-Vlaanderen voltijds op kantoor (~1u15 rijden)
- Te ver: West-Vlaanderen of Wallonië voltijds op kantoor; alles met verhuis

## Date Filter

Only include jobs posted within the last 14 days, or with an application deadline that has not yet passed. If a posting date cannot be determined, include it but flag as "date unknown".

## Adapting Queries

If the user specifies a focus area, select queries from the matching category and also generate 2-3 custom queries for that focus. For example:
- "/scrape [focus_area]" -> relevant category queries + custom focus-specific queries
