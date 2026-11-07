import { loginSchema } from "@finance/contracts";
import { NextRequest, NextResponse } from "next/server";
import { authApplication, cookieOptions, originIsAllowed, SESSION_COOKIE, CSRF_COOKIE, sessionMaxAge } from "@/server/auth";
import { apiError, readJsonBody } from "@/server/http";

export async function POST(request: NextRequest) {
  if (!originIsAllowed(request)) return apiError("CSRF_REJECTED", "Origem inválida.", 403);
  const body = await readJsonBody(request, 8192);
  if (!body.ok) return apiError(body.status === 413 ? "PAYLOAD_TOO_LARGE" : "INVALID_JSON", "Requisição inválida.", body.status);
  const parsed = loginSchema.safeParse(body.data);
  if (!parsed.success) return apiError("VALIDATION_ERROR", "Informe usuário e senha válidos.", 400);
  try {
    const result = await authApplication().login(parsed.data.username, parsed.data.password);
    if (result.status === "rate_limited") return Response.json({ ok: false, error: { code: "RATE_LIMITED", message: "Muitas tentativas. Aguarde 15 minutos e tente novamente." } }, { status: 429, headers: { "Retry-After": "900", "Cache-Control": "no-store" } });
    if (result.status === "invalid") return apiError("INVALID_CREDENTIALS", "Usuário ou senha incorretos.", 401);
    const response = NextResponse.json({ ok: true, data: { authenticated: true } }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(SESSION_COOKIE, result.token, cookieOptions(true, sessionMaxAge()));
    response.cookies.set(CSRF_COOKIE, result.csrfToken, cookieOptions(false, sessionMaxAge()));
    return response;
  } catch { return apiError("AUTH_UNAVAILABLE", "Não foi possível entrar agora. Tente novamente em instantes.", 503); }
}
