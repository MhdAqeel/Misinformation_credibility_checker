import crypto from 'crypto';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';
import { calculateScores } from '../scoringEngine.js';
import { gatherEvidence, traceOrigin } from './evidenceService.js';
import { analyzeText } from './textAnalyzer.js';
import { isUrl, scrapeArticleFromUrl } from './urlScraper.js';

// ==========================================
// In-Memory Cache Configuration
// ==========================================
const cache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const CACHE_MAX_SIZE = 100;

function getCacheKey(text) {
  const normalized = (text || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function getFromCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setInCache(key, data) {
  if (cache.size >= CACHE_MAX_SIZE) {
    // Evict oldest entry
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  cache.set(key, { data, timestamp: Date.now() });
}

// ==========================================
// Circuit Breaker State
// ==========================================
const circuitBreaker = {
  consecutiveFailures: 0,
  circuitOpenUntil: 0,
  FAILURE_THRESHOLD: 3,
  COOLDOWN_MS: 60 * 1000, // 60 seconds

  isOpen() {
    return Date.now() < this.circuitOpenUntil;
  },

  recordSuccess() {
    if (this.consecutiveFailures > 0 || this.circuitOpenUntil > 0) {
      console.log('[CircuitBreaker] Gemini call succeeded. Resetting circuit breaker.');
    }
    this.consecutiveFailures = 0;
    this.circuitOpenUntil = 0;
  },

  recordFailure(reason) {
    this.consecutiveFailures += 1;
    console.warn(`[CircuitBreaker] Gemini transient failure #${this.consecutiveFailures} (reason: ${reason})`);
    if (this.consecutiveFailures >= this.FAILURE_THRESHOLD) {
      this.circuitOpenUntil = Date.now() + this.COOLDOWN_MS;
      console.warn(`[CircuitBreaker] ⚠️ Threshold reached (${this.FAILURE_THRESHOLD} failures). Circuit OPEN: Skipping Gemini for ${this.COOLDOWN_MS / 1000}s.`);
    }
  },

  getRemainingCooldownSeconds() {
    return Math.max(0, Math.ceil((this.circuitOpenUntil - Date.now()) / 1000));
  }
};

// ==========================================
// Error Classification Helpers
// ==========================================

/**
 * Checks if an error is non-transient (400, 401, 403).
 * Non-transient errors indicate configuration/auth issues or bad client requests and must NOT fall back.
 */
function isFatalNonTransientError(error) {
  const status = error.status || error.statusCode || error.response?.status;
  if (status === 400 || status === 401 || status === 403) {
    return true;
  }
  const msg = String(error.message || '').toLowerCase();
  if (
    msg.includes('api_key_invalid') ||
    msg.includes('unauthenticated') ||
    msg.includes('permission_denied') ||
    msg.includes('401 unauthorized') ||
    msg.includes('403 forbidden') ||
    msg.includes('400 bad request') ||
    msg.includes('invalid api key')
  ) {
    return true;
  }
  return false;
}

/**
 * Checks if an error is transient (429, 500, 502, 503, 504, timeout, network).
 */
function isTransientError(error) {
  if (isFatalNonTransientError(error)) return false;

  const status = error.status || error.statusCode || error.response?.status;
  if ([429, 500, 502, 503, 504].includes(status)) {
    return true;
  }

  const msg = String(error.message || '').toLowerCase();
  const code = error.code || '';

  return (
    status === 429 ||
    msg.includes('429') ||
    msg.includes('resource_exhausted') ||
    msg.includes('quota') ||
    msg.includes('too many requests') ||
    msg.includes('503') ||
    msg.includes('unavailable') ||
    msg.includes('500') ||
    msg.includes('502') ||
    msg.includes('504') ||
    msg.includes('deadline_exceeded') ||
    msg.includes('overloaded') ||
    msg.includes('fetch failed') ||
    msg.includes('timeout') ||
    msg.includes('etimedout') ||
    msg.includes('econnreset') ||
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'ENOTFOUND' ||
    code === 'ECONNREFUSED'
  );
}

/**
 * Extracts Retry-After delay in ms if provided in error headers or message.
 */
function getRetryAfterMs(error) {
  const retryHeader = error.response?.headers?.['retry-after'] || error.headers?.get?.('retry-after');
  if (retryHeader) {
    const seconds = parseInt(retryHeader, 10);
    if (!isNaN(seconds) && seconds > 0) {
      return seconds * 1000;
    }
  }
  // Check for regex like "retry after 3s"
  const match = String(error.message || '').match(/retry after (\d+)s/i);
  if (match && match[1]) {
    return parseInt(match[1], 10) * 1000;
  }
  return null;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==========================================
// Schema Validation & Cleaning
// ==========================================
function cleanAndParseJson(rawText) {
  if (!rawText) return null;
  let cleaned = rawText.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // Attempt extracting the first JSON object inside the text
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (err2) {
        return null;
      }
    }
    return null;
  }
}

function validateSchema(parsed) {
  if (!parsed || typeof parsed !== 'object') return false;
  if (!Array.isArray(parsed.flags)) return false;
  if (!parsed.headline || typeof parsed.headline !== 'string') return false;
  if (!parsed.claim_check_summary || typeof parsed.claim_check_summary !== 'string') return false;
  const validConsensus = ['supported', 'disputed', 'unclear', 'no_coverage_found'];
  if (!validConsensus.includes(parsed.consensus)) return false;
  // confidence is optional (0.0–1.0), default to 0.5 if missing
  if (parsed.confidence !== undefined) {
    parsed.confidence = typeof parsed.confidence === 'number'
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.5;
  }
  // origin_analysis is optional — validate structure if present
  if (parsed.origin_analysis && typeof parsed.origin_analysis === 'object') {
    const validFidelity = ['faithful', 'minor_exaggeration', 'selective_reporting', 'heavily_distorted', 'fabricated', 'origin_not_found'];
    if (parsed.origin_analysis.fidelity_rating && !validFidelity.includes(parsed.origin_analysis.fidelity_rating)) {
      parsed.origin_analysis.fidelity_rating = 'origin_not_found';
    }
  }
  return true;
}

// ==========================================
// Prompt Builders
// ==========================================

/**
 * Builds the Gemini prompt with confidence and origin analysis fields.
 * Gemini uses Google Search grounding, so it can verify claims live.
 */
function buildPrompt(articleText, originContext = '') {
  let originSection = '';
  if (originContext) {
    originSection = `
ORIGINAL SOURCE CANDIDATES FOUND VIA WEB SEARCH:
${originContext}

ORIGIN ANALYSIS INSTRUCTIONS:
Compare the article's claims against the original source candidates above. Determine if the article faithfully represents the original, or if it distorts, cherry-picks, misquotes, or fabricates claims.
`;
  }

  return `Analyze this news article for credibility red flags.
Article: "${articleText}"
${originSection}
Perform the following analysis:
1. Identify linguistic red flags (sensational language, missing citations, unnamed sources, emotional manipulation, clickbait phrasing). List each flag as a short label.
2. Search for related current coverage of the claims in this article. Summarize what other sources say in 1-2 sentences.
3. Rate your confidence in your overall assessment from 0.0 (no confidence) to 1.0 (fully confident).${originContext ? `
4. Analyze whether the article faithfully represents its original source, or if claims have been manipulated.` : ''}

Return ONLY valid JSON in this exact format, no markdown, no extra text:
{
  "headline": "extracted or inferred headline",
  "flags": ["flag1", "flag2"],
  "claim_check_summary": "plain language summary of what live search found",
  "consensus": "supported" | "disputed" | "unclear" | "no_coverage_found",
  "confidence": 0.85${originContext ? `,
  "origin_analysis": {
    "original_source": "name of the original study/report/article if found",
    "original_url": "URL of original source if available",
    "manipulation_detected": true | false,
    "manipulation_type": "none" | "cherry_picking" | "misquoting" | "out_of_context" | "statistical_distortion" | "fabricated",
    "distortion_summary": "What was changed from the original source",
    "fidelity_rating": "faithful" | "minor_exaggeration" | "selective_reporting" | "heavily_distorted" | "fabricated" | "origin_not_found"
  }` : ''}
}`;
}

/**
 * Builds the Groq prompt with evidence context, confidence, and origin analysis.
 * Groq doesn't have live search, so we provide scraped evidence.
 */
function buildGroqPrompt(articleText, evidenceText, originContext = '') {
  let originSection = '';
  if (originContext) {
    originSection = `
ORIGINAL SOURCE CANDIDATES FOUND VIA WEB SEARCH:
${originContext}

ORIGIN ANALYSIS INSTRUCTIONS:
Compare the article's claims against the original source candidates above. Determine if the article faithfully represents the original, or if it distorts, cherry-picks, misquotes, or fabricates claims.
`;
  }

  return `You are a strict fact-checking and credibility analysis assistant.
Analyze the following news article claim and the corroborating evidence gathered from web sources.

ARTICLE TEXT:
"${articleText}"

CORROBORATING WEB EVIDENCE RETRIEVED:
${evidenceText}
${originSection}
INSTRUCTIONS:
1. Identify linguistic red flags in the article text (sensational language, missing citations, unnamed sources, emotional manipulation, clickbait phrasing).
2. Assess whether the article's claims are supported, disputed, unclear, or if there is no coverage found, STRICTLY BASED on the provided web evidence.
3. Summarize what the retrieved web coverage says in 1-2 clear sentences.
4. Rate your confidence in your overall assessment from 0.0 (no confidence) to 1.0 (fully confident). Be honest — if evidence is sparse or ambiguous, lower your confidence.${originContext ? `
5. Analyze whether the article faithfully represents the original source, or if claims have been manipulated.` : ''}

Return ONLY valid JSON:
{
  "headline": "extracted or inferred headline",
  "flags": ["flag1", "flag2"],
  "claim_check_summary": "summary",
  "consensus": "supported" | "disputed" | "unclear" | "no_coverage_found",
  "confidence": 0.85${originContext ? `,
  "origin_analysis": {
    "original_source": "name of original study/report if found",
    "original_url": "URL if available",
    "manipulation_detected": true | false,
    "manipulation_type": "none" | "cherry_picking" | "misquoting" | "out_of_context" | "statistical_distortion" | "fabricated",
    "distortion_summary": "What was changed from the original",
    "fidelity_rating": "faithful" | "minor_exaggeration" | "selective_reporting" | "heavily_distorted" | "fabricated" | "origin_not_found"
  }` : ''}
}`;
}

// ==========================================
// Gemini Provider
// ==========================================
async function callGemini(articleText, originContext = '', evidenceText = '') {
  // Check test simulation flag
  if (process.env.FORCE_GEMINI_FAIL === 'true') {
    const simulatedError = new Error('Simulated 429 Too Many Requests (FORCE_GEMINI_FAIL=true)');
    simulatedError.status = 429;
    throw simulatedError;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '' || apiKey === 'your_gemini_api_key_here') {
    const authError = new Error('Gemini API key is not configured in backend/.env');
    authError.status = 401;
    throw authError;
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const prompt = buildPrompt(articleText, originContext);

  let result;
  let usedSearchGrounding = false;

  try {
    const groundedModel = genAI.getGenerativeModel({
      model: 'gemini-3.6-flash',
      tools: [{ googleSearch: {} }]
    });
    result = await groundedModel.generateContent(prompt);
    usedSearchGrounding = true;
  } catch (groundingError) {
    const msg = String(groundingError.message || '').toLowerCase();
    const isQuotaError = groundingError.status === 429 || msg.includes('quota') || msg.includes('resource_exhausted');

    // If Google Search grounding hits quota/rate limits, retry Gemini directly with scraped web evidence
    if (isQuotaError && evidenceText) {
      console.warn(`[GeminiProvider] Google Search Grounding quota exceeded (429). Retrying Gemini with scraped evidence context...`);
      const standardModel = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' });
      const promptWithEvidence = buildGroqPrompt(articleText, evidenceText, originContext);
      result = await standardModel.generateContent(promptWithEvidence);
      usedSearchGrounding = false;
    } else {
      throw groundingError;
    }
  }

  const response = await result.response;
  const rawText = response.text();
  const parsed = cleanAndParseJson(rawText);

  if (!validateSchema(parsed)) {
    throw new Error('Gemini returned malformed response not adhering to required JSON schema.');
  }

  return {
    rawOutput: parsed,
    usedSearchGrounding
  };
}

// Cache of verified active Groq model
let activeGroqModel = null;

async function resolveGroqModel(groq) {
  if (activeGroqModel) return activeGroqModel;

  const configured = process.env.GROQ_MODEL;
  try {
    const list = await groq.models.list();
    const ids = list.data.map(m => m.id);

    // If configured model exists in active list
    if (configured && ids.includes(configured)) {
      activeGroqModel = configured;
      return activeGroqModel;
    }

    // Preferred fallback chat models in order of priority
    const preferences = [
      'openai/gpt-oss-120b',
      'openai/gpt-oss-20b',
      'qwen/qwen3.8-27b',
      'groq/compound',
      'llama-3.3-70b-versatile'
    ];

    for (const pref of preferences) {
      if (ids.includes(pref)) {
        if (configured && configured !== pref) {
          console.warn(`[GroqProvider] ⚠️ Configured model "${configured}" not found. Auto-selecting active model "${pref}".`);
        }
        activeGroqModel = pref;
        return activeGroqModel;
      }
    }

    activeGroqModel = configured || 'openai/gpt-oss-120b';
    return activeGroqModel;
  } catch (err) {
    return configured || 'openai/gpt-oss-120b';
  }
}

// ==========================================
// Groq Provider (Fallback with Evidence)
// ==========================================
async function callGroq(articleText, retryCount = 0, overrideModel = null, evidence = null, originContext = '') {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey.trim() === '' || apiKey === 'your_groq_api_key_here') {
    throw new Error('Groq fallback is not configured. Please set GROQ_API_KEY in backend/.env');
  }

  const groq = new Groq({ apiKey });
  const modelName = overrideModel || (await resolveGroqModel(groq));

  // 1. Gather evidence using our scraping service (if not already provided)
  if (!evidence) {
    evidence = await gatherEvidence(articleText);
  }

  const prompt = buildGroqPrompt(articleText, evidence.evidenceText, originContext);

  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: 'You are an objective AI credibility evaluator. You always output valid JSON in the specified schema.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      model: modelName,
      temperature: 0.1,
      response_format: { type: 'json_object' }
    });

    const content = chatCompletion.choices[0]?.message?.content;
    let parsed = cleanAndParseJson(content);

    if (!validateSchema(parsed)) {
      if (retryCount < 1) {
        console.warn('[GroqProvider] Malformed JSON received from Groq. Retrying once...');
        return await callGroq(articleText, retryCount + 1, modelName);
      }
      throw new Error('Groq response failed schema validation after retry.');
    }

    return {
      rawOutput: parsed,
      usedSearchGrounding: false
    };
  } catch (groqErr) {
    // If model not found (404), invalidate model cache, pick another model and retry
    const isModelNotFound =
      groqErr.status === 404 ||
      groqErr.code === 'model_not_found' ||
      String(groqErr.message).includes('does not exist') ||
      String(groqErr.message).includes('model_not_found');

    if (isModelNotFound && retryCount < 1) {
      console.warn(`[GroqProvider] ⚠️ Model "${modelName}" not accessible (${groqErr.message}). Auto-resolving active model...`);
      activeGroqModel = null;
      const newModel = await resolveGroqModel(groq);
      if (newModel && newModel !== modelName) {
        console.log(`[GroqProvider] Retrying with active model "${newModel}"...`);
        return await callGroq(articleText, retryCount + 1, newModel);
      }
    }

    console.error(`[GroqProvider] Groq completion failed: ${groqErr.message}`);
    throw groqErr;
  }
}

// ==========================================
// Startup Model Verification
// ==========================================
export async function verifyGroqModel() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey.trim() === '' || apiKey === 'your_groq_api_key_here') {
    console.log('[GroqProvider] Note: GROQ_API_KEY is not set in backend/.env. Fallback to Groq will be unavailable.');
    return;
  }

  try {
    const groq = new Groq({ apiKey });
    const resolved = await resolveGroqModel(groq);
    console.log(`[GroqProvider] ✅ Groq model verified: "${resolved}" is active and ready for fallback.`);
  } catch (err) {
    console.warn(`[GroqProvider] ⚠️ Could not verify Groq model catalog at startup: ${err.message}`);
  }
}


// ==========================================
// Main Unified LLM Service Wrapper
// ==========================================
/**
 * Analyzes an article text using a 4-signal credibility scoring system:
 *   Signal 1: Deterministic Text Analysis (no AI)
 *   Signal 2: Evidence Quality Metrics (web scraping)
 *   Signal 3: Source Origin Tracing (web search + LLM comparison)
 *   Signal 4: LLM Analysis with Confidence (Gemini primary, Groq fallback)
 * 
 * @param {string} articleText 
 * @returns {Promise<Object>} Unified structured credibility result with score breakdown
 */
export async function analyze(articleText) {
  if (!articleText || typeof articleText !== 'string' || articleText.trim().length === 0) {
    return { error: 'Please provide valid article text to analyze.' };
  }

  const cleanText = articleText.trim();
  const cacheKey = getCacheKey(cleanText);

  // 1. Check in-memory cache
  const cached = getFromCache(cacheKey);
  if (cached) {
    console.log(`[LLM] Cache HIT for article hash ${cacheKey.slice(0, 10)}... (Served from cache, provider: ${cached.provider})`);
    return cached;
  }

  const startTime = Date.now();

  // ── URL Detection & Article Extraction ──
  let textToAnalyze = cleanText;
  let articleMeta = null;

  if (isUrl(cleanText)) {
    console.log(`[LLM] 🔗 Detected URL input: ${cleanText}. Scraping article content...`);
    const scraped = await scrapeArticleFromUrl(cleanText);
    textToAnalyze = scraped.articleText;
    articleMeta = {
      isAuthoritative: scraped.isAuthoritative,
      sourceUrl: scraped.sourceUrl,
      sourceDomain: scraped.sourceDomain,
      title: scraped.title,
      siteName: scraped.siteName,
      description: scraped.description
    };
    console.log(`[LLM] 🔗 Article extracted: "${scraped.title}" (${scraped.sourceDomain}, ${textToAnalyze.length} chars)`);
  }

  // ── Signal 1: Deterministic Text Analysis (runs immediately, no network) ──
  console.log('[LLM] 📝 Running deterministic text analysis...');
  const textAnalysis = analyzeText(textToAnalyze);
  console.log(`[LLM] 📝 Text analysis complete: risk=${textAnalysis.riskScore}`);

  // ── Signal 2 & 3: Evidence Gathering + Origin Tracing (parallel, async) ──
  console.log('[LLM] 🌐 Gathering web evidence + tracing origin (parallel)...');
  const [evidence, originData] = await Promise.all([
    gatherEvidence(textToAnalyze, articleMeta),
    traceOrigin(textToAnalyze, articleMeta).catch(err => {
      console.warn(`[LLM] ⚠️ Origin tracing failed: ${err.message}. Using fallback.`);
      return {
        originFound: false,
        originType: 'none_found',
        originTitle: null,
        originUrl: null,
        originDomain: null,
        originSnippet: null,
        isReputableOrigin: false,
        evidenceText: '',
        detail: 'Origin tracing failed'
      };
    })
  ]);

  console.log(`[LLM] 🌐 Evidence: ${evidence.sourcesCount} sources (risk=${evidence.metrics.riskScore})`);
  console.log(`[LLM] 📌 Origin: ${originData.originFound ? originData.originTitle : 'not found'} (type=${originData.originType})`);

  // Build origin context for LLM prompt
  let originContext = originData.evidenceText || '';
  if (articleMeta?.isAuthoritative) {
    originContext = `PRIMARY SOURCE CONTEXT: The article was published directly by ${articleMeta.siteName || articleMeta.sourceDomain} (${articleMeta.sourceDomain}), an authoritative institutional/academic/governmental domain.\n` + originContext;
  }

  // ── Signal 4: LLM Analysis (Gemini primary, Groq fallback) ──
  let provider = null;
  let rawOutput = null;
  let usedSearchGrounding = false;
  let fallbackReason = null;

  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== '' && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here');
  const hasGroqKey = Boolean(process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim() !== '' && process.env.GROQ_API_KEY !== 'your_groq_api_key_here');

  if (!hasGeminiKey && !hasGroqKey) {
    return { error: 'No AI provider API key configured. Please add GEMINI_API_KEY or GROQ_API_KEY in backend/.env' };
  }

  // Determine whether to try Gemini or skip due to missing key or open circuit breaker
  const circuitOpen = circuitBreaker.isOpen();
  let shouldTryGemini = hasGeminiKey && !circuitOpen;

  if (!hasGeminiKey && hasGroqKey) {
    console.warn('[LLM] ⚠️ Gemini API key not configured. Directly using secondary provider: Groq.');
    fallbackReason = 'Gemini API key not configured in .env';
  } else if (circuitOpen) {
    const remainingSec = circuitBreaker.getRemainingCooldownSeconds();
    console.warn(`[LLM] Circuit breaker OPEN (${remainingSec}s remaining). Skipping Gemini, going straight to Groq.`);
    fallbackReason = `Circuit breaker open (${remainingSec}s cooldown remaining)`;
  }

  // Try Gemini with retry & exponential backoff if circuit is closed
  if (shouldTryGemini) {
    const MAX_RETRIES = 2; // up to 3 total attempts
    let attempt = 0;
    let geminiSuccess = false;

    while (attempt <= MAX_RETRIES && !geminiSuccess) {
      attempt += 1;
      try {
        const geminiResult = await callGemini(textToAnalyze, originContext, evidence.evidenceText);
        rawOutput = geminiResult.rawOutput;
        usedSearchGrounding = geminiResult.usedSearchGrounding;
        provider = 'gemini';
        geminiSuccess = true;
        circuitBreaker.recordSuccess();
      } catch (geminiError) {
        // Fatal non-transient error (400, 401, 403)
        if (isFatalNonTransientError(geminiError)) {
          if (hasGroqKey) {
            console.warn(`[LLM] Gemini auth/config failed (${geminiError.status || 401}): ${geminiError.message}. Seamlessly falling back to Groq...`);
            circuitBreaker.recordFailure(geminiError.message);
            fallbackReason = `Gemini auth error (${geminiError.status || 401}): ${geminiError.message}`;
            break;
          }
          console.error(`[LLM] Fatal Gemini error (${geminiError.status || 400}): ${geminiError.message}. Halting without fallback.`);
          return { error: `Gemini Configuration/Request Error: ${geminiError.message}` };
        }

        const isTransient = isTransientError(geminiError);
        const status = geminiError.status || geminiError.statusCode || 'NETWORK/TIMEOUT';
        console.warn(`[LLM] Gemini attempt ${attempt}/${MAX_RETRIES + 1} failed [Status: ${status}]: ${geminiError.message}`);

        if (attempt <= MAX_RETRIES && isTransient) {
          const jitter = Math.floor(Math.random() * 300) + 100;
          const retryAfter = getRetryAfterMs(geminiError);
          const delayMs = retryAfter || (Math.pow(2, attempt - 1) * 1000 + jitter);

          console.log(`[LLM] Retrying Gemini in ${delayMs}ms...`);
          await sleep(delayMs);
        } else {
          circuitBreaker.recordFailure(geminiError.message);
          fallbackReason = `HTTP ${status}: ${geminiError.message}`;
          break;
        }
      }
    }
  }

  // Fallback to Groq if Gemini failed or circuit was open
  if (!rawOutput) {
    console.log(`[LLM] 🔄 Initiating fallback to Groq. Reason: ${fallbackReason}`);
    try {
      const groqResult = await callGroq(textToAnalyze, 0, null, evidence, originContext);
      rawOutput = groqResult.rawOutput;
      usedSearchGrounding = groqResult.usedSearchGrounding;
      provider = 'groq';
    } catch (groqError) {
      console.error(`[LLM] ❌ Both Gemini and Groq fallback failed. Groq error: ${groqError.message}`);
      return {
        error: `Credibility analysis is temporarily unavailable. Gemini failed (${fallbackReason}) and Groq fallback failed (${groqError.message}). Please try again shortly.`
      };
    }
  }

  // ── Multi-Signal Scoring ──
  const latencyMs = Date.now() - startTime;

  const flags = Array.isArray(rawOutput.flags) ? rawOutput.flags : [];
  const consensus = ['supported', 'disputed', 'unclear', 'no_coverage_found'].includes(rawOutput.consensus)
    ? rawOutput.consensus
    : 'unclear';
  const headline = articleMeta?.title || rawOutput.headline || 'Inferred Article Analysis';
  const claim_check_summary = rawOutput.claim_check_summary || 'No detailed claim check summary available.';
  const confidence = typeof rawOutput.confidence === 'number'
    ? Math.max(0, Math.min(1, rawOutput.confidence))
    : 0.5;

  // Extract origin analysis from LLM output (if available)
  const isAuthoritativeOrigin = Boolean(articleMeta?.isAuthoritative || originData.isReputableOrigin);
  const originAnalysis = rawOutput.origin_analysis && typeof rawOutput.origin_analysis === 'object'
    ? {
        ...rawOutput.origin_analysis,
        is_authoritative_origin: isAuthoritativeOrigin
      }
    : {
        fidelity_rating: isAuthoritativeOrigin ? 'faithful' : 'origin_not_found',
        manipulation_detected: false,
        is_authoritative_origin: isAuthoritativeOrigin
      };

  // Calculate multi-signal scores
  const scores = calculateScores({
    textAnalysis,
    evidenceMetrics: evidence.metrics,
    originAnalysis,
    llmOutput: { flags, consensus, confidence }
  });

  const finalResult = {
    headline,
    source_url: articleMeta?.sourceUrl || null,
    source_domain: articleMeta?.sourceDomain || null,
    is_authoritative: articleMeta?.isAuthoritative || false,
    site_name: articleMeta?.siteName || null,
    flags,
    claim_check_summary,
    consensus,
    ...scores,
    provider,
    usedSearchGrounding,
    latencyMs,
    fallbackReason: provider === 'groq' ? fallbackReason : null,
    articleText: cleanText,
    // Origin tracing data for frontend display
    origin_trace: {
      originFound: originData.originFound,
      originType: originData.originType,
      originTitle: originAnalysis.original_source || originData.originTitle,
      originUrl: originAnalysis.original_url || originData.originUrl,
      originDomain: originData.originDomain,
      isReputableOrigin: originData.isReputableOrigin || isAuthoritativeOrigin,
      manipulationDetected: originAnalysis.manipulation_detected || false,
      manipulationType: originAnalysis.manipulation_type || 'none',
      distortionSummary: originAnalysis.distortion_summary || null,
      fidelityRating: originAnalysis.fidelity_rating || (isAuthoritativeOrigin ? 'faithful' : 'origin_not_found')
    }
  };

  // Safe Logging
  console.log(
    `[LLM] ✅ [${provider.toUpperCase()}] ${latencyMs}ms | Score: ${scores.credibility_score}/100 | ` +
    `Text: ${textAnalysis.riskScore} | Evidence: ${evidence.metrics.riskScore} | ` +
    `Origin: ${scores.score_breakdown.origin_risk_score} | LLM: ${scores.score_breakdown.llm_risk_score} (conf: ${confidence}) | ` +
    `Flags: ${flags.length}${provider === 'groq' ? ` | Fallback: ${fallbackReason}` : ''}`
  );

  // Save into in-memory cache
  setInCache(cacheKey, finalResult);

  return finalResult;
}

export default {
  analyze,
  verifyGroqModel,
  circuitBreaker
};

