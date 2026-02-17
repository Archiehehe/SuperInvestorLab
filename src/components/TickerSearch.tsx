import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { searchTickers } from "@/lib/api";

interface TickerSearchProps {
  value: string;
  onChange: (ticker: string) => void;
  disabled?: boolean;
}

export function TickerSearch({ value, onChange, disabled }: TickerSearchProps) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<Array<{ symbol: string; name: string; exchange?: string }>>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 1) { setResults([]); return; }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await searchTickers(query);
        setResults(data);
        setIsOpen(true);
      } catch { setResults([]); }
      setLoading(false);
    }, 300);
  }, [query]);

  return (
    <div ref={ref} className="relative w-full max-w-md">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search ticker (e.g. AAPL, MSFT)..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value.toUpperCase());
          }}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && query) {
              onChange(query);
              setIsOpen(false);
            }
          }}
          disabled={disabled}
          className="pl-10 font-mono bg-secondary border-border text-foreground placeholder:text-muted-foreground h-11"
        />
      </div>
      {isOpen && results.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full rounded-md border border-border bg-popover shadow-lg overflow-hidden">
          {results.map((r) => (
            <button
              key={r.symbol}
              className="w-full px-4 py-3 text-left hover:bg-muted flex items-center justify-between transition-colors"
              onMouseDown={(e) => {
                e.preventDefault(); // prevent input blur before selection fires
                setQuery(r.symbol);
                onChange(r.symbol);
                setIsOpen(false);
              }}
            >
              <span className="font-mono font-semibold text-sm text-foreground">{r.symbol}</span>
              <span className="text-xs text-muted-foreground truncate ml-3">{r.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
