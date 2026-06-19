# Tape - demo script (≤5 min)

A shot list and what to say. Keep it tight. The wow is the **Verify** click, not the returns.

---

## 0:00 - The problem (~30s)

On camera: a slick fund pitch deck screenshot. "+312% · Sharpe 4.2."

> "Every fund and every copy-trading bot reports whatever numbers it wants. This deck says plus three hundred percent. Maybe it's real. Maybe it's a backtest someone screenshotted. You have no way to tell. On-chain strategies should be different - the trades are right there - but nobody anchors them, so the reported performance is still just a claim. That's what Tape fixes."

---

## 0:30 - What Tape is (~25s)

One line, plus the architecture diagram from the README.

> "Tape is a verification layer for on-chain strategies. An autonomous agent writes every decision, fill, and mark to Walrus, and anchors each one on Sui with a Clock timestamp. The performance you see is recomputed from that record. Walrus is the part that makes it real - change one byte of any record and the hash stops matching."

---

## 0:55 - A live trade (~60s)

Terminal running `npm start` in `tape-agent`. Let one full iteration scroll.

> "Here's the agent. It pulls a real SUI price from Pyth, asks Claude for a decision..."

Point at the lines as they print:

> "...writes the decision to Walrus, gets a blobId back, then anchors that blobId, its hash, and the on-chain timestamp into the TapeLog. Same for the fill and the mark. The timestamp comes from Sui's Clock, not from the agent - so this can't be backdated. After a few of these we've got a real, timestamped track record."

Cut to a Sui explorer tab showing the `TapeLog` object with its entries, and a Walrus aggregator URL returning one blob's JSON.

---

## 1:55 - The terminal (~70s)

Open the terminal (Walrus Sites deployment, or local). Let it load the 65-entry record.

> "This is the terminal. It read the TapeLog on-chain, pulled all sixty-five blobs from Walrus, and recomputed every metric right here in the browser. No server. Net return, Sharpe, drawdown, win rate - all derived from the record."

Click a metric (Sharpe). The proof panel opens.

> "Pick any number and it shows you exactly where it came from: the Walrus blobs it used, the Sui transactions that anchored them, the timestamps. These chips are live links - blob on Walrus, transaction on Sui."

Now the key moment. Click **Verify**.

> "And here's the part that matters. Verify doesn't ask you to trust me. It re-fetches all sixty-five blobs, re-hashes every one, checks each against the on-chain anchor, and recomputes the numbers from scratch. Watch the counter."

Let the progress bar finish.

> "All sixty-five match. The number reproduced. A judge can do this themselves."

---

## 3:05 - The wow shot (~35s)

Scroll to the Verified-vs-Claimed cards.

> "So here's the contrast. On the left, our Sharpe, backed by a record anyone can re-derive. On the right, a number from a deck. Same kind of claim, completely different epistemics. Notice our real number is modest - the strategy actually lost a little over this session. That's the whole point. Real numbers can't be inflated. A small honest result you can verify beats a huge one you have to trust."

---

## 3:40 - The honest limit (~25s)

Point at the footer.

> "I want to be straight about what this proves. Tape proves the history is real: tamper-evident, complete, not backdated. It does not say the strategy is good, and the mark prices come from Pyth, so we inherit that oracle's trust. We say that plainly in the product and the README."

---

## 4:05 - The vision (~30s)

Back to the architecture diagram, point at the SDK box.

> "The logging layer is a vault-agnostic SDK. Today it backs one reference agent. The same three calls - record the decision, record the fill, anchor it - drop into any on-chain vault or copy-trading product. That turns 'trust my returns' into 'audit my returns.' That's the layer we're building, and Walrus is what makes it possible."

End card: logo + "Tape - the tape doesn't lie." + the TapeLog object id.

---

## Recording notes

- Pre-run the agent so the TapeLog already has the 65-entry record; show a fresh trade live but don't wait on a 14-minute session.
- Have the explorer + a Walrus blob URL open in tabs ahead of time.
- The Verify click is the emotional peak. Don't rush it - let the counter visibly tick.
- Total target: about 4:30, leaving buffer under 5:00.
