import { INVESTORS, DEFAULT_INVESTORS, type Investor } from "@/lib/investors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface InvestorSelectProps {
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}

export function InvestorSelect({ selected, onChange, disabled }: InvestorSelectProps) {
  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  };

  const selectAll = () => onChange(INVESTORS.map((i) => i.id));
  const clearAll = () => onChange(DEFAULT_INVESTORS);

  return (
    <div className="space-y-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            disabled={disabled}
            className="w-full justify-between h-11 bg-secondary border-border text-foreground"
          >
            <span className="text-sm truncate">
              {selected.length === 0
                ? "Select investors..."
                : `${selected.length} investor${selected.length > 1 ? "s" : ""} selected`}
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground ml-2" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0 bg-popover border-border" align="start">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="text-xs font-mono text-muted-foreground">INVESTOR PROFILES</span>
            <div className="flex gap-2">
              <button onClick={selectAll} className="text-xs text-primary hover:underline">All</button>
              <button onClick={clearAll} className="text-xs text-muted-foreground hover:underline">Reset</button>
            </div>
          </div>
          <ScrollArea className="h-72">
            <div className="p-2 space-y-0.5">
              {INVESTORS.map((inv) => (
                <label
                  key={inv.id}
                  className="flex items-center gap-3 px-2 py-2 rounded hover:bg-muted cursor-pointer transition-colors"
                >
                  <Checkbox
                    checked={selected.includes(inv.id)}
                    onCheckedChange={() => toggle(inv.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground">{inv.fullName}</div>
                    <div className="text-xs text-muted-foreground">{inv.style}</div>
                  </div>
                </label>
              ))}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((id) => {
            const inv = INVESTORS.find((i) => i.id === id);
            return (
              <Badge
                key={id}
                variant="secondary"
                className="gap-1 text-xs font-mono cursor-pointer hover:bg-muted"
                onClick={() => toggle(id)}
              >
                {inv?.name}
                <X className="h-3 w-3" />
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}
