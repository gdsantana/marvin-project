import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authApplication, cookieOptions, csrfIsValid, CSRF_COOKIE, originIsAllowed, readSession, SESSION_COOKIE } from "@/server/auth";
import { apiError } from "@/server/http";

export async function GET() {
  try {
    const jar = await cookies();
    const session = await readSession(jar.get(SESSION_COOKIE)?.value);
    return Response.json({ ok: true, data: { authenticated: Boolean(session), csrfToken: session?.csrfToken ?? null, user: session ? { id: session.userId, username: session.username } : null } }, { headers: { "Cache-Control": "no-store" } });
  } catch { return apiError("AUTH_UNAVAILABLE", "Não foi possível verificar sua sessão. Tente novamente.", 503); }
}

export async function DELETE(request: Request) {
  if (!originIsAllowed(request)) return apiError("CSRF_REJECTED", "Origem inválida.", 403);
  try {
    const jar = await cookies();
    const token = jar.get(SESSION_COOKIE)?.value;
    const session = await readSession(token);
    if (session && !csrfIsValid(request, session, jar.get(CSRF_COOKIE)?.value)) return apiError("CSRF_REJECTED", "Origem ou token de segurança inválido.", 403);
    if (session && token) await authApplication().revokeSession(token);
    const response = NextResponse.json({ ok: true, data: { authenticated: false } }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(SESSION_COOKIE, "", cookieOptions(true, 0));
    response.cookies.set(CSRF_COOKIE, "", cookieOptions(false, 0));
    return response;
  } catch { return apiError("AUTH_UNAVAILABLE", "Não foi possível sair agora. Tente novamente.", 503); }
}
