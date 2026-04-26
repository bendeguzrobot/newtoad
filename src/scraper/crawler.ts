import { chromium } from 'playwright';
import axios from 'axios';
import path from 'path';
import fs from 'fs';
import type { CrawlResult, GalleryEntry, GalleryManifest } from '../types.js';

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
 * Attempt to detect and dismiss popups/overlays (cookie banners, GDPR dialogs, modals).
 * Returns true if a dismissal action was performed.
 */
async function dismissPopups(page: import('playwright').Page): Promise<boolean> {
  // Common button text patterns to look for (Korean + English, both cases)
  const buttonTexts = ['닫기', '확인', '동의', 'close', 'Close', 'CLOSE', 'Accept', 'accept', 'OK', 'ok', '×', 'X', '✕', 'Agree', 'Got it', 'I agree'];

  // Strategy 1: Click matching button text
  for (const text of buttonTexts) {
    try {
      // Try exact text match via role
      const btn = page.getByRole('button', { name: text, exact: true });
      if (await btn.count() > 0) {
        await btn.first().click({ timeout: 2000 });
        return true;
      }
    } catch {
      // continue
    }

    try {
      // Try text-content selector (broader)
      const btnByText = page.locator(`button:has-text("${text}")`);
      if (await btnByText.count() > 0) {
        await btnByText.first().click({ timeout: 2000 });
        return true;
      }
    } catch {
      // continue
    }

    try {
      // Try aria-label
      const btnByAria = page.locator(`[aria-label="${text}"]`);
      if (await btnByAria.count() > 0) {
        await btnByAria.first().click({ timeout: 2000 });
        return true;
      }
    } catch {
      // continue
    }
  }

  // Strategy 2: Common popup/modal close selectors (includes input[type=button] for old sites)
  const closeSelectors = [
    '.modal-close',
    '.popup-close',
    '.cookie-close',
    '.btn-close',
    '.close_windows_button',
    '[class*="close"]',
    '[class*="dismiss"]',
    '[class*="accept"]',
    '[class*="agree"]',
    '[id*="close"]',
    '[id*="dismiss"]',
    'input[type="button"][value*="close"]',
    'input[type="button"][value*="Close"]',
    'input[type="button"][value*="닫기"]',
    'input[type="button"][value*="확인"]',
    'input[type="button"][value*="×"]',
    'input[type="button"][value*="✕"]',
    '[id*="cookie"] button',
    '[class*="cookie"] button',
    '[class*="gdpr"] button',
    '[class*="consent"] button',
    '#cookieConsent button',
    '.cookie-banner button',
    '.cookie-notice button',
  ];

  for (const sel of closeSelectors) {
    try {
      const el = page.locator(sel);
      if (await el.count() > 0) {
        await el.first().click({ timeout: 2000 });
        return true;
      }
    } catch {
      // continue
    }
  }

  // Strategy 3: Press Escape
  try {
    await page.keyboard.press('Escape');
    // Check if any visible overlay/modal is now gone — just optimistically return true
    // We'll see from the screenshot whether it worked
    return true;
  } catch {
    // continue
  }

  // Strategy 4: Click top-left corner outside any modal
  try {
    await page.mouse.click(10, 10);
    return true;
  } catch {
    // continue
  }

  return false;
}

/**
 * Check whether the page has any visible popup/overlay/modal indicators.
 */
async function hasVisiblePopup(page: import('playwright').Page): Promise<boolean> {
  return page.evaluate(() => {
    const overlaySelectors = [
      '[class*="modal"]',
      '[class*="popup"]',
      '[class*="overlay"]',
      '[class*="cookie"]',
      '[class*="gdpr"]',
      '[class*="consent"]',
      '[class*="banner"]',
      '[id*="modal"]',
      '[id*="popup"]',
      '[id*="cookie"]',
      '[id*="gdpr"]',
    ];

    for (const sel of overlaySelectors) {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        const style = window.getComputedStyle(el);
        if (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.opacity !== '0' &&
          (el as HTMLElement).offsetHeight > 0
        ) {
          return true;
        }
      }
    }
    return false;
  });
}

/**
 * Navigate to nav links and take screenshots of up to 4 unique destinations.
 * Returns list of gallery entries for successfully captured nav screenshots.
 */
async function captureNavScreenshots(
  page: import('playwright').Page,
  baseUrl: string,
  siteDir: string,
): Promise<GalleryEntry[]> {
  const entries: GalleryEntry[] = [];

  // Collect nav link hrefs — try specific nav selectors first, fall back to all page links.
  // NOTE: No inner named functions inside evaluate — tsx/esbuild wraps them with __name()
  // which is not available in the browser serialization context.
  const navLinks: Array<{ href: string; label: string }> = await page.evaluate((pageUrl: string) => {
    const seen = new Set<string>();
    const results: Array<{ href: string; label: string }> = [];
    const baseOrigin = new URL(pageUrl).origin;
    const currentPath = new URL(pageUrl).pathname;
    const skipExt = ['.css', '.js', '.ico', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.woff', '.ttf', '.pdf'];

    const candidates: Element[] = [];

    // Preferred: semantic nav elements
    const navSelectors = ['nav a', 'header a', '.gnb a', '#gnb a', '#nav a', '.nav a', '.navigation a', '.menu a', '#menu a'];
    for (const sel of navSelectors) {
      document.querySelectorAll(sel).forEach(el => candidates.push(el));
    }
    // Fallback: all anchors on page
    if (candidates.length === 0) {
      document.querySelectorAll('a[href]').forEach(el => candidates.push(el));
    }

    for (const el of candidates) {
      const href = (el as HTMLAnchorElement).href;
      if (!href) continue;
      try {
        const linkUrl = new URL(href);
        if (linkUrl.origin !== baseOrigin) continue;
        const lowerPath = linkUrl.pathname.toLowerCase();
        if (skipExt.some(ext => lowerPath.endsWith(ext))) continue;
        if (linkUrl.pathname === currentPath && linkUrl.hash) continue;
        if (linkUrl.href === pageUrl || linkUrl.href === pageUrl + '/') continue;
        const key = linkUrl.pathname + linkUrl.search;
        if (seen.has(key) || key === '/' || key === '') continue;
        seen.add(key);
        const text = (el.textContent || '').trim().slice(0, 50);
        results.push({ href: linkUrl.href, label: text || linkUrl.pathname });
      } catch { /* ignore invalid URLs */ }
      if (results.length >= 4) break;
    }

    return results;
  }, baseUrl);

  let navIndex = 0;
  for (const link of navLinks) {
    if (navIndex >= 4) break;
    try {
      await page.goto(link.href, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(1500);

      const filename = `screenshot-nav-${navIndex}.png`;
      const filePath = path.join(siteDir, filename);
      await page.screenshot({ path: filePath, fullPage: true });

      entries.push({ file: filename, label: link.label || `Page ${navIndex + 1}` });
      navIndex++;

      // Navigate back to the base page for next iteration
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(800);
    } catch {
      // Skip this link on any error (timeout, navigation error, etc.)
      try {
        // Try to recover by going back to base
        await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(500);
      } catch {
        // If we can't recover, break out of nav capture
        break;
      }
    }
  }

  return entries;
}

/**
 * Crawl a website using Playwright:
 * - Take full-page screenshot
 * - Take mobile screenshot
 * - Detect & dismiss popups, take clean screenshot
 * - Navigate top-level nav links, take up to 4 nav screenshots
 * - Write gallery.json manifest
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
  const cleanScreenshotPath = path.join(siteDir, 'screenshot-clean.png');
  const htmlPath = path.join(siteDir, 'index.html');
  const metadataPath = path.join(siteDir, 'metadata.json');
  const galleryPath = path.join(siteDir, 'gallery.json');

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

    // Full-page screenshot (landing)
    await page.screenshot({ path: screenshotPath, fullPage: true });

    // Gallery entries — always start with the landing screenshot
    const galleryEntries: GalleryEntry[] = [
      { file: 'screenshot.png', label: 'Landing' },
    ];

    // --- Popup detection & dismissal ---
    let tookCleanShot = false;
    try {
      const popupDetected = await hasVisiblePopup(page);
      if (popupDetected) {
        const dismissed = await dismissPopups(page);
        if (dismissed) {
          await page.waitForTimeout(800);
          await page.screenshot({ path: cleanScreenshotPath, fullPage: true });
          tookCleanShot = true;
          galleryEntries.push({ file: 'screenshot-clean.png', label: 'Landing (no popups)' });
        }
      }
    } catch {
      // Popup detection is best-effort — don't fail the whole crawl
    }

    // --- Nav screenshots ---
    // Re-load the base page fresh before nav traversal (popup dismissal may have navigated)
    try {
      if (tookCleanShot) {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(1000);
      }
      const navEntries = await captureNavScreenshots(page, url, siteDir);
      galleryEntries.push(...navEntries);
    } catch {
      // Nav capture is best-effort
    }

    // Make sure we're back on the original page for data extraction
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(1000);
    } catch {
      // ignore — we'll use whatever state the page is in
    }

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

    // --- Write gallery.json (only include files that actually exist) ---
    const verifiedEntries = galleryEntries.filter(entry =>
      fs.existsSync(path.join(siteDir, entry.file))
    );
    const gallery: GalleryManifest = { screenshots: verifiedEntries };
    fs.writeFileSync(galleryPath, JSON.stringify(gallery, null, 2), 'utf-8');

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
      galleryPath,
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
      galleryPath,
    };
  } finally {
    await browser.close();
  }

  return result;
}
