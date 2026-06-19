// Browser-safe barrel: pure reads, metrics, hashing, types.
// Node-only helpers live in separate entry points (not exported here):
//   ./config.js       — loadTestnetConfig (reads the filesystem)
//   ./signer-node.js  — loadKeypairFromKeystore (uses child_process)
export { TapeClient } from "./tape-client.js";
export { WalrusClient } from "./walrus.js";
export { sha256Hex, hexToBytes, bytesToHex } from "./hash.js";
export { computeMetrics } from "./metrics.js";
export { WALRUS_TESTNET } from "./walrus-endpoints.js";
export { Kind } from "./types.js";
export type { Metrics } from "./metrics.js";
export type {
  TapeConfig,
  TapeRecord,
  DecisionRecord,
  ExecutionRecord,
  MarkRecord,
  PriceSource,
  AnchorResult,
  TapeEntry,
} from "./types.js";
