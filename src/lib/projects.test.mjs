import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { PROJECTS_DATA, PROJECT_STAGES } from "./competitorProjects.js";
import { projectFeed, projectMetrics, day } from "./projects.js";

const file = new URL("../../../parallax-cummins-arabia-datapack/dataset.html.json", import.meta.url);
const d = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;

test("every project belongs to a tracked competitor and says what it is, where it stands and what it means", () => {
  const ids = new Set();
  PROJECTS_DATA.forEach((p) => {
    assert.ok(!ids.has(p.id), `duplicate ${p.id}`);
    ids.add(p.id);
    if (d) assert.ok(d.competitors[p.cid], `${p.id}: unknown competitor ${p.cid}`);
    assert.ok(p.overview.length && p.stageNote && p.timeline.length && p.specs.length, `${p.id} is missing a section`);
    assert.ok(PROJECT_STAGES.includes(p.stage) && PROJECT_STAGES.indexOf(p.stage) + 1 === p.stageRank, `${p.id} stage`);
    assert.ok(["Gulf", "Worldwide"].includes(p.region), `${p.id} region`);
    assert.ok(p.assessment.read.length && p.assessment.stance, `${p.id} has no assessment`);
    assert.ok(p.sources.length, `${p.id} has no source`);
    const dated = p.timeline.map((e) => day(e.date)).filter(Boolean);
    assert.deepEqual(dated, [...dated].sort(), `${p.id} timeline out of order`);
    [p.name, p.stageNote, ...p.overview, ...p.assessment.read].forEach((t) => assert.ok(!/<[a-z]|&amp;|&lt;/i.test(t), `${p.id}: markup in "${t}"`));
    assert.ok(!("image" in p), `${p.id} carries an image`);
  });
});

test("every tracked competitor with projects on record is covered, in the Gulf and worldwide", () => {
  const by = (cid) => PROJECTS_DATA.filter((p) => p.cid === cid);
  ["CATERPIL", "ROLLSROY", "REHLKO", "MITSUBIS", "WEICHAIB", "PERKINSF", "GENERAC", "VOLVOPEN"].forEach((cid) => assert.ok(by(cid).length, `${cid} has no project`));
  assert.ok(PROJECTS_DATA.some((p) => p.region === "Gulf") && PROJECTS_DATA.some((p) => p.region === "Worldwide"));
});

test("the feed filters by competitor and region, counts agree, and metrics are counted", () => {
  const all = projectFeed({});
  assert.equal(all.rows.length, PROJECTS_DATA.length);
  const cat = projectFeed({ cid: "CATERPIL" });
  assert.ok(cat.rows.every((p) => p.cid === "CATERPIL") && cat.counts.all === cat.rows.length);
  assert.equal(cat.counts.Gulf + cat.counts.Worldwide, cat.counts.all);
  assert.equal(Object.values(all.perCompetitor).reduce((a, b) => a + b, 0), PROJECTS_DATA.length);
  assert.equal(projectMetrics()[0].v, String(PROJECTS_DATA.length));
});
