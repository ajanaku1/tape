#[test_only]
module tape::tape_log_tests;

use std::string;
use sui::clock;
use sui::test_scenario as ts;
use tape::tape_log::{Self, TapeLog};

const AGENT: address = @0xA;
const STRANGER: address = @0xB;

fun blob(s: vector<u8>): std::string::String { string::utf8(s) }

#[test]
fun creates_empty_log() {
    let mut sc = ts::begin(AGENT);
    {
        let cap = tape_log::create(sc.ctx());
        transfer::public_transfer(cap, AGENT);
    };
    sc.next_tx(AGENT);
    {
        let log = sc.take_shared<TapeLog>();
        assert!(log.length() == 0, 0);
        assert!(log.next_seq() == 0, 1);
        ts::return_shared(log);
    };
    sc.end();
}

#[test]
fun appends_with_monotonic_seq_and_clock_timestamp() {
    let mut sc = ts::begin(AGENT);
    let cap = {
        tape_log::create(sc.ctx())
    };

    sc.next_tx(AGENT);
    let mut clock = clock::create_for_testing(sc.ctx());
    clock.set_for_testing(1_000);

    {
        let mut log = sc.take_shared<TapeLog>();

        let s0 = log.append(&cap, blob(b"blobDECISION"), tape_log::kind_decision(), b"hash0", &clock);
        assert!(s0 == 0, 0);

        clock.set_for_testing(2_500);
        let s1 = log.append(&cap, blob(b"blobEXEC"), tape_log::kind_execution(), b"hash1", &clock);
        assert!(s1 == 1, 1);

        clock.set_for_testing(9_999);
        let s2 = log.append(&cap, blob(b"blobMARK"), tape_log::kind_mark(), b"hash2", &clock);
        assert!(s2 == 2, 2);

        assert!(log.length() == 3, 3);
        assert!(log.next_seq() == 3, 4);

        // Ordering + content preserved, timestamps come from the clock.
        let e0 = log.borrow_entry(0);
        assert!(e0.entry_seq() == 0, 5);
        assert!(e0.entry_kind() == tape_log::kind_decision(), 6);
        assert!(e0.entry_blob_id() == blob(b"blobDECISION"), 7);
        assert!(e0.entry_data_hash() == b"hash0", 8);
        assert!(e0.entry_timestamp_ms() == 1_000, 9);

        let e1 = log.borrow_entry(1);
        assert!(e1.entry_timestamp_ms() == 2_500, 10);
        assert!(e1.entry_kind() == tape_log::kind_execution(), 11);

        let e2 = log.borrow_entry(2);
        assert!(e2.entry_timestamp_ms() == 9_999, 12);
        assert!(e2.entry_kind() == tape_log::kind_mark(), 13);

        ts::return_shared(log);
    };

    clock.destroy_for_testing();
    tape_log::destroy_cap_for_testing(cap);
    sc.end();
}

#[test]
#[expected_failure(abort_code = tape::tape_log::ENotLogOwner)]
fun stranger_cap_cannot_append() {
    let mut sc = ts::begin(AGENT);
    let agent_cap = tape_log::create(sc.ctx());
    let agent_log_id = agent_cap.cap_log();

    // A second, unrelated log → its cap must not work on the first log.
    sc.next_tx(STRANGER);
    let stranger_cap = tape_log::create(sc.ctx());

    sc.next_tx(AGENT);
    let clock = clock::create_for_testing(sc.ctx());
    {
        // take the AGENT's log specifically (two shared logs now exist)
        let mut log = sc.take_shared_by_id<TapeLog>(agent_log_id);
        // appending with the wrong cap aborts
        log.append(&stranger_cap, blob(b"x"), tape_log::kind_mark(), b"h", &clock);
        ts::return_shared(log);
    };

    clock.destroy_for_testing();
    tape_log::destroy_cap_for_testing(agent_cap);
    tape_log::destroy_cap_for_testing(stranger_cap);
    sc.end();
}

#[test]
#[expected_failure(abort_code = tape::tape_log::EUnknownKind)]
fun rejects_unknown_kind() {
    let mut sc = ts::begin(AGENT);
    let cap = tape_log::create(sc.ctx());

    sc.next_tx(AGENT);
    let clock = clock::create_for_testing(sc.ctx());
    {
        let mut log = sc.take_shared<TapeLog>();
        log.append(&cap, blob(b"x"), 7, b"h", &clock); // 7 > KIND_MAX
        ts::return_shared(log);
    };

    clock.destroy_for_testing();
    tape_log::destroy_cap_for_testing(cap);
    sc.end();
}
