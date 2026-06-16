export const config = { runtime: 'edge' }

const YAHOO_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
const FINNHUB_KEY = process.env.FINNHUB_KEY || ''
const ALPHA_KEY = process.env.ALPHA_VANTAGE_KEY || ''

async function jsonFetch(url: string, timeoutMs = 6000, headers?: Record<string, string>) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers })
    if (!res.ok) return null
    return res.json()
  } catch { return null }
}

async function yahooChart(ticker: string) {
  const d = await jsonFetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=1d&interval=1d`, 4000, { 'User-Agent': YAHOO_UA })
  const m = d?.chart?.result?.[0]?.meta
  if (!m) return null
  return { price: m.regularMarketPrice ?? null, name: m.longName ?? m.shortName ?? null, exchange: m.fullExchangeName ?? null, marketCap: m.marketCap ?? null }
}

async function yahooSummary(ticker: string) {
  const d = await jsonFetch(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=defaultKeyStatistics%2CfinancialData%2CsummaryDetail`, 4000, { 'User-Agent': YAHOO_UA })
  const q = d?.quoteSummary?.result?.[0]
  if (!q) return null
  const ks = q.defaultKeyStatistics ?? {}
  const fd = q.financialData ?? {}
  const sd = q.summaryDetail ?? {}
  return {
    beta: ks.beta?.raw ?? null, forwardPe: ks.forwardPE?.raw ?? null, pegRatio: ks.pegRatio?.raw ?? null,
    marketCap: fd.marketCap?.raw ?? ks.marketCap?.raw ?? null, enterpriseValue: fd.enterpriseValue?.raw ?? null,
    revenue: fd.totalRevenue?.raw ?? null, revenueGrowth: fd.revenueGrowth?.raw ?? null,
    grossMargin: fd.grossMargins?.raw ?? null, operatingMargin: fd.operatingMargins?.raw ?? null,
    netMargin: fd.profitMargins?.raw ?? null, roe: fd.returnOnEquity?.raw ?? null, roa: fd.returnOnAssets?.raw ?? null,
    debtToEquity: fd.debtToEquity?.raw ?? sd.debtToEquity?.raw ?? null,
    currentRatio: fd.currentRatio?.raw ?? sd.currentRatio?.raw ?? null, quickRatio: fd.quickRatio?.raw ?? sd.quickRatio?.raw ?? null,
    dividendYield: sd.dividendYield?.raw ?? fd.dividendYield?.raw ?? null, eps: fd.earningsPerShare?.raw ?? ks.earningsPerShare?.raw ?? null,
    sharesOut: ks.sharesOutstanding?.raw ?? null, bookValue: ks.bookValue?.raw ?? null,
    priceToBook: ks.priceToBook?.raw ?? fd.priceToBook?.raw ?? null, sector: sd.sector ?? fd.sector ?? null,
    industry: sd.industry ?? fd.industry ?? null, exchange: sd.fullExchangeName ?? null,
  }
}

const pct = (v: number | null | undefined) => v != null && !isNaN(v) ? v / 100 : null

function fill<T>(...vals: (T | null | undefined)[]): T | null {
  for (const v of vals) { if (v != null && v !== '' && !(typeof v === 'number' && isNaN(v))) return v as T }
  return null
}

export default async function handler(req: Request) {
  const url = new URL(req.url)
  const ticker = url.searchParams.get('ticker')?.toUpperCase()
  if (!ticker) {
    return new Response(JSON.stringify({ error: 'Ticker required' }), { status: 400, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } })
  }

  const [yhChart, yhSum, fhProfile, fhQuote, fhMetric, avData] = await Promise.all([
    yahooChart(ticker), yahooSummary(ticker),
    jsonFetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}&token=${FINNHUB_KEY}`),
    jsonFetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FINNHUB_KEY}`),
    jsonFetch(`https://finnhub.io/api/v1/stock/metric?symbol=${ticker}&metric=all&token=${FINNHUB_KEY}`),
    ALPHA_KEY ? jsonFetch(`https://www.alphavantage.co/query?function=OVERVIEW&symbol=${ticker}&apikey=${ALPHA_KEY}`, 10000) : null,
  ])

  const av = avData?.Symbol ? avData : null
  const fm = fhMetric?.metric ?? {}
  const yc = yhChart
  const ys = yhSum ?? {}

  const price = fill(yc?.price, fhQuote?.c, av ? parseFloat(av.AnalystTargetPrice) : null) ?? null
  const shares = fill(ys.sharesOut, fm.sharesOutstanding, av ? parseInt(av.SharesOutstanding) : null) ?? null
  const marketCap = fill(ys.marketCap, yc?.marketCap, fhProfile?.marketCapitalization, shares && price ? shares * price : null, av ? parseFloat(av.MarketCapitalization) : null) ?? null
  const pe = fill(ys.eps && ys.eps > 0 && price ? price / ys.eps : null, fm.peTTM, av ? parseFloat(av.PERatio) : null) ?? null
  const beta = fill(ys.beta, fm.beta, av ? parseFloat(av.Beta) : null) ?? null

  const stockMetrics = {
    ticker,
    companyName: fill(yc?.name, ys.sector ? null : null, fhProfile?.name, av?.Name) ?? ticker,
    price,
    marketCap: marketCap ?? null,
    sector: fill(ys.sector, fhProfile?.finnhubIndustry, av?.Sector) ?? null,
    industry: fill(ys.industry, av?.Industry) ?? null,
    exchange: fill(yc?.exchange ?? ys.exchange, fhProfile?.exchange, av?.Exchange) ?? null,
    logo: null,
    pe,
    forwardPe: fill(ys.forwardPe, fm.forwardPE, av ? parseFloat(av.ForwardPE) : null) ?? null,
    pb: fill(ys.priceToBook, fm.priceBookTTM, av ? parseFloat(av.PriceToBookRatio) : null) ?? null,
    ps: fill(ys.revenue && marketCap && ys.revenue > 0 ? marketCap / ys.revenue : null, fm.priceSalesTTM, av ? parseFloat(av.PriceToSalesRatioTTM) : null) ?? null,
    evToEbitda: fill(fm.evEBITDATTM, av ? parseFloat(av.EVToEBITDA) : null) ?? null,
    evToRevenue: fill(fm.evRevenueTTM, null) ?? null,
    pegRatio: fill(ys.pegRatio, fm.pegRatio, av ? parseFloat(av.PEGRatio) : null) ?? null,
    priceToFcf: null,
    earningsYield: pe && pe > 0 ? Number((1 / pe).toFixed(4)) : null,
    roe: fill(pct(ys.roe), pct(fm.roeTTM), av ? pct(parseFloat(av.ReturnOnEquityTTM)) : null) ?? null,
    roa: fill(pct(ys.roa), pct(fm.returnOnAssetsTTM), av ? pct(parseFloat(av.ReturnOnAssetsTTM)) : null) ?? null,
    roic: av ? pct(parseFloat(av.ReturnOnCapitalEmployed)) : null,
    grossMargin: fill(pct(ys.grossMargin), pct(fm.grossMarginTTM), av ? pct(parseFloat(av.GrossProfitTTM) / parseFloat(av.RevenueTTM)) : null) ?? null,
    operatingMargin: fill(pct(ys.operatingMargin), pct(fm.operatingMarginTTM), av ? pct(parseFloat(av.OperatingMarginTTM)) : null) ?? null,
    netMargin: fill(pct(ys.netMargin), pct(fm.netProfitMarginTTM), av ? pct(parseFloat(av.ProfitMargin)) : null) ?? null,
    revenueGrowth: fill(pct(ys.revenueGrowth), pct(fm.revenueGrowthTTM), av ? pct(parseFloat(av.RevenueGrowth)) : null) ?? null,
    epsGrowth: av ? pct(parseFloat(av.EPSGrowth)) : null,
    fcfGrowth: null,
    debtToEquity: fill(ys.debtToEquity, fm.debtToEquityTTM, av ? parseFloat(av.DebtToEquityTTM) : null) ?? null,
    currentRatio: fill(ys.currentRatio, fm.currentRatioTTM, av ? parseFloat(av.CurrentRatioTTM) : null) ?? null,
    quickRatio: fill(ys.quickRatio, fm.quickRatioTTM, av ? parseFloat(av.QuickRatioTTM) : null) ?? null,
    interestCoverage: av ? parseFloat(av.InterestCoverage) : null,
    dividendYield: fill(pct(ys.dividendYield), pct(fm.dividendYieldIndicatedAnnual), av ? pct(parseFloat(av.DividendYield)) : null) ?? null,
    payoutRatio: av ? pct(parseFloat(av.PayoutRatio)) : null,
    fcfYield: pct(fm.freeCashFlowYieldTTM) ?? null,
    beta,
    diagnostics: { source: yhChart || yhSum ? 'Yahoo Finance' : 'Finnhub', period: 'TTM', fiscalYear: null, isTtm: true },
  }

  const corsHeaders = { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'no-cache, no-store, must-revalidate' }

  if (!price && !marketCap && !pe) {
    return new Response(JSON.stringify({ error: 'No data found for ticker' }), { status: 404, headers: corsHeaders })
  }

  return new Response(JSON.stringify(stockMetrics), { headers: corsHeaders })
}
