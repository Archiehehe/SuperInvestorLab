import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { metrics, investors } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const results = [];

    for (const investor of investors) {
      const systemPrompt = `You are an expert financial analyst specializing in the investment philosophy of ${investor.fullName} (${investor.style}).

Your task: Evaluate the given stock metrics against ${investor.fullName}'s investment philosophy and produce a structured checklist.

Philosophy: ${investor.philosophy}

IMPORTANT RULES:
- Generate 5-8 specific criteria that ${investor.fullName} would evaluate
- Each criterion must reference actual metric values from the data
- Be strictly neutral and factual. Never give investment advice
- Use phrases like "Strong fit for this style", "Mixed compatibility", "Does not align well"
- Each criterion should have a clear pass/warn/fail signal based on the data

You MUST respond using the suggest_evaluation tool.`;

      const userPrompt = `Evaluate this stock for ${investor.fullName}'s investment style:

Company: ${metrics.companyName} (${metrics.ticker})
Sector: ${metrics.sector} | Industry: ${metrics.industry}
Price: $${metrics.price} | Market Cap: $${(metrics.marketCap / 1e9).toFixed(2)}B

VALUATION:
P/E: ${metrics.pe ?? 'N/A'} | Forward P/E: ${metrics.forwardPe ?? 'N/A'} | P/B: ${metrics.pb ?? 'N/A'}
P/S: ${metrics.ps ?? 'N/A'} | EV/EBITDA: ${metrics.evToEbitda ?? 'N/A'} | EV/Revenue: ${metrics.evToRevenue ?? 'N/A'}
PEG: ${metrics.pegRatio ?? 'N/A'} | P/FCF: ${metrics.priceToFcf ?? 'N/A'} | Earnings Yield: ${metrics.earningsYield ? (metrics.earningsYield * 100).toFixed(2) + '%' : 'N/A'}

QUALITY & GROWTH:
ROE: ${metrics.roe ? (metrics.roe * 100).toFixed(2) + '%' : 'N/A'} | ROA: ${metrics.roa ? (metrics.roa * 100).toFixed(2) + '%' : 'N/A'} | ROIC: ${metrics.roic ? (metrics.roic * 100).toFixed(2) + '%' : 'N/A'}
Gross Margin: ${metrics.grossMargin ? (metrics.grossMargin * 100).toFixed(2) + '%' : 'N/A'} | Operating Margin: ${metrics.operatingMargin ? (metrics.operatingMargin * 100).toFixed(2) + '%' : 'N/A'} | Net Margin: ${metrics.netMargin ? (metrics.netMargin * 100).toFixed(2) + '%' : 'N/A'}
Revenue Growth: ${metrics.revenueGrowth ? (metrics.revenueGrowth * 100).toFixed(2) + '%' : 'N/A'} | EPS Growth: ${metrics.epsGrowth ? (metrics.epsGrowth * 100).toFixed(2) + '%' : 'N/A'} | FCF Growth: ${metrics.fcfGrowth ? (metrics.fcfGrowth * 100).toFixed(2) + '%' : 'N/A'}

BALANCE SHEET & DIVIDENDS:
Debt/Equity: ${metrics.debtToEquity ?? 'N/A'} | Current Ratio: ${metrics.currentRatio ?? 'N/A'} | Quick Ratio: ${metrics.quickRatio ?? 'N/A'}
Interest Coverage: ${metrics.interestCoverage ?? 'N/A'} | Dividend Yield: ${metrics.dividendYield ? (metrics.dividendYield * 100).toFixed(2) + '%' : 'N/A'}
Payout Ratio: ${metrics.payoutRatio ? (metrics.payoutRatio * 100).toFixed(2) + '%' : 'N/A'} | FCF Yield: ${metrics.fcfYield ? (metrics.fcfYield * 100).toFixed(2) + '%' : 'N/A'} | Beta: ${metrics.beta ?? 'N/A'}`;

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          tools: [{
            type: "function",
            function: {
              name: "suggest_evaluation",
              description: "Return structured evaluation of the stock against the investor's philosophy",
              parameters: {
                type: "object",
                properties: {
                  overallSignal: { type: "string", enum: ["pass", "warn", "fail"] },
                  overallComment: { type: "string", description: "One-sentence summary like 'Strong Buffett-style candidate' or 'Does not align well with Graham's deep value criteria'" },
                  compatibilityScore: { type: "number", description: "0-100 compatibility score" },
                  checklist: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        criterion: { type: "string", description: "The specific criterion being evaluated" },
                        signal: { type: "string", enum: ["pass", "warn", "fail"] },
                        value: { type: "string", description: "The actual metric value(s) relevant to this criterion" },
                        explanation: { type: "string", description: "Neutral factual explanation of why this passes/warns/fails" },
                      },
                      required: ["criterion", "signal", "value", "explanation"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["overallSignal", "overallComment", "compatibilityScore", "checklist"],
                additionalProperties: false,
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "suggest_evaluation" } },
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (response.status === 402) {
          return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds in Settings." }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const errText = await response.text();
        console.error(`AI error for ${investor.name}:`, response.status, errText);
        // Return a fallback evaluation
        results.push({
          investorId: investor.id,
          investorName: investor.fullName,
          philosophy: investor.philosophy,
          overallSignal: "warn",
          overallComment: "Unable to evaluate — AI service temporarily unavailable",
          compatibilityScore: 50,
          checklist: [],
          passCount: 0,
          warnCount: 0,
          failCount: 0,
        });
        continue;
      }

      const aiData = await response.json();
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      
      if (!toolCall) {
        results.push({
          investorId: investor.id,
          investorName: investor.fullName,
          philosophy: investor.philosophy,
          overallSignal: "warn",
          overallComment: "Evaluation could not be completed",
          compatibilityScore: 50,
          checklist: [],
          passCount: 0,
          warnCount: 0,
          failCount: 0,
        });
        continue;
      }

      const evaluation = JSON.parse(toolCall.function.arguments);
      const checklist = evaluation.checklist || [];
      
      results.push({
        investorId: investor.id,
        investorName: investor.fullName,
        philosophy: investor.philosophy,
        overallSignal: evaluation.overallSignal,
        overallComment: evaluation.overallComment,
        compatibilityScore: evaluation.compatibilityScore,
        checklist,
        passCount: checklist.filter((c: any) => c.signal === "pass").length,
        warnCount: checklist.filter((c: any) => c.signal === "warn").length,
        failCount: checklist.filter((c: any) => c.signal === "fail").length,
      });
    }

    return new Response(JSON.stringify({ evaluations: results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("evaluate-stock error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
