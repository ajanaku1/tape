/**
 * Day-1 spike: prove a Walrus blob round-trip on testnet.
 *
 * Uses the public testnet publisher/aggregator HTTP API (free, no WAL-token
 * signing flow) to: store bytes -> get a content-addressed blobId -> read it
 * back -> confirm bytes are identical -> confirm storing the SAME content
 * yields the SAME blobId (content-addressing / tamper-evidence).
 */

const PUBLISHER = "https://publisher.walrus-testnet.walrus.space";
const AGGREGATOR = "https://aggregator.walrus-testnet.walrus.space";

async function store(bytes: Uint8Array, epochs = 2): Promise<string> {
  const res = await fetch(`${PUBLISHER}/v1/blobs?epochs=${epochs}`, {
    method: "PUT",
    body: bytes,
  });
  if (!res.ok) throw new Error(`store failed: ${res.status} ${await res.text()}`);
  const json: any = await res.json();
  const blobId =
    json.newlyCreated?.blobObject?.blobId ?? json.alreadyCertified?.blobId;
  if (!blobId) throw new Error(`no blobId in response: ${JSON.stringify(json)}`);
  return blobId;
}

async function read(blobId: string): Promise<Uint8Array> {
  const res = await fetch(`${AGGREGATOR}/v1/blobs/${blobId}`);
  if (!res.ok) throw new Error(`read failed: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

function eq(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

async function main() {
  const payload = {
    kind: "decision",
    reasoning: "SUI momentum positive; mid 1.42; open small long.",
    action: "BUY",
    size: 1.0,
    confidence: 0.62,
    nonce: "spike-fixed-1",
  };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));

  console.log(`storing ${bytes.length} bytes...`);
  const blobId = await store(bytes);
  console.log("blobId:", blobId);

  const got = await read(blobId);
  console.log("read back", got.length, "bytes; identical:", eq(bytes, got));
  if (!eq(bytes, got)) throw new Error("round-trip mismatch!");

  // Content addressing: same bytes -> same id.
  const blobId2 = await store(bytes);
  console.log("re-store same content -> same blobId:", blobId === blobId2, `(${blobId2})`);

  // Different bytes -> different id (tamper-evidence).
  const tampered = new TextEncoder().encode(JSON.stringify({ ...payload, size: 999 }));
  const blobId3 = await store(tampered);
  console.log("tampered content -> different blobId:", blobId !== blobId3, `(${blobId3})`);

  console.log("\nWALRUS ROUND-TRIP: OK");
  console.log("read URL:", `${AGGREGATOR}/v1/blobs/${blobId}`);
}

main().catch((e) => {
  console.error("WALRUS SPIKE FAILED:", e);
  process.exit(1);
});
