import assert from "node:assert/strict";
import test from "node:test";

import { isTokenExpired } from "../src/token.js";

test("tokens are active before expiration and expired afterwards", () => {
  assert.equal(isTokenExpired({ now: 99, expiresAt: 100 }), false);
  assert.equal(isTokenExpired({ now: 101, expiresAt: 100 }), true);
});
