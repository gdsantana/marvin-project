import { timingSafeEqual } from "node:crypto";
import { createAuthRepository, createDatabase, SESSION_MAX_AGE, type AuthSession } from "@finance/db";
export { hashPassword, verifyPassword } from "@finance/db";
export const sessionMaxAge = () => SESSION_MAX_AGE;
export const SESSION_COOKIE = "marvin_session";
export const CSRF_COOKIE = "marvin_csrf";
export type Session = Pick<AuthSession, "expiresAt" | "csrfToken">;

export function cookieOptions(httpOnly: boolean, maxAge: number) {
  return { httpOnly, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/", maxAge };
}

const globalAuth = globalThis as typeof globalThis & { marvinAuth?: ReturnType<typeof createAuthRepository> };
export function authApplication() {
  if (globalAuth.marvinAuth) return globalAuth.marvinAuth;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurado");
  globalAuth.marvinAuth = createAuthRepository(createDatabase(url).db);
  return globalAuth.marvinAuth;
}
export async function readSession(token: string | undefined) {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return authApplication().readSession(token);
}

export function originIsAllowed(request: Request) {
  const origin = request.headers.get("origin");
  const configured = process.env.APP_ORIGIN;
  if (!origin || !configured) return false;
  try { return origin === new URL(configured).origin; } catch { return false; }
}

export function csrfIsValid(request: Request, session: Session, csrfCookie: string | undefined) {
  return originIsAllowed(request)
    && Boolean(csrfCookie)
    && csrfCookie === session.csrfToken
    && request.headers.get("x-csrf-token") === session.csrfToken;
}

export function bearerIsValid(request: Request) {
  const configured = process.env.MCP_API_TOKEN;
  const supplied = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!configured || !supplied) return false;
  const expected = Buffer.from(configured);
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
