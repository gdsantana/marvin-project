import assert from "node:assert/strict";
import { test } from "node:test";
import { recentMonths } from "../components/finance-chart-data";

test("annual chart includes all twelve months instead of only July through December", () => {
  const months = recentMonths("2026-12-31", 12);
  assert.equal(months.length, 12);
  assert.deepEqual(months.map(month => month.from), Array.from({ length: 12 }, (_, index) => `2026-${String(index + 1).padStart(2, "0")}-01`));
  assert.equal(months[11]?.to, "2026-12-31");
});

test("six-month history crosses years and preserves leap February", () => {
  const months = recentMonths("2028-03-31");
  assert.equal(months.length, 6);
  assert.deepEqual(months[0], { from: "2027-10-01", to: "2027-10-31" });
  assert.deepEqual(months[4], { from: "2028-02-01", to: "2028-02-29" });
  assert.deepEqual(months[5], { from: "2028-03-01", to: "2028-03-31" });
});
