/* Header configuration is read from the UI schema.  These helpers only describe
   the table-to-view mapping; visible labels and metric values come from PostgreSQL. */

const uiRows = (data, table) => {
  const rows = data && data.database && data.database.ui && data.database.ui[table];
  return Array.isArray(rows) ? rows : [];
};

const first = (rows, predicate = () => true) => rows.find(predicate) || null;

const EMPTY_HEADER_METRICS = {
  competitive: [
    ["Competitive threats", "threat"],
    ["Watch signals", "watch"],
    ["Companies tracked", "companies"],
    ["Rating matched pairs", "pairs"],
  ],
  market: [
    ["Active tenders", "active"],
    ["Markets", "markets"],
    ["Source portals", "portals"],
    ["Value disclosed", "value"],
  ],
  technology: [
    ["Competitor advances", "rival"],
    ["Adoptable advances", "adopt"],
    ["Domains tracked", "domains"],
  ],
};

function fallbackMetricValues(data, pillar) {
  const cards = pillar === "technology"
    ? data.techCards || []
    : pillar === "market"
      ? data.marketCards || []
      : data.competitiveCards || [];
  const count = (predicate) => cards.filter(predicate).length;
  if (pillar === "competitive") {
    const clientId = data.client && String(data.client.id || "");
    return {
      threat: count((row) => row && row.dir === "threat"),
      watch: count((row) => row && row.dir === "watch"),
      companies: Object.keys(data.competitors || {}).filter((id) => id !== clientId).length,
      pairs: Object.keys(data.matchups || {}).length,
    };
  }
  if (pillar === "technology") {
    const domains = Object.values(data.innovations || {}).filter((rows) => Array.isArray(rows) && rows.length).length;
    return {
      rival: count((row) => String(row && row.tags || "").split(" ").includes("rival")),
      adopt: count((row) => String(row && row.tags || "").split(" ").includes("adopt")),
      domains,
    };
  }
  const tenders = data.tenders || [];
  const countries = new Set(tenders.map((row) => row && row.country).filter(Boolean));
  const portals = new Set(tenders.map((row) => {
    try { return new URL(row.url).hostname; } catch (e) { return ""; }
  }).filter(Boolean));
  return {
    active: tenders.filter((row) => row && row.isLive !== false && String(row.status || "").toLowerCase() !== "closed").length,
    markets: countries.size,
    portals: portals.size,
    value: tenders.filter((row) => row && row.value).length,
  };
}

export function headerMetrics(data, pillar) {
  const table = {
    competitive: "competitive_metric",
    market: "market_metric",
    technology: "technology_metric",
  }[pillar];
  const rows = uiRows(data, table);
  if (!rows.length) {
    const values = fallbackMetricValues(data || {}, pillar);
    return (EMPTY_HEADER_METRICS[pillar] || []).map(([label, action]) => ({
      l: label,
      act: action,
      v: String(values[action] || 0),
      unit: "",
      sub: "",
    }));
  }
  return rows
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
    return navigation ? navigation.view_label || "Competitive Intelligence" : "Competitive Intelligence";
  }
  if (pillar === "market") {
    const row = first(uiRows(data, "market_pillar"));
    return row ? row.display_name || "Top opportunity" : "Top opportunity";
  }
  if (pillar === "technology") {
    const row = first(uiRows(data, "technology_pillar"));
    return row ? row.knowledge_title || row.pillar_name || "Technology Knowledge" : "Technology Knowledge";
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
    competitive: competitive ? competitive.view_label || "Competitive" : "Competitive",
    market: market ? market.display_name || "Market" : "Market",
    technology: technology ? technology.pillar_name || technology.knowledge_title || "Technology" : "Technology",
  };
}
