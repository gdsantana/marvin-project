type Listener = () => void;
const runtime = globalThis as typeof globalThis & { marvinFinanceListeners?: Set<Listener> };
// shortcut: notifications are process-local; use shared pub/sub before running multiple Web instances.
const listeners = runtime.marvinFinanceListeners ??= new Set<Listener>();

export function subscribeFinanceChanges(listener: Listener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function notifyFinanceChanges() {
  for (const listener of listeners) {
    try { listener(); } catch { listeners.delete(listener); }
  }
}

const mutations = new Set([
  "createInstitution", "correctOpeningBalance", "createAccount", "createCategory", "configureCard",
  "createIncome", "createExpense", "createTransfer", "createCreditPurchase", "createCashback", "createRefund",
  "createStatementAdjustment", "payStatement", "closeStatement", "createExpenseForecast", "cancelExpenseForecast",
  "realizeExpenseForecast", "correctTransaction", "reverseTransaction",
]);

export function withFinanceNotifications<T extends object>(service: T): T {
  return new Proxy(service, {
    get(target, property, receiver) {
      const value: unknown = Reflect.get(target, property, receiver);
      if (typeof property !== "string" || !mutations.has(property) || typeof value !== "function") return value;
      return async (...args: unknown[]) => {
        const result: unknown = await Reflect.apply(value, target, args);
        notifyFinanceChanges();
        return result;
      };
    },
  });
}

export function createFinanceEventStream(signal: AbortSignal, readSession: () => Promise<unknown>) {
  const encoder = new TextEncoder();
  let cleanup = () => {};
  return new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (message: string) => { if (!closed) controller.enqueue(encoder.encode(message)); };
      const unsubscribe = subscribeFinanceChanges(() => send("event: finance-changed\ndata: {}\n\n"));
      const timer = setInterval(() => {
        void readSession().then(session => {
          if (!session) cleanup();
          else send(": heartbeat\n\n");
        }).catch(cleanup);
      }, 20_000);
      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        unsubscribe();
        signal.removeEventListener("abort", cleanup);
        controller.close();
      };
      signal.addEventListener("abort", cleanup, { once: true });
      if (signal.aborted) cleanup();
      else send(": connected\n\n");
    },
    cancel() { cleanup(); },
  });
}
