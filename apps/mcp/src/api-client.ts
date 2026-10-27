import { z } from "zod";

const apiResponseSchema = <T extends z.ZodType>(dataSchema: T) => z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), data: dataSchema }),
  z.object({ ok: z.literal(false), error: z.object({ code: z.string(), message: z.string() }).passthrough() }),
]);

export class WebApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = "WebApiError";
  }
}

export class WebApiClient {
  private readonly baseUrl: URL;

  constructor(baseUrl: string, private readonly token: string, private readonly fetcher: typeof fetch = fetch) {
    this.baseUrl = new URL(baseUrl);
    if (this.baseUrl.protocol !== "http:" && this.baseUrl.protocol !== "https:") throw new Error("MCP_API_URL deve usar HTTP ou HTTPS");
    if (!token) throw new Error("MCP_API_TOKEN não configurado");
  }

  async request<T>(path: string, schema: z.ZodType<T>, options: { method?: "GET" | "POST"; body?: unknown; idempotencyKey?: string; allowWithoutIdempotency?: boolean } = {}): Promise<T> {
    const url = new URL(path.replace(/^\/+/, ""), this.baseUrl.href.endsWith("/") ? this.baseUrl : `${this.baseUrl.href}/`);
    const method = options.method ?? "GET";
    if (method === "POST" && !options.idempotencyKey && !options.allowWithoutIdempotency) {
      throw new Error("Escritas MCP exigem chave de idempotência");
    }
    const response = await this.fetcher(url, {
      method,
      headers: {
        authorization: `Bearer ${this.token}`,
        ...(options.body === undefined ? {} : { "content-type": "application/json" }),
        ...(options.idempotencyKey ? { "idempotency-key": options.idempotencyKey } : {}),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = await response.json().catch(() => null);
    const parsed = apiResponseSchema(schema).safeParse(body);
    if (!parsed.success) throw new WebApiError("A API retornou uma resposta inválida", response.status);
    if (!response.ok || !parsed.data.ok) {
      const error = parsed.data.ok ? undefined : parsed.data.error;
      throw new WebApiError(error?.message ?? "Falha na API", response.status, error?.code);
    }
    return parsed.data.data;
  }
}
