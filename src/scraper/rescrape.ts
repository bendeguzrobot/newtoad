import path from 'path';
import fs from 'fs';
import { getCompany, upsertCompany } from '../db.js';
import { crawlWebsite } from './crawler.js';
import { analyzeWebsite } from './analyzer.js';
import { extractColors } from './extract-colors.js';
import type { Company, GalleryManifest } from '../types.js';

const DATA_DIR = path.join(process.cwd(), 'data');

export async function rescrapeCompany(id: number): Promise<Company> {
  const company = getCompany(id);
  if (!company) {
    throw new Error(`Company with id ${id} not found`);
  }

  const url = company.url || (company.domain ? `https://${company.domain}` : null);
  if (!url) {
    throw new Error(`Company has no URL or domain to scrape`);
  }

  const domain = company.domain || new URL(url).hostname.replace(/^www\./, '');

  console.log(`Rescraping company ${company.name} (${url})...`);

  // Crawl
  const crawlResult = await crawlWebsite(url, domain);
  console.log(`Crawled: "${crawlResult.title}"`);

  const relScreenshot = path.relative(DATA_DIR, crawlResult.screenshotPath);
  const siteDir = path.dirname(crawlResult.screenshotPath);

  // Extract colors from ALL gallery screenshots, generate per-screenshot gradients
  const allColors: string[] = [];
  const seenColors = new Set<string>();

  let gallery: GalleryManifest = { screenshots: [] };
  if (fs.existsSync(crawlResult.galleryPath)) {
    gallery = JSON.parse(fs.readFileSync(crawlResult.galleryPath, 'utf-8')) as GalleryManifest;
  }

  for (const entry of gallery.screenshots) {
    const shotPath = path.join(siteDir, entry.file);
    if (fs.existsSync(shotPath)) {
      const colors = await extractColors(shotPath);
      if (colors) {
        for (const c of colors) {
          if (!seenColors.has(c)) { seenColors.add(c); allColors.push(c); }
        }
      }
    }
  }

  // Analyze
  const analysis = await analyzeWebsite(crawlResult);
  console.log(`Analysis: ${analysis.industry} | SEO=${analysis.seo_score} | Design=${analysis.design_quality_score}`);

  const finalColors = allColors.length > 0 ? allColors : analysis.main_colors;

  // Update DB
  const updated = upsertCompany({
    id: company.id,
    name: company.name,
    domain,
    url,
    scraped_at: new Date().toISOString(),
    screenshot_path: relScreenshot,
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

  return updated;
}
