import React from 'react';

/**
 * Loading state component with animated spinner and status message.
 */
export default function LoadingScreen() {
  return (
    <div className="card" style={{ padding: '48px 28px', textAlign: 'center' }}>
      <style>{`
        @keyframes ux-ring-pulse {
          0% { transform: scale(0.9); opacity: 0.6; }
          100% { transform: scale(1.5); opacity: 0; }
        }
        @keyframes ux-dot-bounce {
          0%, 80%, 100% { opacity: 0.25; transform: translateY(0); }
          40% { opacity: 1; transform: translateY(-5px); }
        }
        @keyframes ux-shimmer-move {
          0% { background-position: -200px 0; }
          100% { background-position: 200px 0; }
        }
        .ux-loading-dot { animation: ux-dot-bounce 1.4s infinite; display: inline-block; }
        .ux-loading-dot:nth-child(2) { animation-delay: 0.15s; }
        .ux-loading-dot:nth-child(3) { animation-delay: 0.3s; }
      `}</style>

      <div className="spinner-container" style={{ padding: '12px 0 4px' }}>
        {/* Spinner wrapped in pulsing rings */}
        <div style={{ position: 'relative', width: '110px', height: '110px', margin: '0 auto 26px' }}>
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            border: '2px solid var(--orange-accent)', opacity: 0.5,
            animation: 'ux-ring-pulse 1.8s ease-out infinite'
          }} />
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            border: '2px solid var(--navy-primary)', opacity: 0.35,
            animation: 'ux-ring-pulse 1.8s ease-out infinite 0.6s'
          }} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="spinner" />
          </div>
        </div>

        <h3 style={{ color: 'var(--navy-primary)', fontSize: '1.3rem', fontWeight: '700', margin: 0 }}>
          Analyzing article
          <span className="ux-loading-dot">.</span>
          <span className="ux-loading-dot">.</span>
          <span className="ux-loading-dot">.</span>
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '10px', maxWidth: '380px', marginLeft: 'auto', marginRight: 'auto' }}>
          Evaluating linguistic red flags & searching live web coverage via Gemini API
        </p>
      </div>

      {/* Progress steps */}
      <div style={{ maxWidth: '340px', margin: '30px auto 0', textAlign: 'left' }}>
        {[
          { icon: '🔍', label: 'Scanning article for linguistic red flags' },
          { icon: '🌐', label: 'Grounding claims against live web coverage' },
          { icon: '⚖️', label: 'Computing credibility consensus score' }
        ].map((step, i) => (
          <div key={step.label} style={{
            display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0',
            borderBottom: i < 2 ? '1px solid rgba(128,128,128,0.12)' : 'none'
          }}>
            <div style={{
              width: '34px', height: '34px', borderRadius: '10px', flexShrink: 0,
              background: 'rgba(249,115,22,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem'
            }}>
              {step.icon}
            </div>
            <span style={{ fontSize: '0.88rem', color: 'var(--navy-primary)', fontWeight: 500 }}>
              {step.label}
            </span>
          </div>
        ))}

        {/* Shimmer progress bar */}
        <div style={{ marginTop: '22px', height: '6px', borderRadius: '3px', overflow: 'hidden', background: 'rgba(128,128,128,0.12)' }}>
          <div style={{
            width: '100%', height: '100%', borderRadius: '3px',
            background: 'linear-gradient(90deg, transparent, var(--orange-accent), transparent)',
            backgroundSize: '200px 100%', animation: 'ux-shimmer-move 1.6s linear infinite'
          }} />
        </div>
      </div>
    </div>
  );
}
