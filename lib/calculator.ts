// Pure calculator engine for the Calculator page. Kept free of React so the
// reducer is trivially cheap per keystroke and fully unit-testable.
//
// The state is an expression of alternating number / operator tokens
// ("12", "+", "3", "×", "4") evaluated with normal precedence (× ÷ before
// + −), so the live preview under the expression always matches what = gives.

export type Operator = "+" | "−" | "×" | "÷";

export type CalcAction =
  | { type: "digit"; digit: string }
  | { type: "decimal" }
  | { type: "operator"; op: Operator }
  | { type: "equals" }
  | { type: "percent" }
  | { type: "negate" }
  | { type: "backspace" }
  | { type: "clearEntry" }
  | { type: "clearAll" }
  | { type: "memoryClear" }
  | { type: "memoryRecall" }
  | { type: "memoryAdd" }
  | { type: "memorySubtract" };

export interface CalcState {
  tokens: string[];
  /** Set right after "=": the next digit starts a fresh expression. */
  evaluated: boolean;
  /** The expression that produced the current result, e.g. "12 + 3 =". */
  lastExpression: string;
  error: boolean;
  memory: number;
}

export const initialCalcState: CalcState = {
  tokens: ["0"],
  evaluated: false,
  lastExpression: "",
  error: false,
  memory: 0,
};

const OPERATORS = new Set<string>(["+", "−", "×", "÷"]);
const MAX_DIGITS = 15;

export function isOperator(token: string | undefined): token is Operator {
  return token !== undefined && OPERATORS.has(token);
}

/** Rounds away binary float noise (0.1 + 0.2 → 0.3). */
function clean(n: number): number {
  return n === 0 ? 0 : parseFloat(n.toPrecision(12));
}

function toNumber(token: string): number {
  if (token === "-" || token === "" || token === "-0.") return 0;
  return parseFloat(token);
}

function numberToToken(n: number): string {
  const c = clean(n);
  // Exponential form for huge / tiny values keeps parseFloat round-trips exact.
  return Math.abs(c) >= 1e15 || (c !== 0 && Math.abs(c) < 1e-9) ? c.toExponential() : String(c);
}

/**
 * Evaluates a token list with precedence. A trailing operator is ignored so
 * the preview works mid-typing. Returns null on division by zero / overflow.
 */
export function evaluate(tokens: string[]): number | null {
  const t = isOperator(tokens[tokens.length - 1]) ? tokens.slice(0, -1) : tokens;
  if (t.length === 0) return 0;

  // First pass: × and ÷.
  const sums: number[] = [toNumber(t[0])];
  const sumOps: string[] = [];
  for (let i = 1; i < t.length; i += 2) {
    const op = t[i];
    const n = toNumber(t[i + 1] ?? "0");
    if (op === "×") sums[sums.length - 1] *= n;
    else if (op === "÷") {
      if (n === 0) return null;
      sums[sums.length - 1] /= n;
    } else {
      sumOps.push(op);
      sums.push(n);
    }
  }
  // Second pass: + and −.
  let result = sums[0];
  for (let i = 0; i < sumOps.length; i++) {
    result = sumOps[i] === "+" ? result + sums[i + 1] : result - sums[i + 1];
  }
  return Number.isFinite(result) ? clean(result) : null;
}

function lastIsNumber(tokens: string[]): boolean {
  return !isOperator(tokens[tokens.length - 1]);
}

function replaceLast(tokens: string[], value: string): string[] {
  return [...tokens.slice(0, -1), value];
}

/** The number to apply memory ops to: the expression's current value. */
function currentValue(state: CalcState): number {
  return evaluate(state.tokens) ?? 0;
}

export function calcReducer(state: CalcState, action: CalcAction): CalcState {
  // After an error, anything but memory recall/clear starts over.
  if (state.error && action.type !== "memoryClear") {
    const fresh = { ...initialCalcState, memory: state.memory };
    if (action.type === "digit" || action.type === "decimal" || action.type === "memoryRecall") {
      return calcReducer(fresh, action);
    }
    return fresh;
  }

  const { tokens } = state;
  const last = tokens[tokens.length - 1];

  switch (action.type) {
    case "digit": {
      if (state.evaluated) {
        return { ...state, tokens: [action.digit], evaluated: false, lastExpression: "" };
      }
      if (!lastIsNumber(tokens)) return { ...state, tokens: [...tokens, action.digit] };
      if (last === "0") return { ...state, tokens: replaceLast(tokens, action.digit) };
      if (last === "-0") return { ...state, tokens: replaceLast(tokens, "-" + action.digit) };
      if (last.replace(/[-.]/g, "").length >= MAX_DIGITS || /e/.test(last)) return state;
      return { ...state, tokens: replaceLast(tokens, last + action.digit) };
    }

    case "decimal": {
      if (state.evaluated) return { ...state, tokens: ["0."], evaluated: false, lastExpression: "" };
      if (!lastIsNumber(tokens)) return { ...state, tokens: [...tokens, "0."] };
      if (last.includes(".") || /e/.test(last)) return state;
      if (last === "-") return { ...state, tokens: replaceLast(tokens, "-0.") };
      return { ...state, tokens: replaceLast(tokens, last + ".") };
    }

    case "operator": {
      const base = { ...state, evaluated: false, lastExpression: "" };
      if (!lastIsNumber(tokens)) return { ...base, tokens: replaceLast(tokens, action.op) };
      // A lone "-" from ± on an empty entry: swap the pending operator instead.
      if (last === "-" && tokens.length > 1) {
        return { ...base, tokens: [...tokens.slice(0, -2), action.op] };
      }
      const cleaned = last.endsWith(".") ? last.slice(0, -1) : last;
      return { ...base, tokens: [...replaceLast(tokens, cleaned || "0"), action.op] };
    }

    case "equals": {
      if (state.evaluated) return state;
      const result = evaluate(tokens);
      const exprTokens = isOperator(last) ? tokens.slice(0, -1) : tokens;
      const lastExpression = exprTokens.map(formatToken).join(" ") + " =";
      if (result === null) {
        return { ...state, tokens: ["0"], error: true, evaluated: true, lastExpression };
      }
      return { ...state, tokens: [numberToToken(result)], evaluated: true, lastExpression };
    }

    case "percent": {
      if (!lastIsNumber(tokens)) return state;
      const n = toNumber(last);
      const op = tokens[tokens.length - 2];
      // "200 + 10%" → 200 + 20 (percent of the running total), like a
      // pocket calculator; with × ÷ or on its own it's just n / 100.
      let value = n / 100;
      if (op === "+" || op === "−") {
        const left = evaluate(tokens.slice(0, -2)) ?? 0;
        value = (left * n) / 100;
      }
      return { ...state, tokens: replaceLast(tokens, numberToToken(value)), evaluated: false, lastExpression: "" };
    }

    case "negate": {
      if (!lastIsNumber(tokens)) return { ...state, tokens: [...tokens, "-"] };
      const next = last.startsWith("-") ? last.slice(1) : "-" + last;
      return { ...state, tokens: replaceLast(tokens, next === "" ? "0" : next), evaluated: false, lastExpression: "" };
    }

    case "backspace": {
      if (state.evaluated) return { ...state, evaluated: false, lastExpression: "" };
      if (!lastIsNumber(tokens)) return { ...state, tokens: tokens.slice(0, -1) };
      const trimmed = /e/.test(last) ? "" : last.slice(0, -1);
      if (trimmed === "" || trimmed === "-") {
        return { ...state, tokens: tokens.length > 1 ? tokens.slice(0, -1) : ["0"] };
      }
      return { ...state, tokens: replaceLast(tokens, trimmed) };
    }

    case "clearEntry": {
      if (state.evaluated || tokens.length === 1) return { ...initialCalcState, memory: state.memory };
      if (!lastIsNumber(tokens)) return state;
      return { ...state, tokens: replaceLast(tokens, "0") };
    }

    case "clearAll":
      return { ...initialCalcState, memory: state.memory };

    case "memoryClear":
      return { ...state, memory: 0 };

    case "memoryAdd":
      return { ...state, memory: clean(state.memory + currentValue(state)) };

    case "memorySubtract":
      return { ...state, memory: clean(state.memory - currentValue(state)) };

    case "memoryRecall": {
      const m = numberToToken(state.memory);
      if (state.evaluated) return { ...state, tokens: [m], evaluated: false, lastExpression: "" };
      if (!lastIsNumber(tokens)) return { ...state, tokens: [...tokens, m] };
      return { ...state, tokens: replaceLast(tokens, m) };
    }
  }
}

/** Formats one token for display: thousands separators, keeps a typed "1." */
export function formatToken(token: string): string {
  if (isOperator(token)) return token;
  if (token === "-") return "−";
  if (/e/.test(token)) return token.replace("-", "−");
  const negative = token.startsWith("-");
  const body = negative ? token.slice(1) : token;
  const [int, frac] = body.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (negative ? "−" : "") + grouped + (frac !== undefined ? "." + frac : "");
}

export function formatNumber(n: number): string {
  return formatToken(numberToToken(n));
}

/** Maps a keyboard key to a calculator action (null = not ours). */
export function keyToAction(key: string): CalcAction | null {
  if (/^[0-9]$/.test(key)) return { type: "digit", digit: key };
  switch (key) {
    case ".":
    case ",":
      return { type: "decimal" };
    case "+":
      return { type: "operator", op: "+" };
    case "-":
      return { type: "operator", op: "−" };
    case "*":
    case "x":
    case "X":
      return { type: "operator", op: "×" };
    case "/":
      return { type: "operator", op: "÷" };
    case "Enter":
    case "=":
      return { type: "equals" };
    case "%":
      return { type: "percent" };
    case "Backspace":
      return { type: "backspace" };
    case "Delete":
      return { type: "clearEntry" };
    case "Escape":
      return { type: "clearAll" };
    case "F9":
    case "n":
    case "N":
      return { type: "negate" };
    default:
      return null;
  }
}
