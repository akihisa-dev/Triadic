import { checkedYen, yenToAmount } from "../domain/amounts";

type Fraction = { n: bigint; d: bigint };
function fraction(n: bigint, d = 1n): Fraction {
  if (d === 0n) throw new Error("0で割ることはできません。");
  if (d < 0n) { n = -n; d = -d; }
  let a = n < 0n ? -n : n, b = d;
  while (b) { const rest = a % b; a = b; b = rest; }
  return { n: n / a, d: d / a };
}

/** Input-only arithmetic: never evaluate code or store expressions as amounts. */
export function calculateAmountExpression(text: string): string {
  const source = text.trim();
  if (source.length > 512) throw new Error("計算式は512文字以内で入力してください。");
  if (!source.startsWith("=")) throw new Error("計算式は=で始めてください。");
  let position = 1;
  const spaces = () => { while (/\s/.test(source[position] ?? "") && position < source.length) position++; };
  const invalid = () => new Error("計算式を確認してください。数値・+・-・*・/・括弧が使えます。");
  const primary = (depth: number): Fraction => {
    if (depth > 32) throw new Error("計算式の括弧が深すぎます。");
    spaces();
    let sign = 1n;
    while (source[position] === "+" || source[position] === "-") {
      if (source[position++] === "-") sign = -sign;
      spaces();
    }
    if (source[position] === "(") {
      position++;
      const value = expression(depth + 1);
      spaces();
      if (source[position++] !== ")") throw invalid();
      return { n: value.n * sign, d: value.d };
    }
    const match = /^(?:\d+(?:\.\d*)?|\.\d+)/.exec(source.slice(position));
    if (!match) throw invalid();
    position += match[0].length;
    const [whole, decimal = ""] = match[0].split(".");
    return fraction(sign * BigInt((whole || "0") + decimal), 10n ** BigInt(decimal.length));
  };
  const product = (depth: number): Fraction => {
    let left = primary(depth);
    spaces();
    while (source[position] === "*" || source[position] === "/") {
      const operator = source[position++], right = primary(depth);
      left = operator === "*" ? fraction(left.n * right.n, left.d * right.d) : fraction(left.n * right.d, left.d * right.n);
      spaces();
    }
    return left;
  };
  const expression = (depth: number): Fraction => {
    let left = product(depth);
    spaces();
    while (source[position] === "+" || source[position] === "-") {
      const operator = source[position++], right = product(depth);
      left = fraction(left.n * right.d + (operator === "+" ? right.n : -right.n) * left.d, left.d * right.d);
      spaces();
    }
    return left;
  };
  const result = expression(0);
  if (position !== source.length) throw invalid();
  const yen = result.n * 1000n;
  if (yen % result.d !== 0n) throw new Error("計算結果に1円未満の端数があります。式を調整してください。");
  return yenToAmount(checkedYen(yen / result.d));
}
