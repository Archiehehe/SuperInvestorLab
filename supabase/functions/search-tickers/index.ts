import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { query } = await req.json();
    const FMP_API_KEY = Deno.env.get("FMP_API_KEY");
    if (!FMP_API_KEY) throw new Error("FMP_API_KEY is not configured");

    if (query === "__sp500__") {
      const res = await fetch(`https://financialmodelingprep.com/api/v3/sp500_constituent?apikey=${FMP_API_KEY}`);
      const data = await res.json();
      if (!Array.isArray(data)) {
        console.error("SP500 API response:", JSON.stringify(data));
        return new Response(JSON.stringify([]), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const tickers = data.map((d: any) => ({
        symbol: d.symbol,
        name: d.name,
        sector: d.sector,
      }));
      return new Response(JSON.stringify(tickers), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const res = await fetch(`https://financialmodelingprep.com/api/v3/search?query=${encodeURIComponent(query)}&limit=10&apikey=${FMP_API_KEY}`);
    const data = await res.json();
    if (!Array.isArray(data)) {
      console.error("Search API response:", JSON.stringify(data));
      return new Response(JSON.stringify([]), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const results = data.map((d: any) => ({
      symbol: d.symbol,
      name: d.name,
      exchange: d.exchangeShortName,
    }));

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("search-tickers error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
