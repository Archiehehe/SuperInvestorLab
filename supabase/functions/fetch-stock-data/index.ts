import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const YAHOO_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; SuperInvestorLab/1.0)",
  "Accept": "application/json",
};

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
    const modules = [
      "price",
      "summaryDetail",
      "summaryProfile",
      "defaultKeyStatistics",
      "financialData",
    ].join(",");

    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${modules}`;

    const res = await fetch(url, { headers: YAHOO_HEADERS });
    const data = await res.json();

    const yahooError = data?.quoteSummary?.error;
    if (yahooError) {
      return new Response(JSON.stringify({ error: `Ticker "${rawTicker}" not found` }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const profile = data?.quoteSummary?.result?.[0];
    if (!profile?.price?.symbol) {
      return new Response(JSON.stringify({ error: `Ticker "${rawTicker}" not found` }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const price = profile.price ?? {};
    const summaryDetail = profile.summaryDetail ?? {};
    const summaryProfile = profile.summaryProfile ?? {};
    const keyStats = profile.defaultKeyStatistics ?? {};
    const financial = profile.financialData ?? {};

    const marketCap = toNumber(price.marketCap);
    const freeCashFlow = toNumber(financial.freeCashflow);
    const pe = toNumber(summaryDetail.trailingPE);

    const metrics = {
      ticker: toStringValue(price.symbol) ?? ticker,
      companyName: toStringValue(price.longName) ?? toStringValue(price.shortName) ?? rawTicker.toUpperCase(),
      price: toNumber(price.regularMarketPrice),
      marketCap,
      sector: toStringValue(summaryProfile.sector) ?? "N/A",
      industry: toStringValue(summaryProfile.industry) ?? "N/A",
      exchange: toStringValue(price.exchangeName) ?? toStringValue(price.fullExchangeName) ?? "N/A",
      logo: buildLogoUrl(toStringValue(summaryProfile.website)),
      // Valuation
      pe,
      forwardPe: toNumber(summaryDetail.forwardPE),
      pb: toNumber(keyStats.priceToBook),
      ps: toNumber(summaryDetail.priceToSalesTrailing12Months),
      evToEbitda: toNumber(keyStats.enterpriseToEbitda),
      evToRevenue: toNumber(keyStats.enterpriseToRevenue),
      pegRatio: toNumber(keyStats.pegRatio),
      priceToFcf: marketCap && freeCashFlow && freeCashFlow > 0 ? Number((marketCap / freeCashFlow).toFixed(4)) : null,
      earningsYield: pe && pe > 0 ? Number((1 / pe).toFixed(4)) : null,
      // Quality & Growth
      roe: toNumber(financial.returnOnEquity),
      roa: toNumber(financial.returnOnAssets),
      roic: null,
      grossMargin: toNumber(financial.grossMargins),
      operatingMargin: toNumber(financial.operatingMargins),
      netMargin: toNumber(financial.profitMargins),
      revenueGrowth: toNumber(financial.revenueGrowth),
      epsGrowth: toNumber(financial.earningsGrowth),
      fcfGrowth: null,
      // Balance Sheet & Dividends
      debtToEquity: normalizeDebtToEquity(financial.debtToEquity),
      currentRatio: toNumber(financial.currentRatio),
      quickRatio: toNumber(financial.quickRatio),
      interestCoverage: null,
      dividendYield: toNumber(summaryDetail.dividendYield),
      payoutRatio: toNumber(keyStats.payoutRatio),
      fcfYield: marketCap && freeCashFlow ? Number((freeCashFlow / marketCap).toFixed(4)) : null,
      beta: toNumber(keyStats.beta),
    };

    return new Response(JSON.stringify(metrics), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("fetch-stock-data error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
