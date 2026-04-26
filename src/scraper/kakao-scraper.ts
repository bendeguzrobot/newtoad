import proj4 from 'proj4';
import { chromium } from 'playwright';
import axios from 'axios';
import { getDb, upsertCompany } from '../db.js';

// WCONGNAMUL = Kakao's internal coordinate system (EPSG:5181)
proj4.defs(
  'WCONGNAMUL',
  '+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=500000 ' +
    '+ellps=bessel +units=m +no_defs +towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43',
);

// Categories that are clearly not medical — skip these
const NON_MEDICAL_CATEGORIES = new Set([
  '카페', '커피', '편의점', '마트', '대형마트', '슈퍼마켓',
  '음식점', '한식', '중식', '일식', '양식', '분식', '치킨', '피자',
  '햄버거', '패스트푸드', '술집', '호프', '노래방', 'PC방',
  '미용실', '헤어샵', '네일샵', '은행', '주유소', '세탁소',
  '헬스장', '피트니스', '스포츠', '호텔', '모텔', '펜션',
]);

interface KakaoPlace {
  confirmid: string;
  name: string;
  x?: number;
  y?: number;
  address?: string;
  roadAddress?: string;
  category?: string;
}

interface PlaceDetail {
  website?: string;
  phone?: string;
  address?: string;
}

function toWCONGNAMUL(lat: number, lon: number): [number, number] {
  return proj4('EPSG:4326', 'WCONGNAMUL', [lon, lat]) as [number, number];
}

function fromWCONGNAMUL(x: number, y: number): [number, number] {
  const [lon, lat] = proj4('WCONGNAMUL', 'EPSG:4326', [x, y]) as [number, number];
  return [lat, lon];
}

async function fetchDetail(placeId: string): Promise<PlaceDetail> {
  try {
    const r = await axios.get(`https://place-api.map.kakao.com/places/panel3/${placeId}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 Chrome/112.0.0.0 Mobile Safari/537.36',
        Referer: 'https://map.kakao.com/',
        Accept: 'application/json',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        pf: 'MW',
      },
      timeout: 12000,
    });
    const data = r.data;
    const summary = data.summary || {};
    const addrObj = summary.address || {};
    const homepages: string[] = summary.homepages || [];
    const phones: Array<{ tel?: string }> = summary.phone_numbers || [];
    return {
      website: homepages[0]?.trim() || undefined,
      phone: phones[0]?.tel?.trim() || undefined,
      address: (addrObj.road || addrObj.disp || '').trim() || undefined,
    };
  } catch {
    return {};
  }
}

function initProgressTable() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS kakao_scrape_progress (
      grid_key TEXT PRIMARY KEY,
      keyword TEXT NOT NULL,
      scraped_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

function isGridDone(gridKey: string): boolean {
  const db = getDb();
  const row = db.prepare('SELECT 1 FROM kakao_scrape_progress WHERE grid_key = ?').get(gridKey);
  return !!row;
}

function markGridDone(gridKey: string, keyword: string) {
  const db = getDb();
  db.prepare(
    'INSERT OR REPLACE INTO kakao_scrape_progress (grid_key, keyword) VALUES (?, ?)',
  ).run(gridKey, keyword);
}

function isPlaceScraped(placeId: string): boolean {
  const db = getDb();
  return !!db.prepare('SELECT 1 FROM companies WHERE domain = ?').get(`place.map.kakao.com/${placeId}`);
}

async function scrapeGrid(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  gridX: number,
  gridY: number,
  lat: number,
  lon: number,
  keyword: string,
): Promise<KakaoPlace[]> {
  const [cx, cy] = toWCONGNAMUL(lat, lon);
  const urlX = Math.round(cx * 2.5);
  const urlY = Math.round(cy * 2.5);

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Linux; Android 10; SM-G981B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.162 Mobile Safari/537.36',
    viewport: { width: 360, height: 800 },
  });
  const page = await context.newPage();

  const apiPages: Array<{ placeList?: KakaoPlace[] }> = [];
  page.on('response', async (resp) => {
    if (resp.url().includes('searchJson')) {
      try {
        apiPages.push(await resp.json());
      } catch {}
    }
  });

  const encodedKw = encodeURIComponent(keyword);
  const mapUrl = `https://m.map.kakao.com/actions/searchView?q=${encodedKw}&wx=${urlX}&wy=${urlY}&level=4`;

  try {
    try {
      await page.goto(mapUrl, { timeout: 15000, waitUntil: 'domcontentloaded' });
    } catch (e) {
      console.error(`  goto error (${gridX},${gridY}): ${e}`);
    }

    await page.waitForTimeout(3000);

    // Paginate via "더보기" (more results)
    for (let i = 0; i < 20; i++) {
      try {
        const moreBtn = page.locator(".link_more[data-type='place'], .btn_more, button:has-text('더보기')");
        if ((await moreBtn.count()) === 0 || !(await moreBtn.first().isVisible())) break;
        await moreBtn.first().click();
        await page.waitForTimeout(1500);
      } catch {
        break;
      }
    }

    // Collect from API responses
    const unique = new Map<string, KakaoPlace>();
    for (const data of apiPages) {
      for (const place of data.placeList || []) {
        const pid = String((place as any).confirmid || '');
        if (pid && !unique.has(pid)) unique.set(pid, place);
      }
    }

    // HTML fallback — extract data-id, coords, title, category
    const html = await page.content();
    const itemRe =
      /data-id="(\d+)"[^>]*data-wx="(\d+)"[^>]*data-wy="(\d+)"[^>]*data-title="([^"]+)"[\s\S]*?(?:<span[^>]*class="[^"]*txt_ginfo[^"]*"[^>]*>([\s\S]*?)<\/span>)?/g;
    let m: RegExpExecArray | null;
    while ((m = itemRe.exec(html)) !== null) {
      const [, pid, pwx, pwy, ptitle, pcat] = m;
      if (!unique.has(pid)) {
        unique.set(pid, {
          confirmid: pid,
          name: ptitle,
          x: parseInt(pwx),
          y: parseInt(pwy),
          category: (pcat || '').trim(),
        });
      }
    }

    // Filter non-medical
    const results: KakaoPlace[] = [];
    for (const [, place] of unique) {
      const cat = (place.category || '').trim();
      if (!NON_MEDICAL_CATEGORIES.has(cat)) results.push(place);
    }

    const skipped = unique.size - results.length;
    if (skipped > 0) console.log(`  (${gridX},${gridY}): filtered ${skipped} non-medical`);
    console.log(`  (${gridX},${gridY}) [${keyword}]: ${results.length} places`);

    return results;
  } finally {
    await page.close();
    await context.close();
  }
}

async function main() {
  const args = process.argv.slice(2);

  const getArg = (flag: string, fallback: string) => {
    const i = args.indexOf(flag);
    return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
  };

  const centerLat = parseFloat(getArg('--lat', '37.5665'));  // Seoul
  const centerLon = parseFloat(getArg('--lon', '126.9780'));
  const steps = parseInt(getArg('--steps', '3'));
  const keyword = getArg('--keyword', '병원');
  const noDetail = args.includes('--no-detail');
  const force = args.includes('--force');

  initProgressTable();

  const gridPoints: Array<{ gx: number; gy: number; lat: number; lon: number }> = [];
  for (let dy = -steps; dy <= steps; dy++) {
    for (let dx = -steps; dx <= steps; dx++) {
      gridPoints.push({
        gx: dx,
        gy: dy,
        lat: centerLat + dy * 0.01,
        lon: centerLon + dx * 0.01,
      });
    }
  }

  const total = gridPoints.length;
  console.log(`Kakao scraper: keyword="${keyword}", center=(${centerLat},${centerLon}), ${total} grids`);

  const browser = await chromium.launch({ headless: true });
  let inserted = 0;
  let skippedExisting = 0;
  let gridsDone = 0;
  let gridsSkipped = 0;

  try {
    for (let i = 0; i < gridPoints.length; i++) {
      const { gx, gy, lat, lon } = gridPoints[i];
      const gridKey = `${keyword}:${gx}:${gy}`;

      if (!force && isGridDone(gridKey)) {
        gridsSkipped++;
        continue;
      }

      process.stdout.write(`[${i + 1}/${total}] grid (${gx},${gy}) lat=${lat.toFixed(4)} lon=${lon.toFixed(4)} ... `);

      let places: KakaoPlace[] = [];
      try {
        places = await scrapeGrid(browser, gx, gy, lat, lon, keyword);
      } catch (e) {
        console.error(`\n  grid error: ${e}`);
        continue;
      }

      let newCount = 0;
      for (const place of places) {
        const pid = String(place.confirmid);
        if (!pid) continue;

        if (isPlaceScraped(pid)) {
          skippedExisting++;
          continue;
        }

        // Resolve coordinates
        let placeLat = lat;
        let placeLon = lon;
        if (place.x && place.y) {
          [placeLat, placeLon] = fromWCONGNAMUL(place.x / 2.5, place.y / 2.5);
        }

        // Fetch detail (website, phone)
        let detail: PlaceDetail = {};
        if (!noDetail) {
          detail = await fetchDetail(pid);
          await new Promise((r) => setTimeout(r, 150));
        }

        const address = detail.address || place.address || place.roadAddress || '';
        const category = (place.category || '').trim();

        upsertCompany({
          name: place.name,
          domain: `place.map.kakao.com/${pid}`,
          url: detail.website || `https://place.map.kakao.com/${pid}`,
          industry: category || '의료',
          what_they_sell: address,
          scraped_at: new Date().toISOString(),
        });

        newCount++;
        inserted++;
      }

      markGridDone(gridKey, keyword);
      gridsDone++;
      console.log(`  → ${newCount} new, ${places.length - newCount} dupes`);

      // Polite delay between grids
      await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1500));
    }
  } finally {
    await browser.close();
  }

  console.log(`\nDone. Grids: ${gridsDone} scraped, ${gridsSkipped} skipped (already done).`);
  console.log(`Places: ${inserted} inserted, ${skippedExisting} already existed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
