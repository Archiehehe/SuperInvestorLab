import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UA = { "User-Agent": "SuperInvestorLab/1.0 (research@superinvestorlab.app)", "Accept": "application/json" };

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

type FactEntry = { val: number; fy: number; fp: string; form: string; end: string; filed: string };

function getFacts(companyFacts: any, ...concepts: string[]): FactEntry[] | null {
  const usgaap = companyFacts?.facts?.["us-gaap"] ?? {};
  let best: FactEntry[] | null = null;
  let bestEnd = "";
  for (const c of concepts) {
    const node = usgaap[c] ?? companyFacts?.facts?.["ifrs-full"]?.[c];
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
  const annual = facts.filter((f) => (f.form === "10-K" || f.form === "10-K/A") && f.fp === "FY");
  if (annual.length) return annual.sort((a, b) => (a.end > b.end ? 1 : -1)).pop()!;
  const fy = facts.filter((f) => f.fp === "FY");
  if (fy.length) return fy.sort((a, b) => (a.end > b.end ? 1 : -1)).pop()!;
  return facts.slice().sort((a, b) => (a.end > b.end ? 1 : -1)).pop() ?? null;
}

function priorAnnual(facts: FactEntry[] | null, currentFy: number): FactEntry | null {
  if (!facts) return null;
  const target = facts.filter((f) => (f.form === "10-K" || f.form === "10-K/A") && f.fp === "FY" && f.fy === currentFy - 1);
  if (target.length) return target.sort((a, b) => (a.end > b.end ? 1 : -1)).pop()!;
  return null;
}

function latestAny(facts: FactEntry[] | null): FactEntry | null {
  if (!facts || !facts.length) return null;
  return facts.slice().sort((a, b) => (a.end > b.end ? 1 : -1)).pop() ?? null;
}

function sumLatestQuarter(facts: FactEntry[] | null, quartersBack: number): number | null {
  if (!facts) return null;
  const qs = facts.filter((f) => f.form === "10-Q" && f.fp === "Q" + String(quartersBack > 0 ? 4 - quartersBack + 1 : 1));
  const v = qs.sort((a, b) => (a.end > b.end ? 1 : -1)).pop()?.val;
  return v != null ? Number(v) : null;
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

async function fetchFinnhubMetrics(ticker: string): Promise<Record<string, any> | null> {
  const key = Deno.env.get("FINNHUB_KEY");
  if (!key) return null;
  const d = await fetchJson(`https://finnhub.io/api/v1/stock/metric?symbol=${ticker}&metric=all&token=${key}`, UA, 4000);
  return d?.metric || null;
}

async function fetchFinnhubProfile(ticker: string): Promise<Record<string, any> | null> {
  const key = Deno.env.get("FINNHUB_KEY");
  if (!key) return null;
  return await fetchJson(`https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}&token=${key}`, UA, 4000);
}

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

    const [yahoo, submissions, companyFacts, finnhubMetric, finnhubProfile] = await Promise.all([
      fetchYahooQuote(ticker),
      entry ? fetchJson(`https://data.sec.gov/submissions/CIK${entry.cik}.json`, UA) : Promise.resolve(null),
      entry ? fetchJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${entry.cik}.json`, UA) : Promise.resolve(null),
      fetchFinnhubMetrics(ticker),
      fetchFinnhubProfile(ticker),
    ]);

    if (!entry && !yahoo.price && !finnhubMetric) {
      return new Response(JSON.stringify({ error: `Ticker "${rawTicker}" not found in any data source` }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const price = yahoo.price ?? finnhubProfile?.tp ?? finnhubMetric?.["52WeekHigh"] ?? 0;

    // EDGAR concepts
    const revF = getFacts(companyFacts, "Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "RevenueFromContractWithCustomer", "SalesRevenueNet", "RevenueFromContractsWithCustomers", "Revenue");
    const niF = getFacts(companyFacts, "NetIncomeLoss", "NetIncomeLossAvailableToCommonStockholders", "ProfitLoss");
    const gpF = getFacts(companyFacts, "GrossProfit", "GrossProfitFromContractsWithCustomers");
    const oiF = getFacts(companyFacts, "OperatingIncomeLoss", "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest");
    const ocfF = getFacts(companyFacts, "NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByOperatingActivities", "NetCashFromOperatingActivities");
    const capexF = getFacts(companyFacts, "PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets", "CapitalExpenditures");
    const assetsF = getFacts(companyFacts, "Assets", "AssetsTotal");
    const equityF = getFacts(companyFacts, "StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest", "TotalEquity", "ShareholdersEquity");
    const cashF = getFacts(companyFacts, "CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents", "CashAndCashEquivalents");
    const ltDebtF = getFacts(companyFacts, "LongTermDebt", "LongTermDebtNoncurrent", "NotesPayable");
    const stDebtF = getFacts(companyFacts, "DebtCurrent", "ShortTermBorrowings", "LongTermDebtCurrent", "CurrentPortionOfLongTermDebt");
    const sharesF = getFacts(companyFacts, "CommonStockSharesOutstanding", "EntityCommonStockSharesOutstanding", "WeightedAverageNumberOfDilutedSharesOutstanding");
    const epsF = getFacts(companyFacts, "EarningsPerShareDiluted", "EarningsPerShareBasic", "IncomeLossFromContinuingOperationsPerDilutedShare");
    const caF = getFacts(companyFacts, "AssetsCurrent", "CurrentAssets");
    const clF = getFacts(companyFacts, "LiabilitiesCurrent", "CurrentLiabilities");
    const invF = getFacts(companyFacts, "InventoryNet", "Inventory");
    const intExpF = getFacts(companyFacts, "InterestExpense", "InterestCostsExpense");
    const divF = getFacts(companyFacts, "PaymentsOfDividendsCommonStock", "PaymentsOfDividends", "Dividends");
    const rndF = getFacts(companyFacts, "ResearchAndDevelopmentExpense", "ResearchDevelopmentExpense");

    const revLatest = latestAnnual(revF);
    const revPrior = revLatest ? priorAnnual(revF, revLatest.fy) : null;
    const niLatest = latestAnnual(niF);
    const niPrior = niLatest ? priorAnnual(niF, niLatest.fy) : null;
    const epsLatest = latestAnnual(epsF);
    const epsPrior = epsLatest ? priorAnnual(epsF, epsLatest.fy) : null;

    const revenue = val(revLatest) ?? finnhubMetric?.revenueTTM ?? null;
    const netIncome = val(niLatest) ?? finnhubMetric?.netIncomeTTM ?? null;
    const grossProfit = val(latestAnnual(gpF)) ?? null;
    const operatingIncome = val(latestAnnual(oiF)) ?? null;
    const ocf = val(latestAnnual(ocfF)) ?? null;
    const capex = val(latestAnnual(capexF)) ?? null;
    const fcf = ocf !== null && capex !== null ? ocf - capex : ocf ?? finnhubMetric?.freeCashFlowTTM ?? null;
    const fcfPrior = (() => {
      const o = ocfF && latestAnnual(ocfF) ? priorAnnual(ocfF, latestAnnual(ocfF)!.fy) : null;
      const c = capexF && latestAnnual(capexF) ? priorAnnual(capexF, latestAnnual(capexF)!.fy) : null;
      if (!o) return null;
      return Number(o.val) - (c ? Number(c.val) : 0);
    })();

    const assets = val(latestAny(assetsF)) ?? null;
    const equity = val(latestAny(equityF)) ?? finnhubMetric?.equityTTM ?? null;
    const cash = val(latestAny(cashF)) ?? 0;
    const ltDebt = val(latestAny(ltDebtF)) ?? finnhubMetric?.longTermDebtTTM ?? 0;
    const stDebt = val(latestAny(stDebtF)) ?? 0;
    const totalDebt = ltDebt + stDebt;
    const sharesOut = val(latestAny(sharesF)) ?? finnhubMetric?.sharesOutstanding ?? null;
    const currentAssets = val(latestAny(caF)) ?? finnhubMetric?.currentAssetsTTM ?? null;
    const currentLiab = val(latestAny(clF)) ?? finnhubMetric?.currentLiabilitiesTTM ?? null;
    const inventory = val(latestAny(invF)) ?? 0;
    const interestExp = val(latestAnnual(intExpF)) ?? null;
    const dividends = val(latestAnnual(divF)) ?? null;
    const eps = val(epsLatest) ?? finnhubMetric?.epsTTM ?? null;

    const marketCap = sharesOut && price ? Number((sharesOut * price).toFixed(2)) : finnhubMetric?.marketCapitalization ?? null;
    const ev = marketCap !== null ? marketCap + totalDebt - cash : null;
    const ebitda = operatingIncome ?? finnhubMetric?.ebitdaTTM ?? null;
    const pe = eps && eps > 0 ? Number((price / eps).toFixed(2)) : null;
    const sicDesc = submissions?.sicDescription ?? null;

    const metrics = {
      ticker,
      companyName: entry?.name ?? yahoo.name ?? finnhubProfile?.name ?? ticker,
      price,
      marketCap,
      sector: sicDesc ?? finnhubProfile?.sector ?? "N/A",
      industry: sicDesc ?? finnhubProfile?.industry ?? "N/A",
      exchange: submissions?.exchanges?.[0] ?? yahoo.exchange ?? "N/A",
      logo: null,
      // Valuation
      pe: pe ?? finnhubMetric?.peTTM ?? null,
      forwardPe: finnhubMetric?.forwardPE ?? null,
      pb: safe(marketCap, equity) ?? finnhubMetric?.priceBookTTM ?? null,
      ps: safe(marketCap, revenue) ?? finnhubMetric?.priceSalesTTM ?? null,
      evToEbitda: safe(ev, ebitda) ?? finnhubMetric?.evEBITDATTM ?? null,
      evToRevenue: safe(ev, revenue) ?? finnhubMetric?.evRevenueTTM ?? null,
      pegRatio: finnhubMetric?.pegRatio ?? null,
      priceToFcf: fcf && fcf > 0 ? safe(marketCap, fcf) : null,
      earningsYield: pe && pe > 0 ? Number((1 / pe).toFixed(4)) : null,
      // Quality & Growth
      roe: safe(netIncome, equity) ?? finnhubMetric?.roeTTM ?? null,
      roa: safe(netIncome, assets) ?? finnhubMetric?.returnOnAssetsTTM ?? null,
      roic: operatingIncome !== null && equity !== null ? safe(operatingIncome, equity + totalDebt) : finnhubMetric?.returnOnInvestedCapitalTTM ?? null,
      grossMargin: safe(grossProfit, revenue) ?? finnhubMetric?.grossMarginTTM ?? null,
      operatingMargin: safe(operatingIncome, revenue) ?? finnhubMetric?.operatingMarginTTM ?? null,
      netMargin: safe(netIncome, revenue) ?? finnhubMetric?.netProfitMarginTTM ?? null,
      revenueGrowth: growth(revenue, val(revPrior)) ?? finnhubMetric?.revenueGrowthTTM ?? null,
      epsGrowth: growth(eps, val(epsPrior)) ?? finnhubMetric?.earningsGrowthTTM ?? null,
      fcfGrowth: growth(fcf, fcfPrior) ?? null,
      // Balance & Dividends
      debtToEquity: safe(totalDebt, equity) ?? finnhubMetric?.debtToEquityTTM ?? null,
      currentRatio: safe(currentAssets, currentLiab) ?? finnhubMetric?.currentRatioTTM ?? null,
      quickRatio: currentAssets !== null && currentLiab ? safe(currentAssets - inventory, currentLiab) : finnhubMetric?.quickRatioTTM ?? null,
      interestCoverage: operatingIncome !== null && interestExp ? safe(operatingIncome, Math.abs(interestExp)) : null,
      dividendYield: marketCap && dividends ? safe(Math.abs(dividends), marketCap) : finnhubMetric?.dividendYieldIndicatedAnnual ?? null,
      payoutRatio: netIncome && dividends ? safe(Math.abs(dividends), netIncome) : null,
      fcfYield: fcf ? safe(fcf, marketCap) : finnhubMetric?.freeCashFlowYieldTTM ?? null,
      beta: finnhubMetric?.beta ?? null,
      rndExpense: rndF ? val(latestAnnual(rndF)) : null,
      diagnostics: {
        source: entry ? (finnhubMetric ? "SEC EDGAR + Finnhub + Yahoo" : "SEC EDGAR + Yahoo") : "Finnhub + Yahoo",
        fiscalYear: revLatest?.fy ?? null,
      },
    };

    return new Response(JSON.stringify(metrics), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("fetch-stock-data error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
