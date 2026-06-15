export interface StockMetrics {
  ticker: string;
  companyName: string;
  price: number;
  marketCap: number;
  sector: string;
  industry: string;
  exchange: string;
  logo?: string;
  // Valuation
  pe: number | null;
  forwardPe: number | null;
  pb: number | null;
  ps: number | null;
  evToEbitda: number | null;
  evToRevenue: number | null;
  pegRatio: number | null;
  priceToFcf: number | null;
  earningsYield: number | null;
  // Quality & Growth
  roe: number | null;
  roa: number | null;
  roic: number | null;
  grossMargin: number | null;
  operatingMargin: number | null;
  netMargin: number | null;
  revenueGrowth: number | null;
  epsGrowth: number | null;
  fcfGrowth: number | null;
  // Balance Sheet & Dividends
  debtToEquity: number | null;
  currentRatio: number | null;
  quickRatio: number | null;
  interestCoverage: number | null;
  dividendYield: number | null;
  payoutRatio: number | null;
  fcfYield: number | null;
  beta: number | null;
  diagnostics?: {
    source: string;
    period: string;
    fiscalYear: number | null;
    isTtm: boolean;
  };
}

export type Signal = "pass" | "warn" | "fail";

export interface ChecklistItem {
  criterion: string;
  signal: Signal;
  value: string;
  explanation: string;
}

export interface InvestorEvaluation {
  investorId: string;
  investorName: string;
  philosophy: string;
  overallSignal: Signal;
  overallComment: string;
  compatibilityScore: number; // 0-100
  checklist: ChecklistItem[];
  passCount: number;
  warnCount: number;
  failCount: number;
}

export interface AnalysisResult {
  metrics: StockMetrics;
  evaluations: InvestorEvaluation[];
  timestamp: string;
}

export interface ScreenerResult {
  ticker: string;
  companyName: string;
  sector: string;
  passRate: number;
  totalPasses: number;
  totalFails: number;
  totalWarns: number;
  investorResults: Record<string, { passes: number; total: number; signal: Signal }>;
}
