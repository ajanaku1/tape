/** Node-only: load the agent's keypair from the local Sui keystore at runtime.
 *
 * The private key is exported into memory only — never written to disk or logged.
 * Do NOT import this from the browser/terminal bundle (it uses child_process). */
import { execFileSync } from "node:child_process";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";

export function loadKeypairFromKeystore(address: string): Ed25519Keypair {
  const out = execFileSync("sui", ["keytool", "export", "--key-identity", address, "--json"], {
    encoding: "utf8",
  });
  const key = JSON.parse(out).exportedPrivateKey as string;
  const { secretKey } = decodeSuiPrivateKey(key);
  return Ed25519Keypair.fromSecretKey(secretKey);
}
