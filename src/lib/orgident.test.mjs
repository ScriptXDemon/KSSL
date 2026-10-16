/* Check for the serve-time partner identity: junk gate + canonicaliser. Run: node this file. */
import assert from "node:assert/strict";
import { isJunkPartner, orgKey, canonicalizeLabels } from "./orgident.js";

// ---- junk gate (§4) ----
const JUNK = [
  "1,400 Australian companies", "70 SMEs", "75 British aerospace SMEs", "over 200 suppliers",
  "several suppliers", "dozens of firms", "30 global companies", "Australian SMEs",
  "companies", "suppliers", "India", "United Kingdom", "Europe", "MoD", "UK MoD",
  "Indian Army", "Ministry of Defence", "the unnamed organization likely a technology developer working on the drone",
];
JUNK.forEach((l) => assert.equal(isJunkPartner(l), true, `should be junk: ${l}`));

const REAL = [
  "Lockheed Martin", "Saab", "Rafael Advanced Defense Systems", "IAI", "BAE Systems",
  "Sea Box International", "Thales", "General Dynamics", "Naval Group", "Elbit Systems",
  "Turkish Aerospace Industries", "PLR Systems",
];
REAL.forEach((l) => assert.equal(isJunkPartner(l), false, `should be real: ${l}`));

// ---- canonical key: national qualifier + legal suffix fold to one identity ----
assert.equal(orgKey("Lockheed Martin Australia"), orgKey("Lockheed Martin"));
assert.equal(orgKey("Saab Australia"), orgKey("Saab AB"));
assert.equal(orgKey("Saab AB"), orgKey("Saab"));
assert.equal(orgKey("Rafael Advanced Defence Systems"), orgKey("Rafael"));
// distinct firms stay distinct
assert.notEqual(orgKey("Israel Aerospace Industries"), orgKey("Israel Weapon Industries"));
assert.notEqual(orgKey("General Dynamics"), orgKey("General Atomics"));
assert.notEqual(orgKey("Lockheed Martin"), orgKey("Martin-Baker"));
// a place must not be a valid identity fold target
assert.notEqual(orgKey("Israel Aerospace Industries"), orgKey("Israel"));

// ---- containment merge + country attributes ----
{
  const labels = [
    "Lockheed Martin", "Lockheed Martin Australia", "Lockheed Martin UK",
    "Lockheed Martin Skunk Works", "Saab", "Saab Australia", "Israel Weapon Industries",
  ];
  const { keyOf, canon } = canonicalizeLabels(labels);
  const lm = keyOf("Lockheed Martin");
  assert.equal(keyOf("Lockheed Martin Australia"), lm);
  assert.equal(keyOf("Lockheed Martin UK"), lm);
  assert.equal(keyOf("Lockheed Martin Skunk Works"), lm, "Skunk Works folds into Lockheed Martin");
  assert.deepEqual(canon[lm].countries, ["Australia", "United Kingdom"]);
  assert.equal(canon[lm].name, "Lockheed Martin");
  assert.equal(keyOf("Saab Australia"), keyOf("Saab"));
  assert.notEqual(keyOf("Israel Weapon Industries"), lm);
  // count of distinct companies from 7 labels: Lockheed Martin, Saab, Israel Weapon Industries = 3
  const distinct = new Set(labels.map(keyOf));
  assert.equal(distinct.size, 3, `expected 3 distinct, got ${distinct.size}`);
}

console.log("orgident: all assertions passed");
