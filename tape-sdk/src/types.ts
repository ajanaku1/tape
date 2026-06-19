/** Shared types for the Tape verification layer. */

/** Entry kinds — mirror the `KIND_*` constants in the Move contract. */
export enum Kind {
  Decision = 0,
  Execution = 1,
  Mark = 2,
}

/** Deployment addresses (see deploy/testnet.json). */
export interface TapeConfig {
  rpc: string;
  packageId: string;
  tapeLog: string;
  /** Required only for writing (the agent). Readers (the terminal) omit it. */
  tapeCap?: string;
  walrusPublisher: string;
  walrusAggregator: string;
}

/** The agent's pre-trade reasoning + intent. */
export interface DecisionRecord {
  kind: "decision";
  iteration: number;
  asset: string;
  /** Observed market price (quote per base) the decision was made against. */
  observedPrice: number;
  reasoning: string;
  action: "BUY" | "SELL" | "HOLD";
  /** Base-asset size for the action (0 for HOLD). */
  size: number;
  confidence: number;
}

/** The realized fill (or simulated fill at the quoted price — see verification model). */
export interface ExecutionRecord {
  kind: "execution";
  iteration: number;
  asset: string;
  action: "BUY" | "SELL" | "HOLD";
  /** Price the fill executed at (quote per base). */
  price: number;
  /** Base quantity filled. */
  quantity: number;
  /** Quote spent/received. */
  quote: number;
  fee: number;
  /** "deepbook" for a real on-chain fill, "simulated" for a quote-priced fill. */
  venue: "deepbook" | "simulated";
  /** Sui txn digest of the fill when venue === "deepbook". */
  fillTx?: string;
}

/** Provenance of a price — so the mark is auditable to its source, not trusted. */
export interface PriceSource {
  /** e.g. "pyth". */
  source: string;
  /** The source's own publish time (unix seconds) for this price. */
  publishTime: number;
  /** Source confidence interval (± in quote units), if provided. */
  conf?: number;
}

/** A mark-to-market snapshot used for PnL. */
export interface MarkRecord {
  kind: "mark";
  iteration: number;
  asset: string;
  /** Mark price (quote per base) at this timestamp. */
  price: number;
  /** Where the price came from. */
  priceSource: PriceSource;
  /** Position held after the latest execution, in base units. */
  position: number;
  /** Quote (cash) balance after the latest execution. */
  cash: number;
  /** position * price + cash. */
  equity: number;
}

export type TapeRecord = DecisionRecord | ExecutionRecord | MarkRecord;

/** Result of writing one record (blob + anchor). */
export interface AnchorResult {
  seq: number;
  blobId: string;
  kind: Kind;
  dataHash: string; // hex
  anchorTx: string;
}

/** One anchored entry as read back from the TapeLog object. */
export interface TapeEntry {
  seq: number;
  blobId: string;
  kind: Kind;
  /** hex sha-256 the agent anchored. */
  dataHash: string;
  /** Sui Clock timestamp at anchor time. */
  timestampMs: number;
}
