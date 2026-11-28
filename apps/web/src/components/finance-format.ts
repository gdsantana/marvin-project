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

export function formatCurrencyMinor(value: string, currency: string) {
  return formatMinor(value, currency === "BRL" ? "R$" : currency);
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

export type ReportMonth = `${number}-${number}`;
export type ReportRange = "month" | "last-month" | "year" | ReportMonth;

export function offsetReportMonth(from: string, offset: number): ReportMonth {
  const date = new Date(`${from}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset, 1);
  return date.toISOString().slice(0, 7) as ReportMonth;
}

const reportMonthFormat = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric", timeZone: "UTC" });

export function formatReportMonth(from: string) {
  const parts = reportMonthFormat.formatToParts(new Date(`${from}T00:00:00Z`));
  const month = parts.find(part => part.type === "month")!.value;
  const year = parts.find(part => part.type === "year")!.value;
  return `${month[0]!.toUpperCase()}${month.slice(1)} ${year}`;
}

export function reportPeriod(range: ReportRange, now = new Date()) {
  const [year, month] = todayCivil(now).split("-").map(Number);
  const start = range === "month" || range === "last-month" || range === "year"
    ? new Date(Date.UTC(year!, range === "year" ? 0 : month! - 1 + (range === "last-month" ? -1 : 0), 1))
    : new Date(`${range}-01T00:00:00Z`);
  const end = new Date(start);
  end.setUTCMonth(range === "year" ? 12 : start.getUTCMonth() + 1, 0);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}
