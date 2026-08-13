import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const prismaMock = vi.hoisted(() => ({
  eventCategory: {
    findMany: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { GET, POST } from "@/app/api/categories/route";
import { DELETE } from "@/app/api/categories/[id]/route";

beforeEach(() => {
  vi.clearAllMocks();
});

function jsonRequest(body: unknown) {
  return new NextRequest("http://localhost/api/categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/categories", () => {
  it("merges built-in defaults with custom categories", async () => {
    prismaMock.eventCategory.findMany.mockResolvedValue([
      { id: "cat-1", name: "Side Project", colorHex: "#123456", sortOrder: 0, createdAt: new Date() },
    ]);
    const res = await GET();
    const body = await res.json();

    expect(body.some((c: { name: string }) => c.name === "University")).toBe(true);
    expect(body.some((c: { name: string }) => c.name === "Side Project")).toBe(true);
  });
});

describe("POST /api/categories", () => {
  it("creates a custom category", async () => {
    prismaMock.eventCategory.create.mockResolvedValue({ id: "cat-1", name: "Side Project", colorHex: "#123456" });
    const res = await POST(jsonRequest({ name: "Side Project", colorHex: "#123456" }));
    expect(res.status).toBe(201);
    expect(prismaMock.eventCategory.create).toHaveBeenCalledWith({
      data: { name: "Side Project", colorHex: "#123456" },
    });
  });

  it("rejects a name that collides with a built-in category", async () => {
    const res = await POST(jsonRequest({ name: "university", colorHex: "#123456" }));
    expect(res.status).toBe(400);
    expect(prismaMock.eventCategory.create).not.toHaveBeenCalled();
  });

  it("requires both name and colorHex", async () => {
    const res = await POST(jsonRequest({ name: "Side Project" }));
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/categories/[id]", () => {
  it("deletes a custom category", async () => {
    const res = await DELETE(new NextRequest("http://localhost/api/categories/cat-1", { method: "DELETE" }), {
      params: Promise.resolve({ id: "cat-1" }),
    });
    expect(res.status).toBe(200);
    expect(prismaMock.eventCategory.delete).toHaveBeenCalledWith({ where: { id: "cat-1" } });
  });
});
