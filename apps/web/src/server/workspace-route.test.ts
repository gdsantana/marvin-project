import assert from "node:assert/strict";
import { test } from "node:test";
import { workspaceRoute } from "../components/workspace-route-data";

test("persistent workspace resolves supported routes and account details", () => {
  assert.deepEqual(workspaceRoute("/"), { section: "overview" });
  for (const section of ["settings", "accounts", "cards", "entries", "statements", "reports"]) {
    assert.deepEqual(workspaceRoute(`/${section}`), { section });
    assert.deepEqual(workspaceRoute(`/${section}/`), { section });
  }
  for (const path of ["/new", "/new/"]) assert.deepEqual(workspaceRoute(path), { section: "entries", openNew: true });
  const accountId = "00000000-0000-4000-8000-000000000001";
  assert.deepEqual(workspaceRoute(`/accounts/${accountId}`), { section: "accounts", accountId });
});

test("login and invalid routes retain the server page instead of rendering workspace", () => {
  for (const path of ["/login", "/unknown", "/accounts/no-id", "/cards/00000000-0000-4000-8000-000000000001", "/entries/extra/path"]) assert.equal(workspaceRoute(path), null);
});
