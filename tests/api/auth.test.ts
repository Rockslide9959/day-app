import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { POST as signup } from "@/app/api/auth/signup/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { hashPassword } from "@/lib/passwords";
import { AUTH_COOKIE, verifySessionToken } from "@/lib/auth";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-value-not-used-in-prod";
});

beforeEach(() => {
  vi.clearAllMocks();
});

function jsonRequest(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/signup", () => {
  it("creates a new account and sets a valid session cookie", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({ id: "user-1", username: "newperson" });

    const res = await signup(jsonRequest("http://localhost/api/auth/signup", {
      username: "newperson",
      password: "password123",
    }));

    expect(res.status).toBe(200);
    const cookie = res.cookies.get(AUTH_COOKIE);
    expect(cookie).toBeDefined();
    expect(verifySessionToken(cookie!.value)).toBe("user-1");
  });

  it("rejects a username that's already taken", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "existing", username: "taken" });

    const res = await signup(jsonRequest("http://localhost/api/auth/signup", {
      username: "taken",
      password: "password123",
    }));

    expect(res.status).toBe(409);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it("rejects a weak password before touching the database", async () => {
    const res = await signup(jsonRequest("http://localhost/api/auth/signup", {
      username: "newperson",
      password: "short",
    }));
    expect(res.status).toBe(400);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/login", () => {
  it("logs in with correct credentials", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      username: "testuser42",
      passwordHash: hashPassword("CorrectHorse42!"),
    });

    const res = await login(jsonRequest("http://localhost/api/auth/login", {
      username: "testuser42",
      password: "CorrectHorse42!",
    }));

    expect(res.status).toBe(200);
    const cookie = res.cookies.get(AUTH_COOKIE);
    expect(verifySessionToken(cookie!.value)).toBe("user-1");
  });

  it("rejects the wrong password", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      username: "testuser42",
      passwordHash: hashPassword("CorrectHorse42!"),
    });

    const res = await login(jsonRequest("http://localhost/api/auth/login", {
      username: "testuser42",
      password: "wrong",
    }));

    expect(res.status).toBe(401);
  });

  it("gives the exact same status and message for a wrong password vs. an unknown username", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user-1",
      username: "testuser42",
      passwordHash: hashPassword("CorrectHorse42!"),
    });
    const wrongPasswordRes = await login(jsonRequest("http://localhost/api/auth/login", {
      username: "testuser42",
      password: "wrong",
    }));

    prismaMock.user.findUnique.mockResolvedValueOnce(null);
    const unknownUserRes = await login(jsonRequest("http://localhost/api/auth/login", {
      username: "nobody",
      password: "whatever1",
    }));

    expect(wrongPasswordRes.status).toBe(unknownUserRes.status);
    const [wrongBody, unknownBody] = await Promise.all([wrongPasswordRes.json(), unknownUserRes.json()]);
    // Same message either way — don't help an attacker enumerate usernames.
    expect(wrongBody.error).toBe(unknownBody.error);
  });
});

describe("POST /api/auth/logout", () => {
  it("clears the session cookie", async () => {
    const res = await logout();
    const cookie = res.cookies.get(AUTH_COOKIE);
    // Deleting a cookie sets it to expire immediately / empty value.
    expect(cookie?.value ?? "").toBe("");
  });
});
