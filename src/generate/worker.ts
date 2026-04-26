import { llm } from '../llm/index.js';
import { chromium } from 'playwright';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { getDb, saveGeneration, incrementUpgradedCount } from '../db.js';
import type { Company, SiteGeneration } from '../types.js';

const DATA_DIR = path.join(process.cwd(), 'data', 'websites');

export interface GenerateOptions {
  extra_prompt?: string;
  color_board?: string[];
}

/**
 * Build the Gemini prompt for website generation from company metadata.
 */
function buildPrompt(company: Company, opts: GenerateOptions): string {
  let mainColors: string[] = [];
  if (opts.color_board && opts.color_board.length > 0) {
    mainColors = opts.color_board;
  } else if (company.main_colors) {
    try {
      const parsed = JSON.parse(company.main_colors);
      if (Array.isArray(parsed)) mainColors = parsed as string[];
    } catch {
      // ignore parse errors
    }
  }

  const colorsStr = mainColors.length > 0 ? mainColors.join(', ') : '#0055a5, #ffffff, #333333';

  let prompt = `You are an expert web designer. Create a complete, beautiful, modern, responsive single-page HTML website for this Korean company.

Company name: ${company.name}
Industry: ${company.industry ?? 'unknown'}
What they sell/do: ${company.what_they_sell ?? 'unknown'}
Company size: ${company.company_size ?? 'unknown'}
Brand colors (use these): ${colorsStr}
Mood/feel: ${company.mood ?? 'professional'}
Design style: ${company.style ?? 'modern'}
Key marketing copy: ${company.copy ?? ''}`;

  if (opts.extra_prompt) {
    prompt += `\n\n${opts.extra_prompt}`;
  }

  prompt += `

Requirements:
- Single HTML file, ALL CSS embedded in <style> tag
- Mobile responsive (use CSS flexbox/grid, media queries)
- Sections: hero with tagline, about/intro, products or services, contact CTA
- Use the brand colors as primary palette
- Modern, clean typography (use Google Fonts CDN link is OK)
- Compelling Korean-market B2B/B2C design
- NO JavaScript frameworks, NO external CSS frameworks
- Output ONLY the raw HTML starting with <!DOCTYPE html> — no explanation, no markdown`;

  return prompt;
}

/**
 * Strip markdown code fences from a string if present.
 */
function stripFences(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('```')) {
    return trimmed
      .replace(/^```(?:html)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();
  }
  return trimmed;
}

/**
 * Generate a complete HTML website for a company using Gemini,
 * take desktop + mobile screenshots via Playwright, and save everything to disk + DB.
 */
export async function generateWebsite(
  company: Company,
  opts: GenerateOptions = {}
): Promise<SiteGeneration> {
  if (!company.id) {
    throw new Error('Company must have an id to generate a website');
  }

  const genId = uuidv4();
  const domain = company.domain ?? company.name.toLowerCase().replace(/\s+/g, '-');

  // Prepare output directory
  const genDir = path.join(DATA_DIR, domain, 'gen', genId);
  fs.mkdirSync(genDir, { recursive: true });

  const htmlFilePath = path.join(genDir, 'index.html');
  const screenshotFilePath = path.join(genDir, 'screenshot.png');
  const mobileScreenshotFilePath = path.join(genDir, 'screenshot-mobile.png');

  // ── Step 1: Call LLM ──────────────────────────────────────────────────────
  const startTime = Date.now();

  const userPrompt = buildPrompt(company, opts);
  const rawText = await llm.complete({
    system: 'You are an expert web designer. Output only raw HTML — no explanation, no markdown.',
    prompt: userPrompt,
    maxTokens: 8192,
  });
  const html = stripFences(rawText);

  const generationTimeMs = Date.now() - startTime;

  // ── Step 2: Save HTML ──────────────────────────────────────────────────────
  fs.writeFileSync(htmlFilePath, html, 'utf-8');

  // ── Step 3: Take screenshots with Playwright ───────────────────────────────
  const browser = await chromium.launch({ headless: true });
  try {
    // Desktop screenshot: 1280×900
    const desktopContext = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    const desktopPage = await desktopContext.newPage();
    await desktopPage.setContent(html, { waitUntil: 'domcontentloaded' });
    await desktopPage.screenshot({ path: screenshotFilePath, fullPage: true });
    await desktopContext.close();

    // Mobile screenshot: 375×812
    const mobileContext = await browser.newContext({
      viewport: { width: 375, height: 812 },
    });
    const mobilePage = await mobileContext.newPage();
    await mobilePage.setContent(html, { waitUntil: 'domcontentloaded' });
    await mobilePage.screenshot({ path: mobileScreenshotFilePath, fullPage: true });
    await mobileContext.close();
  } finally {
    await browser.close();
  }

  // ── Step 4: Persist to DB ──────────────────────────────────────────────────
  const dataDir = path.join(process.cwd(), 'data');
  const relHtmlPath = path.relative(dataDir, htmlFilePath);
  const relScreenshotPath = path.relative(dataDir, screenshotFilePath);
  const relMobileScreenshotPath = path.relative(dataDir, mobileScreenshotFilePath);

  const generationRecord: SiteGeneration = {
    id: genId,
    company_id: company.id,
    color_board: opts.color_board ? JSON.stringify(opts.color_board) : null,
    extra_prompt: opts.extra_prompt ?? null,
    generation_time_ms: generationTimeMs,
    html_path: relHtmlPath,
    screenshot_path: relScreenshotPath,
    mobile_screenshot_path: relMobileScreenshotPath,
  };

  const saved = saveGeneration(generationRecord);

  // ── Step 5: Increment upgraded count on company ────────────────────────────
  incrementUpgradedCount(company.id);

  // Return the saved record, augmenting with absolute paths for CLI output
  return {
    ...saved,
    html_path: htmlFilePath,
    screenshot_path: screenshotFilePath,
    mobile_screenshot_path: mobileScreenshotFilePath,
  };
}
