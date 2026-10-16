/* ===================================================================
   GEO MARKET OVERLAP
   A rival contests KSSL in a country only when all four hold:
     1. same country        — both have a footprint row there
     2. same product class  — both sell defence platforms, not components to primes
     3. same category       — their offerings share at least one product category
     4. same specs          — class-matched models compared spec for spec
   Anything weaker is reported as weaker rather than counted as a collision.

   Built as a factory over the dataset: the memo caches the original hung on
   `window` (_geoPairs, _geoOv) live in this closure instead, so a re-fetch gets
   a fresh set rather than answers computed from the previous corpus.
   =================================================================== */
import { clientShort } from "./client.js";
import { edgeVerdict } from "./edge.js";
import { escAll } from "./html.js";

export function createGeo(d) {
  const { geoData, geoComps, matchups, competitors, CAT_META, counterRules, actLabel } = d;
  // A KEY, not a label: geoData is keyed by the client's id. Using the display
  // short name matched nothing, so every overlap test silently returned "none".
  const CLIENT_KEY = (d.client && (d.client.id || d.client.short));

  /* IS THERE A CLIENT FOOTPRINT AT ALL?

     Every one of the four overlap tests is "the rival does X where the CLIENT does X",
     so with no client footprint row on file not one of them can run -- geoOffer returns
     inScope:false for the client in every country and geoOverlap answers null
     everywhere. Null is also the answer for a rival that genuinely does not overlap,
     and the two were being read as the same thing: the page printed "meets KSSL in 0 of
     them" for every competitor and "KSSL absent" over 100% of countries. That is an
     absent input rendered as a discovered fact, and it is the loudest kind, because
     "absent" is the alarming answer.

     On the live serving tables there is no client footprint: wireDataset resolves
     d.client.id from a competitors row with dir='client' or a geoComps row with isBf,
     and serving_live.competitors carries only dir in {rival, threat} -- so geoData has
     no key for the client and this is false. Consumers branch on it to say the
     footprint is not established instead of asserting zero overlap. It becomes true
     with no further edits the moment a client row is served. */
  const clientFootprintKnown = Object.keys((geoData && geoData[CLIENT_KEY]) || {}).length > 0;

  const countriesForComp = (cid) => Object.keys(geoData[cid] || {});
  const compsInCountry = (country) =>
    geoComps.filter((c) => geoData[c.id] && geoData[c.id][country]);
  const productsFor = (cid, country) => (geoData[cid] && geoData[cid][country]) || [];
  const dirForAct = (c) =>
    c === "lp" ? "threat" : c === "pt" ? "threat" : c === "bf" ? "fav" : "watch";

  /* ---- product-category detection from the footprint row text ----
     Data-driven: CAT_META carries one keyword list per category (the same map the
     source platform's ksslCounter used). A row can hit several categories — "SH-15
     155mm / VT-series tanks" is artillery AND armour — so detection returns the set.
     No keyword hit -> null, and the UI says so honestly. */
  /* in the dataset's own band order (smallest set first): the served CAT_META comes back from the
     database with its keys alphabetical, which listed "dc, hhp, mid, sub500, vhhp" */
  const BAND_ORDER = ((d.POS_CATS || []).map((r) => r[0]));
  const bandRank = (k) => (BAND_ORDER.indexOf(k) < 0 ? 99 : BAND_ORDER.indexOf(k));
  const GEO_BANDS = Object.keys(CAT_META || {}).sort((a, b) => bandRank(a) - bandRank(b));
  /* A KEYWORD IS A WORD, NOT A SUBSTRING.

     `includes` matched the UAV keyword "isr" inside "Israel" and the missile
     keyword "sam" inside "Samsung", so a sentence reading "…Rafael of Israel
     qualified in field trials…" gave Saab a UAV band and produced a UAV "overlap"
     with the client that no document supports. Keywords are matched on word
     boundaries now; a multi-word keyword ("air defence") still matches as a
     phrase, and a keyword ending in a letter still matches its plural. */
  const kwRx = {};
  function kwMatch(t, w) {
    if (!kwRx[w]) {
      const lit = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      /* A keyword ending in a DIGIT keeps its unit: "155" has to match
         "155mm", and "sh-15" has to match "sh-15s". A keyword ending in a
         LETTER does not: that is how "isr" matched Israel and "sam" matched
         Samsung, giving companies bands no document supports. */
      const tail = /[0-9]$/.test(w) ? "(?![0-9])" : "(s|es)?([^a-z0-9]|$)";
      kwRx[w] = new RegExp(`(^|[^a-z0-9])${lit}${tail}`, "i");
    }
    return kwRx[w].test(t);
  }
  function geoCatsOf(txt) {
    const t = (txt || "").toLowerCase();
    if (!t) return null;
    const hits = GEO_BANDS.filter((k) =>
      (CAT_META[k].kw || []).some((w) => kwMatch(t, w)),
    );
    return hits.length ? hits : null;
  }
  function koelCounter(prod) {
    if (!counterRules) return null;
    const cats = geoCatsOf(
      `${prod.name || ""} ${prod.qty || ""} ${prod.val || ""} ${prod.note || ""}`,
    );
    if (!cats) return null;
    for (let i = 0; i < counterRules.length; i++) {
      const r = counterRules[i];
      if (cats.indexOf(r.band) >= 0) return r.product ? { p: r.product, note: r.note } : null;
    }
    return null;
  }

  /* Footprint rows that are not a competing defence platform: electronics, radar and
     C4I suites, and component or aerostructure supply into someone else's platform.
     Without this a radar row would read as a platform collision with KSSL. */
  const GEO_NOTGEN = /\bradar\b|electronic warfare|\bc4i\b|avionics|aerostructure|fuselage|components for|subsystems for/i;

  /* geoKvaSpan's defence equivalent: the "span" of an offering is the SET of product
     categories its rows reach, so category overlap needs the whole set rather than
     the single strongest hit the counter lookup uses. */
  function geoKvaSpan(txt) {
    return geoCatsOf(txt);
  }
  function geoBandsOf(span) {
    if (!span) return [];
    return GEO_BANDS.filter((k) => span.indexOf(k) >= 0);
  }
  function geoBandLabel(b) {
    const r = (counterRules || []).filter((z) => z.band === b)[0];
    return (r && r.label) || (CAT_META[b] && CAT_META[b].label) || b;
  }
  const geoBandShort = (b) =>
    ({
      art: "Artillery",
      ammo: "Ammunition",
      sa: "Small Arms",
      pav: "Armour",
      mro: "MRO",
      naval: "Naval",
      uav: "UAV",
      msl: "Missiles",
      pc: "Forgings",
      // the genset bands, by rating
      sub500: "under 500 kVA",
      mid: "500-1,000 kVA",
      hhp: "1,001-2,000 kVA",
      vhhp: "2,001-3,000 kVA",
      dc: "over 3,000 kVA",
    })[b] || b;

  // one company's defence offering in one country, merged across its rows
  function geoOffer(cid, country) {
    const rows = productsFor(cid, country);
    const cats = {};
    let def = false;
    const acts = {};
    rows.forEach((p) => {
      const txt = `${p.name || ""} ${p.qty || ""} ${p.val || ""} ${p.note || ""}`;
      if (GEO_NOTGEN.test(txt)) return;
      const cs = geoCatsOf(txt);
      acts[p.c] = 1;
      if (cs) {
        def = true;
        cs.forEach((c) => {
          cats[c] = 1;
        });
      }
    });
    const span = Object.keys(cats);
    return { span: span.length ? GEO_BANDS.filter((k) => span.indexOf(k) >= 0) : null, inScope: def, acts };
  }

  // class-matched Positioning pairs, indexed by rival name and product category
  let _pairs = null;
  function geoPairIndex() {
    if (_pairs) return _pairs;
    const m = {};
    Object.keys(matchups).forEach((k) => {
      const x = matchups[k];
      const key = `${x.compBy}||${x.catKey}`;
      (m[key] = m[key] || []).push(x);
    });
    _pairs = m;
    return m;
  }
  // a geo row is a rival if it is a tracked competitor OR it appears in the
  // Positioning corpus (the foreign primes are matched-up but not deep-tracked)
  let _muNames = null;
  /* "Bharat Electronics (BEL)" and "BEL" are the same company. geoComps spell
     the name out, competitors carry the trading name, and the corpus uses legal
     names ("Advanced Weapons and Equipment India Limited"). An exact-string join
     matched none of them, so 6 rivals and 17 country footprints were never
     tested for overlap and silently reported "no overlapping rival on file". */
  const coKey = (s) =>
    String(s || "")
      .toLowerCase()
      .replace(/\(.*?\)/g, " ")
      .replace(/\b(limited|ltd|pvt|private|company|co|inc|corporation|group|the|and|systems|defence|defense|aerospace)\b/g, " ")
      .replace(/[^a-z0-9]+/g, "")
      .trim();
  const nameLike = (a, b) => {
    const x = coKey(a);
    const y = coKey(b);
    return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
  };
  const geoIsRival = (name, id) => {
    if (
      competitors &&
      Object.keys(competitors).some(
        (k) => (id && k === id) || competitors[k].name === name || nameLike(competitors[k].name, name),
      )
    )
      return true;
    if (!_muNames) {
      _muNames = {};
      Object.keys(matchups).forEach((k) => {
        _muNames[matchups[k].compBy] = 1;
      });
    }
    if (_muNames[name]) return true;
    return Object.keys(_muNames).some((n) => nameLike(n, name));
  };

  const _ov = {};
  function geoOverlap(cid, country) {
    const ck = `${cid}||${country}`;
    if (ck in _ov) return _ov[ck];
    const out = (() => {
      // no client footprint -> the comparison has no left-hand side; see
      // clientFootprintKnown. Stated here so the reason is at the test, not
      // three geoOffer calls away.
      if (!clientFootprintKnown) return null;
      const c = geoComps.filter((x) => x.id === cid)[0];
      if (!c || c.isBf) return null;
      // geoComps also carries customers (telecom tower, data-centre operators),
      // an alternator supplier and a propulsion-engine JV — none of them rivals
      if (!geoIsRival(c.name, c.id)) return null;
      const k = geoOffer(CLIENT_KEY, country);
      const r = geoOffer(cid, country);
      if (!k.inScope || !r.inScope || !k.span || !r.span) return null;
      const rb = geoBandsOf(r.span);
      const bands = geoBandsOf(k.span).filter((b) => rb.indexOf(b) >= 0);
      if (!bands.length) return null;
      const idx = geoPairIndex();
      const per = bands.map((b) => {
        const ms = idx[`${c.name}||${b}`] || [];
        let rival = 0;
        let koel = 0;
        let level = 0;
        /* each pair is read the way the comparison below reads it (geoPairRead: who wins more of the
           rows the datasheets decide), so this table and the pair list cannot disagree */
        ms.forEach((x) => {
          const r = geoPairRead(x);
          if (!r.dirn) return;
          if (r.who === "rival") rival++;
          else if (r.who === "koel") koel++;
          else level++;
        });
        const cr = counterRules.filter((z) => z.band === b)[0];
        // graded = pairs that actually produced an index. n>0 with graded===0 means
        // the pair exists but no dimension was measured on both sides.
        return {
          band: b,
          n: ms.length,
          graded: rival + koel + level,
          rival,
          koel,
          level,
          counter: (cr && cr.product) || null,
        };
      });
      const sum = (f) => per.reduce((a, x) => a + x[f], 0);
      // Confirmation is PER BAND, not per overlap. The band list comes from the free
      // text on the footprint row; the pairs come from the product catalogue, and the
      // two disagree. Caterpillar's row claims "13 kVA - 4000+ kVA" but its catalogue
      // here starts at 500 kVA, so three of its five bands have no model pair at all.
      const bandsSpec = per.filter((p) => p.graded > 0).map((p) => p.band);
      const bandsOnly = per.filter((p) => p.graded === 0).map((p) => p.band);
      return {
        comp: c,
        country,
        bands,
        per,
        n: sum("n"),
        graded: sum("graded"),
        bandsSpec,
        bandsOnly,
        tier: bandsSpec.length ? "spec" : "cat",
        rival: sum("rival"),
        koel: sum("koel"),
        level: sum("level"),
        koelSpan: k.span,
        rivalSpan: r.span,
        local: !!r.acts.lp,
        licence: !!r.acts.pt,
        exportOnly: !r.acts.lp && !!r.acts.ex,
      };
    })();
    _ov[ck] = out;
    return out;
  }

  // every rival that contests KSSL in one country
  function geoRivalsIn(country) {
    const ownData = geoData[CLIENT_KEY] || {};
    if (!ownData[country]) return [];
    return compsInCountry(country)
      .map((c) => geoOverlap(c.id, country))
      .filter(Boolean);
  }

  const geoSpanText = (s) => (s && s.length ? s.map(geoBandShort).join(" · ") : "not stated");
  // "in United States" reads wrong in every sentence this copy builds
  const geoThe = (ct) =>
    /^(United |Netherlands|Philippines|Czech)/.test(ct || "") ? `the ${ct}` : ct;

  // the marker that sits in front of the name
  function geoOvBadge(ov) {
    if (!ov) return "";
    if (ov.tier === "spec")
      return (
        '<span class="geo-ovb spec" title="Same country, same product class, ' +
        `${ov.bands.length} overlapping product categor${ov.bands.length === 1 ? "y" : "ies"}, and ${ov.graded}` +
        ` class-matched model pairs compared spec for spec in ${ov.bandsSpec.length} of them` +
        (ov.bandsOnly.length
          ? `. The other ${ov.bandsOnly.length} are claimed by the stated offering but hold no matched model.`
          : "") +
        '">◉ overlap</span>'
      );
    return (
      '<span class="geo-ovb cat" title="Same country, same product class and an overlapping ' +
      "category, but no class-matched model pair is on file - the collision is not confirmed " +
      'at spec level">◎ category only</span>'
    );
  }
  function geoOvBadgeCountry(country) {
    const rs = geoRivalsIn(country);
    if (!rs.length) return "";
    const spec = rs.filter((r) => r.tier === "spec").length;
    return spec
      ? `<span class="geo-ovb spec" title="${spec} rival${spec === 1 ? "" : "s"}` +
          ` contest ${clientShort()} here on class-matched models">◉ ${spec} contested</span>`
      : '<span class="geo-ovb cat" title="Rivals share a category here but no class-matched ' +
          `pair is on file">◎ ${rs.length} category only</span>`;
  }

  /* Three distinct states, previously collapsed into one misleading label:
     no pair on file · pair exists but no dimension measured on both sides · a verdict */
  function geoBandOutcome(p) {
    if (!p.n) return '<span class="gv-non">no matched model pair</span>';
    if (!p.graded) return '<span class="gv-non">pair found, no index computed</span>';
    if (p.rival > p.koel)
      return `<span class="gv-bad">rival leads ${p.rival} of ${p.graded}</span>`;
    if (p.koel > p.rival)
      return `<span class="gv-good">${clientShort()} leads ${p.koel} of ${p.graded}</span>`;
    if (p.rival === p.koel && p.rival > 0)
      return `<span class="gv-mid">split - rival ${p.rival}, ${clientShort()} ${p.koel}${p.level ? `, level ${p.level}` : ""} (of ${p.graded})</span>`;
    return `<span class="gv-mid">level - ${p.level} of ${p.graded} near parity</span>`;
  }

  /* ---- the complete product comparison behind an overlap ----
     For every overlapping band, each matched client / rival model pair, spec by spec, with who wins each
     directional row (`hi` true = higher is better, false = lower is better, null = not a ranking row). cv is
     the competitor's value, kv the client's. A pair is ahead for whoever wins more directional rows.
     A band with no matched pair says so and names the client line that would answer it by rating. */
  const stripCo = (s) => String(s || "").replace(/^[^·]*·\s*/, "");
  function geoWinner(s) {
    if (s.hi == null || s.cn == null || s.kn == null || s.cn === s.kn) return null;
    return (s.cn > s.kn) === !!s.hi ? "rival" : "koel";
  }
  // how far apart the two figures are, as a share of their mean
  const geoGap = (s) => (s.cn != null && s.kn != null && s.cn + s.kn ? (Math.abs(s.kn - s.cn) / ((s.cn + s.kn) / 2)) * 100 : null);
  function geoPairRead(x) {
    let rival = 0;
    let koel = 0;
    let level = 0;
    const rows = (x.specs || []).map((s) => {
      const w = s.hi == null ? null : geoWinner(s) || (s.cn != null && s.kn != null ? "level" : null);
      if (w === "rival") rival++;
      else if (w === "koel") koel++;
      else if (w === "level") level++;
      return { s, w, gap: geoGap(s) };
    });
    const dirn = rival + koel + level;
    const who = !dirn ? "none" : rival > koel ? "rival" : koel > rival ? "koel" : "level";
    return { rows, rival, koel, level, dirn, who };
  }
  const CMP_WORD = {
    rival: ["gc-rival", "Competitor’s product is better"],
    koel: ["gc-koel", `${clientShort()} has the superior product`],
    level: ["gc-level", "Level: neither leads"],
    none: ["gc-none", "Not decided: no ranking spec measured on both"],
  };
  // spec rows are grouped so a long datasheet reads as sections
  const CMP_GROUPS = [
    ["Ratings", /rating|kva|kw\b|prime|standby/i],
    ["Engine", /engine|cylinder|displacement|aspiration|bore|speed|rpm/i],
    ["Fuel", /fuel/i],
    ["Footprint", /length|width|height|ground|density/i],
    ["Weight", /weight/i],
  ];
  const cmpGroupOf = (label) => (CMP_GROUPS.find(([, rx]) => rx.test(label)) || ["Emissions, controls and site ratings"])[0];
  const CMP_ORDER = [...CMP_GROUPS.map((g) => g[0]), "Emissions, controls and site ratings"];
  const pct = (g) => (g == null ? "" : g < 1 ? "<1%" : `${g.toFixed(g < 10 ? 1 : 0)}%`);

  function geoPairCard(x, nm, open) {
    const r = geoPairRead(x);
    const [cls, word] = CMP_WORD[r.who];
    const fmt = (v, u) => (v == null || v === "" ? "—" : escAll(`${v}${u && !String(v).includes(u) ? " " + u : ""}`));
    const decided = r.rows.filter((q) => q.w === "rival" || q.w === "koel");
    const top = (w) => decided.filter((q) => q.w === w).sort((a, b) => (b.gap || 0) - (a.gap || 0)).slice(0, 3);
    const lead = (w, who) => {
      const t = top(w);
      return t.length ? `<div class="gc-lead ${w === "rival" ? "rv" : "kv"}"><b>${who} is ahead on</b> ${t.map((q) => `${escAll(q.s.l.replace(/ \(.*\)$/, ""))} (${pct(q.gap)})`).join(", ")}</div>` : "";
    };
    let h = `<details class="gc-pair"${open ? " open" : ""}><summary><span class="gc-names"><b>${escAll(stripCo(x.bf))}</b> <i>vs</i> <b>${escAll(stripCo(x.comp))}</b></span>` +
      `<span class="gc-chip ${cls}">${word}</span><span class="gc-score">${r.dirn ? `${nm.short} ${r.rival} · ${clientShort()} ${r.koel} · level ${r.level} (of ${r.dirn} decided rows)` : "no ranking rows"}</span></summary>`;
    h += `<div class="gc-reason">${escAll(x.reason || "")}</div>`;
    h += lead("rival", nm.short) + lead("koel", `${clientShort()}`);
    h += `<table class="gc-tbl"><tr><th>Spec</th><th>${clientShort()}<br>${escAll(stripCo(x.bf))}</th><th>${nm.short}<br>${escAll(stripCo(x.comp))}</th><th>Gap</th></tr>`;
    CMP_ORDER.forEach((g) => {
      const rows = r.rows.filter((q) => cmpGroupOf(q.s.l) === g);
      if (!rows.length) return;
      h += `<tr class="gc-grp"><td colspan="4">${escAll(g)}</td></tr>`;
      rows.forEach(({ s, w, gap }) => {
        h += `<tr><td>${escAll(s.l)}</td><td class="${w === "koel" ? "gc-win" : ""}">${fmt(s.kv, s.u)}${w === "koel" ? " ▲" : ""}</td><td class="${w === "rival" ? "gc-win rv" : ""}">${fmt(s.cv, s.u)}${w === "rival" ? " ▲" : ""}</td><td class="gc-gap">${(w === "rival" || w === "koel" || g === "Ratings") && s.cn != null && s.kn != null && s.cn !== s.kn && gap != null ? pct(gap) : ""}</td></tr>`;
      });
    });
    h += "</table>";
    const q = [...(x.advCompQ || []).map((t) => `<li class="rv">${escAll(t)}</li>`), ...(x.advBfQ || []).map((t) => `<li class="kv">${escAll(t)}</li>`)];
    if (q.length) h += `<div class="gc-ql">Qualitative differences</div><ul class="gc-q">${q.join("")}</ul>`;
    const src = (x.srcs || []).filter((z) => z && z.url).map((z) => `<a href="${escAll(z.url)}" target="_blank" rel="noopener noreferrer">${escAll(z.label || "source")} ↗</a>`).join(" · ");
    if (src) h += `<div class="gc-src">${src}</div>`;
    return h + "</details>";
  }

  /* ---- the competitor's own products in this market, each with its the client answer ----
     The list a reader scans first: every genset the rival's catalogue carries, smallest first, with the
     the client model it is matched to (if any) and who wins the datasheet. Picking one opens that single
     pair on the right (geoProductCompareHtml). A model with no matched the client model is listed too and
     says so, so the list is the rival's range, not only the part the client can answer. */
  let _byRival = null;
  const pairOfProduct = (pid) => {
    if (!_byRival) {
      _byRival = {};
      Object.keys(matchups).forEach((k) => { if (matchups[k]._cp) _byRival[matchups[k]._cp] = matchups[k]; });
    }
    return _byRival[pid] || null;
  };
  const kvaOf = (p) => {
    const m = String((p.specs && (p.specs["Standby rating"] || p.specs["Prime rating"])) || "").match(/([\d.]+)\s*kva/i);
    return m ? parseFloat(m[1]) : null;
  };
  function geoRivalProducts(ov) {
    const co = competitors && competitors[ov.comp.id];
    const rows = ((co && co.products) || [])
      .filter((p) => /genset/i.test(p.category || ""))
      .map((p) => ({ p, x: pairOfProduct(p.id), kva: kvaOf(p) }));
    return rows.sort((a, b) => (bandRank(a.p.band) - bandRank(b.p.band)) || ((a.kva || 1e9) - (b.kva || 1e9)));
  }
  function geoProductListHtml(ov, activeId) {
    const rows = geoRivalProducts(ov);
    if (!rows.length) return "";
    const nm = escAll(ov.comp.name);
    const paired = rows.filter((r) => r.x).length;
    let h = `<div class="geo-pl-h"><span class="geo-pl-t">Products ${nm} sells</span><span class="geo-pl-n">${rows.length} models · ${paired} matched to a ${clientShort()} model</span></div>`;
    h += `<div class="geo-pl-hint">Pick a model to compare it with its ${clientShort()} counterpart on the right.</div>`;
    rows.forEach(({ p, x, kva }) => {
      const r = x ? geoPairRead(x) : null;
      const [cls, word] = r ? CMP_WORD[r.who] : ["gc-none", `No matched ${clientShort()} model`];
      const meta = [p.band ? geoBandLabel(p.band) : null, kva ? `${kva} kVA` : null, p.hz ? `${p.hz} Hz` : null, p.category].filter(Boolean).join(" · ");
      h += `<div class="geo-rel-item prod${p.id === activeId ? " active" : ""}" data-cmp-prod="${escAll(p.id)}"><span class="ri-act ex"></span><div class="ri-main">` +
        `<div class="ri-nm">${escAll(p.name)}</div><div class="ri-desc">${escAll(meta)}</div>` +
        `<div class="ri-counter${x ? "" : " none"}"><span class="rc-lab">${clientShort()} counter</span> ` +
        (x ? `<span class="rc-prod">${escAll(stripCo(x.bf))}</span>` : '<span class="rc-prod muted">no like-for-like product</span>') +
        ` <span class="gc-chip ${cls}">${word}</span></div></div><span class="ri-chev">›</span></div>`;
    });
    return h;
  }
  // { title, html } for the right-hand pane: one rival model against its the client counterpart
  function geoProductCompare(ov, pid) {
    const row = geoRivalProducts(ov).find((r) => r.p.id === pid);
    if (!row) return null;
    const { p, x } = row;
    const nm = { name: escAll(ov.comp.name), short: escAll(String(ov.comp.name).split(/[ /(]/)[0]) };
    if (x) return { title: `${p.name} vs ${stripCo(x.bf)}`, html: `<div class="gc">${geoPairCard(x, nm, true)}</div>` };
    const cr = counterRules.filter((z) => z.band === p.band)[0];
    let h = `<div class="gc"><div class="gc-blk"><b>${escAll(p.name)}</b>: no like-for-like comparison. No ${nm.name} datasheet row is matched to a ${clientShort()} model of the same rating and frequency${cr && cr.product ? `. ${clientShort()}’s line in this class: ${escAll(cr.product)}` : ""}.</div>`;
    h += '<table class="gc-tbl"><tr><th>Spec</th><th>' + escAll(p.name) + "</th></tr>";
    Object.keys(p.specs || {}).forEach((k) => { h += `<tr><td>${escAll(k)}</td><td>${escAll(p.specs[k])}</td></tr>`; });
    return { title: `${p.name}: no ${clientShort()} counterpart`, html: h + "</table></div>" };
  }

  /* KSSL's own row in a country: who contests it here, and how hard. */
  function geoOwnPanel(country) {
    const rs = geoRivalsIn(country);
    const ct = escAll(geoThe(country));
    const k = geoOffer(CLIENT_KEY, country);
    /* Without a client footprint there is nothing to contest, so "no rival contests
       KSSL here" would be a conclusion drawn from a missing row. Say which row is
       missing. */
    if (!clientFootprintKnown) {
      return (
        '<div class="geo-ov none"><div class="geo-ov-h"><span class="geo-ov-t">◌ Overlap not assessed in ' +
        `${ct}</span></div>` +
        '<div class="geo-ov-why"><span class="gw-l">Why there is no answer here</span><ul>' +
        `<li><b>No ${clientShort()} footprint is on file.</b> Every overlap test compares a rival's offering against ` +
        `${clientShort()}'s in the same country, and the served footprint tables carry no ${clientShort()} rows, so no test could run.</li>` +
        `<li><b>This is not a finding of ‘uncontested’.</b> Rivals may well overlap ${clientShort()} here; nothing ` +
        "has been measured either way until a client footprint is served.</li>" +
        "</ul></div></div>"
      );
    }
    if (!rs.length) {
      return (
        '<div class="geo-ov none"><div class="geo-ov-h"><span class="geo-ov-t">○ No overlapping rival on file</span>' +
        `<span class="geo-ov-sp">${geoSpanText(k.span)}</span></div>` +
        `<div class="geo-ov-why"><span class="gw-l">What this means for ${clientShort()}</span><ul>` +
        `<li><b>Nothing here contests ${clientShort()} on a like-for-like platform.</b> No rival in the dataset sells into a category ` +
        `into ${ct} that meets ${clientShort()}’s ${geoSpanText(k.span)}.</li>` +
        "<li><b>Read it as one of two things, not as a win.</b> Either the market is genuinely uncontested by the " +
        "tracked set - in which case pricing power here is higher than in India - or the rivals present are simply " +
        "not mapped for this country yet. The footprint rows are the limit of what can be said.</li>" +
        "</ul></div></div>"
      );
    }
    const spec = rs.filter((r) => r.tier === "spec");
    const local = rs.filter((r) => r.local);
    const hardest = spec
      .slice()
      .sort((a, b) => b.rival - b.koel - (a.rival - a.koel) || b.graded - a.graded)[0];
    let h =
      `<div class="geo-ov ${spec.length ? "spec" : "cat"}"><div class="geo-ov-h"><span class="geo-ov-t">` +
      `${spec.length ? "◉ " : "◎ "}${rs.length} rival${rs.length === 1 ? "" : "s"} overlap ${clientShort()} in ${ct}` +
      `${spec.length ? "" : " - none confirmed on specs"}</span>` +
      `<span class="geo-ov-sp">${clientShort()} ${geoSpanText(k.span)}</span></div>`;
    h +=
      '<table class="geo-ov-tbl"><tr><th>Rival</th><th>Overlapping categories</th><th class="n">Matched pairs</th>' +
      "<th>Datasheet outcome</th><th>Presence</th></tr>";
    rs.slice()
      .sort((a, b) => b.graded - a.graded)
      .forEach((r) => {
        let out = '<span class="gv-non">no matched pair</span>';
        if (r.graded) {
          if (r.rival > r.koel)
            out = `<span class="gv-bad">rival leads ${r.rival} of ${r.graded}</span>`;
          else if (r.koel > r.rival)
            out = `<span class="gv-good">${clientShort()} leads ${r.koel} of ${r.graded}</span>`;
          else out = '<span class="gv-mid">level</span>';
        }
        // bands its catalogue actually reaches, then the ones only its stated range claims
        const bd =
          r.bandsSpec.map(geoBandShort).join(" · ") +
          (r.bandsOnly.length
            ? `${r.bandsSpec.length ? " · " : ""}<span class="gv-non">${r.bandsOnly.map(geoBandShort).join(" · ")} (range only)</span>`
            : "");
        h +=
          `<tr><td>${escAll(r.comp.name)}</td><td>${bd}` +
          `</td><td class="n">${r.graded || "—"}</td><td>${out}</td><td>` +
          `${r.local ? '<span class="gv-bad">builds here</span>' : r.licence ? "partner / licence" : "exports in"}` +
          "</td></tr>";
      });
    h += "</table>";
    h += `<div class="geo-ov-why"><span class="gw-l">What this means for ${clientShort()}</span><ul>`;
    h +=
      rs.length === 1
        ? `<li><b>The single overlap here is ${spec.length ? "confirmed at spec level" : "unconfirmed"}.</b> ` +
          (spec.length
            ? "Same country, same product class, overlapping product category, and class-matched models compared line by line."
            : "The categories meet, but no model pair is close enough in class to compare spec for spec.") +
          "</li>"
        : spec.length
          ? `<li><b>${spec.length} of the ${rs.length} overlaps ${spec.length === 1 ? "is" : "are"}` +
            " confirmed at spec level</b> - same country, same product class, overlapping category, and class-matched " +
            "models compared line by line." +
            (rs.length > spec.length
              ? ` The remaining ${rs.length - spec.length} share a category with ${clientShort()} but have no matched pair on file, so they are leads rather than proven collisions.`
              : "") +
            "</li>"
          : `<li><b>None of the ${rs.length} overlaps is confirmed at spec level.</b> All ${rs.length} sell defence platforms ` +
            `into ${ct} in a category ${clientShort()} also covers, but no class-matched model pair is on file for any of them, so ` +
            "every one is a lead to check rather than a measured collision.</li>";
    if (local.length)
      h +=
        `<li><b>${local.length} of them manufacture in ${ct}.</b> That is the hardest form of the overlap: they ` +
        "quote local currency, local lead times and local spares, which beats an equivalent imported machine before " +
        "specifications are compared.</li>";
    if (hardest && hardest.graded && hardest.rival > hardest.koel)
      h +=
        `<li><b>Sharpest exposure: ${escAll(hardest.comp.name)}.</b> It takes the datasheet in ${hardest.rival}` +
        ` of ${hardest.graded} class-matched pairs across ${hardest.bandsSpec.map(geoBandShort).join(", ")}` +
        `, so ${clientShort()} is holding that ground on price, financing or service rather than on measured specification.</li>`;
    // only claim open ground where a category KSSL covers is genuinely reached by no rival
    const contested = {};
    rs.forEach((r) =>
      r.bandsSpec.forEach((b) => {
        contested[b] = 1;
      }),
    );
    const open = geoBandsOf(k.span).filter((b) => !contested[b]);
    h += open.length
      ? `<li><b>Open ground: ${open.map(geoBandShort).join(", ")}.</b> ${clientShort()}’s portfolio covers ` +
        `${open.length === 1 ? "this category" : "these categories"} in ${ct} and no rival here reaches ` +
        `${open.length === 1 ? "it" : "them"}, so ${clientShort()} quotes unopposed within the tracked set - the highest-margin volume ` +
        "in this market.</li>"
      : `<li><b>No open ground here.</b> Every category ${clientShort()}’s portfolio covers in ${ct} is reached by at least one rival, ` +
        `so there is no category in this market where ${clientShort()} quotes unopposed.</li>`;
    h += "</ul></div>";
    h +=
      `<div class="geo-ov-src">Overlap from the footprint rows on this page · categories from the ${clientShort()} category ` +
      "definitions · datasheet outcome from the Positioning comparisons for each rival in the shared categories.</div>";
    return `${h}</div>`;
  }

  /* Dot state for one row of the competitor dropdown. Scoped to the selected
     country when there is one, otherwise across every market the rival is in. */
  function geoPickOverlap(c, selCountry) {
    const n = countriesForComp(c.id).length;
    const mk = `${n} mkt${n === 1 ? "" : "s"}`;
    if (c.isBf)
      return {
        cls: "bf",
        meta: mk,
        tip: `${clientShort()} - present in ${n} market${n === 1 ? "" : "s"}`,
      };
    const scope = selCountry ? [selCountry] : countriesForComp(c.id);
    const ovs = scope.map((ct) => geoOverlap(c.id, ct)).filter(Boolean);
    /* "No overlap" is a finding; "not assessed" is not. With no client footprint on
       file the test never ran, so this dot must not be the same dot a rival earns by
       being tested and cleared -- it had been marking every rival in the roster
       "no overlap" on the strength of a missing input. */
    if (!clientFootprintKnown)
      return {
        cls: "ovl-unk",
        meta: mk,
        tip: `Overlap with ${clientShort()} not assessed${selCountry ? ` in ${selCountry}` : ""} - no ${clientShort()} footprint is on file to compare against`,
      };
    if (!ovs.length)
      return {
        cls: "noovl",
        meta: mk,
        tip: `No overlap with ${clientShort()}${selCountry ? ` in ${selCountry}` : ""} - no overlapping product category on a defence offering`,
      };
    const spec = ovs.filter((o) => o.tier === "spec");
    const where = selCountry
      ? ` in ${selCountry}`
      : ` in ${ovs.length} market${ovs.length === 1 ? "" : "s"}`;
    return spec.length
      ? {
          cls: "ovl",
          meta: mk,
          tip: `Overlaps ${clientShort()}${where} - confirmed on class-matched models in ${spec
            .map((o) => o.bandsSpec.map(geoBandShort).join(", "))
            .join(" / ")}`,
        }
      : {
          cls: "ovl-cat",
          meta: mk,
          tip: `Shares a category with ${clientShort()}${where}, but no class-matched model pair is on file`,
        };
  }

  /* Guards the parts of the overlap test that fail silently: a span parsed from
     the wrong end of a range, a band claimed that neither side reaches, a customer
     or component supplier counted as a rival, and matched pairs attributed to a
     band they are not in. */
  function selfCheck() {
    const fail = [];
    const ok = (c, m) => {
      if (!c) fail.push(m);
    };
    const S = (t) => geoKvaSpan(t);
    ok((S("SH-15 155mm howitzers") || []).indexOf("art") >= 0, "a 155mm row must read as artillery");
    ok(
      JSON.stringify(S("SH-15 155mm / VT-series tanks")) === JSON.stringify(["art", "pav"]),
      "artillery + armour in one row must yield both categories, in canonical order",
    );
    ok((S("Hermes 900 MALE UAV supplied") || []).indexOf("uav") >= 0, "a UAV row must read as uav");
    ok((S("Spike ATGM (multiple operators)") || []).indexOf("msl") >= 0, "an ATGM row must read as missiles");
    ok(S("training and simulation centre") === null, "no category keyword -> no span");
    ok(geoBandsOf(null).length === 0, "no span -> no categories");
    ok(
      JSON.stringify(geoBandsOf(["pav", "art"])) === JSON.stringify(["art", "pav"]),
      "geoBandsOf must return canonical category order",
    );
    const kc = koelCounter({ name: "CAESAR 155mm howitzer" });
    ok(kc && /ATAGS/.test(kc.p), `a 155mm rival product must be countered by the ${clientShort()} artillery line`);
    ok(
      koelCounter({ name: "battlefield surveillance radar" }) === null,
      `a radar row has no like-for-like ${clientShort()} counter`,
    );
    ok(GEO_NOTGEN.test("battlefield radar systems"), "radar rows must be excluded from the platform test");
    ok(
      GEO_NOTGEN.test("aerostructure components for a foreign prime"),
      "component supply into someone else's platform must be excluded",
    );
    let nSpec = 0;
    Object.keys(geoData).forEach((cid) =>
      Object.keys(geoData[cid]).forEach((ct) => {
        const ov = geoOverlap(cid, ct);
        if (!ov) return;
        if (ov.tier === "spec") nSpec++;
        ok(ov.bands.length > 0, `${ov.comp.name}/${ct}: an overlap with no shared band`);
        ok(geoIsRival(ov.comp.name, ov.comp.id), `${ov.comp.name} is flagged an overlap but is not a competitor`);
        const kb = geoBandsOf(ov.koelSpan);
        const rb = geoBandsOf(ov.rivalSpan);
        ov.bands.forEach((b) =>
          ok(
            kb.indexOf(b) >= 0 && rb.indexOf(b) >= 0,
            `${ov.comp.name}/${ct}: band ${b} is not reached by both sides`,
          ),
        );
        ok(
          ov.n === ov.per.reduce((a, p) => a + p.n, 0),
          `${ov.comp.name}/${ct}: pair total does not match its bands`,
        );
        ok(
          (ov.tier === "spec") === (ov.bandsSpec.length > 0),
          `${ov.comp.name}/${ct}: tier disagrees with its graded bands`,
        );
        ok(
          ov.bandsSpec.length + ov.bandsOnly.length === ov.bands.length,
          `${ov.comp.name}/${ct}: bands do not split cleanly into graded and range-only`,
        );
        ok(ov.graded <= ov.n, `${ov.comp.name}/${ct}: more graded pairs than pairs`);
        ok(
          ov.rival + ov.koel + ov.level === ov.graded,
          `${ov.comp.name}/${ct}: verdicts do not sum to graded`,
        );
        ov.per.forEach((p) => {
          const idx = geoPairIndex()[`${ov.comp.name}||${p.band}`] || [];
          ok(idx.length === p.n, `${ov.comp.name}/${p.band}: pair count not sourced from that band`);
          ok(
            idx.every((x) => x.compBy === ov.comp.name && x.catKey === p.band),
            `${ov.comp.name}/${p.band}: a pair belongs to another rival or band`,
          );
        });
      }),
    );
    /* Only assert this where the comparison could run at all. With no client footprint
       served, zero spec-confirmed overlaps is the correct answer, not a failure -- and
       reporting it as one trained the eye to ignore this check. */
    ok(
      clientFootprintKnown ? nSpec > 0 : nSpec === 0,
      clientFootprintKnown
        ? "no spec-confirmed overlap found at all"
        : "an overlap was computed with no client footprint on file",
    );
    // the dropdown dot is the only place the overlap is read at a glance, so it must
    // not drift from the model behind it
    geoComps.forEach((c) => {
      const got = geoPickOverlap(c, null).cls;
      const ovs = countriesForComp(c.id)
        .map((ct) => geoOverlap(c.id, ct))
        .filter(Boolean);
      const want = c.isBf
        ? "bf"
        : !clientFootprintKnown
          ? "ovl-unk"
          : ovs.some((o) => o.tier === "spec")
            ? "ovl"
            : ovs.length
              ? "ovl-cat"
              : "noovl";
      ok(got === want, `dropdown dot for ${c.name} is "${got}" but the model says "${want}"`);
    });
    ok(geoOverlap(CLIENT_KEY, "India") === null, "the client cannot overlap itself");
    if (fail.length) console.error("geo-overlap self-check FAILED:", fail);
    return fail;
  }

  return {
    clientFootprintKnown,
    countriesForComp,
    compsInCountry,
    productsFor,
    dirForAct,
    koelCounter,
    geoCatsOf,
    geoKvaSpan,
    geoBandsOf,
    geoBandShort,
    geoBandLabel,
    geoOffer,
    geoOverlap,
    geoRivalsIn,
    geoSpanText,
    geoThe,
    geoOvBadge,
    geoOvBadgeCountry,
    geoProductListHtml,
    geoProductCompare,
    geoOwnPanel,
    geoPickOverlap,
    actLabel,
    selfCheck,
  };
}

/* The Footprint Lookup's competitor menu, and the count line above it, must count the
   same companies. The menu offered the whole roster -- 174 rows on the live dataset,
   97 of them badged "0 mkts", each opening an empty panel -- while the count line
   said 77. A competitor with no served market is not a footprint to look up. */
export function geoCoveredCompetitors(d) {
  const geoData = (d && d.geoData) || {};
  return ((d && d.geoComps) || []).filter((c) => c && geoData[c.id] && Object.keys(geoData[c.id]).length > 0);
}

export function geoLookupCompetitors(d, country, query) {
  const geoData = (d && d.geoData) || {};
  const q = String(query || "").trim().toLowerCase();
  return geoCoveredCompetitors(d).filter(
    (c) =>
      (!q || String(c.name || "").toLowerCase().includes(q)) &&
      (!country || !!geoData[c.id][country]),
  );
}
