export const config = { runtime: 'edge' }

const YAHOO_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
const FINNHUB_KEY = process.env.FINNHUB_KEY || ''
const ALPHA_KEY = process.env.ALPHA_VANTAGE_KEY || ''
const FMP_KEY = process.env.FMP_KEY || ''
const TWELVE_KEY = process.env.TWELVE_KEY || ''

async function jsonFetch(url: string, timeoutMs = 6000, extra?: Record<string, string>) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: extra })
    if (!res.ok) return null
    return res.json()
  } catch { return null }
}

/* ─── Yahoo ─── */
async function yahooChart(t: string) {
  const d = await jsonFetch(`https://query1.finance.yahoo.com/v8/finance/chart/${t}?range=1d&interval=1d`, 4000, { 'User-Agent': YAHOO_UA })
  const m = d?.chart?.result?.[0]?.meta
  return m ? { price: m.regularMarketPrice ?? null, name: m.longName ?? m.shortName ?? null, exchange: m.fullExchangeName ?? null, marketCap: m.marketCap ?? null } : null
}
async function yahooSummary(t: string) {
  const d = await jsonFetch(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${t}?modules=defaultKeyStatistics%2CfinancialData%2CsummaryDetail`, 4000, { 'User-Agent': YAHOO_UA })
  const q = d?.quoteSummary?.result?.[0]
  if (!q) return null
  const ks = q.defaultKeyStatistics ?? {}, fd = q.financialData ?? {}, sd = q.summaryDetail ?? {}
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
    industry: sd.industry ?? fd.industry ?? null,
  }
}

/* ─── Finnhub ─── */
async function finnhub(t: string) {
  const [profile, quote, metric] = await Promise.all([
    jsonFetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${t}&token=${FINNHUB_KEY}`),
    jsonFetch(`https://finnhub.io/api/v1/quote?symbol=${t}&token=${FINNHUB_KEY}`),
    jsonFetch(`https://finnhub.io/api/v1/stock/metric?symbol=${t}&metric=all&token=${FINNHUB_KEY}`),
  ])
  const m = metric?.metric ?? {}
  return { profile, quote, metric: m }
}

/* ─── FMP ─── */
async function fmp(t: string) {
  if (!FMP_KEY) return {}
  const [profile, ratios] = await Promise.all([
    jsonFetch(`https://financialmodelingprep.com/stable/profile?symbol=${t}&apikey=${FMP_KEY}`, 6000),
    jsonFetch(`https://financialmodelingprep.com/stable/ratios?symbol=${t}&apikey=${FMP_KEY}&limit=1`, 6000),
  ])
  const p = Array.isArray(profile) ? profile[0] : null
  const r = Array.isArray(ratios) ? ratios[0] : null
  return { profile: p, ratios: r }
}

/* ─── Alpha Vantage ─── */
async function alphaV(t: string) {
  if (!ALPHA_KEY) return null
  const d = await jsonFetch(`https://www.alphavantage.co/query?function=OVERVIEW&symbol=${t}&apikey=${ALPHA_KEY}`, 10000)
  return d?.Symbol ? d : null
}

/* ─── Twelve Data ─── */
async function twelveData(t: string) {
  if (!TWELVE_KEY) return null
  const d = await jsonFetch(`https://api.twelvedata.com/quote?symbol=${t}&apikey=${TWELVE_KEY}`)
  if (!d || d.status === 'error') return null
  return { price: parseFloat(d.close) || null, name: d.name || null, exchange: d.exchange || null }
}

/* ─── SEC EDGAR (no key) ─── */
async function secEdgar(t: string) {
  const tickers = await jsonFetch('https://data.sec.gov/files/company_tickers.json', 8000, { 'User-Agent': 'SuperInvestorLab/1.0 (archie@example.com)' })
  if (!tickers) return null
  let cik: string | null = null
  for (const [, v] of Object.entries(tickers)) {
    const entry = v as any
    if (entry.ticker?.toUpperCase() === t) { cik = String(entry.cik_str).padStart(10, '0'); break }
  }
  if (!cik) return null
  const facts = await jsonFetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, 10000, { 'User-Agent': 'SuperInvestorLab/1.0 (archie@example.com)' })
  const gaap = facts?.facts?.usDollarBasedReporting?.gaap
  if (!gaap) return null
  const getVal = (key: string) => gaap[key]?.units?.USD?.[0]?.val ?? null
  const opCF = getVal('NetCashProvidedByOperatingActivities') ?? getVal('OperatingIncomeLoss')
  const capEx = getVal('CapitalExpenditureIncurredButNotYetPaid') ?? getVal('PaymentsToAcquirePropertyPlantAndEquipment')
  const fcf = opCF != null && capEx != null ? opCF + capEx : null // capEx is negative in SEC
  const rev = getVal('RevenueFromContractWithCustomerExcludingAssessedTax') ?? getVal('Revenues')
  const ni = getVal('NetIncomeLoss')
  const eq = getVal('StockholdersEquity')
  const assets = getVal('Assets')
  const currAssets = getVal('AssetsCurrent')
  const currLiab = getVal('LiabilitiesCurrent')
  const debt = getVal('LongTermDebtNoncurrent') ?? getVal('DebtLongtermAndCapitalLeaseObligations')
  return { fcf, revenue: rev, netIncome: ni, equity: eq, assets, currentAssets: currAssets, currentLiabilities: currLiab, longTermDebt: debt }
}

/* ─── helpers ─── */
const pct = (v: number | null | undefined) => v != null && !isNaN(v) ? v / 100 : null

function fill<T>(...vals: (T | null | undefined)[]): T | null {
  for (const v of vals) { if (v != null && v !== '' && !(typeof v === 'number' && isNaN(v))) return v as T }
  return null
}

/* ─── handler ─── */
export default async function handler(req: Request) {
  const url = new URL(req.url)
  const ticker = url.searchParams.get('ticker')?.toUpperCase()
  if (!ticker) {
    return new Response(JSON.stringify({ error: 'Ticker required' }), { status: 400, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } })
  }

  const [ych, ysum, fh, fmpData, av, td] = await Promise.all([
    yahooChart(ticker), yahooSummary(ticker),
    finnhub(ticker),
    fmp(ticker),
    alphaV(ticker),
    twelveData(ticker),
  ])

  // SEC EDGAR runs last and slower; only if we still need FCF fields
  const sec = await secEdgar(ticker)

  const yc = ych, ys = ysum ?? {}, fm = fh.metric ?? {}, fhQ = fh.quote, fhP = fh.profile
  const fmpP = fmpData.profile, fmpR = fmpData.ratios

  const price = fill(yc?.price, fhQ?.c, fmpP?.price, td?.price, fmpP?.priceAvg, av?.AnalystTargetPrice ? parseFloat(av.AnalystTargetPrice) : null) ?? null
  const shares = fill(ys.sharesOut, fm.sharesOutstanding, fmpP?.sharesOutstanding, av?.SharesOutstanding ? parseInt(av.SharesOutstanding) : null) ?? null
  const marketCap = fill(ys.marketCap, fhP?.marketCapitalization, fmpP?.marketCap, shares && price ? shares * price : null, av?.MarketCapitalization ? parseFloat(av.MarketCapitalization) : null, yc?.marketCap) ?? null

  // Compute PE from price/eps if possible, else use pre-computed PE from any source
  const epsVal = fill(ys.eps, fm.epsTTM, fmpR?.netIncomePerShare, av?.EPS ? parseFloat(av.EPS) : null, sec?.netIncome && shares ? sec.netIncome / shares : null) ?? null
  const pe = fill(epsVal && epsVal > 0 && price ? price / epsVal : null, fm.peTTM, fmpR?.priceToEarningsRatio, av?.PERatio ? parseFloat(av.PERatio) : null) ?? null

  // Compute PS from revenue/marketCap
  const rev = fill(ys.revenue, fmpP?.revenue, fm.revenue, av?.RevenueTTM ? parseFloat(av.RevenueTTM) : null, sec?.revenue) ?? null
  const psComp = rev && marketCap && rev > 0 ? marketCap / rev : null

  // SEC derived metrics
  const secEq = sec?.equity ?? null
  const secDte = sec?.longTermDebt != null && secEq != null && secEq > 0 ? sec.longTermDebt / secEq : null
  const secCr = sec?.currentAssets != null && sec?.currentLiabilities != null && sec.currentLiabilities > 0 ? sec.currentAssets / sec.currentLiabilities : null

  const body = {
    ticker,
    companyName: fill(yc?.name, fhP?.name, fmpP?.companyName, td?.name, av?.Name) ?? ticker,
    price,
    marketCap: marketCap ?? null,
    sector: fill(ys.sector, fhP?.finnhubIndustry, fmpP?.sector, av?.Sector) ?? null,
    industry: fill(ys.industry, fmpP?.industry, av?.Industry) ?? null,
    exchange: fill(yc?.exchange, fhP?.exchange, td?.exchange, fmpP?.exchange, av?.Exchange) ?? null,
    logo: null,

    pe,
    forwardPe: fill(ys.forwardPe, fm.forwardPE, av?.ForwardPE ? parseFloat(av.ForwardPE) : null) ?? null,
    pb: fill(ys.priceToBook, fm.priceBookTTM, fmpR?.priceToBookRatio, av?.PriceToBookRatio ? parseFloat(av.PriceToBookRatio) : null) ?? null,
    ps: fill(fm.priceSalesTTM, fmpR?.priceToSalesRatio, av?.PriceToSalesRatioTTM ? parseFloat(av.PriceToSalesRatioTTM) : null, psComp) ?? null,
    evToEbitda: fill(fm.evEBITDATTM, fmpR?.enterpriseValueMultiple, av?.EVToEBITDA ? parseFloat(av.EVToEBITDA) : null) ?? null,
    evToRevenue: fill(fm.evRevenueTTM, fmpP?.evToRevenue) ?? null,
    pegRatio: fill(ys.pegRatio, fm.pegRatio, fmpR?.priceToEarningsGrowthRatio, av?.PEGRatio ? parseFloat(av.PEGRatio) : null) ?? null,
    priceToFcf: fill(fmpR?.priceToFreeCashFlowRatio, null) ?? null,
    earningsYield: pe && pe > 0 ? Number((1 / pe).toFixed(4)) : null,

    roe: fill(pct(ys.roe), pct(fm.roeTTM), fmpR?.returnOnEquity, av?.ReturnOnEquityTTM ? parseFloat(av.ReturnOnEquityTTM) : null, sec?.netIncome && secEq && secEq > 0 ? sec.netIncome / secEq : null) ?? null,
    roa: fill(pct(ys.roa), pct(fm.returnOnAssetsTTM), fmpR?.returnOnAssets, av?.ReturnOnAssetsTTM ? parseFloat(av.ReturnOnAssetsTTM) : null) ?? null,
    roic: fill(fmpR?.returnOnCapitalEmployed, av?.ReturnOnCapitalEmployed ? parseFloat(av.ReturnOnCapitalEmployed) : null) ?? null,
    grossMargin: fill(pct(ys.grossMargin), pct(fm.grossMarginTTM), fmpR?.grossProfitMargin, av?.GrossProfitTTM && av?.RevenueTTM ? parseFloat(av.GrossProfitTTM) / parseFloat(av.RevenueTTM) : null) ?? null,
    operatingMargin: fill(pct(ys.operatingMargin), pct(fm.operatingMarginTTM), fmpR?.operatingProfitMargin, av?.OperatingMarginTTM ? parseFloat(av.OperatingMarginTTM) : null) ?? null,
    netMargin: fill(pct(ys.netMargin), pct(fm.netProfitMarginTTM), fmpR?.netProfitMargin, av?.ProfitMargin ? parseFloat(av.ProfitMargin) : null) ?? null,
    revenueGrowth: fill(pct(ys.revenueGrowth), pct(fm.revenueGrowthTTM), av?.QuarterlyRevenueGrowthYOY ? parseFloat(av.QuarterlyRevenueGrowthYOY) : null) ?? null,
    epsGrowth: fill(av?.QuarterlyEarningsGrowthYOY ? parseFloat(av.QuarterlyEarningsGrowthYOY) : null) ?? null,
    fcfGrowth: fill(fmpR?.freeCashFlowGrowth, null) ?? null,

    debtToEquity: fill(fmpR?.debtToEquityRatio, fm.debtToEquityTTM, ys.debtToEquity, av?.DebtToEquityTTM ? parseFloat(av.DebtToEquityTTM) : null, secDte) ?? null,
    currentRatio: fill(fmpR?.currentRatio, fm.currentRatioTTM, ys.currentRatio, av?.CurrentRatioTTM ? parseFloat(av.CurrentRatioTTM) : null, secCr) ?? null,
    quickRatio: fill(fmpR?.quickRatio, fm.quickRatioTTM, ys.quickRatio, av?.QuickRatioTTM ? parseFloat(av.QuickRatioTTM) : null) ?? null,
    interestCoverage: fill(fmpR?.interestCoverageRatio, av?.InterestCoverage ? parseFloat(av.InterestCoverage) : null) ?? null,
    dividendYield: fill(pct(ys.dividendYield), pct(fm.dividendYieldIndicatedAnnual), fmpR?.dividendYield, av?.DividendYield ? parseFloat(av.DividendYield) : null) ?? null,
    payoutRatio: fill(fmpR?.dividendPayoutRatio, av?.PayoutRatio ? parseFloat(av.PayoutRatio) : null) ?? null,
    fcfYield: fill(marketCap && sec?.fcf && sec.fcf !== 0 ? sec.fcf / marketCap : null) ?? null,

    beta: fill(ys.beta, fm.beta, fmpP?.beta, av?.Beta ? parseFloat(av.Beta) : null) ?? null,
    diagnostics: { source: yc || ysum ? 'Yahoo Finance' : fhP ? 'Finnhub' : fmpP ? 'FMP' : 'Multiple', period: 'TTM', fiscalYear: null, isTtm: true },
  }

  const corsHeaders = { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'no-cache, no-store, must-revalidate' }
  if (!body.price && !body.marketCap && !body.pe) {
    return new Response(JSON.stringify({ error: 'No data found for ticker' }), { status: 404, headers: corsHeaders })
  }
  return new Response(JSON.stringify(body), { headers: corsHeaders })
}
