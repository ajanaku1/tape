import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { TapeConfig } from "./types.js";
import { WALRUS_TESTNET } from "./walrus-endpoints.js";

/** Load deploy/testnet.json into a TapeConfig. Node-only (reads the filesystem). */
export function loadTestnetConfig(): TapeConfig {
  const here = dirname(fileURLToPath(import.meta.url));
  const path = resolve(here, "../../deploy/testnet.json");
  const d = JSON.parse(readFileSync(path, "utf8"));
  return {
    rpc: d.rpc,
    packageId: d.packageId,
    tapeLog: d.tapeLog,
    tapeCap: d.tapeCap,
    walrusPublisher: WALRUS_TESTNET.publisher,
    walrusAggregator: WALRUS_TESTNET.aggregator,
  };
}
