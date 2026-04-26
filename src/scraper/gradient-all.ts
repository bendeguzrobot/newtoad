import fs from 'fs';
import path from 'path';
import { extractColors } from './extract-colors.js';
import { getDb } from '../db.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const WEBSITES_DIR = path.join(DATA_DIR, 'websites');

const force = process.argv.includes('--force');

function progressBar(done: number, total: number, width = 30): string {
  const pct = total > 0 ? done / total : 0;
  const filled = Math.round(pct * width);
  const bar = '='.repeat(filled) + (filled < width ? '>' : '') + ' '.repeat(Math.max(0, width - filled - 1));
  return `[${bar}] ${done}/${total} (${Math.round(pct * 100)}%)`;
}

function formatMs(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}

async function main() {
  if (!fs.existsSync(WEBSITES_DIR)) {
    console.error('No data/websites/ directory. Run scraper first.');
    process.exit(1);
  }

  const folders = fs.readdirSync(WEBSITES_DIR)
    .filter(f => fs.statSync(path.join(WEBSITES_DIR, f)).isDirectory());

  const toProcess = folders.filter(f => {
    const gradPath = path.join(WEBSITES_DIR, f, 'gradient.png');
    const shotPath = path.join(WEBSITES_DIR, f, 'screenshot.png');
    return fs.existsSync(shotPath) && (force || !fs.existsSync(gradPath));
  });

  const skipped = folders.length - toProcess.length;

  console.log(`\nNewToad Gradient Extractor`);
  console.log(`  Total folders : ${folders.length}`);
  console.log(`  Already done  : ${skipped}`);
  console.log(`  To process    : ${toProcess.length}`);
  if (force) console.log(`  Mode          : --force (regenerate all)`);
  console.log('');

  if (toProcess.length === 0) {
    console.log('All gradients up to date. Use --force to regenerate.');
    return;
  }

  const db = getDb();
  let done = 0;
  let failed = 0;
  let dbUpdated = 0;
  const startTime = Date.now();

  for (const folder of toProcess) {
    const shotPath = path.join(WEBSITES_DIR, folder, 'screenshot.png');

    const elapsed = Date.now() - startTime;
    const rate = done > 0 ? elapsed / done : 0;
    const remaining = toProcess.length - done;
    const eta = rate > 0 ? formatMs(rate * remaining) : '—';

    process.stdout.write(
      `\r${progressBar(done, toProcess.length)} | ETA: ${eta} | ${folder.slice(0, 30).padEnd(30)}`
    );

    const colors = await extractColors(shotPath);

    if (!colors) {
      failed++;
    } else {
      // Update DB main_colors if not already set (or --force)
      const row = db.prepare('SELECT id, main_colors FROM companies WHERE domain = ?').get(folder) as
        | { id: number; main_colors: string | null }
        | undefined;
      if (row && (force || !row.main_colors)) {
        db.prepare('UPDATE companies SET main_colors = ? WHERE id = ?')
          .run(JSON.stringify(colors), row.id);
        dbUpdated++;
      }
    }

    done++;
  }

  const total = Date.now() - startTime;
  process.stdout.write('\n');
  console.log(`\nDone in ${formatMs(total)}`);
  console.log(`  Processed : ${done}`);
  console.log(`  Failed    : ${failed}`);
  console.log(`  DB updated: ${dbUpdated}`);
  console.log('');
}

main().catch(err => { console.error(err); process.exit(1); });
