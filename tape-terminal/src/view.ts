import type { Metrics } from "tape-sdk";

export const pct = (x: number, dp = 2) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(dp)}%`;
export const dec = (x: number, dp = 2) => (Number.isFinite(x) ? x.toFixed(dp) : "∞");
export const short = (s: string, head = 4, tail = 4) =>
  s.length > head + tail + 1 ? `${s.slice(0, head)}…${s.slice(-tail)}` : s;
export const clock = (ms: number) =>
  new Date(ms).toISOString().replace("T", " ").replace(/\.\d+Z$/, "Z");

export type Basis = "mark" | "execution";

export interface MetricCard {
  key: string;
  label: string;
  value: string;
  tone: "g" | "r" | "";
  /** Which record kind this metric is derived from (drives the drill-down). */
  basis: Basis;
  formula: string;
  explain: string;
}

/** The metric grid, derived entirely from the recomputed Metrics. */
export function metricCards(m: Metrics): MetricCard[] {
  return [
    {
      key: "sharpe", label: "Sharpe", value: dec(m.sharpe), tone: m.sharpe >= 0 ? "" : "r", basis: "mark",
      formula: "mean(r) / σ(r) · √N,  r = per-mark equity returns",
      explain: `Computed from ${m.marks} anchored marks (${m.returns.length} returns). Per-step ${dec(m.sharpePerStep, 3)}, scaled by √${m.returns.length}.`,
    },
    {
      key: "sortino", label: "Sortino", value: dec(m.sortino), tone: m.sortino >= 0 ? "" : "r", basis: "mark",
      formula: "mean(r) / downside-σ(r) · √N",
      explain: "Like Sharpe but only downside volatility is penalized.",
    },
    {
      key: "maxdd", label: "Max drawdown", value: pct(m.maxDrawdown), tone: "r", basis: "mark",
      formula: "min( equity_t / running-peak − 1 )",
      explain: "Deepest peak-to-trough on the equity curve built from the anchored marks.",
    },
    {
      key: "win", label: "Win rate", value: `${(m.winRate * 100).toFixed(1)}%`, tone: "", basis: "execution",
      formula: "wins / closed trades",
      explain: `${m.closedTrades} closed round-trips, by average-cost realized PnL from the execution blobs.`,
    },
    {
      key: "pf", label: "Profit factor", value: dec(m.profitFactor), tone: m.profitFactor >= 1 ? "g" : "r", basis: "execution",
      formula: "gross profit / gross loss",
      explain: "Sum of winning realized PnL ÷ sum of losing realized PnL.",
    },
  ];
}
