import { cookies } from "next/headers";
import { DomainError } from "@finance/domain";
import { bearerIsValid, csrfIsValid, CSRF_COOKIE, readSession, SESSION_COOKIE } from "./auth";

export async function authorize(request: Request, write = false) {
  if (bearerIsValid(request)) return { ok: true as const, client: "mcp" as const };
  const jar = await cookies();
  const session = await readSession(jar.get(SESSION_COOKIE)?.value);
  if (!session) return { ok: false as const, response: Response.json({ ok: false, error: { code: "UNAUTHENTICATED", message: "Entre para continuar." } }, { status: 401 }) };
  if (write && !csrfIsValid(request, session, jar.get(CSRF_COOKIE)?.value)) {
    return { ok: false as const, response: Response.json({ ok: false, error: { code: "CSRF_REJECTED", message: "Origem ou token de segurança inválido." } }, { status: 403 }) };
  }
  return { ok: true as const, client: "web" as const, userId: session.userId };
}

export function apiError(code: string, message: string, status: number) {
  return Response.json({ ok: false, error: { code, message } }, { status });
}

export function domainErrorResponse(error: unknown) {
  if (!(error instanceof DomainError)) return apiError("INTERNAL_ERROR", "Não foi possível concluir a solicitação.", 500);
  const status = error.code === "NOT_FOUND" ? 404 : error.code === "CONFLICT" || error.code === "IDEMPOTENCY_CONFLICT" ? 409 : 422;
  return Response.json({ ok: false, error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) } }, { status });
}

export async function readJsonBody(request: Request, maxBytes: number): Promise<{ ok: true; data: unknown } | { ok: false; status: number }> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > maxBytes) return { ok: false, status: 413 };
  if (!request.body) return { ok: false, status: 400 };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); return { ok: false, status: 413 }; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return { ok: true, data: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch { return { ok: false, status: 400 }; }
}
