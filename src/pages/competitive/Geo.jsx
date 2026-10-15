import { useEffect, useMemo, useState } from "react";
import GeoMap from "../../components/geoMap/GeoMap";
import { useAppState, useHeaderReport } from "../../state/AppState";
import { useData } from "../../state/DataProvider";
import { compareProducts } from "../../lib/compareProducts";

const COUNTRY_ALIASES = {
  UAE: ["United Arab Emirates", "UAE"],
  "United Arab Emirates": ["United Arab Emirates", "UAE"],
  USA: ["United States", "USA", "United States of America"],
  "United States": ["United States", "USA", "United States of America"],
  UK: ["United Kingdom", "UK", "Great Britain"],
  "United Kingdom": ["United Kingdom", "UK", "Great Britain"],
  Russia: ["Russian Federation", "Russia"],
  "Russian Federation": ["Russian Federation", "Russia"],
  "South Korea": ["South Korea", "Korea"],
};

const valueOrNull = (value) => value === null || value === undefined || value === "" ? null : String(value);
const compact = (values) => values.filter(Boolean);

function aliasesFor(country) {
  return COUNTRY_ALIASES[country] || (country ? [country] : []);
}

function normalized(value) {
  return String(value || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}

function labelAfterMaker(value) {
  const text = String(value || "").trim();
  const divider = text.indexOf(" · ");
  return divider > -1 ? text.slice(divider + 3).trim() : text;
}

function cleanText(value) {
  return String(value || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();
}

function matchupCountryMatches(value, country) {
  const wanted = new Set(aliasesFor(country).map(normalized));
  return wanted.has(normalized(value));
}

function matchupCompanyMatches(matchup, company) {
  const wanted = normalized(company?.name || company?.id || company);
  const maker = normalized(matchup?.compBy);
  const label = normalized(matchup?.comp);
  return Boolean(wanted && (maker === wanted || label === wanted || label.startsWith(`${wanted} `) || label.startsWith(`${wanted} ·`)));
}

function pairMatchups(data, company, country) {
  return Object.entries(data?.matchups || {})
    .map(([id, matchup]) => ({ ...matchup, id: matchup.id || id }))
    .filter((matchup) => matchupCountryMatches(matchup.country, country) && matchupCompanyMatches(matchup, company));
}

function rowMatchup(row, matchups) {
  const rowName = normalized(row?.name);
  if (!rowName) return null;
  const rowTokens = rowName.split(" ").filter((token) => token.length > 2);
  const scored = matchups
    .map((matchup) => ({ matchup, product: normalized(labelAfterMaker(matchup.comp)) }))
    .map(({ matchup, product }) => {
      if (!product) return { matchup, score: 0 };
      if (rowName === product || rowName.includes(product) || product.includes(rowName)) return { matchup, score: 100 };
      const productTokens = new Set(product.split(" ").filter((token) => token.length > 2));
      const shared = rowTokens.filter((token) => productTokens.has(token));
      const score = shared.length >= 2 ? shared.length * 10 : 0;
      return { matchup, score };
    })
    .sort((a, b) => b.score - a.score);
  return scored[0]?.score > 0 ? scored[0].matchup : null;
}

function comparisonForMatchup(matchup) {
  if (!matchup) return null;
  const rival = {};
  const kssl = {};
  (matchup.specs || []).forEach((spec) => {
    if (!spec?.l) return;
    rival[spec.l] = { v: spec.cv ?? null, n: typeof spec.cn === "number" ? spec.cn : null, hi: spec.hi ?? null, u: spec.u || "" };
    kssl[spec.l] = { v: spec.kv ?? null, n: typeof spec.kn === "number" ? spec.kn : null, hi: spec.hi ?? null, u: spec.u || "" };
  });
  return compareProducts({ specs: rival }, { specs: kssl });
}

function rawSources(row) {
  const sources = [];
  if (row?.src) sources.push({ url: row.src, label: row.srcnote || "Source evidence" });
  (Array.isArray(row?.srcs) ? row.srcs : []).forEach((source) => {
    if (typeof source === "string") sources.push({ url: source, label: "Source evidence" });
    else if (source?.url) sources.push({ url: source.url, label: source.label || source.title || "Source evidence" });
  });
  return sources.filter((source, index, list) => list.findIndex((item) => item.url === source.url) === index);
}

function activityLabel(data, code) {
  return data?.actLabel?.[code] || code || "Activity not coded";
}

function threatClass(value) {
  return value === "high" || value === "threat" ? "threat" : value === "fav" ? "fav" : "watch";
}

function outcomeText(row) {
  if (!row?.n) return "No matched model pair";
  if (!row.graded) return "Pair found; no index computed";
  if (row.rival > row.koel) return `Rival leads ${row.rival} of ${row.graded}`;
  if (row.koel > row.rival) return `KSSL leads ${row.koel} of ${row.graded}`;
  return `Near parity - ${row.level} of ${row.graded}`;
}

function footprintCountries(data, geo) {
  const preferred = data?.geoCountries || [];
  const clientKey = data?.client?.id || data?.client?.short || "KSSL";
  const own = geo?.countriesForComp(clientKey) || Object.keys(data?.geoData?.[clientKey] || {});
  const all = [...new Set([...preferred, ...own])];
  return all.map((name) => {
    const keys = [...new Set([name, ...aliasesFor(name)])];
    const rows = keys.reduce((count, key) => Object.values(data?.geoData || {}).reduce((sum, byCountry) => sum + (byCountry?.[key]?.length || 0), count), 0);
    return { name, rows };
  }).filter((country) => country.rows > 0);
}

export default function Geo() {
  const { data, geo } = useData();
  const { setScope } = useAppState();
  const [selectedComp, setSelectedComp] = useState(null);
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [pair, setPair] = useState(null);
  const [selectedRowIndex, setSelectedRowIndex] = useState(0);
  const [selectedMatchupId, setSelectedMatchupId] = useState(null);
  const [showDetail, setShowDetail] = useState(false);
  const [activeMenu, setActiveMenu] = useState(null);
  const [menuSearch, setMenuSearch] = useState("");
  const [drillBack, setDrillBack] = useState(false);

  const clientKey = data?.client?.id || data?.client?.short || "KSSL";
  const clientName = data?.client?.short || data?.client?.name || "KSSL";

  useEffect(() => {
    const closeMenus = (event) => { if (!event.target.closest(".geo-dd")) setActiveMenu(null); };
    document.addEventListener("click", closeMenus);
    return () => document.removeEventListener("click", closeMenus);
  }, []);

  const closeDetail = () => {
    setShowDetail(false); setSelectedComp(null); setSelectedCountry(null); setPair(null); setSelectedRowIndex(0); setSelectedMatchupId(null); setDrillBack(false);
  };

  const competitorsList = useMemo(() => (data?.geoComps || [])
    .filter((company) => !company.isBf && (geo?.countriesForComp(company.id) || []).length > 0)
    .map((company) => {
      const profile = data.competitors?.[company.id] || {};
      return { ...company, cid: company.id, name: company.name || profile.name || company.id, presenceCount: geo.countriesForComp(company.id).length, threat: profile.threat || company.dir || "watch" };
    })
    .sort((a, b) => a.name.localeCompare(b.name)), [data, geo]);

  const countriesList = useMemo(() => footprintCountries(data, geo), [data, geo]);

  const rowsForCountry = (cid, country) => {
    for (const key of [...new Set([country, ...aliasesFor(country)])]) {
      const rows = geo?.productsFor(cid, key) || [];
      if (rows.length) return { country: key, rows };
    }
    return { country, rows: [] };
  };

  const ownRowsForCountry = useMemo(() => selectedCountry ? rowsForCountry(clientKey, selectedCountry) : { country: selectedCountry, rows: [] }, [selectedCountry, clientKey, geo]);

  const compsInSelectedCountry = useMemo(() => {
    if (!selectedCountry) return [];
    const seen = new Set(); const result = [];
    for (const key of [selectedCountry, ...aliasesFor(selectedCountry)]) {
      for (const company of geo?.compsInCountry(key) || []) {
        if (seen.has(company.id)) continue;
        seen.add(company.id);
        const resolved = rowsForCountry(company.id, selectedCountry);
        const roster = competitorsList.find((item) => item.cid === company.id);
        result.push({ ...company, name: company.name || company.id, rows: resolved.rows, country: resolved.country, threat: roster?.threat || company.dir || "watch", overlap: geo?.geoOverlap(company.id, resolved.country) || null });
      }
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [selectedCountry, geo, competitorsList]);

  const countriesForSelectedComp = useMemo(() => !selectedComp ? [] : geo.countriesForComp(selectedComp).map((country) => ({ country, rows: geo.productsFor(selectedComp, country), overlap: geo.geoOverlap(selectedComp, country) })), [selectedComp, geo]);
  const activePair = pair ? rowsForCountry(pair.cid, pair.country) : { country: null, rows: [] };
  const activeRows = activePair.rows;
  const currentRow = activeRows[selectedRowIndex] || activeRows[0] || null;
  const activeOverlap = pair && activePair.country ? geo.geoOverlap(pair.cid, activePair.country) : null;
  const activeCompany = pair ? competitorsList.find((company) => company.cid === pair.cid) || { id: pair.cid, name: pair.cid } : null;
  const activeMatchups = useMemo(() => pair ? pairMatchups(data, activeCompany, activePair.country || pair.country) : [], [data, pair, activeCompany, activePair.country]);
  const selectedMatchup = useMemo(() => activeMatchups.find((matchup) => matchup.id === selectedMatchupId) || null, [activeMatchups, selectedMatchupId]);

  const countryOverlapCount = useMemo(() => !selectedCountry || !ownRowsForCountry.rows.length ? 0 : compsInSelectedCountry.filter((item) => item.overlap).length, [selectedCountry, ownRowsForCountry, compsInSelectedCountry]);

  const countryNews = useMemo(() => {
    if (!selectedCountry) return [];
    const keys = new Set([selectedCountry, ...aliasesFor(selectedCountry)]); const signals = [];
    Object.values(data.geoData || {}).forEach((byCountry) => Object.entries(byCountry || {}).forEach(([country, rows]) => {
      if (!keys.has(country)) return;
      (rows || []).forEach((row) => (Array.isArray(row.geo_news) ? row.geo_news : []).forEach((signal) => signals.push(signal)));
    }));
    return signals;
  }, [data, selectedCountry]);

  const selectedCompany = selectedComp ? data.competitors?.[selectedComp] || {} : null;
  const selectedCompanyName = competitorsList.find((company) => company.cid === selectedComp)?.name || selectedComp;

  const headerDetails = useMemo(() => {
    if (pair) {
      const companyName = competitorsList.find((company) => company.cid === pair.cid)?.name || pair.cid;
      const activityCounts = activeRows.reduce((counts, row) => { const label = activityLabel(data, row.c); counts[label] = (counts[label] || 0) + 1; return counts; }, {});
      return { kind: "Products supplied", title: `${companyName} → ${activePair.country || pair.country}`, sub: `${activeRows.length} footprint record${activeRows.length === 1 ? "" : "s"} in this market`, pills: Object.entries(activityCounts).map(([label, count]) => `${count} ${label}`) };
    }
    if (selectedCountry) {
      const specOverlaps = compsInSelectedCountry.filter((item) => item.overlap?.tier === "spec").length;
      const categoryOverlaps = compsInSelectedCountry.filter((item) => item.overlap && item.overlap.tier !== "spec").length;
      const overlapCopy = `${specOverlaps} contest KSSL on indexed model match${specOverlaps === 1 ? "" : "es"}${categoryOverlaps ? `, ${categoryOverlaps} on category only` : ""}`;
      return { kind: "Market", title: selectedCountry, sub: `${compsInSelectedCountry.length} competitors active · ${ownRowsForCountry.rows.length ? "KSSL present" : "KSSL footprint not recorded"} · ${overlapCopy}` };
    }
    if (selectedComp) return { kind: "Competitor global footprint", title: selectedCompanyName, sub: `${countriesForSelectedComp.length} market${countriesForSelectedComp.length === 1 ? "" : "s"} with served footprint records` };
    const totalRows = Object.values(data.geoData || {}).reduce((sum, byCountry) => sum + Object.values(byCountry || {}).reduce((n, rows) => n + rows.length, 0), 0);
    return { kind: "KSSL global footprint", title: `${clientName} Geo Footprint`, sub: `${competitorsList.length} tracked competitors · ${countriesList.length} served markets · ${totalRows} footprint records` };
  }, [pair, activePair.country, activeRows, selectedCountry, selectedComp, selectedCompanyName, competitorsList, compsInSelectedCountry, ownRowsForCountry, countriesForSelectedComp, data, clientName, countriesList]);

  const headerReport = useMemo(() => ({
    title: headerDetails.title,
    subtitle: headerDetails.sub,
    sections: [{
      heading: "Footprint records",
      facts: activeRows.map((row) => [
        row.name || "Unnamed footprint record",
        compact([activityLabel(data, row.c), valueOrNull(row.stage), valueOrNull(row.since)]).join(" · "),
      ]),
    }],
    payload: { country: selectedCountry, competitor: selectedComp, pair },
  }), [
    headerDetails.title,
    headerDetails.sub,
    activeRows.length,
    pair?.cid,
    pair?.country,
    selectedCountry,
    selectedComp,
    data,
  ]);

  useHeaderReport(headerReport);

  useEffect(() => {
    setScope("competitive", { country: selectedCountry, competitor: selectedComp, platforms: activeRows.length }, { pillar: "Competitive", view: "Geo Footprint", selection: headerDetails.title });
  }, [selectedCountry, selectedComp, activeRows.length, headerDetails.title, setScope]);

  const selectCountry = (country) => { setSelectedCountry(country); setSelectedComp(null); setPair(null); setSelectedRowIndex(0); setSelectedMatchupId(null); setDrillBack(false); setShowDetail(true); };
  const selectCompetitor = (cid) => { setSelectedComp(cid); setSelectedCountry(null); setPair(null); setSelectedRowIndex(0); setSelectedMatchupId(null); setDrillBack(false); setShowDetail(true); };
  const selectPair = (cid, country, fromCountry = false) => { setSelectedComp(cid); setSelectedCountry(country); setPair({ cid, country }); setSelectedRowIndex(0); setSelectedMatchupId(null); setDrillBack(fromCountry); setShowDetail(true); };

  return (
    <div className="geo-view v-geo" style={{ position: "relative" }}>
      <div className="geo-bar">
        <span className="eyebrow" style={{ marginRight: 6 }}>Geo Footprint</span>
        <div className="geo-dd">
          <div className={`geo-dd-input${selectedComp ? " has-val" : ""}`} onClick={(event) => { event.stopPropagation(); setActiveMenu(activeMenu === "comp" ? null : "comp"); setMenuSearch(""); }}><span className="ddlbl">Competitor</span><span className={`ddval${!selectedComp ? " placeholder" : ""}`}>{selectedComp ? selectedCompanyName : `All Rivals (${competitorsList.length})`}</span><span className="caret">▾</span>{selectedComp && <span className="ddclear" onClick={(event) => { event.stopPropagation(); setSelectedComp(null); setPair(null); if (!selectedCountry) setShowDetail(false); }}>✕</span>}</div>
          <div className={`geo-dd-menu${activeMenu === "comp" ? " open" : ""}`}><div className="geo-dd-search"><input type="text" placeholder="Search competitor…" value={menuSearch} onChange={(event) => setMenuSearch(event.target.value)} onClick={(event) => event.stopPropagation()} /></div>{competitorsList.filter((company) => !menuSearch || company.name.toLowerCase().includes(menuSearch.toLowerCase())).map((company) => <div key={company.cid} className={`geo-pick${selectedComp === company.cid ? " sel" : ""}`} onClick={() => { selectCompetitor(company.cid); setActiveMenu(null); }}><span className={`pk-dot ${threatClass(company.threat)}`} /><span className="pk-nm">{company.name}</span><span className="pk-meta">{company.presenceCount} markets</span></div>)}</div>
        </div>
        <div className="geo-dd">
          <div className={`geo-dd-input${selectedCountry ? " has-val" : ""}`} onClick={(event) => { event.stopPropagation(); setActiveMenu(activeMenu === "country" ? null : "country"); setMenuSearch(""); }}><span className="ddlbl">Country</span><span className={`ddval${!selectedCountry ? " placeholder" : ""}`}>{selectedCountry || `All Markets (${countriesList.length})`}</span><span className="caret">▾</span>{selectedCountry && <span className="ddclear" onClick={(event) => { event.stopPropagation(); setSelectedCountry(null); setPair(null); if (!selectedComp) setShowDetail(false); }}>✕</span>}</div>
          <div className={`geo-dd-menu${activeMenu === "country" ? " open" : ""}`}><div className="geo-dd-search"><input type="text" placeholder="Search country / market…" value={menuSearch} onChange={(event) => setMenuSearch(event.target.value)} onClick={(event) => event.stopPropagation()} /></div>{countriesList.filter((country) => !menuSearch || country.name.toLowerCase().includes(menuSearch.toLowerCase())).map((country) => <div key={country.name} className={`geo-pick${selectedCountry === country.name ? " sel" : ""}`} onClick={() => { selectCountry(country.name); setActiveMenu(null); }}><span className="pk-dot ovl" /><span className="pk-nm">{country.name}</span><span className="pk-meta">{country.rows} records</span></div>)}</div>
        </div>
        {(selectedComp || selectedCountry || showDetail) && <button type="button" className="geo-back geo-clear-action" onClick={closeDetail}>Clear / View Full Map</button>}
      </div>

      <div className="geo-content-map"><div className="geo-map-full"><GeoMap data={data} geo={geo} selectedCountry={selectedCountry || pair?.country || null} onSelectCountry={selectCountry} /></div></div>

      {showDetail && (selectedCountry || pair || selectedComp) && <div className="geo-det-overlay" id="geo-det">
        <div className="geo-d-h dir-watch geo-overlay-header"><div className="geo-hdr-controls">{drillBack && <button type="button" className="geo-back geo-overlay-btn" onClick={() => { setPair(null); setSelectedMatchupId(null); setDrillBack(false); }}>‹ Back</button>}<button type="button" className="geo-close-btn" onClick={closeDetail} title="Close and view full map" aria-label="Close">✕</button></div><span className="eyebrow geo-overlay-eyebrow">{headerDetails.kind}</span><div className="geo-hdr-main"><div className="ct">{headerDetails.title}</div><div className="geo-rel-sub">{headerDetails.sub}</div>{headerDetails.pills?.length > 0 && <div className="geo-header-pills">{headerDetails.pills.map((pill) => <span key={pill} className="geo-header-pill">{pill}</span>)}</div>}</div></div>
        <div className={`geo-det-overlay-body ${pair ? `geo-products-mode${selectedMatchup ? " has-comparison" : ""}` : selectedCountry ? "geo-market-mode" : "has-prod"}`}>
          {selectedCountry && !pair && <CountryMarketView data={data} clientName={clientName} country={selectedCountry} ownRows={ownRowsForCountry.rows} companies={compsInSelectedCountry} onSelectPair={selectPair} geo={geo} />}
          {pair && <SuppliedProductsView data={data} clientName={clientName} companyName={selectedCompanyName} country={activePair.country || pair.country} rows={activeRows} matchups={activeMatchups} selectedMatchup={selectedMatchup} currentRow={currentRow} overlap={activeOverlap} geo={geo} selectedRowIndex={selectedRowIndex} onSelectRow={(row, index) => { setSelectedRowIndex(index); const matchup = rowMatchup(row, activeMatchups); setSelectedMatchupId(matchup?.id || null); }} />}
          {selectedComp && !pair && !selectedCountry && <><div className="geo-rel-overlay-list"><div className="geo-list-pad"><span className="eyebrow geo-list-title">Markets for {selectedCompanyName} ({countriesForSelectedComp.length})</span>{countriesForSelectedComp.map((market) => <div key={market.country} className={`geo-rel-item${market.overlap ? ` ov-${market.overlap.tier}` : ""}`} onClick={() => selectPair(selectedComp, market.country)}><div className={`ri-act ${market.rows[0]?.c || "sv"}`} /><div className="ri-main"><div className="ri-nm">{market.country} {market.overlap && <span className={`geo-ovb ${market.overlap.tier}`}>{market.overlap.tier === "spec" ? "Confirmed overlap" : "Category overlap"}</span>}</div><div className="ri-desc">{market.rows.length} footprint record{market.rows.length === 1 ? "" : "s"}</div><span className="ri-tag">{market.rows[0]?.name || "Unnamed footprint record"}</span></div><span className="ri-chev">›</span></div>)}</div></div><div className="geo-det-product-sec"><CompetitorDetail company={selectedCompany} name={selectedCompanyName} countries={countriesForSelectedComp} /></div></>}
        </div>
      </div>}
    </div>
  );
}

function PairDetail({ data, clientName, clientKey, row, country, companyName, overlap, geo }) {
  const fields = [["Activity", activityLabel(data, row.c)], ["Stage / status", valueOrNull(row.stage)], ["Reported value", valueOrNull(row.val)], ["Quantity / place", valueOrNull(row.qty)], ["Since", valueOrNull(row.since)]];
  const sources = rawSources(row); const ownRows = geo?.productsFor(clientKey, country) || [];
  return <div className="geo-detail-content"><span className="eyebrow geo-detail-eyebrow">Footprint record</span><h3>{row.name || "Unnamed footprint record"}</h3><div className="geo-detail-sub">{companyName} · {country}</div><div className={`geo-data-card geo-overlap-summary${overlap ? ` ${overlap.tier}` : " none"}`}><div className="geo-card-kicker">{overlap ? (overlap.tier === "spec" ? "Confirmed KSSL overlap" : "KSSL category overlap") : "KSSL comparison status"}</div>{overlap ? <><div className="geo-card-title">{overlap.bands.map((band) => geo.geoBandShort(band)).join(" · ")}</div><div className="geo-card-copy">The served records share a country and category. {overlap.graded ? `${overlap.graded} class-matched model pair${overlap.graded === 1 ? "" : "s"} are indexed below.` : "No class-matched model pair has an index on file."}</div><div className="geo-span-line"><b>{clientName}:</b> {geo.geoSpanText(overlap.koelSpan)} · <b>{companyName}:</b> {geo.geoSpanText(overlap.rivalSpan)}</div></> : <div className="geo-card-copy">{ownRows.length ? "No confirmed KSSL overlap on the served comparison." : "KSSL has no footprint row served for this country, so overlap was not confirmed."}</div>}</div><DataFieldGrid fields={fields} />{row.note && <div className="geo-note"><span className="geo-field-label">Record note</span><p>{row.note}</p></div>}<SourceList sources={sources} sourceNote={row.srcnote} />{overlap && <OverlapTable overlap={overlap} geo={geo} />}{Array.isArray(row.geo_news) && row.geo_news.length > 0 && <NewsList news={row.geo_news} />}</div>;
}

function CountryMarketView({ data, clientName, country, ownRows, companies, onSelectPair, geo }) {
  const specCount = companies.filter((company) => company.overlap?.tier === "spec").length;
  const categoryCount = companies.filter((company) => company.overlap && company.overlap.tier !== "spec").length;
  return <div className="geo-market-view">
    <div className="geo-market-list-head"><span className="eyebrow geo-list-title">Companies active in {country}</span><span className="geo-market-count">{companies.length + (ownRows.length ? 1 : 0)} tracked entities</span></div>
    {ownRows.length > 0 && <div className="geo-market-row own"><div className={`ri-act ${ownRows[0]?.c || "lp"}`} /><div className="ri-main"><div className="ri-nm">{clientName}</div><div className="ri-desc">{ownRows.length} footprint record{ownRows.length === 1 ? "" : "s"} · {activityLabel(data, ownRows[0]?.c)} · KSSL present</div><span className="ri-tag">{ownRows[0]?.name || "Unnamed KSSL footprint record"}</span></div><span className="geo-market-mark">Own footprint</span></div>}
    {companies.length > 0 ? companies.map((company) => {
      const overlapLabel = company.overlap?.tier === "spec" ? "Confirmed overlap" : company.overlap ? "Category overlap" : "No indexed overlap";
      const overlapCopy = company.overlap?.bands?.length ? ` · meets KSSL in ${company.overlap.bands.map((band) => geo.geoBandShort(band)).join(", ")}` : "";
      return <div key={company.id} className={`geo-market-row${company.overlap ? ` ov-${company.overlap.tier}` : ""}`} onClick={() => onSelectPair(company.id, country, true)}><div className={`ri-act ${company.rows[0]?.c || "sv"}`} /><div className="ri-main"><div className="ri-nm">{company.name} <span className={`geo-ovb ${company.overlap ? company.overlap.tier : "none"}`}>{overlapLabel}</span></div><div className="ri-desc">{company.rows.length} footprint record{company.rows.length === 1 ? "" : "s"} · {activityLabel(data, company.rows[0]?.c)}{overlapCopy}</div><span className="ri-tag">{company.rows[0]?.name || "Unnamed footprint record"}</span></div><span className="ri-chev">›</span></div>;
    }) : <div className="geo-rel-empty">No competitor footprint rows are served for this market.</div>}
    <div className="geo-market-footnote">{specCount} indexed model overlap{specCount === 1 ? "" : "s"}{categoryCount ? ` · ${categoryCount} category overlap${categoryCount === 1 ? "" : "s"}` : ""}. Select a company to inspect its supplied records.</div>
  </div>;
}

function SuppliedProductsView({ data, clientName, companyName, country, rows, matchups, selectedMatchup, currentRow, overlap, geo, selectedRowIndex, onSelectRow }) {
  const footprintNames = new Set(rows.map((row) => normalized(row.name)));
  const indexedRows = matchups
    .filter((matchup) => !footprintNames.has(normalized(labelAfterMaker(matchup.comp))))
    .filter((matchup, index, list) => list.findIndex((item) => normalized(labelAfterMaker(item.comp)) === normalized(labelAfterMaker(matchup.comp))) === index)
    .map((matchup) => ({ name: labelAfterMaker(matchup.comp), c: "indexed", stage: `${matchup.cat || "Product"} matchup`, isIndexed: true, matchupId: matchup.id }));
  const displayRows = [...rows, ...indexedRows];
  const matchedCount = displayRows.filter((row) => rowMatchup(row, matchups)).length;
  return <div className="geo-products-view">
    <div className="geo-products-list">
      <div className="geo-products-list-head"><div><span className="eyebrow geo-list-title">Products and footprint records {companyName} serves</span><div className="geo-products-sub">Select a record to compare it with an indexed KSSL counterpart.</div></div><span className="geo-products-count">{displayRows.length} RECORDS · {matchedCount} MATCHED TO A KSSL COMPARISON</span></div>
      {displayRows.map((row, index) => {
        const matchup = rowMatchup(row, matchups);
        const verdict = matchup ? cleanText(matchup.verdict || matchup.verdictH || "Published KSSL comparison") : "No matched KSSL model";
        return <div key={`${row.name}-${index}`} className={`geo-product-record${selectedMatchup && selectedRowIndex === index ? " active" : ""}`} onClick={() => onSelectRow(row, index)}><div className={`ri-act ${row.isIndexed ? "indexed" : row.c || "sv"}`} /><div className="geo-product-record-main"><div className="geo-product-name">{row.name || "Unnamed footprint record"}</div><div className="geo-product-meta">{row.isIndexed ? `Indexed matchup · ${row.stage}` : `${activityLabel(data, row.c)}${row.stage ? ` · ${row.stage}` : ""}${row.since ? ` · Since ${row.since}` : ""}`}</div><div className={`geo-product-counter${matchup ? " matched" : " unmatched"}`}><span className="geo-counter-label">{clientName.toUpperCase()} COUNTERPART</span><b>{matchup ? labelAfterMaker(matchup.bf || matchup.anchor) : verdict}</b>{matchup && <span className={`geo-verdict-pill ${/kssl|kalyani|client/i.test(verdict) ? "fav" : "threat"}`}>{verdict}</span>}</div></div><span className="ri-chev">›</span></div>;
      })}
      {!displayRows.length && <div className="geo-rel-empty">No footprint rows or indexed matchup products are served for this competitor and country.</div>}
    </div>
    {selectedMatchup && currentRow && <ProductComparison data={data} clientName={clientName} companyName={companyName} country={country} row={currentRow} matchup={selectedMatchup} comparison={comparisonForMatchup(selectedMatchup)} overlap={overlap} geo={geo} />}
  </div>;
}

function ProductComparison({ data, clientName, companyName, country, row, matchup, comparison, overlap, geo }) {
  const rivalProduct = labelAfterMaker(matchup.comp);
  const ksslProduct = labelAfterMaker(matchup.bf || matchup.anchor);
  const verdict = cleanText(matchup.verdict || matchup.verdictH || "");
  const advantages = compact([matchup.advComp && `Rival: ${cleanText(matchup.advComp)}`, matchup.advBf && `${clientName}: ${cleanText(matchup.advBf)}`]);
  const sources = compact(Array.isArray(matchup.srcs) ? matchup.srcs : []).map((source) => typeof source === "string" ? { url: source, label: "Matchup source" } : source).filter((source) => source?.url);
  return <div className="geo-comparison-panel"><span className="eyebrow geo-detail-eyebrow">Product comparison · {companyName} in {country}</span><h3>{ksslProduct} vs {rivalProduct}</h3><div className="geo-detail-sub">{rivalProduct} vs {ksslProduct}</div>{verdict ? <div className="geo-comparison-verdict"><span className="geo-verdict-pill threat">{verdict}</span><span>{comparison.measured ? `${comparison.measured} measured comparison${comparison.measured === 1 ? "" : "s"}` : "Published matchup record"}</span></div> : <div className="geo-comparison-empty">No verdict text is stored for this indexed matchup. The published specifications are shown below.</div>}{advantages.length > 0 && <div className="geo-advantage-line">{advantages.map((advantage) => <span key={advantage}>{advantage}</span>)}</div>}<div className="geo-spec-table-wrap"><table className="geo-spec-table"><thead><tr><th>SPEC</th><th>{clientName.toUpperCase()}<small>{ksslProduct}</small></th><th>{companyName.toUpperCase()}<small>{rivalProduct}</small></th><th>GAP</th></tr></thead><tbody>{comparison.rows.map((spec) => <tr key={spec.l}><td>{spec.l}</td><td className={spec.win === "b" ? "winner" : ""}>{spec.bv ?? "—"}{spec.u ? ` ${spec.u}` : ""}</td><td className={spec.win === "a" ? "winner" : ""}>{spec.av ?? "—"}{spec.u ? ` ${spec.u}` : ""}</td><td>{spec.win === "b" ? `${clientName} advantage` : spec.win === "a" ? `${companyName} advantage` : spec.win === "tie" ? "Near parity" : spec.note || "—"}</td></tr>)}</tbody></table></div><div className="geo-comparison-record"><span className="eyebrow geo-section-title">Selected footprint record</span><b>{row.name || "Unnamed footprint record"}</b><span>{compact([activityLabel(data, row.c), row.stage, row.since && `Since ${row.since}`]).join(" · ")}</span>{row.note && <p>{row.note}</p>}</div>{overlap && <OverlapTable overlap={overlap} geo={geo} />}{sources.length > 0 && <SourceList sources={sources} sourceNote={matchup.srcnote} />}{rawSources(row).length > 0 && <SourceList sources={rawSources(row)} sourceNote={row.srcnote} />}</div>;
}

function CountryDetail({ data, clientName, country, ownRows, competitorCount, overlapCount, news }) {
  const ownSources = ownRows.flatMap(rawSources).filter((source, index, list) => list.findIndex((item) => item.url === source.url) === index);
  return <div className="geo-detail-content"><span className="eyebrow geo-detail-eyebrow">KSSL country footprint</span><h3>{country}</h3><div className="geo-detail-sub">Served market records for {clientName} and tracked competitors</div><div className="geo-field-grid geo-country-stats"><Stat label="Tracked competitors" value={competitorCount} /><Stat label="Confirmed overlaps" value={overlapCount} /><Stat label="KSSL records" value={ownRows.length} /></div><div className="geo-section-block"><span className="eyebrow geo-section-title">KSSL footprint records</span>{ownRows.length ? ownRows.map((row, index) => <div className="geo-country-presence-row" key={`${row.name}-${index}`}><div className={`ri-act ${row.c || "sv"}`} /><div><b>{row.name || "Unnamed footprint record"}</b><span>{compact([activityLabel(data, row.c), row.stage, row.since && `Since ${row.since}`]).join(" · ")}</span>{row.note && <p>{row.note}</p>}</div></div>) : <div className="geo-empty-inline">No KSSL footprint row is served for this country.</div>}</div><SourceList sources={ownSources} />{news.length > 0 && <NewsList news={news} />}</div>;
}

function CompetitorDetail({ company, name, countries }) {
  const profile = company || {};
  return <div className="geo-detail-content"><span className="eyebrow geo-detail-eyebrow">Competitor profile</span><h3>{name}</h3><div className="geo-detail-sub">{profile.dir || "Tracked rival"} · {profile.threat || "Threat level not reported"}</div><DataFieldGrid fields={[["Sector", valueOrNull(profile.sector)], ["Headquarters", valueOrNull(profile.hq)], ["Threat", valueOrNull(profile.threat)]]} />{profile.assess && <div className="geo-note"><span className="geo-field-label">Assessment</span><p>{profile.assess}</p></div>}{Array.isArray(profile.products) && profile.products.length > 0 && <div className="geo-section-block"><span className="eyebrow geo-section-title">Products on profile</span><div className="geo-chip-list">{profile.products.map((product) => <span className="geo-badge-inline" key={typeof product === "string" ? product : product.name}>{typeof product === "string" ? product : product.name}</span>)}</div></div>}<div className="geo-section-block"><span className="eyebrow geo-section-title">Footprint markets ({countries.length})</span>{countries.map((market) => <div className="geo-country-presence-row" key={market.country}><div className={`ri-act ${market.rows[0]?.c || "sv"}`} /><div><b>{market.country}</b><span>{market.rows.length} record{market.rows.length === 1 ? "" : "s"}{market.overlap ? ` · ${market.overlap.tier === "spec" ? "confirmed KSSL overlap" : "KSSL category overlap"}` : ""}</span></div></div>)}</div></div>;
}

function DataFieldGrid({ fields }) {
  const visible = fields.filter(([, value]) => value);
  if (!visible.length) return null;
  return <div className="geo-field-grid">{visible.map(([label, value]) => <div className="geo-field" key={label}><span className="geo-field-label">{label}</span><span className="geo-field-value">{value}</span></div>)}</div>;
}

function Stat({ label, value }) { return <div className="geo-field"><span className="geo-field-label">{label}</span><span className="geo-stat-value">{value}</span></div>; }

function SourceList({ sources, sourceNote }) {
  if (!sources.length && !sourceNote) return null;
  return <div className="geo-section-block"><span className="eyebrow geo-section-title">Source evidence</span>{sources.map((source) => <div className="geo-source" key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.label}</a><span>{source.url}</span></div>)}{sourceNote && <div className="geo-source-note">{sourceNote}</div>}</div>;
}

function OverlapTable({ overlap, geo }) {
  return <div className="geo-section-block"><span className="eyebrow geo-section-title">KSSL comparison bands</span><table className="geo-band-table"><thead><tr><th>Category</th><th>Pairs</th><th>Result</th></tr></thead><tbody>{overlap.per.map((band) => <tr key={band.band}><td>{geo.geoBandShort(band.band)}{band.counter && <small>KSSL rule: {band.counter}</small>}</td><td>{band.n || "—"}</td><td>{outcomeText(band)}</td></tr>)}</tbody></table></div>;
}

function NewsList({ news }) {
  return <div className="geo-section-block"><span className="eyebrow geo-section-title">Footprint-linked intelligence</span>{news.map((item, index) => <div className="geo-news-item" key={`${item.title || item.summary || "signal"}-${index}`}><b>{item.title || item.name || "Signal"}</b>{item.summary && <p>{item.summary}</p>}{item.url && <a href={item.url} target="_blank" rel="noreferrer">Source</a>}</div>)}</div>;
}
