import { parseMajorToMinor } from "./finance-format";

export function readCategoryAllocations(data: FormData, allowSingle = false) {
  if (allowSingle && data.get("allocationMode") === "single") {
    const amountMinor = parseMajorToMinor(String(data.get("totalAmountMinor") ?? data.get("amountMinor") ?? ""));
    if (amountMinor === null || BigInt(amountMinor) <= 0n) return null;
    return [{ categoryId: String(data.get("categoryId") ?? "") || null, amountMinor }];
  }
  const amounts = data.getAll("allocationAmount");
  const rows = data.getAll("allocationCategoryId").map((categoryId, index) => ({
    categoryId: String(categoryId) || null,
    amountMinor: parseMajorToMinor(String(amounts[index] ?? "")),
  }));
  if (rows.some(row => row.amountMinor === null || BigInt(row.amountMinor) <= 0n)) return null;
  return rows.map(row => ({ categoryId: row.categoryId, amountMinor: row.amountMinor! }));
}
