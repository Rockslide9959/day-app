import { prisma } from "@/lib/prisma";

export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024; // 8MB — stored as a DB blob, no external storage configured

// "todo" — a daily to-do; "schedule" — a calendar event or task;
// "notebook" — a note or journal entry (NotebookEntry).
export const ATTACHMENT_LINKED_TYPES = ["todo", "schedule", "notebook"] as const;
export type AttachmentLinkedType = (typeof ATTACHMENT_LINKED_TYPES)[number];

export function isAttachmentLinkedType(value: unknown): value is AttachmentLinkedType {
  return typeof value === "string" && (ATTACHMENT_LINKED_TYPES as readonly string[]).includes(value);
}

// Confirms linkedId actually refers to a row `userId` owns, so nobody can
// attach a file to (or list attachments on) another user's to-do/event/
// note by guessing its id.
export async function userOwnsLinkedItem(
  userId: string,
  linkedType: AttachmentLinkedType,
  linkedId: string
): Promise<boolean> {
  if (linkedType === "todo") {
    const todo = await prisma.todo.findFirst({ where: { id: linkedId, userId }, select: { id: true } });
    return Boolean(todo);
  }
  if (linkedType === "notebook") {
    const entry = await prisma.notebookEntry.findFirst({ where: { id: linkedId, userId }, select: { id: true } });
    return Boolean(entry);
  }
  const item = await prisma.scheduleItem.findFirst({ where: { id: linkedId, userId }, select: { id: true } });
  return Boolean(item);
}

export function isImageMimeType(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

// Attachments use a loose reference rather than a real FK, so deleting the
// parent to-do/event/note doesn't cascade — the owning DELETE route calls
// this so blobs don't outlive the thing they were attached to.
export async function deleteAttachmentsFor(
  userId: string,
  linkedType: AttachmentLinkedType,
  linkedId: string
): Promise<void> {
  await prisma.attachment.deleteMany({ where: { userId, linkedType, linkedId } });
}
