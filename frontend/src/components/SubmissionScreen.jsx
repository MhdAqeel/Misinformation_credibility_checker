import React, { useState } from 'react';

/**
 * Component for submitting article text for credibility check.
 */
export default function SubmissionScreen({ onSubmit, error }) {
  const [text, setText] = useState('');
  const [validationError, setValidationError] = useState('');

  const isUrl = /^https?:\/\//i.test(text.trim());

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!text || text.trim().length === 0) {
      setValidationError('Please paste an article text or direct article URL before submitting.');
      return;
    }
    if (!isUrl && text.trim().length < 20) {
      setValidationError('Article text is too short. Please paste a complete article or claim.');
      return;
    }
    setValidationError('');
    onSubmit(text.trim());
  };

  return (
    <div className="card" style={{ padding: '28px' }}>
      <style>{`
        .ux-textarea:focus {
          outline: none;
          border-color: var(--orange-accent);
          box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.15);
        }
        .ux-submit-btn { transition: all 0.2s ease; letter-spacing: 0.02em; }
        .ux-submit-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(0,0,0,0.18); }
        .ux-submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: '8px' }}>
        <h2 className="card-title" style={{ margin: 0 }}>Analyze Article Credibility</h2>
        <p className="card-subtitle" style={{ margin: '4px 0 0' }}>
          Paste a news article text or a direct article URL to compute a multi-signal credibility score with live web grounding.
        </p>
      </div>

      {/* Feature chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', margin: '16px 0 20px' }}>
        {['🔗 URL Auto-Scraping', '🌐 Google News grounding', '🔍 Linguistic red flags', '🏛️ Origin verification'].map((chip) => (
          <span key={chip} style={{
            fontSize: '0.78rem', fontWeight: 600, padding: '5px 12px', borderRadius: '999px',
            background: 'rgba(128,128,128,0.08)', border: '1px solid rgba(128,128,128,0.15)',
            color: 'var(--text-muted)'
          }}>
            {chip}
          </span>
        ))}
      </div>

      {(validationError || error) && (
        <div className="error-box" style={{ display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '10px', marginBottom: '16px' }}>
          <span>⚠️</span>
          <span>{validationError || error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <textarea
          className="textarea-field ux-textarea"
          placeholder="Paste news article content or direct article URL here (e.g. https://hms.harvard.edu/...)..."
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (validationError) setValidationError('');
          }}
          rows={7}
          style={{ width: '100%', resize: 'vertical', minHeight: '160px', marginBottom: '6px' }}
        />

        {isUrl && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            fontSize: '0.8rem', color: '#16a34a', background: 'rgba(34,197,94,0.08)',
            border: '1px solid rgba(34,197,94,0.25)', padding: '6px 12px', borderRadius: '8px',
            margin: '4px 0 10px'
          }}>
            <span>🔗</span>
            <span><strong>Direct URL Detected:</strong> Full article text, title, and institutional domain will be fetched and analyzed automatically.</span>
          </div>
        )}

        <div style={{ textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '14px' }}>
          {text.length.toLocaleString()} characters
          {!isUrl && text.trim().length > 0 && text.trim().length < 20 && ' · too short'}
        </div>

        <button
          type="submit"
          className="btn-primary ux-submit-btn"
          disabled={!text.trim()}
          style={{
            width: '100%', padding: '14px', fontSize: '1rem', fontWeight: 700,
            borderRadius: '12px', border: 'none', cursor: 'pointer', color: '#ffffff',
            background: 'linear-gradient(135deg, var(--navy-primary), var(--orange-accent))'
          }}
        >
          {isUrl ? 'Fetch & Check Credibility →' : 'Check Credibility Signal →'}
        </button>
      </form>
    </div>
  );
}
