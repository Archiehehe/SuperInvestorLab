import type { StockMetrics, InvestorEvaluation } from "./types";
import type { Investor } from "./investors";

const UA = "SuperInvestorLab/1.0";
const CACHE_PREFIX = "sil_cache_";
const CACHE_TTL = 1000 * 60 * 5;

async function fetchJson(url: string, timeoutMs = 8000): Promise<any | null> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: c.signal, headers: { "User-Agent": UA } });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null }
  finally { clearTimeout(t) }
}

async function fetchYahooChart(ticker: string) {
  const t = ticker.replace(/\./g, "-");
  const d = await fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t)}?range=1d&interval=1d`);
  const m = d?.chart?.result?.[0]?.meta;
  if (!m) return { price: null, name: null, exchange: null };
  return {
    price: typeof m.regularMarketPrice === "number" ? m.regularMarketPrice : null,
    name: m.longName ?? m.shortName ?? null,
    exchange: m.fullExchangeName ?? m.exchangeName ?? null,
  };
}

async function fetchYahooSummary(ticker: string) {
  const t = ticker.replace(/\./g, "-");
  const d = await fetchJson(
    `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(t)}?modules=defaultKeyStatistics%2CfinancialData%2CsummaryDetail`,
    10000
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
    eps: fd.earningsPerShare?.raw ?? ks.earningsPerShare?.raw ?? null,
    forwardEps: ks.forwardEps?.raw ?? null,
    sharesOut: ks.sharesOutstanding?.raw ?? null,
    bookValue: ks.bookValue?.raw ?? null,
    priceToBook: ks.priceToBook?.raw ?? fd.priceToBook?.raw ?? null,
    sector: sd.sector ?? fd.sector ?? null,
    industry: sd.industry ?? fd.industry ?? null,
    exchange: sd.fullExchangeName ?? fd.exchange ?? q.exchange ?? null,
  };
}

export async function fetchStockData(ticker: string): Promise<StockMetrics> {
  const [chart, summary] = await Promise.all([
    fetchYahooChart(ticker),
    fetchYahooSummary(ticker),
  ]);

  const yc = chart.price ? chart : null;
  const yh = summary ?? {};

  const price = yc?.price ?? yh.price ?? 0;
  if (!price) throw new Error(`No price data for ${ticker}`);

  const shares = yh.sharesOut ?? null;
  const equity = yh.bookValue != null && shares != null ? yh.bookValue * shares : null;
  const marketCap = shares && price ? Number((shares * price).toFixed(2)) : yh.marketCap ?? null;
  const pe = yh.eps && yh.eps > 0 ? Number((price / yh.eps).toFixed(2)) : null;

  return {
    ticker: ticker.toUpperCase(),
    companyName: yc?.name ?? yh.name ?? ticker,
    price,
    marketCap,
    sector: yh.sector ?? "N/A",
    industry: yh.industry ?? "N/A",
    exchange: yc?.exchange ?? yh.exchange ?? "N/A",
    logo: null,
    pe,
    forwardPe: yh.forwardPe ?? null,
    pb: yh.priceToBook ?? null,
    ps: yh.revenue && marketCap ? Number((marketCap / yh.revenue).toFixed(4)) : null,
    evToEbitda: null,
    evToRevenue: yh.revenue && yh.enterpriseValue ? Number((yh.enterpriseValue / yh.revenue).toFixed(4)) : null,
    pegRatio: yh.pegRatio ?? null,
    priceToFcf: null,
    earningsYield: pe && pe > 0 ? Number((1 / pe).toFixed(4)) : null,
    roe: yh.roe ?? null,
    roa: yh.roa ?? null,
    roic: null,
    grossMargin: yh.grossMargin ?? null,
    operatingMargin: yh.operatingMargin ?? null,
    netMargin: yh.netMargin ?? null,
    revenueGrowth: yh.revenueGrowth ?? null,
    epsGrowth: null,
    fcfGrowth: null,
    debtToEquity: yh.debtToEquity ?? null,
    currentRatio: yh.currentRatio ?? null,
    quickRatio: yh.quickRatio ?? null,
    interestCoverage: null,
    dividendYield: yh.dividendYield ?? null,
    payoutRatio: null,
    fcfYield: null,
    beta: yh.beta ?? null,
    diagnostics: {
      source: "Yahoo Finance",
      period: "TTM",
      fiscalYear: null,
      isTtm: true,
    },
  };
}

const SP500 = [
  { symbol: "AAPL", name: "Apple Inc.", sector: "Technology" },
  { symbol: "MSFT", name: "Microsoft Corporation", sector: "Technology" },
  { symbol: "NVDA", name: "NVIDIA Corporation", sector: "Technology" },
  { symbol: "AMZN", name: "Amazon.com Inc.", sector: "Consumer Cyclical" },
  { symbol: "META", name: "Meta Platforms Inc.", sector: "Technology" },
  { symbol: "GOOGL", name: "Alphabet Inc. Class A", sector: "Technology" },
  { symbol: "GOOG", name: "Alphabet Inc. Class C", sector: "Technology" },
  { symbol: "BRK.B", name: "Berkshire Hathaway Inc.", sector: "Financial Services" },
  { symbol: "LLY", name: "Eli Lilly and Company", sector: "Healthcare" },
  { symbol: "JPM", name: "JPMorgan Chase & Co.", sector: "Financial Services" },
  { symbol: "V", name: "Visa Inc.", sector: "Financial Services" },
  { symbol: "TSLA", name: "Tesla Inc.", sector: "Consumer Cyclical" },
  { symbol: "UNH", name: "UnitedHealth Group Inc.", sector: "Healthcare" },
  { symbol: "XOM", name: "Exxon Mobil Corporation", sector: "Energy" },
  { symbol: "MA", name: "Mastercard Inc.", sector: "Financial Services" },
  { symbol: "JNJ", name: "Johnson & Johnson", sector: "Healthcare" },
  { symbol: "PG", name: "Procter & Gamble Co.", sector: "Consumer Defensive" },
  { symbol: "COST", name: "Costco Wholesale Corporation", sector: "Consumer Defensive" },
  { symbol: "HD", name: "The Home Depot Inc.", sector: "Consumer Cyclical" },
  { symbol: "AVGO", name: "Broadcom Inc.", sector: "Technology" },
  { symbol: "MRK", name: "Merck & Co. Inc.", sector: "Healthcare" },
  { symbol: "ABBV", name: "AbbVie Inc.", sector: "Healthcare" },
  { symbol: "CVX", name: "Chevron Corporation", sector: "Energy" },
  { symbol: "KO", name: "The Coca-Cola Company", sector: "Consumer Defensive" },
  { symbol: "WMT", name: "Walmart Inc.", sector: "Consumer Defensive" },
  { symbol: "BAC", name: "Bank of America Corp.", sector: "Financial Services" },
  { symbol: "PEP", name: "PepsiCo Inc.", sector: "Consumer Defensive" },
  { symbol: "ORCL", name: "Oracle Corporation", sector: "Technology" },
  { symbol: "TMO", name: "Thermo Fisher Scientific Inc.", sector: "Healthcare" },
  { symbol: "MCD", name: "McDonald's Corporation", sector: "Consumer Cyclical" },
  { symbol: "CSCO", name: "Cisco Systems Inc.", sector: "Technology" },
  { symbol: "ABT", name: "Abbott Laboratories", sector: "Healthcare" },
  { symbol: "WFC", name: "Wells Fargo & Company", sector: "Financial Services" },
  { symbol: "IBM", name: "International Business Machines", sector: "Technology" },
  { symbol: "CAT", name: "Caterpillar Inc.", sector: "Industrials" },
  { symbol: "GE", name: "General Electric Company", sector: "Industrials" },
  { symbol: "MS", name: "Morgan Stanley", sector: "Financial Services" },
  { symbol: "GS", name: "Goldman Sachs Group Inc.", sector: "Financial Services" },
  { symbol: "RTX", name: "Raytheon Technologies Corp.", sector: "Industrials" },
  { symbol: "QCOM", name: "Qualcomm Inc.", sector: "Technology" },
  { symbol: "NEE", name: "NextEra Energy Inc.", sector: "Utilities" },
  { symbol: "T", name: "AT&T Inc.", sector: "Communication Services" },
  { symbol: "VZ", name: "Verizon Communications Inc.", sector: "Communication Services" },
  { symbol: "INTU", name: "Intuit Inc.", sector: "Technology" },
  { symbol: "NFLX", name: "Netflix Inc.", sector: "Communication Services" },
  { symbol: "SPGI", name: "S&P Global Inc.", sector: "Financial Services" },
  { symbol: "LIN", name: "Linde plc", sector: "Basic Materials" },
  { symbol: "TXN", name: "Texas Instruments Inc.", sector: "Technology" },
  { symbol: "AXP", name: "American Express Company", sector: "Financial Services" },
  { symbol: "NOW", name: "ServiceNow Inc.", sector: "Technology" },
  { symbol: "SYK", name: "Stryker Corporation", sector: "Healthcare" },
  { symbol: "HON", name: "Honeywell International Inc.", sector: "Industrials" },
  { symbol: "CRM", name: "Salesforce Inc.", sector: "Technology" },
  { symbol: "AMGN", name: "Amgen Inc.", sector: "Healthcare" },
  { symbol: "DHR", name: "Danaher Corporation", sector: "Healthcare" },
  { symbol: "BSX", name: "Boston Scientific Corporation", sector: "Healthcare" },
  { symbol: "ADP", name: "Automatic Data Processing Inc.", sector: "Technology" },
  { symbol: "AMD", name: "Advanced Micro Devices Inc.", sector: "Technology" },
  { symbol: "BLK", name: "BlackRock Inc.", sector: "Financial Services" },
  { symbol: "ISRG", name: "Intuitive Surgical Inc.", sector: "Healthcare" },
  { symbol: "CI", name: "Cigna Group", sector: "Healthcare" },
  { symbol: "GILD", name: "Gilead Sciences Inc.", sector: "Healthcare" },
  { symbol: "BKNG", name: "Booking Holdings Inc.", sector: "Consumer Cyclical" },
  { symbol: "TJX", name: "TJX Companies Inc.", sector: "Consumer Cyclical" },
  { symbol: "SHW", name: "The Sherwin-Williams Company", sector: "Basic Materials" },
  { symbol: "MMC", name: "Marsh & McLennan Companies Inc.", sector: "Financial Services" },
  { symbol: "C", name: "Citigroup Inc.", sector: "Financial Services" },
  { symbol: "PLD", name: "Prologis Inc.", sector: "Real Estate" },
  { symbol: "USB", name: "U.S. Bancorp", sector: "Financial Services" },
  { symbol: "SO", name: "Southern Company", sector: "Utilities" },
  { symbol: "DUK", name: "Duke Energy Corporation", sector: "Utilities" },
  { symbol: "CME", name: "CME Group Inc.", sector: "Financial Services" },
  { symbol: "ICE", name: "Intercontinental Exchange Inc.", sector: "Financial Services" },
  { symbol: "AON", name: "Aon plc", sector: "Financial Services" },
  { symbol: "PNC", name: "PNC Financial Services Group", sector: "Financial Services" },
  { symbol: "BMY", name: "Bristol-Myers Squibb Company", sector: "Healthcare" },
  { symbol: "TGT", name: "Target Corporation", sector: "Consumer Defensive" },
  { symbol: "DE", name: "Deere & Company", sector: "Industrials" },
  { symbol: "SCHW", name: "Charles Schwab Corporation", sector: "Financial Services" },
  { symbol: "FDX", name: "FedEx Corporation", sector: "Industrials" },
  { symbol: "UPS", name: "United Parcel Service Inc.", sector: "Industrials" },
  { symbol: "LRCX", name: "Lam Research Corporation", sector: "Technology" },
  { symbol: "KLAC", name: "KLA Corporation", sector: "Technology" },
  { symbol: "AMAT", name: "Applied Materials Inc.", sector: "Technology" },
  { symbol: "REGN", name: "Regeneron Pharmaceuticals Inc.", sector: "Healthcare" },
  { symbol: "MDLZ", name: "Mondelez International Inc.", sector: "Consumer Defensive" },
  { symbol: "CB", name: "Chubb Limited", sector: "Financial Services" },
  { symbol: "BDX", name: "Becton, Dickinson and Company", sector: "Healthcare" },
  { symbol: "EW", name: "Edwards Lifesciences Corporation", sector: "Healthcare" },
  { symbol: "MMM", name: "3M Company", sector: "Industrials" },
  { symbol: "APH", name: "Amphenol Corporation", sector: "Technology" },
  { symbol: "UBER", name: "Uber Technologies Inc.", sector: "Technology" },
  { symbol: "SBUX", name: "Starbucks Corporation", sector: "Consumer Cyclical" },
  { symbol: "MU", name: "Micron Technology Inc.", sector: "Technology" },
  { symbol: "LOW", name: "Lowe's Companies Inc.", sector: "Consumer Cyclical" },
  { symbol: "ETN", name: "Eaton Corporation plc", sector: "Industrials" },
  { symbol: "ZTS", name: "Zoetis Inc.", sector: "Healthcare" },
  { symbol: "VRTX", name: "Vertex Pharmaceuticals Inc.", sector: "Healthcare" },
  { symbol: "NKE", name: "Nike Inc.", sector: "Consumer Cyclical" },
  { symbol: "EQIX", name: "Equinix Inc.", sector: "Real Estate" },
  { symbol: "PANW", name: "Palo Alto Networks Inc.", sector: "Technology" },
  { symbol: "ITW", name: "Illinois Tool Works Inc.", sector: "Industrials" },
  { symbol: "PSA", name: "Public Storage", sector: "Real Estate" },
  { symbol: "COF", name: "Capital One Financial Corp.", sector: "Financial Services" },
  { symbol: "EMR", name: "Emerson Electric Co.", sector: "Industrials" },
  { symbol: "MO", name: "Altria Group Inc.", sector: "Consumer Defensive" },
  { symbol: "WM", name: "Waste Management Inc.", sector: "Industrials" },
  { symbol: "CDNS", name: "Cadence Design Systems Inc.", sector: "Technology" },
  { symbol: "SNPS", name: "Synopsys Inc.", sector: "Technology" },
  { symbol: "HCA", name: "HCA Healthcare Inc.", sector: "Healthcare" },
  { symbol: "AIG", name: "American International Group", sector: "Financial Services" },
  { symbol: "TFC", name: "Truist Financial Corporation", sector: "Financial Services" },
  { symbol: "ELV", name: "Elevance Health Inc.", sector: "Healthcare" },
  { symbol: "HUM", name: "Humana Inc.", sector: "Healthcare" },
  { symbol: "CVS", name: "CVS Health Corporation", sector: "Healthcare" },
  { symbol: "MCO", name: "Moody's Corporation", sector: "Financial Services" },
  { symbol: "APD", name: "Air Products and Chemicals Inc.", sector: "Basic Materials" },
  { symbol: "PH", name: "Parker-Hannifin Corporation", sector: "Industrials" },
  { symbol: "WELL", name: "Welltower Inc.", sector: "Real Estate" },
  { symbol: "NSC", name: "Norfolk Southern Corporation", sector: "Industrials" },
  { symbol: "CSX", name: "CSX Corporation", sector: "Industrials" },
  { symbol: "GD", name: "General Dynamics Corporation", sector: "Industrials" },
  { symbol: "LMT", name: "Lockheed Martin Corporation", sector: "Industrials" },
  { symbol: "NOC", name: "Northrop Grumman Corporation", sector: "Industrials" },
  { symbol: "BA", name: "Boeing Company", sector: "Industrials" },
  { symbol: "DIS", name: "The Walt Disney Company", sector: "Communication Services" },
  { symbol: "CMCSA", name: "Comcast Corporation", sector: "Communication Services" },
  { symbol: "EA", name: "Electronic Arts Inc.", sector: "Communication Services" },
  { symbol: "AMT", name: "American Tower Corporation", sector: "Real Estate" },
  { symbol: "CCI", name: "Crown Castle Inc.", sector: "Real Estate" },
  { symbol: "SPG", name: "Simon Property Group Inc.", sector: "Real Estate" },
  { symbol: "O", name: "Realty Income Corporation", sector: "Real Estate" },
  { symbol: "PLTR", name: "Palantir Technologies Inc.", sector: "Technology" },
  { symbol: "SNOW", name: "Snowflake Inc.", sector: "Technology" },
  { symbol: "DDOG", name: "Datadog Inc.", sector: "Technology" },
  { symbol: "CRWD", name: "CrowdStrike Holdings Inc.", sector: "Technology" },
  { symbol: "SNAP", name: "Snap Inc.", sector: "Communication Services" },
  { symbol: "RBLX", name: "Roblox Corporation", sector: "Technology" },
  { symbol: "DASH", name: "DoorDash Inc.", sector: "Consumer Cyclical" },
  { symbol: "ABNB", name: "Airbnb Inc.", sector: "Consumer Cyclical" },
  { symbol: "RIVN", name: "Rivian Automotive Inc.", sector: "Consumer Cyclical" },
  { symbol: "LCID", name: "Lucid Group Inc.", sector: "Consumer Cyclical" },
  { symbol: "COIN", name: "Coinbase Global Inc.", sector: "Financial Services" },
  { symbol: "PYPL", name: "PayPal Holdings Inc.", sector: "Financial Services" },
  { symbol: "SQ", name: "Block Inc.", sector: "Technology" },
  { symbol: "HOOD", name: "Robinhood Markets Inc.", sector: "Financial Services" },
  { symbol: "MSTR", name: "MicroStrategy Incorporated", sector: "Technology" },
  { symbol: "SMR", name: "NuScale Power Corporation", sector: "Industrials" },
  { symbol: "ASTS", name: "AST SpaceMobile Inc.", sector: "Technology" },
  { symbol: "IONQ", name: "IonQ Inc.", sector: "Technology" },
  { symbol: "RKLB", name: "Rocket Lab USA Inc.", sector: "Industrials" },
  { symbol: "SOFI", name: "SoFi Technologies Inc.", sector: "Financial Services" },
  { symbol: "AFRM", name: "Affirm Holdings Inc.", sector: "Financial Services" },
  { symbol: "UPST", name: "Upstart Holdings Inc.", sector: "Financial Services" },
  { symbol: "CVNA", name: "Carvana Co.", sector: "Consumer Cyclical" },
  { symbol: "CHWY", name: "Chewy Inc.", sector: "Consumer Cyclical" },
  { symbol: "NUVB", name: "Nuvation Bio Inc.", sector: "Healthcare" },
  { symbol: "CAVA", name: "CAVA Group Inc.", sector: "Consumer Cyclical" },
  { symbol: "ARM", name: "Arm Holdings plc", sector: "Technology" },
  { symbol: "TTD", name: "The Trade Desk Inc.", sector: "Technology" },
  { symbol: "NET", name: "Cloudflare Inc.", sector: "Technology" },
];

const YAHOO_SEARCH_UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" };

export async function searchTickers(query: string): Promise<Array<{ symbol: string; name: string; exchange?: string }>> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(cleanQuery)}&quotesCount=10&newsCount=0&lang=en-US&region=US`,
      { headers: YAHOO_SEARCH_UA, signal: AbortSignal.timeout(8000) }
    );
    const data = await r.json();
    const quotes = Array.isArray(data?.quotes) ? data.quotes : [];
    return quotes
      .filter((q: any) => q?.symbol && q?.quoteType === "EQUITY")
      .slice(0, 10)
      .map((q: any) => ({
        symbol: String(q.symbol).replace(/-/g, "."),
        name: q.shortname || q.longname || q.symbol,
        exchange: q.exchDisp || q.exchange || "US",
      }));
  } catch {
    const q = cleanQuery.toUpperCase();
    return SP500.filter(s => s.symbol.includes(q) || s.name.toUpperCase().includes(q)).slice(0, 10).map(s => ({ symbol: s.symbol, name: s.name, exchange: "US" }));
  }
}

export async function fetchSP500(): Promise<Array<{ symbol: string; name: string; sector: string }>> {
  return SP500;
}

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

function fallbackEvaluation(metrics: any, investor: Investor) {
  const checklist = [
    {
      criterion: "Valuation discipline",
      signal: metricSignal(metrics.pe, (n: number) => n > 0 && n <= 20, (n: number) => n > 0 && n <= 35),
      value: `P/E ${formatValue(metrics.pe)}, P/B ${formatValue(metrics.pb)}, P/S ${formatValue(metrics.ps)}`,
      explanation: "Compares current valuation multiples with conservative value-investing thresholds.",
    },
    {
      criterion: "Business quality",
      signal: metricSignal(metrics.roe, (n: number) => n >= 0.15, (n: number) => n >= 0.08),
      value: `ROE ${formatValue(metrics.roe, "percent")}, ROA ${formatValue(metrics.roa, "percent")}`,
      explanation: "Higher returns on equity and assets suggest stronger economics and capital efficiency.",
    },
    {
      criterion: "Cash generation",
      signal: metricSignal(metrics.fcfYield, (n: number) => n >= 0.05, (n: number) => n >= 0.02),
      value: `FCF yield ${formatValue(metrics.fcfYield, "percent")}, P/FCF ${formatValue(metrics.priceToFcf)}`,
      explanation: "Free cash flow is used as a practical proxy for owner earnings and downside support.",
    },
    {
      criterion: "Balance-sheet resilience",
      signal: metricSignal(metrics.debtToEquity, (n: number) => n <= 1, (n: number) => n <= 2.5),
      value: `Debt/equity ${formatValue(metrics.debtToEquity)}, current ratio ${formatValue(metrics.currentRatio)}`,
      explanation: "Lower leverage and adequate liquidity reduce financial fragility.",
    },
    {
      criterion: "Growth profile",
      signal: metricSignal(metrics.revenueGrowth ?? metrics.epsGrowth, (n: number) => n >= 0.08, (n: number) => n >= 0),
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
    overallSignal: compatibilityScore >= 70 ? "pass" : compatibilityScore >= 40 ? "warn" : "fail" as const,
    overallComment: `Rules-based ${investor.name} compatibility screen.`,
    compatibilityScore,
    checklist,
    passCount,
    warnCount,
    failCount,
  };
}

export async function evaluateStock(metrics: StockMetrics, investors: Investor[]): Promise<InvestorEvaluation[]> {
  return investors.map(inv => fallbackEvaluation(metrics, inv));
}

export function getCachedResult(key: string): any | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (Date.now() - new Date(cached.timestamp).getTime() > CACHE_TTL) {
      localStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    return cached;
  } catch { return null }
}

export function setCachedResult(key: string, result: any): void {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(result));
  } catch {}
}

export function clearResultCache(key?: string): void {
  if (key) {
    localStorage.removeItem(CACHE_PREFIX + key);
  } else {
    Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX)).forEach(k => localStorage.removeItem(k));
  }
}
