import React, { useEffect, useState } from 'react';

/**
 * Component that fetches and lists past credibility check results.
 */
export default function HistoryList({ onSelectResult, refreshTrigger }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/history');
      if (!response.ok) {
        throw new Error(`Failed to load history (${response.status})`);
      }
      const data = await response.json();
      setHistory(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('History fetch error:', err);
      setError('Unable to fetch recent history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [refreshTrigger]);

  const getScoreBadgeClass = (score) => {
    if (score >= 67) return 'badge-green';
    if (score <= 33) return 'badge-red';
    return 'badge-yellow';
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' });
    } catch (e) {
      return dateStr;
    }
  };

  return (
    <div className="card" style={{ marginTop: '24px', padding: '24px' }}>
      <style>{`
        .ux-history-row { transition: background 0.15s ease; }
        .ux-history-row:hover { background: rgba(128,128,128,0.07); }
        .ux-refresh-btn { transition: transform 0.4s ease; }
        .ux-refresh-btn:hover { transform: rotate(180deg); }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 className="card-title" style={{ fontSize: '1.05rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          🕘 Recent Analysis History
        </h3>
        <button
          onClick={fetchHistory}
          className="ux-refresh-btn"
          style={{
            background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.25)',
            color: 'var(--orange-accent)', cursor: 'pointer', fontSize: '0.82rem', fontWeight: '700',
            padding: '6px 14px', borderRadius: '999px'
          }}
        >
          ↻ Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-muted)', fontSize: '0.9rem', padding: '12px 0' }}>
          <span style={{
            width: '16px', height: '16px', borderRadius: '50%',
            border: '2px solid rgba(128,128,128,0.25)', borderTopColor: 'var(--orange-accent)',
            display: 'inline-block'
          }} />
          Loading recent records...
        </div>
      ) : error ? (
        <p style={{ color: 'var(--red-warning)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
          ⚠️ {error}
        </p>
      ) : history.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '1.6rem', marginBottom: '6px' }}>🗂️</div>
          <p style={{ fontSize: '0.9rem', margin: 0 }}>No past credibility checks found.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {history.map((item) => {
            const scoreColor = item.credibility_score >= 67 ? '#16a34a' : item.credibility_score <= 33 ? '#dc2626' : '#d97706';
            return (
              <div
                key={item.id}
                className="history-item ux-history-row"
                onClick={() => onSelectResult && onSelectResult(item)}
                style={{
                  cursor: onSelectResult ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', gap: '14px',
                  padding: '12px 14px', borderRadius: '12px'
                }}
              >
                {/* Score circle */}
                <span
                  className={`history-badge ${getScoreBadgeClass(item.credibility_score)}`}
                  style={{
                    width: '46px', height: '46px', borderRadius: '50%', flexShrink: 0, padding: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, fontSize: '1rem',
                    color: scoreColor, background: `${scoreColor}1a`, border: `2px solid ${scoreColor}55`
                  }}
                >
                  {item.credibility_score}
                </span>

                <div style={{ flex: 1, minWidth: 0, paddingRight: '12px' }}>
                  <div className="history-headline" style={{
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    fontWeight: 600, fontSize: '0.92rem', color: 'var(--navy-primary)'
                  }}>
                    {item.headline || 'Untitled Article'}
                  </div>
                  <div className="history-meta" style={{ fontSize: '0.78rem', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>🕒 {formatDate(item.created_at)}</span>
                    <span style={{
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      padding: '1px 6px',
                      borderRadius: '4px',
                      background: item.provider === 'groq' ? 'rgba(241,90,63,0.12)' : 'rgba(31,42,68,0.08)',
                      color: item.provider === 'groq' ? '#c2410c' : 'var(--navy-primary)'
                    }}>
                      {item.provider === 'groq' ? '⚡ Groq' : '🛡️ Gemini'}
                    </span>
                  </div>
                </div>

                {onSelectResult && (
                  <span style={{ color: 'var(--text-muted)', fontSize: '1.1rem', flexShrink: 0 }}>›</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
