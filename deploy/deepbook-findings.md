# DeepBook v3 testnet - Day-1 spike findings

**Verdict: VIABLE.** Connectivity, BalanceManager create+deposit, live quotes, and
order submission all work via `@mysten/deepbook-v3@0.12.30` + `@mysten/sui@1.45.2`.
Getting an actual *fill* needs two fixes (Day-2 wiring), neither a blocker.

## What works
- `new DeepBookClient({ client, address, env: "testnet" })` connects.
- `balanceManager.createAndShareBalanceManager()` → BalanceManager object created.
- `balanceManager.depositIntoManager(KEY, "SUI", amt)` → funds the manager (confirmed 0.2 SUI).
- `getQuoteQuantityOut(pool, baseQty)` returns the **real executable price + DEEP fee**.
- `placeLimitOrder(...)` builds + submits; mechanics are correct.

## Testnet quirks (cost us time - documented so Day 2 doesn't repeat them)
1. **`midPrice()` is garbage when a book side is empty.** SUI_DBUSDC returned
 `midPrice = 10000.05`, but `getQuoteQuantityOut(SUI_DBUSDC, 1)` returned
 `{ baseOut: 0, quoteOut: 0.1, deepRequired: 0.000098 }` → real price ≈ **0.1 DBUSDC/SUI**.
 **Always price orders from `getQuoteQuantityOut`, not `midPrice`.**
2. **`clientOrderId` must be numeric-string** (BigInt-convertible). `"tape-spike-1"` throws
 client-side; use `"1"`, `"2"`, ... (e.g. a counter or timestamp).
3. **Non-whitelisted pools need a small DEEP balance for fees.** `whitelisted("SUI_DBUSDC")=false`
 and the quote shows `deepRequired ≈ 0.0001 DEEP`. With 0 DEEP, the order aborts:
 `MoveAbort(pool::place_order_int, 8)`. Deposit a little DEEP into the manager first
 (testnet DEEP faucet / `DEEP` coin at `0x36dbef…58a8::deep::DEEP`).

## Testnet constants (from SDK)
- Pools: `SUI_DBUSDC` (base SUI / quote DBUSDC), `DEEP_SUI`, `DEEP_DBUSDC`, `DBUSDT_DBUSDC`.
- Coins: SUI (1e9), DEEP (1e6, `0x36dbef…58a8::deep::DEEP`), DBUSDC (1e6, `0xf7152c…e0d7::DBUSDC::DBUSDC`).
- Test BalanceManagers created during spike (0.2 SUI each, can reuse):
 `0x85de20b601b4db1f135eddcaf5d92c5a4b459654951b936b5af73f17d3d4ca3f`,
 `0xaadc54f46bd5189c29ab5644f93a7033313877f28f52b6675ac657d2005c8c4d`.

## Day-2 path to a real fill
1. Get DEEP test tokens; deposit ~0.1 DEEP into the agent's BalanceManager.
2. Price from `getQuoteQuantityOut`; place a marketable order (IOC limit at/through the
 quote, or `placeMarketOrder`) to actually take liquidity and read the fill.
3. **Fallback (PLAN §7, fully valid for the Walrus track):** if DEEP/fills stay flaky,
 record real DeepBook quotes as marks and fill at the quoted price. Execution venue is
 secondary; the verifiable Walrus record is the product.
