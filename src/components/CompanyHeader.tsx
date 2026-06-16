import type { StockMetrics } from "@/lib/types";
import { formatMetricValue } from "@/lib/formatters";
import { Card, CardContent } from "@/components/ui/card";
import { Building2 } from "lucide-react";

interface CompanyHeaderProps {
  metrics: StockMetrics;
}

export function CompanyHeader({ metrics }: CompanyHeaderProps) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-6">
        <div className="flex items-start gap-6">
          <div className="flex-1 min-w-0 space-y-3">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-semibold text-foreground">{metrics.companyName}</h2>
                <span className="font-mono text-lg text-primary font-semibold">{metrics.ticker}</span>
              </div>
              <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5" />
                  {metrics.sector} · {metrics.industry}
                </span>
                <span className="font-mono">{metrics.exchange}</span>
              </div>
            </div>
              <div className="flex items-center gap-3">
                <div className="text-xs text-muted-foreground font-mono uppercase">Data</div>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium ${
                  metrics.diagnostics?.isTtm
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                }`}>
                  {metrics.diagnostics?.period || "N/A"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {metrics.diagnostics?.source || ""}
                </span>
              </div>
              <div className="flex items-center gap-8 mt-2">
                <div>
                  <div className="text-xs text-muted-foreground font-mono uppercase">Price</div>
                  <div className="text-xl font-mono font-semibold text-foreground">${metrics.price?.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground font-mono uppercase">Market Cap</div>
                  <div className="text-xl font-mono font-semibold text-foreground">
                    {formatMetricValue("marketCap", metrics.marketCap)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground font-mono uppercase">Beta</div>
                  <div className="text-xl font-mono font-semibold text-foreground">
                    {metrics.beta?.toFixed(2) ?? "N/A"}
                  </div>
                </div>
              </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
