import assert from "node:assert/strict";
import test from "node:test";
import { readCategoryAllocations } from "../components/transaction-form-data";

function data(values: [string, string][]) {
  const result = new FormData();
  for (const [key, value] of values) result.append(key, value);
  return result;
}

test("single expense category uses the full amount exactly, including uncategorized expenses", () => {
  const form = data([["allocationMode", "single"], ["amountMinor", "123,45"], ["categoryId", "food"]]);
  assert.deepEqual(readCategoryAllocations(form, true), [{ categoryId: "food", amountMinor: "12345" }]);
  form.set("amountMinor", "92233720368547758,08");
  form.set("categoryId", "");
  assert.deepEqual(readCategoryAllocations(form, true), [{ categoryId: null, amountMinor: "9223372036854775808" }]);
  for (const value of ["", "0", "-1", "12,345"]) {
    form.set("amountMinor", value);
    assert.equal(readCategoryAllocations(form, true), null);
  }
});

test("split expenses preserve each allocation without duplicating the full amount", () => {
  const form = data([["allocationMode", "split"], ["amountMinor", "10,01"], ["allocationCategoryId", "food"], ["allocationAmount", "5,00"], ["allocationCategoryId", ""], ["allocationAmount", "5,01"]]);
  assert.deepEqual(readCategoryAllocations(form, true), [{ categoryId: "food", amountMinor: "500" }, { categoryId: null, amountMinor: "501" }]);
  assert.deepEqual(readCategoryAllocations(form), readCategoryAllocations(form, true));
  form.delete("allocationAmount");
  assert.equal(readCategoryAllocations(form, true), null);
});

test("single credit purchase allocation uses the total purchase amount", () => {
  const form = data([["allocationMode", "single"], ["totalAmountMinor", "100,01"], ["categoryId", "food"]]);
  assert.deepEqual(readCategoryAllocations(form, true), [{ categoryId: "food", amountMinor: "10001" }]);
});
