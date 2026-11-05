import assert from "node:assert/strict";
import test from "node:test";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DateRangeSelect } from "../components/date-range-select";

test("date range displays both civil dates with two-digit years in a single full-width trigger", () => {
  Object.assign(globalThis, { React });
  const html = renderToStaticMarkup(createElement(DateRangeSelect, {
    value: { from: "2024-02-29", to: "2026-11-30" },
    onChange: () => {},
  }));
  assert.match(html, /29\/02\/24/);
  assert.match(html, /30\/11\/26/);
  assert.match(html, /w-full/);
  assert.equal((html.match(/<button\b/g) ?? []).length, 1);
  assert.doesNotMatch(html, /2024-02-29|2026-11-30/);
});
