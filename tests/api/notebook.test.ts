import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const prismaMock = vi.hoisted(() => ({
  notebookEntry: {
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
}));

const authMock = vi.hoisted(() => ({ getCurrentUserId: vi.fn().mockResolvedValue("user-1") }));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth", () => authMock);

import { GET as listNotebook, POST as createNotebook } from "@/app/api/notebook/route";
import { PATCH as patchEntry, DELETE as deleteEntry } from "@/app/api/notebook/[id]/route";
import { GET as getDaily, POST as postDaily } from "@/app/api/notebook/daily/route";
import { GET as getDates } from "@/app/api/notebook/dates/route";

beforeEach(() => {
  vi.clearAllMocks();
  authMock.getCurrentUserId.mockResolvedValue("user-1");
});

function req(url: string, method: string, body?: unknown) {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function makeEntry(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "entry-1",
    userId: "user-1",
    title: "Untitled",
    content: "",
    entryType: "note",
    journalDate: null,
    tags: "",
    pinned: false,
    createdAt: new Date("2026-08-14T10:00:00.000Z"),
    updatedAt: new Date("2026-08-14T10:00:00.000Z"),
    ...overrides,
  };
}

describe("POST /api/notebook (create)", () => {
  it("creates a general note", async () => {
    prismaMock.notebookEntry.create.mockResolvedValue(makeEntry({ title: "Day App ideas", entryType: "note" }));

    const res = await createNotebook(
      req("http://localhost/api/notebook", "POST", { entryType: "note", title: "Day App ideas" })
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.entryType).toBe("note");
    expect(prismaMock.notebookEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "user-1", entryType: "note", journalDate: null }),
      })
    );
  });

  it("creates a journal entry with a local YYYY-MM-DD journalDate", async () => {
    prismaMock.notebookEntry.findFirst.mockResolvedValue(null);
    prismaMock.notebookEntry.create.mockResolvedValue(
      makeEntry({ entryType: "journal", journalDate: "2026-08-20", title: "First week back" })
    );

    const res = await createNotebook(
      req("http://localhost/api/notebook", "POST", {
        entryType: "journal",
        journalDate: "2026-08-20",
        title: "First week back",
      })
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.entryType).toBe("journal");
    expect(body.journalDate).toBe("2026-08-20");
  });

  it("ensures a note is stored with journalDate: null even if one is sent", async () => {
    prismaMock.notebookEntry.create.mockResolvedValue(makeEntry());

    await createNotebook(
      req("http://localhost/api/notebook", "POST", { entryType: "note", title: "x", journalDate: "2026-08-20" })
    );

    expect(prismaMock.notebookEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ journalDate: null }) })
    );
  });

  it("rejects an unsupported entryType", async () => {
    const res = await createNotebook(
      req("http://localhost/api/notebook", "POST", { entryType: "todo", title: "x" })
    );
    expect(res.status).toBe(400);
    expect(prismaMock.notebookEntry.create).not.toHaveBeenCalled();
  });

  it("rejects a journal entry without a valid journalDate", async () => {
    const res = await createNotebook(
      req("http://localhost/api/notebook", "POST", { entryType: "journal", title: "x" })
    );
    expect(res.status).toBe(400);
    expect(prismaMock.notebookEntry.create).not.toHaveBeenCalled();

    const res2 = await createNotebook(
      req("http://localhost/api/notebook", "POST", { entryType: "journal", journalDate: "not-a-date" })
    );
    expect(res2.status).toBe(400);
  });

  it("returns the existing entry instead of creating a duplicate journal entry for the same day", async () => {
    const existing = makeEntry({ id: "existing-1", entryType: "journal", journalDate: "2026-08-20" });
    prismaMock.notebookEntry.findFirst.mockResolvedValue(existing);

    const res = await createNotebook(
      req("http://localhost/api/notebook", "POST", { entryType: "journal", journalDate: "2026-08-20" })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.id).toBe("existing-1");
    expect(prismaMock.notebookEntry.create).not.toHaveBeenCalled();
  });

  it("allows two different users to each have a journal entry for the same date", async () => {
    prismaMock.notebookEntry.findFirst.mockResolvedValueOnce(null);
    prismaMock.notebookEntry.create.mockResolvedValueOnce(
      makeEntry({ userId: "user-1", entryType: "journal", journalDate: "2026-08-20" })
    );
    const res1 = await createNotebook(
      req("http://localhost/api/notebook", "POST", { entryType: "journal", journalDate: "2026-08-20" })
    );
    expect(res1.status).toBe(201);

    authMock.getCurrentUserId.mockResolvedValue("user-2");
    prismaMock.notebookEntry.findFirst.mockResolvedValueOnce(null);
    prismaMock.notebookEntry.create.mockResolvedValueOnce(
      makeEntry({ id: "entry-2", userId: "user-2", entryType: "journal", journalDate: "2026-08-20" })
    );
    const res2 = await createNotebook(
      req("http://localhost/api/notebook", "POST", { entryType: "journal", journalDate: "2026-08-20" })
    );
    expect(res2.status).toBe(201);
    expect(prismaMock.notebookEntry.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ data: expect.objectContaining({ userId: "user-2" }) })
    );
  });

  it("rejects when there's no session", async () => {
    authMock.getCurrentUserId.mockResolvedValue(null);
    const res = await createNotebook(
      req("http://localhost/api/notebook", "POST", { entryType: "note", title: "x" })
    );
    expect(res.status).toBe(401);
  });
});

describe("GET /api/notebook/daily", () => {
  it("fetches the daily journal entry for a date", async () => {
    prismaMock.notebookEntry.findFirst.mockResolvedValue(
      makeEntry({ entryType: "journal", journalDate: "2026-08-20" })
    );
    const res = await getDaily(req("http://localhost/api/notebook/daily?date=2026-08-20", "GET"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.journalDate).toBe("2026-08-20");
    expect(prismaMock.notebookEntry.findFirst).toHaveBeenCalledWith({
      where: { userId: "user-1", journalDate: "2026-08-20" },
    });
  });

  it("returns a clear empty result (null) when there's no entry for that date", async () => {
    prismaMock.notebookEntry.findFirst.mockResolvedValue(null);
    const res = await getDaily(req("http://localhost/api/notebook/daily?date=2026-08-20", "GET"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toBeNull();
  });

  it("creates the daily entry idempotently on POST, guarding against double submission", async () => {
    prismaMock.notebookEntry.findFirst.mockResolvedValueOnce(null);
    prismaMock.notebookEntry.create.mockResolvedValueOnce(
      makeEntry({ entryType: "journal", journalDate: "2026-08-20" })
    );
    const res1 = await postDaily(req("http://localhost/api/notebook/daily", "POST", { date: "2026-08-20" }));
    expect(res1.status).toBe(201);

    prismaMock.notebookEntry.findFirst.mockResolvedValueOnce(
      makeEntry({ entryType: "journal", journalDate: "2026-08-20" })
    );
    const res2 = await postDaily(req("http://localhost/api/notebook/daily", "POST", { date: "2026-08-20" }));
    expect(res2.status).toBe(200);
    expect(prismaMock.notebookEntry.create).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/notebook (search + filters)", () => {
  it("searches titles", async () => {
    prismaMock.notebookEntry.findMany.mockResolvedValue([makeEntry({ title: "Trip planning" })]);
    prismaMock.notebookEntry.count.mockResolvedValue(1);

    const res = await listNotebook(req("http://localhost/api/notebook?q=Trip", "GET"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.entries).toHaveLength(1);
    const where = prismaMock.notebookEntry.findMany.mock.calls[0][0].where;
    expect(where.userId).toBe("user-1");
    expect(where.OR).toEqual(
      expect.arrayContaining([{ title: { contains: "Trip", mode: "insensitive" } }])
    );
  });

  it("searches content", async () => {
    prismaMock.notebookEntry.findMany.mockResolvedValue([]);
    prismaMock.notebookEntry.count.mockResolvedValue(0);

    await listNotebook(req("http://localhost/api/notebook?q=started", "GET"));
    const where = prismaMock.notebookEntry.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual(
      expect.arrayContaining([{ content: { contains: "started", mode: "insensitive" } }])
    );
  });

  it("filters by journal", async () => {
    prismaMock.notebookEntry.findMany.mockResolvedValue([]);
    prismaMock.notebookEntry.count.mockResolvedValue(0);
    await listNotebook(req("http://localhost/api/notebook?type=journal", "GET"));
    expect(prismaMock.notebookEntry.findMany.mock.calls[0][0].where.entryType).toBe("journal");
  });

  it("filters by notes", async () => {
    prismaMock.notebookEntry.findMany.mockResolvedValue([]);
    prismaMock.notebookEntry.count.mockResolvedValue(0);
    await listNotebook(req("http://localhost/api/notebook?type=note", "GET"));
    expect(prismaMock.notebookEntry.findMany.mock.calls[0][0].where.entryType).toBe("note");
  });

  it("filters by pinned", async () => {
    prismaMock.notebookEntry.findMany.mockResolvedValue([]);
    prismaMock.notebookEntry.count.mockResolvedValue(0);
    await listNotebook(req("http://localhost/api/notebook?pinned=true", "GET"));
    expect(prismaMock.notebookEntry.findMany.mock.calls[0][0].where.pinned).toBe(true);
  });

  it("returns compact previews, not full content", async () => {
    prismaMock.notebookEntry.findMany.mockResolvedValue([
      makeEntry({ content: "x".repeat(1000) }),
    ]);
    prismaMock.notebookEntry.count.mockResolvedValue(1);

    const res = await listNotebook(req("http://localhost/api/notebook", "GET"));
    const body = await res.json();
    expect(body.entries[0].content).toBeUndefined();
    expect(body.entries[0].preview.length).toBeLessThan(1000);
  });
});

describe("PATCH /api/notebook/[id] (update)", () => {
  it("updates title, content, tags and pinned state", async () => {
    prismaMock.notebookEntry.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.notebookEntry.findUnique.mockResolvedValue(
      makeEntry({ title: "New title", content: "New content", tags: "work,ideas", pinned: true })
    );

    const res = await patchEntry(
      req("http://localhost/api/notebook/entry-1", "PATCH", {
        title: "New title",
        content: "New content",
        tags: "work,ideas",
        pinned: true,
      }),
      { params: Promise.resolve({ id: "entry-1" }) }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.title).toBe("New title");
    expect(prismaMock.notebookEntry.updateMany).toHaveBeenCalledWith({
      where: { id: "entry-1", userId: "user-1" },
      data: { title: "New title", content: "New content", tags: "work,ideas", pinned: true },
    });
  });

  it("never changes journalDate on a plain autosave PATCH that doesn't mention it", async () => {
    prismaMock.notebookEntry.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.notebookEntry.findUnique.mockResolvedValue(makeEntry());

    await patchEntry(
      req("http://localhost/api/notebook/entry-1", "PATCH", { content: "typing…" }),
      { params: Promise.resolve({ id: "entry-1" }) }
    );

    const data = prismaMock.notebookEntry.updateMany.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("journalDate");
    expect(data).not.toHaveProperty("entryType");
  });

  it("rejects a blank title", async () => {
    const res = await patchEntry(
      req("http://localhost/api/notebook/entry-1", "PATCH", { title: "   " }),
      { params: Promise.resolve({ id: "entry-1" }) }
    );
    expect(res.status).toBe(400);
    expect(prismaMock.notebookEntry.updateMany).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/notebook/[id]", () => {
  it("deletes an entry", async () => {
    prismaMock.notebookEntry.deleteMany.mockResolvedValue({ count: 1 });
    const res = await deleteEntry(req("http://localhost/api/notebook/entry-1", "DELETE"), {
      params: Promise.resolve({ id: "entry-1" }),
    });
    expect(res.status).toBe(200);
    expect(prismaMock.notebookEntry.deleteMany).toHaveBeenCalledWith({
      where: { id: "entry-1", userId: "user-1" },
    });
  });
});

describe("GET /api/notebook/dates (calendar range metadata)", () => {
  it("returns only the dates that have a journal entry, no titles or content", async () => {
    prismaMock.notebookEntry.findMany.mockResolvedValue([
      { journalDate: "2026-08-03" },
      { journalDate: "2026-08-20" },
    ]);
    const res = await getDates(req("http://localhost/api/notebook/dates?from=2026-08-01&to=2026-08-31", "GET"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual(["2026-08-03", "2026-08-20"]);
    expect(prismaMock.notebookEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ select: { journalDate: true } })
    );
  });
});
