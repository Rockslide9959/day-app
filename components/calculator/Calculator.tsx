"use client";

import { memo, useEffect, useReducer, useRef, type Dispatch } from "react";
import {
  calcReducer,
  formatNumber,
  formatToken,
  evaluate,
  initialCalcState,
  isOperator,
  keyToAction,
  type CalcAction,
  type CalcState,
} from "@/lib/calculator";

// Built for speed: buttons fire on pointerdown (not click, so no wait for
// the finger to lift), keys are handled on a window listener, and the key
// grid is memoized so a keystroke only re-renders the display.

type Variant = "digit" | "op" | "fn" | "mem" | "equals";

interface Key {
  id: string;
  label: string;
  action: CalcAction;
  variant: Variant;
  aria: string;
}

const MEMORY_KEYS: Key[] = [
  { id: "mc", label: "MC", action: { type: "memoryClear" }, variant: "mem", aria: "Memory clear" },
  { id: "mr", label: "MR", action: { type: "memoryRecall" }, variant: "mem", aria: "Memory recall" },
  { id: "m+", label: "M+", action: { type: "memoryAdd" }, variant: "mem", aria: "Memory add" },
  { id: "m-", label: "M−", action: { type: "memorySubtract" }, variant: "mem", aria: "Memory subtract" },
];

const digit = (d: string): Key => ({ id: d, label: d, action: { type: "digit", digit: d }, variant: "digit", aria: d });

const MAIN_KEYS: Key[] = [
  { id: "clear", label: "AC", action: { type: "clearAll" }, variant: "fn", aria: "All clear" },
  { id: "back", label: "⌫", action: { type: "backspace" }, variant: "fn", aria: "Backspace" },
  { id: "%", label: "%", action: { type: "percent" }, variant: "fn", aria: "Percent" },
  { id: "÷", label: "÷", action: { type: "operator", op: "÷" }, variant: "op", aria: "Divide" },
  digit("7"), digit("8"), digit("9"),
  { id: "×", label: "×", action: { type: "operator", op: "×" }, variant: "op", aria: "Multiply" },
  digit("4"), digit("5"), digit("6"),
  { id: "−", label: "−", action: { type: "operator", op: "−" }, variant: "op", aria: "Subtract" },
  digit("1"), digit("2"), digit("3"),
  { id: "+", label: "+", action: { type: "operator", op: "+" }, variant: "op", aria: "Add" },
  { id: "neg", label: "±", action: { type: "negate" }, variant: "digit", aria: "Toggle sign" },
  digit("0"),
  { id: ".", label: ".", action: { type: "decimal" }, variant: "digit", aria: "Decimal point" },
  { id: "=", label: "=", action: { type: "equals" }, variant: "equals", aria: "Equals" },
];

/** Which on-screen key a keyboard action corresponds to (for the press flash). */
function keyIdFor(action: CalcAction): string | null {
  switch (action.type) {
    case "digit":
      return action.digit;
    case "operator":
      return action.op;
    case "decimal":
      return ".";
    case "equals":
      return "=";
    case "percent":
      return "%";
    case "negate":
      return "neg";
    case "backspace":
      return "back";
    case "clearAll":
    case "clearEntry":
      return "clear";
    default:
      return null;
  }
}

const BASE =
  "flex select-none items-center justify-center rounded-2xl font-medium transition-[transform,filter] duration-75 active:scale-95 active:brightness-90 data-pressed:scale-95 data-pressed:brightness-90 [touch-action:manipulation] [-webkit-tap-highlight-color:transparent]";

const VARIANTS: Record<Variant, string> = {
  digit:
    "h-16 text-2xl bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-900/5 dark:bg-zinc-900 dark:text-zinc-50 dark:ring-white/10 crimson:bg-crimson-surface crimson:text-crimson-text crimson:ring-crimson-border",
  fn: "h-16 text-xl bg-zinc-200/80 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 crimson:bg-crimson-raised crimson:text-crimson-text-secondary",
  op: "h-16 text-3xl bg-violet-500/10 text-violet-600 dark:bg-violet-400/15 dark:text-violet-300 crimson:bg-crimson-accent/15 crimson:text-crimson-highlight",
  equals:
    "h-16 text-3xl bg-linear-to-br from-violet-500 to-fuchsia-500 text-white shadow-md shadow-fuchsia-500/30 crimson:from-crimson-accent crimson:to-crimson-highlight crimson:shadow-crimson-accent/40",
  mem: "h-10 text-sm font-semibold text-zinc-500 hover:bg-zinc-900/5 dark:text-zinc-400 dark:hover:bg-white/5 crimson:text-crimson-text-muted crimson:hover:bg-crimson-raised",
};

const ACTIVE_OP =
  "!bg-violet-500 !text-white dark:!bg-violet-400 dark:!text-zinc-950 crimson:!bg-crimson-accent crimson:!text-crimson-text";

function press(dispatch: Dispatch<CalcAction>, action: CalcAction) {
  dispatch(action);
  // A tiny tick on Android; a no-op elsewhere.
  navigator.vibrate?.(4);
}

const KeyButton = memo(function KeyButton({
  k,
  dispatch,
  label,
  active,
}: {
  k: Key;
  dispatch: Dispatch<CalcAction>;
  label?: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      data-key={k.id}
      aria-label={label === "C" ? "Clear entry" : k.aria}
      aria-pressed={k.variant === "op" ? !!active : undefined}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        // Keeps focus (and the keyboard listener) where it was and stops
        // text selection on rapid taps.
        e.preventDefault();
        press(dispatch, label === "C" ? { type: "clearEntry" } : k.action);
      }}
      onClick={(e) => {
        // Keyboard / screen-reader activation (detail 0); pointer taps were
        // already handled on pointerdown.
        if (e.detail === 0) dispatch(label === "C" ? { type: "clearEntry" } : k.action);
      }}
      className={`${BASE} ${VARIANTS[k.variant]} ${active ? ACTIVE_OP : ""}`}
    >
      {label ?? k.label}
    </button>
  );
});

const KeyPad = memo(function KeyPad({
  dispatch,
  clearLabel,
  activeOp,
  hasMemory,
}: {
  dispatch: Dispatch<CalcAction>;
  clearLabel: "AC" | "C";
  activeOp: string | null;
  hasMemory: boolean;
}) {
  return (
    <div>
      <div className="mb-2 grid grid-cols-4 gap-2.5">
        {MEMORY_KEYS.map((k) => (
          <KeyButton
            key={k.id}
            k={k}
            dispatch={dispatch}
            active={false}
            label={k.id === "mr" && hasMemory ? "MR•" : undefined}
          />
        ))}
      </div>
      <div className="grid grid-cols-4 gap-2.5">
        {MAIN_KEYS.map((k) => (
          <KeyButton
            key={k.id}
            k={k}
            dispatch={dispatch}
            label={k.id === "clear" ? clearLabel : undefined}
            active={k.variant === "op" && activeOp === k.id}
          />
        ))}
      </div>
    </div>
  );
});

function Display({ state }: { state: CalcState }) {
  const { tokens, evaluated, error, lastExpression, memory } = state;
  const last = tokens[tokens.length - 1];

  let main: string;
  let sub: string;
  if (error) {
    main = "Error";
    sub = lastExpression;
  } else if (evaluated) {
    main = formatToken(tokens[0]);
    sub = lastExpression;
  } else {
    main = tokens.map(formatToken).join(" ");
    const preview = tokens.length > 1 && !(tokens.length === 2 && isOperator(last)) ? evaluate(tokens) : null;
    sub = preview === null ? "" : `= ${formatNumber(preview)}`;
  }

  // Shrink the main line as it grows so long expressions still fit.
  const len = main.length;
  const size = len <= 9 ? "text-6xl" : len <= 13 ? "text-5xl" : len <= 18 ? "text-4xl" : len <= 26 ? "text-3xl" : "text-2xl";

  return (
    <div className="relative mb-4 flex min-h-[9.5rem] flex-col justify-end rounded-3xl bg-white px-5 pb-4 pt-8 text-right shadow-sm ring-1 ring-zinc-900/5 dark:bg-zinc-900 dark:ring-white/10 crimson:bg-crimson-surface crimson:ring-crimson-border">
      {memory !== 0 && (
        <span
          title={`Memory: ${formatNumber(memory)}`}
          className="absolute left-4 top-3 rounded-full bg-violet-500/10 px-2 py-0.5 text-xs font-semibold text-violet-600 dark:text-violet-300 crimson:bg-crimson-accent/15 crimson:text-crimson-highlight"
        >
          M {formatNumber(memory)}
        </span>
      )}
      <div className="min-h-6 truncate text-base text-zinc-400 tabular-nums crimson:text-crimson-text-muted" aria-live="polite">
        {sub}
      </div>
      <div
        className={`${size} mt-1 break-all font-semibold leading-tight tracking-tight tabular-nums ${
          error ? "text-rose-500" : "text-zinc-900 dark:text-zinc-50 crimson:text-crimson-text"
        }`}
        role="status"
        aria-label={`Display ${main}`}
      >
        {main}
      </div>
    </div>
  );
}

export default function Calculator() {
  const [state, dispatch] = useReducer(calcReducer, initialCalcState);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      // Enter/Space on a focused key activates that key instead of "=".
      if (target?.tagName === "BUTTON" && (e.key === "Enter" || e.key === " ")) return;
      const action = keyToAction(e.key);
      if (!action) return;
      e.preventDefault();
      dispatch(action);

      // Flash the matching on-screen key, straight on the DOM so it costs no render.
      const id = keyIdFor(action);
      const el = id ? rootRef.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(id)}"]`) : null;
      if (el) {
        el.dataset.pressed = "";
        window.setTimeout(() => delete el.dataset.pressed, 90);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const last = state.tokens[state.tokens.length - 1];
  const activeOp = !state.evaluated && isOperator(last) ? last : null;
  // "C" clears just the number being typed; "AC" wipes everything.
  const clearLabel =
    !state.evaluated && !state.error && state.tokens.length > 1 && !isOperator(last) && last !== "0" ? "C" : "AC";

  return (
    <div ref={rootRef} className="mx-auto w-full max-w-sm">
      <Display state={state} />
      <KeyPad dispatch={dispatch} clearLabel={clearLabel} activeOp={activeOp} hasMemory={state.memory !== 0} />
      <p className="mt-4 hidden text-center text-xs text-zinc-400 sm:block crimson:text-crimson-text-muted">
        Type to calculate · Enter = · Esc clears · Backspace deletes
      </p>
    </div>
  );
}
