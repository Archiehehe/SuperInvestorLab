import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TickerSearch } from "@/components/TickerSearch";
import { InvestorSelect } from "@/components/InvestorSelect";
import { CompanyHeader } from "@/components/CompanyHeader";
import { MetricsGrid } from "@/components/MetricsGrid";
import { InvestorResults } from "@/components/InvestorResults";
import { INVESTORS, DEFAULT_INVESTORS } from "@/lib/investors";
import { fetchStockData, evaluateStock } from "@/lib/api";
import { exportToJSON, exportToCSV } from "@/lib/formatters";
import type { AnalysisResult } from "@/lib/types";
import { Loader2, Download, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function SingleStockTab() {
  const [ticker, setTicker] = useState("");
  const [selectedInvestors, setSelectedInvestors] = useState<string[]>(DEFAULT_INVESTORS);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState("");
  const { toast } = useToast();

  const analyze = async () => {
    if (!ticker) {
      toast({ title: "Enter a ticker", description: "Please enter a stock ticker to analyze.", variant: "destructive" });
      return;
    }
    if (selectedInvestors.length === 0) {
      toast({ title: "Select investors", description: "Please select at least one investor profile.", variant: "destructive" });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      setStage("Fetching financial data...");
      const metrics = await fetchStockData(ticker);

      setStage(`Evaluating ${selectedInvestors.length} investor profiles...`);
      const investors = selectedInvestors.map((id) => INVESTORS.find((i) => i.id === id)!);
      const evaluations = await evaluateStock(metrics, investors);

      const analysisResult: AnalysisResult = {
        metrics,
        evaluations,
        timestamp: new Date().toISOString(),
      };

      setResult(analysisResult);
    } catch (err: any) {
      toast({
        title: "Analysis failed",
        description: err.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setStage("");
    }
  };

  const handleExport = (format: string) => {
    if (!result) return;
    const filename = `superinvestor_${result.metrics.ticker}_${new Date().toISOString().split("T")[0]}`;
    if (format === "json") {
      exportToJSON(result, filename);
    } else if (format === "csv") {
      const rows = result.evaluations.flatMap((ev) =>
        ev.checklist.map((c) => ({
          ticker: result.metrics.ticker,
          company: result.metrics.companyName,
          investor: ev.investorName,
          criterion: c.criterion,
          signal: c.signal,
          value: c.value,
          explanation: c.explanation,
          compatibilityScore: ev.compatibilityScore,
        }))
      );
      exportToCSV(rows, filename);
    }
  };

  return (
    <div className="space-y-8">
      {/* Search Bar */}
      <div className="flex flex-col md:flex-row gap-4 items-start">
        <TickerSearch value={ticker} onChange={setTicker} disabled={loading} />
        <div className="flex-1 w-full md:max-w-sm">
          <InvestorSelect selected={selectedInvestors} onChange={setSelectedInvestors} disabled={loading} />
        </div>
        <Button
          onClick={analyze}
          disabled={loading || !ticker}
          className="h-11 px-6 font-mono"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Search className="h-4 w-4 mr-2" />
              Analyze Stock
            </>
          )}
        </Button>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="text-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
            <p className="font-mono text-sm text-muted-foreground animate-pulse-glow">{stage}</p>
          </div>
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <div className="text-xs font-mono text-muted-foreground">
              Analyzed at {new Date(result.timestamp).toLocaleString()}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="font-mono text-xs">
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => handleExport("csv")}>Export CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("json")}>Export JSON</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <CompanyHeader metrics={result.metrics} />
          <MetricsGrid metrics={result.metrics} />
          <InvestorResults evaluations={result.evaluations} />
        </div>
      )}

      {/* Empty State */}
      {!result && !loading && (
        <div className="flex items-center justify-center py-24">
          <div className="text-center space-y-3 max-w-md">
            <p className="text-lg font-medium text-foreground">Enter a ticker to begin</p>
            <p className="text-sm text-muted-foreground">
              Search for any publicly traded stock, select investor profiles, and get AI-powered
              analysis against the philosophies of the world's greatest investors.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
