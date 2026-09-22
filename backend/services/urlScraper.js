import axios from 'axios';
import * as cheerio from 'cheerio';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/**
 * Checks if a string is a valid HTTP/HTTPS URL.
 * @param {string} text
 * @returns {boolean}
 */
export function isUrl(text) {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!/^https?:\/\//i.test(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    return Boolean(parsed.hostname && parsed.hostname.includes('.'));
  } catch {
    return false;
  }
}

/**
 * Extracts clean domain from a URL.
 * @param {string} urlStr
 * @returns {string}
 */
export function extractDomainFromUrl(urlStr) {
  try {
    const parsed = new URL(urlStr);
    return parsed.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Checks if a domain is an authoritative institutional, research, or government domain.
 * @param {string} domain
 * @returns {boolean}
 */
export function isAuthoritativeDomain(domain) {
  if (!domain) return false;
  const lower = domain.toLowerCase();
  return (
    lower.endsWith('.edu') ||
    lower.endsWith('.gov') ||
    lower.endsWith('.gov.uk') ||
    lower.endsWith('.ac.uk') ||
    lower.endsWith('.gov.in') ||
    lower.includes('who.int') ||
    lower.includes('un.org') ||
    lower.includes('cdc.gov') ||
    lower.includes('nih.gov') ||
    lower.includes('nature.com') ||
    lower.includes('nejm.org') ||
    lower.includes('thelancet.com') ||
    lower.includes('science.org') ||
    lower.includes('sciencedirect.com') ||
    lower.includes('harvard.edu') ||
    lower.includes('ox.ac.uk') ||
    lower.includes('cam.ac.uk') ||
    lower.includes('stanford.edu') ||
    lower.includes('mit.edu')
  );
}

/**
 * Converts a URL pathname into a human-readable title/claim.
 * e.g. /news/study-finds-three-new-safe-effective-ways-treat-drug-resistant-tuberculosis
 *   -> "Study Finds Three New Safe Effective Ways Treat Drug Resistant Tuberculosis"
 * @param {string} urlStr
 * @returns {string}
 */
export function extractHeadlineFromUrlSlug(urlStr) {
  try {
    const parsed = new URL(urlStr);
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length === 0) return '';
    const last = segments[segments.length - 1];
    // Remove file extension (.html, .htm, .php, etc.)
    const clean = last.replace(/\.[a-zA-Z0-9]+$/, '');
    // Replace hyphens, underscores, pluses with spaces
    const words = clean.split(/[-_+%20]+/).filter(w => w.length > 0);
    // Capitalize words
    return words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  } catch {
    return '';
  }
}

/**
 * Queries Google News RSS for coverage of a query.
 * @param {string} query
 * @param {number} maxResults
 * @returns {Promise<Array<{ title: string, snippet: string, source: string, link: string }>>}
 */
export async function searchGoogleNewsRSS(query, maxResults = 5) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  try {
    const res = await axios.get(url, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 10000
    });
    const $ = cheerio.load(res.data, { xmlMode: true });
    const items = [];
    $('item').slice(0, maxResults).each((_, el) => {
      const title = $(el).find('title').text().trim();
      const link = $(el).find('link').text().trim();
      const source = $(el).find('source').text().trim();
      const pubDate = $(el).find('pubDate').text().trim();
      if (title) {
        items.push({
          title,
          snippet: `${source ? `[${source}] ` : ''}${title}${pubDate ? `. Published: ${pubDate}` : ''}`,
          source: source || 'News Source',
          link
        });
      }
    });
    return items;
  } catch (err) {
    console.warn(`[UrlScraper] Google News RSS query failed: ${err.message}`);
    return [];
  }
}

/**
 * Scrapes an article from a URL with full WAF fallback support.
 * @param {string} url
 * @returns {Promise<{
 *   isScrapedUrl: boolean,
 *   sourceUrl: string,
 *   sourceDomain: string,
 *   isAuthoritative: boolean,
 *   title: string,
 *   description: string,
 *   siteName: string,
 *   articleText: string
 * }>}
 */
export async function scrapeArticleFromUrl(url) {
  const cleanUrl = url.trim();
  const domain = extractDomainFromUrl(cleanUrl);
  const authoritative = isAuthoritativeDomain(domain);
  const slugHeadline = extractHeadlineFromUrlSlug(cleanUrl);

  let title = '';
  let description = '';
  let siteName = domain;
  let paragraphs = [];
  let isWafBlocked = false;

  try {
    const response = await axios.get(cleanUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 8000,
      maxRedirects: 5
    });

    const bodyHtml = String(response.data || '');

    // Check for common WAF challenge pages (Incapsula, Cloudflare, Datadome)
    if (
      bodyHtml.includes('_Incapsula_Resource') ||
      bodyHtml.includes('cf-browser-verification') ||
      bodyHtml.includes('datadome') ||
      (bodyHtml.length < 1500 && bodyHtml.includes('<iframe'))
    ) {
      isWafBlocked = true;
      console.log(`[UrlScraper] Target site (${domain}) is protected by WAF/Bot challenge. Using metadata & Google News synthesis.`);
    } else {
      const $ = cheerio.load(bodyHtml);

      // Clean non-content elements
      $('script, style, noscript, nav, footer, aside, .cookie-notice, .ads, .sidebar').remove();

      title = $('meta[property="og:title"]').attr('content') ||
        $('meta[name="twitter:title"]').attr('content') ||
        $('h1').first().text().trim() ||
        $('title').text().trim();

      if (title && title.includes(' | ')) {
        title = title.split(' | ')[0].trim();
      }

      description = $('meta[property="og:description"]').attr('content') ||
        $('meta[name="description"]').attr('content') ||
        $('meta[name="twitter:description"]').attr('content') ||
        '';

      siteName = $('meta[property="og:site_name"]').attr('content') ||
        $('meta[name="application-name"]').attr('content') ||
        domain;

      $('article p, main p, .node__content p, .article-body p, .story-body p, p').each((_, el) => {
        const text = $(el).text().trim().replace(/\s+/g, ' ');
        if (text.length > 50 &&
            !text.toLowerCase().includes('cookie') &&
            !text.toLowerCase().includes('privacy policy') &&
            !text.toLowerCase().includes('all rights reserved') &&
            !paragraphs.includes(text)) {
          paragraphs.push(text);
        }
      });
    }
  } catch (err) {
    console.warn(`[UrlScraper] Direct HTTP fetch failed for ${domain} (${err.message}). Using Google News RSS fallback.`);
    isWafBlocked = true;
  }

  // If direct fetch was WAF blocked or produced no paragraphs, use Google News RSS search
  if (isWafBlocked || paragraphs.length === 0) {
    const searchQuery = slugHeadline || domain;
    const rssResults = await searchGoogleNewsRSS(searchQuery, 4);

    if (rssResults.length > 0) {
      const top = rssResults[0];
      if (!title) title = top.title;
      if (!siteName || siteName === domain) siteName = top.source || domain;

      // Build synthesized article body from live news coverage snippets
      paragraphs = rssResults.map(r => `${r.source ? `According to ${r.source}: ` : ''}${r.snippet}`);
    }
  }

  // Fallback title to slug if still empty
  if (!title) {
    title = slugHeadline || `Article from ${domain}`;
  }

  // Combine title, description, and paragraphs
  const combinedParts = [];
  if (title) combinedParts.push(title);
  if (description && !title.includes(description)) combinedParts.push(description);
  if (paragraphs.length > 0) {
    combinedParts.push(...paragraphs.slice(0, 10));
  } else {
    combinedParts.push(`This article was published by ${domain} under the headline: "${title}".`);
  }

  const fullText = combinedParts.join('\n\n');

  return {
    isScrapedUrl: true,
    sourceUrl: cleanUrl,
    sourceDomain: domain,
    isAuthoritative: authoritative,
    title,
    description,
    siteName,
    articleText: fullText
  };
}
