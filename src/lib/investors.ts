export interface Investor {
  id: string;
  name: string;
  fullName: string;
  philosophy: string;
  style: string;
}

export const INVESTORS: Investor[] = [
  { id: "graham", name: "Graham", fullName: "Benjamin Graham", philosophy: "Deep value investing with extreme margin of safety. Focus on net-net stocks, low P/E, and asset-based valuations. Demands quantitative proof of undervaluation.", style: "Deep Value" },
  { id: "buffett", name: "Buffett", fullName: "Warren Buffett", philosophy: "Quality businesses at fair prices with durable competitive advantages (moats). Focus on return on equity, consistent earnings growth, and strong management.", style: "Quality at Fair Price" },
  { id: "lynch", name: "Lynch", fullName: "Peter Lynch", philosophy: "Growth at a reasonable price (GARP). PEG ratio is central. Invest in what you know. Categorize stocks: slow growers, stalwarts, fast growers, cyclicals, turnarounds, asset plays.", style: "GARP" },
  { id: "greenblatt", name: "Greenblatt", fullName: "Joel Greenblatt", philosophy: "Magic Formula: rank stocks by high earnings yield and high return on capital. Buy good companies cheap systematically.", style: "Magic Formula" },
  { id: "fisher", name: "Fisher", fullName: "Philip Fisher", philosophy: "Growth investing with scuttlebutt research. Focus on companies with above-average growth potential, excellent management, and strong R&D. Long holding periods.", style: "Growth at Reasonable Price" },
  { id: "munger", name: "Munger", fullName: "Charlie Munger", philosophy: "Mental models and moats. Quality over price — pay fair prices for wonderful businesses. Invert, always invert. Focus on competitive advantages and management integrity.", style: "Mental Models & Moats" },
  { id: "klarman", name: "Klarman", fullName: "Seth Klarman", philosophy: "Margin of safety above all. Value investing with extreme downside protection. Patient, contrarian, willing to hold cash. Focus on absolute returns, not relative.", style: "Margin of Safety" },
  { id: "marks", name: "Marks", fullName: "Howard Marks", philosophy: "Risk management and cycle awareness. Second-level thinking. Focus on understanding where we are in the cycle, risk/reward asymmetry, and market psychology.", style: "Risk & Cycles" },
  { id: "ackman", name: "Ackman", fullName: "Bill Ackman", philosophy: "Concentrated positions in high-quality businesses with predictable cash flows. Activist approach — catalysts for value unlocking. Focus on free cash flow and barriers to entry.", style: "Concentrated Value" },
  { id: "wood", name: "Wood", fullName: "Cathie Wood", philosophy: "Disruptive innovation investing. Focus on companies benefiting from technological change: AI, robotics, genomics, fintech, energy storage. Long 5-year time horizon.", style: "Disruptive Innovation" },
  { id: "dalio", name: "Dalio", fullName: "Ray Dalio", philosophy: "All Weather approach. Diversification across asset classes and risk parity. Understanding economic machine: credit cycles, deleveraging. Radical transparency.", style: "All Weather" },
  { id: "soros", name: "Soros", fullName: "George Soros", philosophy: "Reflexivity theory — markets influence fundamentals and vice versa. Identify self-reinforcing boom/bust cycles. Make concentrated bets when conviction is high.", style: "Reflexivity" },
  { id: "templeton", name: "Templeton", fullName: "John Templeton", philosophy: "Contrarian global investing. Buy at the point of maximum pessimism. Search worldwide for the best bargains. Long-term perspective, diversified globally.", style: "Contrarian" },
  { id: "dreman", name: "Dreman", fullName: "David Dreman", philosophy: "Contrarian low P/E investing. Behavioral finance insights — exploit market overreaction. Buy out-of-favor stocks with low P/E, P/B, P/CF ratios.", style: "Contrarian Low P/E" },
  { id: "burry", name: "Burry", fullName: "Michael Burry", philosophy: "Deep value with forensic financial analysis. Identify overlooked assets and mispriced securities. Willingness to take extremely contrarian positions. Scarcity-based investing.", style: "Deep Value Scarcity" },
  { id: "pabrai", name: "Pabrai", fullName: "Mohnish Pabrai", philosophy: "Clone investing — copy the best ideas from great investors. Heads I win, tails I don't lose much. Low risk, high uncertainty, high return potential.", style: "Clone Investing" },
  { id: "lilu", name: "Li Lu", fullName: "Li Lu", philosophy: "Quality moats with a long-term compounding mindset. Focus on businesses with sustainable competitive advantages, especially in Asia. Patient capital allocation.", style: "Quality Moats" },
  { id: "smith", name: "Terry Smith", fullName: "Terry Smith", philosophy: "Buy good companies, don't overpay, do nothing. Focus on high ROCE, strong free cash flow generation, and businesses that can reinvest at high rates of return.", style: "Quality Compounders" },
  { id: "sleep", name: "Nick Sleep", fullName: "Nick Sleep", philosophy: "Long-term quality with scale economics shared. Focus on companies that share cost savings with customers, creating a flywheel effect. Extreme concentration and patience.", style: "Long-Term Quality" },
  { id: "dorsey", name: "Pat Dorsey", fullName: "Pat Dorsey", philosophy: "Economic moats analysis. Four types: intangible assets, switching costs, network effects, cost advantages. Value the moat's durability as much as current earnings.", style: "Economic Moats" },
  { id: "damodaran", name: "Damodaran", fullName: "Aswath Damodaran", philosophy: "Rigorous intrinsic valuation. DCF modeling with explicit assumptions about growth, risk, and reinvestment. Story + numbers must be consistent. Every company can be valued.", style: "Valuation" },
  { id: "carlisle", name: "Carlisle", fullName: "Tobias Carlisle", philosophy: "Acquirer's multiple — enterprise value / operating earnings. Deep value, mean-reversion strategy. Buy statistically cheap stocks that the market hates. Contrarian and systematic.", style: "Acquirer's Multiple" },
  { id: "faber", name: "Meb Faber", fullName: "Meb Faber", philosophy: "Quantitative trend following with global tactical asset allocation. Momentum signals to avoid drawdowns. Shareholder yield focus. Rules-based, emotionless investing.", style: "Quantitative Trend" },
  { id: "oshaughnessy", name: "O'Shaughnessy", fullName: "Jim O'Shaughnessy", philosophy: "Quantitative factor investing. What works on Wall Street — multi-factor models combining value, momentum, quality. Large-scale backtesting to find persistent edges.", style: "Quantitative" },
  { id: "thaler", name: "Thaler", fullName: "Richard Thaler", philosophy: "Behavioral finance. Exploit systematic cognitive biases: overconfidence, loss aversion, anchoring, herd behavior. Market is not always efficient — mispricings persist.", style: "Behavioral" },
  { id: "taleb", name: "Taleb", fullName: "Nassim Taleb", philosophy: "Antifragile barbell strategy. Majority in ultra-safe assets, small allocation to high-risk/high-reward bets. Avoid fragile positions. Benefit from volatility and Black Swans.", style: "Antifragile/Barbell" },
];

export const DEFAULT_INVESTORS = ["buffett", "lynch", "greenblatt"];
