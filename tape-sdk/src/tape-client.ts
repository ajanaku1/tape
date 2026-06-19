import { SuiClient } from "@mysten/sui/client";
import type { EventId } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import type { Signer } from "@mysten/sui/cryptography";
import { WalrusClient } from "./walrus.js";
import { sha256Hex, hexToBytes, bytesToHex } from "./hash.js";
import { Kind } from "./types.js";
import type {
  AnchorResult, DecisionRecord, ExecutionRecord, MarkRecord, TapeConfig, TapeEntry, TapeRecord,
} from "./types.js";

const SUI_CLOCK = "0x6";

/** Raw Move `Entry` struct fields as returned by getObject (all u64s as strings). */
interface RawEntry {
  seq: string;
  blob_id: string;
  kind: number;
  data_hash: number[];
  timestamp_ms: string;
}

const KIND_OF: Record<TapeRecord["kind"], Kind> = {
  decision: Kind.Decision,
  execution: Kind.Execution,
  mark: Kind.Mark,
};

/**
 * The Tape verification layer: write records as Walrus blobs anchored in the
 * on-chain TapeLog, and read/verify them back. Vault-agnostic — the reference
 * agent is just the first consumer.
 *
 * Construct without a signer for read-only use (the terminal); pass a signer
 * and `config.tapeCap` to write (the agent).
 */
export class TapeClient {
  readonly sui: SuiClient;
  readonly walrus: WalrusClient;

  constructor(
    private readonly config: TapeConfig,
    private readonly signer?: Signer,
  ) {
    this.sui = new SuiClient({ url: config.rpc });
    this.walrus = new WalrusClient(config.walrusPublisher, config.walrusAggregator);
  }

  // === Write (agent) ===

  /** Record the agent's pre-trade decision. */
  recordDecision(r: Omit<DecisionRecord, "kind">): Promise<AnchorResult> {
    return this.record({ kind: "decision", ...r });
  }

  /** Record a realized (or simulated) fill. */
  recordExecution(r: Omit<ExecutionRecord, "kind">): Promise<AnchorResult> {
    return this.record({ kind: "execution", ...r });
  }

  /** Record a mark-to-market snapshot. */
  recordMark(r: Omit<MarkRecord, "kind">): Promise<AnchorResult> {
    return this.record({ kind: "mark", ...r });
  }

  /** Serialize a record to a Walrus blob and anchor it in the TapeLog. */
  async record(record: TapeRecord): Promise<AnchorResult> {
    const bytes = new TextEncoder().encode(JSON.stringify(record));
    const blobId = await this.walrus.store(bytes);
    const dataHash = await sha256Hex(bytes);
    const kind = KIND_OF[record.kind];
    const { seq, anchorTx } = await this.anchor(blobId, kind, dataHash);
    return { seq, blobId, kind, dataHash, anchorTx };
  }

  /** Low-level: anchor an already-stored blob. Timestamp is set on-chain by Clock. */
  async anchor(blobId: string, kind: Kind, dataHashHex: string): Promise<{ seq: number; anchorTx: string }> {
    if (!this.signer || !this.config.tapeCap) {
      throw new Error("anchor requires a signer and config.tapeCap (writer mode)");
    }
    const tx = new Transaction();
    tx.moveCall({
      target: `${this.config.packageId}::tape_log::anchor`,
      arguments: [
        tx.object(this.config.tapeLog),
        tx.object(this.config.tapeCap),
        tx.pure.string(blobId),
        tx.pure.u8(kind),
        tx.pure.vector("u8", [...hexToBytes(dataHashHex)]),
        tx.object(SUI_CLOCK),
      ],
    });

    const res = await this.sui.signAndExecuteTransaction({
      transaction: tx,
      signer: this.signer,
      options: { showEvents: true, showEffects: true },
    });
    if (res.effects?.status?.status !== "success") {
      throw new Error(`anchor failed: ${res.effects?.status?.error}`);
    }
    const ev = res.events?.find((e) => e.type.endsWith("::tape_log::EntryAppended"));
    const seq = Number((ev?.parsedJson as { seq?: string } | undefined)?.seq ?? -1);
    return { seq, anchorTx: res.digest };
  }

  // === Read (terminal) ===

  /** Read every anchored entry from the TapeLog shared object, in seq order. */
  async getEntries(): Promise<TapeEntry[]> {
    const obj = await this.sui.getObject({ id: this.config.tapeLog, options: { showContent: true } });
    const content = obj.data?.content;
    if (!content || content.dataType !== "moveObject") throw new Error("TapeLog not found / not a move object");
    const fields = content.fields as unknown as {
      entries: Array<{ fields?: RawEntry } & Partial<RawEntry>>;
    };
    return fields.entries.map((e) => {
      const f = (e.fields ?? e) as RawEntry;
      return {
        seq: Number(f.seq),
        blobId: f.blob_id,
        kind: Number(f.kind) as Kind,
        dataHash: bytesToHex(f.data_hash),
        timestampMs: Number(f.timestamp_ms),
      } satisfies TapeEntry;
    });
  }

  /** Map each entry's seq → the Sui tx digest that anchored it (from EntryAppended
   *  events for this log). Lets the terminal deep-link every number to its txn. */
  async getAnchorTxs(): Promise<Record<number, string>> {
    const out: Record<number, string> = {};
    let cursor: EventId | null | undefined = null;
    do {
      const page = await this.sui.queryEvents({
        query: { MoveEventType: `${this.config.packageId}::tape_log::EntryAppended` },
        cursor,
        limit: 200,
      });
      for (const ev of page.data) {
        const pj = ev.parsedJson as { log?: string; seq?: string } | undefined;
        if (pj?.log === this.config.tapeLog && pj.seq !== undefined) out[Number(pj.seq)] = ev.id.txDigest;
      }
      cursor = page.hasNextPage ? page.nextCursor : null;
    } while (cursor);
    return out;
  }

  /** Fetch and JSON-parse the blob behind an entry. */
  async fetchRecord(blobId: string): Promise<TapeRecord> {
    const bytes = await this.walrus.read(blobId);
    return JSON.parse(new TextDecoder().decode(bytes)) as TapeRecord;
  }

  /**
   * Independently verify one entry: re-fetch its blob, re-hash the bytes, and
   * confirm the hash matches what was anchored on-chain. This is what the
   * terminal's "verify" button runs — no trust in any server.
   */
  async verifyEntry(entry: TapeEntry): Promise<{ ok: boolean; recomputed: string; anchored: string }> {
    const bytes = await this.walrus.read(entry.blobId);
    const recomputed = await sha256Hex(bytes);
    return { ok: recomputed === entry.dataHash, recomputed, anchored: entry.dataHash };
  }

  blobUrl(blobId: string): string {
    return this.walrus.readUrl(blobId);
  }
}
