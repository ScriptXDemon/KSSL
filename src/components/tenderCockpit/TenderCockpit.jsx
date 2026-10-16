import { useMemo } from "react";
import { clientShort } from "../../lib/client.js";
import { useData } from "../../state/DataProvider";
import { useAppState } from "../../state/AppState";
import { tenderIntel, isTender, isProject, usdM, FIT_LABEL } from "../../lib/tenderIntel.js";
import "../../styles/market-overview.css";
import "../../styles/tender-intel.css";

/* Tender Intelligence, at a glance: two plain tables in the platform's own table style
   (the Market Intelligence .ovt table). The five headline numbers live in the metric
   strip above (lib/overview metricsFor). What to chase, and what to do next -- nothing
   else. Every row opens the tender's detail beside the table. */

const FIT = FIT_LABEL;
const dateOf = (d) => d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export default function TenderCockpit({ onOpen }) {
  const { data } = useData();
  const { jumpTo } = useAppState();
  const today = useMemo(() => new Date(), []);
  const I = useMemo(() => tenderIntel(data, today), [data, today]);
  if (!I.points.length) return null;

  const client = clientShort();
  // a row opens the tender in the page it is on (onOpen); the Tender Pipeline jump is the fallback
  const open = (t) => (onOpen ? onOpen(t) : jumpTo("market", "tender", { tenderTitle: t.title }));
  // t.rank orders by revenue x fit weight (strong 1, partial 0.5; pursuits x0.8), see db/tender_fit.py; each table is then numbered from 1
  const ranked = I.points.filter((p) => p.fit !== "weak").sort((a, b) => a.t.rank - b.t.rank);
  const top = ranked.filter((p) => isTender(p.t, today)).slice(0, 10);
  const projects = ranked.filter((p) => isProject(p.t, today)).slice(0, 8);
  const stage = (t) => reqOf(t, "Latest milestone") || reqOf(t, "Status") || "—";
  const reqOf = (t, k) => ((t.req || []).find((r) => r[0] === k) || [])[1];
  const moves = I.actions.filter((a) => a.days >= 0).slice(0, 6);
  const rowKey = (e, t) => { if (e.key === "Enter") open(t); };

  return (
    <section className="ti-simple" aria-label="Tender intelligence">
      <div className="ovt">
        <div className="ovc-h">
          <span className="eyebrow">Top tenders</span>
          <span className="ovc-note">{client ? `ranked by revenue ${client} can win × how well a ${client} model fits` : "ranked by revenue that can be won × how well a model fits"} · revenue is an estimate</span>
        </div>
        <div className="ovt-scroll">
          <table>
            <thead>
              <tr>
                <th className="num">Rank</th>
                <th>Tender</th>
                <th>Decides</th>
                <th>{client ? `${client} fit` : "Fit"}</th>
                <th>{client ? `${client} model` : "Model"}</th>
                <th>Rival to beat</th>
                <th className="num">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {top.map(({ t, date, est, v }, i) => {
                const rival = (t.competitorFit || [])[0];
                return (
                  <tr key={t.id} className="ti-row-link" tabIndex={0} onClick={() => open(t)} onKeyDown={(e) => rowKey(e, t)}>
                    <td className="num">{i + 1}</td>
                    <td className="ovt-t">
                      <span className="ti-title" title={t.title}>{t.title}</span>
                      <span className="ovt-buyer" title={t.issuer}>{[t.country, t.issuer].filter(Boolean).join(" · ")}</span>
                    </td>
                    <td className="num">{t.status === "evaluation" ? "award pending" : est ? "—" : dateOf(date)}</td>
                    <td><span className={`ti-fit ${t.clientFit}`}>{FIT[t.clientFit]}</span></td>
                    <td>{((t.matches || [])[0] || {}).n || "—"}</td>
                    <td>{rival ? `${rival.company}${(rival.products || [])[0] ? ` · ${rival.products[0]}` : ""}` : "—"}</td>
                    <td className="num">{usdM(v)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {projects.length ? (
        <div className="ovt">
          <div className="ovc-h">
            <span className="eyebrow">Projects to win before they tender</span>
            <span className="ovc-note">no genset tender yet: the main contractor buys the gensets once appointed · revenue is an estimate</span>
          </div>
          <div className="ovt-scroll">
            <table>
              <thead>
                <tr>
                  <th className="num">Rank</th>
                  <th>Project</th>
                  <th>Where it stands</th>
                  <th>{client ? `${client} fit` : "Fit"}</th>
                  <th>{client ? `${client} model` : "Model"}</th>
                  <th>Rival to beat</th>
                  <th className="num">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {projects.map(({ t, v }, i) => {
                  const rival = (t.competitorFit || [])[0];
                  return (
                    <tr key={t.id} className="ti-row-link" tabIndex={0} onClick={() => open(t)} onKeyDown={(e) => rowKey(e, t)}>
                      <td className="num">{i + 1}</td>
                      <td className="ovt-t">
                        <span className="ti-title" title={t.title}>{t.title}</span>
                        <span className="ovt-buyer" title={t.issuer}>{[t.country, t.issuer].filter(Boolean).join(" · ")}</span>
                      </td>
                      <td className="ovt-t ti-stage">
                        <span className="ti-title" title={stage(t)}>{stage(t)}</span>
                      </td>
                      <td><span className={`ti-fit ${t.clientFit}`}>{FIT[t.clientFit]}</span></td>
                      <td>{((t.matches || [])[0] || {}).n || "—"}</td>
                      <td>{rival ? `${rival.company}${(rival.products || [])[0] ? ` · ${rival.products[0]}` : ""}` : "—"}</td>
                      <td className="num">{usdM(v)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {moves.length ? (
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
                {moves.map((a, i) => (
                  <tr key={i} className="ti-row-link" tabIndex={0} onClick={() => open(a.tender)} onKeyDown={(e) => rowKey(e, a.tender)}>
                    <td className="num">{a.days === 0 ? "today" : `in ${a.days} day${a.days === 1 ? "" : "s"}`}</td>
                    <td>{a.do}</td>
                    <td className="ovt-t"><span className="ti-title" title={a.tender.title}>{a.tender.title}</span></td>
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
