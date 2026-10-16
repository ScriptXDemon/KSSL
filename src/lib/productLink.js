/* Which catalogue product a name on a tender refers to. A tender's "Matched products" and "Competitor fit" lists
   name catalogue models (C800D6E, KD1000, ...) next to labels that are not products ("Parts / service job: no set to
   quote"). Only a name that is a model in data.competitors[cid].products is a link; the label stays plain text. */
/* compared by letters and digits only, ignoring case: the served catalogue is re-cased on load ("C27 (60 Hz) 750
   EkW", "Mtu 12V1600 DS1000") while a tender's fit list keeps the researcher's spelling ("750 ekW", "mtu 12V1600") */
const key = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

export function productOwner(data, name) {
  const want = key(name);
  if (!want) return null;
  const comps = (data && data.competitors) || {};
  for (const cid of Object.keys(comps)) {
    const hit = ((comps[cid] && comps[cid].products) || []).find((p) => key(p && p.name) === want);
    if (hit) return { cid, productName: hit.name };
  }
  return null;
}

if (typeof process !== "undefined" && process.argv[1] && process.argv[1].endsWith("productLink.js")) {
  const d = { competitors: { R: { products: [{ name: "Mtu 12V1600 DS900 (60 Hz)" }] }, A: { products: [{ name: "KD1000" }] }, "Cummins Arabia": { products: [{ name: "C800D6E (S17 Centum Series)" }] } } };
  const ok = productOwner(d, "KD1000").cid === "A" && productOwner(d, "C800D6E (S17 Centum Series)").cid === "Cummins Arabia"
    && productOwner(d, "mtu 12V1600 DS900 (60 Hz)").cid === "R" && productOwner(d, "mtu 12V1600 DS900 (60 Hz)").productName === "Mtu 12V1600 DS900 (60 Hz)"
    && productOwner(d, "Parts / service job: no set to quote") === null && productOwner(null, "x") === null;
  if (!ok) throw new Error("productLink self-check failed");
  console.log("ok");
}
