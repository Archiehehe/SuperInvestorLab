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

    // Fetch profile and key metrics in parallel
    const [profileRes, ratiosRes, growthRes, keyMetricsRes] = await Promise.all([
      fetch(`https://financialmodelingprep.com/api/v3/profile/${ticker}?apikey=${FMP_API_KEY}`),
      fetch(`https://financialmodelingprep.com/api/v3/ratios-ttm/${ticker}?apikey=${FMP_API_KEY}`),
      fetch(`https://financialmodelingprep.com/api/v3/financial-growth/${ticker}?limit=1&apikey=${FMP_API_KEY}`),
      fetch(`https://financialmodelingprep.com/api/v3/key-metrics-ttm/${ticker}?apikey=${FMP_API_KEY}`),
    ]);

    const [profile] = await profileRes.json();
    const [ratios] = await ratiosRes.json();
    const growth = (await growthRes.json())?.[0] || {};
    const [keyMetrics] = await keyMetricsRes.json();

    if (!profile) {
      return new Response(JSON.stringify({ error: `Ticker "${ticker}" not found` }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const r = (v: any) => (v !== undefined && v !== null && !isNaN(v) ? Number(Number(v).toFixed(4)) : null);

    const metrics = {
      ticker: profile.symbol,
      companyName: profile.companyName,
      price: r(profile.price),
      marketCap: r(profile.mktCap),
      sector: profile.sector || "N/A",
      industry: profile.industry || "N/A",
      exchange: profile.exchangeShortName || "N/A",
      logo: profile.image || null,
      pe: r(ratios?.peRatioTTM),
      forwardPe: r(profile.forwardPE) || r(ratios?.forwardPeRatioTTM),
      pb: r(ratios?.priceToBookRatioTTM),
      ps: r(ratios?.priceToSalesRatioTTM),
      evToEbitda: r(keyMetrics?.enterpriseValueOverEBITDATTM),
      evToRevenue: r(keyMetrics?.evToSalesTTM),
      pegRatio: r(ratios?.pegRatioTTM),
      priceToFcf: r(ratios?.priceToFreeCashFlowsRatioTTM),
      earningsYield: r(keyMetrics?.earningsYieldTTM),
      roe: r(ratios?.returnOnEquityTTM),
      roa: r(ratios?.returnOnAssetsTTM),
      roic: r(keyMetrics?.roicTTM),
      grossMargin: r(ratios?.grossProfitMarginTTM),
      operatingMargin: r(ratios?.operatingProfitMarginTTM),
      netMargin: r(ratios?.netProfitMarginTTM),
      revenueGrowth: r(growth?.revenueGrowth),
      epsGrowth: r(growth?.epsgrowth),
      fcfGrowth: r(growth?.freeCashFlowGrowth),
      debtToEquity: r(ratios?.debtEquityRatioTTM),
      currentRatio: r(ratios?.currentRatioTTM),
      quickRatio: r(ratios?.quickRatioTTM),
      interestCoverage: r(ratios?.interestCoverageTTM),
      dividendYield: r(ratios?.dividendYielTTM),
      payoutRatio: r(ratios?.payoutRatioTTM),
      fcfYield: r(keyMetrics?.freeCashFlowYieldTTM),
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
