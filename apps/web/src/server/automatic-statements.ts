type CloseResult = { closedCount: number; checkedAt: string };
type StatementCloser = { closeDueAutomaticStatements(nowIso: string): Promise<CloseResult> };
type LogEntry = { status: "succeeded" | "failed"; closedCount?: number };
type TimerHandle = { unref?: () => void };

export const AUTOMATIC_STATEMENT_CLOSING_INTERVAL_MS = 60_000;

export function createAutomaticStatementClosingRunner(
  loadService: () => Promise<StatementCloser>,
  now: () => Date = () => new Date(),
  log: (entry: LogEntry) => void = entry => {
    if (entry.status === "succeeded") console.info("[automatic-statement-closing] run", { status: entry.status, closedCount: entry.closedCount });
    else console.error("[automatic-statement-closing] run", { status: entry.status });
  },
) {
  let running = false;
  return async () => {
    if (running) return;
    running = true;
    try {
      const service = await loadService();
      const result = await service.closeDueAutomaticStatements(now().toISOString());
      log({ status: "succeeded", closedCount: result.closedCount });
    } catch {
      // Keep raw database errors and financial context out of process logs.
      log({ status: "failed" });
    } finally {
      running = false;
    }
  };
}

export function startAutomaticStatementClosing(options: {
  loadService?: () => Promise<StatementCloser>;
  now?: () => Date;
  log?: (entry: LogEntry) => void;
  setIntervalFn?: (callback: () => void, intervalMs: number) => TimerHandle;
} = {}) {
  const loadService = options.loadService ?? (async () => {
    const { financeApplication } = await import("./finance");
    return financeApplication().service;
  });
  const run = createAutomaticStatementClosingRunner(loadService, options.now, options.log);
  const timer = (options.setIntervalFn ?? setInterval)(() => { void run(); }, AUTOMATIC_STATEMENT_CLOSING_INTERVAL_MS);
  timer.unref?.();
  void run();
  return timer;
}
