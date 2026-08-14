import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const prismaMock = vi.hoisted(() => ({
  notebookEntry: {
    create: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
}));

const authMock = vi.hoisted(() => ({ getCurrentUserId: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth", () => authMock);

import { GET as listNotebook } from "@/app/api/notebook/route";
import { GET as getEntry, PATCH as patchEntry, DELETE as deleteEntry } from "@/app/api/notebook/[id]/route";

beforeEach(() => {
  vi.clearAllMocks();
});

function req(url: string, method: string, body?: unknown) {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("notebook ownership enforcement", () => {
  it("returns 401 for GET /api/notebook/[id] when there's no session", async () => {
    authMock.getCurrentUserId.mockResolvedValue(null);
    const res = await getEntry(req("http://localhost/api/notebook/user-A-entry", "GET"), {
      params: Promise.resolve({ id: "user-A-entry" }),
    });
    expect(res.status).toBe(401);
    expect(prismaMock.notebookEntry.findFirst).not.toHaveBeenCalled();
  });

  it("returns 404 (not another user's entry) when reading someone else's entry", async () => {
    authMock.getCurrentUserId.mockResolvedValue("user-B");
    // findFirst's own {id, userId} filter naturally matches nothing when
    // the entry belongs to a different user.
    prismaMock.notebookEntry.findFirst.mockResolvedValue(null);

    const res = await getEntry(req("http://localhost/api/notebook/user-A-entry", "GET"), {
      params: Promise.resolve({ id: "user-A-entry" }),
    });

    expect(res.status).toBe(404);
    expect(prismaMock.notebookEntry.findFirst).toHaveBeenCalledWith({
      where: { id: "user-A-entry", userId: "user-B" },
    });
  });

  it("returns 404 when a logged-in user tries to edit someone else's entry", async () => {
    authMock.getCurrentUserId.mockResolvedValue("user-B");
    prismaMock.notebookEntry.updateMany.mockResolvedValue({ count: 0 });

    const res = await patchEntry(
      req("http://localhost/api/notebook/user-A-entry", "PATCH", { title: "hijacked" }),
      { params: Promise.resolve({ id: "user-A-entry" }) }
    );

    expect(res.status).toBe(404);
    expect(prismaMock.notebookEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "user-A-entry", userId: "user-B" } })
    );
  });

  it("returns 404 when a logged-in user tries to delete someone else's entry", async () => {
    authMock.getCurrentUserId.mockResolvedValue("user-B");
    prismaMock.notebookEntry.deleteMany.mockResolvedValue({ count: 0 });

    const res = await deleteEntry(req("http://localhost/api/notebook/user-A-entry", "DELETE"), {
      params: Promise.resolve({ id: "user-A-entry" }),
    });

    expect(res.status).toBe(404);
  });

  it("succeeds when the entry actually belongs to the requesting user", async () => {
    authMock.getCurrentUserId.mockResolvedValue("user-A");
    prismaMock.notebookEntry.deleteMany.mockResolvedValue({ count: 1 });

    const res = await deleteEntry(req("http://localhost/api/notebook/user-A-entry", "DELETE"), {
      params: Promise.resolve({ id: "user-A-entry" }),
    });

    expect(res.status).toBe(200);
  });

  it("excludes another user's entries from search results — the query is scoped to the requester", async () => {
    authMock.getCurrentUserId.mockResolvedValue("user-B");
    prismaMock.notebookEntry.findMany.mockResolvedValue([]);
    prismaMock.notebookEntry.count.mockResolvedValue(0);

    await listNotebook(req("http://localhost/api/notebook?q=vacation", "GET"));

    expect(prismaMock.notebookEntry.findMany.mock.calls[0][0].where.userId).toBe("user-B");
  });

  it("Previous/Next neighbor computation never crosses a user boundary", async () => {
    authMock.getCurrentUserId.mockResolvedValue("user-B");
    prismaMock.notebookEntry.findFirst.mockResolvedValue({
      id: "entry-b1",
      userId: "user-B",
      title: "x",
      content: "",
      entryType: "note",
      journalDate: null,
      tags: "",
      pinned: false,
      createdAt: new Date("2026-08-10"),
      updatedAt: new Date("2026-08-10"),
    });
    prismaMock.notebookEntry.findMany.mockResolvedValue([
      { id: "entry-b1", entryType: "note", journalDate: null, createdAt: new Date("2026-08-10") },
    ]);

    await getEntry(req("http://localhost/api/notebook/entry-b1", "GET"), {
      params: Promise.resolve({ id: "entry-b1" }),
    });

    expect(prismaMock.notebookEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-B" } })
    );
  });
});
