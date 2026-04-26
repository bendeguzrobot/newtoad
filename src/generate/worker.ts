import { llm } from '../llm/index.js';
import { chromium } from 'playwright';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { getDb, saveGeneration, incrementUpgradedCount } from '../db.js';
import type { Company, SiteGeneration, GalleryManifest } from '../types.js';

const DATA_DIR = path.join(process.cwd(), 'data', 'websites');

export interface GenerateOptions {
  extra_prompt?: string;
  color_board?: string[];
  language?: string;       // e.g. "Korean"
  language_code?: string;  // BCP-47 e.g. "ko"
}

function getAssetUrls(domain: string): string[] {
  const assetsDir = path.join(DATA_DIR, domain, 'assets');
  if (!fs.existsSync(assetsDir)) return [];
  return fs.readdirSync(assetsDir)
    .filter(f => /\.(png|jpe?g|gif|webp|svg)$/i.test(f))
    .map(f => `/data/websites/${domain}/assets/${f}`);
}

function loadGalleryImages(domain: string): Buffer[] {
  const galleryPath = path.join(DATA_DIR, domain, 'gallery.json');
  if (!fs.existsSync(galleryPath)) return [];
  try {
    const manifest = JSON.parse(fs.readFileSync(galleryPath, 'utf-8')) as GalleryManifest;
    return manifest.screenshots
      .map(e => path.join(DATA_DIR, domain, e.file))
      .filter(p => fs.existsSync(p))
      .map(p => fs.readFileSync(p));
  } catch {
    return [];
  }
}

function buildPrompt(company: Company, opts: GenerateOptions, hasImages: boolean): string {
  let mainColors: string[] = [];
  if (opts.color_board && opts.color_board.length > 0) {
    mainColors = opts.color_board;
  } else if (company.main_colors) {
    try {
      const parsed = JSON.parse(company.main_colors);
      if (Array.isArray(parsed)) mainColors = parsed as string[];
    } catch { /* ignore */ }
  }

  const colorsStr = mainColors.length > 0 ? mainColors.slice(0, 10).join(', ') : '#111111, #ffffff, #888888';
  const domain = company.domain ?? '';
  const assets = getAssetUrls(domain);
  const assetsBlock = assets.length > 0
    ? `\nAssets scraped from their real website (evaluate each — use the ones that look sharp/relevant, skip low-quality or irrelevant ones):\n${assets.map(u => `  ${u}`).join('\n')}`
    : '';

  const originalUrl = company.url ?? (domain ? `https://${domain}` : null);
  const urlLine = originalUrl ? `Original website: ${originalUrl}` : '';

  const copyBlock = company.copy
    ? `\nExtracted copy from their real website (use this as the actual text content — don't invent marketing copy):\n"""\n${company.copy}\n"""`
    : '';

  const screenshotsNote = hasImages
    ? `\nYou are provided with ${loadGalleryImages(domain).length > 1 ? 'multiple screenshots' : 'a screenshot'} of their current website as reference images above. Study the layout, content sections, and branding carefully.`
    : '';

  let prompt = `You are redesigning the website for a real company. Study the reference below and produce a dramatically better version.

${urlLine}
Company: ${company.name}
Industry: ${company.industry ?? 'unknown'}
What they sell/do: ${company.what_they_sell ?? 'unknown'}
Company size: ${company.company_size ?? 'unknown'}
Brand colors extracted from their site: ${colorsStr}
Original site mood: ${company.mood ?? 'unknown'} / style: ${company.style ?? 'unknown'}
${screenshotsNote}${copyBlock}${assetsBlock}`;

  if (opts.language) {
    const code = opts.language_code ?? 'en';
    prompt += `\n\nLanguage: Generate ALL website copy and UI text in ${opts.language}. The HTML tag must be \`<html lang="${code}">\`.`;
  }

  if (opts.extra_prompt) prompt += `\n\nExtra instructions from user: ${opts.extra_prompt}`;

  prompt += `

Design brief:
- Create a minimalist single-page website
- Aesthetic: clean minimalist — generous whitespace, restrained typography, one strong accent color
- Do NOT copy the old design — improve it radically while keeping the brand identity
- Use the extracted copy verbatim where possible; trim or restructure freely
- Sections: bold hero (company name + one-line tagline), brief about, products/services grid, contact CTA
- Typography: pick one clean Google Font (e.g. Inter, Pretendard, Noto Sans KR for Korean)
- If assets are provided, evaluate them — use the sharpest and most relevant ones; skip blurry or irrelevant images
- Place the best image in the hero section
- Subtle details allowed: thin borders, soft shadows, smooth hover transitions (CSS only)

Technical:
- Single HTML file, ALL CSS in <style> tag, NO external CSS frameworks
- Mobile-first responsive (flexbox/grid + media queries)
- NO JavaScript frameworks
- Output ONLY raw HTML starting with <!DOCTYPE html>`;

  return prompt;
}

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

export async function generateWebsite(
  company: Company,
  opts: GenerateOptions = {}
): Promise<SiteGeneration> {
  if (!company.id) {
    throw new Error('Company must have an id to generate a website');
  }

  const genId = uuidv4();
  const domain = company.domain ?? company.name.toLowerCase().replace(/\s+/g, '-');

  const genDir = path.join(DATA_DIR, domain, 'gen', genId);
  fs.mkdirSync(genDir, { recursive: true });

  const htmlFilePath = path.join(genDir, 'index.html');
  const screenshotFilePath = path.join(genDir, 'screenshot.png');
  const mobileScreenshotFilePath = path.join(genDir, 'screenshot-mobile.png');

  // ── Step 1: Load gallery screenshots for vision ────────────────────────────
  const images = loadGalleryImages(domain);

  // ── Step 2: Call LLM ───────────────────────────────────────────────────────
  const startTime = Date.now();
  const userPrompt = buildPrompt(company, opts, images.length > 0);

  const rawText = await llm.complete({
    system: 'You are a senior web designer specializing in clean, minimalist single-page redesigns. Output only raw HTML — no explanation, no markdown fences, no commentary.',
    prompt: userPrompt,
    maxTokens: 8192,
    images: images.length > 0 ? images : undefined,
  });
  const html = stripFences(rawText);
  const generationTimeMs = Date.now() - startTime;

  // ── Step 3: Save HTML ──────────────────────────────────────────────────────
  fs.writeFileSync(htmlFilePath, html, 'utf-8');

  // ── Step 4: Take screenshots with Playwright ───────────────────────────────
  const browser = await chromium.launch({ headless: true });
  try {
    const desktopContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const desktopPage = await desktopContext.newPage();
    await desktopPage.setContent(html, { waitUntil: 'domcontentloaded' });
    await desktopPage.screenshot({ path: screenshotFilePath, fullPage: true });
    await desktopContext.close();

    const mobileContext = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const mobilePage = await mobileContext.newPage();
    await mobilePage.setContent(html, { waitUntil: 'domcontentloaded' });
    await mobilePage.screenshot({ path: mobileScreenshotFilePath, fullPage: true });
    await mobileContext.close();
  } finally {
    await browser.close();
  }

  // ── Step 5: Persist to DB ──────────────────────────────────────────────────
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
  incrementUpgradedCount(company.id);

  return {
    ...saved,
    html_path: htmlFilePath,
    screenshot_path: screenshotFilePath,
    mobile_screenshot_path: mobileScreenshotFilePath,
  };
}
