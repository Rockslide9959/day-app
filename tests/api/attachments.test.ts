import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const prismaMock = vi.hoisted(() => ({
  todo: { findFirst: vi.fn() },
  scheduleItem: { findFirst: vi.fn() },
  notebookEntry: { findFirst: vi.fn() },
  attachment: { findMany: vi.fn(), create: vi.fn(), findFirst: vi.fn(), deleteMany: vi.fn() },
}));

const authMock = vi.hoisted(() => ({ getCurrentUserId: vi.fn().mockResolvedValue("user-1") }));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth", () => authMock);

import { GET, POST } from "@/app/api/attachments/route";

beforeEach(() => {
  vi.clearAllMocks();
  authMock.getCurrentUserId.mockResolvedValue("user-1");
});

function uploadRequest(fields: Record<string, string>, file?: File) {
  const form = new FormData();
  if (file) form.append("file", file);
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return new NextRequest("http://localhost/api/attachments", { method: "POST", body: form });
}

describe("GET /api/attachments", () => {
  it("rejects an unknown linkedType", async () => {
    const res = await GET(
      new NextRequest("http://localhost/api/attachments?linkedType=routine&linkedId=r-1")
    );
    expect(res.status).toBe(400);
    expect(prismaMock.attachment.findMany).not.toHaveBeenCalled();
  });

  it("lists attachments for a notebook entry, scoped to the current user", async () => {
    prismaMock.attachment.findMany.mockResolvedValue([]);
    const res = await GET(
      new NextRequest("http://localhost/api/attachments?linkedType=notebook&linkedId=entry-1")
    );
    expect(res.status).toBe(200);
    expect(prismaMock.attachment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1", linkedType: "notebook", linkedId: "entry-1" } })
    );
  });
});

describe("POST /api/attachments", () => {
  it("attaches a file to a notebook entry the user owns", async () => {
    prismaMock.notebookEntry.findFirst.mockResolvedValue({ id: "entry-1" });
    prismaMock.attachment.create.mockResolvedValue({ id: "att-1", fileName: "shot.png" });

    const file = new File([new Uint8Array([1, 2, 3])], "shot.png", { type: "image/png" });
    const res = await POST(uploadRequest({ linkedType: "notebook", linkedId: "entry-1" }, file));

    expect(res.status).toBe(201);
    expect(prismaMock.attachment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "user-1", linkedType: "notebook", linkedId: "entry-1", mimeType: "image/png" }),
      })
    );
  });

  it("returns 404 when the notebook entry belongs to someone else", async () => {
    prismaMock.notebookEntry.findFirst.mockResolvedValue(null);

    const file = new File([new Uint8Array([1, 2, 3])], "shot.png", { type: "image/png" });
    const res = await POST(uploadRequest({ linkedType: "notebook", linkedId: "entry-1" }, file));

    expect(res.status).toBe(404);
    expect(prismaMock.attachment.create).not.toHaveBeenCalled();
  });

  it("rejects a request with no file", async () => {
    const res = await POST(uploadRequest({ linkedType: "notebook", linkedId: "entry-1" }));
    expect(res.status).toBe(400);
  });
});
