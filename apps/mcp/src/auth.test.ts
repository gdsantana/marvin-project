import assert from "node:assert/strict";
import test from "node:test";
import { bearerTokenIsValid } from "./auth.js";

test("bearer auth accepts only the configured token", () => {
  assert.equal(bearerTokenIsValid("Bearer correct-token", "correct-token"), true);
  assert.equal(bearerTokenIsValid("Bearer wrong-token", "correct-token"), false);
  assert.equal(bearerTokenIsValid(undefined, "correct-token"), false);
  assert.equal(bearerTokenIsValid("Bearer correct-token", undefined), false);
});
