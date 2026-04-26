# Newtoad

Scrape Korean SME websites, analyze them with LLMs, and generate redesigned landing pages.

## What it does

1. **Ingest** — takes a CSV of company names (and optional URLs)
2. **Scrape** — Playwright crawls each site: screenshot, assets, metadata
3. **Analyze** — LLM (Claude/Gemini) scores design quality, SEO, extracts colors/mood
4. **Generate** — Claude writes a new website for the company on demand
5. **Gallery** — React/Vite UI to browse, sort, and compare originals vs generated

## Prerequisites

- Node.js 20+
- [just](https://github.com/casey/just)
- API keys: `ANTHROPIC_API_KEY`, optionally `GEMINI_API_KEY`

## Setup

```bash
cp .env.example .env   # add your API keys
just install
```

`.env` needs:
```
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=...       # optional, fallback LLM
```

## Usage

```bash
just start                          # API on :3001 + Vite dev on :5173
just scrape companies.csv           # scrape from CSV
just scrape companies.csv --force   # re-scrape already-done entries
just scrape --from-folder data/     # re-analyze from saved snapshots
just toadit https://example.com     # generate new site for one URL
just kakao                          # Kakao-specific scraper
just gradient                       # backfill gradient extraction
just kill                           # kill API + Vite processes
```

## CSV format

Minimum:
```csv
name
삼성전자
LG화학
```

With URL (skips search step):
```csv
name,url
삼성전자,https://www.samsung.com/sec
```

## Data layout

```
data/
  newtoad.db                  # SQLite database
  websites/
    example.com/
      screenshot.png
      screenshot-mobile.png
      metadata.json
      assets/
      gen/
        <uuid>/               # generated site versions
          index.html
          screenshot.png
          screenshot-mobile.png
```

## Architecture

```
src/
  scraper/    Playwright crawler, color extractor, web search
  llm/        Anthropic + Gemini adapters
  generate/   Website generation worker + toadit CLI
  api/        Express REST API
  db.ts       SQLite schema + queries
web/          React + Vite + Tailwind frontend
```

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/companies` | List all (with pagination/sort) |
| GET | `/companies/:id` | Single company detail |
| POST | `/generate/:id` | Trigger website generation |
| GET | `/generations/:id` | Generation status + result |
