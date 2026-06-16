export const config = { runtime: 'edge' }

const FINNHUB_KEY = process.env.FINNHUB_KEY || ''
const ALPHA_KEY = process.env.ALPHA_VANTAGE_KEY || ''

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

  const [profile, quoteData, metricsData, avData] = await Promise.all([
    jsonFetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}&token=${FINNHUB_KEY}`),
    jsonFetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FINNHUB_KEY}`),
    jsonFetch(`https://finnhub.io/api/v1/stock/metric?symbol=${ticker}&metric=all&token=${FINNHUB_KEY}`),
    ALPHA_KEY ? jsonFetch(`https://www.alphavantage.co/query?function=OVERVIEW&symbol=${ticker}&apikey=${ALPHA_KEY}`, 10000) : null,
  ])

  if (!profile && !quoteData && !metricsData && !avData) {
    return new Response(JSON.stringify({ error: 'No data found for ticker' }), { status: 404, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } })
  }

  const av = avData?.Symbol ? avData : null
  const metric = metricsData?.metric ?? {}
  const price = quoteData?.c ?? (av ? parseFloat(av.AnalystTargetPrice) : null) ?? null
  const pe = metric.peTTM ?? (av ? parseFloat(av.PERatio) : null) ?? null
  const shares = metric.sharesOutstanding ?? (av ? parseInt(av.SharesOutstanding) : null) ?? null
  const marketCap = profile?.marketCapitalization ?? (shares && price ? shares * price : null) ?? (av ? parseFloat(av.MarketCapitalization) : null) ?? null

  const stockMetrics = {
    ticker,
    companyName: profile?.name ?? av?.Name ?? ticker,
    price,
    marketCap: marketCap ?? null,
    sector: profile?.finnhubIndustry ?? av?.Sector ?? null,
    industry: av?.Industry ?? null,
    exchange: profile?.exchange ?? av?.Exchange ?? null,
    logo: null,
    pe,
    forwardPe: metric.forwardPE ?? (av ? parseFloat(av.ForwardPE) : null) ?? null,
    pb: metric.priceBookTTM ?? (av ? parseFloat(av.PriceToBookRatio) : null) ?? null,
    ps: metric.priceSalesTTM ?? (av ? parseFloat(av.PriceToSalesRatioTTM) : null) ?? null,
    evToEbitda: metric.evEBITDATTM ?? (av ? parseFloat(av.EVToEBITDA) : null) ?? null,
    evToRevenue: metric.evRevenueTTM ?? null,
    pegRatio: metric.pegRatio ?? (av ? parseFloat(av.PEGRatio) : null) ?? null,
    priceToFcf: null,
    earningsYield: pe && pe > 0 ? Number((1 / pe).toFixed(4)) : null,
    roe: pct(metric.roeTTM) ?? (av ? pct(parseFloat(av.ReturnOnEquityTTM)) : null) ?? null,
    roa: pct(metric.returnOnAssetsTTM) ?? (av ? pct(parseFloat(av.ReturnOnAssetsTTM)) : null) ?? null,
    roic: av ? pct(parseFloat(av.ReturnOnCapitalEmployed)) : null,
    grossMargin: pct(metric.grossMarginTTM) ?? (av ? pct(parseFloat(av.GrossProfitTTM) / parseFloat(av.RevenueTTM)) : null) ?? null,
    operatingMargin: pct(metric.operatingMarginTTM) ?? (av ? pct(parseFloat(av.OperatingMarginTTM)) : null) ?? null,
    netMargin: pct(metric.netProfitMarginTTM) ?? (av ? pct(parseFloat(av.ProfitMargin)) : null) ?? null,
    revenueGrowth: pct(metric.revenueGrowthTTM) ?? (av ? pct(parseFloat(av.RevenueGrowth)) : null) ?? null,
    epsGrowth: av ? pct(parseFloat(av.EPSGrowth)) : null,
    fcfGrowth: null,
    debtToEquity: metric.debtToEquityTTM ?? (av ? parseFloat(av.DebtToEquityTTM) : null) ?? null,
    currentRatio: metric.currentRatioTTM ?? (av ? parseFloat(av.CurrentRatioTTM) : null) ?? null,
    quickRatio: metric.quickRatioTTM ?? (av ? parseFloat(av.QuickRatioTTM) : null) ?? null,
    interestCoverage: av ? parseFloat(av.InterestCoverage) : null,
    dividendYield: pct(metric.dividendYieldIndicatedAnnual) ?? (av ? pct(parseFloat(av.DividendYield)) : null) ?? null,
    payoutRatio: av ? pct(parseFloat(av.PayoutRatio)) : null,
    fcfYield: pct(metric.freeCashFlowYieldTTM) ?? null,
    beta: metric.beta ?? (av ? parseFloat(av.Beta) : null) ?? null,
    diagnostics: { source: metricsData ? 'Finnhub' : 'Alpha Vantage', period: 'TTM', fiscalYear: null, isTtm: true },
  }

  return new Response(JSON.stringify(stockMetrics), {
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=120' },
  })
}
