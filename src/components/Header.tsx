import { Brain } from "lucide-react";

export function Header() {
  return (
    <header className="border-b border-border px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Brain className="h-6 w-6 text-primary terminal-glow" />
        <h1 className="text-xl font-semibold font-mono tracking-tight text-foreground">
          SUPERINVESTOR<span className="text-primary">LAB</span>
        </h1>
      </div>
      <div className="text-xs font-mono text-muted-foreground">
        Real-time AI-powered stock analysis
      </div>
    </header>
  );
}
