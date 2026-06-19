import { useMemo, useState, type FormEvent } from "react";
import { Kind } from "tape-sdk";
import type { MarkRecord, Metrics, TapeEntry, TapeRecord } from "tape-sdk";
import { CONFIG, SUI_EXPLORER } from "./config.ts";
import { useTape, type VerifyState } from "./useTape.ts";
import { clock, dec, metricCards, pct, short, type MetricCard } from "./view.ts";

const LOG_RE = /^0x[0-9a-fA-F]{64}$/;

function initialLogId(): string {
  const fromUrl = new URLSearchParams(window.location.search).get("log");
  return fromUrl && LOG_RE.test(fromUrl) ? fromUrl : CONFIG.tapeLog;
}

export function App() {
  const [logId, setLogId] = useState(initialLogId);
  const { data, error, verify, verifyAll, blobUrl } = useTape(logId);

  const loadLog = (id: string) => {
    setLogId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("log", id);
    window.history.replaceState(null, "", url);
  };

  return (
    <div className="wrap">
      <Bar logId={logId} entries={data?.entries.length ?? 0} isDemo={logId === CONFIG.tapeLog} onLoad={loadLog} />
      {error ? (
        <div className="state err">
          Couldn't read this TapeLog: {error}.<br />
          Make sure it's a TapeLog object id (one produced by the Tape SDK) on Sui testnet.
        </div>
      ) : !data ? (
        <div className="state">Reading the on-chain tape…</div>
      ) : (
        <Content data={data} verify={verify} verifyAll={verifyAll} blobUrl={blobUrl} />
      )}
    </div>
  );
}

function Content({ data, verify, verifyAll, blobUrl }: {
  data: NonNullable<ReturnType<typeof useTape>["data"]>;
  verify: VerifyState; verifyAll: () => void; blobUrl: (id: string) => string;
}) {
  const [selected, setSelected] = useState("sharpe");
  const { metrics: m, entries, records, txBySeq } = data;
  const cards = metricCards(m);
  const card = cards.find((c) => c.key === selected) ?? cards[0]!;

  return (
    <>
      <Hero m={m} verify={verify} onVerify={verifyAll} />
      <div className="explain">
        <span className="tic">✓</span> Every figure below is recomputed in your browser from the verified record — no
        trusted server. Select one to open and re-derive its proof.
      </div>
      <div className="metrics">
        {cards.map((c) => (
          <button key={c.key} className={`metric ${selected === c.key ? "active" : ""}`} onClick={() => setSelected(c.key)}>
            <div className="k">{c.label}</div>
            <div className={`v ${c.tone}`}>{c.value}</div>
            <div className="chk"><i />verified</div>
          </button>
        ))}
      </div>
      <div className="lower">
        <EquityChart entries={entries} records={records} />
        <ProofPanel card={card} entries={entries} txBySeq={txBySeq} verify={verify} onVerify={verifyAll} blobUrl={blobUrl} />
      </div>
      <Contrast m={m} />
      <Footer />
    </>
  );
}

function Bar({ logId, entries, isDemo, onLoad }: {
  logId: string; entries: number; isDemo: boolean; onLoad: (id: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const id = draft.trim();
    if (LOG_RE.test(id)) onLoad(id);
  };
  const valid = draft === "" || LOG_RE.test(draft.trim());
  return (
    <div className="bar">
      <div className="logo">Tape<span className="d">.</span></div>
      <div className="id">
        log {short(logId, 6, 4)}{isDemo ? " (demo)" : ""} · {entries} entries
      </div>
      <form className="logpick" onSubmit={submit}>
        <input
          className={valid ? "" : "bad"}
          value={draft}
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="verify any TapeLog: paste 0x… object id"
          aria-label="TapeLog object id"
        />
        <button type="submit" disabled={!LOG_RE.test(draft.trim())}>Load</button>
      </form>
      <div className="right"><span className="pill"><span className="p" />Live · Testnet</span></div>
    </div>
  );
}

function Hero({ m, verify, onVerify }: { m: Metrics; verify: VerifyState; onVerify: () => void }) {
  return (
    <div className="hero">
      <div className="head">
        <div className="kicker">VERIFIABLE TRACK RECORD</div>
        <h1>Performance you don't have to take on faith.</h1>
        <p>An autonomous agent's every decision, fill, and mark — written to Walrus, anchored on Sui. The numbers here
          are recomputed in your browser from that record.</p>
        <div className="kv">
          <div>Net return<b className={m.netReturn >= 0 ? "g" : "r"}>{pct(m.netReturn)}</b></div>
          <div>Closed trades<b>{m.closedTrades}</b></div>
          <div>Marks<b>{m.marks}</b></div>
          <div>Marked by<b>Pyth · Clock</b></div>
        </div>
      </div>
      <div className="marquee">
        <div className="lbl"><span className="seal">✓</span> Net return · after fees · verified</div>
        <div className={`big ${m.netReturn >= 0 ? "" : "neg"}`}>{pct(m.netReturn)}</div>
        <div className="since">vs Hold-SUI <span className="accent">{pct(m.benchmarkDelta)}</span> · ${m.startEquity.toFixed(2)} → ${m.endEquity.toFixed(2)}</div>
        <VerifyButton verify={verify} onVerify={onVerify} recomputedLabel={(v) => `recomputed ${pct(v.netReturn)}`} />
      </div>
    </div>
  );
}

function VerifyButton({ verify, onVerify, recomputedLabel }: {
  verify: VerifyState; onVerify: () => void; recomputedLabel: (m: NonNullable<VerifyState["recomputed"]>) => string;
}) {
  return (
    <>
      <button className="verify" onClick={onVerify} disabled={verify.running}>
        {verify.running ? `⟳ Re-deriving… ${verify.done}/${verify.total}` : "⟳  Verify this number independently"}
      </button>
      {verify.running && <div className="bar-progress"><span style={{ width: `${(verify.done / verify.total) * 100}%` }} /></div>}
      {verify.finished && (
        <div className={`vnote ${verify.failCount ? "fail" : ""}`}>
          {verify.failCount === 0
            ? `✓ re-fetched ${verify.okCount} blobs · re-hashed · all match on-chain${verify.recomputed ? ` · ${recomputedLabel(verify.recomputed)}` : ""}`
            : `✗ ${verify.failCount} of ${verify.total} blobs failed to verify`}
        </div>
      )}
    </>
  );
}

function EquityChart({ entries, records }: { entries: TapeEntry[]; records: TapeRecord[] }) {
  const marks = useMemo(
    () => entries.map((e, i) => ({ e, r: records[i] })).filter((x) => x.r?.kind === "mark") as { e: TapeEntry; r: MarkRecord }[],
    [entries, records],
  );
  const eq = marks.map((x) => x.r.equity);
  const min = Math.min(...eq), max = Math.max(...eq);
  const W = 560, H = 170, pad = 6;
  const pts = eq.map((v, i) => {
    const x = (i / Math.max(1, eq.length - 1)) * W;
    const y = pad + (1 - (v - min) / (max - min || 1)) * (H - 2 * pad);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const first = marks[0], last = marks[marks.length - 1];
  return (
    <div className="panel chart">
      <h3>Equity · marked at anchored Pyth prices</h3>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(94,234,212,.22)" /><stop offset="1" stopColor="rgba(94,234,212,0)" />
        </linearGradient></defs>
        {pts.length > 1 && <polygon fill="url(#g)" points={`${pts.join(" ")} ${W},${H} 0,${H}`} />}
        <polyline fill="none" stroke="#5eead4" strokeWidth="2.25" points={pts.join(" ")} />
      </svg>
      <div className="legend">
        <span>{first ? clock(first.e.timestampMs).slice(11) : ""} · ${eq[0]?.toFixed(2)}</span>
        <span>{last ? clock(last.e.timestampMs).slice(11) : ""} · ${eq[eq.length - 1]?.toFixed(2)}</span>
      </div>
    </div>
  );
}

function ProofPanel({ card, entries, txBySeq, verify, onVerify, blobUrl }: {
  card: MetricCard; entries: TapeEntry[]; txBySeq: Record<number, string>;
  verify: VerifyState; onVerify: () => void; blobUrl: (id: string) => string;
}) {
  const kind = card.basis === "mark" ? Kind.Mark : Kind.Execution;
  const used = entries.filter((e) => e.kind === kind);
  return (
    <div className="panel">
      <h3>Proof of "{card.label} = {card.value}" — every input is on-chain</h3>
      <div className="formula"><em>{card.formula}</em></div>
      <div className="explain-sm">{card.explain} Derived from {used.length} {card.basis} blobs:</div>
      <div className="entries">
        {used.slice(-5).map((e) => (
          <div className="erow" key={e.seq}>
            <span className="sq">#{e.seq}</span>
            <a className="chip" href={blobUrl(e.blobId)} target="_blank" rel="noreferrer">blob:{short(e.blobId)} ↗</a>
            {txBySeq[e.seq]
              ? <a className="chip tx" href={`${SUI_EXPLORER}/tx/${txBySeq[e.seq]}`} target="_blank" rel="noreferrer">tx:{short(txBySeq[e.seq]!)} ↗</a>
              : <span className="chip muted">anchored</span>}
            <span className="ts">{clock(e.timestampMs).slice(11)}</span>
          </div>
        ))}
        {used.length > 5 && <div className="more">+ {used.length - 5} more, all anchored</div>}
      </div>
      <VerifyButton verify={verify} onVerify={onVerify} recomputedLabel={() => "all numbers reproduced"} />
    </div>
  );
}

function Contrast({ m }: { m: Metrics }) {
  return (
    <div className="contrast">
      <div className="side good">
        <div className="tagline"><span className="dot g">✓</span> VERIFIED TAPE</div>
        <div className="n">{dec(m.sharpe)}</div>
        <div className="sub">Sharpe backed by an immutable, complete, Clock-timestamped record. Re-derivable by anyone. Cannot be backdated.</div>
      </div>
      <div className="vline" />
      <div className="side bad">
        <div className="tagline"><span className="dot r">✗</span> CLAIMED IN A DECK</div>
        <div className="n">4.20</div>
        <div className="sub">Sharpe asserted with no record behind it — possibly simulated, backdated, or invented. Trust required.</div>
      </div>
    </div>
  );
}

function Footer() {
  return (
    <p className="foot">
      Tape proves the history is <b>real</b> — tamper-evident, complete, and not backdated. It does not claim the
      strategy is good or that future returns will follow. Mark prices come from the Pyth oracle and are themselves
      anchored, so they can't be massaged after the fact; Tape inherits the oracle's trust assumption.
    </p>
  );
}
