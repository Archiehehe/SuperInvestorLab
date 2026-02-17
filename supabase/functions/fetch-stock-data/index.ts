import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { ticker } = await req.json();
    const FMP_API_KEY = Deno.env.get("FMP_API_KEY");
    if (!FMP_API_KEY) throw new Error("FMP_API_KEY is not configured");

    const BASE = "https://financialmodelingprep.com/stable";

    const [profileRes, ratiosRes, keyMetricsRes, growthRes] = await Promise.all([
      fetch(`${BASE}/profile?symbol=${ticker}&apikey=${FMP_API_KEY}`),
      fetch(`${BASE}/ratios?symbol=${ticker}&period=ttm&limit=1&apikey=${FMP_API_KEY}`),
      fetch(`${BASE}/key-metrics?symbol=${ticker}&period=ttm&limit=1&apikey=${FMP_API_KEY}`),
      fetch(`${BASE}/financial-growth?symbol=${ticker}&period=annual&limit=1&apikey=${FMP_API_KEY}`),
    ]);

    const safeArray = (data: any): any[] => (Array.isArray(data) ? data : []);
    const safeFirst = (data: any): any => safeArray(data)[0] || {};

    const profileData = await profileRes.json();
    const ratiosData = await ratiosRes.json();
    const keyMetricsData = await keyMetricsRes.json();
    const growthData = await growthRes.json();

    const profile = safeFirst(profileData);
    const ratios = safeFirst(ratiosData);
    const km = safeFirst(keyMetricsData);
    const growth = safeFirst(growthData);

    if (!profile || !profile.symbol) {
      return new Response(JSON.stringify({ error: `Ticker "${ticker}" not found` }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const r = (v: any) => {
      if (v === undefined || v === null || (typeof v === 'number' && isNaN(v))) return null;
      const n = Number(v);
      if (isNaN(n)) return null;
      // Return 0 as null for coverage-type metrics that shouldn't be 0
      return Number(n.toFixed(4));
    };

    // interestCoverage = 0 means no data (FMP returns 0 when N/A)
    const rCoverage = (v: any) => {
      const val = r(v);
      return val === 0 ? null : val;
    };

    const metrics = {
      ticker: profile.symbol,
      companyName: profile.companyName,
      price: r(profile.price),
      marketCap: r(profile.marketCap ?? profile.mktCap),
      sector: profile.sector || "N/A",
      industry: profile.industry || "N/A",
      exchange: profile.exchange || profile.exchangeShortName || "N/A",
      logo: profile.image || null,
      // Valuation — exact stable API field names confirmed from logs
      pe: r(ratios.priceToEarningsRatio),
      forwardPe: r(ratios.forwardPriceToEarningsRatio ?? profile.forwardPE),
      pb: r(ratios.priceToBookRatio),
      ps: r(ratios.priceToSalesRatio),
      evToEbitda: r(km.evToEBITDA ?? km.enterpriseValueMultiple),
      evToRevenue: r(km.evToSales),
      pegRatio: r(ratios.priceToEarningsGrowthRatio),
      priceToFcf: r(ratios.priceToFreeCashFlowRatio),
      earningsYield: r(km.earningsYield),
      // Quality & Growth — roe/roa come from keyMetrics, not ratios
      roe: r(km.returnOnEquity),
      roa: r(km.returnOnAssets),
      roic: r(km.returnOnInvestedCapital),
      grossMargin: r(ratios.grossProfitMargin),
      operatingMargin: r(ratios.operatingProfitMargin),
      netMargin: r(ratios.netProfitMargin),
      revenueGrowth: r(growth.revenueGrowth),
      epsGrowth: r(growth.epsgrowth ?? growth.epsGrowth),
      fcfGrowth: r(growth.freeCashFlowGrowth),
      // Balance Sheet & Dividends
      debtToEquity: r(ratios.debtToEquityRatio),
      currentRatio: r(ratios.currentRatio),
      quickRatio: r(ratios.quickRatio),
      interestCoverage: rCoverage(ratios.interestCoverageRatio),
      dividendYield: r(ratios.dividendYield),
      payoutRatio: r(ratios.dividendPayoutRatio),
      fcfYield: r(km.freeCashFlowYield),
      beta: r(profile.beta),
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
