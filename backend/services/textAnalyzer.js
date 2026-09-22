/**
 * textAnalyzer.js — Deterministic Text Analysis Service (Signal Layer 1)
 * 
 * Pure JavaScript heuristics with ZERO AI dependency.
 * Same article always produces the same score — no hallucination risk.
 * 
 * Each heuristic returns a sub-score from 0–100 (0 = no risk, 100 = max risk).
 * The final riskScore is a weighted average of all sub-scores.
 */

// ==========================================
// Sensational / Clickbait Word List (~60 terms)
// ==========================================
const SENSATIONAL_WORDS = new Set([
  'shocking', 'breaking', 'exposed', 'bombshell', 'explosive',
  'unbelievable', 'incredible', 'outrageous', 'devastating', 'horrifying',
  'terrifying', 'mind-blowing', 'jaw-dropping', 'game-changer', 'unprecedented',
  'scandal', 'conspiracy', 'cover-up', 'coverup', 'secret',
  'destroyed', 'slammed', 'blasted', 'crushed', 'obliterated',
  'urgent', 'emergency', 'warning', 'alert', 'crisis',
  'miracle', 'cure', 'trick', 'hack', 'insane',
  'you won\'t believe', 'what they don\'t want you to know', 'exposed the truth',
  'mainstream media', 'they lied', 'wake up', 'sheeple',
  'hoax', 'scam', 'fraud', 'fake', 'rigged',
  'must-see', 'must-read', 'gone viral', 'viral',
  'exclusive', 'just in', 'developing',
  'disgusting', 'sickening', 'enraging', 'infuriating',
  'proves', 'exposed', 'exposed the truth', 'exposed the lies',
  'propaganda', 'deep state', 'big pharma', 'elites'
]);

// ==========================================
// Source Attribution Patterns
// ==========================================
const SOURCE_PATTERNS = [
  /according to/i,
  /\bsaid\b/i,
  /\btold\b/i,
  /\bstated\b/i,
  /\breported\b/i,
  /\bconfirmed\b/i,
  /\bannounced\b/i,
  /cited\b/i,
  /spokesperson/i,
  /officials?\s+(said|told|confirmed|stated)/i,
  /researchers?\s+(found|said|reported|concluded)/i,
  /study\s+(found|showed|revealed|concluded|published)/i,
  /published\s+in/i,
  /university\s+of/i,
  /journal\s+of/i,
  /professor/i,
  /\bdr\.\s/i,
  /expert/i,
  /analyst/i,
  /[""][^""]{5,}[""].*(?:said|told|stated|added)/i  // Quoted speech with attribution
];

// ==========================================
// Heuristic 1: Caps Ratio
// ==========================================
/**
 * Measures the proportion of ALL-CAPS words.
 * Credible articles rarely use ALL CAPS; clickbait/propaganda abuses it.
 * @param {string} text 
 * @returns {{ score: number, detail: string }}
 */
function analyzeCapsRatio(text) {
  const words = text.split(/\s+/).filter(w => w.length > 1);
  if (words.length === 0) return { score: 0, detail: 'No words to analyze' };

  const capsWords = words.filter(w => w === w.toUpperCase() && /[A-Z]/.test(w));
  const ratio = capsWords.length / words.length;

  // 0-2% = normal (score 0), 2-5% = mild (score 20-40), 5%+ = high risk
  let score = 0;
  if (ratio > 0.15) score = 100;
  else if (ratio > 0.10) score = 80;
  else if (ratio > 0.05) score = 55;
  else if (ratio > 0.02) score = 25;

  return {
    score,
    detail: `${capsWords.length}/${words.length} words in ALL CAPS (${(ratio * 100).toFixed(1)}%)`
  };
}

// ==========================================
// Heuristic 2: Punctuation Abuse
// ==========================================
/**
 * Detects excessive exclamation marks, question marks, and ellipses.
 * @param {string} text 
 * @returns {{ score: number, detail: string }}
 */
function analyzePunctuation(text) {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  if (sentences.length === 0) return { score: 0, detail: 'No sentences found' };

  const exclamations = (text.match(/!/g) || []).length;
  const questions = (text.match(/\?/g) || []).length;
  const ellipses = (text.match(/\.{3,}/g) || []).length;
  const multiPunct = (text.match(/[!?]{2,}/g) || []).length; // !! or ?? or !?

  const totalAbuse = exclamations + questions * 0.5 + ellipses * 2 + multiPunct * 3;
  const density = totalAbuse / sentences.length;

  let score = 0;
  if (density > 2.0) score = 100;
  else if (density > 1.0) score = 70;
  else if (density > 0.5) score = 40;
  else if (density > 0.2) score = 15;

  return {
    score,
    detail: `${exclamations}! ${questions}? ${ellipses}… ${multiPunct} multi-punct across ${sentences.length} sentences (density: ${density.toFixed(2)})`
  };
}

// ==========================================
// Heuristic 3: Sensational Word Density
// ==========================================
/**
 * Counts sensational/clickbait words against a curated wordlist.
 * @param {string} text 
 * @returns {{ score: number, detail: string, matchedWords: string[] }}
 */
function analyzeSensationalWords(text) {
  const lowerText = text.toLowerCase();
  const words = lowerText.split(/\s+/).filter(w => w.length > 2);
  if (words.length === 0) return { score: 0, detail: 'No words to analyze', matchedWords: [] };

  const matchedWords = [];

  // Single-word matches
  for (const word of words) {
    const cleanWord = word.replace(/[^a-z'-]/g, '');
    if (SENSATIONAL_WORDS.has(cleanWord) && !matchedWords.includes(cleanWord)) {
      matchedWords.push(cleanWord);
    }
  }

  // Multi-word phrase matches
  for (const phrase of SENSATIONAL_WORDS) {
    if (phrase.includes(' ') && lowerText.includes(phrase) && !matchedWords.includes(phrase)) {
      matchedWords.push(phrase);
    }
  }

  const density = matchedWords.length / Math.max(words.length / 100, 1); // per 100 words

  let score = 0;
  if (density > 5) score = 100;
  else if (density > 3) score = 75;
  else if (density > 1.5) score = 50;
  else if (density > 0.5) score = 25;
  else if (matchedWords.length > 0) score = 10;

  return {
    score,
    detail: `${matchedWords.length} sensational terms found (${density.toFixed(1)} per 100 words)`,
    matchedWords
  };
}

// ==========================================
// Heuristic 4: Source Attribution
// ==========================================
/**
 * Checks for evidence of source attribution (quotes, named sources, citations).
 * Absence of attribution is a risk signal.
 * @param {string} text 
 * @returns {{ score: number, detail: string, attributionsFound: number }}
 */
function analyzeSourceAttribution(text) {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 5);
  if (sentences.length === 0) return { score: 50, detail: 'No sentences found', attributionsFound: 0 };

  let attributionsFound = 0;
  for (const pattern of SOURCE_PATTERNS) {
    const matches = text.match(new RegExp(pattern.source, pattern.flags + 'g'));
    if (matches) {
      attributionsFound += matches.length;
    }
  }

  // Also count direct quotes (text between quotation marks that's substantial)
  const quotes = text.match(/[""][^""]{10,}[""]/g) || [];
  attributionsFound += quotes.length;

  // Ratio: attributions per sentence
  const ratio = attributionsFound / sentences.length;

  // More attributions = lower risk
  let score;
  if (ratio >= 0.5) score = 5;         // Well-sourced
  else if (ratio >= 0.3) score = 15;
  else if (ratio >= 0.15) score = 30;
  else if (ratio >= 0.05) score = 55;
  else if (attributionsFound > 0) score = 70;
  else score = 90;                      // No attributions at all — high risk

  return {
    score,
    detail: `${attributionsFound} attributions across ${sentences.length} sentences (ratio: ${ratio.toFixed(2)})`,
    attributionsFound
  };
}

// ==========================================
// Heuristic 5: Sentence Length Variance
// ==========================================
/**
 * Credible articles have varied sentence structure.
 * Clickbait tends to be very choppy (short, punchy sentences) or uniformly long.
 * Very low variance = suspicious.
 * @param {string} text 
 * @returns {{ score: number, detail: string }}
 */
function analyzeSentenceVariance(text) {
  const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 3);
  if (sentences.length < 3) return { score: 30, detail: 'Too few sentences for variance analysis' };

  const lengths = sentences.map(s => s.split(/\s+/).length);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;

  // Standard deviation
  const variance = lengths.reduce((sum, len) => sum + Math.pow(len - mean, 2), 0) / lengths.length;
  const stdDev = Math.sqrt(variance);

  // Coefficient of variation (normalized by mean)
  const cv = mean > 0 ? stdDev / mean : 0;

  // Also check average sentence length — very short avg = clickbait
  const avgLength = mean;

  let score = 0;

  // Very short average (< 8 words) = clickbait style
  if (avgLength < 6) score += 40;
  else if (avgLength < 8) score += 20;

  // Very low variance (cv < 0.2) = suspicious uniformity
  if (cv < 0.15) score += 35;
  else if (cv < 0.25) score += 15;

  // Cap at 100
  score = Math.min(score, 100);

  return {
    score,
    detail: `Avg sentence: ${avgLength.toFixed(1)} words, StdDev: ${stdDev.toFixed(1)}, CV: ${cv.toFixed(2)}`
  };
}

// ==========================================
// Heuristic 6: Readability (Flesch-Kincaid)
// ==========================================
/**
 * Approximates Flesch-Kincaid readability.
 * Very low reading level (< grade 6) = possibly oversimplified/clickbait.
 * Very high reading level (> grade 16) = possibly obfuscating.
 * Normal news: grades 8–14.
 * @param {string} text 
 * @returns {{ score: number, detail: string, gradeLevel: number }}
 */
function analyzeReadability(text) {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 3);
  const words = text.split(/\s+/).filter(w => w.length > 0);

  if (sentences.length === 0 || words.length === 0) {
    return { score: 30, detail: 'Insufficient text for readability', gradeLevel: 0 };
  }

  // Approximate syllable count (simple heuristic)
  function countSyllables(word) {
    const clean = word.toLowerCase().replace(/[^a-z]/g, '');
    if (clean.length <= 2) return 1;
    let count = clean.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
                     .match(/[aeiouy]{1,2}/g);
    return count ? count.length : 1;
  }

  const totalSyllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
  const wordsPerSentence = words.length / sentences.length;
  const syllablesPerWord = totalSyllables / words.length;

  // Flesch-Kincaid Grade Level formula
  const gradeLevel = 0.39 * wordsPerSentence + 11.8 * syllablesPerWord - 15.59;
  const clampedGrade = Math.max(0, Math.min(20, gradeLevel));

  // Score: deviation from the "normal news" range (8–14)
  let score = 0;
  if (clampedGrade < 5) score = 60;        // Extremely simple — likely clickbait
  else if (clampedGrade < 7) score = 30;    // Somewhat simple
  else if (clampedGrade <= 14) score = 5;   // Normal news range — good
  else if (clampedGrade <= 16) score = 20;  // Complex but acceptable
  else score = 45;                          // Overly complex — possibly obfuscating

  return {
    score,
    detail: `Flesch-Kincaid Grade Level: ${clampedGrade.toFixed(1)} (normal news: 8–14)`,
    gradeLevel: Math.round(clampedGrade * 10) / 10
  };
}

// ==========================================
// Main Analysis Function
// ==========================================
/**
 * Runs all 6 deterministic heuristics and produces a combined risk score.
 * @param {string} articleText — raw article text
 * @returns {Object} Full analysis result with individual heuristic scores and combined riskScore
 */
export function analyzeText(articleText) {
  if (!articleText || typeof articleText !== 'string' || articleText.trim().length < 10) {
    return {
      riskScore: 50,
      heuristics: {},
      summary: 'Insufficient text for deterministic analysis'
    };
  }

  const text = articleText.trim();

  // Run all heuristics
  const capsResult = analyzeCapsRatio(text);
  const punctResult = analyzePunctuation(text);
  const sensationalResult = analyzeSensationalWords(text);
  const attributionResult = analyzeSourceAttribution(text);
  const varianceResult = analyzeSentenceVariance(text);
  const readabilityResult = analyzeReadability(text);

  // Weighted average (weights reflect relative importance)
  const weights = {
    caps: 0.10,
    punctuation: 0.10,
    sensational: 0.25,
    attribution: 0.25,
    variance: 0.10,
    readability: 0.20
  };

  const riskScore = Math.round(
    weights.caps * capsResult.score +
    weights.punctuation * punctResult.score +
    weights.sensational * sensationalResult.score +
    weights.attribution * attributionResult.score +
    weights.variance * varianceResult.score +
    weights.readability * readabilityResult.score
  );

  return {
    riskScore: Math.min(100, Math.max(0, riskScore)),
    heuristics: {
      caps: { ...capsResult, weight: weights.caps },
      punctuation: { ...punctResult, weight: weights.punctuation },
      sensational: { ...sensationalResult, weight: weights.sensational },
      attribution: { ...attributionResult, weight: weights.attribution },
      variance: { ...varianceResult, weight: weights.variance },
      readability: { ...readabilityResult, weight: weights.readability }
    },
    summary: buildSummary(riskScore, capsResult, sensationalResult, attributionResult)
  };
}

/**
 * Generates a human-readable summary of the text analysis findings.
 */
function buildSummary(riskScore, caps, sensational, attribution) {
  const parts = [];

  if (riskScore <= 20) {
    parts.push('Text appears well-structured with professional writing conventions.');
  } else if (riskScore <= 50) {
    parts.push('Text shows some stylistic patterns that warrant attention.');
  } else {
    parts.push('Text exhibits multiple stylistic red flags common in low-credibility content.');
  }

  if (sensational.matchedWords && sensational.matchedWords.length > 0) {
    parts.push(`Sensational language detected: ${sensational.matchedWords.slice(0, 5).join(', ')}.`);
  }

  if (attribution.attributionsFound === 0) {
    parts.push('No source attributions found — claims are not backed by named sources.');
  } else if (attribution.attributionsFound >= 3) {
    parts.push(`${attribution.attributionsFound} source attributions found.`);
  }

  if (caps.score >= 50) {
    parts.push('Excessive use of ALL CAPS detected.');
  }

  return parts.join(' ');
}

export default {
  analyzeText
};
