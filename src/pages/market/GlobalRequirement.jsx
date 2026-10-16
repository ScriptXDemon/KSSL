import { useMemo } from "react";
import { useHeaderReport } from "../../state/AppState";
import { useData } from "../../state/DataProvider";
import { globalRequirements } from "../../lib/globalRequirements";
import { uiText } from "../../lib/uiText";
import { navTitle } from "../../lib/route";

/* Global Requirements: the worldwide demand, capacity and supply signals (lib/globalRequirements), shown in the
   Overview's own feed -- numbered rows, Search and Sequence, the white detail panel on a click. Layout mounts
   that feed and hands it in; this page adds the header report. */
export default function GlobalRequirement({ feed }) {
  const { data } = useData();
  const rows = useMemo(() => globalRequirements(data), [data]);
  // the heading and the empty text are the stored words (ui.market_view, ui.market_global_requirement_view)
  const empty = uiText(data, "ui.market_global_requirement_view", {}, "empty_state_text");
  const report = useMemo(() => ({
    title: navTitle(data, "market", "global-requirement"),
    subtitle: rows.length ? `${rows.length} worldwide signals` : empty,
    sections: rows.map((r) => ({ heading: r.title, body: r.why })),
    payload: { requirements: rows },
  }), [rows, data, empty]);
  useHeaderReport(report);

  if (!rows.length)
    return <div style={{ flex: 1, padding: "48px 24px", color: "var(--d-txt-3)", fontFamily: "var(--mono)", fontSize: "12px", textAlign: "center" }}>{empty}</div>;
  return feed || null;
}
