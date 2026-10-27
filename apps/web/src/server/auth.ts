import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
export const SESSION_COOKIE = "marvin_session";
export const CSRF_COOKIE = "marvin_csrf";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export type Session = { expiresAt: number; csrfToken: string };

export function cookieOptions(httpOnly: boolean, maxAge: number) {
  return { httpOnly, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/", maxAge };
}

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || Buffer.byteLength(value) < 32) throw new Error("SESSION_SECRET deve ter ao menos 32 bytes");
  return value;
}

export async function verifyPassword(password: string, stored: string) {
  const [algorithm, salt, expectedHex] = stored.split("$");
  if (algorithm !== "scrypt" || !salt || !/^[a-f0-9]{128}$/i.test(expectedHex ?? "")) return false;
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(expectedHex, "hex");
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${hash.toString("hex")}`;
}

export function signSession(session: Session) {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  const signature = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function readSession(token: string | undefined): Session | null {
  if (!token) return null;
  try {
    const [payload, signature] = token.split(".");
    if (!payload || !signature) return null;
    const expected = createHmac("sha256", secret()).update(payload).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString()) as Session;
    return Number.isSafeInteger(parsed.expiresAt) && parsed.expiresAt > Date.now() && typeof parsed.csrfToken === "string" ? parsed : null;
  } catch {
    return null;
  }
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

type Attempts = { count: number; resetAt: number };
const loginAttempts = new Map<string, Attempts>();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;

export function checkLoginRateLimit(address: string, now = Date.now()) {
  const current = loginAttempts.get(address);
  if (!current || current.resetAt <= now) {
    loginAttempts.set(address, { count: 0, resetAt: now + LOGIN_WINDOW_MS });
  }
  const entry = loginAttempts.get(address)!;
  return entry.count < LOGIN_MAX_ATTEMPTS;
}

export function recordLoginFailure(address: string, now = Date.now()) {
  const current = loginAttempts.get(address);
  if (!current || current.resetAt <= now) loginAttempts.set(address, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
  else current.count += 1;
}

export function clearLoginFailures(address: string) {
  loginAttempts.delete(address);
}

export const loginRateLimitKey = "single-user";

export function sessionExpiry() {
  return Date.now() + SESSION_TTL_SECONDS * 1000;
}

export function createCsrfToken() {
  return randomBytes(32).toString("base64url");
}

export function sessionMaxAge() {
  return SESSION_TTL_SECONDS;
}
