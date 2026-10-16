import assert from "node:assert";
import { revenueCrore, revenueTierOf } from "./revenueFacet.js";
const tier = (v) => revenueTierOf({ sales: [{ value: v }] });
assert.equal(tier("FY2025 sales and revenues USD 67.6 billion (record)"), "high");        // Caterpillar: not read as "2025"
assert.equal(tier("EUR 5.72 billion in FY2025 (+19%)"), "high");
assert.equal(tier("RMB 231,809 million (2025, up 7.47 percent)"), "high");
assert.equal(tier("US$4.21 billion (2025)"), "high");
assert.equal(tier("Not published separately; capital 5,000 million yen. MHIET is a subsidiary"), "unknown");
assert.equal(tier("Not disclosed separately. Caterpillar Inc. group US$67.6 billion"), "unknown");
assert.equal(tier("₹1,128 crore (demo)"), "mid");
assert.equal(tier("JPY 10 billion"), "emerging");
assert.equal(revenueCrore("no figure here"), null);
console.log("ok");
