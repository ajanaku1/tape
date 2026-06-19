/** Tracks the agent's position and cash as fills are applied, and marks equity. */
export class Portfolio {
  /** Base asset held (e.g. SUI). */
  position = 0;
  /** Quote cash (e.g. DBUSDC). */
  cash: number;

  constructor(startingCash: number) {
    this.cash = startingCash;
  }

  /** Apply a fill at `price` for `size` base units. Returns the realized quote + fee. */
  fill(action: "BUY" | "SELL", size: number, price: number, feeRate = 0.001) {
    const quote = size * price;
    const fee = quote * feeRate;
    if (action === "BUY") {
      this.position += size;
      this.cash -= quote + fee;
    } else {
      this.position -= size;
      this.cash += quote - fee;
    }
    return { quote, fee };
  }

  /** Mark-to-market equity = position valued at `price` + cash. */
  equity(price: number): number {
    return this.position * price + this.cash;
  }
}
