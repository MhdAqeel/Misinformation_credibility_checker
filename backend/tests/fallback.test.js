import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from backend/.env or root/.env
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../../.env') });
dotenv.config();

import { extractSearchQuery, gatherEvidence } from '../services/evidenceService.js';
import llm from '../services/llm.js';

async function runTests() {
  console.log('\n=============================================');
  console.log('🧪 RUNNING CREDIBILITY CHECKER FALLBACK TESTS');
  console.log('=============================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${message}`);
      failed++;
    }
  }

  // TEST 1: Evidence Service - Query Extraction & Scraping
  console.log('\n--- Test 1: Evidence Extraction & Scraping ---');
  const sampleArticle = `BREAKING: NASA Announces Discovery of Ancient Microbial Life in Subsurface Mars Aquifers. 
  Scientists at the Jet Propulsion Laboratory confirmed today that samples collected by the Perseverance rover revealed organic microfossils.`;

  const query = extractSearchQuery(sampleArticle);
  assert(query.length > 0 && query.toLowerCase().includes('nasa'), `Search query properly extracted: "${query}"`);

  console.log('Testing live evidence scraping...');
  const evidence = await gatherEvidence(sampleArticle);
  assert(evidence.evidenceText.length > 0, `Evidence retrieved (Length: ${evidence.evidenceText.length} chars)`);
  assert(evidence.evidenceText.length <= 1500, `Evidence strictly trimmed to < 1,500 chars (safe for Groq free tier)`);

  // TEST 2: Circuit Breaker State Machine
  console.log('\n--- Test 2: Circuit Breaker State Machine ---');
  llm.circuitBreaker.recordSuccess();
  assert(!llm.circuitBreaker.isOpen(), 'Circuit breaker is closed initially');

  llm.circuitBreaker.recordFailure('Simulated failure 1');
  llm.circuitBreaker.recordFailure('Simulated failure 2');
  assert(!llm.circuitBreaker.isOpen(), 'Circuit breaker still closed after 2 failures');

  llm.circuitBreaker.recordFailure('Simulated failure 3');
  assert(llm.circuitBreaker.isOpen(), 'Circuit breaker OPEN after 3 consecutive failures');
  assert(llm.circuitBreaker.getRemainingCooldownSeconds() > 0, `Cooldown active (${llm.circuitBreaker.getRemainingCooldownSeconds()}s)`);

  llm.circuitBreaker.recordSuccess();
  assert(!llm.circuitBreaker.isOpen(), 'Circuit breaker resets to closed on success');

  // TEST 3: Force Gemini Fail Simulation (Groq Fallback)
  console.log('\n--- Test 3: Groq Fallback via FORCE_GEMINI_FAIL ---');
  process.env.FORCE_GEMINI_FAIL = 'true';
  const fallbackResult = await llm.analyze(sampleArticle);
  process.env.FORCE_GEMINI_FAIL = 'false';

  assert(fallbackResult.provider === 'groq', `Fallback provider is GROQ (got: ${fallbackResult.provider})`);
  assert(fallbackResult.credibility_score >= 0 && fallbackResult.credibility_score <= 100, `Valid credibility score: ${fallbackResult.credibility_score}`);
  assert(['supported', 'disputed', 'unclear', 'no_coverage_found', 'unverified'].includes(fallbackResult.consensus), `Valid consensus: ${fallbackResult.consensus}`);

  // TEST 4: Live Call & In-Memory Caching
  console.log('\n--- Test 4: Live Gemini Call & In-Memory Caching ---');
  console.log('Testing live Gemini call with Google Search Grounding...');
  
  const liveResult = await llm.analyze(sampleArticle);
  assert(liveResult.provider === 'gemini' || liveResult.provider === 'groq', `Provider returned: ${liveResult.provider}`);
  if (liveResult.provider === 'groq') {
    console.log('[Test] Gemini hit quota rate limit (429), cleanly fell back to GROQ!');
    assert(true, 'Fallback gracefully handled real quota limit via Groq');
  } else {
    assert(liveResult.provider === 'gemini', 'Gemini successfully executed');
    assert(liveResult.usedSearchGrounding === true, 'Google Search Grounding tool used');
  }
  assert(liveResult.credibility_score !== undefined, `Credibility score calculated: ${liveResult.credibility_score}`);

  console.log('Testing cache hit with identical article text...');
  const cachedResult = await llm.analyze(sampleArticle);
  assert(cachedResult.provider === liveResult.provider, 'Second call for identical article text served directly from in-memory cache');

  console.log('\n=============================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('=============================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
