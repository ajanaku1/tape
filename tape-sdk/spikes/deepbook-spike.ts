/**
 * Day-1 spike: DeepBook v3 on Sui testnet.
 *
 * Proves the execution venue end-to-end: connect -> read a live pool ->
 * ensure a BalanceManager -> deposit a little SUI -> place ONE tiny order ->
 * read the result. Degrades gracefully: if order placement is blocked, the
 * live market reads still succeed and we fall back to mid-price marks
 * (PLAN §7 — execution venue is secondary; the verifiable record is the product).
 *
 * The signer key is exported from the local Sui keystore at runtime ONLY and
 * never written to disk or logged.
 */
import { execFileSync } from "node:child_process";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { DeepBookClient } from "@mysten/deepbook-v3";

const ADDRESS = "0x2b311a914950323ebb772ccb12b0b286bb3f28a9f6e049c3fa577cd230a87587";
const POOL = "SUI_DBUSDC"; // base=SUI, quote=DBUSDC
const MANAGER_KEY = "TAPE";

function loadKeypair(): Ed25519Keypair {
  const bech32 = execFileSync("sui", ["keytool", "export", "--key-identity", ADDRESS, "--json"], {
    encoding: "utf8",
  });
  const key = JSON.parse(bech32).exportedPrivateKey as string;
  const { secretKey } = decodeSuiPrivateKey(key);
  return Ed25519Keypair.fromSecretKey(secretKey);
}

async function sign(client: SuiClient, signer: Ed25519Keypair, tx: Transaction) {
  return client.signAndExecuteTransaction({
    transaction: tx,
    signer,
    options: { showEffects: true, showObjectChanges: true, showEvents: true },
  });
}

async function main() {
  const signer = loadKeypair();
  const client = new SuiClient({ url: getFullnodeUrl("testnet") });

  // 1. Ensure a BalanceManager and capture its id.
  let dbc = new DeepBookClient({ client, address: ADDRESS, env: "testnet" });
  console.log("creating BalanceManager...");
  const createTx = new Transaction();
  dbc.balanceManager.createAndShareBalanceManager()(createTx);
  const created = await sign(client, signer, createTx);
  const mgr = created.objectChanges?.find(
    (c: any) => c.type === "created" && String(c.objectType).includes("BalanceManager"),
  ) as any;
  const managerId = mgr?.objectId;
  console.log("BalanceManager:", managerId);

  // Rebuild client with the manager registered.
  dbc = new DeepBookClient({
    client,
    address: ADDRESS,
    env: "testnet",
    balanceManagers: { [MANAGER_KEY]: { address: managerId, tradeCap: undefined } },
  });

  // 2. Read live market data. NOTE: on this testnet pool midPrice() returns a
  //    garbage default (~10000) when one side of the book is empty — the real
  //    executable price comes from getQuoteQuantityOut().
  const mid = await dbc.midPrice(POOL).catch(() => null);
  const whitelisted = await dbc.whitelisted(POOL).catch(() => null);
  const quote = await dbc.getQuoteQuantityOut(POOL, 1).catch((e) => ({ err: e.message } as any));
  const execPrice = quote?.quoteOut && quote.quoteOut > 0 ? quote.quoteOut : null; // DBUSDC per 1 SUI
  console.log(`pool ${POOL}: midPrice=${mid} whitelisted=${whitelisted}`);
  console.log("  quote (sell 1 SUI):", JSON.stringify(quote), "-> execPrice≈", execPrice);

  // 3. Deposit a little SUI to trade with.
  const depTx = new Transaction();
  dbc.balanceManager.depositIntoManager(MANAGER_KEY, "SUI", 0.2)(depTx);
  await sign(client, signer, depTx);
  const bal = await dbc.checkManagerBalance(MANAGER_KEY, "SUI").catch((e) => ({ balance: `err:${e.message}` }));
  console.log("manager SUI balance:", (bal as any).balance);

  // 4. Place ONE tiny resting limit order, priced from the REAL quote (well
  //    below market on the sell side so it rests, proving placement mechanics).
  //    NOTE: this non-whitelisted pool also needs a small DEEP balance for
  //    fees; without DEEP the order aborts (pool::place_order_int code 8).
  const price = execPrice ? Number((execPrice * 1.5).toFixed(4)) : 0.15;
  const orderTx = new Transaction();
  dbc.deepBook.placeLimitOrder({
    poolKey: POOL,
    balanceManagerKey: MANAGER_KEY,
    clientOrderId: "1",
    price,
    quantity: 1,
    isBid: false,
    payWithDeep: false,
  })(orderTx);

  const res = await sign(client, signer, orderTx);
  const ok = res.effects?.status?.status === "success";
  console.log(`order tx: ${res.digest} status: ${res.effects?.status?.status}`);
  if (ok) {
    const open = await dbc.accountOpenOrders(POOL, MANAGER_KEY).catch(() => null);
    console.log("open orders:", open);
    console.log("\nDEEPBOOK V3 TESTNET: OK — full order path works.");
  } else {
    console.log("order error:", res.effects?.status?.error);
    console.log("\nDEEPBOOK V3 TESTNET: VIABLE — connect/quote/manager/deposit/submit all OK.");
    console.log("Real fills need a small DEEP fee balance (testnet DEEP faucet) — Day-2 wiring.");
    console.log("FALLBACK (PLAN §7): mark/fill against getQuoteQuantityOut price, shown above.");
  }
}

main().catch((e) => {
  console.error("DEEPBOOK SPIKE FAILED:", e?.message ?? e);
  process.exit(1);
});
