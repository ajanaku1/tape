/**
 * Tape reference agent — the first consumer of the Tape verification layer.
 *
 * Each iteration: read a live DeepBook price -> ask Claude for a decision ->
 * (simulated) fill at that price -> write DECISION, EXECUTION, and MARK records
 * to Walrus, each anchored in the on-chain TapeLog with a Clock timestamp.
 *
 * The result is a real, timestamped, tamper-evident track record. Fills are
 * simulated at the live on-chain price (venue: "simulated") — honestly labeled;
 * the verifiable properties (immutability, completeness, no backdating, real
 * marks) hold regardless of venue. See README verification model + PLAN §2/§7.
 *
 * Run: npm start [iterations]
 */
import { TapeClient } from "../../tape-sdk/src/index.js";
import { loadTestnetConfig } from "../../tape-sdk/src/config.js";
import { loadKeypairFromKeystore } from "../../tape-sdk/src/signer-node.js";
import type {
  DecisionRecord,
  ExecutionRecord,
  MarkRecord,
} from "../../tape-sdk/src/types.js";
import { Market } from "./market.js";
import { Portfolio } from "./portfolio.js";
import { decide } from "./brain.js";

const AGENT = "0x2b311a914950323ebb772ccb12b0b286bb3f28a9f6e049c3fa577cd230a87587";
const ASSET = "SUI/USD";
const STARTING_CASH = 100; // USD (notional)
const MAX_SIZE = 40; // base (SUI) units per step
const FEE_RATE = 0.001;
const STEP_DELAY_MS = 12000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const iterations = Number(process.argv[2] ?? 6);
  const tape = new TapeClient(loadTestnetConfig(), loadKeypairFromKeystore(AGENT));
  const market = new Market(ASSET);
  const pf = new Portfolio(STARTING_CASH);
  const prices: number[] = [];

  console.log(`Tape agent: ${iterations} iterations on ${ASSET}\n`);

  for (let i = 0; i < iterations; i++) {
   try {
    const snap = await market.snapshot();
    prices.push(snap.price);
    console.log(`#${i} price=${snap.price.toFixed(5)} pos=${pf.position} cash=${pf.cash.toFixed(2)}`);

    const decision = await decide({
      pool: ASSET,
      recentPrices: prices,
      position: pf.position,
      cash: pf.cash,
      iteration: i,
      maxSize: MAX_SIZE,
    });
    console.log(`   decision: ${decision.action} ${decision.size} (conf ${decision.confidence}, ${decision.model})`);

    const decRec: DecisionRecord = {
      kind: "decision",
      iteration: i,
      asset: ASSET,
      observedPrice: snap.price,
      reasoning: decision.reasoning,
      action: decision.action,
      size: decision.size,
      confidence: decision.confidence,
    };
    const d = await tape.record(decRec);
    console.log(`   ↳ decision anchored seq=${d.seq}`);

    if (decision.action !== "HOLD" && decision.size > 0) {
      // Anchor the execution BEFORE mutating the portfolio, so local state never
      // diverges from the verifiable record if the anchor fails.
      const quote = decision.size * snap.price;
      const fee = quote * FEE_RATE;
      const execRec: ExecutionRecord = {
        kind: "execution",
        iteration: i,
        asset: ASSET,
        action: decision.action,
        price: snap.price,
        quantity: decision.size,
        quote,
        fee,
        venue: "simulated",
      };
      const e = await tape.record(execRec);
      pf.fill(decision.action, decision.size, snap.price, FEE_RATE);
      console.log(`   ↳ execution anchored seq=${e.seq}`);
    }

    const markRec: MarkRecord = {
      kind: "mark",
      iteration: i,
      asset: ASSET,
      price: snap.price,
      priceSource: { source: snap.source, publishTime: snap.publishTime, conf: snap.conf },
      position: pf.position,
      cash: pf.cash,
      equity: pf.equity(snap.price),
    };
    const m = await tape.record(markRec);
    console.log(`   ↳ mark anchored seq=${m.seq} equity=${markRec.equity.toFixed(2)}\n`);
   } catch (e) {
    console.warn(`   ! iteration ${i} skipped: ${(e as Error).message.split("\n")[0]}\n`);
   }
   if (i < iterations - 1) await sleep(STEP_DELAY_MS);
  }

  const entries = await tape.getEntries();
  const lastPrice = prices[prices.length - 1] ?? 0;
  console.log("=== run complete ===");
  console.log(`tape entries on-chain: ${entries.length}`);
  console.log(`final equity: ${pf.equity(lastPrice).toFixed(2)} (started ${STARTING_CASH})`);
  console.log(`TapeLog: ${loadTestnetConfig().tapeLog}`);
}

main().catch((e) => {
  console.error("AGENT FAILED:", e?.message ?? e);
  process.exit(1);
});
