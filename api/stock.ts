export const config = { runtime: 'edge' }

const FINNHUB_KEY = process.env.FINNHUB_KEY || ''

async function jsonFetch(url: string, timeoutMs = 8000) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) return null
    return res.json()
  } catch { return null }
}

const pct = (v: number | null | undefined) => v != null && !isNaN(v) ? v / 100 : null

export default async function handler(req: Request) {
  const url = new URL(req.url)
  const ticker = url.searchParams.get('ticker')?.toUpperCase()
  if (!ticker) {
    return new Response(JSON.stringify({ error: 'Ticker required' }), { status: 400, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } })
  }

  const [profile, quoteData, metricsData] = await Promise.all([
    jsonFetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}&token=${FINNHUB_KEY}`),
    jsonFetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FINNHUB_KEY}`),
    jsonFetch(`https://finnhub.io/api/v1/stock/metric?symbol=${ticker}&metric=all&token=${FINNHUB_KEY}`),
  ])

  if (!profile && !quoteData && !metricsData) {
    return new Response(JSON.stringify({ error: 'No data found for ticker' }), { status: 404, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } })
  }

  const metric = metricsData?.metric ?? {}
  const price = quoteData?.c ?? null
  const pe = metric.peTTM ?? null
  const shares = metric.sharesOutstanding ?? null
  const marketCap = profile?.marketCapitalization ?? (shares && price ? shares * price : null)

  const stockMetrics = {
    ticker,
    companyName: profile?.name ?? ticker,
    price,
    marketCap: marketCap ?? null,
    sector: profile?.finnhubIndustry ?? null,
    industry: null,
    exchange: profile?.exchange ?? null,
    logo: profile?.logo ?? null,
    pe,
    forwardPe: metric.forwardPE ?? null,
    pb: metric.priceBookTTM ?? null,
    ps: metric.priceSalesTTM ?? null,
    evToEbitda: metric.evEBITDATTM ?? null,
    evToRevenue: metric.evRevenueTTM ?? null,
    pegRatio: metric.pegRatio ?? null,
    priceToFcf: metric.salesPerShareTTM ?? null,
    earningsYield: pe && pe > 0 ? Number((1 / pe).toFixed(4)) : null,
    roe: pct(metric.roeTTM),
    roa: pct(metric.returnOnAssetsTTM),
    roic: null,
    grossMargin: pct(metric.grossMarginTTM),
    operatingMargin: pct(metric.operatingMarginTTM),
    netMargin: pct(metric.netProfitMarginTTM),
    revenueGrowth: pct(metric.revenueGrowthTTM),
    epsGrowth: null,
    fcfGrowth: null,
    debtToEquity: metric.debtToEquityTTM ?? null,
    currentRatio: metric.currentRatioTTM ?? null,
    quickRatio: metric.quickRatioTTM ?? null,
    interestCoverage: null,
    dividendYield: pct(metric.dividendYieldIndicatedAnnual),
    payoutRatio: null,
    fcfYield: pct(metric.freeCashFlowYieldTTM),
    beta: metric.beta ?? null,
    diagnostics: { source: 'Finnhub', period: 'TTM', fiscalYear: null, isTtm: true },
  }

  return new Response(JSON.stringify(stockMetrics), {
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=120' },
  })
}
