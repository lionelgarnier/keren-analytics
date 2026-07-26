import test from "node:test";
import assert from "node:assert/strict";

import { runWithToken, getCurrentToken } from "../src/providers/azure/tokenStore.js";

test("getCurrentToken returns null outside any token context", () => {
  assert.equal(getCurrentToken(), null);
});

test("runWithToken scopes the token to its async callback", async () => {
  const seen = await runWithToken("token-A", async () => {
    await Promise.resolve();
    return getCurrentToken();
  });
  assert.equal(seen, "token-A");
  // Context does not leak out after the callback resolves.
  assert.equal(getCurrentToken(), null);
});

test("concurrent requests never see each other's token (AsyncLocalStorage isolation)", async () => {
  // Interleave two token contexts with awaits between reads — a global would
  // bleed here; AsyncLocalStorage keeps each async chain isolated.
  const run = (token) =>
    runWithToken(token, async () => {
      await new Promise((r) => setTimeout(r, 5));
      const first = getCurrentToken();
      await new Promise((r) => setTimeout(r, 5));
      const second = getCurrentToken();
      return { first, second };
    });

  const [a, b] = await Promise.all([run("tenant-A-token"), run("tenant-B-token")]);
  assert.deepEqual(a, { first: "tenant-A-token", second: "tenant-A-token" });
  assert.deepEqual(b, { first: "tenant-B-token", second: "tenant-B-token" });
});
