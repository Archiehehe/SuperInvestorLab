import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function metricSignal(value: number | null | undefined, pass: (n: number) => boolean, warn: (n: number) => boolean) {
  if (value === null || value === undefined || Number.isNaN(value)) return "warn";
  if (pass(value)) return "pass";
  if (warn(value)) return "warn";
  return "fail";
}

function formatValue(value: number | null | undefined, type: "ratio" | "percent" | "money" = "ratio") {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  if (type === "percent") return `${(value * 100).toFixed(2)}%`;
  if (type === "money") return `$${value.toFixed(2)}`;
  return value.toFixed(2);
}

function fallbackEvaluation(metrics: any, investor: any, reason = "AI service temporarily unavailable") {
  const checklist = [
    {
      criterion: "Valuation discipline",
      signal: metricSignal(metrics.pe, (n) => n > 0 && n <= 20, (n) => n > 0 && n <= 35),
      value: `P/E ${formatValue(metrics.pe)}, P/B ${formatValue(metrics.pb)}, P/S ${formatValue(metrics.ps)}`,
      explanation: "Compares current valuation multiples with conservative value-investing thresholds.",
    },
    {
      criterion: "Business quality",
      signal: metricSignal(metrics.roe, (n) => n >= 0.15, (n) => n >= 0.08),
      value: `ROE ${formatValue(metrics.roe, "percent")}, ROA ${formatValue(metrics.roa, "percent")}`,
      explanation: "Higher returns on equity and assets suggest stronger economics and capital efficiency.",
    },
    {
      criterion: "Cash generation",
      signal: metricSignal(metrics.fcfYield, (n) => n >= 0.05, (n) => n >= 0.02),
      value: `FCF yield ${formatValue(metrics.fcfYield, "percent")}, P/FCF ${formatValue(metrics.priceToFcf)}`,
      explanation: "Free cash flow is used as a practical proxy for owner earnings and downside support.",
    },
    {
      criterion: "Balance-sheet resilience",
      signal: metricSignal(metrics.debtToEquity, (n) => n <= 1, (n) => n <= 2.5),
      value: `Debt/equity ${formatValue(metrics.debtToEquity)}, current ratio ${formatValue(metrics.currentRatio)}`,
      explanation: "Lower leverage and adequate liquidity reduce financial fragility.",
    },
    {
      criterion: "Growth profile",
      signal: metricSignal(metrics.revenueGrowth ?? metrics.epsGrowth, (n) => n >= 0.08, (n) => n >= 0),
      value: `Revenue growth ${formatValue(metrics.revenueGrowth, "percent")}, EPS growth ${formatValue(metrics.epsGrowth, "percent")}`,
      explanation: "Positive growth improves compatibility with quality, GARP, and compounding styles.",
    },
  ];
  const passCount = checklist.filter((c) => c.signal === "pass").length;
  const warnCount = checklist.filter((c) => c.signal === "warn").length;
  const failCount = checklist.filter((c) => c.signal === "fail").length;
  const compatibilityScore = Math.round(((passCount * 1 + warnCount * 0.5) / checklist.length) * 100);
  return {
    investorId: investor.id,
    investorName: investor.fullName,
    philosophy: investor.philosophy,
    overallSignal: compatibilityScore >= 70 ? "pass" : compatibilityScore >= 40 ? "warn" : "fail",
    overallComment: `${reason}; using rules-based ${investor.name} compatibility screen.`,
    compatibilityScore,
    checklist,
    passCount,
    warnCount,
    failCount,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { metrics, investors } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    const results = [];

    for (const investor of investors) {
      if (!LOVABLE_API_KEY) {
        results.push(fallbackEvaluation(metrics, investor, "AI key is not configured"));
        continue;
      }

      const systemPrompt = `You are channeling ${investor.fullName} (${investor.style}) reviewing this stock as if it crossed your desk this morning. Speak in their voice — the specific vocabulary, mental models, and pet peeves they are famous for. No textbook language.

Philosophy: ${investor.philosophy}

STRICT RULES:
- Produce 5-8 checklist items that this specific investor would actually look at first — not a generic value/growth checklist. A Graham review should mention NCAV-style thinking; a Lynch review should categorize the stock; a Wood review should talk innovation S-curves; a Taleb review should talk fragility and tail risk; etc.
- Quote concrete numbers from the data in every "value" field (e.g. "ROE 24.3%, well above the 15% threshold I want") — never abstract phrases like "good ROE".
- Vary criterion names across investors. Do NOT default to "Valuation", "Quality", "Growth", "Balance Sheet", "Cash Flow". Use phrasing that fits this investor (e.g. "Owner earnings yield", "PEG check", "Margin of safety vs liquidation value", "Reinvestment runway", "Antifragility of the balance sheet").
- "overallComment" must sound like a one-line verdict this investor would actually say, referencing the company by name. Avoid the words "Strong fit", "Mixed compatibility", "Does not align" — write something specific instead.
- compatibilityScore is 0-100, calibrated to this investor's standards (most investors reject most stocks; a 70+ should be rare).
- Be neutral and factual — describe fit with the style, never recommend buying or selling.

Respond ONLY via the suggest_evaluation tool.`;

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

      let response: Response | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
            temperature: 0.85,
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

        if (response!.status === 429 && attempt < 2) {
          const wait = (attempt + 1) * 2000;
          console.warn(`Rate limited for ${investor.name}, retrying in ${wait}ms...`);
          await new Promise(r => setTimeout(r, wait));
          continue;
        }
        break;
      }

      if (!response!.ok) {
        if (response!.status === 429) {
          results.push(fallbackEvaluation(metrics, investor, "AI rate limit reached"));
          continue;
        }
        if (response!.status === 402) {
          results.push(fallbackEvaluation(metrics, investor, "AI credits unavailable"));
          continue;
        }
        const errText = await response!.text();
        console.error(`AI error for ${investor.name}:`, response!.status, errText);
        results.push(fallbackEvaluation(metrics, investor));
        continue;
      }

      const aiData = await response!.json();
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
