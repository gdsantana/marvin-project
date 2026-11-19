import { cookies } from "next/headers";
import { readSession, SESSION_COOKIE } from "@/server/auth";
import { createFinanceEventStream } from "@/server/finance-events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  try {
    if (!await readSession(token)) return new Response(null, { status: 401 });
  } catch { return new Response(null, { status: 401 }); }

  const stream = createFinanceEventStream(request.signal, () => readSession(token));
  return new Response(stream, { headers: {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
  } });
}
