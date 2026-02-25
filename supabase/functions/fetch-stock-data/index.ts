import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { ticker: rawTicker } = await req.json();
    const FMP_API_KEY = Deno.env.get("FMP_API_KEY");
    if (!FMP_API_KEY) throw new Error("FMP_API_KEY is not configured");

    // FMP uses dashes instead of dots for class shares (BRK.B -> BRK-B)
    const ticker = rawTicker.replace(/\./g, "-");

    // Use v3 API endpoints (available on free/starter plans, unlike /stable)
    const BASE = "https://financialmodelingprep.com/api/v3";

    const [profileRes, ratiosRes, keyMetricsRes, growthRes] = await Promise.all([
      fetch(`${BASE}/profile/${ticker}?apikey=${FMP_API_KEY}`),
      fetch(`${BASE}/ratios-ttm/${ticker}?apikey=${FMP_API_KEY}`),
      fetch(`${BASE}/key-metrics-ttm/${ticker}?apikey=${FMP_API_KEY}`),
      fetch(`${BASE}/financial-growth/${ticker}?limit=1&apikey=${FMP_API_KEY}`),
    ]);

    const safeJson = async (res: Response): Promise<any> => {
      const text = await res.text();
      try { return JSON.parse(text); } catch { console.warn("Non-JSON response:", text.slice(0, 120)); return []; }
    };
    const safeArray = (data: any): any[] => (Array.isArray(data) ? data : []);
    const safeFirst = (data: any): any => safeArray(data)[0] || {};

    const profileData = await safeJson(profileRes);
    const ratiosData = await safeJson(ratiosRes);
    const keyMetricsData = await safeJson(keyMetricsRes);
    const growthData = await safeJson(growthRes);

    const profile = safeFirst(profileData);
    const ratios = safeFirst(ratiosData);
    const km = safeFirst(keyMetricsData);
    const growth = safeFirst(growthData);

    if (!profile || !profile.symbol) {
      console.error(`Ticker "${ticker}" profile empty. Profile response:`, JSON.stringify(profileData).slice(0, 200));
      return new Response(JSON.stringify({ error: `Ticker "${rawTicker}" not found` }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const r = (v: any) => {
      if (v === undefined || v === null || (typeof v === 'number' && isNaN(v))) return null;
      const n = Number(v);
      if (isNaN(n)) return null;
      return Number(n.toFixed(4));
    };

    const rCoverage = (v: any) => {
      const val = r(v);
      return val === 0 ? null : val;
    };

    // v3 TTM endpoints use different field names (with TTM suffix)
    const metrics = {
      ticker: profile.symbol,
      companyName: profile.companyName,
      price: r(profile.price),
      marketCap: r(profile.mktCap),
      sector: profile.sector || "N/A",
      industry: profile.industry || "N/A",
      exchange: profile.exchangeShortName || profile.exchange || "N/A",
      logo: profile.image || null,
      // Valuation
      pe: r(ratios.peRatioTTM ?? ratios.priceEarningsRatioTTM),
      forwardPe: r(profile.forwardPE ?? ratios.forwardPERatioTTM),
      pb: r(ratios.priceToBookRatioTTM ?? ratios.pbRatioTTM),
      ps: r(ratios.priceToSalesRatioTTM ?? ratios.psRatioTTM),
      evToEbitda: r(km.enterpriseValueOverEBITDATTM ?? km.evToEbitdaTTM),
      evToRevenue: r(km.evToSalesTTM),
      pegRatio: r(ratios.pegRatioTTM ?? ratios.priceEarningsToGrowthRatioTTM),
      priceToFcf: r(ratios.priceToFreeCashFlowsRatioTTM ?? ratios.pfcfRatioTTM),
      earningsYield: r(km.earningsYieldTTM),
      // Quality & Growth
      roe: r(ratios.returnOnEquityTTM ?? km.roeTTM),
      roa: r(ratios.returnOnAssetsTTM ?? km.roaTTM),
      roic: r(ratios.returnOnCapitalEmployedTTM ?? km.roicTTM),
      grossMargin: r(ratios.grossProfitMarginTTM),
      operatingMargin: r(ratios.operatingProfitMarginTTM),
      netMargin: r(ratios.netProfitMarginTTM),
      revenueGrowth: r(growth.revenueGrowth),
      epsGrowth: r(growth.epsgrowth ?? growth.epsGrowth),
      fcfGrowth: r(growth.freeCashFlowGrowth),
      // Balance Sheet & Dividends
      debtToEquity: r(ratios.debtEquityRatioTTM ?? ratios.debtToEquityTTM),
      currentRatio: r(ratios.currentRatioTTM),
      quickRatio: r(ratios.quickRatioTTM),
      interestCoverage: rCoverage(ratios.interestCoverageTTM),
      dividendYield: r(ratios.dividendYieldTTM ?? ratios.dividendYielTTM),
      payoutRatio: r(ratios.payoutRatioTTM ?? ratios.dividendPayoutRatioTTM),
      fcfYield: r(km.freeCashFlowYieldTTM),
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
