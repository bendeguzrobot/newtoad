default:
  just --list

install:
  npm install
  npx playwright install chromium
  cd web && npm install

scrape *args:
  npx tsx src/scraper/index.ts {{args}}

api:
  npx tsx src/api/server.ts

toadit url:
  npx tsx src/generate/toadit.ts {{url}}

start:
  just api & cd web && npm run dev
