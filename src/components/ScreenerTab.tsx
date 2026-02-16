import { useState } from "react";
import { Button } from "@/components/ui/button";
import { InvestorSelect } from "@/components/InvestorSelect";
import { INVESTORS, DEFAULT_INVESTORS } from "@/lib/investors";
import { fetchSP500, fetchStockData, evaluateStock } from "@/lib/api";
import { exportToCSV, exportToJSON } from "@/lib/formatters";
import type { ScreenerResult, Signal } from "@/lib/types";
import { Loader2, Download, Play, ChevronUp, ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type SortKey = "passRate" | "ticker" | "companyName" | "sector" | "totalPasses" | "totalFails" | "totalWarns" | string;

export function ScreenerTab() {
  const [selectedInvestors, setSelectedInvestors] = useState<string[]>(DEFAULT_INVESTORS);
  const [stockCount, setStockCount] = useState(75);
  const [results, setResults] = useState<ScreenerResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [sortKey, setSortKey] = useState<SortKey>("passRate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const { toast } = useToast();
  const pageSize = 25;

  const runScreener = async () => {
    if (selectedInvestors.length === 0) {
      toast({ title: "Select investors", variant: "destructive" });
      return;
    }

    setLoading(true);
    setResults([]);
    setPage(0);

    try {
      const sp500 = await fetchSP500();
      const tickers = sp500.slice(0, stockCount);
      setProgress({ current: 0, total: tickers.length });

      const investors = selectedInvestors.map((id) => INVESTORS.find((i) => i.id === id)!);
      const screenerResults: ScreenerResult[] = [];

      // Process in batches of 5
      for (let i = 0; i < tickers.length; i += 5) {
        const batch = tickers.slice(i, i + 5);
        const batchPromises = batch.map(async (t) => {
          try {
            const metrics = await fetchStockData(t.symbol);
            const evaluations = await evaluateStock(metrics, investors);

            let totalPasses = 0, totalFails = 0, totalWarns = 0;
            const investorResults: Record<string, { passes: number; total: number; signal: Signal }> = {};

            evaluations.forEach((ev) => {
              totalPasses += ev.passCount;
              totalFails += ev.failCount;
              totalWarns += ev.warnCount;
              investorResults[ev.investorId] = {
                passes: ev.passCount,
                total: ev.checklist.length,
                signal: ev.overallSignal,
              };
            });

            const totalChecks = totalPasses + totalFails + totalWarns;
            return {
              ticker: t.symbol,
              companyName: t.name,
              sector: t.sector || "N/A",
              passRate: totalChecks > 0 ? Math.round((totalPasses / totalChecks) * 100) : 0,
              totalPasses,
              totalFails,
              totalWarns,
              investorResults,
            } satisfies ScreenerResult;
          } catch {
            return null;
          }
        });

        const batchResults = await Promise.all(batchPromises);
        const valid = batchResults.filter(Boolean) as ScreenerResult[];
        screenerResults.push(...valid);
        setResults([...screenerResults]);
        setProgress({ current: Math.min(i + 5, tickers.length), total: tickers.length });
      }

      toast({ title: "Screener complete", description: `Analyzed ${screenerResults.length} stocks.` });
    } catch (err: any) {
      toast({ title: "Screener failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const sorted = [...results].sort((a, b) => {
    let va: any = (a as any)[sortKey];
    let vb: any = (b as any)[sortKey];
    if (sortKey.startsWith("inv_")) {
      const invId = sortKey.replace("inv_", "");
      va = a.investorResults[invId]?.passes ?? 0;
      vb = b.investorResults[invId]?.passes ?? 0;
    }
    if (typeof va === "string") return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    return sortDir === "asc" ? va - vb : vb - va;
  });

  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(sorted.length / pageSize);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const SortHeader = ({ label, sKey }: { label: string; sKey: SortKey }) => (
    <th
      className="px-3 py-3 text-left text-xs font-mono uppercase text-muted-foreground cursor-pointer hover:text-foreground whitespace-nowrap"
      onClick={() => toggleSort(sKey)}
    >
      <span className="flex items-center gap-1">
        {label}
        {sortKey === sKey && (sortDir === "desc" ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />)}
      </span>
    </th>
  );

  const handleExport = (format: string) => {
    if (!results.length) return;
    const filename = `screener_${new Date().toISOString().split("T")[0]}`;
    if (format === "json") exportToJSON(results, filename);
    else if (format === "csv") {
      const rows = results.map((r) => {
        const base: any = {
          ticker: r.ticker, company: r.companyName, sector: r.sector,
          passRate: r.passRate, passes: r.totalPasses, fails: r.totalFails, warns: r.totalWarns,
        };
        selectedInvestors.forEach((id) => {
          const inv = INVESTORS.find((i) => i.id === id);
          base[inv?.name || id] = r.investorResults[id]?.passes ?? "N/A";
        });
        return base;
      });
      exportToCSV(rows, filename);
    }
  };

  const signalColor = (signal: Signal) => {
    if (signal === "pass") return "text-signal-pass";
    if (signal === "warn") return "text-signal-warn";
    return "text-signal-fail";
  };

  return (
    <div className="space-y-8">
      {/* Controls */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <div className="flex-1 w-full lg:max-w-sm">
          <InvestorSelect selected={selectedInvestors} onChange={setSelectedInvestors} disabled={loading} />
        </div>
        <div className="space-y-2 w-full lg:max-w-xs">
          <label className="text-xs font-mono text-muted-foreground">
            Stocks to analyze: <span className="text-foreground font-semibold">{stockCount}</span>
          </label>
          <Slider
            value={[stockCount]}
            onValueChange={([v]) => setStockCount(v)}
            min={10}
            max={503}
            step={1}
            disabled={loading}
          />
        </div>
        <Button onClick={runScreener} disabled={loading} className="h-11 px-6 font-mono">
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {progress.current}/{progress.total}
            </>
          ) : (
            <>
              <Play className="h-4 w-4 mr-2" />
              Run Screener
            </>
          )}
        </Button>
      </div>

      {/* Results Table */}
      {results.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-muted-foreground">{results.length} results</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="font-mono text-xs">
                  <Download className="h-3.5 w-3.5 mr-1.5" />Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => handleExport("csv")}>Export CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("json")}>Export JSON</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="border border-border rounded-lg overflow-auto">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <SortHeader label="Ticker" sKey="ticker" />
                  <SortHeader label="Company" sKey="companyName" />
                  <SortHeader label="Sector" sKey="sector" />
                  <SortHeader label="Pass %" sKey="passRate" />
                  <SortHeader label="Pass" sKey="totalPasses" />
                  <SortHeader label="Fail" sKey="totalFails" />
                  <SortHeader label="Warn" sKey="totalWarns" />
                  {selectedInvestors.map((id) => {
                    const inv = INVESTORS.find((i) => i.id === id);
                    return <SortHeader key={id} label={inv?.name || id} sKey={`inv_${id}`} />;
                  })}
                </tr>
              </thead>
              <tbody>
                {paged.map((r) => (
                  <tr key={r.ticker} className="border-t border-border hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2.5 font-mono font-semibold text-sm text-primary">{r.ticker}</td>
                    <td className="px-3 py-2.5 text-sm text-foreground truncate max-w-[180px]">{r.companyName}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{r.sector}</td>
                    <td className="px-3 py-2.5 font-mono text-sm font-semibold">
                      <span className={r.passRate >= 60 ? "text-signal-pass" : r.passRate >= 40 ? "text-signal-warn" : "text-signal-fail"}>
                        {r.passRate}%
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-sm text-signal-pass">{r.totalPasses}</td>
                    <td className="px-3 py-2.5 font-mono text-sm text-signal-fail">{r.totalFails}</td>
                    <td className="px-3 py-2.5 font-mono text-sm text-signal-warn">{r.totalWarns}</td>
                    {selectedInvestors.map((id) => {
                      const res = r.investorResults[id];
                      return (
                        <td key={id} className="px-3 py-2.5 font-mono text-sm text-center">
                          {res ? (
                            <span className={signalColor(res.signal)}>
                              {res.passes}/{res.total}
                            </span>
                          ) : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
                className="font-mono text-xs"
              >
                Previous
              </Button>
              <span className="text-xs font-mono text-muted-foreground">
                {page + 1} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage(page + 1)}
                className="font-mono text-xs"
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!loading && results.length === 0 && (
        <div className="flex items-center justify-center py-24">
          <div className="text-center space-y-3 max-w-md">
            <p className="text-lg font-medium text-foreground">S&P 500 Screener</p>
            <p className="text-sm text-muted-foreground">
              Select investor profiles and choose how many stocks to screen. The AI will evaluate each
              stock against every selected investor's philosophy.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
