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

async function fetchYahooSummary(ticker: string): Promise<Record<string, any> | null> {
  const t = ticker.replace(/\./g, "-");
  const d = await fetchJson(
    `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(t)}?modules=defaultKeyStatistics%2CfinancialData%2CsummaryDetail%2CincomeStatementHistory`,
    UA, 8000
  );
  const q = d?.quoteSummary?.result?.[0];
  if (!q) return null;
  const ks = q.defaultKeyStatistics ?? {};
  const fd = q.financialData ?? {};
  const sd = q.summaryDetail ?? {};
  return {
    beta: ks.beta?.raw ?? null,
    forwardPe: ks.forwardPE?.raw ?? null,
    pegRatio: ks.pegRatio?.raw ?? null,
    price: fd.currentPrice?.raw ?? sd.regularMarketPrice?.raw ?? fd.currentPrice?.fmt ?? null,
    name: fd.shortName?.longName ?? q.shortName ?? null,
    marketCap: fd.marketCap?.raw ?? ks.marketCap?.raw ?? null,
    enterpriseValue: fd.enterpriseValue?.raw ?? null,
    revenue: fd.totalRevenue?.raw ?? null,
    revenueGrowth: fd.revenueGrowth?.raw ?? null,
    grossMargin: fd.grossMargins?.raw ?? null,
    operatingMargin: fd.operatingMargins?.raw ?? null,
    netMargin: fd.profitMargins?.raw ?? null,
    roe: fd.returnOnEquity?.raw ?? null,
    roa: fd.returnOnAssets?.raw ?? null,
    debtToEquity: fd.debtToEquity?.raw ?? sd.debtToEquity?.raw ?? null,
    currentRatio: fd.currentRatio?.raw ?? sd.currentRatio?.raw ?? null,
    quickRatio: fd.quickRatio?.raw ?? sd.quickRatio?.raw ?? null,
    dividendYield: sd.dividendYield?.raw ?? fd.dividendYield?.raw ?? null,
    earningsPerShare: fd.earningsPerShare?.raw ?? ks.earningsPerShare?.raw ?? null,
    forwardEps: ks.forwardEps?.raw ?? null,
    sharesOutstanding: ks.sharesOutstanding?.raw ?? null,
    bookValue: ks.bookValue?.raw ?? null,
    priceToBook: ks.priceToBook?.raw ?? fd.priceToBook?.raw ?? null,
    sector: sd.sector ?? fd.sector ?? null,
    industry: sd.industry ?? fd.industry ?? null,
    exchange: sd.fullExchangeName ?? q.exchange ?? null,
  };
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

    const [yahooChart, submissions, companyFacts, yahooSummary] = await Promise.all([
      fetchYahooQuote(ticker),
      entry ? fetchJson(`https://data.sec.gov/submissions/CIK${entry.cik}.json`, UA) : Promise.resolve(null),
      entry ? fetchJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${entry.cik}.json`, UA) : Promise.resolve(null),
      fetchYahooSummary(ticker),
    ]);

    const yahoo = yahooChart.price ? yahooChart : yahooSummary;

    if (!entry && !yahoo?.price) {
      return new Response(JSON.stringify({ error: `Ticker "${rawTicker}" not found in any data source` }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const price = yahoo?.price ?? 0;
    const yh = yahooSummary ?? {};

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

    const revenue = val(revLatest) ?? yh.revenue ?? null;
    const netIncome = val(niLatest) ?? null;
    const grossProfit = val(latestAnnual(gpF)) ?? null;
    const operatingIncome = val(latestAnnual(oiF)) ?? null;
    const ocf = val(latestAnnual(ocfF)) ?? null;
    const capex = val(latestAnnual(capexF)) ?? null;
    const fcf = ocf !== null && capex !== null ? ocf - capex : ocf ?? null;
    const fcfPrior = (() => {
      const o = ocfF && latestAnnual(ocfF) ? priorAnnual(ocfF, latestAnnual(ocfF)!.fy) : null;
      const c = capexF && latestAnnual(capexF) ? priorAnnual(capexF, latestAnnual(capexF)!.fy) : null;
      if (!o) return null;
      return Number(o.val) - (c ? Number(c.val) : 0);
    })();

    const assets = val(latestAny(assetsF)) ?? null;
    const equity = val(latestAny(equityF)) ?? yh.bookValue != null && yh.sharesOutstanding != null ? yh.bookValue * yh.sharesOutstanding : null;
    const cash = val(latestAny(cashF)) ?? 0;
    const ltDebt = val(latestAny(ltDebtF)) ?? 0;
    const stDebt = val(latestAny(stDebtF)) ?? 0;
    const totalDebt = ltDebt + stDebt;
    const sharesOut = val(latestAny(sharesF)) ?? yh.sharesOutstanding ?? null;
    const currentAssets = val(latestAny(caF)) ?? null;
    const currentLiab = val(latestAny(clF)) ?? null;
    const inventory = val(latestAny(invF)) ?? 0;
    const interestExp = val(latestAnnual(intExpF)) ?? null;
    const dividends = val(latestAnnual(divF)) ?? null;
    const eps = val(epsLatest) ?? yh.earningsPerShare ?? null;

    const marketCap = sharesOut && price ? Number((sharesOut * price).toFixed(2)) : yh.marketCap ?? null;
    const ev = marketCap !== null ? marketCap + totalDebt - cash : yh.enterpriseValue ?? null;
    const ebitda = operatingIncome ?? null;
    const pe = eps && eps > 0 ? Number((price / eps).toFixed(2)) : null;
    const sicDesc = submissions?.sicDescription ?? null;

    const metrics = {
      ticker,
      companyName: entry?.name ?? yahoo?.name ?? yh.name ?? ticker,
      price,
      marketCap,
      sector: sicDesc ?? yh.sector ?? "N/A",
      industry: sicDesc ?? yh.industry ?? "N/A",
      exchange: submissions?.exchanges?.[0] ?? yahoo?.exchange ?? yh.exchange ?? "N/A",
      logo: null,
      // Valuation
      pe: pe ?? null,
      forwardPe: yh.forwardPe ?? null,
      pb: safe(marketCap, equity) ?? yh.priceToBook ?? null,
      ps: safe(marketCap, revenue) ?? null,
      evToEbitda: safe(ev, ebitda) ?? null,
      evToRevenue: safe(ev, revenue) ?? null,
      pegRatio: yh.pegRatio ?? null,
      priceToFcf: fcf && fcf > 0 ? safe(marketCap, fcf) : null,
      earningsYield: pe && pe > 0 ? Number((1 / pe).toFixed(4)) : null,
      // Quality & Growth
      roe: safe(netIncome, equity) ?? yh.roe ?? null,
      roa: safe(netIncome, assets) ?? yh.roa ?? null,
      roic: operatingIncome !== null && equity !== null ? safe(operatingIncome, equity + totalDebt) : null,
      grossMargin: safe(grossProfit, revenue) ?? yh.grossMargin ?? null,
      operatingMargin: safe(operatingIncome, revenue) ?? yh.operatingMargin ?? null,
      netMargin: safe(netIncome, revenue) ?? yh.netMargin ?? null,
      revenueGrowth: growth(revenue, val(revPrior)) ?? yh.revenueGrowth ?? null,
      epsGrowth: growth(eps, val(epsPrior)) ?? null,
      fcfGrowth: growth(fcf, fcfPrior) ?? null,
      // Balance & Dividends
      debtToEquity: safe(totalDebt, equity) ?? yh.debtToEquity ?? null,
      currentRatio: safe(currentAssets, currentLiab) ?? yh.currentRatio ?? null,
      quickRatio: currentAssets !== null && currentLiab ? safe(currentAssets - inventory, currentLiab) : yh.quickRatio ?? null,
      interestCoverage: operatingIncome !== null && interestExp ? safe(operatingIncome, Math.abs(interestExp)) : null,
      dividendYield: marketCap && dividends ? safe(Math.abs(dividends), marketCap) : yh.dividendYield ?? null,
      payoutRatio: netIncome && dividends ? safe(Math.abs(dividends), netIncome) : null,
      fcfYield: fcf ? safe(fcf, marketCap) : null,
      beta: yh.beta ?? null,
      rndExpense: rndF ? val(latestAnnual(rndF)) : null,
      diagnostics: {
        source: entry ? "SEC EDGAR + Yahoo" : "Yahoo",
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
