import type { TapeConfig } from "tape-sdk";
import { WALRUS_TESTNET } from "tape-sdk";

/** Live testnet deployment (mirrors deploy/testnet.json). Read-only — no tapeCap. */
export const CONFIG: TapeConfig = {
  rpc: "https://fullnode.testnet.sui.io:443",
  packageId: "0x0add02ada3abf0f6e5d8205416a6193c6df379850b22ed08565e12d0cc2f7fd7",
  tapeLog: "0x0fd9dad1d1883f783423d124ba0d70c93a0f9542a7a34bce3cd865ae5f436ddb",
  walrusPublisher: WALRUS_TESTNET.publisher,
  walrusAggregator: WALRUS_TESTNET.aggregator,
};

export const AGENT = "0x2b311a914950323ebb772ccb12b0b286bb3f28a9f6e049c3fa577cd230a87587";
export const SUI_EXPLORER = "https://suiscan.xyz/testnet";
