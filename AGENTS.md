# Agent / Claude Code best practices for this repo

## Temp files → /tmp

Write scratch files, intermediate outputs, and debug dumps to `/tmp`, not the project root.
Keeps the repo clean; no accidental commits of throwaway data.

```ts
const tmpFile = `/tmp/newtoad-debug-${Date.now()}.json`;
fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2));
```

## CSV data files stay out of root

Input CSVs (e.g. `companies.csv`, `saramin_companies.csv`) belong in `data/` or `/tmp`.
Root-level CSVs pollute `git status` and risk being committed.

## One-off scripts go in `scripts/`

Conversion scripts (`convert-saramin.ts`), backfill scripts (`backfill-colors.ts`), debug scripts (`debug-nav2.ts`) belong in `scripts/`.
They shouldn't live at root or in `src/`.

## `.env` is the only secrets file

Never hardcode API keys. Always load from `.env` via `dotenv/config`.
The scraper already exits early with a clear error if `ANTHROPIC_API_KEY` is missing — keep that pattern.

## SQLite DB lives in `data/`

Database files (`.db`, `.db-wal`, `.db-shm`) are gitignored.
`data/` dir is created at runtime by the scraper. Don't commit it.

## Scraper is idempotent

Check DB before scraping. `upsertCompany` handles re-runs.
`--force` flag exists to override. Default behavior: skip already-scraped.

## Screenshot both desktop and mobile

Every crawl saves `screenshot.png` (1280×800) and `screenshot-mobile.png` (390×844).
Generated sites follow the same convention under `gen/<uuid>/`.

## Generation output: UUID-namespaced folders

Each generation run → `data/websites/<domain>/gen/<uuid>/`.
Prevents collisions, preserves history, makes the gallery gallery-able.

## LLM adapter pattern

All LLM calls go through `src/llm/index.ts` — never import Anthropic/Gemini SDKs directly in business logic.
Swap providers by changing the adapter, not the callers.

## just for all run tasks

Add new recurring operations to `justfile`, not to `package.json` scripts.
`just --list` is the canonical entry point for contributors.

## Kill ports before starting

`just start` calls `just kill` first. Prevents "port already in use" surprises in dev.
Ports used: API `:3001`, Vite `:5173`.
