import type { StockMetrics } from "@/lib/types";
import { formatMetricValue } from "@/lib/formatters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Info } from "lucide-react";

interface MetricsGridProps {
  metrics: StockMetrics;
}

const METRIC_DEFINITIONS: Record<string, string> = {
  pe: "Price-to-Earnings ratio: stock price divided by earnings per share. Lower values may indicate undervaluation.",
  forwardPe: "Forward P/E: based on estimated future earnings. Compares current price to projected earnings.",
  pb: "Price-to-Book: market price vs book value per share. Below 1.0 may indicate undervaluation.",
  ps: "Price-to-Sales: market cap divided by total revenue. Useful for unprofitable companies.",
  evToEbitda: "Enterprise Value / EBITDA: measures total company value relative to operating cash earnings.",
  evToRevenue: "Enterprise Value / Revenue: total company value relative to sales.",
  pegRatio: "Price/Earnings to Growth: P/E divided by earnings growth rate. Below 1.0 often considered attractive.",
  priceToFcf: "Price to Free Cash Flow: how much you pay per dollar of cash the business generates.",
  earningsYield: "Earnings Yield: inverse of P/E (EPS / Price). Higher is better for value investors.",
  roe: "Return on Equity: net income as a percentage of shareholders' equity. Measures profitability.",
  roa: "Return on Assets: net income divided by total assets. Measures asset efficiency.",
  roic: "Return on Invested Capital: measures how well capital is deployed. Above WACC indicates value creation.",
  grossMargin: "Gross Margin: revenue minus cost of goods sold, as a percentage. Indicates pricing power.",
  operatingMargin: "Operating Margin: operating income as a percentage of revenue. Measures core profitability.",
  netMargin: "Net Margin: net income as a percentage of revenue. Bottom-line profitability.",
  revenueGrowth: "Revenue Growth: year-over-year change in total revenue.",
  epsGrowth: "EPS Growth: year-over-year change in earnings per share.",
  fcfGrowth: "Free Cash Flow Growth: year-over-year change in FCF.",
  debtToEquity: "Debt-to-Equity: total debt divided by shareholders' equity. Lower typically means less financial risk.",
  currentRatio: "Current Ratio: current assets / current liabilities. Above 1.5 generally indicates good liquidity.",
  quickRatio: "Quick Ratio: (current assets - inventory) / current liabilities. Stricter liquidity test.",
  interestCoverage: "Interest Coverage: EBIT / interest expense. Higher means easier debt servicing.",
  dividendYield: "Dividend Yield: annual dividends per share / stock price. Income return to shareholders.",
  payoutRatio: "Payout Ratio: dividends / net income. Shows sustainability of dividend payments.",
  fcfYield: "FCF Yield: free cash flow per share / stock price. Cash-based alternative to earnings yield.",
};

const columns = [
  {
    title: "Valuation",
    metrics: [
      { key: "pe", label: "P/E" },
      { key: "forwardPe", label: "Forward P/E" },
      { key: "pb", label: "P/B" },
      { key: "ps", label: "P/S" },
      { key: "evToEbitda", label: "EV/EBITDA" },
      { key: "evToRevenue", label: "EV/Revenue" },
      { key: "pegRatio", label: "PEG Ratio" },
      { key: "priceToFcf", label: "P/FCF" },
      { key: "earningsYield", label: "Earnings Yield" },
    ],
  },
  {
    title: "Quality & Growth",
    metrics: [
      { key: "roe", label: "ROE" },
      { key: "roa", label: "ROA" },
      { key: "roic", label: "ROIC" },
      { key: "grossMargin", label: "Gross Margin" },
      { key: "operatingMargin", label: "Op. Margin" },
      { key: "netMargin", label: "Net Margin" },
      { key: "revenueGrowth", label: "Rev. Growth" },
      { key: "epsGrowth", label: "EPS Growth" },
      { key: "fcfGrowth", label: "FCF Growth" },
    ],
  },
  {
    title: "Balance Sheet & Dividends",
    metrics: [
      { key: "debtToEquity", label: "Debt/Equity" },
      { key: "currentRatio", label: "Current Ratio" },
      { key: "quickRatio", label: "Quick Ratio" },
      { key: "interestCoverage", label: "Int. Coverage" },
      { key: "dividendYield", label: "Div. Yield" },
      { key: "payoutRatio", label: "Payout Ratio" },
      { key: "fcfYield", label: "FCF Yield" },
    ],
  },
];

export function MetricsGrid({ metrics }: MetricsGridProps) {
  return (
    <div className="space-y-6">
      {metrics.diagnostics?.isTtm === false && (
        <div className="text-xs text-amber-400/70 bg-amber-500/5 border border-amber-500/10 rounded-lg px-4 py-2">
          Income-statement metrics are based on the latest annual filing (FY{metrics.diagnostics.fiscalYear}), not current TTM. Some ratios may differ from real-time sources.
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {columns.map((col) => (
          <Card key={col.title} className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-mono uppercase tracking-wider text-muted-foreground">
                {col.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full">
                <tbody>
                  {col.metrics.map((m) => (
                    <tr key={m.key} className="border-t border-border">
                      <td className="px-4 py-2.5 text-sm text-muted-foreground flex items-center gap-1.5">
                        {m.label}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3 w-3 text-muted-foreground/50 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-xs text-xs">
                            {METRIC_DEFINITIONS[m.key] || m.label}
                          </TooltipContent>
                        </Tooltip>
                      </td>
                      <td className="px-4 py-2.5 text-sm font-mono text-right text-foreground font-medium">
                        {formatMetricValue(m.key, (metrics as any)[m.key])}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ))}
      </div>

      <Accordion type="single" collapsible>
        <AccordionItem value="definitions" className="border-border">
          <AccordionTrigger className="text-sm font-mono text-muted-foreground hover:text-foreground px-1">
            Metric Definitions
          </AccordionTrigger>
          <AccordionContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4">
              {Object.entries(METRIC_DEFINITIONS).map(([key, def]) => (
                <div key={key} className="text-xs">
                  <span className="font-mono font-semibold text-foreground">
                    {columns.flatMap(c => c.metrics).find(m => m.key === key)?.label || key}:
                  </span>{" "}
                  <span className="text-muted-foreground">{def}</span>
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
