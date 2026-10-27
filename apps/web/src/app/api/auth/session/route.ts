import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { cookieOptions, csrfIsValid, CSRF_COOKIE, originIsAllowed, readSession, SESSION_COOKIE } from "@/server/auth";

export async function GET() {
  const jar = await cookies();
  const session = readSession(jar.get(SESSION_COOKIE)?.value);
  return Response.json({ ok: true, data: { authenticated: Boolean(session), csrfToken: session?.csrfToken ?? null } });
}

export async function DELETE(request: Request) {
  if (!originIsAllowed(request)) return Response.json({ ok: false, error: { code: "CSRF_REJECTED", message: "Origem inválida." } }, { status: 403 });
  const jar = await cookies();
  const session = readSession(jar.get(SESSION_COOKIE)?.value);
  if (session && !csrfIsValid(request, session, jar.get(CSRF_COOKIE)?.value)) return Response.json({ ok: false, error: { code: "CSRF_REJECTED", message: "Origem ou token de segurança inválido." } }, { status: 403 });
  const response = NextResponse.json({ ok: true, data: { authenticated: false } });
  response.cookies.set(SESSION_COOKIE, "", cookieOptions(true, 0));
  response.cookies.set(CSRF_COOKIE, "", cookieOptions(false, 0));
  return response;
}
