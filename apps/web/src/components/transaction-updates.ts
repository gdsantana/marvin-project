export type TransactionSnapshot = { ids: Set<string>; scope: string; token: number };

export function addedTransactionIds(previous: TransactionSnapshot | null, current: TransactionSnapshot) {
  if (!previous || previous.scope !== current.scope || previous.token === current.token) return [];
  return [...current.ids].filter(id => !previous.ids.has(id));
}
