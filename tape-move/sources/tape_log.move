/// TapeLog — the on-chain anchor for an autonomous trading agent's track record.
///
/// Every decision, execution, and mark price the agent produces is written to
/// Walrus (content-addressed blobs) and then *anchored* here: one append-only
/// `Entry` per blob, carrying the Walrus `blob_id`, the entry `kind`, an
/// independent content `data_hash`, and a `timestamp_ms` taken from the Sui
/// `Clock` at anchor time.
///
/// What this gives auditors:
///   1. Tamper-evidence  — `data_hash` is the blob's content hash; editing the
///      blob changes its hash and breaks the anchor.
///   2. Completeness      — `seq` is monotonic with no gaps; deletions/edits are
///      impossible because no such entrypoint exists.
///   3. Live, not backdated — `timestamp_ms` comes from `Clock`, never from a
///      value the agent supplies.
module tape::tape_log;

use std::string::String;
use sui::clock::Clock;
use sui::event;

// === Errors ===

/// The provided cap does not control this log.
const ENotLogOwner: u64 = 0;
/// `kind` was outside the known range.
const EUnknownKind: u64 = 1;

// === Entry kinds ===

/// The agent's reasoning + intended action (pre-trade).
const KIND_DECISION: u8 = 0;
/// The realized fill from the execution venue.
const KIND_EXECUTION: u8 = 1;
/// A mark-to-market price snapshot used for PnL.
const KIND_MARK: u8 = 2;
const KIND_MAX: u8 = 2;

// === Types ===

/// One anchored record. Stored by value inside the log's `entries` vector;
/// there is no API to mutate or remove an `Entry` once appended.
public struct Entry has store, copy, drop {
    /// Position in the append-only log; equals the entry's index.
    seq: u64,
    /// Walrus blob id (URL-safe base64) holding the full payload.
    blob_id: String,
    /// One of KIND_DECISION / KIND_EXECUTION / KIND_MARK.
    kind: u8,
    /// Independent content hash of the blob bytes (e.g. blake2b-256).
    data_hash: vector<u8>,
    /// Sui `Clock` time at anchor — the anti-backdating property.
    timestamp_ms: u64,
}

/// The shared, append-only registry. One per agent / strategy.
public struct TapeLog has key {
    id: UID,
    /// The cap id authorized to append. Pins the log to a single writer.
    owner_cap: ID,
    /// Monotonic next sequence number (also the next vector index).
    next_seq: u64,
    /// All entries, in append order.
    entries: vector<Entry>,
}

/// Authority to append to a specific `TapeLog`. Held by the agent.
public struct TapeCap has key, store {
    id: UID,
    log: ID,
}

// === Events === (let indexers/the terminal follow the tape without polling state)

public struct LogCreated has copy, drop {
    log: ID,
    cap: ID,
}

public struct EntryAppended has copy, drop {
    log: ID,
    seq: u64,
    blob_id: String,
    kind: u8,
    data_hash: vector<u8>,
    timestamp_ms: u64,
}

// === Create ===

/// Create a fresh log + its writer cap. Shares the log and transfers the cap
/// to the caller. Split out (vs `init`) so a vault can spin up its own tape.
public fun create(ctx: &mut TxContext): TapeCap {
    let log_uid = object::new(ctx);
    let log_id = log_uid.to_inner();
    let cap = TapeCap { id: object::new(ctx), log: log_id };
    let cap_id = object::id(&cap);

    let log = TapeLog {
        id: log_uid,
        owner_cap: cap_id,
        next_seq: 0,
        entries: vector[],
    };

    event::emit(LogCreated { log: log_id, cap: cap_id });
    transfer::share_object(log);
    cap
}

/// Convenience entrypoint: create a log and send the cap to the sender.
entry fun create_and_share(ctx: &mut TxContext) {
    let cap = create(ctx);
    transfer::public_transfer(cap, ctx.sender());
}

// === Append (the only state-changing operation) ===

/// Anchor one Walrus blob. `timestamp_ms` is read from `clock` here, so the
/// caller cannot backdate. Aborts unless `cap` is the log's authorized writer.
public fun append(
    log: &mut TapeLog,
    cap: &TapeCap,
    blob_id: String,
    kind: u8,
    data_hash: vector<u8>,
    clock: &Clock,
): u64 {
    assert!(object::id(cap) == log.owner_cap, ENotLogOwner);
    assert!(cap.log == object::id(log), ENotLogOwner);
    assert!(kind <= KIND_MAX, EUnknownKind);

    let seq = log.next_seq;
    let timestamp_ms = clock.timestamp_ms();

    log.entries.push_back(Entry {
        seq,
        blob_id,
        kind,
        data_hash,
        timestamp_ms,
    });
    log.next_seq = seq + 1;

    event::emit(EntryAppended {
        log: object::id(log),
        seq,
        blob_id,
        kind,
        data_hash,
        timestamp_ms,
    });

    seq
}

/// `append` wrapped as a transaction entrypoint.
entry fun anchor(
    log: &mut TapeLog,
    cap: &TapeCap,
    blob_id: String,
    kind: u8,
    data_hash: vector<u8>,
    clock: &Clock,
) {
    append(log, cap, blob_id, kind, data_hash, clock);
}

// === Read-only views ===

public fun length(log: &TapeLog): u64 { log.entries.length() }

public fun next_seq(log: &TapeLog): u64 { log.next_seq }

public fun owner_cap(log: &TapeLog): ID { log.owner_cap }

/// The log a given cap is authorized to write to.
public fun cap_log(cap: &TapeCap): ID { cap.log }

public fun borrow_entry(log: &TapeLog, seq: u64): &Entry {
    &log.entries[seq]
}

public fun entry_seq(e: &Entry): u64 { e.seq }
public fun entry_blob_id(e: &Entry): String { e.blob_id }
public fun entry_kind(e: &Entry): u8 { e.kind }
public fun entry_data_hash(e: &Entry): vector<u8> { e.data_hash }
public fun entry_timestamp_ms(e: &Entry): u64 { e.timestamp_ms }

// === Kind accessors (for SDK/tests) ===

public fun kind_decision(): u8 { KIND_DECISION }
public fun kind_execution(): u8 { KIND_EXECUTION }
public fun kind_mark(): u8 { KIND_MARK }

// === Test-only helpers ===

#[test_only]
public fun destroy_cap_for_testing(cap: TapeCap) {
    let TapeCap { id, log: _ } = cap;
    id.delete();
}
