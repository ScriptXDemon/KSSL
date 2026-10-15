import { useState, useMemo, useEffect } from "react";
import { useAppState, useHeaderReport } from "../../state/AppState";
import { useData } from "../../state/DataProvider";

// Format date into human-readable string
function formatDate(dateStr) {
  if (!dateStr) return "Undated";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return dateStr;
  }
}

export default function ThreatAnalysis() {
  const { setScope } = useAppState();
  const { data } = useData();

  const competitorsData = data.competitorMoment?.competitors || [];
  const momentData = data.competitorMoment || { items: [], timeWindows: [], levels: {} };
  const allMoves = momentData.items || [];

  const [selectedCid, setSelectedCid] = useState("__all");
  const [searchQuery, setSearchQuery] = useState("");
  const [timeFilter, setTimeFilter] = useState("all");
  const [customRange, setCustomRange] = useState({ from: "", to: "" });
  const [selectedMoveId, setSelectedMoveId] = useState(null);

  // Determine newest date anchor
  const newestTimestamp = useMemo(() => {
    return Math.max(0, ...allMoves.map((m) => Date.parse(m.date) || 0));
  }, [allMoves]);

  // Compute active date boundaries
  const activeDateRange = useMemo(() => {
    if (timeFilter === "custom") return customRange;
    const windowDef = momentData.timeWindows.find((w) => w.id === timeFilter);
    const days = windowDef ? windowDef.days : null;
    if (days == null || !newestTimestamp) {
      return { from: "", to: "" };
    }
    const fromTime = newestTimestamp - days * 86400000;
    return {
      from: new Date(fromTime).toISOString().slice(0, 10),
      to: new Date(newestTimestamp).toISOString().slice(0, 10),
    };
  }, [timeFilter, customRange, newestTimestamp, momentData.timeWindows]);

  // Date filter predicate
  const matchesDate = (item) => {
    const t = Date.parse(item.date) || 0;
    const fromT = activeDateRange.from ? Date.parse(activeDateRange.from) : -Infinity;
    const toT = activeDateRange.to ? Date.parse(activeDateRange.to) + 86399999 : Infinity;
    return t >= fromT && t <= toT;
  };

  // Competitor moves mapped & filtered
  const competitorStats = useMemo(() => {
    return competitorsData.map((comp) => {
      const compMoves = allMoves.filter((m) => m.cid === comp.cid);
      const filtered = compMoves.filter(matchesDate);
      return {
        ...comp,
        allCount: compMoves.length,
        filteredCount: filtered.length,
      };
    });
  }, [competitorsData, allMoves, activeDateRange]);

  // Filtered competitor list for sidebar search
  const visibleCompetitors = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return competitorStats;
    return competitorStats.filter(
      (c) => c.name.toLowerCase().includes(q) || c.short.toLowerCase().includes(q)
    );
  }, [competitorStats, searchQuery]);

  // Active moves feed
  const displayedMoves = useMemo(() => {
    let list = allMoves.filter(matchesDate);
    if (selectedCid !== "__all") {
      list = list.filter((m) => m.cid === selectedCid);
    }
    return list.slice().sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
  }, [allMoves, selectedCid, activeDateRange]);

  // Selected competitor metadata
  const selectedCompetitor = useMemo(() => {
    if (selectedCid === "__all") return null;
    return competitorsData.find((c) => c.cid === selectedCid) || null;
  }, [selectedCid, competitorsData]);

  const activeTitle = selectedCompetitor ? selectedCompetitor.name : "All competitors";
  const threatCount = displayedMoves.filter((m) => m.level === "THREAT").length;

  // Selected detail move
  const selectedMove = useMemo(() => {
    if (!selectedMoveId) return null;
    return allMoves.find((m) => m.id === selectedMoveId) || null;
  }, [selectedMoveId, allMoves]);

  // Sync with global header report
  useHeaderReport({
    title: `${activeTitle}: competitor moment`,
    subtitle: `${displayedMoves.length} move${displayedMoves.length === 1 ? "" : "s"} ${
      activeDateRange.from ? `from ${activeDateRange.from} to ${activeDateRange.to}` : "on record"
    }`,
    sections: [
      {
        heading: "Moves, newest first",
        facts: displayedMoves.map((m) => [
          `${formatDate(m.date)} · ${m.company} [${m.level}]`,
          `${m.title}. ${m.analysis}`,
        ]),
      },
    ],
    payload: {
      competitor: selectedCompetitor ? selectedCompetitor.cid : null,
      moves: displayedMoves,
    },
  });

  // Sync shell scope
  useEffect(() => {
    setScope(
      "competitive",
      { moves: displayedMoves.length, competitor: selectedCompetitor ? selectedCompetitor.cid : null },
      { pillar: "Competitive", view: "Competitor Moment", selection: activeTitle }
    );
  }, [displayedMoves.length, selectedCompetitor, activeTitle, setScope]);

  return (
    <div
      className="pos-view v-projects"
      style={{
        gridTemplateColumns: selectedMove ? "280px minmax(0, 1fr) 440px" : "280px 1fr",
      }}
    >
      {/* 1. LEFT SIDEBAR: COMPETITORS LIST */}
      <div className="mu-list">
        <div className="mu-list-h">
          <div className="proj-sidebar-h">
            <span className="eyebrow">Competitors ({competitorsData.length})</span>
          </div>
          <div className="mu-search" style={{ marginTop: "10px" }}>
            <span className="si">⌕</span>
            <input
              type="text"
              placeholder="Search competitor…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div id="patc-list">
          {/* All competitors entry */}
          <div
            className={`pat-li${selectedCid === "__all" ? " active" : ""}`}
            onClick={() => {
              setSelectedCid("__all");
              setSelectedMoveId(null);
            }}
            role="button"
            tabIndex={0}
          >
            <span
              className="pli-n"
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span>All competitors</span>
              </span>
              <span className="pli-ct">{displayedMoves.length}</span>
            </span>
          </div>

          {/* Individual competitor items */}
          {visibleCompetitors.map((c) => (
            <div
              key={c.cid}
              className={`pat-li${selectedCid === c.cid ? " active" : ""}`}
              onClick={() => {
                setSelectedCid(c.cid);
                setSelectedMoveId(null);
              }}
              role="button"
              tabIndex={0}
            >
              <span
                className="pli-n"
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}
              >
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  <span
                    className={`wdot ${
                      c.threat === "fav" ? "fav" : c.threat === "threat" ? "threat" : "watch"
                    }`}
                  />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.name}
                  </span>
                </span>
                <span className="pli-ct">{timeFilter === "all" ? c.allCount : c.filteredCount}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 2. MAIN FEED: COMPETITOR MOMENT FEED */}
      <div className="proj-main" style={{ overflowY: "auto", padding: "22px 28px 40px" }}>
        {/* Header */}
        <div className="proj-co-header">
          <div className="proj-co-title-group">
            <span className="proj-co-eyebrow">Competitor Moment</span>
            <h1 className="proj-co-name">{activeTitle}</h1>
            <div className="proj-co-sub">
              <span>
                {displayedMoves.length} {displayedMoves.length === 1 ? "move" : "moves"} in this window ·{" "}
                {threatCount} graded a threat
              </span>
            </div>
          </div>
        </div>

        {/* Time Window & Date Range Bar */}
        <div className="cm-bar">
          <div className="cm-chips" role="group" aria-label="Time window">
            {momentData.timeWindows.map((w) => (
              <button
                key={w.id}
                type="button"
                className={`cm-chip${timeFilter === w.id ? " on" : ""}`}
                onClick={() => setTimeFilter(w.id)}
              >
                {w.label}
              </button>
            ))}
          </div>

          <label className="cm-date">
            From{" "}
            <input
              type="date"
              value={activeDateRange.from}
              max={activeDateRange.to || undefined}
              onChange={(e) => {
                setCustomRange((prev) => ({ ...prev, from: e.target.value }));
                setTimeFilter("custom");
              }}
            />
          </label>

          <label className="cm-date">
            To{" "}
            <input
              type="date"
              value={activeDateRange.to}
              min={activeDateRange.from || undefined}
              onChange={(e) => {
                setCustomRange((prev) => ({ ...prev, to: e.target.value }));
                setTimeFilter("custom");
              }}
            />
          </label>

          {newestTimestamp ? (
            <span className="cm-anchor">
              Today = newest move, {formatDate(new Date(newestTimestamp).toISOString().slice(0, 10))}
            </span>
          ) : null}
        </div>

        {/* Moves List Stream */}
        {displayedMoves.length > 0 ? (
          <div className="cm-list">
            {displayedMoves.map((m) => {
              const levelCfg = momentData.levels[m.level] || { label: m.level, tagClass: "neutral" };
              const isSelected = selectedMoveId === m.id;

              return (
                <div
                  key={m.id}
                  className={`cm-row${isSelected ? " sel" : ""}`}
                  onClick={() => setSelectedMoveId(m.id)}
                  role="button"
                  tabIndex={0}
                  title="Open the strategic analysis"
                >
                  <div className="cm-left">
                    <div className="cm-img">
                      <span style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        {m.program.split(" ")[0]}
                      </span>
                    </div>
                    <div className="cm-when">
                      <b>{formatDate(m.date)}</b>
                      <span>{m.category} · {m.country}</span>
                    </div>
                  </div>

                  <div className="cm-main">
                    <div className="cm-top">
                      <span className="cm-co">{m.company}</span>
                      <span className={`proj-tag-pill ${levelCfg.tagClass}`}>
                        {levelCfg.label}
                      </span>
                      <span className="cm-src">{m.source}</span>
                    </div>

                    <div className="cm-title">{m.title}</div>
                    <div className="cm-desc">{m.description}</div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="proj-section-block" style={{ marginTop: "20px" }}>
            <table className="proj-data-table">
              <tbody>
                <tr>
                  <td className="proj-table-val">
                    No move by {activeTitle} in this window.{" "}
                    <button
                      type="button"
                      className="cm-chip on"
                      style={{ display: "inline-block", marginLeft: "8px", verticalAlign: "middle" }}
                      onClick={() => setTimeFilter("all")}
                    >
                      Show all dates
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 3. RIGHT DETAIL DRAWER: STRATEGIC ANALYSIS */}
      {selectedMove && (
        <div className="ctx v-overview revealed">
          <div className="ctx-scroll">
            {/* Header */}
            <div
              className={`ctx-h dir-${
                selectedMove.level === "THREAT"
                  ? "threat"
                  : selectedMove.level === "OPPORTUNITY"
                  ? "fav"
                  : "watch"
              }`}
            >
              <div className="ctx-h-actions">
                <button
                  type="button"
                  className="col-close"
                  onClick={() => setSelectedMoveId(null)}
                  title="Close"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
              <div className="ct" style={{ paddingRight: "40px" }}>
                {selectedMove.title}
              </div>
              <div className="sub" style={{ marginTop: "8px" }}>
                {selectedMove.company} · {formatDate(selectedMove.date)}
              </div>
            </div>

            {/* At a Glance Facts */}
            <div className="ctx-sec">
              <span className="eyebrow">At a glance</span>
              <div className="cd-facts">
                {[
                  ["Company", selectedMove.company],
                  ["Date", formatDate(selectedMove.date)],
                  ["Category", selectedMove.category],
                  ["Country / Region", selectedMove.country],
                  ["Strategic Program", selectedMove.program],
                  ["Source", selectedMove.source],
                ].map(([label, val]) => (
                  <div key={label} className="cd-frow">
                    <span className="cd-fline">
                      <span className="cd-fk">{label}</span>
                      <span className="cd-fv">{val}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* What Happened */}
            <div className="ctx-sec">
              <span className="eyebrow">What happened</span>
              <div className="cd-prose">{selectedMove.whatHappened || selectedMove.description}</div>
            </div>

            {/* Analysis · what it means for KSSL */}
            <div className="ctx-sec">
              <span className="eyebrow">Analysis · what it means for KSSL</span>
              <div className="cd-prose">{selectedMove.ksslAnalysis || selectedMove.analysis}</div>
            </div>

            {/* Deeper analysis · by view */}
            {((selectedMove.deeperAnalysis?.lenses) || (Array.isArray(selectedMove.deeperAnalysis) ? selectedMove.deeperAnalysis : null))?.length > 0 && (
              <div className="ctx-sec">
                <span className="eyebrow">Deeper analysis · by view</span>
                {((selectedMove.deeperAnalysis?.lenses) || selectedMove.deeperAnalysis).map((lens) => (
                  <div key={lens.view} style={{ marginTop: "14px" }}>
                    <div
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: "11px",
                        fontWeight: 700,
                        letterSpacing: ".08em",
                        textTransform: "uppercase",
                        color: "var(--l-txt-2)",
                        marginBottom: "4px",
                      }}
                    >
                      {lens.view}
                    </div>
                    <div className="cd-prose">{lens.text}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Source */}
            {(selectedMove.url || selectedMove.source) && (
              <div className="ctx-sec">
                <span className="eyebrow">Source</span>
                <div style={{ marginTop: "6px" }}>
                  {selectedMove.url ? (
                    <a
                      href={selectedMove.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: "var(--brand)",
                        fontFamily: "var(--mono)",
                        fontSize: "12px",
                        textDecoration: "underline",
                        wordBreak: "break-all",
                      }}
                    >
                      {selectedMove.source || "Source"} ↗
                    </a>
                  ) : (
                    <span style={{ color: "var(--l-txt-2)", fontSize: "12px" }}>
                      {selectedMove.source}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
