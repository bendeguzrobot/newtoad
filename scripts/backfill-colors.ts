/**
 * One-off backfill script: extract pixel-based colors for all existing scraped sites,
 * save gradient.png, and update main_colors in the DB.
 *
 * Usage:
 *   npx tsx backfill-colors.ts [--dry-run] [--force]
 *
 * Flags:
 *   --dry-run   List sites that would be processed, but don't extract or update DB
 *   --force     Re-extract even if gradient.png already exists
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb } from './src/db.js';
import { extractColors } from './src/scraper/extract-colors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATA_DIR = path.join(__dirname, 'data');
const WEBSITES_DIR = path.join(DATA_DIR, 'websites');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force');

async function main() {
  console.log('\n=== NewToad Color Backfill ===');
  console.log(`Websites dir: ${WEBSITES_DIR}`);
  console.log(`Dry run: ${DRY_RUN}  Force: ${FORCE}\n`);

  if (!fs.existsSync(WEBSITES_DIR)) {
    console.error('ERROR: data/websites/ directory not found.');
    process.exit(1);
  }

  const db = getDb();

  const folders = fs.readdirSync(WEBSITES_DIR).filter(f =>
    fs.statSync(path.join(WEBSITES_DIR, f)).isDirectory()
  );

  console.log(`Found ${folders.length} website folders.\n`);

  let success = 0;
  let failed = 0;
  let skipped = 0;

  for (const folder of folders) {
    const siteDir = path.join(WEBSITES_DIR, folder);
    const screenshotPath = path.join(siteDir, 'screenshot.png');
    const gradientPath = path.join(siteDir, 'gradient.png');
    const domain = folder;

    if (!fs.existsSync(screenshotPath)) {
      console.log(`[${domain}] No screenshot.png — skipping`);
      skipped++;
      continue;
    }

    if (fs.existsSync(gradientPath) && !FORCE) {
      console.log(`[${domain}] gradient.png already exists — skipping (use --force to redo)`);
      skipped++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`[${domain}] Would extract colors (dry-run)`);
      skipped++;
      continue;
    }

    process.stdout.write(`[${domain}] Extracting... `);

    const colors = await extractColors(screenshotPath, 10);

    if (!colors) {
      console.log('FAILED');
      failed++;
      continue;
    }

    console.log(`OK: ${colors.slice(0, 5).join(', ')}`);
    success++;

    // Update DB
    const colorsJson = JSON.stringify(colors);
    const result = db.prepare('UPDATE companies SET main_colors = ? WHERE domain = ?').run(colorsJson, domain);
    if (result.changes > 0) {
      console.log(`  -> DB updated (${result.changes} row)`);
    } else {
      console.log(`  -> Domain not in DB; gradient.png saved anyway`);
    }
  }

  console.log(`\n=== Done: ${success} extracted, ${failed} failed, ${skipped} skipped (of ${folders.length} total) ===\n`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
