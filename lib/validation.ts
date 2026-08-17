// Shared signup/login input rules — kept in one place so the signup
// route and any future "change password" feature agree on the rules.
export function validateUsername(username: unknown): string | null {
  if (typeof username !== "string") return "Username is required";
  const trimmed = username.trim();
  if (trimmed.length < 3 || trimmed.length > 32) return "Username must be 3–32 characters";
  if (!/^[a-zA-Z0-9_.-]+$/.test(trimmed)) {
    return "Username can only contain letters, numbers, and _ . -";
  }
  return null;
}

export function validatePassword(password: unknown): string | null {
  if (typeof password !== "string") return "Password is required";
  if (password.length < 8) return "Password must be at least 8 characters";
  return null;
}

const HH_MM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

// A 24-hour local wall-clock "HH:MM" — the format both the settings <input
// type="time"> and lib/timezone.ts#zonedTimeToUtc expect.
export function isValidTimeStr(value: unknown): value is string {
  return typeof value === "string" && HH_MM_RE.test(value);
}

// ScheduleItem.itemType — undefined is allowed (callers default it to
// "event"); anything else must be one of the two supported values.
export function validateItemType(itemType: unknown): string | null {
  if (itemType === undefined) return null;
  if (itemType !== "event" && itemType !== "task") {
    return "itemType must be \"event\" or \"task\"";
  }
  return null;
}

// NotebookEntry.entryType — undefined is allowed (callers default it to
// "note"); anything else must be one of the two supported values.
export function validateEntryType(entryType: unknown): string | null {
  if (entryType === undefined) return null;
  if (entryType !== "note" && entryType !== "journal") {
    return "entryType must be \"note\" or \"journal\"";
  }
  return null;
}

const DATE_STR_RE = /^\d{4}-\d{2}-\d{2}$/;

// A local "YYYY-MM-DD" calendar date (matching lib/dates.ts's convention,
// never a UTC timestamp) — rejects both malformed strings and impossible
// dates like "2026-02-30" by round-tripping through Date and checking the
// parts stuck.
export function isValidDateStr(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_STR_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

// journalDate is required (and must be a real local calendar date) for a
// journal entry, and must be absent/null for a general note.
export function validateJournalDate(entryType: string, journalDate: unknown): string | null {
  if (entryType === "journal") {
    if (!isValidDateStr(journalDate)) {
      return "journalDate must be a valid local date in YYYY-MM-DD format";
    }
    return null;
  }
  if (journalDate !== undefined && journalDate !== null) {
    return "journalDate must not be set for a note";
  }
  return null;
}

export const NOTEBOOK_TITLE_MAX_LENGTH = 200;
export const NOTEBOOK_TAGS_MAX_LENGTH = 300;
export const NOTEBOOK_CONTENT_MAX_LENGTH = 500_000;

export function validateNotebookTitle(title: unknown): string | null {
  if (typeof title !== "string" || title.trim().length === 0) {
    return "Title is required";
  }
  if (title.trim().length > NOTEBOOK_TITLE_MAX_LENGTH) {
    return `Title must be ${NOTEBOOK_TITLE_MAX_LENGTH} characters or fewer`;
  }
  return null;
}

export function validateNotebookTags(tags: unknown): string | null {
  if (tags === undefined) return null;
  if (typeof tags !== "string") return "tags must be a string";
  if (tags.length > NOTEBOOK_TAGS_MAX_LENGTH) {
    return `Tags must be ${NOTEBOOK_TAGS_MAX_LENGTH} characters or fewer`;
  }
  return null;
}

export function validateNotebookContent(content: unknown): string | null {
  if (content === undefined) return null;
  if (typeof content !== "string") return "content must be a string";
  if (content.length > NOTEBOOK_CONTENT_MAX_LENGTH) {
    return `Content must be ${NOTEBOOK_CONTENT_MAX_LENGTH.toLocaleString()} characters or fewer`;
  }
  return null;
}

// NotebookEntry.contentFormat — undefined is allowed (callers default it
// to "plain"); anything else must be one of the two supported values.
export function validateContentFormat(contentFormat: unknown): string | null {
  if (contentFormat === undefined) return null;
  if (contentFormat !== "plain" && contentFormat !== "tiptap-json") {
    return "contentFormat must be \"plain\" or \"tiptap-json\"";
  }
  return null;
}
