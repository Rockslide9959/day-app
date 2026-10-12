import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { isValidDateStr } from "@/lib/validation";
import { validateTiptapDocument } from "@/lib/richText";

export const dynamic = "force-dynamic";

// Reverses one Quick Add result. The undo spec comes back from the client,
// so every branch re-checks ownership — a forged spec can only ever touch
// the caller's own rows.
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const undo = body?.undo as Record<string, unknown> | undefined;
  if (!undo || typeof undo !== "object") return NextResponse.json({ error: "Invalid undo" }, { status: 400 });
  const id = typeof undo.id === "string" ? undo.id : "";

  let count = 0;
  switch (undo.type) {
    case "delete": {
      if (undo.model === "scheduleItem") count = (await prisma.scheduleItem.deleteMany({ where: { id, userId } })).count;
      else if (undo.model === "todo") count = (await prisma.todo.deleteMany({ where: { id, userId } })).count;
      else if (undo.model === "habit") count = (await prisma.habit.deleteMany({ where: { id, userId } })).count;
      else if (undo.model === "notebookEntry") count = (await prisma.notebookEntry.deleteMany({ where: { id, userId } })).count;
      else return NextResponse.json({ error: "Invalid undo" }, { status: 400 });
      break;
    }
    case "uncompleteTodo":
      count = (await prisma.todo.updateMany({ where: { id, userId }, data: { completed: false } })).count;
      break;
    case "habitCount": {
      const habitId = typeof undo.habitId === "string" ? undo.habitId : "";
      const date = undo.date;
      const value = undo.count;
      if (!isValidDateStr(date) || !Number.isInteger(value) || (value as number) < 0 || (value as number) > 999) {
        return NextResponse.json({ error: "Invalid undo" }, { status: 400 });
      }
      const habit = await prisma.habit.findFirst({ where: { id: habitId, userId }, select: { id: true } });
      if (!habit) break;
      if (value === 0) await prisma.habitLog.deleteMany({ where: { habitId, date } });
      else {
        await prisma.habitLog.upsert({
          where: { habitId_date: { habitId, date } },
          create: { habitId, date, count: value as number },
          update: { count: value as number },
        });
      }
      count = 1;
      break;
    }
    case "journalRestore": {
      const content = typeof undo.content === "string" ? undo.content : null;
      const format = undo.contentFormat === "tiptap-json" ? "tiptap-json" : "plain";
      if (content === null || content.length > 200_000) return NextResponse.json({ error: "Invalid undo" }, { status: 400 });
      let richContent: Prisma.InputJsonValue | typeof Prisma.DbNull = Prisma.DbNull;
      if (format === "tiptap-json") {
        const valid = validateTiptapDocument(undo.richContent);
        if (!valid.ok) return NextResponse.json({ error: "Invalid undo" }, { status: 400 });
        richContent = valid.doc as unknown as Prisma.InputJsonValue;
      }
      count = (
        await prisma.notebookEntry.updateMany({
          where: { id, userId, entryType: "journal" },
          data: { content, contentFormat: format, richContent },
        })
      ).count;
      break;
    }
    default:
      return NextResponse.json({ error: "Invalid undo" }, { status: 400 });
  }

  if (count === 0) return NextResponse.json({ error: "Already gone" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
