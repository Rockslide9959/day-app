import { prisma } from "@/lib/prisma";

export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024; // 8MB — stored as a DB blob, no external storage configured

export const ATTACHMENT_LINKED_TYPES = ["todo", "schedule"] as const;
export type AttachmentLinkedType = (typeof ATTACHMENT_LINKED_TYPES)[number];

export function isAttachmentLinkedType(value: unknown): value is AttachmentLinkedType {
  return typeof value === "string" && (ATTACHMENT_LINKED_TYPES as readonly string[]).includes(value);
}

// Confirms linkedId actually refers to a row `userId` owns, so nobody can
// attach a file to (or list attachments on) another user's to-do/event by
// guessing its id.
export async function userOwnsLinkedItem(
  userId: string,
  linkedType: AttachmentLinkedType,
  linkedId: string
): Promise<boolean> {
  if (linkedType === "todo") {
    const todo = await prisma.todo.findFirst({ where: { id: linkedId, userId }, select: { id: true } });
    return Boolean(todo);
  }
  const item = await prisma.scheduleItem.findFirst({ where: { id: linkedId, userId }, select: { id: true } });
  return Boolean(item);
}
