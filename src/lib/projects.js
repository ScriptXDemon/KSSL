/* Projects feed: what each competitor is working on or pursuing. Pure -- the page renders what this returns.
   The rows are lib/competitorProjects (db/competitor_projects.py): deals, framework supply, capacity builds and
   Gulf reference projects, each read from the dataset's own records. */
import { PROJECTS_DATA, PROJECT_STAGES } from "./competitorProjects.js";
import { formatDate } from "../utils/formatDate.js";

/* The filter buttons are WHERE the project is, since the page covers the rivals' region and the world. */
export const PROJECT_FILTERS = [
  { f: "all", l: "All" },
  { f: "Gulf", l: "Gulf region" },
  { f: "Worldwide", l: "Worldwide" },
];

/* the analyst's read for the client, in the Overview's own tag colours */
export const STANCE_CLASS = { threat: "threat", watch: "watch", fav: "fav" };
export const STANCE_WORD = { threat: "Threat", watch: "Watch", fav: "" };

export const PROJECT_SEQ = [
  ["recent", "Latest milestone"],
  ["stage", "Furthest along"],
  ["size", "Largest (MW)"],
];

export const day = (d) => (d && /^\d{4}/.test(d) ? (/^\d{4}$/.test(d) ? `${d}-01-01` : /^\d{4}-\d{2}$/.test(d) ? `${d}-01` : d) : "");

export const latestWhen = (p) => (p.latest ? formatDate(p.latest.date) : "");

const bySize = (a, b) => (b.mw || 0) - (a.mw || 0);
const SEQ = {
  recent: (a, b) => day(b.latest && b.latest.date).localeCompare(day(a.latest && a.latest.date)) || bySize(a, b),
  stage: (a, b) => b.stageRank - a.stageRank || SEQ.recent(a, b),
  size: (a, b) => bySize(a, b) || SEQ.recent(a, b),
};

const haystack = (p) =>
  [p.name, p.company, p.customer, p.location, p.kind, p.stage, p.stageNote, p.overview.join(" "), p.specs.map((s) => s.v).join(" ")].join(" ").toLowerCase();

/* `cid` null = every competitor. `counts` is what each button would show under the current competitor and search,
   so no button promises rows it lacks; `perCompetitor` is each rival's count under the current region filter and search. */
export function projectFeed({ projects = PROJECTS_DATA, cid = null, filter = "all", query = "", seq = "recent" } = {}) {
  const tokens = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
  const searched = projects.filter((p) => tokens.every((t) => haystack(p).includes(t)));
  const mine = cid ? searched.filter((p) => p.cid === cid) : searched;
  const counts = { all: mine.length };
  PROJECT_FILTERS.slice(1).forEach(({ f }) => { counts[f] = mine.filter((p) => p.region === f).length; });
  const inRegion = (p) => filter === "all" || p.region === filter;
  const perCompetitor = {};
  searched.filter(inRegion).forEach((p) => { perCompetitor[p.cid] = (perCompetitor[p.cid] || 0) + 1; });
  const rows = mine.filter(inRegion).slice().sort(SEQ[seq] || SEQ.recent);
  return { rows, counts, perCompetitor, total: projects.length };
}

/* the four tiles above the list, counted from the rows */
export function projectMetrics(projects = PROJECTS_DATA) {
  const rivals = new Set(projects.map((p) => p.cid)).size;
  return [
    { act: "all", l: "Projects tracked", v: String(projects.length), unit: " projects" },
    { act: "rivals", l: "Competitors covered", v: String(rivals), unit: " companies" },
    { act: "gulf", l: "In the Gulf region", v: String(projects.filter((p) => p.region === "Gulf").length), unit: " projects" },
    { act: "threat", l: "Read as a threat", v: String(projects.filter((p) => p.assessment.stance === "threat").length), unit: " projects" },
  ];
}

export const STAGE_WORDS = PROJECT_STAGES;

if (typeof process !== "undefined" && process.argv && /lib[\\/]projects\.js$/.test(process.argv[1] || "")) {
  const assert = (c, m) => { if (!c) throw new Error(m); };
  const mk = (id, cid, region, rank, mw, date) => ({ id, cid, name: id, company: cid, region, stageRank: rank, mw, latest: date && { date }, overview: [], specs: [], assessment: { stance: "watch" } });
  const ps = [mk("a", "X", "Gulf", 4, 10, "2026-10-01"), mk("b", "Y", "Worldwide", 2, 30, "2026-09"), mk("c", "X", "Worldwide", 3, 20, null)];
  assert(projectFeed({ projects: ps }).rows.map((p) => p.id).join() === "a,b,c", "recent");
  assert(projectFeed({ projects: ps, seq: "stage" }).rows.map((p) => p.id).join() === "a,c,b", "stage");
  assert(projectFeed({ projects: ps, seq: "size" }).rows.map((p) => p.id).join() === "b,c,a", "size");
  const f = projectFeed({ projects: ps, cid: "X", filter: "Gulf" });
  assert(f.rows.length === 1 && f.counts.all === 2 && f.counts.Worldwide === 1 && f.perCompetitor.X === 1 && f.perCompetitor.Y === undefined, "competitor + region");
  assert(projectMetrics(ps)[1].v === "2" && projectMetrics(ps)[2].v === "1", "metrics");
  console.log("projects ok");
}
