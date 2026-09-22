import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { saveResult, getRecentResults } from './db.js';
import llm from './services/llm.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Robust environment variable loading (backend/.env, root/.env, and cwd)
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json({ limit: '2mb' }));

/**
 * POST /api/analyze
 * Body: { articleText: string }
 * Performs credibility analysis via unified LLM service (Gemini primary, Groq fallback)
 * and persists the result to SQLite.
 */
app.post('/api/analyze', async (req, res) => {
  try {
    const { articleText } = req.body;

    if (!articleText || typeof articleText !== 'string' || articleText.trim().length === 0) {
      return res.status(400).json({ error: 'Please provide valid article text to analyze.' });
    }

    const analysisResult = await llm.analyze(articleText.trim());

    if (analysisResult.error) {
      return res.status(500).json({ error: analysisResult.error });
    }

    const savedRecord = await saveResult(analysisResult);
    return res.status(200).json(savedRecord);
  } catch (error) {
    console.error('Server error in /api/analyze:', error);
    return res.status(500).json({ error: 'Internal server error processing article.' });
  }
});

/**
 * GET /api/history
 * Returns the 10 most recent analysis results stored in the database.
 */
app.get('/api/history', async (req, res) => {
  try {
    const history = await getRecentResults(10);
    return res.status(200).json(history);
  } catch (error) {
    console.error('Server error in /api/history:', error);
    return res.status(500).json({ error: 'Failed to fetch history results.' });
  }
});

// Serve frontend static assets if built
const clientDistCandidates = [
  path.join(__dirname, '../frontend/dist'),
  path.join(__dirname, 'public'),
  path.join(__dirname, 'dist'),
  path.join(process.cwd(), 'frontend/dist'),
  path.join(process.cwd(), 'dist')
];
const clientDistPath = clientDistCandidates.find(p => fs.existsSync(p));

if (clientDistPath) {
  console.log(`[Static] Serving frontend static assets from: ${clientDistPath}`);
  app.use(express.static(clientDistPath));

  // SPA fallback for non-API routes
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

// Start Express Server
app.listen(PORT, async () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
  // Verify Groq model catalog on startup
  await llm.verifyGroqModel();
});

export default app;


