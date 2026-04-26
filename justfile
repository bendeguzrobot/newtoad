default:
  just --list

install:
  npm install
  npx playwright install chromium
  cd web && npm install

scrape input="companies.csv":
  npx tsx src/scraper/index.ts {{input}}

api:
  npx tsx src/api/server.ts

start:
  just api & cd web && npm run dev
