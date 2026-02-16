# Superinvestor Lab

A modern web app that lets you analyze any stock (or screen the S&P 500) through the investment philosophies of 25+ legendary investors — powered by real financial metrics and dynamic AI evaluation.

Enter a ticker → select investor profiles → instantly see how the company stacks up against each legend's checklist (Graham, Buffett, Lynch, Greenblatt, Fisher, Munger, Klarman, and more).

Live demo: https://superinvestorlab.streamlit.app (original Streamlit version)  
Modern version in progress (React + shadcn/ui + AI checklists): coming soon on Vercel

## Core Purpose

Superinvestor Lab helps you view companies through timeless frameworks used by the world's greatest investors — without hardcoding rigid rules.  
Instead of static checklists, the app uses AI to interpret current metrics against each investor's philosophy in a fresh, context-aware way.

It is:
- An educational lens for stock evaluation
- A way to compare modern companies against historical investing wisdom
- A screener for discovering potential fits across the S&P 500

It is not:
- Investment advice
- A prediction tool
- A replacement for your own research

## Key Features

- Single Stock Analysis
  - Searchable ticker input
  - Multi-select from 25+ legendary investor profiles
  - Real-time core metrics snapshot (P/E, ROE, Debt/Equity, FCF Yield, etc.)
  - AI-powered checklist evaluation per investor (pass/warn/fail with explanations)
  - Expandable metric definitions in plain English

- S&P 500 Screener
  - Select multiple profiles
  - Adjustable universe size (default 75 stocks)
  - Ranked table of top matches by overall pass rate
  - Sortable by passes, fails, warns, and per-investor scores

- Dynamic AI Checklists
  - No hardcoded rules — LLM evaluates metrics against each investor's known philosophy
  - Neutral, factual output only (no recommendations)

- Clean, spacious dark UI (in modern version)
  - shadcn/ui components, responsive layout, tooltips everywhere

## Investor Profiles (AI-evaluated)

Graham – Deep Value  
Buffett – Quality at Fair Price  
Lynch – GARP (PEG)  
Greenblatt – Magic Formula  
Fisher – Growth at Reasonable Price  
Munger – Mental Models & Moats  
Klarman – Margin of Safety  
Marks – Risk & Cycles  
Ackman – Concentrated Value  
Wood – Disruptive Innovation  
Dalio – All Weather  
Soros – Reflexivity  
Templeton – Contrarian  
Dreman – Contrarian Low P/E  
Burry – Deep Value Scarcity  
Pabrai – Clone Investing  
Li Lu – Quality Moats  
Terry Smith – Quality Compounders  
Nick Sleep – Long-Term Quality  
Pat Dorsey – Economic Moats  
Aswath Damodaran – Valuation  
Tobias Carlisle – Acquirer’s Multiple  
Meb Faber – Quantitative Trend  
Jim O’Shaughnessy – Quantitative  
Richard Thaler – Behavioral  
Nassim Taleb – Antifragile/Barbell  

(and more added over time)

## Tech Stack (Modern Version)

- Vite + React + TypeScript
- Tailwind CSS + shadcn/ui
- Financial Modeling Prep (FMP) API for live metrics
- Deployed on Vercel

## Getting Started (Local)

```bash
git clone https://github.com/Archiehehe/superinvestor.git
cd superinvestor
npm install
npm run dev
