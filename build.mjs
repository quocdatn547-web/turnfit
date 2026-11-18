import { mkdir, readFile, writeFile } from "node:fs/promises";

const root = new URL("./", import.meta.url);
const read = name => readFile(new URL("src/" + name, root), "utf8");
const [page, css, geo, planner, drawing, ui] = await Promise.all(
  ["page.html","style.css","geometry.js","planner.js","drawing.js","app.js"].map(read),
);
const worker = geo + "\n" + planner + "\n" + "self.onmessage = ({ data }) => {\n  try {\n    const { scene, items } = data;\n    if (!TurnFitGeometry.validate(data)) throw new Error(\"Invalid dimensions\");\n    const results = items.map(item => TurnFitPlanner.findRoute(scene, item));\n    self.postMessage({ results });\n  } catch {\n    self.postMessage({ error: true });\n  }\n};";
const safe = source => source.replaceAll(/<\/script/gi, "<\\/script");
const scripts = safe(
  "globalThis.TURNFIT_WORKER_SOURCE = " + JSON.stringify(worker) + ";\n" +
  geo + "\n" + planner + "\n" + drawing + "\n" + ui,
);
const output = page.replace("<!-- STYLES -->", () => "<style>\n" + css + "\n</style>")
  .replace("<!-- SCRIPTS -->", () => "<script>\n" + scripts + "\n</script>");
const dist = new URL("dist/", root);
await mkdir(dist, { recursive: true });
await writeFile(new URL("index.html", dist), output);
console.log("Built dist/index.html (" + new TextEncoder().encode(output).length + " bytes)");
