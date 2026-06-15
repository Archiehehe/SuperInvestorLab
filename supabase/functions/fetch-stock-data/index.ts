import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UA = { "User-Agent": "SuperInvestorLab/1.0 (research@superinvestorlab.app)", "Accept": "application/json" };

// -------- caches (per cold start) --------
let TICKER_MAP: Record<string, { cik: string; name: string }> | null = null;

async function loadTickerMap(): Promise<Record<string, { cik: string; name: string }>> {
  if (TICKER_MAP) return TICKER_MAP;
  try {
    const r = await fetch("https://www.sec.gov/files/company_tickers.json", { headers: UA });
    const j = await r.json();
    const map: Record<string, { cik: string; name: string }> = {};
    for (const k of Object.keys(j)) {
      const row = j[k];
      const cik = String(row.cik_str).padStart(10, "0");
      map[String(row.ticker).toUpperCase()] = { cik, name: row.title };
    }
    TICKER_MAP = map;
    return map;
  } catch (e) {
    console.warn("ticker map load failed:", e);
    return {};
  }
}

async function fetchJson(url: string, headers: Record<string, string> = UA, timeoutMs = 9000): Promise<any | null> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers, signal: c.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    console.warn("request failed:", url, e);
    return null;
  } finally {
    clearTimeout(t);
  }
}

// -------- EDGAR helpers --------
type FactEntry = { val: number; fy: number; fp: string; form: string; end: string; filed: string };

function getFacts(companyFacts: any, ...concepts: string[]): FactEntry[] | null {
  const usgaap = companyFacts?.facts?.["us-gaap"] ?? {};
  // Pick the concept variant with the most recent reported end date so we
 // don't get stuck on deprecated tags (e.g. AAPL's pre-2018 "Revenues").
  let best: FactEntry[] | null = null;
  let bestEnd = "";
  for (const c of concepts) {
    const node = usgaap[c];
    if (!node) continue;
    const units = node.units;
    const key = units?.USD ? "USD" : units?.shares ? "shares" : units?.["USD/shares"] ? "USD/shares" : Object.keys(units ?? {})[0];
    if (!key) continue;
    const arr: FactEntry[] = units[key];
    if (!Array.isArray(arr) || !arr.length) continue;
    const latest = arr.reduce((m, f) => (f.end > m ? f.end : m), "");
    if (latest > bestEnd) { bestEnd = latest; best = arr; }
  }
  return best;
}

function latestAnnual(facts: FactEntry[] | null): FactEntry | null {
  if (!facts) return null;
  const annual = facts.filter((f) => f.form === "10-K" && f.fp === "FY");
  if (annual.length) return annual.sort((a, b) => (a.end > b.end ? 1 : -1)).pop()!;
  return facts.slice().sort((a, b) => (a.end > b.end ? 1 : -1)).pop() ?? null;
}

function priorAnnual(facts: FactEntry[] | null, currentFy: number): FactEntry | null {
  if (!facts) return null;
  const target = facts.filter((f) => f.form === "10-K" && f.fp === "FY" && f.fy === currentFy - 1);
  if (target.length) return target.sort((a, b) => (a.end > b.end ? 1 : -1)).pop()!;
  return null;
}

function latestAny(facts: FactEntry[] | null): FactEntry | null {
  if (!facts || !facts.length) return null;
  return facts.slice().sort((a, b) => (a.end > b.end ? 1 : -1)).pop() ?? null;
}

function val(f: FactEntry | null): number | null { return f ? Number(f.val) : null; }
function safe(n: number | null, d: number | null): number | null {
  if (n === null || d === null || d === 0) return null;
  return Number((n / d).toFixed(4));
}
function growth(curr: number | null, prev: number | null): number | null {
  if (curr === null || prev === null || prev === 0) return null;
  return Number(((curr - prev) / Math.abs(prev)).toFixed(4));
}

// -------- Yahoo price fallback --------
async function fetchYahooQuote(ticker: string): Promise<{ price: number | null; name: string | null; exchange: string | null }> {
  const t = ticker.replace(/\./g, "-");
  const d = await fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t)}?range=1d&interval=1d`, UA);
  const m = d?.chart?.result?.[0]?.meta;
  if (!m) return { price: null, name: null, exchange: null };
  return {
    price: typeof m.regularMarketPrice === "number" ? m.regularMarketPrice : null,
    name: m.longName ?? m.shortName ?? null,
    exchange: m.fullExchangeName ?? m.exchangeName ?? null,
  };
}

// -------- main --------
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { ticker: rawTicker } = await req.json();
    if (!rawTicker || typeof rawTicker !== "string") {
      return new Response(JSON.stringify({ error: "Ticker is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const ticker = rawTicker.trim().toUpperCase().replace(/-/g, ".");
    const lookupKey = ticker.replace(/\./g, "-");
    const tickerMap = await loadTickerMap();
    const entry = tickerMap[ticker] ?? tickerMap[lookupKey] ?? tickerMap[ticker.replace(/\./g, "")];

    // Price (Yahoo) and EDGAR (parallel)
    const [yahoo, submissions, companyFacts] = await Promise.all([
      fetchYahooQuote(ticker),
      entry ? fetchJson(`https://data.sec.gov/submissions/CIK${entry.cik}.json`, UA) : Promise.resolve(null),
      entry ? fetchJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${entry.cik}.json`, UA) : Promise.resolve(null),
    ]);

    if (!entry && !yahoo.price) {
      return new Response(JSON.stringify({ error: `Ticker "${rawTicker}" not found in SEC EDGAR or market data` }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const price = yahoo.price ?? 0;

    // EDGAR concepts
    const revF = getFacts(companyFacts, "Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet");
    const niF = getFacts(companyFacts, "NetIncomeLoss");
    const gpF = getFacts(companyFacts, "GrossProfit");
    const oiF = getFacts(companyFacts, "OperatingIncomeLoss");
    const ocfF = getFacts(companyFacts, "NetCashProvidedByUsedInOperatingActivities");
    const capexF = getFacts(companyFacts, "PaymentsToAcquirePropertyPlantAndEquipment");
    const assetsF = getFacts(companyFacts, "Assets");
    const equityF = getFacts(companyFacts, "StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest");
    const cashF = getFacts(companyFacts, "CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents");
    const ltDebtF = getFacts(companyFacts, "LongTermDebt", "LongTermDebtNoncurrent");
    const stDebtF = getFacts(companyFacts, "DebtCurrent", "ShortTermBorrowings", "LongTermDebtCurrent");
    const sharesF = getFacts(companyFacts, "CommonStockSharesOutstanding", "EntityCommonStockSharesOutstanding");
    const epsF = getFacts(companyFacts, "EarningsPerShareDiluted", "EarningsPerShareBasic");
    const caF = getFacts(companyFacts, "AssetsCurrent");
    const clF = getFacts(companyFacts, "LiabilitiesCurrent");
    const invF = getFacts(companyFacts, "InventoryNet");
    const intExpF = getFacts(companyFacts, "InterestExpense");
    const divF = getFacts(companyFacts, "PaymentsOfDividendsCommonStock", "PaymentsOfDividends");

    const revLatest = latestAnnual(revF);
    const revPrior = revLatest ? priorAnnual(revF, revLatest.fy) : null;
    const niLatest = latestAnnual(niF);
    const niPrior = niLatest ? priorAnnual(niF, niLatest.fy) : null;
    const epsLatest = latestAnnual(epsF);
    const epsPrior = epsLatest ? priorAnnual(epsF, epsLatest.fy) : null;

    const revenue = val(revLatest);
    const netIncome = val(niLatest);
    const grossProfit = val(latestAnnual(gpF));
    const operatingIncome = val(latestAnnual(oiF));
    const ocf = val(latestAnnual(ocfF));
    const capex = val(latestAnnual(capexF));
    const fcf = ocf !== null && capex !== null ? ocf - capex : ocf;
    const fcfPrior = (() => {
      const o = ocfF && latestAnnual(ocfF) ? priorAnnual(ocfF, latestAnnual(ocfF)!.fy) : null;
      const c = capexF && latestAnnual(capexF) ? priorAnnual(capexF, latestAnnual(capexF)!.fy) : null;
      if (!o) return null;
      return Number(o.val) - (c ? Number(c.val) : 0);
    })();

    const assets = val(latestAny(assetsF));
    const equity = val(latestAny(equityF));
    const cash = val(latestAny(cashF)) ?? 0;
    const ltDebt = val(latestAny(ltDebtF)) ?? 0;
    const stDebt = val(latestAny(stDebtF)) ?? 0;
    const totalDebt = ltDebt + stDebt;
    const sharesOut = val(latestAny(sharesF));
    const currentAssets = val(latestAny(caF));
    const currentLiab = val(latestAny(clF));
    const inventory = val(latestAny(invF)) ?? 0;
    const interestExp = val(latestAnnual(intExpF));
    const dividends = val(latestAnnual(divF));
    const eps = val(epsLatest);

    const marketCap = sharesOut && price ? Number((sharesOut * price).toFixed(2)) : null;
    const ev = marketCap !== null ? marketCap + totalDebt - cash : null;
    const ebitda = operatingIncome; // proxy when D&A not isolated
    const pe = eps && eps > 0 ? Number((price / eps).toFixed(2)) : null;

    // sector via SIC description from submissions
    const sicDesc = submissions?.sicDescription ?? null;

    const metrics = {
      ticker,
      companyName: entry?.name ?? yahoo.name ?? ticker,
      price,
      marketCap,
      sector: sicDesc ?? "N/A",
      industry: sicDesc ?? "N/A",
      exchange: submissions?.exchanges?.[0] ?? yahoo.exchange ?? "N/A",
      logo: null,
      // Valuation
      pe,
      forwardPe: null,
      pb: safe(marketCap, equity),
      ps: safe(marketCap, revenue),
      evToEbitda: safe(ev, ebitda),
      evToRevenue: safe(ev, revenue),
      pegRatio: null,
      priceToFcf: fcf && fcf > 0 ? safe(marketCap, fcf) : null,
      earningsYield: pe && pe > 0 ? Number((1 / pe).toFixed(4)) : null,
      // Quality & Growth
      roe: safe(netIncome, equity),
      roa: safe(netIncome, assets),
      roic: operatingIncome !== null && equity !== null ? safe(operatingIncome, equity + totalDebt) : null,
      grossMargin: safe(grossProfit, revenue),
      operatingMargin: safe(operatingIncome, revenue),
      netMargin: safe(netIncome, revenue),
      revenueGrowth: growth(revenue, val(revPrior)),
      epsGrowth: growth(eps, val(epsPrior)),
      fcfGrowth: growth(fcf, fcfPrior),
      // Balance & Dividends
      debtToEquity: safe(totalDebt, equity),
      currentRatio: safe(currentAssets, currentLiab),
      quickRatio: currentAssets !== null && currentLiab ? safe(currentAssets - inventory, currentLiab) : null,
      interestCoverage: operatingIncome !== null && interestExp ? safe(operatingIncome, Math.abs(interestExp)) : null,
      dividendYield: marketCap && dividends ? safe(Math.abs(dividends), marketCap) : null,
      payoutRatio: netIncome && dividends ? safe(Math.abs(dividends), netIncome) : null,
      fcfYield: fcf ? safe(fcf, marketCap) : null,
      beta: null,
      // diagnostics
      _source: entry ? "SEC EDGAR + Yahoo" : "Yahoo only",
      _fiscalYear: revLatest?.fy ?? null,
    };

    return new Response(JSON.stringify(metrics), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("fetch-stock-data error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
