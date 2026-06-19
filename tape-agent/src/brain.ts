import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface DecisionContext {
  pool: string;
  recentPrices: number[];
  position: number;
  cash: number;
  iteration: number;
  /** Max base size the agent may trade in one step. */
  maxSize: number;
}

export interface Decision {
  action: "BUY" | "SELL" | "HOLD";
  size: number;
  confidence: number;
  reasoning: string;
  /** Which engine produced this — honest provenance in the record. */
  model: string;
}

const SYSTEM = `You are an active short-term scalping agent on SUI/USD.
You trade small real price movements: buy dips, take profit into strength, rotate often.
Given recent prices and your position, decide ONE action for this step.
Respond with ONLY a compact JSON object, no markdown, no prose:
{"action":"BUY"|"SELL"|"HOLD","size":<number>,"confidence":<0..1>,"reasoning":"<one sentence>"}
Rules: size is in base units, 0 for HOLD, at most the provided maxSize.
Do not SELL more than your current position. Keep some cash for dips.
Prefer trading (BUY on a tick down, SELL to realize gains on a tick up) over sitting idle,
but never bet the whole book on one step. React to the most recent price vs the prior one.`;

/** Ask Claude (via the local CLI) for a structured decision. Throws on any trouble. */
async function decideWithClaude(ctx: DecisionContext): Promise<Decision> {
  const prompt = `${SYSTEM}\n\nContext:\n${JSON.stringify(ctx)}`;
  const { stdout } = await execFileAsync(
    "claude",
    ["-p", prompt, "--output-format", "json"],
    { timeout: 90_000, maxBuffer: 1024 * 1024 },
  );
  const envelope = JSON.parse(stdout) as { result?: string };
  const text = (envelope.result ?? "").replace(/```json|```/g, "").trim();
  const d = JSON.parse(text) as Partial<Decision>;
  return normalize({ ...d, model: "claude-cli" }, ctx);
}

/** Transparent momentum fallback when the model is unavailable. */
function decideWithHeuristic(ctx: DecisionContext): Decision {
  const p = ctx.recentPrices;
  const last = p[p.length - 1] ?? 0;
  const prev = p[p.length - 2] ?? last;
  const drift = prev ? (last - prev) / prev : 0;
  let action: Decision["action"] = "HOLD";
  let size = 0;
  // Scalp: buy dips, sell rips, on small real moves.
  if (drift < -0.0003 && ctx.cash > last * ctx.maxSize) {
    action = "BUY";
    size = ctx.maxSize;
  } else if (drift > 0.0003 && ctx.position > 0) {
    action = "SELL";
    size = Math.min(ctx.maxSize, ctx.position);
  }
  return normalize(
    {
      action,
      size,
      confidence: Math.min(1, Math.abs(drift) * 50),
      reasoning: `momentum ${(drift * 100).toFixed(2)}% over last step`,
      model: "heuristic-momentum-v1",
    },
    ctx,
  );
}

/** Clamp a decision to the rules so a bad model output can't break the portfolio. */
function normalize(d: Partial<Decision> & { model: string }, ctx: DecisionContext): Decision {
  let action: Decision["action"] = d.action === "BUY" || d.action === "SELL" ? d.action : "HOLD";
  let size = Number(d.size) || 0;
  size = Math.max(0, Math.min(size, ctx.maxSize));
  if (action === "SELL") size = Math.min(size, ctx.position);
  if (action === "HOLD" || size === 0) {
    action = "HOLD";
    size = 0;
  }
  return {
    action,
    size,
    confidence: Math.max(0, Math.min(1, Number(d.confidence) || 0)),
    reasoning: d.reasoning?.slice(0, 280) || "no reasoning provided",
    model: d.model,
  };
}

export async function decide(ctx: DecisionContext): Promise<Decision> {
  try {
    return await decideWithClaude(ctx);
  } catch (e) {
    console.warn(`  (claude decision unavailable: ${(e as Error).message.split("\n")[0]}; using heuristic)`);
    return decideWithHeuristic(ctx);
  }
}
