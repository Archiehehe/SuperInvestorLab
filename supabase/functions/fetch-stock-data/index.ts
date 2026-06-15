import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const YAHOO_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; SuperInvestorLab/1.0)",
  "Accept": "application/json",
};

const FUNDAMENTAL_TYPES = [
  "annualMarketCap",
  "trailingPeRatio",
  "trailingPegRatio",
  "trailingTotalRevenue",
  "trailingNetIncome",
  "trailingGrossProfit",
  "trailingOperatingIncome",
  "trailingFreeCashFlow",
  "trailingEBITDA",
  "trailingDilutedEPS",
  "trailingInterestExpense",
  "trailingCashDividendsPaid",
  "quarterlyDilutedAverageShares",
  "quarterlyTotalDebt",
  "quarterlyLongTermDebt",
  "quarterlyStockholdersEquity",
  "quarterlyTotalAssets",
  "quarterlyCurrentAssets",
  "quarterlyCurrentLiabilities",
  "quarterlyCashAndCashEquivalents",
  "quarterlyInventory",
].join(",");

function toNumber(value: any): number | null {
  const raw = typeof value === "object" && value !== null && "raw" in value ? value.raw : value;
  if (raw === undefined || raw === null || raw === "") return null;
  const n = Number(raw);
  if (Number.isNaN(n)) return null;
  return Number(n.toFixed(4));
}

function toStringValue(value: any): string | null {
  if (typeof value === "object" && value !== null && "fmt" in value) return String(value.fmt);
  if (typeof value === "object" && value !== null && "raw" in value) return String(value.raw);
  if (typeof value === "string") return value;
  return null;
}

function normalizeDebtToEquity(value: any): number | null {
  const n = toNumber(value);
  if (n === null) return null;
  // Yahoo often returns debt/equity as a percentage (e.g. 145.6) while UI expects ratio (1.456)
  return n > 20 ? Number((n / 100).toFixed(4)) : n;
}

function normalizeTicker(input: string): string {
  return input.trim().toUpperCase().replace(/\./g, "-");
}

function displayTicker(input: string, normalized: string): string {
  return input.includes(".") ? input.trim().toUpperCase() : normalized.replace(/-/g, ".");
}

function okJson(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function fetchJson(url: string): Promise<any | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(url, { headers: YAHOO_HEADERS, signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn("stock data provider request failed:", e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function latestReported(timeseries: any, type: string): number | null {
  const rows = timeseries?.result;
  if (!Array.isArray(rows)) return null;
  const row = rows.find((item: any) => item?.meta?.type?.includes(type));
  const values = row?.[type];
  if (!Array.isArray(values)) return null;
  for (let i = values.length - 1; i >= 0; i--) {
    const raw = values[i]?.reportedValue?.raw;
    const n = toNumber(raw);
    if (n !== null) return n;
  }
  return null;
}

function growthFromSeries(timeseries: any, type: string): number | null {
  const rows = timeseries?.result;
  if (!Array.isArray(rows)) return null;
  const row = rows.find((item: any) => item?.meta?.type?.includes(type));
  const values = Array.isArray(row?.[type]) ? row[type] : [];
  const valid = values
    .map((v: any) => ({ date: v?.asOfDate ? Date.parse(v.asOfDate) : 0, value: toNumber(v?.reportedValue?.raw) }))
    .filter((v: any) => v.value !== null && v.value !== 0)
    .sort((a: any, b: any) => a.date - b.date);
  if (valid.length < 2) return null;
  const latest = valid[valid.length - 1];
  const targetDate = latest.date - 31536000000;
  let prior = valid[0];
  for (const item of valid) {
    if (item.date <= targetDate) prior = item;
  }
  const latestValue = latest.value as number;
  const priorValue = prior.value as number;
  if (!priorValue) return null;
  return Number(((latestValue - priorValue) / Math.abs(priorValue)).toFixed(4));
}

function safeRatio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return Number((numerator / denominator).toFixed(4));
}

function buildLogoUrl(website: string | null): string | null {
  if (!website) return null;
  try {
    const url = new URL(website.startsWith("http") ? website : `https://${website}`);
    return `https://logo.clearbit.com/${url.hostname}`;
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { ticker: rawTicker } = await req.json();
    if (!rawTicker || typeof rawTicker !== "string") {
      return new Response(JSON.stringify({ error: "Ticker is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ticker = normalizeTicker(rawTicker);
    const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1d`;
    const chartData = await fetchJson(chartUrl);
    const meta = chartData?.chart?.result?.[0]?.meta;

    if (!meta?.symbol || !toNumber(meta.regularMarketPrice)) {
      return new Response(JSON.stringify({ error: `Ticker "${rawTicker}" not found` }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = Math.floor(Date.now() / 1000);
    const fiveYearsAgo = now - 60 * 60 * 24 * 365 * 5;
    const fundamentalsUrl = `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(ticker)}?type=${FUNDAMENTAL_TYPES}&period1=${fiveYearsAgo}&period2=${now}`;
    const fundamentals = await fetchJson(fundamentalsUrl);

    const currentPrice = toNumber(meta.regularMarketPrice) ?? 0;
    const shares = latestReported(fundamentals?.timeseries, "quarterlyDilutedAverageShares");
    const annualMarketCap = latestReported(fundamentals?.timeseries, "annualMarketCap");
    const marketCap = annualMarketCap ?? (shares && currentPrice ? Number((shares * currentPrice).toFixed(2)) : null);
    const revenue = latestReported(fundamentals?.timeseries, "trailingTotalRevenue");
    const netIncome = latestReported(fundamentals?.timeseries, "trailingNetIncome");
    const grossProfit = latestReported(fundamentals?.timeseries, "trailingGrossProfit");
    const operatingIncome = latestReported(fundamentals?.timeseries, "trailingOperatingIncome");
    const freeCashFlow = latestReported(fundamentals?.timeseries, "trailingFreeCashFlow");
    const ebitda = latestReported(fundamentals?.timeseries, "trailingEBITDA");
    const eps = latestReported(fundamentals?.timeseries, "trailingDilutedEPS");
    const interestExpense = latestReported(fundamentals?.timeseries, "trailingInterestExpense");
    const dividendsPaid = latestReported(fundamentals?.timeseries, "trailingCashDividendsPaid");
    const totalDebt = latestReported(fundamentals?.timeseries, "quarterlyTotalDebt");
    const equity = latestReported(fundamentals?.timeseries, "quarterlyStockholdersEquity");
    const assets = latestReported(fundamentals?.timeseries, "quarterlyTotalAssets");
    const currentAssets = latestReported(fundamentals?.timeseries, "quarterlyCurrentAssets");
    const currentLiabilities = latestReported(fundamentals?.timeseries, "quarterlyCurrentLiabilities");
    const cash = latestReported(fundamentals?.timeseries, "quarterlyCashAndCashEquivalents");
    const inventory = latestReported(fundamentals?.timeseries, "quarterlyInventory");
    const enterpriseValue = marketCap && totalDebt !== null && cash !== null ? marketCap + totalDebt - cash : null;
    const pe = latestReported(fundamentals?.timeseries, "trailingPeRatio") ?? (eps && currentPrice ? safeRatio(currentPrice, eps) : null);
    const payoutRatio = netIncome && dividendsPaid ? safeRatio(Math.abs(dividendsPaid), netIncome) : null;

    const metrics = {
      ticker: displayTicker(rawTicker, toStringValue(meta.symbol) ?? ticker),
      companyName: toStringValue(meta.longName) ?? toStringValue(meta.shortName) ?? rawTicker.toUpperCase(),
      price: currentPrice,
      marketCap,
      sector: "N/A",
      industry: toStringValue(meta.instrumentType) ?? "Equity",
      exchange: toStringValue(meta.fullExchangeName) ?? toStringValue(meta.exchangeName) ?? "N/A",
      logo: null,
      // Valuation
      pe,
      forwardPe: null,
      pb: safeRatio(marketCap, equity),
      ps: safeRatio(marketCap, revenue),
      evToEbitda: safeRatio(enterpriseValue, ebitda),
      evToRevenue: safeRatio(enterpriseValue, revenue),
      pegRatio: latestReported(fundamentals?.timeseries, "trailingPegRatio"),
      priceToFcf: freeCashFlow && freeCashFlow > 0 ? safeRatio(marketCap, freeCashFlow) : null,
      earningsYield: pe && pe > 0 ? Number((1 / pe).toFixed(4)) : null,
      // Quality & Growth
      roe: safeRatio(netIncome, equity),
      roa: safeRatio(netIncome, assets),
      roic: operatingIncome !== null && totalDebt !== null && equity !== null ? safeRatio(operatingIncome, totalDebt + equity) : null,
      grossMargin: safeRatio(grossProfit, revenue),
      operatingMargin: safeRatio(operatingIncome, revenue),
      netMargin: safeRatio(netIncome, revenue),
      revenueGrowth: growthFromSeries(fundamentals?.timeseries, "trailingTotalRevenue"),
      epsGrowth: growthFromSeries(fundamentals?.timeseries, "trailingDilutedEPS"),
      fcfGrowth: growthFromSeries(fundamentals?.timeseries, "trailingFreeCashFlow"),
      // Balance Sheet & Dividends
      debtToEquity: safeRatio(totalDebt, equity),
      currentRatio: safeRatio(currentAssets, currentLiabilities),
      quickRatio: currentAssets !== null && currentLiabilities !== null ? safeRatio(currentAssets - (inventory ?? 0), currentLiabilities) : null,
      interestCoverage: operatingIncome !== null && interestExpense ? safeRatio(operatingIncome, Math.abs(interestExpense)) : null,
      dividendYield: marketCap && dividendsPaid ? safeRatio(Math.abs(dividendsPaid), marketCap) : null,
      payoutRatio,
      fcfYield: freeCashFlow ? safeRatio(freeCashFlow, marketCap) : null,
      beta: null,
    };

    return okJson(metrics);
  } catch (e) {
    console.error("fetch-stock-data error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
