import { chromium } from 'playwright';
import axios from 'axios';
import path from 'path';
import fs from 'fs';
import type { CrawlResult } from '../types.js';

const DATA_DIR = path.join(process.cwd(), 'data', 'websites');

/**
 * Sanitize a domain string so it can be safely used as a directory name.
 */
function sanitizeDomain(domain: string): string {
  return domain.replace(/[^a-zA-Z0-9.-]/g, '_').replace(/^\.+|\.+$/g, '');
}

/**
 * Extract text content from the page, truncated to maxChars.
 */
async function extractVisibleText(page: import('playwright').Page, maxChars = 5000): Promise<string> {
  const text = await page.evaluate(() => {
    // Remove script and style elements before extracting text
    const clone = document.cloneNode(true) as Document;
    clone.querySelectorAll('script, style, noscript, iframe').forEach(el => el.remove());
    return (clone.body?.innerText || clone.body?.textContent || '').trim();
  });
  return text.slice(0, maxChars);
}

/**
 * Download an image from a URL and save it to the assets directory.
 * Returns the local path on success, or null on failure.
 */
async function downloadImage(src: string, assetsDir: string, index: number): Promise<string | null> {
  try {
    const response = await axios.get(src, {
      responseType: 'arraybuffer',
      timeout: 10000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      maxContentLength: 5 * 1024 * 1024, // 5MB limit per image
    });

    const contentType: string = (response.headers['content-type'] as string) || 'image/jpeg';
    const ext = contentType.split('/')[1]?.split(';')[0] || 'jpg';
    const filename = `image-${index}.${ext}`;
    const filePath = path.join(assetsDir, filename);
    fs.writeFileSync(filePath, Buffer.from(response.data as ArrayBuffer));
    return filePath;
  } catch {
    return null;
  }
}

/**
 * Crawl a website using Playwright:
 * - Take full-page screenshot
 * - Take mobile screenshot
 * - Extract page metadata and text
 * - Download images (up to 10)
 * - Save HTML
 * - Write metadata.json
 */
export async function crawlWebsite(url: string, domain: string): Promise<CrawlResult> {
  const safeDomain = sanitizeDomain(domain);
  const siteDir = path.join(DATA_DIR, safeDomain);
  const assetsDir = path.join(siteDir, 'assets');

  fs.mkdirSync(siteDir, { recursive: true });
  fs.mkdirSync(assetsDir, { recursive: true });

  const screenshotPath = path.join(siteDir, 'screenshot.png');
  const mobileScreenshotPath = path.join(siteDir, 'screenshot-mobile.png');
  const htmlPath = path.join(siteDir, 'index.html');
  const metadataPath = path.join(siteDir, 'metadata.json');

  const browser = await chromium.launch({ headless: true });

  let result: CrawlResult;

  try {
    // --- Desktop crawl ---
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'ko-KR',
    });

    const page = await context.newPage();

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Full-page screenshot
    await page.screenshot({ path: screenshotPath, fullPage: true });

    // Extract data
    const title = await page.title();

    const metaDescription = await page.evaluate(() => {
      const el =
        document.querySelector('meta[name="description"]') ||
        document.querySelector('meta[property="og:description"]');
      return (el as HTMLMetaElement | null)?.content || '';
    });

    const h1Texts = await page.$$eval('h1', els => els.map(el => el.textContent?.trim() || '').filter(Boolean));
    const h2Texts = await page.$$eval('h2', els => els.map(el => el.textContent?.trim() || '').filter(Boolean));

    const visibleText = await extractVisibleText(page);

    // Extract image srcs (absolute URLs only, max 10)
    const imageSrcs = await page.evaluate((pageUrl: string) => {
      const imgs = Array.from(document.querySelectorAll('img[src]'));
      return imgs
        .map(img => {
          const src = (img as HTMLImageElement).src;
          if (!src) return null;
          try {
            return new URL(src, pageUrl).href;
          } catch {
            return null;
          }
        })
        .filter((src): src is string => src !== null && src.startsWith('http'))
        .slice(0, 10);
    }, url);

    // Extract HTML head section
    const htmlHead = await page.evaluate(() => {
      return document.head?.innerHTML?.slice(0, 3000) || '';
    });

    // Save full HTML
    const html = await page.content();
    fs.writeFileSync(htmlPath, html, 'utf-8');

    await context.close();

    // --- Mobile screenshot ---
    const mobileContext = await browser.newContext({
      viewport: { width: 375, height: 812 },
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      locale: 'ko-KR',
    });

    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await mobilePage.waitForTimeout(1500);
    await mobilePage.screenshot({ path: mobileScreenshotPath, fullPage: true });
    await mobileContext.close();

    // --- Download images ---
    const downloadedImages: string[] = [];
    for (let i = 0; i < imageSrcs.length; i++) {
      const localPath = await downloadImage(imageSrcs[i], assetsDir, i);
      if (localPath) downloadedImages.push(localPath);
    }

    // --- Write metadata.json ---
    const metadata = {
      url,
      domain: safeDomain,
      crawledAt: new Date().toISOString(),
      title,
      metaDescription,
      h1Texts,
      h2Texts,
      imageSrcs,
      downloadedImages,
      screenshotPath,
      mobileScreenshotPath,
      htmlPath,
    };
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');

    result = {
      url,
      domain: safeDomain,
      title,
      metaDescription,
      h1Texts,
      h2Texts,
      visibleText,
      imageSrcs,
      htmlHead,
      screenshotPath,
      mobileScreenshotPath,
      htmlPath,
      metadataPath,
    };
  } finally {
    await browser.close();
  }

  return result;
}
