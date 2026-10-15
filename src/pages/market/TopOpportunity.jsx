import { useMemo } from "react";
import { useAppState, useHeaderReport } from "../../state/AppState";
import { useData } from "../../state/DataProvider";

export default function TopOpportunity() {
  const { jumpTo } = useAppState();
  const { data } = useData();

  const topOpp = data.topOpportunities || {};
  const topTenders = topOpp.topTenders || [];
  const projectsBeforeTender = topOpp.projectsBeforeTender || [];
  const nextMoves = topOpp.nextMoves || [];

  const handleOpenTender = (item) => {
    const title = item.title || item.tenderTitle;
    if (title) {
      jumpTo("market", "tender", { tenderTitle: title });
    }
  };

  // Header Report integration for Export / Copy
  const report = useMemo(() => {
    const sections = [];
    if (topTenders.length) {
      sections.push({
        heading: "Top Tenders",
        facts: topTenders.map((t, i) => [
          `#${i + 1} ${t.title}`,
          `${t.country || ""} · ${t.issuer || ""} · Revenue: ${t.revenue} · KSSL Fit: ${t.ksslFit} (${t.ksslModel})`,
        ]),
      });
    }
    if (projectsBeforeTender.length) {
      sections.push({
        heading: "Projects to Win Before They Tender",
        facts: projectsBeforeTender.map((p, i) => [
          `#${i + 1} ${p.title}`,
          `${p.country || ""} · Stage: ${p.stage} · Revenue: ${p.revenue} · KSSL Fit: ${p.ksslFit}`,
        ]),
      });
    }
    if (nextMoves.length) {
      sections.push({
        heading: "Next Moves",
        facts: nextMoves.map((m) => [
          m.days === 0 ? "Today" : `In ${m.days} days`,
          `${m.action} — ${m.tenderTitle}`,
        ]),
      });
    }
    return {
      title: "Top Opportunity Intelligence",
      subtitle: `${topTenders.length} top tenders · ${projectsBeforeTender.length} pre-tender projects · ${nextMoves.length} tactical actions`,
      sections,
      payload: { topTenders, projectsBeforeTender, nextMoves },
    };
  }, [topTenders, projectsBeforeTender, nextMoves]);

  useHeaderReport(report);

  const isEmpty =
    topTenders.length === 0 &&
    projectsBeforeTender.length === 0 &&
    nextMoves.length === 0;

  if (isEmpty) {
    return (
      <div className="ti-simple" aria-label="Tender intelligence">
        <div className="empty-note" style={{ padding: "48px 24px", textAlign: "center" }}>
          No top opportunities or tender pipelines are on record.
        </div>
      </div>
    );
  }

  return (
    <div className="ti-simple" aria-label="Tender intelligence">
      {/* 1. Top tenders */}
      {topTenders.length > 0 && (
        <div className="ovt">
          <div className="ovc-h">
            <span className="eyebrow">Top tenders</span>
            <span className="ovc-note">
              ranked by revenue KSSL can win × how well a KSSL model fits · revenue is an estimate
            </span>
          </div>
          <div className="ovt-scroll">
            <table>
              <thead>
                <tr>
                  <th className="num">Rank</th>
                  <th>Tender</th>
                  <th>Decides</th>
                  <th>KSSL fit</th>
                  <th>KSSL model</th>
                  <th>Rival to beat</th>
                  <th className="num">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {topTenders.map((t, idx) => (
                  <tr
                    key={t.id || idx}
                    className="ti-row-link"
                    tabIndex={0}
                    onClick={() => handleOpenTender(t)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleOpenTender(t);
                      }
                    }}
                  >
                    <td className="num">{idx + 1}</td>
                    <td className="ovt-t">
                      <span className="ti-title" title={t.title}>
                        {t.title}
                      </span>
                      <span className="ovt-buyer" title={t.issuer}>
                        {[t.country, t.issuer].filter(Boolean).join(" · ")}
                      </span>
                    </td>
                    <td className="num">
                      {t.status === "evaluation" ? "award pending" : t.decides || "—"}
                    </td>
                    <td>
                      <span className={`ti-fit ${t.ksslFit}`}>
                        {t.ksslFit === "strong"
                          ? "Good"
                          : t.ksslFit === "partial"
                            ? "Partial"
                            : "Not a fit"}
                      </span>
                    </td>
                    <td>{t.ksslModel || "—"}</td>
                    <td>{t.rivalToBeat || "—"}</td>
                    <td className="num">{t.revenue || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. Projects to win before they tender */}
      {projectsBeforeTender.length > 0 && (
        <div className="ovt">
          <div className="ovc-h">
            <span className="eyebrow">Projects to win before they tender</span>
            <span className="ovc-note">
              no defense procurement tender yet: armed forces spec drafting stage · revenue is an estimate
            </span>
          </div>
          <div className="ovt-scroll">
            <table>
              <thead>
                <tr>
                  <th className="num">Rank</th>
                  <th>Project</th>
                  <th>Where it stands</th>
                  <th>KSSL fit</th>
                  <th>KSSL model</th>
                  <th>Rival to beat</th>
                  <th className="num">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {projectsBeforeTender.map((p, idx) => (
                  <tr
                    key={p.id || idx}
                    className="ti-row-link"
                    tabIndex={0}
                    onClick={() => handleOpenTender(p)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleOpenTender(p);
                      }
                    }}
                  >
                    <td className="num">{idx + 1}</td>
                    <td className="ovt-t">
                      <span className="ti-title" title={p.title}>
                        {p.title}
                      </span>
                      <span className="ovt-buyer" title={p.issuer}>
                        {[p.country, p.issuer].filter(Boolean).join(" · ")}
                      </span>
                    </td>
                    <td className="ovt-t ti-stage">
                      <span className="ti-title" title={p.stage}>
                        {p.stage}
                      </span>
                    </td>
                    <td>
                      <span className={`ti-fit ${p.ksslFit}`}>
                        {p.ksslFit === "strong"
                          ? "Good"
                          : p.ksslFit === "partial"
                            ? "Partial"
                            : "Not a fit"}
                      </span>
                    </td>
                    <td>{p.ksslModel || "—"}</td>
                    <td>{p.rivalToBeat || "—"}</td>
                    <td className="num">{p.revenue || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. Next moves */}
      {nextMoves.length > 0 && (
        <div className="ovt">
          <div className="ovc-h">
            <span className="eyebrow">Next moves</span>
            <span className="ovc-note">what to do this week, soonest first</span>
          </div>
          <div className="ovt-scroll">
            <table>
              <thead>
                <tr>
                  <th className="num">Due</th>
                  <th>Action</th>
                  <th>Tender</th>
                </tr>
              </thead>
              <tbody>
                {nextMoves.map((m, idx) => (
                  <tr
                    key={idx}
                    className="ti-row-link"
                    tabIndex={0}
                    onClick={() => handleOpenTender({ title: m.tenderTitle })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleOpenTender({ title: m.tenderTitle });
                      }
                    }}
                  >
                    <td className="num">
                      {m.days === 0 ? "today" : `in ${m.days} day${m.days === 1 ? "" : "s"}`}
                    </td>
                    <td>{m.action}</td>
                    <td className="ovt-t">
                      <span className="ti-title" title={m.tenderTitle}>
                        {m.tenderTitle}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
