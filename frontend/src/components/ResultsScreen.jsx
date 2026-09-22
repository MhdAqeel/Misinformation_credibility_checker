import React, { useState } from 'react';

/**
 * ResultsScreen displays:
 * - Provider badge + consensus verdict
 * - Score ring with credibility score
 * - Score Breakdown panel (4 signal layers with progress bars)
 * - Source Origin Trace card
 * - Claim check summary
 * - Flagged patterns
 * - Disclaimer
 */
export default function ResultsScreen({ result, onReset }) {
  if (!result) return null;

  const [showTextDetails, setShowTextDetails] = useState(false);
  const [showEvidenceDetails, setShowEvidenceDetails] = useState(false);
  const [showOriginDetails, setShowOriginDetails] = useState(false);
  const [showAiDetails, setShowAiDetails] = useState(false);

  const {
    headline,
    credibility_score = 50,
    consensus_label = 'some_red_flags',
    flags = [],
    claim_check_summary = 'No summary available.',
    provider = 'gemini',
    usedSearchGrounding = true,
    fallbackReason,
    score_breakdown = null,
    origin_trace = null
  } = result;

  // Color logic based on score
  let scoreClass = 'score-yellow';
  let badgeClass = 'badge-yellow';
  let scoreColorLabel = 'Moderate Signal';

  if (credibility_score >= 67) {
    scoreClass = 'score-green';
    badgeClass = 'badge-green';
    scoreColorLabel = 'High Credibility';
  } else if (credibility_score <= 33) {
    scoreClass = 'score-red';
    badgeClass = 'badge-red';
    scoreColorLabel = 'High Red Flags';
  }

  const consensusDisplayMap = {
    low_red_flags: 'Low Red Flags',
    some_red_flags: 'Some Red Flags',
    multiple_red_flags: 'Multiple Red Flags'
  };

  const formattedConsensus = consensusDisplayMap[consensus_label] || consensus_label.replace(/_/g, ' ');
  const consensusIcon = consensus_label === 'low_red_flags' ? '✅' : consensus_label === 'multiple_red_flags' ? '🚩' : '⚠️';
  const scoreHex = credibility_score >= 67 ? '#22c55e' : credibility_score <= 33 ? '#ef4444' : '#f59e0b';
  const filledSegments = Math.round(credibility_score / 10);
  const isGroq = provider === 'groq';

  // Helper: risk score to color
  const riskColor = (risk) => {
    if (risk <= 30) return '#22c55e';
    if (risk <= 60) return '#f59e0b';
    return '#ef4444';
  };

  // Helper: risk score to label
  const riskLabel = (risk) => {
    if (risk <= 20) return 'Low Risk';
    if (risk <= 40) return 'Mild Risk';
    if (risk <= 60) return 'Moderate Risk';
    if (risk <= 80) return 'High Risk';
    return 'Very High Risk';
  };

  // Fidelity badge config
  const fidelityConfig = {
    faithful: { color: '#22c55e', bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.3)', icon: '✅', label: 'Faithful Representation' },
    minor_exaggeration: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', icon: '⚠️', label: 'Minor Exaggeration' },
    selective_reporting: { color: '#f97316', bg: 'rgba(249,115,22,0.1)', border: 'rgba(249,115,22,0.3)', icon: '⚠️', label: 'Selective Reporting' },
    heavily_distorted: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)', icon: '🚩', label: 'Heavily Distorted' },
    fabricated: { color: '#dc2626', bg: 'rgba(220,38,38,0.1)', border: 'rgba(220,38,38,0.3)', icon: '❌', label: 'Fabricated Claims' },
    origin_not_found: { color: '#6b7280', bg: 'rgba(107,114,128,0.08)', border: 'rgba(107,114,128,0.2)', icon: '🔍', label: 'Origin Not Found' }
  };

  // Manipulation type display
  const manipulationTypeMap = {
    none: null,
    cherry_picking: 'Cherry-Picking',
    misquoting: 'Misquoting',
    out_of_context: 'Out of Context',
    statistical_distortion: 'Statistical Distortion',
    fabricated: 'Fabricated'
  };

  return (
    <div className="card" style={{ padding: '28px' }}>
      <style>{`
        .ux-reset-btn { transition: all 0.2s ease; }
        .ux-reset-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(0,0,0,0.14); }
        .provider-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 0.75rem;
          font-weight: 600;
          padding: 4px 10px;
          border-radius: 999px;
          margin-bottom: 12px;
        }
        .breakdown-bar-track {
          width: 100%;
          height: 8px;
          border-radius: 4px;
          background: rgba(128,128,128,0.12);
          overflow: hidden;
        }
        .breakdown-bar-fill {
          height: 100%;
          border-radius: 4px;
          transition: width 0.8s cubic-bezier(0.4,0,0.2,1);
        }
        .signal-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 0;
          border-bottom: 1px solid rgba(128,128,128,0.08);
        }
        .signal-row:last-child { border-bottom: none; }
        .signal-icon { font-size: 1.1rem; width: 28px; text-align: center; flex-shrink: 0; }
        .signal-info { flex: 1; min-width: 0; }
        .signal-name { font-size: 0.8rem; font-weight: 700; color: var(--navy-primary); text-transform: uppercase; letter-spacing: 0.04em; }
        .signal-detail { font-size: 0.72rem; color: var(--text-muted); margin-top: 2px; }
        .signal-score { font-size: 0.85rem; font-weight: 800; min-width: 36px; text-align: right; flex-shrink: 0; }
        .signal-weight { font-size: 0.65rem; color: var(--text-muted); text-align: right; min-width: 30px; flex-shrink: 0; }
        .origin-card {
          border-radius: 12px;
          padding: 18px;
          margin-bottom: 24px;
          border: 1px solid rgba(128,128,128,0.15);
          background: rgba(128,128,128,0.03);
        }
        .heuristic-toggle {
          font-size: 0.72rem;
          color: var(--orange-accent, #f97316);
          cursor: pointer;
          border: none;
          background: none;
          padding: 2px 0;
          font-weight: 600;
          text-decoration: underline;
          text-decoration-style: dotted;
        }
        .heuristic-toggle:hover { opacity: 0.8; }
        .heuristic-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.72rem;
          padding: 4px 0;
          color: var(--text-muted);
        }
        .heuristic-item span:first-child { text-transform: capitalize; }
        .signal-dropdown-panel {
          margin-top: 8px;
          padding: 10px 12px;
          border-radius: 8px;
          background: rgba(128, 128, 128, 0.05);
          border: 1px solid rgba(128, 128, 128, 0.12);
          text-align: left;
        }
        .mini-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 0.7rem;
          font-weight: 600;
          padding: 3px 8px;
          border-radius: 999px;
        }
      `}</style>

      {/* Header: Provider badge + consensus verdict + headline */}
      <div style={{ textAlign: 'center', marginBottom: '26px' }}>
        <div>
          {isGroq ? (
            <span className="provider-pill" style={{
              background: 'rgba(241, 90, 63, 0.12)',
              color: '#c2410c',
              border: '1px solid rgba(241, 90, 63, 0.3)'
            }} title={fallbackReason || 'Gemini rate-limited or unavailable'}>
              ⚡ Groq Fallback (Web Evidence Grounded)
            </span>
          ) : (
            <span className="provider-pill" style={{
              background: 'rgba(31, 42, 68, 0.08)',
              color: 'var(--navy-primary)',
              border: '1px solid rgba(31, 42, 68, 0.2)'
            }}>
              🛡️ Gemini Primary (Google Search Grounded)
            </span>
          )}
        </div>

        <span className={`consensus-badge ${badgeClass}`} style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          padding: '7px 16px', borderRadius: '999px', fontSize: '0.85rem', fontWeight: 700
        }}>
          {consensusIcon} {formattedConsensus}
        </span>
        <h2 className="card-title" style={{ fontSize: '1.35rem', marginTop: '12px', lineHeight: 1.35 }}>
          {headline}
        </h2>
        {(result.source_domain || result.source_url) && (
          <div style={{ marginTop: '10px' }}>
            <a
              href={result.source_url || `https://${result.source_domain}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.78rem',
                fontWeight: 600,
                color: result.is_authoritative ? '#16a34a' : 'var(--navy-primary)',
                background: result.is_authoritative ? 'rgba(34,197,94,0.08)' : 'rgba(128,128,128,0.06)',
                border: `1px solid ${result.is_authoritative ? 'rgba(34,197,94,0.3)' : 'rgba(128,128,128,0.15)'}`,
                padding: '4px 12px',
                borderRadius: '8px',
                textDecoration: 'none'
              }}
            >
              <span>{result.is_authoritative ? '🏛️ Authoritative Institution' : '🔗 Article Source'}:</span>
              <span>{result.site_name || result.source_domain}</span>
              <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>↗</span>
            </a>
          </div>
        )}
      </div>

      {/* Score ring */}
      <div className="score-section" style={{ margin: '6px 0 26px' }}>
        <div style={{
          position: 'relative', width: '152px', height: '152px', margin: '0 auto 14px',
          borderRadius: '50%', padding: '9px',
          background: `conic-gradient(${scoreHex} ${credibility_score * 3.6}deg, rgba(128,128,128,0.15) 0deg)`,
          boxShadow: `0 10px 30px ${scoreHex}2e`
        }}>
          <div className={`score-circle ${scoreClass}`} style={{
            width: '100%', height: '100%', borderRadius: '50%',
            background: 'var(--card-bg, #ffffff)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
          }}>
            <span className="score-number" style={{ fontSize: '2.6rem', fontWeight: 800, lineHeight: 1, color: scoreHex }}>
              {credibility_score}
            </span>
            <span className="score-label" style={{
              fontSize: '0.68rem', letterSpacing: '0.14em', textTransform: 'uppercase',
              color: 'var(--text-muted)', marginTop: '4px'
            }}>
              / 100
            </span>
          </div>
        </div>
        <p style={{
          fontWeight: '700', fontSize: '0.95rem', color: scoreHex,
          textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0
        }}>
          {scoreColorLabel}
        </p>

        {/* Segmented credibility meter */}
        <div style={{ display: 'flex', gap: '4px', maxWidth: '240px', margin: '14px auto 0' }}>
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} style={{
              flex: 1, height: '6px', borderRadius: '3px',
              background: i < filledSegments ? scoreHex : 'rgba(128,128,128,0.15)'
            }} />
          ))}
        </div>
        <div style={{
          display: 'flex', justifyContent: 'space-between', maxWidth: '240px',
          margin: '6px auto 0', fontSize: '0.7rem', color: 'var(--text-muted)',
          textTransform: 'uppercase', letterSpacing: '0.06em'
        }}>
          <span>Red flags</span>
          <span>Credible</span>
        </div>
      </div>

      {/* ── Score Breakdown Panel ── */}
      {score_breakdown && (
        <div style={{
          borderRadius: '12px', padding: '18px', marginBottom: '24px',
          background: 'rgba(128,128,128,0.04)', border: '1px solid rgba(128,128,128,0.12)'
        }}>
          <h4 style={{
            fontSize: '0.78rem', color: 'var(--navy-primary)', margin: '0 0 14px',
            textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: '8px'
          }}>
            📊 Score Breakdown — 4-Signal Analysis
          </h4>

          {/* Signal 1: Text Analysis */}
          <div className="signal-row">
            <span className="signal-icon">📝</span>
            <div className="signal-info">
              <div className="signal-name">Text Analysis</div>
              <div className="signal-detail">{score_breakdown.text_detail || 'Deterministic linguistic heuristics'}</div>
              <div className="breakdown-bar-track" style={{ marginTop: '6px' }}>
                <div className="breakdown-bar-fill" style={{
                  width: `${100 - score_breakdown.text_risk_score}%`,
                  background: riskColor(score_breakdown.text_risk_score)
                }} />
              </div>
              <div style={{ marginTop: '4px' }}>
                <button className="heuristic-toggle" onClick={() => setShowTextDetails(!showTextDetails)}>
                  {showTextDetails ? '▼ Hide details' : '▶ Show heuristic details'}
                </button>
                {showTextDetails && score_breakdown.text_heuristics && (
                  <div className="signal-dropdown-panel">
                    {Object.entries(score_breakdown.text_heuristics).map(([key, h]) => (
                      <div className="heuristic-item" key={key}>
                        <div>
                          <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{key.replace(/_/g, ' ')}: </span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{h.detail}</span>
                        </div>
                        <span style={{ color: riskColor(h.score), fontWeight: 700, flexShrink: 0, marginLeft: '8px' }}>
                          {riskLabel(h.score)} ({h.score})
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <span className="signal-score" style={{ color: riskColor(score_breakdown.text_risk_score) }}>
              {100 - score_breakdown.text_risk_score}
            </span>
            <span className="signal-weight">20%</span>
          </div>

          {/* Signal 2: Evidence Quality */}
          <div className="signal-row">
            <span className="signal-icon">🌐</span>
            <div className="signal-info">
              <div className="signal-name">Evidence Quality</div>
              <div className="signal-detail">
                {score_breakdown.evidence_sources_found} sources found
                {score_breakdown.evidence_reputable_sources > 0 && ` (${score_breakdown.evidence_reputable_sources} reputable)`}
                {score_breakdown.evidence_domains?.length > 0 && ` — ${score_breakdown.evidence_domains.slice(0, 3).join(', ')}`}
              </div>
              <div className="breakdown-bar-track" style={{ marginTop: '6px' }}>
                <div className="breakdown-bar-fill" style={{
                  width: `${100 - score_breakdown.evidence_risk_score}%`,
                  background: riskColor(score_breakdown.evidence_risk_score)
                }} />
              </div>
              <div style={{ marginTop: '4px' }}>
                <button className="heuristic-toggle" onClick={() => setShowEvidenceDetails(!showEvidenceDetails)}>
                  {showEvidenceDetails ? '▼ Hide details' : '▶ Show evidence details'}
                </button>
                {showEvidenceDetails && (
                  <div className="signal-dropdown-panel">
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                      <span className="mini-badge" style={{ background: 'rgba(59,130,246,0.1)', color: '#2563eb' }}>
                        📊 {score_breakdown.evidence_sources_found} Sources Discovered
                      </span>
                      <span className="mini-badge" style={{ background: 'rgba(34,197,94,0.1)', color: '#16a34a' }}>
                        ✓ {score_breakdown.evidence_reputable_sources} Reputable Outlets
                      </span>
                      {score_breakdown.evidence_relevance > 0 && (
                        <span className="mini-badge" style={{ background: 'rgba(128,128,128,0.08)', color: 'var(--text-muted)' }}>
                          🎯 {Math.round(score_breakdown.evidence_relevance * 100)}% Keyword Overlap
                        </span>
                      )}
                    </div>

                    {score_breakdown.evidence_domains?.length > 0 && (
                      <div style={{ marginBottom: '8px' }}>
                        <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--navy-primary)', textTransform: 'uppercase', marginBottom: '4px' }}>
                          Discovered Outlets & Domains:
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                          {score_breakdown.evidence_domains.map((dom, idx) => (
                            <span key={idx} style={{
                              fontSize: '0.72rem', padding: '2px 8px', borderRadius: '6px',
                              background: 'rgba(128,128,128,0.06)', border: '1px solid rgba(128,128,128,0.15)',
                              color: 'var(--navy-primary)', fontWeight: 500
                            }}>
                              {dom}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {score_breakdown.evidence_snippets?.length > 0 && (
                      <div>
                        <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--navy-primary)', textTransform: 'uppercase', marginBottom: '4px' }}>
                          Corroborating Coverage Highlights:
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                          {score_breakdown.evidence_snippets.map((snip, idx) => (
                            <div key={idx} style={{
                              fontSize: '0.72rem', padding: '6px 10px', borderRadius: '6px',
                              background: 'rgba(128,128,128,0.04)', border: '1px solid rgba(128,128,128,0.1)'
                            }}>
                              <div style={{ fontWeight: 600, color: 'var(--navy-primary)' }}>
                                {snip.source && <span style={{ color: 'var(--orange-accent, #f97316)', marginRight: '6px' }}>[{snip.source}]</span>}
                                {snip.title}
                              </div>
                              {snip.url && (
                                <a href={snip.url.startsWith('http') ? snip.url : `https://${snip.url}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.68rem', color: 'var(--orange-accent, #f97316)', textDecoration: 'none', display: 'inline-block', marginTop: '2px' }}>
                                  View source article ↗
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <span className="signal-score" style={{ color: riskColor(score_breakdown.evidence_risk_score) }}>
              {100 - score_breakdown.evidence_risk_score}
            </span>
            <span className="signal-weight">25%</span>
          </div>

          {/* Signal 3: Source Origin */}
          <div className="signal-row">
            <span className="signal-icon">📌</span>
            <div className="signal-info">
              <div className="signal-name">Source Origin Fidelity</div>
              <div className="signal-detail">
                {score_breakdown.origin_fidelity === 'origin_not_found'
                  ? 'No original source identified'
                  : `Fidelity: ${(score_breakdown.origin_fidelity || '').replace(/_/g, ' ')}`
                }
                {score_breakdown.origin_manipulation_detected && ' — manipulation detected'}
              </div>
              <div className="breakdown-bar-track" style={{ marginTop: '6px' }}>
                <div className="breakdown-bar-fill" style={{
                  width: `${100 - score_breakdown.origin_risk_score}%`,
                  background: riskColor(score_breakdown.origin_risk_score)
                }} />
              </div>
              <div style={{ marginTop: '4px' }}>
                <button className="heuristic-toggle" onClick={() => setShowOriginDetails(!showOriginDetails)}>
                  {showOriginDetails ? '▼ Hide details' : '▶ Show origin details'}
                </button>
                {showOriginDetails && (
                  <div className="signal-dropdown-panel">
                    {(() => {
                      const fConf = fidelityConfig[origin_trace?.fidelityRating || score_breakdown.origin_fidelity] || fidelityConfig.origin_not_found;
                      const manipType = manipulationTypeMap[origin_trace?.manipulationType || score_breakdown.origin_manipulation_type];
                      return (
                        <>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                            <span className="mini-badge" style={{ background: fConf.bg, color: fConf.color, border: `1px solid ${fConf.border}` }}>
                              {fConf.icon} {fConf.label}
                            </span>
                            {origin_trace?.originType && origin_trace.originType !== 'none_found' && (
                              <span className="mini-badge" style={{ background: 'rgba(128,128,128,0.08)', color: 'var(--text-muted)' }}>
                                📑 {origin_trace.originType.replace(/_/g, ' ')}
                              </span>
                            )}
                            {(origin_trace?.isReputableOrigin || result.is_authoritative) && (
                              <span className="mini-badge" style={{ background: 'rgba(34,197,94,0.1)', color: '#16a34a' }}>
                                ✓ Verified Institution
                              </span>
                            )}
                            {manipType && (
                              <span className="mini-badge" style={{ background: 'rgba(239,68,68,0.08)', color: '#b91c1c' }}>
                                ⚠️ {manipType}
                              </span>
                            )}
                          </div>

                          {(origin_trace?.originTitle || score_breakdown.origin_source) && (
                            <div style={{ marginBottom: '8px' }}>
                              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--navy-primary)', textTransform: 'uppercase', marginBottom: '2px' }}>
                                Primary Origin / Publication:
                              </div>
                              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--navy-primary)' }}>
                                {origin_trace?.originTitle || score_breakdown.origin_source}
                              </div>
                              {(origin_trace?.originUrl || score_breakdown.origin_url) && (
                                <a
                                  href={(origin_trace?.originUrl || score_breakdown.origin_url).startsWith('http') ? (origin_trace?.originUrl || score_breakdown.origin_url) : `https://${origin_trace?.originUrl || score_breakdown.origin_url}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ fontSize: '0.7rem', color: 'var(--orange-accent, #f97316)', textDecoration: 'none' }}
                                >
                                  🔗 {origin_trace?.originDomain || origin_trace?.originUrl || score_breakdown.origin_url}
                                </a>
                              )}
                            </div>
                          )}

                          {(origin_trace?.distortionSummary || score_breakdown.origin_distortion_summary) && (
                            <div style={{
                              fontSize: '0.72rem', padding: '6px 10px', borderRadius: '6px',
                              background: origin_trace?.manipulationDetected ? 'rgba(239,68,68,0.05)' : 'rgba(34,197,94,0.05)',
                              border: `1px solid ${origin_trace?.manipulationDetected ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)'}`,
                              color: 'var(--text-primary)'
                            }}>
                              <strong>Distortion Assessment: </strong>{origin_trace?.distortionSummary || score_breakdown.origin_distortion_summary}
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
            <span className="signal-score" style={{ color: riskColor(score_breakdown.origin_risk_score) }}>
              {100 - score_breakdown.origin_risk_score}
            </span>
            <span className="signal-weight">10%</span>
          </div>

          {/* Signal 4: AI Analysis */}
          <div className="signal-row">
            <span className="signal-icon">🤖</span>
            <div className="signal-info">
              <div className="signal-name">
                AI Analysis
                <span style={{
                  fontSize: '0.65rem', fontWeight: 600, marginLeft: '8px',
                  padding: '2px 6px', borderRadius: '4px',
                  background: score_breakdown.llm_confidence >= 0.7 ? 'rgba(34,197,94,0.12)' : score_breakdown.llm_confidence >= 0.4 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)',
                  color: score_breakdown.llm_confidence >= 0.7 ? '#16a34a' : score_breakdown.llm_confidence >= 0.4 ? '#d97706' : '#dc2626'
                }}>
                  {Math.round(score_breakdown.llm_confidence * 100)}% confident
                </span>
              </div>
              <div className="signal-detail">
                {score_breakdown.llm_flags_count} flags detected · Consensus: {result.consensus?.replace(/_/g, ' ')}
              </div>
              <div className="breakdown-bar-track" style={{ marginTop: '6px' }}>
                <div className="breakdown-bar-fill" style={{
                  width: `${100 - score_breakdown.llm_risk_score}%`,
                  background: riskColor(score_breakdown.llm_risk_score)
                }} />
              </div>
              <div style={{ marginTop: '4px' }}>
                <button className="heuristic-toggle" onClick={() => setShowAiDetails(!showAiDetails)}>
                  {showAiDetails ? '▼ Hide details' : '▶ Show AI analysis details'}
                </button>
                {showAiDetails && (
                  <div className="signal-dropdown-panel">
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                      <span className="mini-badge" style={{
                        background: isGroq ? 'rgba(241, 90, 63, 0.12)' : 'rgba(31, 42, 68, 0.08)',
                        color: isGroq ? '#c2410c' : 'var(--navy-primary)'
                      }}>
                        {isGroq ? '⚡ Groq gpt-oss-120b' : '🛡️ Gemini 3.6 Flash'}
                      </span>
                      <span className="mini-badge" style={{
                        background: score_breakdown.llm_confidence >= 0.7 ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)',
                        color: score_breakdown.llm_confidence >= 0.7 ? '#16a34a' : '#d97706'
                      }}>
                        🎯 {Math.round(score_breakdown.llm_confidence * 100)}% Confidence
                      </span>
                      <span className="mini-badge" style={{
                        background: result.consensus === 'supported' ? 'rgba(34,197,94,0.1)' : result.consensus === 'disputed' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                        color: result.consensus === 'supported' ? '#16a34a' : result.consensus === 'disputed' ? '#dc2626' : '#d97706'
                      }}>
                        Consensus: {(result.consensus || 'unclear').replace(/_/g, ' ')}
                      </span>
                    </div>

                    {/* Sub-scores */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                      <div style={{ padding: '6px 10px', borderRadius: '6px', background: 'rgba(128,128,128,0.05)', border: '1px solid rgba(128,128,128,0.1)' }}>
                        <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Style Risk</div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: riskColor(score_breakdown.llm_style_score) }}>
                          {score_breakdown.llm_style_score} / 100
                        </div>
                      </div>
                      <div style={{ padding: '6px 10px', borderRadius: '6px', background: 'rgba(128,128,128,0.05)', border: '1px solid rgba(128,128,128,0.1)' }}>
                        <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Claim Consensus Risk</div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: riskColor(score_breakdown.llm_claim_score) }}>
                          {score_breakdown.llm_claim_score} / 100
                        </div>
                      </div>
                    </div>

                    {flags.length > 0 && (
                      <div style={{ marginBottom: '6px' }}>
                        <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--navy-primary)', textTransform: 'uppercase', marginBottom: '4px' }}>
                          Detected Red Flags:
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {flags.map((flag, idx) => (
                            <span key={idx} style={{
                              fontSize: '0.7rem', padding: '2px 8px', borderRadius: '999px',
                              background: 'rgba(239, 68, 68, 0.08)', color: '#b91c1c', border: '1px solid rgba(239,68,68,0.2)'
                            }}>
                              ⚠️ {flag.replace(/_/g, ' ')}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {claim_check_summary && (
                      <div style={{
                        fontSize: '0.72rem', padding: '6px 10px', borderRadius: '6px',
                        background: 'rgba(128,128,128,0.04)', border: '1px solid rgba(128,128,128,0.1)',
                        color: 'var(--text-primary)', marginTop: '4px'
                      }}>
                        <strong>AI Summary: </strong>{claim_check_summary}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <span className="signal-score" style={{ color: riskColor(score_breakdown.llm_risk_score) }}>
              {100 - score_breakdown.llm_risk_score}
            </span>
            <span className="signal-weight">
              {Math.round(score_breakdown.llm_effective_weight * 100)}%
            </span>
          </div>
        </div>
      )}

      {/* ── Source Origin Trace Card ── */}
      {origin_trace && origin_trace.fidelityRating !== 'origin_not_found' && (
        (() => {
          const fConf = fidelityConfig[origin_trace.fidelityRating] || fidelityConfig.origin_not_found;
          const manipType = manipulationTypeMap[origin_trace.manipulationType];
          return (
            <div className="origin-card" style={{ borderLeft: `4px solid ${fConf.color}` }}>
              <h4 style={{
                fontSize: '0.78rem', color: 'var(--navy-primary)', margin: '0 0 12px',
                textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: '8px'
              }}>
                📌 Source Origin Trace
              </h4>

              {/* Original source info */}
              {origin_trace.originTitle && (
                <div style={{ marginBottom: '10px' }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '3px' }}>
                    Original Source:
                  </div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--navy-primary)' }}>
                    {origin_trace.originTitle}
                  </div>
                  {origin_trace.originUrl && (
                    <a href={origin_trace.originUrl.startsWith('http') ? origin_trace.originUrl : `https://${origin_trace.originUrl}`}
                       target="_blank" rel="noopener noreferrer"
                       style={{ fontSize: '0.75rem', color: 'var(--orange-accent, #f97316)', wordBreak: 'break-all' }}>
                      🔗 {origin_trace.originDomain || origin_trace.originUrl}
                    </a>
                  )}
                </div>
              )}

              {/* Fidelity badge */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: '5px',
                  fontSize: '0.78rem', fontWeight: 700, padding: '5px 12px',
                  borderRadius: '999px', background: fConf.bg,
                  color: fConf.color, border: `1px solid ${fConf.border}`
                }}>
                  {fConf.icon} {fConf.label}
                </span>
                {manipType && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                    fontSize: '0.75rem', fontWeight: 600, padding: '4px 10px',
                    borderRadius: '999px', background: 'rgba(239,68,68,0.08)',
                    color: '#b91c1c', border: '1px solid rgba(239,68,68,0.2)'
                  }}>
                    Type: {manipType}
                  </span>
                )}
                {origin_trace.isReputableOrigin && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                    fontSize: '0.72rem', fontWeight: 600, padding: '4px 8px',
                    borderRadius: '999px', background: 'rgba(34,197,94,0.08)',
                    color: '#16a34a', border: '1px solid rgba(34,197,94,0.2)'
                  }}>
                    ✓ Reputable Source
                  </span>
                )}
              </div>

              {/* Distortion summary */}
              {origin_trace.distortionSummary && (
                <div style={{
                  fontSize: '0.88rem', lineHeight: 1.6, color: 'var(--text-primary)',
                  padding: '10px 14px', borderRadius: '8px',
                  background: origin_trace.manipulationDetected ? 'rgba(239,68,68,0.05)' : 'rgba(34,197,94,0.05)',
                  border: `1px solid ${origin_trace.manipulationDetected ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)'}`
                }}>
                  {origin_trace.distortionSummary}
                </div>
              )}
            </div>
          );
        })()
      )}

      {/* Highlighted Claim Check Summary */}
      <div className="summary-box" style={{
        borderRadius: '12px', padding: '18px', marginBottom: '24px',
        borderLeft: `4px solid ${scoreHex}`
      }}>
        <div className="summary-title" style={{
          display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem',
          textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700,
          marginBottom: '8px', color: 'var(--navy-primary)'
        }}>
          {isGroq ? '⚡ Corroborating Web Evidence Summary (Groq Fallback)' : '🌐 Live Google Search Grounding Summary'}
        </div>
        <div className="summary-text" style={{ fontSize: '0.92rem', lineHeight: 1.65 }}>
          {claim_check_summary}
        </div>
      </div>


      {/* Flagged Patterns */}
      <div style={{
        marginBottom: '24px', background: 'rgba(128,128,128,0.05)', borderRadius: '12px',
        padding: '18px', border: '1px solid rgba(128,128,128,0.12)'
      }}>
        <h4 style={{
          fontSize: '0.78rem', color: 'var(--navy-primary)', margin: '0 0 12px',
          textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700
        }}>
          🔎 Identified Linguistic Patterns ({flags.length})
        </h4>
        {flags.length > 0 ? (
          <div className="flags-container" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {flags.map((flag, idx) => (
              <span key={idx} className="flag-tag" style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '6px 12px', borderRadius: '999px', fontSize: '0.8rem', fontWeight: 600,
                background: 'rgba(239,68,68,0.08)', color: '#b91c1c',
                border: '1px solid rgba(239,68,68,0.25)'
              }}>
                ⚠️ {flag}
              </span>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', margin: 0 }}>
            ✅ No prominent linguistic red flags detected in article text.
          </p>
        )}
      </div>

      <button
        className="btn-secondary ux-reset-btn"
        onClick={onReset}
        style={{ width: '100%', padding: '13px', borderRadius: '12px', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer' }}
      >
        ← Analyze Another Article
      </button>

      <div className="disclaimer-banner" style={{
        marginTop: '16px', textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-muted)',
        background: 'rgba(128,128,128,0.07)', borderRadius: '10px', padding: '10px 14px'
      }}>
        ⚖️ This is a multi-signal credibility assessment, not a verdict. Always verify important claims with primary sources.
      </div>
    </div>
  );
}
