import { describe, expect, it } from "vitest";
import {
  calcReducer,
  evaluate,
  formatToken,
  initialCalcState,
  keyToAction,
  type CalcAction,
  type CalcState,
} from "@/lib/calculator";

/** Feeds a string of keyboard keys through the reducer. */
function typeKeys(keys: string[], start: CalcState = initialCalcState): CalcState {
  return keys.reduce((s, k) => {
    const a = keyToAction(k);
    if (!a) throw new Error(`unmapped key ${k}`);
    return calcReducer(s, a);
  }, start);
}
const keys = (s: string) => typeKeys(s.split(""));
const run = (s: CalcState, ...actions: CalcAction[]) => actions.reduce(calcReducer, s);

describe("calculator", () => {
  it("respects operator precedence", () => {
    expect(evaluate(["2", "+", "3", "×", "4"])).toBe(14);
    expect(evaluate(["10", "−", "6", "÷", "3"])).toBe(8);
  });

  it("evaluates on = and shows the expression", () => {
    const s = keys("12+3*4=");
    expect(s.tokens).toEqual(["24"]);
    expect(s.lastExpression).toBe("12 + 3 × 4 =");
  });

  it("cleans float noise", () => {
    expect(keys("0.1+0.2=").tokens).toEqual(["0.3"]);
  });

  it("starts fresh on a digit after =, continues on an operator", () => {
    expect(keys("2+2=5").tokens).toEqual(["5"]);
    expect(keys("2+2=*3=").tokens).toEqual(["12"]);
  });

  it("replaces a pending operator", () => {
    expect(keys("5+*2=").tokens).toEqual(["10"]);
  });

  it("ignores repeated decimals and leading zeros", () => {
    expect(keys("00.5.5").tokens).toEqual(["0.55"]);
  });

  it("errors on division by zero and recovers on the next digit", () => {
    const s = keys("5/0=");
    expect(s.error).toBe(true);
    expect(calcReducer(s, { type: "digit", digit: "7" })).toMatchObject({ error: false, tokens: ["7"] });
  });

  it("handles percent like a pocket calculator", () => {
    expect(keys("200+10%=").tokens).toEqual(["220"]);
    expect(keys("50*10%=").tokens).toEqual(["5"]);
    expect(keys("25%").tokens).toEqual(["0.25"]);
  });

  it("toggles sign", () => {
    expect(typeKeys(["5", "n", "+", "3", "="]).tokens).toEqual(["-2"]);
    expect(typeKeys(["5", "*", "n", "2", "="]).tokens).toEqual(["-10"]);
  });

  it("backspaces digits and operators", () => {
    expect(typeKeys(["1", "2", "3", "Backspace"]).tokens).toEqual(["12"]);
    expect(typeKeys(["1", "+", "Backspace"]).tokens).toEqual(["1"]);
    expect(typeKeys(["7", "Backspace"]).tokens).toEqual(["0"]);
  });

  it("clear entry keeps the rest of the expression", () => {
    expect(typeKeys(["8", "+", "5", "Delete", "2", "="]).tokens).toEqual(["10"]);
  });

  it("supports memory keys", () => {
    let s = keys("5+5=");
    s = run(s, { type: "memoryAdd" }, { type: "memoryAdd" });
    expect(s.memory).toBe(20);
    s = run(s, { type: "clearAll" });
    expect(s.memory).toBe(20);
    s = run(s, { type: "digit", digit: "2" }, { type: "operator", op: "×" }, { type: "memoryRecall" }, { type: "equals" });
    expect(s.tokens).toEqual(["40"]);
    s = run(s, { type: "memorySubtract" });
    expect(s.memory).toBe(-20);
    expect(run(s, { type: "memoryClear" }).memory).toBe(0);
  });

  it("formats with thousands separators while typing", () => {
    expect(formatToken("1234567.50")).toBe("1,234,567.50");
    expect(formatToken("-1000.")).toBe("−1,000.");
  });
});
