/** A live market snapshot: the real SUI/USD price from the Pyth oracle. */
export interface Snapshot {
  asset: string;
  /** Real SUI/USD price from Pyth at `publishTime`. */
  price: number;
  /** Pyth confidence interval (±, USD). */
  conf: number;
  /** Pyth publish time (unix seconds) — the price's true observation time. */
  publishTime: number;
  source: "pyth";
}

// Pyth SUI/USD price feed (mainnet feed id, served by the public Hermes endpoint).
const HERMES = "https://hermes.pyth.network/v2/updates/price/latest";
const SUI_USD_FEED = "0x23d7315113f5b1d3ba7a83604c44b94d79f4fd69af77f804fc7f920a6dc65744";

interface HermesPrice {
  price: string;
  conf: string;
  expo: number;
  publish_time: number;
}
interface HermesResponse {
  parsed: Array<{ price: HermesPrice }>;
}

/**
 * Reads real SUI/USD from Pyth. This is the anchored mark price: it moves with
 * the real market and carries Pyth's own publish_time, so the record is both
 * realistic and tamper-evident once anchored. DeepBook v3 is the intended
 * execution venue (proven viable in the Day-1 spike — deploy/deepbook-findings.md);
 * its thin testnet pool quotes a frozen price, so fills are simulated at this
 * real oracle price and labeled honestly. We inherit Pyth's trust assumption,
 * stated plainly in the README verification model.
 */
export class Market {
  constructor(public readonly asset = "SUI/USD") {}

  async snapshot(attempts = 3): Promise<Snapshot> {
    let json: HermesResponse | undefined;
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await fetch(`${HERMES}?ids[]=${SUI_USD_FEED}`);
        if (!res.ok) throw new Error(`Pyth ${res.status}`);
        json = (await res.json()) as HermesResponse;
        break;
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 800 * (i + 1)));
      }
    }
    if (!json) throw new Error(`Pyth fetch failed after ${attempts} attempts: ${lastErr}`);
    const p = json.parsed[0]?.price;
    if (!p) throw new Error("no Pyth price in response");
    const scale = 10 ** p.expo;
    return {
      asset: this.asset,
      price: Number(p.price) * scale,
      conf: Number(p.conf) * scale,
      publishTime: p.publish_time,
      source: "pyth",
    };
  }
}
