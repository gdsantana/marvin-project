import assert from "node:assert/strict";
import { test } from "node:test";
import { requestPassword } from "./password-prompt.js";

test("password prompt retries invalid lengths and mismatched confirmation", async () => {
  const answers = ["short", "x".repeat(1025), "valid password", "different password", "final password", "final password"];
  const errors: string[] = [];
  assert.equal(await requestPassword(async () => {
    assert.ok(answers.length);
    return answers.shift()!;
  }, message => errors.push(message)), "final password");
  assert.equal(errors.length, 3);
  assert.equal(answers.length, 0);
});

test("password prompt propagates cancellation without retrying", async () => {
  const cancellation = new Error("cancelled");
  await assert.rejects(requestPassword(async () => { throw cancellation; }, () => assert.fail("unexpected retry")), cancellation);
});

test("password prompt honors custom validation before asking for confirmation", async () => {
  const answers = ["bad", "valid", "valid"];
  const messages: string[] = [];
  const errors: string[] = [];
  assert.equal(await requestPassword(async message => {
    messages.push(message);
    return answers.shift()!;
  }, message => errors.push(message), password => password === "bad" ? "invalid" : undefined, "Role password: "), "valid");
  assert.deepEqual(errors, ["invalid"]);
  assert.deepEqual(messages, ["Role password: ", "Role password: ", "Confirme a senha: "]);
});
