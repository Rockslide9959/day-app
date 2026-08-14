// Framework-agnostic debounced-save state machine, wrapped by
// components/notebook/useAutosave.ts for React. Kept free of DOM/React so
// its debounce/stale-response/offline-retry behaviour is unit-testable
// directly (see tests/lib/autosave.test.ts) without a browser environment.

export type AutosaveStatus = "idle" | "saving" | "saved" | "offline" | "error";

export type AutosaveOptions<T> = {
  // Milliseconds of inactivity before a pending change is saved.
  delayMs?: number;
  save: (value: T) => Promise<void>;
  onStatusChange?: (status: AutosaveStatus) => void;
  // Fired after a value is actually persisted — used by the notebook
  // editor to clear its localStorage recovery draft once the server has
  // that same version, never before.
  onSaved?: (value: T) => void;
};

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export class AutosaveController<T> {
  private readonly delayMs: number;
  private readonly options: AutosaveOptions<T>;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pendingValue: T | null = null;
  private savedValue: T | null = null;
  private requestSeq = 0;
  private status: AutosaveStatus = "idle";
  // Plain mutable field rather than an injected `isOnline()` callback —
  // callers (see components/notebook/useAutosave.ts) update it from
  // effects/event handlers via setOnline(), never read it via a ref
  // during render.
  private online = true;

  constructor(options: AutosaveOptions<T>) {
    this.options = options;
    this.delayMs = options.delayMs ?? 900;
  }

  getStatus(): AutosaveStatus {
    return this.status;
  }

  setOnline(online: boolean): void {
    this.online = online;
  }

  // Record the value the editor already reflects (e.g. right after
  // loading an existing entry) without triggering a save for it.
  markSaved(value: T): void {
    this.savedValue = value;
    this.pendingValue = value;
    this.setStatus("saved");
  }

  // Call on every value change. Debounces; does not issue a request per
  // keystroke.
  notify(value: T): void {
    this.pendingValue = value;
    if (this.timer) clearTimeout(this.timer);
    if (deepEqual(value, this.savedValue)) {
      this.setStatus("saved");
      return;
    }
    if (!this.online) {
      this.setStatus("offline");
      return;
    }
    this.timer = setTimeout(() => {
      this.flush();
    }, this.delayMs);
  }

  // Save immediately (used for the debounce firing, retry, going back
  // online, and flushing before navigating away with a pending change).
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.pendingValue === null || deepEqual(this.pendingValue, this.savedValue)) {
      if (this.status !== "saving") this.setStatus("saved");
      return;
    }
    if (!this.online) {
      this.setStatus("offline");
      return;
    }

    const value = this.pendingValue;
    const seq = ++this.requestSeq;
    this.setStatus("saving");
    try {
      await this.options.save(value);
      // A newer flush superseded this one while the request was in
      // flight — let that one own the final status instead of an older
      // response clobbering it.
      if (seq !== this.requestSeq) return;
      this.savedValue = value;
      this.setStatus("saved");
      this.options.onSaved?.(value);
    } catch {
      if (seq !== this.requestSeq) return;
      // Editor content itself lives in the caller's own state, untouched
      // here — a failed save never discards what's on screen, it just
      // leaves `pendingValue` unsaved so retry()/the next edit tries again.
      this.setStatus("error");
    }
  }

  retry(): Promise<void> {
    return this.flush();
  }

  hasUnsavedChanges(): boolean {
    return !deepEqual(this.pendingValue, this.savedValue);
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private setStatus(status: AutosaveStatus): void {
    this.status = status;
    this.options.onStatusChange?.(status);
  }
}
