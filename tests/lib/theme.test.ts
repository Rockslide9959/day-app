import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  THEME_BOOTSTRAP_SCRIPT,
  THEME_COLOR,
  THEME_STORAGE_KEY,
  isThemePreference,
  readStoredThemePreference,
  resolveTheme,
  writeStoredThemePreference,
} from "@/lib/theme";

// Vitest's default environment here is Node (see vitest.config.ts), which
// has no `localStorage` global. Stubbing a minimal in-memory implementation
// exercises the real read/write/round-trip logic without pulling in jsdom.
function stubLocalStorage() {
  const store = new Map<string, string>();
  const impl: Pick<Storage, "getItem" | "setItem" | "removeItem"> = {
    getItem: (key) => (store.has(key) ? store.get(key)! : null),
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
  };
  // @ts-expect-error test-only global stub — no full Storage interface needed
  globalThis.localStorage = impl;
  return store;
}

describe("isThemePreference", () => {
  it("accepts the four supported values", () => {
    expect(isThemePreference("light")).toBe(true);
    expect(isThemePreference("dark")).toBe(true);
    expect(isThemePreference("system")).toBe(true);
    expect(isThemePreference("crimson")).toBe(true);
  });

  it("rejects anything else, including null/undefined/other types", () => {
    expect(isThemePreference("blue")).toBe(false);
    expect(isThemePreference("")).toBe(false);
    expect(isThemePreference(null)).toBe(false);
    expect(isThemePreference(undefined)).toBe(false);
    expect(isThemePreference(1)).toBe(false);
  });
});

describe("resolveTheme", () => {
  it("light stays light even when the OS prefers dark", () => {
    expect(resolveTheme("light", true)).toBe("light");
  });

  it("dark stays dark even when the OS prefers light", () => {
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("system follows whatever the OS currently reports", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("crimson stays crimson regardless of OS preference — it's never OS-driven", () => {
    expect(resolveTheme("crimson", true)).toBe("crimson");
    expect(resolveTheme("crimson", false)).toBe("crimson");
  });
});

describe("readStoredThemePreference / writeStoredThemePreference", () => {
  beforeEach(() => {
    stubLocalStorage();
  });

  afterEach(() => {
    // @ts-expect-error test-only cleanup
    delete globalThis.localStorage;
  });

  it("defaults a new user (nothing stored) to system", () => {
    expect(readStoredThemePreference()).toBe("system");
  });

  it("falls back to system when the stored value isn't a valid preference", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "blue");
    expect(readStoredThemePreference()).toBe("system");
  });

  it("survives a round trip — the value written is the value read back", () => {
    writeStoredThemePreference("dark");
    expect(readStoredThemePreference()).toBe("dark");

    writeStoredThemePreference("light");
    expect(readStoredThemePreference()).toBe("light");

    writeStoredThemePreference("crimson");
    expect(readStoredThemePreference()).toBe("crimson");
  });

  it("falls back to system when localStorage throws (e.g. blocked/quota)", () => {
    // @ts-expect-error test-only stub
    globalThis.localStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readStoredThemePreference()).toBe("system");
    expect(() => writeStoredThemePreference("dark")).not.toThrow();
  });
});

// THEME_BOOTSTRAP_SCRIPT is a hand-written string kept manually in sync with
// THEME_COLOR/resolveTheme (see the comment above its definition in
// lib/theme.ts) — a compiler can't catch a copy-paste mistake there. This
// doesn't prove the script's *logic* matches, but it does catch the most
// likely slip: updating one copy of a theme color/name and forgetting the
// other.
describe("THEME_BOOTSTRAP_SCRIPT stays in sync with THEME_COLOR", () => {
  it("embeds every resolved theme's color and the crimson preference name", () => {
    expect(THEME_BOOTSTRAP_SCRIPT).toContain(THEME_COLOR.light);
    expect(THEME_BOOTSTRAP_SCRIPT).toContain(THEME_COLOR.dark);
    expect(THEME_BOOTSTRAP_SCRIPT).toContain(THEME_COLOR.crimson);
    expect(THEME_BOOTSTRAP_SCRIPT).toContain("crimson");
  });
});
