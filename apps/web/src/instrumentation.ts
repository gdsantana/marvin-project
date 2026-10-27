export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.NEXT_PHASE === "phase-production-build") return;

    const runtime = globalThis as typeof globalThis & { marvinAutomaticStatementClosingStarted?: boolean };
    if (runtime.marvinAutomaticStatementClosingStarted) return;
    runtime.marvinAutomaticStatementClosingStarted = true;

    try {
      const { startAutomaticStatementClosing } = await import("./server/automatic-statements");
      startAutomaticStatementClosing();
    } catch {
      runtime.marvinAutomaticStatementClosingStarted = false;
      console.error("[automatic-statement-closing] scheduler startup failed");
    }
  }
}
