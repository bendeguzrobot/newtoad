import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const url = 'http://ziain.com';
const siteDir = path.join(process.cwd(), 'data/websites/ziain.com');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  const navLinks = await page.evaluate((pageUrl: string) => {
    const seen = new Set<string>();
    const results: Array<{ href: string; label: string }> = [];
    function addLink(el: Element) {
      const href = (el as HTMLAnchorElement).href;
      const text = (el.textContent || '').trim().slice(0, 50);
      if (!href) return;
      try {
        const linkUrl = new URL(href);
        const baseOrigin = new URL(pageUrl).origin;
        if (linkUrl.origin !== baseOrigin) return;
        if (linkUrl.href === pageUrl || linkUrl.href === pageUrl + '/') return;
        const key = linkUrl.pathname + linkUrl.search;
        if (seen.has(key) || key === '/' || key === '') return;
        seen.add(key);
        results.push({ href: linkUrl.href, label: text || linkUrl.pathname });
      } catch {}
    }
    const navSelectors = ['nav a', 'header a', '.gnb a', '#gnb a', '.nav a', '.menu a'];
    for (const sel of navSelectors) document.querySelectorAll(sel).forEach(addLink);
    if (results.length === 0) document.querySelectorAll('a[href]').forEach(addLink);
    return results.slice(0, 4);
  }, url);

  console.log('Nav links found:', navLinks.length, JSON.stringify(navLinks, null, 2));

  for (let i = 0; i < navLinks.length; i++) {
    const link = navLinks[i];
    console.log(`\nNavigating to [${i}]: ${link.href}`);
    try {
      await page.goto(link.href, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(1500);
      const fname = `screenshot-nav-${i}.png`;
      await page.screenshot({ path: path.join(siteDir, fname), fullPage: true });
      console.log(`  ✓ Saved ${fname}`);
    } catch (err) {
      console.log(`  ✗ Failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await browser.close();
}
main().catch(console.error);
