/* HOW FAR BACK, AND HOW MANY.
 *
 * The news panels showed every article a company had, unbounded. Measured on the live
 * store: 438 articles across 31 companies, oldest from October 2022, one company with
 * 83. So a profile opened with four-year-old items stacked in with this week's, and
 * "latest news" meant whatever sorted to the top.
 *
 * Two limits, answering different questions: the WINDOW is the reader's choice of what
 * counts as current, the CAP is how many cards a panel will show. These checks are
 * about them being separate, and about the window never dropping rows silently.
 */
import {
  NEWS_MAX, newsWindows, newsWindowDefault,
  windowDays, windowLabel, withinWindow, capNews,
} from "./src/lib/news.js";

let fails = 0;
const ck = (name, ok, detail) => {
  console.log(`  ${String(name).padEnd(68)} ${ok ? "ok" : "FAIL"}${!ok && detail ? "  " + detail : ""}`);
  if (!ok) fails++;
};

const NOW = Date.parse("2026-09-08T00:00:00Z");
const at = (iso, id) => ({ id, date: iso, title: id });
const ARTICLES = [
  at("2026-09-06", "two days"),
  at("2026-08-20", "three weeks"),
  at("2026-06-01", "three months"),
  at("2025-11-01", "ten months"),
  at("2022-10-19", "four years"),
  { id: "undated", date: null, title: "undated" },
];

const ids = (rows) => rows.map((r) => r.id);

/* ---- the window ---------------------------------------------------------------- */
ck("30 days keeps only what was published inside them",
   JSON.stringify(ids(withinWindow(ARTICLES, 30, NOW))) === JSON.stringify(["two days", "three weeks"]),
   JSON.stringify(ids(withinWindow(ARTICLES, 30, NOW))));

ck("12 months reaches back further but still refuses the 2022 item",
   ids(withinWindow(ARTICLES, 365, NOW)).includes("ten months")
   && !ids(withinWindow(ARTICLES, 365, NOW)).includes("four years"));

/* AN UNDATED ARTICLE CANNOT BE PLACED IN TIME. It is not "recent by default" -- that
   would make the window a suggestion. It is excluded, and the caller prints the count
   so the exclusion is visible rather than silent. */
ck("an undated article is not admitted to a window",
   !ids(withinWindow(ARTICLES, 365, NOW)).includes("undated"));
ck("...but is kept when no window is set",
   ids(withinWindow(ARTICLES, null, NOW)).includes("undated"));
ck("no window returns everything", withinWindow(ARTICLES, null, NOW).length === ARTICLES.length);
ck("a window never reorders",
   JSON.stringify(ids(withinWindow(ARTICLES, 365, NOW)))
   === JSON.stringify(ids(ARTICLES).filter((i) => i !== "four years" && i !== "undated")));

/* ---- the cap ------------------------------------------------------------------- */
const many = Array.from({ length: 40 }, (_, i) => at("2026-09-01", `a${i}`));
ck(`the panel shows at most ${NEWS_MAX} cards`, capNews(many).length === NEWS_MAX);
ck("the cap keeps the newest, which is the order it was given",
   capNews(many)[0].id === "a0" && capNews(many)[NEWS_MAX - 1].id === `a${NEWS_MAX - 1}`);
ck("fewer than the cap is left alone", capNews(ARTICLES).length === ARTICLES.length);
ck("the cap is a maximum, not a target -- an empty list stays empty", capNews([]).length === 0);

/* THE TWO ARE INDEPENDENT. A cap is not a window: 40 articles all from today are still
   capped, and 3 articles from 2022 are still excluded however few there are. */
ck("a cap does not imply a window", capNews(many).every((a) => a.date === "2026-09-01"));
ck("a window does not imply a cap",
   withinWindow(many, 30, NOW).length === 40);

/* ---- the options the UI offers: the rows of the time-window table, nothing else ------------------ */
import { readFileSync } from "node:fs";
const fx = JSON.parse(readFileSync("fixtures/kssl_dataset.json", "utf-8"));
const wins = newsWindows(fx);
const stored = fx.database.ui.competitive_competitor_moment_time_window;
ck("the windows offered are exactly the stored rows, in stored order",
   JSON.stringify(wins.map((w) => [w.key, w.label, w.days])) ===
   JSON.stringify(stored.slice().sort((a, b) => a.display_order - b.display_order).map((r) => [r.time_window_code, r.time_window_label, r.day_count])));
ck("the default window is the stored is_default row", newsWindowDefault(fx) === stored.find((r) => r.is_default).time_window_code);
ck("every option resolves to days", wins.length > 0 && wins.every((w) => Number.isFinite(w.days) && w.days > 0));
ck("windowDays and windowLabel agree with the table",
   windowDays(wins[0].key, wins) === wins[0].days && windowLabel(wins[0].key, wins) === wins[0].label);
ck("an unknown key means no window rather than a crash", windowDays("nonsense", wins) === null);
ck("a changed label in the table is the label offered",
   newsWindows({ database: { ui: { competitive_competitor_moment_time_window: [{ time_window_code: "x", time_window_label: "Past fortnight", day_count: 14, display_order: 1 }] } } })[0].label === "Past fortnight");
ck("no rows, no windows, and the default is every date",
   newsWindows({}).length === 0 && newsWindowDefault({}) === "all");

/* Guards: these run against live data where a field can be missing. */
ck("null input is an empty list, not a throw", withinWindow(null, 30, NOW).length === 0);
ck("capNews(null) is an empty list, not a throw", capNews(null).length === 0);

console.log("");
console.log(fails ? fails + " FAILED"
                  : "ok - the window is the reader's, the cap is the panel's, and neither hides rows quietly");
process.exit(fails ? 1 : 0);
