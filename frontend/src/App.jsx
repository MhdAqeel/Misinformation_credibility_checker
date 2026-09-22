import React, { useState } from 'react';
import SubmissionScreen from './components/SubmissionScreen.jsx';
import LoadingScreen from './components/LoadingScreen.jsx';
import ResultsScreen from './components/ResultsScreen.jsx';
import HistoryList from './components/HistoryList.jsx';

/**
 * Main Application Component managing state-based view switching.
 * State views: 'submission' | 'loading' | 'results'
 */
export default function App() {
  const [view, setView] = useState('submission'); // 'submission' | 'loading' | 'results'
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [refreshHistoryCount, setRefreshHistoryCount] = useState(0);

  const handleAnalyze = async (articleText) => {
    setView('loading');
    setError(null);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ articleText })
      });

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Backend server is not reachable. Make sure the backend is running on port 8080.');
      }

      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || 'Failed to complete article analysis.');
      }

      setResult(data);
      setView('results');
      setRefreshHistoryCount((prev) => prev + 1);
    } catch (err) {
      console.error('Analysis error:', err);
      setError(err.message || 'An unexpected error occurred.');
      setView('submission');
    }
  };

  const handleReset = () => {
    setResult(null);
    setError(null);
    setView('submission');
  };

  const handleSelectHistoryItem = (item) => {
    setResult(item);
    setView('results');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div>
      <header className="app-header">
        <div className="header-inner">
          <div className="header-text">
            <h1>AI Misinformation Credibility Checker</h1>
            <p>Linguistic Red-Flag Analysis + Live Web-Grounded Claim Verification</p>
          </div>
        </div>
      </header>

      <main className="main-container">
        {view === 'submission' && (
          <SubmissionScreen
            onSubmit={handleAnalyze}
            error={error}
          />
        )}

        {view === 'loading' && <LoadingScreen />}

        {view === 'results' && (
          <ResultsScreen
            result={result}
            onReset={handleReset}
          />
        )}

        {/* HistoryList shown below the primary interaction component */}
        <HistoryList
          onSelectResult={handleSelectHistoryItem}
          refreshTrigger={refreshHistoryCount}
        />
      </main>

      <footer className="app-footer">
        <div className="footer-divider" />
        <p>
          Credibility scores are heuristic signals combining linguistic pattern detection
          with live web grounding — always verify important claims with primary sources.
        </p>
      </footer>
    </div>
  );
}
