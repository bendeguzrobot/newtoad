import 'dotenv/config';
import { parse as csvParse } from 'csv-parse/sync';
import fs from 'fs';
import path from 'path';
import { URL } from 'url';
import { searchWeb } from './search.js';
import { crawlWebsite } from './crawler.js';
import { analyzeWebsite } from './analyzer.js';
import { getDb, upsertCompany } from '../db.js';
import type { Company } from '../types.js';

interface CsvRow {
  name: string;
  notes?: string;
}

/**
 * Extract the domain from a URL string.
 */
function extractDomain(urlStr: string): string {
  try {
    const parsed = new URL(urlStr);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return urlStr;
  }
}

/**
 * Sleep for ms milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main orchestrator: reads CSV, searches for each company's homepage,
 * crawls it, analyzes it via Claude, and saves results to DB + disk.
 */
async function main(): Promise<void> {
  const csvPath = process.argv[2] || path.join(process.cwd(), 'companies.csv');

  console.log(`\n=== NewToad Web Scraper ===`);
  console.log(`CSV: ${csvPath}\n`);

  if (!fs.existsSync(csvPath)) {
    console.error(`ERROR: CSV file not found: ${csvPath}`);
    process.exit(1);
  }

  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const rows: CsvRow[] = csvParse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });

  if (rows.length === 0) {
    console.log('No companies found in CSV.');
    return;
  }

  console.log(`Found ${rows.length} companies to process.\n`);

  // Ensure DB is initialized
  getDb();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const companyName = row.name?.trim();

    if (!companyName) {
      console.log(`[${i + 1}/${rows.length}] Skipping empty row`);
      continue;
    }

    console.log(`\n[${i + 1}/${rows.length}] Processing: ${companyName}`);
    if (row.notes) {
      console.log(`  Notes: ${row.notes}`);
    }

    // Check if already scraped
    const db = getDb();
    const existing = db.prepare('SELECT * FROM companies WHERE name = ?').get(companyName) as Company | undefined;

    if (existing?.scraped_at) {
      console.log(`  ✓ Already scraped (${existing.scraped_at}), skipping.`);
      continue;
    }

    // Ensure company exists in DB (even if not yet scraped)
    let company: Company;
    if (!existing) {
      company = upsertCompany({ name: companyName });
      console.log(`  Created DB entry (id=${company.id})`);
    } else {
      company = existing;
    }

    // Step 1: Search for homepage URL
    let url: string | null = null;
    try {
      console.log(`  Searching for "${companyName}" homepage...`);
      url = await searchWeb(companyName);
      if (url) {
        console.log(`  Found URL: ${url}`);
      } else {
        console.log(`  No URL found via search. Skipping.`);
        continue;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  Search failed: ${message}`);
      continue;
    }

    // Step 2: Crawl the website
    const domain = extractDomain(url);
    console.log(`  Crawling ${url} (domain: ${domain})...`);

    let crawlResult;
    try {
      crawlResult = await crawlWebsite(url, domain);
      console.log(`  Crawled successfully. Title: "${crawlResult.title}"`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  Crawl failed: ${message}`);
      continue;
    }

    // Step 3: Save crawl result to DB immediately (screenshot visible even if analysis fails)
    const dataDir = path.join(process.cwd(), 'data');
    const relativeScreenshotPath = path.relative(dataDir, crawlResult.screenshotPath);
    try {
      upsertCompany({
        id: company.id,
        name: companyName,
        domain,
        url,
        screenshot_path: relativeScreenshotPath,
      });
    } catch (err: unknown) {
      console.error(`  DB crawl-save failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Step 4: Analyze with Gemini
    console.log(`  Analyzing with Gemini...`);
    let analysis;
    try {
      analysis = await analyzeWebsite(crawlResult);
      console.log(`  Analysis complete: ${analysis.industry} | score=${analysis.design_quality_score}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  Analysis failed: ${message}`);
      continue;
    }

    // Step 5: Save full analysis to DB
    try {
      const updated = upsertCompany({
        id: company.id,
        name: companyName,
        domain,
        url,
        scraped_at: new Date().toISOString(),
        industry: analysis.industry,
        what_they_sell: analysis.what_they_sell,
        company_size: analysis.company_size,
        screenshot_path: relativeScreenshotPath,
        design_quality_score: analysis.design_quality_score,
        design_last_modified_year: analysis.design_last_modified_year,
        seo_score: analysis.seo_score,
        main_colors: JSON.stringify(analysis.main_colors),
        mood: analysis.mood,
        style: analysis.style,
        copy: analysis.copy,
      });
      console.log(`  Saved to DB (id=${updated.id}).`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  DB save failed: ${message}`);
      continue;
    }

    console.log(`  Done.`);

    // Polite delay between requests to avoid rate limiting
    if (i < rows.length - 1) {
      await sleep(2000);
    }
  }

  console.log(`\n=== Scraping complete ===\n`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
