# Project Brief — AI-Powered Misinformation Credibility Checker

> Paste this file's contents into any AI coding assistant (Claude, Claude Code,
> ChatGPT, etc.) at the start of a session to give it full project context.
> Keep this file updated as decisions change.

## Context

University capstone group project (CS, University of Jaffna). AI theme.
Timeline: 1–2 months. Team skill level: beginner-to-intermediate ML/NLP,
comfortable with basic web development.

## What it does

A web app where a user submits a news article (paste text or a URL) and
receives a **credibility signal** — explicitly **not** a true/false verdict —
built from three independent layers:

1. **Source credibility check** — look up the article's domain against a
   reputation reference list (reliable / unknown / flagged).
2. **Style / linguistic red-flag analysis** — detect sensational headlines,
   clickbait phrasing, missing citations, emotionally manipulative language
   (via LLM prompt and/or simple heuristics).
3. **Grounded claim check** — call the Gemini API with the `google_search`
   grounding tool enabled to find and cite live, current coverage related to
   the article's claims (this is what lets the tool handle *current* news,
   not just topics the model already knows about).

These three signals are combined into an overall credibility score with a
visible breakdown — matched/missing signals, flagged patterns, and cited
sources — so the user sees *why*, not just a number.

**Core framing (do not deviate from this):** the tool identifies structural
credibility signals. It does not determine objective truth. This must be
reflected in the UI copy, the report, and any AI-generated explanations.

## Tech stack

- **Frontend:** React
- **Backend:** Node.js + Express
- **AI:** Google Gemini API (Google AI Studio), using `google_search`
  grounding for live claim-checking
- **Database:** PostgreSQL (or SQLite for local dev)
- **Scraping:** Cheerio + Axios, or `@extractus/article-extractor`
- **Optional secondary signal:** scikit-learn TF-IDF + logistic regression
  classifier trained on a public fake/real news dataset (Kaggle) — if the
  team wants a "trained model" component alongside the LLM-based signals.
  If included, this piece runs as a small separate Python service/script
  rather than living inside the Node backend.

## Data model (entities)

- **User** — user_id (PK), name, email, password_hash
- **Article** — article_id (PK), user_id (FK), source_id (FK), url, title,
  raw_text, created_at
- **Source** — source_id (PK), domain, credibility_rating, last_checked
- **AnalysisResult** — result_id (PK), article_id (FK), credibility_score,
  consensus_label, created_at
- **RedFlag** — flag_id (PK), result_id (FK), flag_type, description
- **GroundedSource** — gsource_id (PK), result_id (FK), url, snippet

Relationships: User 1:M Article · Source 1:M Article · Article 1:1
AnalysisResult · AnalysisResult 1:M RedFlag · AnalysisResult 1:M
GroundedSource.

## Team roles

| Role | Owns | Depends on |
|---|---|---|
| Scraping / Input | URL scraping + raw-text input, cleaning article text into `{title, text, domain, publishDate}` | — (entry point for everyone else) |
| Source Credibility | Domain reputation lookup, reference list, `Source` table | Scraping/Input output |
| Style Analysis | LLM/heuristic red-flag detection (sensationalism, missing citations, etc.) | Scraping/Input output |
| Grounding Integration | Gemini API + `google_search` grounding call, parsing grounding metadata/citations | Scraping/Input output |
| Frontend | Submission page, results page, loading/error states | Backend REST endpoints |
| (Shared) | Aggregation logic combining the three signals into `AnalysisResult` | All three analysis modules |

## Constraints — do not violate these

- Do **not** attempt full true/false fact verification. Out of scope, not
  academically defensible for this timeline, and not something even
  well-funded research labs have solved reliably.
- Any claim-checking output **must cite real sources** returned by grounding
  metadata — never assert an unsourced conclusion.
- Keep LLM usage within free/low-cost tiers (Google AI Studio free tier is
  the default assumption) — avoid calling the API on every keystroke or
  unnecessarily during development/testing.
- Never commit API keys. Use `.env` + `.gitignore`.

## Key decisions log

*(update this section as the team finalizes things — keeps everyone, human
or AI, working from the same current state)*

- [x] Final backend framework: **Node.js + Express** — confirmed
- [ ] Include optional ML classifier: yes/no — **pending**
- [ ] Source credibility reference list: build manually vs. use existing
  open dataset — **pending**
- [ ] Database: PostgreSQL vs SQLite for this project's scale — **pending**

## Current task

*(fill this in each time you hand a specific task to an AI agent — e.g.
"write the Express endpoint for the source credibility check" or "write the
Gemini grounding API call in Node.js")*

>
