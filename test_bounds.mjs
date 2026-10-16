import fs from "fs";
import { createPartners } from "./src/lib/partners.js";

const data = JSON.parse(fs.readFileSync("public/api/dataset", "utf-8"));
const p = createPartners(data);

const co = data.competitors["adani-defence"];
const svgFocus = p.typeGraphSvg(co, { stage: "focus", type: "jv", mode: "type" });
console.log(svgFocus);
