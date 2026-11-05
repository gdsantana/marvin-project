import assert from "node:assert/strict";
import { test } from "node:test";
import { categoryPath } from "../components/category-path.js";
import type { CategoryOption } from "../components/workspace-types.js";

test("category paths distinguish nested categories and tolerate incomplete or cyclic references", () => {
  const categories: CategoryOption[] = [
    { id: "root", name: "Moradia", type: "expense", isArchived: false },
    { id: "child", name: "Manutenção", type: "expense", parentId: "root", isArchived: false },
    { id: "leaf", name: "Materiais", type: "expense", parentId: "child", isArchived: false },
  ];
  assert.equal(categoryPath(categories[2]!, categories), "Moradia / Manutenção / Materiais");
  assert.equal(categoryPath(categories[2]!, []), "Materiais");
  assert.equal(categoryPath({ ...categories[0]!, parentId: "root" }, categories), "Moradia");
});
