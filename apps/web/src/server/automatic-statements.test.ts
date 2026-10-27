import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  AUTOMATIC_STATEMENT_CLOSING_INTERVAL_MS,
  createAutomaticStatementClosingRunner,
  startAutomaticStatementClosing,
} from "./automatic-statements";

test("instrumentation scopes the server-only scheduler import to the positive Node runtime branch", async () => {
  const instrumentationPath = fileURLToPath(new URL("../instrumentation.ts", import.meta.url));
  const source = await readFile(instrumentationPath, "utf8");

  // Next must see this positive, compile-time runtime check to exclude pg from non-Node bundles.
  assert.match(
    source,
    /if \(process\.env\.NEXT_RUNTIME === "nodejs"\) \{[\s\S]*?await import\("\.\/server\/automatic-statements"\)/,
  );
  assert.match(source, /if \(process\.env\.NEXT_PHASE === "phase-production-build"\) return;/);
});

test("startup catches up immediately, schedules periodic retries and unreferences its timer", async () => {
  let callback: (() => void) | undefined;
  let timerUnreferenced = false;
  const calls: string[] = [];
  const entries: Array<{ status: string; closedCount?: number }> = [];
  const timer = startAutomaticStatementClosing({
    loadService: async () => ({ closeDueAutomaticStatements: async nowIso => { calls.push(nowIso); return { checkedAt: nowIso, closedCount: 2 }; } }),
    now: () => new Date("2026-10-25T12:00:00.000Z"),
    log: entry => entries.push(entry),
    setIntervalFn: (next, interval) => {
      assert.equal(interval, AUTOMATIC_STATEMENT_CLOSING_INTERVAL_MS);
      callback = next;
      return { unref: () => { timerUnreferenced = true; } };
    },
  });

  await new Promise(resolve => setImmediate(resolve));
  assert.ok(timer);
  assert.equal(timerUnreferenced, true);
  assert.deepEqual(calls, ["2026-10-25T12:00:00.000Z"]);
  callback!();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 2);
  assert.deepEqual(entries, [{ status: "succeeded", closedCount: 2 }, { status: "succeeded", closedCount: 2 }]);
});

test("a failed attempt logs no error details and a later interval retries", async () => {
  let attempts = 0;
  const entries: Array<{ status: string; closedCount?: number }> = [];
  const run = createAutomaticStatementClosingRunner(async () => ({
    closeDueAutomaticStatements: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("secret connection string and financial payload");
      return { checkedAt: "2026-10-25T12:00:00.000Z", closedCount: 0 };
    },
  }), () => new Date("2026-10-25T12:00:00.000Z"), entry => entries.push(entry));

  await run();
  await run();
  assert.equal(attempts, 2);
  assert.deepEqual(entries, [{ status: "failed" }, { status: "succeeded", closedCount: 0 }]);
});

test("overlapping timer ticks do not start a second domain operation in the same process", async () => {
  let release!: () => void;
  let attempts = 0;
  const run = createAutomaticStatementClosingRunner(async () => ({
    closeDueAutomaticStatements: async () => {
      attempts += 1;
      await new Promise<void>(resolve => { release = resolve; });
      return { checkedAt: "2026-10-25T12:00:00.000Z", closedCount: 0 };
    },
  }), () => new Date("2026-10-25T12:00:00.000Z"), () => undefined);

  const first = run();
  await Promise.resolve();
  await run();
  assert.equal(attempts, 1);
  release();
  await first;
});
