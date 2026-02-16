import type { InvestorEvaluation, Signal } from "@/lib/types";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

interface InvestorResultsProps {
  evaluations: InvestorEvaluation[];
}

function SignalIcon({ signal, size = 16 }: { signal: Signal; size?: number }) {
  switch (signal) {
    case "pass":
      return <CheckCircle2 className="text-signal-pass" style={{ width: size, height: size }} />;
    case "warn":
      return <AlertTriangle className="text-signal-warn" style={{ width: size, height: size }} />;
    case "fail":
      return <XCircle className="text-signal-fail" style={{ width: size, height: size }} />;
  }
}

function SignalBadge({ signal, children }: { signal: Signal; children: React.ReactNode }) {
  const classes: Record<Signal, string> = {
    pass: "bg-signal-pass border-signal-pass text-signal-pass",
    warn: "bg-signal-warn border-signal-warn text-signal-warn",
    fail: "bg-signal-fail border-signal-fail text-signal-fail",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono border ${classes[signal]}`}>
      {children}
    </span>
  );
}

export function InvestorResults({ evaluations }: InvestorResultsProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-mono uppercase tracking-wider text-muted-foreground px-1">
        Investor Evaluations
      </h3>
      <Accordion type="multiple" defaultValue={evaluations.map((e) => e.investorId)}>
        {evaluations.map((ev) => (
          <AccordionItem key={ev.investorId} value={ev.investorId} className="border-border">
            <AccordionTrigger className="hover:no-underline px-4 py-4">
              <div className="flex items-center gap-4 w-full mr-4">
                <SignalIcon signal={ev.overallSignal} size={20} />
                <div className="flex-1 text-left">
                  <div className="text-sm font-semibold text-foreground">{ev.investorName}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{ev.overallComment}</div>
                </div>
                <div className="flex items-center gap-2">
                  <SignalBadge signal="pass">{ev.passCount}</SignalBadge>
                  <SignalBadge signal="warn">{ev.warnCount}</SignalBadge>
                  <SignalBadge signal="fail">{ev.failCount}</SignalBadge>
                </div>
                <div className="font-mono text-sm font-semibold text-foreground w-12 text-right">
                  {ev.compatibilityScore}%
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="px-4 pb-4 space-y-4">
                <p className="text-xs text-muted-foreground italic border-l-2 border-border pl-3">
                  {ev.philosophy}
                </p>
                {ev.checklist.length > 0 && (
                  <div className="space-y-1">
                    {ev.checklist.map((item, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 p-3 rounded-md bg-muted/50 hover:bg-muted transition-colors"
                      >
                        <SignalIcon signal={item.signal} size={16} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">{item.criterion}</span>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="font-mono text-xs text-primary cursor-help">{item.value}</span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs text-xs">{item.explanation}</TooltipContent>
                            </Tooltip>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{item.explanation}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
