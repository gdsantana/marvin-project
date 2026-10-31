import assert from "node:assert/strict";
import test from "node:test";
import { formatDate, formatMinor, majorInputFromMinor, parseMajorToMinor, percentChangeBasisPoints } from "../components/finance-format";

test("form money conversion accepts decimal comma or period without floating-point math", () => {
  assert.equal(parseMajorToMinor("1.234,50"), null);
  assert.equal(parseMajorToMinor("2500,5"), "250050");
  assert.equal(parseMajorToMinor("2500.50"), "250050");
  assert.equal(parseMajorToMinor("-0,50"), "-50");
  assert.equal(parseMajorToMinor("-0,00"), "0");
  assert.equal(parseMajorToMinor("12,345"), null);
});

test("minor-unit formatting and edit values preserve exact signs and cents", () => {
  assert.equal(formatMinor("-123456", "BRL"), "−BRL 1.234,56");
  assert.equal(majorInputFromMinor("-123456"), "-1234,56");
  assert.equal(majorInputFromMinor(null), "");
  assert.equal(formatMinor("9223372036854775808", "BRL"), "BRL 92.233.720.368.547.758,08");
});

test("civil date labels use Brazilian order without timezone conversion", () => {
  assert.equal(formatDate("2026-10-26"), "26/10/2026");
  assert.equal(formatDate("2024-02-29"), "29/02/2024");
  assert.equal(formatDate(""), "");
});


test("period variation handles zero, negative baselines and large amounts exactly", () => {
  assert.equal(percentChangeBasisPoints(0n, 10n), null);
  assert.equal(percentChangeBasisPoints(10000n, 12500n), 2500n);
  assert.equal(percentChangeBasisPoints(-10000n, -5000n), 5000n);
  assert.equal(percentChangeBasisPoints(100000000000000000000n, 90000000000000000000n), -1000n);
});


test("civil date and report periods use Sao Paulo across UTC and year boundaries", async () => {
  const { todayCivil, reportPeriod } = await import("../components/finance-format");
  const instant = new Date("2027-01-01T01:30:00Z");
  assert.equal(todayCivil(instant), "2026-12-31");
  assert.deepEqual(reportPeriod("month", instant), { from: "2026-12-01", to: "2026-12-31" });
  assert.deepEqual(reportPeriod("last-month", instant), { from: "2026-11-01", to: "2026-11-30" });
  assert.deepEqual(reportPeriod("year", instant), { from: "2026-01-01", to: "2026-12-31" });
});
