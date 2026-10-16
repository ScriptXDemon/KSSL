import { clientShort } from "../../lib/client.js";
import { usd, segmentLabel, WINDOW_DAYS } from "../../lib/marketOutlook";
import { formatTotals } from "../../lib/tenderValue";
import { formatDate } from "../../utils/formatDate";
import "../../styles/market-overview.css";
import "../../styles/tender-intel.css";

/* Market outlook: five tables, each headed with the records it was counted from (lib/marketOutlook), so a reader
   can see what a number rests on. The page passes the computed outlook (open tenders from its own bucketTenders split). */

const fmtDate = (d) => (d ? formatDate(d.toISOString().slice(0, 10)) : "—");
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

function Block({ title, note, source, empty, rows, head, children, className = "" }) {
  return (
    <section className={`ovt ${className}`.trim()}>
      <div className="ovc-h">
        <span className="eyebrow">{title}</span>
        <span className="ovc-note">{note}</span>
      </div>
      {rows.length ? (
        <div className="ovt-scroll">
          <table>
            <thead>
              <tr>{head.map(([h, num]) => <th className={num ? "num" : undefined} key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>{children}</tbody>
          </table>
        </div>
      ) : (
        <div className="ovc-empty">{empty}</div>
      )}
      <div className="ovc-note" style={{ marginTop: 8 }}>Data: {source}</div>
    </section>
  );
}

export default function MarketOutlook({ data, o }) {
  const client = clientShort();
  const win = o.winners;
  const seg = o.segments;
  const dated = seg.reduce((n, r) => n + r.recent + r.before, 0);
  const sz = o.sizes;
  const bu = o.buyers;
  const dr = o.drivers;

  return (
    <div className="ti-simple">
      <Block
        empty="no segment has dated records in the last 12 months"
        head={[["Segment"], ["Activity, last 6 months", true], ["Open tenders that fit", true], ["Who wins here"], ["What to do"], ["Latest signal"]]}
        note="activity counts new tenders, market news and contract awards, over the last 6 months against the 6 months before"
        rows={seg}
        source={`${plural(dated, "dated record")} in the two ${Math.round(WINDOW_DAYS / 30.5)}-month windows (tenders by published or closing date, market signals by publish date, awards with a date; year-only awards are not counted as activity). A trend is called only with 3 or more records in the earlier window. Open tenders that fit are open for bids with a strong or partial ${client} fit; "closed, award pending" counts tenders past their closing date with no award yet; latest signal is the newest market news in the segment. Revenue is the pack's estimate.`}
        title="Where demand is heading"
        className="ovt-demand"
      >
        {seg.map((r) => {
          const [verb, ...restAct] = String(r.act || "").split(":");
          const detail = restAct.join(":").trim();
          return (
            <tr key={r.segment}>
              <td className="ovt-t">{segmentLabel(r.segment)}</td>
              <td className="od-act">
                <span className="od-big">{r.recent}</span>
                {r.called && r.change != null ? (
                  <span className={`od-trend ${r.trend === "rising" ? "up" : r.trend === "falling" ? "down" : ""}`}>
                    {r.change > 0 ? "▲" : r.change < 0 ? "▼" : "•"} {r.change ? `${Math.abs(r.change)}%` : "level"}
                  </span>
                ) : (
                  <span className="od-trend">no trend</span>
                )}
                <span className="od-sub">{r.before} in the prior 6 months</span>
              </td>
              <td>
                {r.open ? (
                  <>
                    <span className="od-main">{plural(r.open, "tender")}</span>
                    <span className="od-sub">{usd(r.value)} est. revenue</span>
                  </>
                ) : (
                  <span className="od-none">None open</span>
                )}
                {r.pending.n ? (
                  <span className="od-sub od-pend" title={r.pending.titles.join("\n")}>
                    + {r.pending.n} closed, awaiting award{r.pending.value ? ` (${usd(r.pending.value)})` : ""}
                  </span>
                ) : null}
              </td>
              <td>
                {r.winner ? (
                  <>
                    <span className="od-main">{r.winner}</span>
                    <span className="od-sub">{r.winnerWins} of {r.named} award{r.named === 1 ? "" : "s"}</span>
                  </>
                ) : (
                  <span className="od-none">{r.named ? `${r.named} named award${r.named === 1 ? "" : "s"}, no value published` : "No past award on record"}</span>
                )}
              </td>
              <td>
                <span className="od-main">{detail ? verb : r.act}</span>
                {detail ? <span className="od-sub">{detail}</span> : null}
              </td>
              <td>
                {r.latest ? (
                  <>
                    <span className="od-main od-clip" title={r.latest.title}>{r.latest.title}</span>
                    <span className="od-sub">{[r.latest.kind, r.latest.country, r.latest.date ? fmtDate(r.latest.date) : null].filter(Boolean).join(" · ")}</span>
                  </>
                ) : (
                  <span className="od-none">No signal on record</span>
                )}
              </td>
            </tr>
          );
        })}
      </Block>

      <Block
        empty="no past award with a named winner"
        head={[["Winner"], ["Brand"], ["Wins", true], ["Value", true], ["Buyers", true]]}
        note={`who wins the contracts · ${win.named} awards with a named winner, valued ${formatTotals(win.totals)}`}
        rows={win.rows}
        source={`${win.records} award records, ${win.named} name a winner, ${win.priced} carry a value. ${win.serviceAwards} of the priced awards are operation or maintenance contracts, so a winner's value can reflect servicing as well as supply. Values are in each award's own currency, not converted. Top 10 of ${win.rows.length} winners shown.`}
        title="Who wins"
      >
        {win.rows.slice(0, 10).map((r) => (
          <tr key={r.winner}>
            <td className="ovt-t">{r.winner}</td>
            <td>{r.brand || "—"}</td>
            <td className="num">{r.wins}</td>
            <td className="num">{formatTotals(r.totals)}</td>
            <td className="num">{r.buyers.length}</td>
          </tr>
        ))}
      </Block>

      <Block
        empty="no ranked tender names a size"
        head={[["Set size"], ["Tenders", true], ["Value", true], [client ? `${client} covers it` : "Covered"]]}
        note={`the kVA and frequency buyers need, against the ${client ? `${client} ` : ""}catalogue · a gap is a size with tenders and no model`}
        rows={sz.rows}
        source={`${sz.named} of ${sz.ranked} ranked tenders name a size: the size is that of the best-fit rival model on the tender, because buyers rarely publish a rating. ${sz.ranked - sz.named} tenders have no rated model and are not counted. Covered means a ${client} model of the same frequency in the same rating band. Value is the pack's revenue estimate.`}
        title="Sizes buyers need"
      >
        {sz.rows.map((r) => (
          <tr key={r.key}>
            <td className="ovt-t">{r.key}</td>
            <td className="num">{r.tenders}</td>
            <td className="num">{usd(r.value)}</td>
            <td>{r.covered ? r.models.join(", ") : <span className="ti-fit weak">Gap</span>}</td>
          </tr>
        ))}
      </Block>

      <Block
        empty="no buyer has two or more tenders or awards"
        head={[["Buyer"], ["Tenders and awards", true], ["Value", true], ["Usual gap", true], ["Last", true], ["Next expected", true]]}
        note="buyers with two or more tenders or awards · the next date is the buyer's usual gap after its last dated record"
        rows={bu}
        source={`${bu.length} buyers, from tender issuers and award buyers. The usual gap is the median spacing of the buyer's dated records, and only gaps of 30 days or more count (tenders published together are one event). Awards with only a year are counted but not dated, so a buyer with few dated records shows no gap. A next date already past is marked overdue, not moved. Top 10 shown.`}
        title="Repeat buyers"
      >
        {bu.slice(0, 10).map((r) => (
          <tr key={r.buyer}>
            <td className="ovt-t">
              {r.buyer}
              <span className="ovt-buyer">{r.segments.map(segmentLabel).join(" · ")}</span>
            </td>
            <td className="num">{r.count}<span className="ovt-buyer">{r.tenders} tender{r.tenders === 1 ? "" : "s"} · {r.awards} award{r.awards === 1 ? "" : "s"}</span></td>
            <td className="num">{usd(r.value)}</td>
            <td className="num">{r.cadenceDays ? plural(r.cadenceDays, "day") : "—"}</td>
            <td className="num">{fmtDate(r.last)}</td>
            <td className="num">{r.next ? (r.overdue ? `overdue (${fmtDate(r.next)})` : fmtDate(r.next)) : "—"}</td>
          </tr>
        ))}
      </Block>

      <Block
        empty="no market signal names a country and a segment"
        head={[["Country · segment"], ["Signals", true], ["Tenders", true], ["Value", true], ["Latest signal"]]}
        note="the news and pipeline signals behind each segment, beside the tenders already ranked there"
        rows={dr}
        source={`market signals that name a real country and a segment (${dr.reduce((n, r) => n + r.signals.length, 0)} signals in ${dr.length} country and segment pairs; worldwide signals name no country and are on Global Requirements). Tenders and value are the ranked tenders in the same country and segment. Top 10 shown.`}
        title="What is driving it"
      >
        {dr.slice(0, 10).map((r) => (
          <tr key={`${r.country}${r.segment}`}>
            <td className="ovt-t">{r.country} · {segmentLabel(r.segment)}</td>
            <td className="num">{r.signals.length}</td>
            <td className="num">{r.tenders}</td>
            <td className="num">{usd(r.value)}</td>
            <td>
              <span className="ti-title" title={r.signals[0].title}>{r.signals[0].title}</span>
              {r.signals[0].date ? <span className="ovt-buyer">{r.signals[0].kind} · {fmtDate(r.signals[0].date)}</span> : null}
            </td>
          </tr>
        ))}
      </Block>
    </div>
  );
}
