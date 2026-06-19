/** SHA-256 over the exact bytes stored on Walrus, as hex.
 *
 * This is the independent content hash anchored on-chain. Verification re-fetches
 * the blob, re-hashes it here, and checks the result equals the anchored `data_hash`
 * — so the blob bytes cannot have changed since anchoring. Uses Web Crypto, which
 * is identical in Node and the browser (the terminal). */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // Copy into a fresh ArrayBuffer-backed view (digest rejects SharedArrayBuffer-backed).
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesToHex(bytes: Uint8Array | number[]): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
