import { clientShort } from "../../lib/client.js";
import { useData } from "../../state/DataProvider";
import { useAppState } from "../../state/AppState";
import { cockpit } from "../../lib/tenderIntel.js";
import "../../styles/market-overview.css";
import "../../styles/tender-intel.css";
import { Review } from "../review/Review";
import { uiText } from "../../lib/uiText";

/* Tender Intelligence, at a glance: the stored tables of data.topOpportunities in the platform's own table style
   (the Market Intelligence .ovt table). Rows, their order, the fit word, the model, the rival and the revenue are
   printed exactly as stored; nothing is ranked, weighted or estimated here. A row with no value shows a dash.
   Every row opens its detail beside the table. */

const show = (v) => (v == null || String(v).trim() === "" ? "—" : v);
const cls = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");

export default function TenderCockpit({ onOpen }) {
  const { data } = useData();
  const { jumpTo } = useAppState();
  const { tenders: top, projects, moves, notes } = cockpit(data);
  /* the section titles are the stored words of ui.market_top_opportunity_view; the empty text is the stored
     ui.market_view row of the top-opportunity page */
  const sect = {
    top: uiText(data, "ui.market_top_opportunity_view", { view_code: "top-opportunity" }, "top_tenders_section_label"),
    projects: uiText(data, "ui.market_top_opportunity_view", { view_code: "top-opportunity" }, "projects_section_label"),
    moves: uiText(data, "ui.market_top_opportunity_view", { view_code: "top-opportunity" }, "next_moves_section_label"),
  };
  if (!top.length && !projects.length && !moves.length) {
    const empty = uiText(data, "ui.market_view", { view_id: "top-opportunity" }, "empty_state_text");
    return empty ? <div className="ovc-empty">{empty}</div> : null;
  }

  const client = clientShort();
  const tenderOf = (id) => (data.tenders || []).find((t) => String(t.id) === String(id)) || null;
  // a row opens its tender (or project) beside the table; the Tender Pipeline jump is the fallback
  const openTender = (row) => {
    const t = tenderOf(row.tenderId);
    if (!t) return;
    if (onOpen) onOpen(t);
    else jumpTo("market", "tender", { tenderTitle: t.title });
  };
  const openProject = (row) => { if (onOpen) onOpen(null, row); };
  const openMove = (m) => {
    if (tenderOf(m.tenderId)) openTender(m);
    else if (m.opportunityId != null) {
      const p = projects.find((x) => String(x.opportunityId) === String(m.opportunityId));
      if (p) openProject(p);
    }
  };
  const rowKey = (e, fn) => { if (e.key === "Enter") fn(); };
  const fitCell = (row) => (row.ksslFit ? <span className={`ti-fit ${cls(row.ksslFit)}`}>{row.ksslFit}</span> : "—");
  const where = (row) => [row.country, row.issuer].filter(Boolean).join(" · ");
  const clientFit = client ? `${client} fit` : "Fit";
  const clientModel = client ? `${client} model` : "Model";

  return (
    <section className="ti-simple" aria-label="Tender intelligence">
      {top.length ? (
        <div className="ovt">
          <div className="ovc-h">
            <span className="eyebrow">{sect.top}</span>
            {notes.topTenders ? <span className="ovc-note">{notes.topTenders}</span> : null}
          </div>
          <div className="ovt-scroll">
            <table>
              <thead>
                <tr>
                  <th className="num">Rank</th>
                  <th>Tender</th>
                  <th>Decides</th>
                  <th>{clientFit}</th>
                  <th>{clientModel}</th>
                  <th>Rival to beat</th>
                  <th className="num">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {top.map((r) => (
                  <tr key={r.id} className="ti-row-link" tabIndex={0} onClick={() => openTender(r)} onKeyDown={(e) => rowKey(e, () => openTender(r))}>
                    <td className="num">{show(r.rank)}</td>
                    <td className="ovt-t">
                      <span className="ti-title" title={r.title}>{show(r.title)}</span>
                      <span className="ovt-buyer" title={r.issuer}>{where(r)}</span>
                      <Review src={r._src} />
                    </td>
                    <td>{show(r.decides)}</td>
                    <td>{fitCell(r)}</td>
                    <td>{show(r.ksslModel)}</td>
                    <td>{show(r.rivalToBeat)}</td>
                    <td className="num">{show(r.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {projects.length ? (
        <div className="ovt">
          <div className="ovc-h">
            <span className="eyebrow">{sect.projects}</span>
            {notes.projects ? <span className="ovc-note">{notes.projects}</span> : null}
          </div>
          <div className="ovt-scroll">
            <table>
              <thead>
                <tr>
                  <th className="num">Rank</th>
                  <th>Project</th>
                  <th>Where it stands</th>
                  <th>{clientFit}</th>
                  <th>{clientModel}</th>
                  <th>Rival to beat</th>
                  <th className="num">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((r) => (
                  <tr key={r.id} className="ti-row-link" tabIndex={0} onClick={() => openProject(r)} onKeyDown={(e) => rowKey(e, () => openProject(r))}>
                    <td className="num">{show(r.rank)}</td>
                    <td className="ovt-t">
                      <span className="ti-title" title={r.title}>{show(r.title)}</span>
                      <span className="ovt-buyer" title={r.issuer}>{where(r)}</span>
                      <Review src={r._src} />
                    </td>
                    <td className="ovt-t ti-stage">
                      <span className="ti-title" title={r.stage}>{show(r.stage)}</span>
                    </td>
                    <td>{fitCell(r)}</td>
                    <td>{show(r.ksslModel)}</td>
                    <td>{show(r.rivalToBeat)}</td>
                    <td className="num">{show(r.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {moves.length ? (
        <div className="ovt">
          <div className="ovc-h">
            <span className="eyebrow">{sect.moves}</span>
            {notes.nextMoves ? <span className="ovc-note">{notes.nextMoves}</span> : null}
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
                {moves.map((m) => (
                  <tr key={m.id} className="ti-row-link" tabIndex={0} onClick={() => openMove(m)} onKeyDown={(e) => rowKey(e, () => openMove(m))}>
                    <td className="num">{show(m.due)}</td>
                    <td>{show(m.action)}</td>
                    <td className="ovt-t"><span className="ti-title" title={m.tenderTitle}>{show(m.tenderTitle)}</span><Review src={m._src} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
