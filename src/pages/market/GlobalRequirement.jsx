import { useEffect, useMemo, useRef, useState } from "react";
import { useAppState, useHeaderReport } from "../../state/AppState";
import { useData } from "../../state/DataProvider";
import { smartTitleCase } from "../../lib/profile";

export default function GlobalRequirement() {
  const { data } = useData();
  const { setScope } = useAppState();
  const clientName = (data?.client && (data.client.short || data.client.name)) || "";

  const reqList = useMemo(() => {
    return data?.globalRequirements || [];
  }, [data]);

  const [country, setCountry] = useState(null);
  const [cat, setCat] = useState(null);
  const [menu, setMenu] = useState(null);
  const [menuQuery, setMenuQuery] = useState("");
  const [sel, setSel] = useState(null);
  const asmtRef = useRef(null);

  useEffect(() => {
    if (asmtRef.current) {
      asmtRef.current.scrollTop = 0;
    }
  }, [sel]);

  useEffect(() => {
    const onDocClick = (e) => {
      if (!e.target.closest(".tp-dd")) setMenu(null);
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  // Filtered requirements list
  const filteredList = useMemo(() => {
    return reqList
      .filter((r) => !country || r.country === country)
      .filter((r) => !cat || r.cat === cat)
      .sort((a, b) => (Number(a.dl) || 999) - (Number(b.dl) || 999));
  }, [reqList, country, cat]);

  // Selected requirement record
  const selectedReq = useMemo(() => {
    return sel ? reqList.find((r) => r.id === sel) : null;
  }, [sel, reqList]);

  const select = (id) => {
    const item = reqList.find((r) => r.id === id);
    if (!item) return;
    setSel(id);
    setScope("requirement", { type: "requirement", data: item }, {
      pillar: "Market",
      view: "Global Requirements",
      selection: `${item.title} (${item.country})`,
    });
  };

  // Header Report integration for Copy / Export / Print
  const report = useMemo(() => {
    const sections = [];
    if (selectedReq) {
      sections.push({
        h: "Selected Requirement",
        rows: [
          ["Title", selectedReq.title],
          ["Buyer", selectedReq.buyer || "—"],
          ["Country", selectedReq.country || "—"],
          ["Category", selectedReq.cat || "—"],
          ["Estimated Value", selectedReq.value || "—"],
          ["KSSL Fit", `${selectedReq.ksslFit || "—"} (${selectedReq.ksslModel || "—"})`],
          ["Description", selectedReq.desc || "—"],
        ],
      });
      if (Array.isArray(selectedReq.specs) && selectedReq.specs.length) {
        sections.push({ h: "Technical Specifications", rows: selectedReq.specs });
      }
      if (selectedReq.strategicAssessment) {
        sections.push({ h: "Strategic Assessment", rows: [["Assessment", selectedReq.strategicAssessment]] });
      }
    }
    sections.push({
      h: `Requirements List (${filteredList.length})`,
      rows: filteredList.map((r) => [
        r.title,
        `${r.country} · ${r.buyer} · ${r.cat} · ${r.value} · Fit: ${r.ksslFit} (${r.ksslModel})`,
      ]),
    });
    return {
      title: "Global Defence Requirements",
      subtitle: [country, cat].filter(Boolean).join(" · ") || `${reqList.length} global requirements tracked`,
      sections,
      payload: { filters: { country, category: cat }, selected: selectedReq, requirements: filteredList },
    };
  }, [selectedReq, filteredList, country, cat, reqList.length]);

  useHeaderReport(report);

  // Facet options
  const countryOptions = useMemo(() => {
    const counts = {};
    reqList
      .filter((r) => !cat || r.cat === cat)
      .forEach((r) => {
        if (r.country) counts[r.country] = (counts[r.country] || 0) + 1;
      });
    const q = menuQuery.trim().toLowerCase();
    return Object.entries(counts)
      .map(([v, n]) => ({ v, n }))
      .filter((o) => !q || o.v.toLowerCase().includes(q))
      .sort((a, b) => b.n - a.n || a.v.localeCompare(b.v));
  }, [reqList, cat, menuQuery]);

  const catOptions = useMemo(() => {
    const counts = {};
    reqList
      .filter((r) => !country || r.country === country)
      .forEach((r) => {
        if (r.cat) counts[r.cat] = (counts[r.cat] || 0) + 1;
      });
    return Object.entries(counts)
      .map(([v, n]) => ({ v, n }))
      .sort((a, b) => b.n - a.n || a.v.localeCompare(b.v));
  }, [reqList, country]);

  const renderDropdown = (which, label, value, setValue, options) => (
    <div className="tp-dd" data-tpdd={which}>
      <div
        className={`tp-dd-input${value ? " has-val" : ""}`}
        onClick={() => {
          setMenuQuery("");
          setMenu(menu === which ? null : which);
        }}
        role="button"
        tabIndex={0}
      >
        <span className="ddlbl">{label}</span>
        <span className={`ddval${value ? "" : " placeholder"}`}>{value || "All"}</span>
        <span className="caret">▾</span>
        <span
          className="ddclear"
          onClick={(e) => {
            e.stopPropagation();
            setValue(null);
          }}
        >
          ×
        </span>
      </div>
      <div className={`tp-dd-menu${menu === which ? " open" : ""}`}>
        {which === "country" && (
          <div className="tp-dd-search">
            <input
              autoComplete="off"
              onChange={(e) => setMenuQuery(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              placeholder="Search country…"
              type="text"
              value={menu === "country" ? menuQuery : ""}
            />
          </div>
        )}
        <div
          className="tp-dd-pick tp-dd-all"
          onClick={() => {
            setValue(null);
            setMenu(null);
          }}
        >
          All {which === "country" ? "countries" : "categories"} ({options.length})
        </div>
        {options.map(({ v, n }) => (
          <div
            className="tp-dd-pick"
            key={v}
            onClick={() => {
              setValue(v);
              setSel(null);
              setMenu(null);
            }}
          >
            {v}
            <span className="m">{n}</span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className={`tp-view v-tender ${selectedReq ? "has-sel" : "no-sel"}`}>
      <div className="tp-list">
        <div className="tp-fbar">
          <span className="eyebrow">Filter</span>
          {renderDropdown("country", "Country", country, setCountry, countryOptions)}
          {renderDropdown("cat", "Category", cat, setCat, catOptions)}
          <span className="sortnote">sorted by requirement deadline</span>
        </div>

        <div id="tp-cards">
          {filteredList.length ? (
            filteredList.map((row) => {
              const rawFit = row.ksslFit || row.fit || "strong";
              const s = String(rawFit).toLowerCase().trim();
              const fitLevel =
                s === "strong" || s === "high" || s === "good"
                  ? "strong"
                  : s === "partial" || s === "mid"
                    ? "partial"
                    : "weak";
              const barWidth = fitLevel === "strong" ? "100%" : fitLevel === "partial" ? "65%" : "30%";
              const fitLabel = fitLevel;

              const dlNum = Number(row.dl);
              const isUrgent = !isNaN(dlNum) && dlNum <= 7;
              const isSoon = !isNaN(dlNum) && dlNum <= 14 && dlNum > 7;
              const dlCls = isUrgent ? "urgent" : isSoon ? "soon" : "normal";

              const countdownText =
                row.dl != null && !isNaN(dlNum)
                  ? dlNum === 0
                    ? "today"
                    : `${dlNum} day${dlNum === 1 ? "" : "s"} left`
                  : row.deadline || "Draft Stage";

              return (
                <div
                  className={`tcard${sel === row.id ? " sel" : ""}`}
                  key={row.id}
                  onClick={() => select(row.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      select(row.id);
                    }
                  }}
                >
                  <div className="trow1">
                    <div className="ttl">{smartTitleCase(row.title)}</div>
                    <span className={`ddl ${dlCls}`}>{countdownText}</span>
                  </div>

                  <div className="tpgrid">
                    <div className="tpp">
                      <span className="tpk">Buyer</span>
                      <span className="tpv" title={row.buyer}>{row.buyer || "—"}</span>
                    </div>
                    <div className="tpp">
                      <span className="tpk">Country</span>
                      <span className="tpv">{row.country || "—"}</span>
                    </div>
                    <div className="tpp">
                      <span className="tpk">Category</span>
                      <span className="tpv" title={row.cat}>{row.cat || "—"}</span>
                    </div>
                    <div className="tpp">
                      <span className="tpk">Value</span>
                      <span className="tpv">{row.value || "not disclosed"}</span>
                    </div>
                    <div className="tpp">
                      <span className="tpk">Status</span>
                      <span className="tpv">{row.status || "Requirement Draft"}</span>
                    </div>
                  </div>

                  <div className="fitbar">
                    <span className="fitlab">{clientName} fit</span>
                    <span className="fittrack">
                      <i className={fitLevel} style={{ width: barWidth }} />
                    </span>
                    <span className={`fitpct grade ${fitLevel}`}>{fitLabel}</span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="tp-list-empty">
              {country || cat ? "No requirements match this filter" : "No global requirements are on record."}
            </div>
          )}
        </div>
      </div>

      {/* Side Assessment Drawer */}
      <div className="tp-asmt" id="tp-asmt">
        {selectedReq ? (
          <div id="tp-asmt-body" style={{ display: "flex", flex: 1, flexDirection: "column", height: "100%", overflow: "hidden" }}>
            <div className="tp-asmt-scroll" ref={asmtRef} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", paddingBottom: "24px" }}>
              <div className="tp-asmt-h">
                <div className="ctx-h-actions">
                  <button
                    aria-label="Close"
                    className="col-close"
                    onClick={() => setSel(null)}
                    title="Close"
                    type="button"
                  >
                    ✕
                  </button>
                </div>
                <span className="eyebrow">Requirement Intelligence</span>
                <div className="ct">{smartTitleCase(selectedReq.title)}</div>
                <div className="sub" style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "8px" }}>
                  <div>{[selectedReq.buyer, selectedReq.country, selectedReq.value].filter(Boolean).join(" · ")}</div>
                  <div>{[selectedReq.cat, selectedReq.deadline || selectedReq.status].filter(Boolean).join(" · ")}</div>
                </div>
              </div>

              {/* Requirement Scope & Context */}
              {selectedReq.desc && (
                <div className="tp-asmt-sec">
                  <span className="eyebrow">Requirement Scope</span>
                  <div className="cd-prose">{selectedReq.desc}</div>
                </div>
              )}

              {/* Key Specifications */}
              {Array.isArray(selectedReq.specs) && selectedReq.specs.length > 0 && (
                <div className="tp-asmt-sec">
                  <span className="eyebrow">Target Specifications</span>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "8px", marginTop: "8px" }}>
                    {selectedReq.specs.map(([label, val], idx) => (
                      <div key={idx} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--d-line)", paddingBottom: "6px" }}>
                        <span style={{ fontFamily: "var(--mono)", fontSize: "11px", color: "var(--d-txt-4)" }}>{label}</span>
                        <span style={{ fontFamily: "var(--sans)", fontSize: "12px", color: "var(--d-txt)", fontWeight: 500, textAlign: "right" }}>{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Strategic Fit */}
              <div className="tp-asmt-sec">
                <span className="eyebrow">{clientName} Platform Match</span>
                <div className="tp-fit-verdict" style={{ textTransform: "capitalize" }}>
                  {selectedReq.ksslFit || "Strong"} Fit · {selectedReq.ksslModel || "Indigenous Defense Portfolio"}
                </div>
              </div>

              {/* Strategic Assessment */}
              {selectedReq.strategicAssessment && (
                <div className="tp-asmt-sec">
                  <span className="eyebrow">Strategic Assessment</span>
                  <div className="cd-prose">{selectedReq.strategicAssessment}</div>
                  <div className="pj-note" style={{ marginTop: "8px", fontSize: "11px", color: "var(--d-txt-4)", fontStyle: "italic" }}>
                    The analyst's read for {clientName}, from the dataset's record of this requirement.
                  </div>
                </div>
              )}

              {/* Source */}
              {Array.isArray(selectedReq.sources) && selectedReq.sources.length > 0 && (
                <div className="tp-asmt-sec">
                  <span className="eyebrow">Source</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "6px" }}>
                    {selectedReq.sources.map((src, i) => (
                      <a
                        key={i}
                        className="ovt-host"
                        href={src.url || "#"}
                        rel="noreferrer"
                        style={{ color: "var(--fav-badge)", textDecoration: "none", fontSize: "11px", fontFamily: "var(--mono)" }}
                        target="_blank"
                      >
                        ↗ {src.label || src.url}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="tp-asmt-empty" style={{ padding: "40px 20px", textAlign: "center", color: "var(--d-txt-4)", fontFamily: "var(--mono)", fontSize: "11px" }}>
            Select a global requirement to inspect operational specifications, strategic match, and intelligence assessment.
          </div>
        )}
      </div>
    </div>
  );
}
