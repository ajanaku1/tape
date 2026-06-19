/** Minimal Walrus client over the public testnet publisher/aggregator HTTP API.
 *
 * Blobs are content-addressed: the publisher returns a `blobId` that is a function
 * of the bytes, so it doubles as a tamper-evidence handle. */

/** Shape of the publisher's PUT /v1/blobs response (the fields we use). */
interface StoreResponse {
  newlyCreated?: { blobObject?: { blobId?: string } };
  alreadyCertified?: { blobId?: string };
}

export class WalrusClient {
  constructor(
    private readonly publisher: string,
    private readonly aggregator: string,
  ) {}

  /** Store bytes; returns the content-addressed blobId. Retries transient failures. */
  async store(bytes: Uint8Array, epochs = 5, attempts = 3): Promise<string> {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await fetch(`${this.publisher}/v1/blobs?epochs=${epochs}`, {
          method: "PUT",
          // Fresh ArrayBuffer-backed copy: a valid BodyInit in both Node and the
          // browser, sidestepping cross-lib Uint8Array<ArrayBufferLike> variance.
          body: new Uint8Array(bytes),
        });
        if (!res.ok) throw new Error(`store ${res.status}: ${await res.text()}`);
        const json = (await res.json()) as StoreResponse;
        const blobId = json.newlyCreated?.blobObject?.blobId ?? json.alreadyCertified?.blobId;
        if (!blobId) throw new Error(`no blobId: ${JSON.stringify(json)}`);
        return blobId;
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 800 * (i + 1)));
      }
    }
    throw new Error(`Walrus store failed after ${attempts} attempts: ${lastErr}`);
  }

  /** Fetch blob bytes by id. Retries — aggregator reads are eventually consistent
   *  after a publisher certifies a blob (occasional 404/503 right after a write). */
  async read(blobId: string, attempts = 4): Promise<Uint8Array> {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await fetch(`${this.aggregator}/v1/blobs/${blobId}`);
        if (!res.ok) throw new Error(`read ${res.status}`);
        return new Uint8Array(await res.arrayBuffer());
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
      }
    }
    throw new Error(`Walrus read failed for ${blobId} after ${attempts} attempts: ${lastErr}`);
  }

  /** Public read URL — handy for drill-down links in the terminal. */
  readUrl(blobId: string): string {
    return `${this.aggregator}/v1/blobs/${blobId}`;
  }
}
