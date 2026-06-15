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
    `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(t)}?modules=defaultKeyStatistics%2CfinancialData%2CsummaryDetail`,
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
    price: fd.currentPrice?.raw ?? sd.regularMarketPrice?.raw ?? null,
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

    // ===== SEC EDGAR data =====
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
    const divF = getFacts(companyFacts, "PaymentsOfDividendsCommonStock", "PaymentsOfDividends", "Dividends");

    const revLatest = latestAnnual(revF);
    const revPrior = revLatest ? priorAnnual(revF, revLatest.fy) : null;
    const niLatest = latestAnnual(niF);
    const epsLatest = latestAnnual(epsF);

    // ===== Balance sheet: SEC point-in-time (primary) → Yahoo fallback =====
    const secAssets = val(latestAny(assetsF));
    const secEquity = val(latestAny(equityF));
    const secCash = val(latestAny(cashF)) ?? 0;
    const secLtDebt = val(latestAny(ltDebtF)) ?? 0;
    const secStDebt = val(latestAny(stDebtF)) ?? 0;
    const secTotalDebt = secLtDebt + secStDebt;
    const secShares = val(latestAny(sharesF));
    const secCA = val(latestAny(caF));
    const secCL = val(latestAny(clF));
    const secInv = val(latestAny(invF)) ?? 0;
    const secDiv = val(latestAnnual(divF));

    const bsAssets = secAssets ?? null;
    const bsEquity = secEquity ?? (yh.bookValue && yh.sharesOutstanding ? yh.bookValue * yh.sharesOutstanding : null);
    const bsCash = secCash;
    const bsDebt = secTotalDebt;
    const bsShares = secShares ?? yh.sharesOutstanding ?? null;
    const bsCA = secCA ?? null;
    const bsCL = secCL ?? null;
    const bsInv = secInv;
    const bsDiv = secDiv;

    // ===== Income statement: Yahoo TTM (primary) → SEC FY fallback =====
    const incRevenue = yh.revenue ?? val(revLatest) ?? null;
    const incEPS = yh.earningsPerShare ?? val(epsLatest) ?? null;
    const incGrossMargin = yh.grossMargin ?? null;
    const incOpMargin = yh.operatingMargin ?? null;
    const incNetMargin = yh.netMargin ?? null;

    // For ratios needing raw income values not in Yahoo: compute from margins × revenue
    const incGrossProfit = incGrossMargin != null && incRevenue != null ? incGrossMargin * incRevenue : null;
    const incOperatingIncome = incOpMargin != null && incRevenue != null ? incOpMargin * incRevenue : null;
    const incNetIncome = incNetMargin != null && incRevenue != null ? incNetMargin * incRevenue : val(niLatest) ?? null;

    // Growth: Yahoo TTM → SEC FY
    const incRevenueGrowth = yh.revenueGrowth ?? (revLatest && revPrior ? growth(val(revLatest), val(revPrior)) : null);
    const incEpsGrowth = null; // Yahoo doesn't provide EPS growth directly

    // Compute FCF: OCF - Capex from SEC, or derive from (NetIncome × (1 - reinvestment rate))
    const secOcf = val(latestAnnual(ocfF));
    const secCapex = val(latestAnnual(capexF));
    const incFcf = yh.enterpriseValue != null && yh.revenue != null ? null : (secOcf != null ? secOcf - (secCapex ?? 0) : null);

    // ===== Computed market metrics =====
    const marketCap = bsShares && price ? Number((bsShares * price).toFixed(2)) : yh.marketCap ?? null;
    const ev = marketCap != null ? marketCap + bsDebt - bsCash : yh.enterpriseValue ?? null;
    const pe = incEPS && incEPS > 0 && price > 0 ? Number((price / incEPS).toFixed(2)) : null;
    const sicDesc = submissions?.sicDescription ?? null;

    // ===== Determine data period label =====
    const usingTtm = yh.revenue != null || yh.earningsPerShare != null;
    const secFy = revLatest?.fy ?? null;
    const periodLabel = usingTtm ? "TTM" : secFy ? `FY${secFy}` : "N/A";
    const sourceLabel = entry ? (usingTtm ? "Yahoo (TTM) + SEC EDGAR" : "SEC EDGAR (Annual)") : "Yahoo";

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
      pe,
      forwardPe: yh.forwardPe ?? null,
      pb: safe(marketCap, bsEquity) ?? yh.priceToBook ?? null,
      ps: incRevenue ? safe(marketCap, incRevenue) : null,
      evToEbitda: ev && incOperatingIncome ? safe(ev, incOperatingIncome) : null,
      evToRevenue: ev && incRevenue ? safe(ev, incRevenue) : null,
      pegRatio: yh.pegRatio ?? null,
      priceToFcf: incFcf && incFcf > 0 && marketCap ? safe(marketCap, incFcf) : null,
      earningsYield: pe && pe > 0 ? Number((1 / pe).toFixed(4)) : null,
      // Quality & Growth
      roe: incNetIncome && bsEquity ? safe(incNetIncome, bsEquity) : yh.roe ?? null,
      roa: incNetIncome && bsAssets ? safe(incNetIncome, bsAssets) : yh.roa ?? null,
      roic: incNetIncome && bsEquity ? safe(incNetIncome, bsEquity + bsDebt - bsCash) : null,
      grossMargin: incGrossMargin ?? null,
      operatingMargin: incOpMargin ?? null,
      netMargin: incNetMargin ?? null,
      revenueGrowth: incRevenueGrowth ?? yh.revenueGrowth ?? null,
      epsGrowth: incEpsGrowth ?? null,
      fcfGrowth: null,
      // Balance & Dividends
      debtToEquity: safe(bsDebt, bsEquity) ?? yh.debtToEquity ?? null,
      currentRatio: safe(bsCA, bsCL) ?? yh.currentRatio ?? null,
      quickRatio: bsCA != null && bsCL != null ? safe(bsCA - bsInv, bsCL) : yh.quickRatio ?? null,
      interestCoverage: null,
      dividendYield: marketCap && bsDiv ? safe(Math.abs(bsDiv), marketCap) : yh.dividendYield ?? null,
      payoutRatio: incNetIncome && bsDiv ? safe(Math.abs(bsDiv), incNetIncome) : null,
      fcfYield: incFcf && marketCap ? safe(incFcf, marketCap) : null,
      beta: yh.beta ?? null,
      diagnostics: {
        source: sourceLabel,
        period: periodLabel,
        fiscalYear: secFy,
        isTtm: usingTtm,
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
