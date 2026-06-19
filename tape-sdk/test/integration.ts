/**
 * Live integration test: validates the deployed TapeLog + the SDK together.
 *   record a decision  -> Walrus blob + on-chain anchor
 *   read entries back   -> from the TapeLog object
 *   verify the hash     -> re-fetch blob, re-hash, compare to anchored data_hash
 *   tamper-evidence      -> a wrong hash must fail verification
 *
 * Run: npx tsx test/integration.ts
 */
import { TapeClient } from "../src/index.js";
import { loadTestnetConfig } from "../src/config.js";
import { loadKeypairFromKeystore } from "../src/signer-node.js";
import type { DecisionRecord } from "../src/types.js";

const AGENT = "0x2b311a914950323ebb772ccb12b0b286bb3f28a9f6e049c3fa577cd230a87587";

async function main() {
  const config = loadTestnetConfig();
  const signer = loadKeypairFromKeystore(AGENT);
  const tape = new TapeClient(config, signer);

  const before = await tape.getEntries();
  console.log(`entries before: ${before.length}`);

  const decision: DecisionRecord = {
    kind: "decision",
    iteration: before.length,
    asset: "SUI/USD",
    observedPrice: 0.1,
    reasoning: "integration test: confirm record→anchor→verify round-trip",
    action: "HOLD",
    size: 0,
    confidence: 0.5,
  };

  console.log("recording decision (Walrus store + on-chain anchor)...");
  const res = await tape.record(decision);
  console.log("  anchored:", { seq: res.seq, blobId: res.blobId, tx: res.anchorTx });
  console.log("  blob URL:", tape.blobUrl(res.blobId));

  const after = await tape.getEntries();
  console.log(`entries after: ${after.length}`);
  const entry = after.find((e) => e.seq === res.seq);
  if (!entry) throw new Error("anchored entry not found on-chain");

  const v = await tape.verifyEntry(entry);
  console.log("verifyEntry:", v.ok ? "✓ OK" : "✗ FAIL", `(recomputed ${v.recomputed.slice(0, 12)}…)`);
  if (!v.ok) throw new Error("verification failed for a real entry");

  // Tamper-evidence: a corrupted anchored hash must NOT verify.
  const tamperedEntry = { ...entry, dataHash: "00".repeat(32) };
  const bad = await tape.verifyEntry(tamperedEntry);
  console.log("tampered hash verifies:", bad.ok, "(must be false)");
  if (bad.ok) throw new Error("tamper-evidence broken!");

  const record = await tape.fetchRecord(entry.blobId);
  console.log("fetched record kind:", record.kind);

  console.log("\nINTEGRATION: OK — record→anchor→read→verify all pass on testnet.");
}

main().catch((e) => {
  console.error("INTEGRATION FAILED:", e?.message ?? e);
  process.exit(1);
});
