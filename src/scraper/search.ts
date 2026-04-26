import axios from 'axios';

const DUCKDUCKGO_HTML_URL = 'https://html.duckduckgo.com/html/';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/**
 * Extracts the first result URL from DuckDuckGo HTML search page.
 * DuckDuckGo HTML results use redirect links like:
 *   //duckduckgo.com/l/?uddg=https%3A%2F%2F...
 * or direct href links to result URLs.
 */
function extractFirstResultUrl(html: string): string | null {
  // DuckDuckGo HTML results embed real URLs in the result__a links.
  // The href is usually a DDG redirect: /l/?uddg=<encoded-url>
  // or sometimes the direct URL.

  // Try to find result__a links with uddg param first
  const uddgPattern = /uddg=([^&"]+)/g;
  let match = uddgPattern.exec(html);
  while (match) {
    try {
      const decoded = decodeURIComponent(match[1]);
      if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
        // Skip DuckDuckGo's own pages
        if (!decoded.includes('duckduckgo.com')) {
          return decoded;
        }
      }
    } catch {
      // ignore decode errors
    }
    match = uddgPattern.exec(html);
  }

  // Fallback: look for result__url spans which contain the display URL
  // and pair with the preceding href
  const resultLinkPattern = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"/g;
  let linkMatch = resultLinkPattern.exec(html);
  while (linkMatch) {
    const href = linkMatch[1];
    if (href.startsWith('http://') || href.startsWith('https://')) {
      if (!href.includes('duckduckgo.com')) {
        return href;
      }
    }
    linkMatch = resultLinkPattern.exec(html);
  }

  return null;
}

/**
 * Search the web for a Korean company's official homepage using DuckDuckGo HTML search.
 * @param companyName - The name of the Korean company
 * @returns The URL of the first search result, or null if none found
 */
export async function searchWeb(companyName: string): Promise<string | null> {
  const query = `"${companyName}" 공식 홈페이지 OR 홈페이지`;

  try {
    const response = await axios.post(
      DUCKDUCKGO_HTML_URL,
      new URLSearchParams({ q: query, kl: 'kr-kr' }).toString(),
      {
        headers: {
          'User-Agent': USER_AGENT,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Encoding': 'gzip, deflate, br',
          Referer: 'https://html.duckduckgo.com/',
        },
        timeout: 15000,
        maxRedirects: 5,
      }
    );

    const html: string = typeof response.data === 'string' ? response.data : String(response.data);
    const url = extractFirstResultUrl(html);
    return url;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      throw new Error(`Search request failed: ${error.message}`);
    }
    throw error;
  }
}
