default:
  just --list

install:
  npm install
  npx playwright install chromium
  cd web && npm install

scrape input="companies.csv":
  npx ts-node src/scraper/index.ts {{input}}

api:
  npx ts-node src/api/server.ts

start:
  just api & cd web && npm run dev
