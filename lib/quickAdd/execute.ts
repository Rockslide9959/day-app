// Server-only: carries out QuickActions against the database, scoped to one
// user, and describes how to undo each (see app/api/quick-add/undo).
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_CATEGORIES } from "@/lib/calendar/categories";
import { resolveTimeZone } from "@/lib/timezone";
import { getOrCreateJournalEntry } from "@/lib/notebook";
import { deriveDocPlainText, plainTextToTiptapDoc, validateTiptapDocument } from "@/lib/richText";
import { describeAction } from "./describe";
import type { QuickAction, QuickAddContext, QuickAddResult } from "./types";

export async function loadQuickAddContext(
  userId: string,
  today: string,
  nowMinutes: number,
  timeZone: string
): Promise<QuickAddContext> {
  const [habits, todos, custom] = await Promise.all([
    prisma.habit.findMany({
      where: { userId, archived: false },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, emoji: true, target: true, unit: true },
    }),
    prisma.todo.findMany({
      where: { userId, date: today, completed: false },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, title: true },
    }),
    prisma.eventCategory.findMany({ where: { userId }, orderBy: { sortOrder: "asc" }, select: { name: true } }),
  ]);
  return {
    today,
    nowMinutes,
    timeZone,
    habits,
    openTodos: todos,
    categories: [...DEFAULT_CATEGORIES.map((c) => c.name), ...custom.map((c) => c.name)],
  };
}

export async function executeActions(userId: string, actions: QuickAction[], ctx: QuickAddContext): Promise<QuickAddResult[]> {
  const results: QuickAddResult[] = [];
  for (const action of actions) {
    const base = { kind: action.kind, ...describeAction(action, ctx.today) };
    try {
      const { href, undo } = await executeOne(userId, action, ctx);
      results.push({ ...base, ok: true, href, undo });
    } catch (err) {
      console.error("quick-add: action failed", { kind: action.kind, err });
      results.push({ ...base, ok: false, href: null, undo: null, error: "Couldn't save this one" });
    }
  }
  return results;
}

async function executeOne(
  userId: string,
  a: QuickAction,
  ctx: QuickAddContext
): Promise<Pick<QuickAddResult, "href" | "undo">> {
  switch (a.kind) {
    case "event": {
      const allDay = !a.startTime;
      const item = await prisma.scheduleItem.create({
        data: {
          userId,
          itemType: "event",
          title: a.title,
          notes: a.notes,
          date: a.date,
          startTime: allDay ? "00:00" : a.startTime!,
          endTime: allDay ? "23:59" : a.endTime ?? a.startTime!,
          endDate: a.endDate ?? a.date,
          allDay,
          location: a.location,
          category: a.category,
          priority: a.priority,
          recurrence: a.recurrence,
          recurrenceDays: a.recurrenceDays,
          timeZone: resolveTimeZone(ctx.timeZone),
        },
      });
      return { href: `/calendar?date=${a.date}`, undo: { type: "delete", model: "scheduleItem", id: item.id } };
    }
    case "task": {
      const item = await prisma.scheduleItem.create({
        data: {
          userId,
          itemType: "task",
          title: a.title,
          notes: a.notes,
          date: a.date,
          startTime: a.dueTime ?? "00:00",
          endTime: a.dueTime ?? "23:59",
          endDate: a.date,
          allDay: !a.dueTime,
          category: a.category,
          priority: a.priority,
          timeZone: resolveTimeZone(ctx.timeZone),
        },
      });
      return { href: `/calendar?date=${a.date}`, undo: { type: "delete", model: "scheduleItem", id: item.id } };
    }
    case "todo": {
      const count = await prisma.todo.count({ where: { userId, date: a.date } });
      const todo = await prisma.todo.create({ data: { userId, title: a.title, date: a.date, sortOrder: count } });
      return { href: "/todos", undo: { type: "delete", model: "todo", id: todo.id } };
    }
    case "todo_complete": {
      const res = await prisma.todo.updateMany({ where: { id: a.todoId, userId }, data: { completed: true } });
      if (res.count === 0) throw new Error("to-do not found");
      return { href: "/todos", undo: { type: "uncompleteTodo", id: a.todoId } };
    }
    case "habit_create": {
      const count = await prisma.habit.count({ where: { userId } });
      const habit = await prisma.habit.create({
        data: { userId, name: a.name, emoji: a.emoji, color: a.color, target: a.target, unit: a.unit, days: a.days, sortOrder: count },
      });
      return { href: `/habits/${habit.id}`, undo: { type: "delete", model: "habit", id: habit.id } };
    }
    case "habit_log": {
      const habit = await prisma.habit.findFirst({ where: { id: a.habitId, userId }, select: { id: true, target: true } });
      if (!habit) throw new Error("habit not found");
      const existing = await prisma.habitLog.findUnique({ where: { habitId_date: { habitId: habit.id, date: a.date } } });
      const before = existing?.count ?? 0;
      const next = Math.min(999, a.amount == null ? Math.max(before, habit.target) : before + a.amount);
      await prisma.habitLog.upsert({
        where: { habitId_date: { habitId: habit.id, date: a.date } },
        create: { habitId: habit.id, date: a.date, count: next },
        update: { count: next },
      });
      return { href: `/habits/${habit.id}`, undo: { type: "habitCount", habitId: habit.id, date: a.date, count: before } };
    }
    case "note": {
      const entry = await prisma.notebookEntry.create({
        data: { userId, title: a.title.slice(0, 200), content: a.content, entryType: "note", contentFormat: "plain" },
      });
      return { href: `/notebook/${entry.id}`, undo: { type: "delete", model: "notebookEntry", id: entry.id } };
    }
    case "journal": {
      const { entry, created } = await getOrCreateJournalEntry(userId, a.date);
      const prev = { content: entry.content, contentFormat: entry.contentFormat, richContent: entry.richContent };
      if (entry.contentFormat === "tiptap-json" && entry.richContent) {
        const valid = validateTiptapDocument(entry.richContent);
        const doc = valid.ok ? valid.doc : plainTextToTiptapDoc(entry.content);
        const existingBlocks = deriveDocPlainText(doc) ? doc.content : [];
        const merged = { ...doc, content: [...existingBlocks, ...plainTextToTiptapDoc(a.content).content] };
        await prisma.notebookEntry.update({
          where: { id: entry.id },
          data: { richContent: merged as unknown as Prisma.InputJsonValue, content: deriveDocPlainText(merged) },
        });
      } else {
        await prisma.notebookEntry.update({
          where: { id: entry.id },
          data: { content: entry.content.trim() ? `${entry.content.trimEnd()}\n\n${a.content}` : a.content },
        });
      }
      return {
        href: `/notebook/${entry.id}`,
        undo: created
          ? { type: "delete", model: "notebookEntry", id: entry.id }
          : { type: "journalRestore", id: entry.id, ...prev },
      };
    }
  }
}
