import { supabase } from "@/integrations/supabase/client";
import type { StockMetrics, InvestorEvaluation, AnalysisResult } from "./types";
import type { Investor } from "./investors";

export async function searchTickers(query: string): Promise<Array<{ symbol: string; name: string; exchange?: string }>> {
  const { data, error } = await supabase.functions.invoke("search-tickers", {
    body: { query },
  });
  if (error) throw new Error(error.message || "Search failed");
  return data;
}

export async function fetchSP500(): Promise<Array<{ symbol: string; name: string; sector: string }>> {
  const { data, error } = await supabase.functions.invoke("search-tickers", {
    body: { query: "__sp500__" },
  });
  if (error) throw new Error(error.message || "Failed to fetch S&P 500");
  return data;
}

export async function fetchStockData(ticker: string): Promise<StockMetrics> {
  const { data, error } = await supabase.functions.invoke("fetch-stock-data", {
    body: { ticker },
  });
  if (error) throw new Error(error.message || "Failed to fetch stock data");
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function evaluateStock(
  metrics: StockMetrics,
  investors: Investor[]
): Promise<InvestorEvaluation[]> {
  const { data, error } = await supabase.functions.invoke("evaluate-stock", {
    body: { metrics, investors },
  });
  if (error) throw new Error(error.message || "Evaluation failed");
  if (data?.error) throw new Error(data.error);
  return data.evaluations;
}

// Simple cache using localStorage
const CACHE_PREFIX = "sil_cache_";
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

export function getCachedResult(key: string): AnalysisResult | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (Date.now() - new Date(cached.timestamp).getTime() > CACHE_TTL) {
      localStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    return cached;
  } catch {
    return null;
  }
}

export function setCachedResult(key: string, result: AnalysisResult): void {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(result));
  } catch {
    // localStorage might be full
  }
}
