# AI-Powered Misinformation Credibility Checker

A web app that analyzes news articles and returns a **credibility signal** —
not a true/false verdict — built from source reputation, linguistic
red-flag analysis, and AI-grounded live claim-checking.

> University capstone project · Theme: Artificial Intelligence
> University of Jaffna

## Overview

Misinformation spreads faster than fact-checkers can respond, and most
readers don't have the time or tools to evaluate an article's credibility
before sharing it. This tool lets a user submit an article (paste text or
a URL) and get back a transparent breakdown of:

1. **Source credibility** — is the domain known reliable, unknown, or flagged?
2. **Style / linguistic red flags** — sensational language, clickbait
   phrasing, missing citations
3. **Grounded claim check** — live search results (via the Gemini API)
   showing what other current coverage says about the article's claims

These three signals combine into an overall credibility score with full
supporting evidence — cited sources, listed flags — so the user can make
their own informed judgement. **The tool never declares an article "fake"
or "real."**

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React |
| Backend | Node.js + Express |
| AI | Google Gemini API (with Google Search grounding) |
| Scraping | Cheerio + Axios |
| Database | PostgreSQL (SQLite for local dev) |
| Version control | Git + GitHub (branch-based workflow) |

See [`PROJECT_BRIEF.md`](./PROJECT_BRIEF.md) for full architecture, data
model, team roles, and constraints — read that before starting any task.

## Project structure

```
/frontend    React app — submission page, results dashboard
/backend     Express API — scraping, analysis modules, aggregation
/docs        Proposal, diagrams, planning notes
```

## Getting started

### Prerequisites
- Node.js (v18+)
- npm
- A Google AI Studio API key ([aistudio.google.com](https://aistudio.google.com))

### Setup

```bash
# clone the repo
git clone https://github.com/MhdAqeel/Misinformation_credibility_checker.git
cd Misinformation_credibility_checker

# backend
cd backend
npm install
cp .env.example .env    # add your Gemini API key here
npm run dev

# frontend (in a separate terminal)
cd frontend
npm install
npm start
```

**Never commit your `.env` file or API key.** `.env` is already in
`.gitignore` — double-check before pushing.

### API keys

Each teammate should create their **own** Gemini API key (from their own
Google account) for local development — rate limits are tied to the
project/account behind the key, so separate personal keys mean everyone
can build and test in parallel without competing for the same quota.

- Put your personal key in your own local `.env` — never commit it, never
  share it in the group chat/repo
- The **deployed/demo version** of the app uses one designated "project
  key" (set by whoever handles deployment) — don't rotate between personal
  keys in the actual submitted app, to keep behavior consistent and easy
  to debug

## Branching workflow

- `main` — always stable, working code
- `dev` — integration branch; all feature branches merge here first
- `feature/your-task-name` — one branch per task

```bash
git checkout dev
git pull origin dev
git checkout -b feature/your-task-name
# ...work, commit often...
git push origin feature/your-task-name
# open a Pull Request into dev
```

No direct pushes to `main` or `dev` — everything goes through a PR.

## Team roles

| Role | Responsibility |
|---|---|
| Scraping / Input | URL scraping + raw-text input, cleaning article text |
| Source Credibility | Domain reputation lookup and reference list |
| Style Analysis | Linguistic red-flag detection (LLM/heuristics) |
| Grounding Integration | Gemini API + Google Search grounding, claim-checking |
| Frontend | Submission page, results page, UX states |

See `PROJECT_BRIEF.md` for full role breakdowns and how they connect.

## Status

🚧 In development — capstone project, [current milestone here].

## License

Academic project — University of Jaffna.
