import 'dotenv/config';

if (!process.env.GEMINI_API_KEY) {
  console.error('\nERROR: GEMINI_API_KEY is not set. Add it to .env or export it.\n');
  process.exit(1);
}

import { getDb, upsertCompany } from '../db.js';
import { generateWebsite } from './worker.js';
import { crawlWebsite } from '../scraper/crawler.js';
import { analyzeWebsite } from '../scraper/analyzer.js';
import type { Company } from '../types.js';

async function main(): Promise<void> {
  const input = process.argv[2];

  if (!input) {
    console.error('\nUsage: npx tsx src/generate/toadit.ts <url-or-domain>\n');
    process.exit(1);
  }

  // Determine if user passed a full URL or just a domain
  const isFullUrl = input.startsWith('http://') || input.startsWith('https://');

  // Extract domain (strip www.)
  let domain: string;
  if (isFullUrl) {
    try {
      const parsed = new URL(input);
      domain = parsed.hostname.replace(/^www\./, '');
    } catch {
      console.error(`Invalid URL: ${input}`);
      process.exit(1);
    }
  } else {
    domain = input.replace(/^www\./, '');
  }

  // Ensure DB is initialized
  const db = getDb();

  // Look up company by domain
  let company = db.prepare('SELECT * FROM companies WHERE domain = ?').get(domain) as Company | undefined;

  if (!company) {
    if (isFullUrl) {
      // Attempt on-the-fly scrape
      console.log(`Company not found in DB for domain: ${domain}. Scraping on the fly...`);

      let crawlResult;
      try {
        crawlResult = await crawlWebsite(input, domain);
        console.log(`  Crawled: ${crawlResult.title}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  Crawl failed: ${msg}`);
        process.exit(1);
      }

      let analysis;
      try {
        analysis = await analyzeWebsite(crawlResult);
        console.log(`  Analyzed: ${analysis.industry}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  Analysis failed: ${msg}`);
        process.exit(1);
      }

      const dataDir = new URL('../../data', import.meta.url).pathname;
      const screenshotRelPath = crawlResult.screenshotPath.replace(
        process.cwd() + '/data/',
        ''
      );

      company = upsertCompany({
        name: crawlResult.title || domain,
        domain,
        url: input,
        scraped_at: new Date().toISOString(),
        industry: analysis.industry,
        what_they_sell: analysis.what_they_sell,
        company_size: analysis.company_size,
        screenshot_path: screenshotRelPath,
        design_quality_score: analysis.design_quality_score,
        design_last_modified_year: analysis.design_last_modified_year,
        seo_score: analysis.seo_score,
        main_colors: JSON.stringify(analysis.main_colors),
        mood: analysis.mood,
        style: analysis.style,
        copy: analysis.copy,
      });

      console.log(`  Saved to DB (id=${company.id})`);
    } else {
      console.error(
        `Company not found in DB for domain: ${domain}. Run scraper first or provide full URL.`
      );
      process.exit(1);
    }
  }

  console.log(`\nGenerating website for ${company.name}...`);

  let generation;
  try {
    generation = await generateWebsite(company);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Generation failed: ${msg}`);
    process.exit(1);
  }

  console.log(`\n✓ Generated website for ${company.name}`);
  console.log(`  HTML:       ${generation.html_path}`);
  console.log(`  Screenshot: ${generation.screenshot_path}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
