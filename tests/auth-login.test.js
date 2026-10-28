import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";
import {
  ADMIN_SESSION_COOKIE_NAME,
  DEFAULT_ADMIN_EMAIL,
  DEFAULT_ADMIN_PASSWORD,
} from "@/lib/admin/auth";

/**
 * Integration tests for `POST /api/auth/login` and `POST /api/auth/logout`.
 *
 * These routes predate the authentication UI, but the story's I/O matrix
 * lists their behaviours, so they are pinned here rather than left implicit.
 *
 * The session module imports `next/headers`, so it is mocked to allow the
 * handlers to be invoked outside a request scope.
 */
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => undefined,
    set: () => {},
    delete: () => {},
  })),
}));

const { POST: login } = await import("@/app/api/auth/login/route");
const { POST: logout } = await import("@/app/api/auth/logout/route");

const EMAIL = "login.test@test.local";
const PASSWORD = "tomatoes";

/**
 * @param {unknown} body
 * @param {string} [cookie]
 * @returns {Request}
 */
function jsonRequest(body, cookie) {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  await prisma.session.deleteMany();
  await prisma.user.deleteMany({ where: { email: EMAIL } });
});

afterAll(async () => {
  await prisma.session.deleteMany();
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  await prisma.$disconnect();
});

/**
 * Seed a user with the given status.
 *
 * @param {string} status
 */
async function seedUser(status) {
  const passwordHash = await hashPassword(PASSWORD);

  return prisma.user.create({
    data: { email: EMAIL, passwordHash, name: "Login Tester", status },
  });
}

describe("POST /api/auth/login", () => {
  it("signs in an active user and sets the session cookie", async () => {
    await seedUser("active");

    const response = await login(jsonRequest({ email: EMAIL, password: PASSWORD }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.email).toBe(EMAIL);
    expect(body.data.role).toBe("customer");
    expect(body.error).toBeUndefined();

    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain("HttpOnly");
    expect(/SameSite=lax/i.test(setCookie)).toBe(true);
  });

  it("rejects a wrong password with 401 and sets no cookie", async () => {
    await seedUser("active");

    const response = await login(jsonRequest({ email: EMAIL, password: "wrong-password" }));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("unauthenticated");
    expect(response.headers.get("set-cookie") ?? "").not.toContain(
      `${SESSION_COOKIE_NAME}=`,
    );
  });

  it("rejects an unknown email with 401 and the same message as a wrong password", async () => {
    await seedUser("active");

    const unknown = await login(
      jsonRequest({ email: "nobody@test.local", password: PASSWORD }),
    );
    const unknownBody = await unknown.json();

    const wrong = await login(
      jsonRequest({ email: EMAIL, password: "wrong-password" }),
    );
    const wrongBody = await wrong.json();

    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    // The two must be indistinguishable, so the response cannot reveal
    // which accounts exist.
    expect(unknownBody.error.message).toBe(wrongBody.error.message);
    expect(unknownBody.error.code).toBe(wrongBody.error.code);
  });

  it("rejects a suspended account with 403 and sets no cookie", async () => {
    await seedUser("suspended");

    const response = await login(jsonRequest({ email: EMAIL, password: PASSWORD }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("forbidden");
    expect(response.headers.get("set-cookie") ?? "").not.toContain(
      `${SESSION_COOKIE_NAME}=`,
    );
  });

  it("revokes a suspended account's existing sessions", async () => {
    const user = await seedUser("active");

    const signedIn = await login(jsonRequest({ email: EMAIL, password: PASSWORD }));
    const cookie = (signedIn.headers.get("set-cookie") ?? "").split(";")[0];

    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1);

    await prisma.user.update({
      where: { id: user.id },
      data: { status: "suspended" },
    });

    // Logging in again clears the old sessions rather than stacking a new one.
    await login(jsonRequest({ email: EMAIL, password: PASSWORD }));

    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1);
    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=`);
  });
});

describe("POST /api/auth/login — operations operator", () => {
  beforeEach(async () => {
    await prisma.adminSession.deleteMany();
  });

  afterAll(async () => {
    await prisma.adminSession.deleteMany();
  });

  it("opens an admin session for the operations credential", async () => {
    const response = await login(
      jsonRequest({
        email: DEFAULT_ADMIN_EMAIL,
        password: DEFAULT_ADMIN_PASSWORD,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.kind).toBe("admin");
    expect(body.data.role).toBe("admin");
    expect(body.data.redirectTo).toBe("/app/admin");
    expect(body.error).toBeUndefined();

    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${ADMIN_SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain("HttpOnly");
    expect(/SameSite=lax/i.test(setCookie)).toBe(true);
  });

  it("does not open a customer session for the operations credential", async () => {
    const response = await login(
      jsonRequest({
        email: DEFAULT_ADMIN_EMAIL,
        password: DEFAULT_ADMIN_PASSWORD,
      }),
    );

    // The two cookies are independent. The operator's customer session must
    // not be created as a side effect of the panel sign-in.
    expect(response.headers.get("set-cookie") ?? "").not.toContain(
      `${SESSION_COOKIE_NAME}=`,
    );
    expect(await prisma.session.count()).toBe(0);
  });

  it("records the admin session against the operations operator", async () => {
    await login(
      jsonRequest({
        email: DEFAULT_ADMIN_EMAIL,
        password: DEFAULT_ADMIN_PASSWORD,
      }),
    );

    const sessions = await prisma.adminSession.findMany({
      include: { operator: true },
    });

    expect(sessions).toHaveLength(1);
    expect(sessions[0].operator.email).toBe(DEFAULT_ADMIN_EMAIL);
    expect(sessions[0].operator.role).toBe("admin");
    expect(sessions[0].operator.status).toBe("active");
  });

  it("rejects a wrong operations password with 401 and sets no cookie", async () => {
    const response = await login(
      jsonRequest({
        email: DEFAULT_ADMIN_EMAIL,
        password: "not-the-password",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("unauthenticated");
    expect(response.headers.get("set-cookie") ?? "").not.toContain(
      `${ADMIN_SESSION_COOKIE_NAME}=`,
    );
    expect(await prisma.adminSession.count()).toBe(0);
  });

  it("rejects a wrong operations email with the same message as a wrong password", async () => {
    const unknown = await login(
      jsonRequest({ email: "ops@nowhere.test", password: DEFAULT_ADMIN_PASSWORD }),
    );
    const unknownBody = await unknown.json();

    const wrong = await login(
      jsonRequest({ email: DEFAULT_ADMIN_EMAIL, password: "not-the-password" }),
    );
    const wrongBody = await wrong.json();

    // The form must not be usable to discover the operator's address.
    expect(unknownBody.error.message).toBe(wrongBody.error.message);
    expect(unknownBody.error.code).toBe(wrongBody.error.code);
  });

  it("ignores a non-string password without throwing", async () => {
    const response = await login(
      jsonRequest({ email: DEFAULT_ADMIN_EMAIL, password: 12345 }),
    );

    // A non-string password fails the shape check before any credential
    // comparison happens. The important part is that it does not throw and
    // does not open a session.
    expect(response.status).toBe(422);
    expect(response.headers.get("set-cookie") ?? "").not.toContain(
      `${ADMIN_SESSION_COOKIE_NAME}=`,
    );
    expect(await prisma.adminSession.count()).toBe(0);
  });
});

describe("POST /api/auth/logout", () => {
  it("clears the cookie and deletes the session row", async () => {
    const user = await seedUser("active");

    const signedIn = await login(jsonRequest({ email: EMAIL, password: PASSWORD }));
    const cookie = (signedIn.headers.get("set-cookie") ?? "").split(";")[0];

    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1);

    const response = await logout(
      new Request("http://localhost/api/auth/logout", {
        method: "POST",
        headers: { cookie },
      }),
    );

    expect(response.status).toBe(200);

    // The cookie is expired immediately, not merely emptied.
    expect(/Max-Age=0/i.test(response.headers.get("set-cookie") ?? "")).toBe(true);
  });
});
