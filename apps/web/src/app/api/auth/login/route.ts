import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { checkLoginRateLimit, clearLoginFailures, cookieOptions, createCsrfToken, loginRateLimitKey, originIsAllowed, recordLoginFailure, SESSION_COOKIE, CSRF_COOKIE, sessionExpiry, sessionMaxAge, signSession, verifyPassword } from "@/server/auth";
import { readJsonBody } from "@/server/http";

const loginSchema = z.object({ password: z.string().min(1).max(1024) });

export async function POST(request: NextRequest) {
  if (!originIsAllowed(request)) return Response.json({ ok: false, error: { code: "CSRF_REJECTED", message: "Origem inválida ou APP_ORIGIN não configurado." } }, { status: 403 });
  if (!checkLoginRateLimit(loginRateLimitKey)) return Response.json({ ok: false, error: { code: "RATE_LIMITED", message: "Muitas tentativas. Aguarde 15 minutos." } }, { status: 429 });
  const body = await readJsonBody(request, 4096);
  if (!body.ok) return Response.json({ ok: false, error: { code: body.status === 413 ? "PAYLOAD_TOO_LARGE" : "INVALID_JSON", message: body.status === 413 ? "Requisição muito grande." : "Corpo JSON inválido." } }, { status: body.status });
  const parsed = loginSchema.safeParse(body.data);
  if (!parsed.success) return Response.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Informe sua senha." } }, { status: 400 });
  const storedHash = process.env.WEB_PASSWORD_HASH;
  if (!storedHash) return Response.json({ ok: false, error: { code: "AUTH_NOT_CONFIGURED", message: "Configure WEB_PASSWORD_HASH no servidor." } }, { status: 503 });

  let valid = false;
  try { valid = await verifyPassword(parsed.data.password, storedHash); } catch { /* A configuração inválida não autentica. */ }
  if (!valid) {
    recordLoginFailure(loginRateLimitKey);
    return Response.json({ ok: false, error: { code: "INVALID_CREDENTIALS", message: "Senha incorreta." } }, { status: 401 });
  }
  clearLoginFailures(loginRateLimitKey);
  const session = { expiresAt: sessionExpiry(), csrfToken: createCsrfToken() };
  const response = NextResponse.json({ ok: true, data: { authenticated: true } });
  response.cookies.set(SESSION_COOKIE, signSession(session), cookieOptions(true, sessionMaxAge()));
  response.cookies.set(CSRF_COOKIE, session.csrfToken, cookieOptions(false, sessionMaxAge()));
  return response;
}
