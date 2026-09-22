import axios from 'axios';
import * as cheerio from 'cheerio';
import {
  searchGoogleNewsRSS,
  isUrl,
  extractHeadlineFromUrlSlug,
  isAuthoritativeDomain,
  extractDomainFromUrl
} from './urlScraper.js';

// ==========================================
// Reputable Domain Lists & Publishers
// ==========================================

/**
 * Curated list of reputable news and institutional domains.
 * Used for evidence quality scoring and origin tracing.
 */
const REPUTABLE_NEWS_DOMAINS = new Set([
  // Wire services / primary news agencies
  'reuters.com', 'apnews.com', 'afp.com',
  // Major international news
  'bbc.com', 'bbc.co.uk', 'aljazeera.com', 'dw.com',
  'theguardian.com', 'nytimes.com', 'washingtonpost.com',
  'economist.com', 'ft.com', 'bloomberg.com',
  'cnn.com', 'nbcnews.com', 'abcnews.go.com', 'cbsnews.com',
  'npr.org', 'pbs.org',
  // Fact-checking organizations
  'snopes.com', 'politifact.com', 'factcheck.org',
  'fullfact.org', 'checkyourfact.com',
  // Science / academic / medical
  'nature.com', 'sciencemag.org', 'science.org', 'thelancet.com',
  'nejm.org', 'bmj.com', 'cell.com', 'sciencedirect.com',
  'springer.com', 'wiley.com', 'sciencedaily.com', 'medicalxpress.com',
  'eurekalert.org', 'scientificamerican.com', 'newscientist.com',
  'harvard.edu', 'stanford.edu', 'mit.edu', 'ox.ac.uk', 'cam.ac.uk',
  // Regional / other reputable
  'thehindu.com', 'ndtv.com', 'abc.net.au',
  'cbc.ca', 'france24.com', 'scmp.com', 'indianexpress.com'
]);

/**
 * Domains that indicate an authoritative primary/original source.
 */
const ORIGIN_INDICATOR_DOMAINS = new Set([
  // Government & official
  'who.int', 'cdc.gov', 'nih.gov', 'fda.gov', 'europa.eu',
  'un.org', 'worldbank.org', 'imf.org',
  // Academic / research
  'arxiv.org', 'pubmed.ncbi.nlm.nih.gov', 'scholar.google.com',
  'doi.org', 'researchgate.net', 'jstor.org',
  'ncbi.nlm.nih.gov', 'ssrn.com',
  'harvard.edu', 'stanford.edu', 'mit.edu', 'ox.ac.uk',
  'nature.com', 'nejm.org', 'thelancet.com', 'bmj.com',
  // Wire services (original reporting)
  'reuters.com', 'apnews.com', 'afp.com',
  // Fact-checkers
  'snopes.com', 'politifact.com', 'factcheck.org', 'fullfact.org'
]);

/**
 * Keywords in publisher names from RSS feeds that indicate reputable outlets.
 */
const REPUTABLE_PUBLISHER_NAMES = [
  'harvard', 'bmj', 'science', 'nature', 'lancet', 'nejm',
  'reuters', 'associated press', 'ap news', 'bbc', 'the guardian',
  'new york times', 'washington post', 'sciencedaily', 'medical xpress',
  'eurekalert', 'nih', 'cdc', 'who', 'national institutes of health',
  'springer', 'cell', 'wiley', 'bloomberg', 'npr', 'pbs', 'dw', 'afp',
  'oxford', 'cambridge', 'stanford', 'mit'
];

// ==========================================
// Helper Utilities
// ==========================================

/**
 * Extracts a clean domain from a URL or partial URL string.
 * @param {string} urlStr 
 * @returns {string}
 */
export function extractDomain(urlStr) {
  if (!urlStr) return '';
  return extractDomainFromUrl(urlStr);
}

/**
 * Checks if a domain or publisher name is considered reputable.
 * @param {string} domain 
 * @param {string} sourceName 
 * @returns {boolean}
 */
export function isReputableEntity(domain, sourceName = '') {
  if (domain) {
    const cleanDomain = domain.toLowerCase();
    if (REPUTABLE_NEWS_DOMAINS.has(cleanDomain)) return true;
    if ([...REPUTABLE_NEWS_DOMAINS].some(rep => cleanDomain.endsWith('.' + rep) || cleanDomain === rep)) return true;
    if (isAuthoritativeDomain(cleanDomain)) return true;
  }
  if (sourceName) {
    const cleanSource = sourceName.toLowerCase();
    if (REPUTABLE_PUBLISHER_NAMES.some(pub => cleanSource.includes(pub))) return true;
  }
  return false;
}

/**
 * Computes Jaccard similarity between two sets of words.
 * @param {Set<string>} setA 
 * @param {Set<string>} setB 
 * @returns {number} 0.0 – 1.0
 */
function jaccardSimilarity(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return 0;
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Extracts significant keywords from text (removes stop words, short words).
 * @param {string} text 
 * @returns {Set<string>}
 */
function extractKeywords(text) {
  const STOP_WORDS = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over',
    'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when',
    'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more',
    'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
    'same', 'so', 'than', 'too', 'very', 'just', 'because', 'but', 'and',
    'or', 'if', 'while', 'about', 'up', 'their', 'them', 'they', 'this',
    'that', 'these', 'those', 'it', 'its', 'his', 'her', 'he', 'she',
    'we', 'you', 'i', 'my', 'your', 'our', 'what', 'which', 'who',
    'said', 'also', 'been', 'new', 'one', 'two', 'first', 'last'
  ]);

  const words = text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOP_WORDS.has(w));

  return new Set(words);
}

// ==========================================
// Search Query Extraction
// ==========================================

/**
 * Extracts a concise search query from article text or URL.
 * @param {string} text 
 * @returns {string} Clean search query
 */
export function extractSearchQuery(text) {
  if (!text || typeof text !== 'string') return '';

  const clean = text.trim();

  // If input is a URL, extract search query from URL slug
  if (isUrl(clean)) {
    const slugHeadline = extractHeadlineFromUrlSlug(clean);
    if (slugHeadline && slugHeadline.length >= 10) {
      return slugHeadline.slice(0, 120);
    }
  }

  // If text starts with a headline or line break
  const firstLine = clean.split(/\r?\n/)[0].trim();
  if (firstLine.length >= 15 && firstLine.length <= 150) {
    return firstLine.replace(/["'""]/g, '').trim();
  }

  // Otherwise take the first sentence or first 120 chars
  const firstSentence = clean.split(/(?<=[.?!])\s+/)[0] || clean.slice(0, 120);
  return firstSentence
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

// ==========================================
// Multi-Engine Search Core
// ==========================================

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/**
 * Searches the web for evidence using Google News RSS (primary, captcha-free)
 * with DuckDuckGo as fallback.
 * 
 * @param {string} query 
 * @param {number} maxResults 
 * @returns {Promise<Array<{title: string, snippet: string, url: string, source: string}>>}
 */
export async function searchWeb(query, maxResults = 5) {
  // 1. Primary: Google News RSS (extremely reliable, live news coverage, no captcha block)
  try {
    const rssResults = await searchGoogleNewsRSS(query, maxResults);
    if (rssResults.length > 0) {
      return rssResults.map(item => ({
        title: item.title,
        snippet: item.snippet,
        url: item.link,
        source: item.source
      }));
    }
  } catch (rssError) {
    console.warn(`[EvidenceService] Google News RSS error (${rssError.message}), trying DuckDuckGo...`);
  }

  // 2. Secondary: DuckDuckGo HTML / Instant Answer
  return await searchDuckDuckGo(query, maxResults);
}

/**
 * Performs a DuckDuckGo HTML search and returns structured snippets.
 * @param {string} query 
 * @param {number} maxResults 
 * @returns {Promise<Array<{title: string, snippet: string, url: string, source: string}>>}
 */
async function searchDuckDuckGo(query, maxResults = 4) {
  let snippets = [];

  // Try DuckDuckGo HTML search
  try {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await axios.get(searchUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      timeout: 5000
    });

    const $ = cheerio.load(response.data);
    $('.result__body').slice(0, maxResults).each((_, el) => {
      const title = $(el).find('.result__title').text().trim();
      const snippet = $(el).find('.result__snippet').text().trim();
      const url = $(el).find('.result__url').text().trim();
      if (snippet) {
        snippets.push({
          title: title || 'Web Source',
          snippet,
          url: url || '',
          source: extractDomain(url) || 'DuckDuckGo'
        });
      }
    });
  } catch (ddgError) {
    console.warn(`[EvidenceService] DDG HTML search failed (${ddgError.message})`);
  }

  // Fallback: DuckDuckGo Instant Answer API
  if (snippets.length === 0) {
    try {
      const apiUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
      const apiRes = await axios.get(apiUrl, {
        headers: { 'User-Agent': USER_AGENT },
        timeout: 4000
      });

      if (apiRes.data) {
        const abstract = apiRes.data.AbstractText || apiRes.data.Abstract || '';
        const heading = apiRes.data.Heading || query;
        if (abstract) {
          snippets.push({
            title: heading,
            snippet: abstract,
            url: apiRes.data.AbstractURL || '',
            source: 'DuckDuckGo Abstract'
          });
        }
      }
    } catch (apiError) {
      console.warn(`[EvidenceService] DDG Instant Answer API failed: ${apiError.message}`);
    }
  }

  return snippets;
}

// ==========================================
// Evidence Quality Metrics (Signal Layer 2)
// ==========================================

/**
 * Computes quantitative evidence quality metrics from search snippets.
 * @param {Array<{title: string, snippet: string, url: string, source: string}>} snippets
 * @param {string} articleText — original article text for relevance comparison
 * @param {Object} [articleMeta] — optional metadata if article was scraped from URL
 * @returns {Object} Evidence quality metrics with riskScore 0–100
 */
export function computeEvidenceMetrics(snippets, articleText, articleMeta = null) {
  const isInputAuthoritative = Boolean(articleMeta?.isAuthoritative);

  if (!snippets || snippets.length === 0) {
    // If the article itself is from an authoritative institutional domain, moderate risk
    if (isInputAuthoritative) {
      return {
        riskScore: 25, // low risk because source itself is institutional authority
        sourcesFound: 1,
        domainDiversity: 1,
        reputableSources: 1,
        snippetRelevance: 0.8,
        domains: [articleMeta.sourceDomain],
        detail: `Direct authoritative primary source: ${articleMeta.sourceDomain}`
      };
    }
    return {
      riskScore: 75,
      sourcesFound: 0,
      domainDiversity: 0,
      reputableSources: 0,
      snippetRelevance: 0,
      domains: [],
      detail: 'No web evidence found — high uncertainty'
    };
  }

  // 1. Sources found (0–5 range)
  const sourcesFound = snippets.length;

  // 2. Domain & source diversity & reputation
  const rawDomains = snippets.map(s => extractDomain(s.url)).filter(Boolean);
  const sources = snippets.map(s => s.source).filter(Boolean);
  
  if (articleMeta?.sourceDomain) {
    rawDomains.push(articleMeta.sourceDomain);
  }

  const uniqueDomains = [...new Set(rawDomains)];
  const domainDiversity = Math.max(uniqueDomains.length, [...new Set(sources)].length);

  // Count reputable sources across domains AND outlet names
  let reputableCount = 0;
  for (const s of snippets) {
    const d = extractDomain(s.url);
    if (isReputableEntity(d, s.source)) {
      reputableCount++;
    }
  }
  if (isInputAuthoritative) {
    reputableCount++;
  }

  // 3. Snippet relevance (Jaccard similarity with article)
  const articleKeywords = extractKeywords(articleText);
  const allSnippetText = snippets.map(s => `${s.title} ${s.snippet} ${s.source || ''}`).join(' ');
  const snippetKeywords = extractKeywords(allSnippetText);
  const snippetRelevance = jaccardSimilarity(articleKeywords, snippetKeywords);

  // 4. Compute risk score
  // Start at 70 base risk
  let riskScore = isInputAuthoritative ? 40 : 70;

  // Sources found: each source reduces risk
  riskScore -= Math.min(sourcesFound * 8, 30); // -8 per source, up to -30

  // Domain diversity: diverse sources = more reliable
  riskScore -= Math.min(domainDiversity * 5, 15); // -5 per unique domain, up to -15

  // Reputable sources: strong trust signal
  riskScore -= Math.min(reputableCount * 10, 25); // -10 per reputable source, up to -25

  // Snippet relevance: if sources are about the same topic
  riskScore -= Math.round(snippetRelevance * 20); // up to -20 for high relevance

  riskScore = Math.max(5, Math.min(100, riskScore));

  const displayDomains = [...new Set([...uniqueDomains, ...sources])].slice(0, 5);

  const formattedSnippets = (snippets || []).slice(0, 4).map(s => {
    const d = extractDomain(s.url);
    return {
      title: s.title,
      snippet: s.snippet,
      url: s.url,
      source: s.source || d || 'News Outlet',
      isReputable: isReputableEntity(d, s.source)
    };
  });

  return {
    riskScore,
    sourcesFound: isInputAuthoritative ? sourcesFound + 1 : sourcesFound,
    domainDiversity,
    reputableSources: reputableCount,
    snippetRelevance: Math.round(snippetRelevance * 100) / 100,
    domains: displayDomains,
    snippets: formattedSnippets,
    detail: `${sourcesFound} sources from ${domainDiversity} outlets (${reputableCount} reputable), relevance: ${(snippetRelevance * 100).toFixed(0)}%`
  };
}

// ==========================================
// Source Origin Tracing (Signal Layer 3)
// ==========================================

/**
 * Attempts to trace the original source of claims in an article.
 * Searches for the original study/report/primary source and returns structured data.
 * 
 * @param {string} articleText 
 * @param {Object} [articleMeta] — optional metadata if article was scraped from URL
 * @returns {Promise<Object>} Origin trace result
 */
export async function traceOrigin(articleText, articleMeta = null) {
  // 1. If the article itself originates directly from an authoritative domain (.edu, .gov, who.int, etc.)
  if (articleMeta?.isAuthoritative && articleMeta?.sourceDomain) {
    let originType = 'research_paper';
    if (articleMeta.sourceDomain.endsWith('.gov') || articleMeta.sourceDomain.includes('who.int')) {
      originType = 'official_report';
    }

    return {
      originFound: true,
      originType,
      originTitle: articleMeta.title,
      originUrl: articleMeta.sourceUrl,
      originDomain: articleMeta.sourceDomain,
      originSnippet: articleMeta.description || articleMeta.title,
      isReputableOrigin: true,
      evidenceText: `• [${articleMeta.title}] (${articleMeta.sourceDomain}): Direct publication by ${articleMeta.siteName || articleMeta.sourceDomain}`,
      detail: `Direct authoritative primary source: ${articleMeta.sourceDomain} (${articleMeta.siteName || 'Verified Institution'})`
    };
  }

  const query = extractSearchQuery(articleText);
  if (!query) {
    return {
      originFound: false,
      originType: 'none_found',
      originTitle: null,
      originUrl: null,
      originDomain: null,
      originSnippet: null,
      isReputableOrigin: false,
      evidenceText: '',
      detail: 'Could not extract a search query for origin tracing'
    };
  }

  // Search with origin-focused query modifiers
  const originQueries = [
    `${query} original study research`,
    `${query} official report source`
  ];

  let allSnippets = [];

  for (const oq of originQueries) {
    try {
      const results = await searchWeb(oq, 3);
      allSnippets.push(...results);
    } catch (err) {
      console.warn(`[EvidenceService] Origin search failed for "${oq}": ${err.message}`);
    }
  }

  // Deduplicate by title or URL
  const seen = new Set();
  allSnippets = allSnippets.filter(s => {
    const key = s.url || s.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (allSnippets.length === 0) {
    return {
      originFound: false,
      originType: 'none_found',
      originTitle: null,
      originUrl: null,
      originDomain: null,
      originSnippet: null,
      isReputableOrigin: false,
      evidenceText: 'No original source candidates found via web search.',
      detail: 'Origin search returned no results'
    };
  }

  // Prioritize results from authoritative/origin-indicator domains & publishers
  let bestCandidate = null;
  let bestScore = -1;

  for (const snippet of allSnippets) {
    const domain = extractDomain(snippet.url);
    const sourceName = snippet.source || '';
    let score = 0;

    // Origin indicator domains get highest priority
    if (ORIGIN_INDICATOR_DOMAINS.has(domain) || [...ORIGIN_INDICATOR_DOMAINS].some(d => domain.endsWith('.' + d))) {
      score += 100;
    }
    // TLD-based signals
    if (domain.endsWith('.edu') || domain.endsWith('.ac.uk')) score += 85;
    if (domain.endsWith('.gov') || domain.endsWith('.gov.uk')) score += 90;
    if (domain.endsWith('.org')) score += 30;

    // Reputable news domains or publisher names
    if (isReputableEntity(domain, sourceName)) score += 60;

    // Keywords in title suggesting it's a primary source
    const titleLower = snippet.title.toLowerCase();
    if (titleLower.includes('study') || titleLower.includes('research')) score += 25;
    if (titleLower.includes('report') || titleLower.includes('findings')) score += 20;
    if (titleLower.includes('clinical trial') || titleLower.includes('journal')) score += 30;
    if (titleLower.includes('official')) score += 15;

    if (score > bestScore) {
      bestScore = score;
      bestCandidate = { ...snippet, domain, score };
    }
  }

  if (!bestCandidate || bestScore < 10) {
    return {
      originFound: false,
      originType: 'none_found',
      originTitle: allSnippets[0]?.title || null,
      originUrl: allSnippets[0]?.url || null,
      originDomain: extractDomain(allSnippets[0]?.url),
      originSnippet: allSnippets[0]?.snippet || null,
      isReputableOrigin: false,
      evidenceText: formatOriginEvidence(allSnippets.slice(0, 3)),
      detail: 'No authoritative original source identified'
    };
  }

  // Determine origin type
  let originType = 'primary_news';
  const domain = bestCandidate.domain;
  const sourceLower = (bestCandidate.source || '').toLowerCase();

  if (domain.endsWith('.edu') || domain.endsWith('.ac.uk') || sourceLower.includes('harvard') ||
      ['arxiv.org', 'pubmed', 'scholar', 'doi.org', 'nature', 'bmj', 'nejm', 'lancet', 'science'].some(d => domain.includes(d) || sourceLower.includes(d))) {
    originType = 'research_paper';
  } else if (domain.endsWith('.gov') || domain.endsWith('.gov.uk') ||
             ['who.int', 'un.org', 'cdc', 'nih', 'europa.eu'].some(d => domain.includes(d) || sourceLower.includes(d))) {
    originType = 'official_report';
  } else if (['snopes.com', 'politifact.com', 'factcheck.org'].some(d => domain.includes(d))) {
    originType = 'fact_check';
  }

  const isReputable = isReputableEntity(domain, bestCandidate.source);

  return {
    originFound: true,
    originType,
    originTitle: bestCandidate.title,
    originUrl: bestCandidate.url,
    originDomain: domain || bestCandidate.source,
    originSnippet: bestCandidate.snippet,
    isReputableOrigin: isReputable,
    evidenceText: formatOriginEvidence(allSnippets.slice(0, 3)),
    detail: `Origin candidate: ${bestCandidate.title} (${bestCandidate.source || domain}, type: ${originType})`
  };
}

/**
 * Formats origin search results into compact evidence text for LLM context.
 */
function formatOriginEvidence(snippets) {
  if (!snippets || snippets.length === 0) return '';
  let combined = '';
  for (const s of snippets) {
    const label = s.source || extractDomain(s.url) || 'News Source';
    const entry = `• [${s.title}] (${label}): "${s.snippet.replace(/\s+/g, ' ')}"\n`;
    if ((combined + entry).length > 1200) break;
    combined += entry;
  }
  return combined.trim();
}

// ==========================================
// Main Evidence Gathering Function
// ==========================================

/**
 * Gathers evidence for a news claim using Google News RSS + scraping.
 * 
 * @param {string} articleText 
 * @param {Object} [articleMeta] — optional metadata if article was scraped from URL
 * @returns {Promise<{ query: string, evidenceText: string, sourcesCount: number, metrics: Object, snippets: Array }>}
 */
export async function gatherEvidence(articleText, articleMeta = null) {
  const query = extractSearchQuery(articleText);
  if (!query) {
    return {
      query: '',
      evidenceText: 'No search query could be extracted from the article text.',
      sourcesCount: 0,
      snippets: [],
      metrics: computeEvidenceMetrics([], articleText, articleMeta)
    };
  }

  const snippets = await searchWeb(query, 5);

  // Format evidence text (trimmed for token safety)
  let evidenceText = '';
  if (snippets.length === 0) {
    evidenceText = 'No live web coverage or corroborated sources found for this claim query.';
  } else {
    let combined = '';
    for (const s of snippets) {
      const label = s.source || extractDomain(s.url) || 'News Source';
      const entry = `• [${s.title}] (${label}): "${s.snippet.replace(/\s+/g, ' ')}"\n`;
      if ((combined + entry).length > 1400) break;
      combined += entry;
    }
    evidenceText = combined.trim();
  }

  // Compute evidence quality metrics
  const metrics = computeEvidenceMetrics(snippets, articleText, articleMeta);

  return {
    query,
    evidenceText,
    sourcesCount: snippets.length,
    snippets,
    metrics
  };
}

export default {
  extractSearchQuery,
  searchWeb,
  gatherEvidence,
  computeEvidenceMetrics,
  traceOrigin,
  isReputableEntity
};
