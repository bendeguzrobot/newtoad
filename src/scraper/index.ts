import 'dotenv/config';

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('\nERROR: ANTHROPIC_API_KEY is not set. Add it to .env or export it.\n');
  process.exit(1);
}

import { parse as csvParse } from 'csv-parse/sync';
import fs from 'fs';
import path from 'path';
import { URL } from 'url';
import { searchWeb } from './search.js';
import { crawlWebsite } from './crawler.js';
import { analyzeWebsite } from './analyzer.js';
import { extractColors } from './extract-colors.js';
import { getDb, upsertCompany } from '../db.js';
import type { Company, CrawlResult } from '../types.js';

interface CsvRow { name: string; url?: string; notes?: string; }

const DATA_DIR = path.join(process.cwd(), 'data');
const WEBSITES_DIR = path.join(DATA_DIR, 'websites');

const SUSPICIOUS = ['google.com', 'naver.com', 'wikipedia.org', 'duckduckgo.com', 'youtube.com'];

function normalizeUrl(raw: string | null): string | null {
  if (!raw) return null;
  let u = raw.trim();
  // fix missing or broken scheme
  if (/^https?:\/\//i.test(u)) return u;
  if (/^\/\//i.test(u)) return 'https:' + u;
  if (/^https?:\/[^/]/i.test(u)) return u.replace(/^(https?:\/)([^/])/, '$1/$2'); // http:/foo → http://foo
  return 'https://' + u;
}

function extractDomain(urlStr: string): string {
  try { return new URL(urlStr).hostname.replace(/^www\./, ''); }
  catch { return urlStr; }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 5000);
}

// ── from-folder mode ──────────────────────────────────────────────────────────

async function fromFolderMode(force: boolean): Promise<void> {
  console.log('\n=== NewToad Scraper — from-folder mode ===');
  console.log(`Scanning ${WEBSITES_DIR}...\n`);

  if (!fs.existsSync(WEBSITES_DIR)) {
    console.error('No data/websites/ directory found. Run scraper first.');
    process.exit(1);
  }

  const db = getDb();
  const folders = fs.readdirSync(WEBSITES_DIR).filter(f =>
    fs.statSync(path.join(WEBSITES_DIR, f)).isDirectory()
  );

  console.log(`Found ${folders.length} folders.\n`);

  for (const folder of folders) {
    const siteDir = path.join(WEBSITES_DIR, folder);
    const metaPath = path.join(siteDir, 'metadata.json');
    const htmlPath = path.join(siteDir, 'index.html');
    const screenshotPath = path.join(siteDir, 'screenshot.png');

    console.log(`\n[folder] ${folder}`);

    if (!fs.existsSync(metaPath)) {
      console.log('  No metadata.json, skipping.');
      continue;
    }

    // Read saved metadata
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as {
      url: string; domain: string; title?: string; metaDescription?: string;
      h1Texts?: string[]; h2Texts?: string[]; imageSrcs?: string[];
    };

    const domain = meta.domain || folder;

    // Find or create company in DB (match by domain or url)
    let company = db.prepare('SELECT * FROM companies WHERE domain = ?').get(domain) as Company | undefined;
    if (!company) {
      // Try matching by url
      company = db.prepare('SELECT * FROM companies WHERE url = ?').get(meta.url) as Company | undefined;
    }

    if (company?.scraped_at && !force) {
      console.log(`  ✓ Already fully scraped (${company.scraped_at}), skipping. Use --force to redo.`);
      continue;
    }

    if (!company) {
      // Create a new DB entry from folder data (unknown company name → use title or domain)
      const name = meta.title || domain;
      company = upsertCompany({ name, domain, url: meta.url });
      console.log(`  Created DB entry: "${company.name}" (id=${company.id})`);
    } else {
      console.log(`  Matched DB entry: "${company.name}" (id=${company.id})`);
    }

    // Save screenshot path immediately
    const relScreenshot = path.relative(DATA_DIR, screenshotPath);
    if (fs.existsSync(screenshotPath)) {
      upsertCompany({ id: company.id, name: company.name, domain, url: meta.url, screenshot_path: relScreenshot });
    }

    // Build CrawlResult from saved files
    const html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf-8') : '';
    const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
    const htmlHead = headMatch ? headMatch[1].slice(0, 3000) : '';
    const visibleText = html ? stripHtml(html) : '';

    const crawlResult: CrawlResult = {
      url: meta.url,
      domain,
      title: meta.title ?? '',
      metaDescription: meta.metaDescription ?? '',
      h1Texts: meta.h1Texts ?? [],
      h2Texts: meta.h2Texts ?? [],
      visibleText,
      imageSrcs: meta.imageSrcs ?? [],
      htmlHead,
      screenshotPath,
      mobileScreenshotPath: path.join(siteDir, 'screenshot-mobile.png'),
      htmlPath,
      metadataPath: metaPath,
      galleryPath: path.join(siteDir, 'gallery.json'),
    };

    // Extract pixel-based colors from screenshot
    let pixelColors: string[] | null = null;
    if (fs.existsSync(screenshotPath)) {
      console.log('  Extracting colors from screenshot...');
      pixelColors = await extractColors(screenshotPath);
      if (pixelColors) {
        console.log(`  ✓ Colors: ${pixelColors.slice(0, 5).join(', ')}`);
      } else {
        console.log('  Color extraction failed, will use LLM colors.');
      }
    }

    // Analyze with Gemini
    console.log('  Analyzing...');
    let analysis;
    try {
      analysis = await analyzeWebsite(crawlResult);
      console.log(`  ✓ ${analysis.industry} | SEO=${analysis.seo_score} | Design=${analysis.design_quality_score}`);
    } catch (err) {
      console.error(`  Analysis failed: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    // Prefer pixel-extracted colors over LLM guess
    const finalColors = pixelColors ?? analysis.main_colors;

    // Save full result
    let folderScreenshotCount = 1;
    if (fs.existsSync(crawlResult.galleryPath)) {
      try {
        const g = JSON.parse(fs.readFileSync(crawlResult.galleryPath, 'utf-8')) as { screenshots: unknown[] };
        folderScreenshotCount = g.screenshots.length;
      } catch { /* ignore */ }
    }

    upsertCompany({
      id: company.id,
      name: company.name,
      domain,
      url: meta.url,
      scraped_at: new Date().toISOString(),
      screenshot_path: relScreenshot,
      screenshot_count: folderScreenshotCount,
      industry: analysis.industry,
      what_they_sell: analysis.what_they_sell,
      company_size: analysis.company_size,
      design_quality_score: analysis.design_quality_score,
      design_last_modified_year: analysis.design_last_modified_year,
      seo_score: analysis.seo_score,
      main_colors: JSON.stringify(finalColors),
      mood: analysis.mood,
      style: analysis.style,
      copy: analysis.copy,
    });
    console.log('  Saved.');

    await sleep(500);
  }

  console.log('\n=== from-folder complete ===\n');
}

// ── CSV scrape mode ───────────────────────────────────────────────────────────

async function csvMode(csvPath: string, force: boolean, inlineRows?: CsvRow[]): Promise<void> {
  console.log('\n=== NewToad Web Scraper ===');

  let rows: CsvRow[];
  if (inlineRows) {
    rows = inlineRows;
    console.log(`URL mode  force=${force}\n`);
  } else {
    console.log(`CSV: ${csvPath}  force=${force}\n`);
    if (!fs.existsSync(csvPath)) { console.error(`CSV not found: ${csvPath}`); process.exit(1); }
    rows = csvParse(fs.readFileSync(csvPath, 'utf-8'), {
      columns: true, skip_empty_lines: true, trim: true, bom: true,
    });
  }

  if (rows.length === 0) { console.log('No companies in CSV.'); return; }
  console.log(`Found ${rows.length} companies.\n`);

  const db = getDb();

  for (let i = 0; i < rows.length; i++) {
    const name = rows[i].name?.trim();
    if (!name) continue;

    console.log(`\n[${i + 1}/${rows.length}] ${name}`);

    const existing = db.prepare('SELECT * FROM companies WHERE name = ?').get(name) as Company | undefined;

    if (existing?.scraped_at && !force) {
      console.log(`  ✓ Already scraped, skipping. Use --force to redo.`);
      continue;
    }

    // Use URL from CSV if provided, otherwise search
    let url: string | null = normalizeUrl(rows[i].url?.trim() || null);
    if (url) {
      console.log(`  URL from CSV: ${url}`);
    } else {
      try {
        console.log(`  Searching...`);
        url = await searchWeb(name);
        if (!url) { console.log('  No URL found, skipping.'); continue; }
        console.log(`  Found: ${url}`);
        if (SUSPICIOUS.some(d => url!.includes(d)))
          console.warn(`  ⚠️  Looks like a search engine result, not company site!`);
      } catch (err) {
        console.error(`  Search failed: ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }
    }

    // Only create/load DB entry once we have a URL
    let company = existing ?? upsertCompany({ name });
    if (!existing) console.log(`  Created DB entry (id=${company.id})`);

    const domain = extractDomain(url);

    // Crawl
    console.log(`  Crawling ${domain}...`);
    let crawlResult: CrawlResult;
    try {
      crawlResult = await crawlWebsite(url, domain);
      console.log(`  Crawled: "${crawlResult.title}"`);
    } catch (err) {
      console.error(`  Crawl failed: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    // Save screenshot immediately
    const relScreenshot = path.relative(DATA_DIR, crawlResult.screenshotPath);
    upsertCompany({ id: company.id, name, domain, url, screenshot_path: relScreenshot });

    // Extract pixel-based colors from screenshot
    let pixelColors: string[] | null = null;
    if (fs.existsSync(crawlResult.screenshotPath)) {
      console.log('  Extracting colors from screenshot...');
      pixelColors = await extractColors(crawlResult.screenshotPath);
      if (pixelColors) {
        console.log(`  ✓ Colors: ${pixelColors.slice(0, 5).join(', ')}`);
      } else {
        console.log('  Color extraction failed, will use LLM colors.');
      }
    }

    // Analyze
    console.log('  Analyzing...');
    let analysis;
    try {
      analysis = await analyzeWebsite(crawlResult);
      console.log(`  ✓ ${analysis.industry} | SEO=${analysis.seo_score} | Design=${analysis.design_quality_score}`);
    } catch (err) {
      console.error(`  Analysis failed: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    // Prefer pixel-extracted colors over LLM guess
    const finalColors = pixelColors ?? analysis.main_colors;

    let screenshotCount = 1;
    if (fs.existsSync(crawlResult.galleryPath)) {
      try {
        const g = JSON.parse(fs.readFileSync(crawlResult.galleryPath, 'utf-8')) as { screenshots: unknown[] };
        screenshotCount = g.screenshots.length;
      } catch { /* ignore */ }
    }

    upsertCompany({
      id: company.id, name, domain, url,
      scraped_at: new Date().toISOString(),
      screenshot_path: relScreenshot,
      screenshot_count: screenshotCount,
      industry: analysis.industry,
      what_they_sell: analysis.what_they_sell,
      company_size: analysis.company_size,
      design_quality_score: analysis.design_quality_score,
      design_last_modified_year: analysis.design_last_modified_year,
      seo_score: analysis.seo_score,
      main_colors: JSON.stringify(finalColors),
      mood: analysis.mood,
      style: analysis.style,
      copy: analysis.copy,
    });
    console.log('  Done.');

    if (i < rows.length - 1) await sleep(2000);
  }

  console.log('\n=== Scraping complete ===\n');
}

// ── entry point ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const force = args.includes('--force');
const fromFolder = args.includes('--from-folder');
const urlFlagIdx = args.findIndex(a => a === '-u' || a === '--url');
const urlArg = urlFlagIdx !== -1 ? args[urlFlagIdx + 1] : undefined;
const csvArg = args.find(a => !a.startsWith('-'));

if (fromFolder) {
  fromFolderMode(force).catch(err => { console.error(err); process.exit(1); });
} else if (urlArg) {
  const cleanUrl = normalizeUrl(urlArg)!;
  csvMode('', force, [{ name: new URL(cleanUrl).hostname, url: cleanUrl }])
    .catch(err => { console.error(err); process.exit(1); });
} else {
  const csvPath = csvArg ?? path.join(process.cwd(), 'companies.csv');
  csvMode(csvPath, force).catch(err => { console.error(err); process.exit(1); });
}
