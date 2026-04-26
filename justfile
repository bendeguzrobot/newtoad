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

kakao *args:
  npx tsx src/scraper/kakao-scraper.ts {{args}}

gradient *args:
  npx tsx src/scraper/gradient-all.ts {{args}}

kill:
  #!/usr/bin/env bash
  for pid in $(lsof -ti tcp:3001 tcp:5173 2>/dev/null); do
    echo "Killing $pid"
    kill -9 $pid 2>/dev/null || true
  done
  pkill -f "tsx src/api/server.ts" 2>/dev/null || true
  pkill -f "vite" 2>/dev/null || true
  echo "Done"

start:
  #!/usr/bin/env bash
  set -e
  just kill 2>/dev/null || true
  sleep 0.5
  npx tsx src/api/server.ts &
  cd web && npm run dev
