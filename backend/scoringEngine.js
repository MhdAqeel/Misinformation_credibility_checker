/**
 * scoringEngine.js — Multi-Signal Credibility Scoring Engine
 * 
 * Replaces the old single-LLM scoring with a 4-signal weighted system:
 *   Signal 1: Deterministic Text Analysis (20%)  — textAnalyzer.js
 *   Signal 2: Evidence Quality Metrics   (25%)  — evidenceService.js metrics
 *   Signal 3: Source Origin Fidelity     (10%)  — evidenceService.js traceOrigin
 *   Signal 4: LLM Analysis + Confidence  (45%)  — llm.js output
 * 
 * Even if the LLM hallucinates, 45% of the score comes from objective signals.
 */

// ==========================================
// LLM Risk Computation (legacy scoring logic, now one signal)
// ==========================================

/**
 * Computes the LLM-based risk score from flags and consensus.
 * This is the original scoring logic, now encapsulated as one of four signals.
 * 
 * @param {string[]} flags — array of red flag labels from LLM
 * @param {string} consensus — 'supported' | 'disputed' | 'unclear' | 'no_coverage_found'
 * @returns {{ risk: number, styleScore: number, claimScore: number }}
 */
export function computeLlmRisk(flags = [], consensus = 'unclear') {
  const safeFlags = Array.isArray(flags) ? flags : [];
  const styleScore = Math.min(safeFlags.length * 25, 100);

  const claimScoreMap = {
    supported: 10,
    unclear: 40,
    no_coverage_found: 65,
    disputed: 90
  };

  const claimScore = claimScoreMap[consensus] ?? 40;
  const risk = Math.round(0.4 * styleScore + 0.6 * claimScore);

  return { risk, styleScore, claimScore };
}

// ==========================================
// Origin Risk Computation
// ==========================================

/**
 * Maps origin analysis fidelity rating to a risk score.
 * @param {Object} originAnalysis — origin_analysis from LLM output
 * @returns {number} 0–100 risk score
 */
export function computeOriginRisk(originAnalysis) {
  if (!originAnalysis || typeof originAnalysis !== 'object') {
    return 50; // Neutral when no origin data
  }

  // If article comes directly from a verified institutional/academic/gov source
  if (originAnalysis.is_authoritative_origin || originAnalysis.isAuthoritativeOrigin) {
    if (!originAnalysis.manipulation_detected) {
      return 10;
    }
  }

  const fidelityMap = {
    faithful: 10,
    minor_exaggeration: 35,
    selective_reporting: 60,
    heavily_distorted: 85,
    fabricated: 95,
    origin_not_found: 50  // Neutral — don't penalize when we can't find origin
  };

  const fidelity = originAnalysis.fidelity_rating || 'origin_not_found';
  return fidelityMap[fidelity] ?? 50;
}

// ==========================================
// Main Multi-Signal Scoring Engine
// ==========================================

/**
 * Computes the final credibility score from 4 independent signal layers.
 * 
 * @param {Object} params
 * @param {Object} params.textAnalysis — result from textAnalyzer.analyzeText()
 * @param {Object} params.evidenceMetrics — result from evidenceService.computeEvidenceMetrics()
 * @param {Object} params.originAnalysis — origin_analysis from LLM (compared against traced origin)
 * @param {Object} params.llmOutput — { flags: [], consensus: string, confidence: number }
 * @returns {Object} Full score breakdown
 */
export function calculateScores({
  textAnalysis = null,
  evidenceMetrics = null,
  originAnalysis = null,
  llmOutput = {}
} = {}) {
  // Signal 1: Text Analysis Risk (deterministic, no AI)
  const textRisk = textAnalysis?.riskScore ?? 50;

  // Signal 2: Evidence Quality Risk (deterministic from scraping)
  const evidenceRisk = evidenceMetrics?.riskScore ?? 75;

  // Signal 3: Origin Fidelity Risk
  const originRisk = computeOriginRisk(originAnalysis);

  // Signal 4: LLM Risk (style + claim scoring)
  const flags = Array.isArray(llmOutput.flags) ? llmOutput.flags : [];
  const consensus = ['supported', 'disputed', 'unclear', 'no_coverage_found'].includes(llmOutput.consensus)
    ? llmOutput.consensus
    : 'unclear';
  const llmRiskResult = computeLlmRisk(flags, consensus);
  const llmRisk = llmRiskResult.risk;

  // Dynamic weighting based on LLM confidence
  const confidence = typeof llmOutput.confidence === 'number'
    ? Math.max(0, Math.min(1, llmOutput.confidence))
    : 0.5; // Default 50% confidence if not provided

  const llmEffectiveWeight = 0.45 * confidence;

  const weights = {
    text: 0.20,
    evidence: 0.25,
    origin: 0.10,
    llm: llmEffectiveWeight
  };

  const totalWeight = weights.text + weights.evidence + weights.origin + weights.llm;

  // Normalized weighted risk score
  const riskScore = Math.round(
    (weights.text * textRisk +
     weights.evidence * evidenceRisk +
     weights.origin * originRisk +
     weights.llm * llmRisk) / totalWeight
  );

  const credibilityScore = 100 - Math.min(100, Math.max(0, riskScore));

  // Consensus label from risk score
  let consensusLabel = 'multiple_red_flags';
  if (riskScore <= 33) {
    consensusLabel = 'low_red_flags';
  } else if (riskScore <= 66) {
    consensusLabel = 'some_red_flags';
  }

  return {
    // Final scores
    credibility_score: credibilityScore,
    risk_score: riskScore,
    consensus_label: consensusLabel,

    // Signal breakdown (for transparency)
    score_breakdown: {
      text_risk_score: textRisk,
      text_weight: weights.text,
      text_detail: textAnalysis?.summary || null,
      text_heuristics: textAnalysis?.heuristics || null,

      evidence_risk_score: evidenceRisk,
      evidence_weight: weights.evidence,
      evidence_detail: evidenceMetrics?.detail || null,
      evidence_sources_found: evidenceMetrics?.sourcesFound ?? 0,
      evidence_reputable_sources: evidenceMetrics?.reputableSources ?? 0,
      evidence_domains: evidenceMetrics?.domains || [],
      evidence_snippets: evidenceMetrics?.snippets || [],
      evidence_relevance: evidenceMetrics?.snippetRelevance ?? 0,

      origin_risk_score: originRisk,
      origin_weight: weights.origin,
      origin_fidelity: originAnalysis?.fidelity_rating || 'origin_not_found',
      origin_manipulation_detected: originAnalysis?.manipulation_detected || false,
      origin_manipulation_type: originAnalysis?.manipulation_type || 'none',
      origin_distortion_summary: originAnalysis?.distortion_summary || null,
      origin_source: originAnalysis?.original_source || null,
      origin_url: originAnalysis?.original_url || null,

      llm_risk_score: llmRisk,
      llm_base_weight: 0.45,
      llm_effective_weight: llmEffectiveWeight,
      llm_confidence: confidence,
      llm_style_score: llmRiskResult.styleScore,
      llm_claim_score: llmRiskResult.claimScore,
      llm_flags_count: flags.length
    },

    // Legacy compatibility fields
    style_score: llmRiskResult.styleScore,
    claim_score: llmRiskResult.claimScore
  };
}

export default {
  calculateScores,
  computeLlmRisk,
  computeOriginRisk
};
