import { useCallback, useEffect, useMemo, useState } from "react";
import { TapeClient, computeMetrics, sha256Hex } from "tape-sdk";
import type { Metrics, TapeEntry, TapeRecord } from "tape-sdk";
import { CONFIG } from "./config.ts";

const EMPTY_VERIFY: VerifyState = {
  running: false, done: 0, total: 0, okCount: 0, failCount: 0, finished: false,
};

export interface TapeData {
  entries: TapeEntry[];
  records: TapeRecord[];
  metrics: Metrics;
  /** seq → Sui tx digest that anchored it. */
  txBySeq: Record<number, string>;
}

export interface VerifyState {
  running: boolean;
  done: number;
  total: number;
  okCount: number;
  failCount: number;
  finished: boolean;
  /** Metrics recomputed from the freshly re-fetched + re-hashed blobs. */
  recomputed?: Metrics;
}

/** Read + verify a specific TapeLog (any object id, not just the demo one). */
export function useTape(logId: string) {
  const tape = useMemo(() => new TapeClient({ ...CONFIG, tapeLog: logId }), [logId]);
  const [data, setData] = useState<TapeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verify, setVerify] = useState<VerifyState>(EMPTY_VERIFY);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    setVerify(EMPTY_VERIFY);
    (async () => {
      try {
        const entries = await tape.getEntries();
        const [records, txBySeq] = await Promise.all([
          Promise.all(entries.map((e) => tape.fetchRecord(e.blobId))),
          tape.getAnchorTxs().catch(() => ({}) as Record<number, string>),
        ]);
        if (cancelled) return;
        setData({ entries, records, metrics: computeMetrics(records), txBySeq });
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => { cancelled = true; };
  }, [tape]);

  /**
   * Independent re-derivation: re-fetch every blob, re-hash it, compare to the
   * on-chain data_hash, and recompute the metrics from the fresh bytes. This is
   * the judge's "don't trust us, check it yourself" path — all client-side.
   */
  const verifyAll = useCallback(async () => {
    if (!data) return;
    const { entries } = data;
    setVerify({ running: true, done: 0, total: entries.length, okCount: 0, failCount: 0, finished: false });
    const fresh: TapeRecord[] = [];
    let ok = 0, fail = 0;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]!;
      try {
        const bytes = await tape.walrus.read(e.blobId);
        const hash = await sha256Hex(bytes);
        if (hash === e.dataHash) ok++; else fail++;
        fresh.push(JSON.parse(new TextDecoder().decode(bytes)) as TapeRecord);
      } catch {
        fail++;
      }
      setVerify((v) => ({ ...v, done: i + 1, okCount: ok, failCount: fail }));
    }
    setVerify((v) => ({
      ...v, running: false, finished: true,
      recomputed: fail === 0 ? computeMetrics(fresh) : undefined,
    }));
  }, [data, tape]);

  return { data, error, verify, verifyAll, blobUrl: (id: string) => tape.blobUrl(id) };
}
