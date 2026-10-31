export function parseMajorToMinor(value: string): string | null {
  const match = /^(-?)(\d+)(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const amount = BigInt(match[2]!) * 100n + BigInt((match[3] ?? "").padEnd(2, "0") || "0");
  return `${match[1] === "-" && amount !== 0n ? "-" : ""}${amount}`;
}

export function formatMinor(value: string, currency: string) {
  const amount = BigInt(value);
  const absolute = amount < 0n ? -amount : amount;
  const whole = absolute / 100n;
  const cents = String(absolute % 100n).padStart(2, "0");
  return `${amount < 0n ? "−" : ""}${currency} ${new Intl.NumberFormat("pt-BR").format(whole)},${cents}`;
}

export function majorInputFromMinor(value: string | null) {
  if (value === null) return "";
  const amount = BigInt(value), absolute = amount < 0n ? -amount : amount;
  return `${amount < 0n ? "-" : ""}${absolute / 100n},${String(absolute % 100n).padStart(2, "0")}`;
}

export function formatDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

export function percentChangeBasisPoints(before: bigint, after: bigint): bigint | null {
  if (before === 0n) return null;
  return ((after - before) * 10000n) / (before < 0n ? -before : before);
}

export function todayCivil(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find(item => item.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function reportPeriod(range: string, now = new Date()) {
  const [year, month] = todayCivil(now).split("-").map(Number);
  const start = new Date(Date.UTC(year!, range === "year" ? 0 : month! - 1 + (range === "last-month" ? -1 : 0), 1));
  const end = new Date(Date.UTC(start.getUTCFullYear(), range === "year" ? 12 : start.getUTCMonth() + 1, 0));
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}
