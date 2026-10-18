import { compareRisk } from "../../lib/overview";
import "../../styles/risk-matrix.css";

/* THE THREAT RISK MATRIX (competitive spec): the threats shown on the overview, on a 5 x 5 probability-impact grid from
   their stored scores (competitive_signal.probability / impact). Each dot carries the threat's rank -- the same order as
   the feed (compareRisk: probability x impact, then sooner effect, then in a client market) -- and opens its card. A
   threat with no stored probability or impact is not plotted. The cell shading is the probability x impact band. */
const LEVELS = [1, 2, 3, 4, 5];
const band = (p, i) => (p * i >= 16 ? "high" : p * i >= 9 ? "mid" : "low");

export default function RiskMatrix({ cards, onSelect }) {
  const threats = (cards || []).filter((c) => c && c.dir === "threat").sort(compareRisk);
  const ranked = threats.map((c, n) => ({ c, n: n + 1 }));
  const plotted = ranked.filter(({ c }) => LEVELS.includes(Number(c.probability)) && LEVELS.includes(Number(c.impact)));
  if (!plotted.length) return null;
  const at = (p, i) => plotted.filter(({ c }) => Number(c.probability) === p && Number(c.impact) === i);

  return (
    <section className="rm" aria-label="Threat risk matrix">
      <div className="rm-h">
        <span className="eyebrow">Threat risk matrix</span>
        <span className="rm-note">
          {plotted.length} threat{plotted.length === 1 ? "" : "s"} by probability and impact · numbered as in the list below
          {ranked.length > plotted.length ? ` · ${ranked.length - plotted.length} without stored scores not plotted` : ""}
        </span>
      </div>
      <div className="rm-body">
        <span className="rm-ylab">Impact</span>
        <div className="rm-grid">
          {[...LEVELS].reverse().map((i) => (
            <div className="rm-row" key={i}>
              <span className="rm-tick">{i}</span>
              {LEVELS.map((p) => (
                <div className={`rm-cell ${band(p, i)}`} key={p}>
                  {at(p, i).map(({ c, n }) => (
                    <button
                      className="rm-dot"
                      key={c.id}
                      onClick={() => onSelect && onSelect(c.id)}
                      title={`${n}. ${c.title || ""} · probability ${c.probability} · impact ${c.impact}`}
                      type="button"
                    >
                      {n}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ))}
          <div className="rm-row rm-xticks">
            <span className="rm-tick" />
            {LEVELS.map((p) => <span className="rm-tick" key={p}>{p}</span>)}
          </div>
          <div className="rm-xlab">Probability</div>
        </div>
      </div>
    </section>
  );
}
