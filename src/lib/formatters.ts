import type { StockMetrics, ScreenerResult, AnalysisResult } from "./types";

export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n)) return "N/A";
  if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toFixed(2)}`;
}

export function formatPercent(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n)) return "N/A";
  return `${(n * 100).toFixed(2)}%`;
}

export function formatRatio(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n)) return "N/A";
  return n.toFixed(2);
}

export function formatMetricValue(key: string, value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return "N/A";
  
  const percentKeys = [
    "roe", "roa", "roic", "grossMargin", "operatingMargin", "netMargin",
    "revenueGrowth", "epsGrowth", "fcfGrowth", "dividendYield", "payoutRatio",
    "fcfYield", "earningsYield",
  ];
  
  if (percentKeys.includes(key)) return formatPercent(value);
  if (key === "marketCap") return formatNumber(value);
  if (key === "price") return `$${value.toFixed(2)}`;
  return formatRatio(value);
}

export function exportToCSV(data: any[], filename: string): void {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const csv = [
    headers.join(","),
    ...data.map(row => headers.map(h => {
      const val = row[h];
      if (typeof val === "string" && val.includes(",")) return `"${val}"`;
      return val ?? "";
    }).join(",")),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportToJSON(data: any, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
