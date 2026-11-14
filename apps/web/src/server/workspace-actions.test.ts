import assert from "node:assert/strict";
import test from "node:test";
import { actionLabels, primaryActions, settingsActions } from "../components/workspace-types";

test("infrequent registrations remain accessible only through the settings action list", () => {
  assert.deepEqual(settingsActions, ["institution", "account", "configureCard", "category"]);
  for (const action of settingsActions) {
    assert.ok(actionLabels[action]);
    assert.ok(!primaryActions.includes(action));
  }
});

test("the daily creation menu retains financial operations", () => {
  assert.deepEqual(primaryActions, ["income", "expense", "transfer", "purchase", "cashback", "refund", "payment", "statementAdjustment", "close", "forecast"]);
});
