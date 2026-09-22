import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = process.env.DB_PATH || path.join(__dirname, 'credibility.db');

// Ensure database directory exists if custom path provided
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

let dbInstance = null;
let SQL = null;

// Initialize SQLite Database
async function initDb() {
  if (dbInstance) return dbInstance;
  SQL = await initSqlJs();
  if (fs.existsSync(dbPath)) {
    const filebuffer = fs.readFileSync(dbPath);
    dbInstance = new SQL.Database(filebuffer);
  } else {
    dbInstance = new SQL.Database();
  }

  dbInstance.run(`
    CREATE TABLE IF NOT EXISTS analysis_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_text TEXT NOT NULL,
      headline TEXT NOT NULL,
      credibility_score INTEGER NOT NULL,
      consensus_label TEXT NOT NULL,
      flags TEXT NOT NULL,
      claim_check_summary TEXT NOT NULL,
      provider TEXT DEFAULT 'gemini',
      used_search_grounding INTEGER DEFAULT 1,
      text_risk_score INTEGER DEFAULT 50,
      evidence_risk_score INTEGER DEFAULT 50,
      origin_risk_score INTEGER DEFAULT 50,
      llm_risk_score INTEGER DEFAULT 50,
      llm_confidence REAL DEFAULT 0.5,
      origin_source TEXT DEFAULT NULL,
      origin_url TEXT DEFAULT NULL,
      origin_fidelity TEXT DEFAULT 'origin_not_found',
      distortion_summary TEXT DEFAULT NULL,
      score_breakdown TEXT DEFAULT NULL,
      origin_trace TEXT DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migrate existing tables if columns are missing
  const migrateColumns = [
    { name: 'provider', sql: "ALTER TABLE analysis_results ADD COLUMN provider TEXT DEFAULT 'gemini'" },
    { name: 'used_search_grounding', sql: "ALTER TABLE analysis_results ADD COLUMN used_search_grounding INTEGER DEFAULT 1" },
    { name: 'text_risk_score', sql: "ALTER TABLE analysis_results ADD COLUMN text_risk_score INTEGER DEFAULT 50" },
    { name: 'evidence_risk_score', sql: "ALTER TABLE analysis_results ADD COLUMN evidence_risk_score INTEGER DEFAULT 50" },
    { name: 'origin_risk_score', sql: "ALTER TABLE analysis_results ADD COLUMN origin_risk_score INTEGER DEFAULT 50" },
    { name: 'llm_risk_score', sql: "ALTER TABLE analysis_results ADD COLUMN llm_risk_score INTEGER DEFAULT 50" },
    { name: 'llm_confidence', sql: "ALTER TABLE analysis_results ADD COLUMN llm_confidence REAL DEFAULT 0.5" },
    { name: 'origin_source', sql: "ALTER TABLE analysis_results ADD COLUMN origin_source TEXT DEFAULT NULL" },
    { name: 'origin_url', sql: "ALTER TABLE analysis_results ADD COLUMN origin_url TEXT DEFAULT NULL" },
    { name: 'origin_fidelity', sql: "ALTER TABLE analysis_results ADD COLUMN origin_fidelity TEXT DEFAULT 'origin_not_found'" },
    { name: 'distortion_summary', sql: "ALTER TABLE analysis_results ADD COLUMN distortion_summary TEXT DEFAULT NULL" },
    { name: 'score_breakdown', sql: "ALTER TABLE analysis_results ADD COLUMN score_breakdown TEXT DEFAULT NULL" },
    { name: 'origin_trace', sql: "ALTER TABLE analysis_results ADD COLUMN origin_trace TEXT DEFAULT NULL" }
  ];

  for (const col of migrateColumns) {
    try {
      dbInstance.run(col.sql);
    } catch (e) {
      // Column already exists — expected for existing databases
    }
  }

  saveDbToFile();
  return dbInstance;
}

function saveDbToFile() {
  if (!dbInstance) return;
  try {
    const data = dbInstance.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  } catch (err) {
    console.error('Error saving SQLite database file:', err);
  }
}

// Synchronous wrapper ensuring db is initialized
let initPromise = initDb();

/**
 * Saves a new credibility analysis result into SQLite.
 * Now persists the full score breakdown and origin tracing data.
 * @param {Object} data - Analysis result data
 */
export async function saveResult(data) {
  await initPromise;
  const {
    articleText,
    headline,
    credibility_score,
    consensus_label,
    flags,
    claim_check_summary,
    provider = 'gemini',
    usedSearchGrounding = true,
    score_breakdown = null,
    origin_trace = null
  } = data;

  const flagsString = Array.isArray(flags) ? JSON.stringify(flags) : (flags || '[]');
  const now = new Date().toISOString();

  // Extract breakdown fields for dedicated columns
  const textRisk = score_breakdown?.text_risk_score ?? 50;
  const evidenceRisk = score_breakdown?.evidence_risk_score ?? 50;
  const originRisk = score_breakdown?.origin_risk_score ?? 50;
  const llmRisk = score_breakdown?.llm_risk_score ?? 50;
  const llmConfidence = score_breakdown?.llm_confidence ?? 0.5;
  const originSource = origin_trace?.originTitle || score_breakdown?.origin_source || null;
  const originUrl = origin_trace?.originUrl || score_breakdown?.origin_url || null;
  const originFidelity = origin_trace?.fidelityRating || score_breakdown?.origin_fidelity || 'origin_not_found';
  const distortionSummary = origin_trace?.distortionSummary || score_breakdown?.origin_distortion_summary || null;

  dbInstance.run(
    `INSERT INTO analysis_results (
      article_text, headline, credibility_score, consensus_label, flags, claim_check_summary,
      provider, used_search_grounding,
      text_risk_score, evidence_risk_score, origin_risk_score, llm_risk_score, llm_confidence,
      origin_source, origin_url, origin_fidelity, distortion_summary,
      score_breakdown, origin_trace, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      articleText || '',
      headline || 'Untitled Article',
      credibility_score ?? 50,
      consensus_label || 'some_red_flags',
      flagsString,
      claim_check_summary || 'No summary available.',
      provider || 'gemini',
      usedSearchGrounding ? 1 : 0,
      textRisk,
      evidenceRisk,
      originRisk,
      llmRisk,
      llmConfidence,
      originSource,
      originUrl,
      originFidelity,
      distortionSummary,
      score_breakdown ? JSON.stringify(score_breakdown) : null,
      origin_trace ? JSON.stringify(origin_trace) : null,
      now
    ]
  );

  saveDbToFile();

  // Get inserted id
  const res = dbInstance.exec("SELECT last_insert_rowid() as id");
  const lastId = res[0]?.values[0][0] || Date.now();

  return {
    id: lastId,
    article_text: articleText,
    headline: headline || 'Untitled Article',
    credibility_score: credibility_score ?? 50,
    consensus_label: consensus_label || 'some_red_flags',
    flags: Array.isArray(flags) ? flags : JSON.parse(flagsString),
    claim_check_summary: claim_check_summary || 'No summary available.',
    provider: provider || 'gemini',
    usedSearchGrounding: Boolean(usedSearchGrounding),
    score_breakdown: score_breakdown || null,
    origin_trace: origin_trace || null,
    created_at: now
  };
}

/**
 * Retrieves recent analysis results from SQLite.
 * @param {number} limit - Maximum number of recent items to return (default 10)
 */
export async function getRecentResults(limit = 10) {
  await initPromise;
  const res = dbInstance.exec(`
    SELECT id, article_text, headline, credibility_score, consensus_label, flags, claim_check_summary,
           provider, used_search_grounding,
           text_risk_score, evidence_risk_score, origin_risk_score, llm_risk_score, llm_confidence,
           origin_source, origin_url, origin_fidelity, distortion_summary,
           score_breakdown, origin_trace, created_at
    FROM analysis_results
    ORDER BY id DESC
    LIMIT ${parseInt(limit, 10) || 10}
  `);

  if (!res || res.length === 0 || !res[0].values) {
    return [];
  }

  const columns = res[0].columns;
  const rows = res[0].values;

  return rows.map(row => {
    const item = {};
    columns.forEach((col, idx) => {
      item[col] = row[idx];
    });

    let parsedFlags = [];
    try {
      parsedFlags = JSON.parse(item.flags);
    } catch (e) {
      parsedFlags = [];
    }

    // Parse JSON columns
    let scoreBreakdown = null;
    try {
      if (item.score_breakdown) scoreBreakdown = JSON.parse(item.score_breakdown);
    } catch (e) { /* ignore */ }

    let originTrace = null;
    try {
      if (item.origin_trace) originTrace = JSON.parse(item.origin_trace);
    } catch (e) { /* ignore */ }

    return {
      ...item,
      flags: parsedFlags,
      provider: item.provider || 'gemini',
      usedSearchGrounding: item.used_search_grounding !== undefined ? Boolean(item.used_search_grounding) : true,
      score_breakdown: scoreBreakdown,
      origin_trace: originTrace
    };
  });
}


export default {
  saveResult,
  getRecentResults
};
