/* Header configuration is read from the UI schema.  These helpers only describe
   the table-to-view mapping; visible labels and metric values come from PostgreSQL. */

const uiRows = (data, table) => {
  const rows = data && data.database && data.database.ui && data.database.ui[table];
  return Array.isArray(rows) ? rows : [];
};

const first = (rows, predicate = () => true) => rows.find(predicate) || null;

export function headerMetrics(data, pillar) {
  const table = {
    competitive: "competitive_metric",
    market: "market_metric",
    technology: "technology_metric",
  }[pillar];
  return uiRows(data, table)
    .slice()
    .sort((a, b) => Number(a.display_order || 0) - Number(b.display_order || 0))
    .map((row) => ({
      l: row.metric_label || "",
      act: row.metric_action || row.metric_key || row.metric_id || "",
      v: row.metric_value == null ? "—" : String(row.metric_value),
      unit: row.metric_unit || "",
      sub: row.metric_subtext || "",
    }))
    .filter((metric) => metric.l);
}

export function pillarHeaderTitle(data, pillar) {
  if (pillar === "competitive") {
    const navigation = first(
      uiRows(data, "competitive_navigation"),
      (row) => String(row.view_key || "").toLowerCase() === "overview",
    );
    return navigation ? navigation.view_label || "" : "";
  }
  if (pillar === "market") {
    const row = first(uiRows(data, "market_pillar"));
    return row ? row.display_name || "" : "";
  }
  if (pillar === "technology") {
    const row = first(uiRows(data, "technology_pillar"));
    return row ? row.knowledge_title || row.pillar_name || "" : "";
  }
  return "";
}

export function pillarNavigationLabels(data) {
  const competitive = first(
    uiRows(data, "competitive_navigation"),
    (row) => String(row.view_key || "").toLowerCase() === "overview",
  );
  const market = first(uiRows(data, "market_pillar"));
  const technology = first(uiRows(data, "technology_pillar"));
  return {
    competitive: competitive ? competitive.view_label || "" : "",
    market: market ? market.display_name || "" : "",
    technology: technology ? technology.pillar_name || technology.knowledge_title || "" : "",
  };
}
