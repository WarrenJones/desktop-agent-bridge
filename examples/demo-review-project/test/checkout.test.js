import assert from "node:assert/strict";
import test from "node:test";

import { checkoutTotal } from "../src/checkout.js";

test("membership credit reduces the item subtotal", () => {
  assert.equal(
    checkoutTotal({ subtotal: 100, membershipCredit: 20, shipping: 10 }),
    90,
  );
});
