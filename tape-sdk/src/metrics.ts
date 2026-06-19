/** Performance metrics, recomputed purely from the verified record.
 *
 * Every function here is a pure transform over decoded Tape records — no network,
 * no server, browser-safe. The terminal runs these client-side so a judge can
 * audit each number against the on-chain blobs it came from. */
import type { TapeRecord, ExecutionRecord, MarkRecord } from "./types.js";

export interface Metrics {
  startEquity: number;
  endEquity: number;
  /** Total return after fees (end/start − 1). */
  netReturn: number;
  /** Per-mark simple returns. */
  returns: number[];
  /** mean(r)/σ(r) over marks (per-step, unitless). */
  sharpePerStep: number;
  /** Per-step Sharpe scaled by √(#returns) — a convention, labeled as such in UI. */
  sharpe: number;
  /** Like Sharpe but only downside deviation in the denominator. */
  sortino: number;
  /** Most negative peak-to-trough on the equity curve (≤ 0). */
  maxDrawdown: number;
  /** Geometric (time-weighted) return from per-mark returns. */
  twr: number;
  /** Money-weighted return; equals TWR here (no external cashflows) — noted in UI. */
  mwr: number;
  /** Closed-trade stats (average-cost realized PnL). */
  winRate: number;
  profitFactor: number;
  closedTrades: number;
  /** Return of holding the base asset over the same window. */
  benchmarkReturn: number;
  /** netReturn − benchmarkReturn. */
  benchmarkDelta: number;
  marks: number;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

function downsideDev(xs: number[]): number {
  const neg = xs.map((r) => Math.min(0, r));
  if (xs.length < 2) return 0;
  return Math.sqrt(neg.reduce((a, b) => a + b * b, 0) / (xs.length - 1));
}

function maxDrawdown(equity: number[]): number {
  let peak = -Infinity;
  let worst = 0;
  for (const e of equity) {
    if (e > peak) peak = e;
    if (peak > 0) worst = Math.min(worst, e / peak - 1);
  }
  return worst;
}

/** Realized PnL via average cost: returns the per-close P&L of each SELL. */
function closedPnls(execs: ExecutionRecord[]): number[] {
  let pos = 0;
  let avgCost = 0;
  const pnls: number[] = [];
  for (const e of execs) {
    if (e.action === "BUY") {
      avgCost = pos + e.quantity > 0 ? (avgCost * pos + e.price * e.quantity) / (pos + e.quantity) : 0;
      pos += e.quantity;
    } else if (e.action === "SELL") {
      pnls.push((e.price - avgCost) * e.quantity - e.fee);
      pos = Math.max(0, pos - e.quantity);
    }
  }
  return pnls;
}

/** Win rate / profit factor over closed round-trip trades. */
function tradeStats(execs: ExecutionRecord[]) {
  const pnls = closedPnls(execs);
  const grossWin = pnls.filter((p) => p > 0).reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(pnls.filter((p) => p < 0).reduce((a, b) => a + b, 0));
  return {
    closedTrades: pnls.length,
    winRate: pnls.length ? pnls.filter((p) => p > 0).length / pnls.length : 0,
    profitFactor: grossLoss ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
  };
}

export function computeMetrics(records: TapeRecord[]): Metrics {
  const marks = records.filter((r): r is MarkRecord => r.kind === "mark");
  const execs = records.filter((r): r is ExecutionRecord => r.kind === "execution");

  const equity = marks.map((m) => m.equity);
  const startEquity = equity[0] ?? 0;
  const endEquity = equity[equity.length - 1] ?? startEquity;

  const returns: number[] = [];
  for (let i = 1; i < equity.length; i++) {
    const prev = equity[i - 1]!;
    if (prev !== 0) returns.push(equity[i]! / prev - 1);
  }

  const sd = stdev(returns);
  const sharpePerStep = sd ? mean(returns) / sd : 0;
  const dd = downsideDev(returns);
  const twr = returns.reduce((acc, r) => acc * (1 + r), 1) - 1;

  const trades = tradeStats(execs);

  const firstPrice = marks[0]?.price ?? 0;
  const lastPrice = marks[marks.length - 1]?.price ?? firstPrice;
  const benchmarkReturn = firstPrice ? lastPrice / firstPrice - 1 : 0;
  const netReturn = startEquity ? endEquity / startEquity - 1 : 0;

  return {
    startEquity,
    endEquity,
    netReturn,
    returns,
    sharpePerStep,
    sharpe: sharpePerStep * Math.sqrt(Math.max(1, returns.length)),
    sortino: dd ? mean(returns) / dd : 0,
    maxDrawdown: maxDrawdown(equity),
    twr,
    mwr: twr, // no external cashflows in this strategy → MWR ≡ TWR
    winRate: trades.winRate,
    profitFactor: trades.profitFactor,
    closedTrades: trades.closedTrades,
    benchmarkReturn,
    benchmarkDelta: netReturn - benchmarkReturn,
    marks: marks.length,
  };
}
