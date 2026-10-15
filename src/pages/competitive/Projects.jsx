import { useState, useMemo, useEffect } from "react";
import { useAppState, useHeaderReport } from "../../state/AppState";
import { useData } from "../../state/DataProvider";

// Search index generator
const buildSearchText = (p) =>
  [
    p.name,
    p.company,
    p.customer,
    p.location,
    p.kind,
    p.stage,
    p.stageNote,
    (p.overview || []).join(" "),
    (p.specs || []).map((s) => s.v).join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

// Date formatting and comparators
const parseDate = (d) => {
  if (!d) return "";
  const s = String(d);
  if (/^\d{4}$/.test(s)) return `${s}-01-01`;
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`;
  return s;
};

const uc = {
  recent: (a, b) => {
    const da = parseDate(a.latest?.date);
    const db = parseDate(b.latest?.date);
    return db.localeCompare(da) || (b.mw || 0) - (a.mw || 0);
  },
  stage: (a, b) => (b.stageRank || 0) - (a.stageRank || 0) || uc.recent(a, b),
  size: (a, b) => (b.mw || 0) - (a.mw || 0) || uc.recent(a, b),
};

export default function Projects() {
  const { setScope } = useAppState();
  const { data } = useData();

  const projectsConfig = data.projectsConfig || {};
  const competitorsData = projectsConfig.competitors || [];
  const allProjects = data.projects || [];
  const filtersConfig = projectsConfig.filters || [{ f: "all", l: "All" }];
  const seqOptions = projectsConfig.seqOptions || [["recent", "Most recent"]];
  const stageSteps = projectsConfig.stageSteps || [];

  const [selectedCid, setSelectedCid] = useState("__all");
  const [competitorSearch, setCompetitorSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [projectSearch, setProjectSearch] = useState("");
  const [seqMode, setSeqMode] = useState("recent");
  const [selectedProjectId, setSelectedProjectId] = useState(null);

  // Filtered & sorted projects calculation (matching xr logic in Cummins Arabia)
  const { displayedProjects, filterCounts, competitorCounts, totalScopedCount } = useMemo(() => {
    // 1. Match search query across text
    const queryWords = String(projectSearch || "").toLowerCase().split(/\s+/).filter(Boolean);
    const textMatched = allProjects.filter((p) =>
      queryWords.every((word) => buildSearchText(p).includes(word))
    );

    // 2. Filter by competitor if selected
    const scoped = selectedCid === "__all" ? textMatched : textMatched.filter((p) => p.cid === selectedCid);

    // 3. Category/region counts for filter buttons
    const counts = { all: scoped.length };
    filtersConfig.slice(1).forEach((f) => {
      counts[f.f || f.id] = scoped.filter((p) => p.region === (f.f || f.id)).length;
    });

    // 4. Filter by region tab
    const regionFiltered = activeFilter === "all" ? scoped : scoped.filter((p) => p.region === activeFilter);

    // 5. Per-competitor counts under current search & tab
    const perComp = {};
    const forCompCounts = activeFilter === "all" ? textMatched : textMatched.filter((p) => p.region === activeFilter);
    forCompCounts.forEach((p) => {
      perComp[p.cid] = (perComp[p.cid] || 0) + 1;
    });

    // 6. Sort by sequence mode
    const sorter = uc[seqMode] || uc.recent;
    const sorted = regionFiltered.slice().sort(sorter);

    return {
      displayedProjects: sorted,
      filterCounts: counts,
      competitorCounts: perComp,
      totalScopedCount: scoped.length,
    };
  }, [allProjects, selectedCid, activeFilter, projectSearch, seqMode, filtersConfig]);

  // Selected competitor metadata
  const selectedCompetitor = useMemo(() => {
    if (selectedCid === "__all") return null;
    return competitorsData.find((c) => c.cid === selectedCid) || null;
  }, [selectedCid, competitorsData]);

  const activeTitle = selectedCompetitor ? selectedCompetitor.name : "All competitors";

  // Filtered and sorted competitor list for left sidebar
  const visibleCompetitors = useMemo(() => {
    const q = competitorSearch.toLowerCase().trim();
    const list = competitorsData.filter((c) =>
      !q || c.name.toLowerCase().includes(q) || (c.short && c.short.toLowerCase().includes(q))
    );
    // Sort competitors by project count descending, matching Cummins
    return list.slice().sort((a, b) => (competitorCounts[b.cid] || 0) - (competitorCounts[a.cid] || 0));
  }, [competitorsData, competitorSearch, competitorCounts]);

  // Total projects count for "All competitors" sidebar button
  const allProjectsCount = useMemo(() => {
    return Object.values(competitorCounts).reduce((acc, count) => acc + count, 0);
  }, [competitorCounts]);

  // Selected project object for detail panel
  const selectedProject = useMemo(() => {
    if (!selectedProjectId) return null;
    return allProjects.find((p) => p.id === selectedProjectId) || null;
  }, [selectedProjectId, allProjects]);

  // Sync with global header report
  useHeaderReport({
    title: selectedProject
      ? selectedProject.name
      : `${activeTitle}: projects`,
    subtitle: selectedProject
      ? `${selectedProject.company} · ${selectedProject.stage}`
      : `${displayedProjects.length} projects on record`,
    sections: [
      {
        heading: selectedProject ? "Strategic Program" : "Projects on record",
        facts: (selectedProject ? [selectedProject] : displayedProjects).map((p) => [
          `${p.company}: ${p.name}`,
          `${p.stage} · ${p.stageNote}`,
        ]),
      },
    ],
    payload: {
      projects: selectedProject ? [selectedProject] : displayedProjects,
    },
  });

  // Sync shell scope
  useEffect(() => {
    setScope(
      "competitive",
      {
        projects: displayedProjects.length,
        competitor: selectedCompetitor ? selectedCompetitor.cid : null,
      },
      {
        pillar: "Competitive",
        view: "Projects",
        selection: selectedProject ? selectedProject.name : activeTitle,
      }
    );
  }, [displayedProjects.length, selectedCompetitor, selectedProject, activeTitle, setScope]);

  return (
    <div className="pos-view v-projects pj-page" style={{ gridTemplateColumns: "260px 1fr" }}>
      {/* 1. LEFT SIDEBAR: COMPETITORS ROSTER */}
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
              value={competitorSearch}
              onChange={(e) => setCompetitorSearch(e.target.value)}
            />
          </div>
        </div>

        <div id="patc-list">
          {/* All competitors */}
          <div
            className={`pat-li${selectedCid === "__all" ? " active" : ""}`}
            onClick={() => {
              setSelectedCid("__all");
              setSelectedProjectId(null);
            }}
            role="button"
            tabIndex={0}
          >
            <span
              className="pli-n"
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}
            >
              <span>All competitors</span>
              <span className="pli-ct">{allProjectsCount}</span>
            </span>
          </div>

          {/* Competitor items with dot, name and count */}
          {visibleCompetitors.map((c) => (
            <div
              key={c.cid}
              className={`pat-li${selectedCid === c.cid ? " active" : ""}`}
              onClick={() => {
                setSelectedCid(c.cid);
                setSelectedProjectId(null);
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
                <span className="pli-ct">{competitorCounts[c.cid] || 0}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 2. RIGHT CONTENT: ov-wrap (EXACT CUMMINS ARRANGEMENT) */}
      <div className="ov-wrap">
        {/* Fixed Header */}
        <div className="feed-grp-h ov-fixed-header">
          <span className="eyebrow">{activeTitle}</span>

          <div className="filters">
            {/* Search Box */}
            <div className="feed-search-box">
              <span className="feed-search-icon">⌕</span>
              <input
                type="text"
                placeholder="Search"
                value={projectSearch}
                onChange={(e) => setProjectSearch(e.target.value)}
              />
              {projectSearch ? (
                <button
                  type="button"
                  className="feed-search-clear"
                  onClick={() => setProjectSearch("")}
                >
                  ×
                </button>
              ) : null}
            </div>

            {/* Filter Buttons: All 58 | Gulf region 27 | Worldwide 31 */}
            <span className="dir-filters">
              {filtersConfig.map((f) => {
                const key = f.f || f.id;
                const label = f.l || f.label;
                const count = filterCounts[key];
                const isEmpty = count === 0 && key !== "all";
                return (
                  <button
                    key={key}
                    type="button"
                    className={`fbtn${activeFilter === key ? " on" : ""}${isEmpty ? " empty" : ""}`}
                    data-dirf={key}
                    disabled={isEmpty}
                    onClick={() => setActiveFilter(key)}
                    title={isEmpty ? `Nothing carries ${label}` : undefined}
                  >
                    {label}
                    {count !== undefined && <span className="fcount"> {count}</span>}
                  </button>
                );
              })}
            </span>

            {/* Sequence Selector */}
            <span className="seq-ctl">
              <span className="seq-sep" />
              <span className="seq-label">Sequence</span>
              <select
                className="seq-select"
                value={seqMode}
                onChange={(e) => setSeqMode(e.target.value)}
              >
                {seqOptions.map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
            </span>
          </div>
        </div>

        {/* Body: ov-body (feed on left, context drawer on right) */}
        <div className={`ov-body${selectedProject ? " has-sel" : ""}`}>
          {/* Feed List */}
          <div className="feed v-overview" id="feed">
            <div className="feed-grp">
              {displayedProjects.map((p, idx) => {
                const isSelected = selectedProjectId === p.id;
                const stance = p.assessment?.stance || "watch";

                return (
                  <div
                    key={p.id}
                    className={`alert${isSelected ? " sel" : ""}`}
                    data-dir={stance}
                    onClick={() => setSelectedProjectId(p.id)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="gut">
                      <span className={`sig ${stance}`} />
                      <span className="rank">{String(idx + 1).padStart(2, "0")}</span>
                    </div>

                    <div className="body">
                      <div className="ttl">{p.name}</div>
                      <div className="sowhat">{p.stageNote}</div>
                      <div className="koel-prod-highlight-row">
                        <span className="kph-label">{p.stage}:</span>
                        <span className="kph-val">
                          {[
                            selectedCid === "__all" ? p.company : null,
                            p.customer,
                            p.location,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </div>
                    </div>

                    <div className="aside">
                      {stance && stance !== "fav" ? (
                        <span className={`dirtag ${stance}`}>
                          {stance === "threat" ? "Threat" : "Watch"}
                        </span>
                      ) : null}
                      <span className="ago">{p.latest ? p.latest.date : "Undated"}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {displayedProjects.length === 0 ? (
              <div className="empty-note">
                No project matches {projectSearch ? `“${projectSearch}”` : "this filter"}
                {selectedCompetitor ? ` for ${selectedCompetitor.name}` : ""}.
              </div>
            ) : (
              <div className="pager">
                <div className="pager-range">
                  showing 1–{displayedProjects.length} of {displayedProjects.length}
                  {displayedProjects.length !== totalScopedCount
                    ? ` filtered · ${totalScopedCount} total`
                    : " projects"}
                </div>
              </div>
            )}
          </div>

          {/* Context Drawer Panel (HC Component) */}
          {selectedProject && (
            <div className="ctx v-overview revealed">
              <div className="ctx-scroll">
                {/* Header */}
                <div className={`ctx-h dir-${selectedProject.assessment?.stance || "watch"}`}>
                  <div className="ctx-h-actions">
                    <button
                      type="button"
                      className="col-close"
                      onClick={() => setSelectedProjectId(null)}
                      title="Close"
                      aria-label="Close"
                    >
                      ✕
                    </button>
                    {selectedProject.assessment?.stance && selectedProject.assessment.stance !== "fav" ? (
                      <span className={`dirpill dir-${selectedProject.assessment.stance}`}>
                        {selectedProject.assessment.stance === "threat" ? "Threat" : "Watch"}
                      </span>
                    ) : null}
                  </div>
                  <div className="ct">{selectedProject.name}</div>
                </div>

                {/* At a glance facts */}
                <div className="ctx-sec">
                  <span className="eyebrow">At a glance</span>
                  <div className="cd-facts">
                    {[
                      ["Competitor", selectedProject.company],
                      ["Kind", selectedProject.kind],
                      ["Customer", selectedProject.customer],
                      ["Location", selectedProject.location],
                      ["Region", selectedProject.region === "Gulf" ? "Gulf region" : "Worldwide"],
                      ["Stage", selectedProject.stage],
                      [
                        "Latest milestone",
                        selectedProject.latest
                          ? `${selectedProject.latest.date}: ${selectedProject.latest.label}`
                          : "Undated in the record",
                      ],
                    ].map(([k, v]) => (
                      <div key={k} className="cd-frow">
                        <span className="cd-fline">
                          <span className="cd-fk">{k}</span>
                          <span className="cd-fv">{v}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* What the project is */}
                <div className="ctx-sec">
                  <span className="eyebrow">What the project is</span>
                  {(selectedProject.overview || []).map((para, i) => (
                    <div key={i} className="cd-prose" style={i ? { marginTop: "8px" } : undefined}>
                      {para}
                    </div>
                  ))}
                </div>

                {/* Current stage with pj-steps stepper */}
                <div className="ctx-sec">
                  <span className="eyebrow">Current stage</span>
                  <ol className="pj-steps">
                    {stageSteps.map((stg, i) => {
                      const isDone = i + 1 < selectedProject.stageRank;
                      const isNow = i + 1 === selectedProject.stageRank;
                      return (
                        <li key={stg} className={isDone ? "done" : isNow ? "now" : ""}>
                          <span>{stg}</span>
                        </li>
                      );
                    })}
                  </ol>
                  <div className="cd-prose" style={{ marginTop: "10px" }}>
                    {selectedProject.stageNote}
                  </div>
                </div>

                {/* Specs */}
                {selectedProject.specs && selectedProject.specs.length > 0 && (
                  <div className="ctx-sec">
                    <span className="eyebrow">Specs</span>
                    <div className="cd-facts">
                      {selectedProject.specs.map((s) => (
                        <div key={s.k} className="cd-frow">
                          <span className="cd-fline">
                            <span className="cd-fk">{s.k}</span>
                            <span className="cd-fv">{s.v}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Timeline */}
                {selectedProject.timeline && selectedProject.timeline.length > 0 && (
                  <div className="ctx-sec">
                    <span className="eyebrow">Timeline</span>
                    <ol className="pj-time">
                      {selectedProject.timeline.map((item, i) => (
                        <li key={i} className={item.expected ? "next" : ""}>
                          <span className="pj-d">{item.date}</span>
                          <span className="pj-e">
                            {item.label}
                            {item.expected ? " (expected)" : ""}
                          </span>
                        </li>
                      ))}
                    </ol>
                    <div className="pj-note">Researched to October 2026.</div>
                  </div>
                )}

                {/* Strategic assessment */}
                <div className="ctx-sec">
                  <span className="eyebrow">Strategic assessment</span>
                  {selectedProject.assessment?.read?.length ? (
                    selectedProject.assessment.read.map((r, i) => (
                      <div key={i} className="cd-prose" style={i ? { marginTop: "8px" } : undefined}>
                        {r}
                      </div>
                    ))
                  ) : (
                    <div className="cd-prose">No assessment on record.</div>
                  )}
                  <div className="pj-note">The analyst's read for KSSL, from the dataset's record of this item.</div>
                </div>

                {/* Source */}
                {selectedProject.sources && selectedProject.sources.length > 0 && (
                  <div className="ctx-sec">
                    <span className="eyebrow">Source</span>
                    <div className="cd-prose">
                      {selectedProject.sources.map((src, i) => (
                        <span key={i}>
                          {i > 0 && " · "}
                          {src.url ? (
                            <a
                              href={src.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: "var(--brand)" }}
                            >
                              {src.label}
                            </a>
                          ) : (
                            src.label
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
