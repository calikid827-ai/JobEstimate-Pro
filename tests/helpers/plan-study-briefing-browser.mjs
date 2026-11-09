/**
 * Offline actual-component fixture, not a Next build or an application entry point.
 * Run: node tests/helpers/plan-study-briefing-browser.mjs [loopback-port]
 * Open the printed URL using the approved browser surface. No browser is automated
 * here. No environment file, Auth client, route handler, provider or database loads.
 * TypeScript is transpiled in memory; no generated files or dependencies are written.
 */
import http from "node:http"
import net from "node:net"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const port = Number(process.argv[2] || 3221)
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) throw new Error("Choose a nonprivileged loopback port.")

let blockedNodeConnections = 0
// Serving incoming loopback requests needs no outgoing socket connections at all.
net.Socket.prototype.connect = function () {
  blockedNodeConnections++
  throw new Error("Offline Plan Study fixture blocks all outgoing Node connections.")
}

const entry = path.join(root, "app/app/components/PlanStudySection.tsx")
const fixture = path.join(root, "tests/fixtures/plan-study/briefing-browser-fixtures.ts")
const dependencyFiles = {
  react: "node_modules/react/cjs/react.development.js",
  "react/jsx-runtime": "node_modules/react/cjs/react-jsx-runtime.development.js",
  "react-dom": "node_modules/react-dom/cjs/react-dom.development.js",
  "react-dom/client": "node_modules/react-dom/cjs/react-dom-client.development.js",
  scheduler: "node_modules/scheduler/cjs/scheduler.development.js",
}

function resolveModule(specifier, from) {
  if (dependencyFiles[specifier]) return path.join(root, dependencyFiles[specifier])
  // The unchanged viewer fails its explicitly synthetic PDF request before its
  // renderer import. plan-upload's dynamic PDF export is never invoked here.
  // Neither module is substituted with working behavior in this briefing check.
  if (specifier === "pdfjs-dist" || specifier === "pdf-lib") return null
  if (!specifier.startsWith(".")) throw new Error(`Unapproved fixture dependency: ${specifier}`)
  const base = path.resolve(path.dirname(from), specifier)
  const result = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`].find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile())
  if (!result || !result.startsWith(`${root}/`)) throw new Error(`Unavailable local fixture module: ${specifier}`)
  return result
}

function bundle() {
  const modules = new Map()
  function include(filename) {
    if (modules.has(filename)) return
    const source = fs.readFileSync(filename, "utf8")
    const code = /\.tsx?$/.test(filename) ? ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
      fileName: filename,
    }).outputText : source
    const dependencies = {}
    modules.set(filename, { code, dependencies })
    for (const match of code.matchAll(/\brequire\(["']([^"']+)["']\)/g)) {
      const dependency = resolveModule(match[1], filename)
      dependencies[match[1]] = dependency
      if (dependency) include(dependency)
    }
  }
  include(entry)
  include(fixture)
  const react = path.join(root, dependencyFiles.react)
  const client = path.join(root, dependencyFiles["react-dom/client"])
  include(react); include(client)
  const wrappers = [...modules].map(([id, { code, dependencies }]) => `${JSON.stringify(id)}: {deps:${JSON.stringify(dependencies)}, run:function(module,exports,require,process){\n${code}\n}}`).join(",\n")
  return `"use strict";
// A closed module set, with no network module resolver or eval.
const modules = {${wrappers}};
const cache = {};
function load(id) {
  if (!id || !modules[id]) throw new Error("Module not supplied to offline fixture");
  if (cache[id]) return cache[id].exports;
  const module = cache[id] = {exports:{}};
  const definition = modules[id];
  definition.run(module,module.exports,(name)=>load(definition.deps[name]),{env:{NODE_ENV:"development"}});
  return module.exports;
}
const blockedBrowserTransport = [];
const forbidden = (name) => { blockedBrowserTransport.push(name); throw new Error("Offline fixture blocks browser transport: " + name); };
window.fetch = async () => forbidden("fetch");
window.XMLHttpRequest = class { constructor(){ forbidden("XMLHttpRequest"); } };
window.WebSocket = class { constructor(){ forbidden("WebSocket"); } };
window.EventSource = class { constructor(){ forbidden("EventSource"); } };
navigator.sendBeacon = () => { blockedBrowserTransport.push("sendBeacon"); return false; };
const React = load(${JSON.stringify(react)});
const {createRoot} = load(${JSON.stringify(client)});
const PlanStudySection = load(${JSON.stringify(entry)}).default;
const {briefingScenarios,briefingBrowserStudy,replaceBriefingBrowserSource} = load(${JSON.stringify(fixture)});
let retained = briefingBrowserStudy();
let events = [];
let refresh = () => {};
const clone = value => structuredClone(value);
const fetcher = async (input,init={}) => {
  const url = String(input), method = init.method || "GET";
  const event = {url,method};
  if (init.body && typeof init.body === "string") event.body = JSON.parse(init.body);
  events.push(event); refresh();
  if (method === "GET" && url === "/api/plan-studies") return Response.json({studies:[clone(retained)]});
  if (method === "GET" && url === "/api/plan-studies/" + retained.id) return Response.json({study:clone(retained)});
  if (method === "POST" && url === "/api/plan-studies/" + retained.id + "/decisions") {
    const body = event.body;
    const finding = retained.findings.find(item=>item.id === body.findingId && ["question","conflict"].includes(item.kind));
    if (!finding || body.expectedRevision !== retained.revision) return Response.json({code:"SYNTHETIC_STALE",error:"Synthetic finding/revision mismatch"},{status:409});
    retained.decisions = retained.decisions.filter(item=>item.findingId!==finding.id);
    retained.decisions.push({id:"synthetic-decision-"+retained.revision,findingId:finding.id,findingTitle:finding.title,answer:body.answer,documentVersionIds:[...new Set(finding.citations.map(item=>item.documentVersionId))],sourceRevision:retained.sourceRevision,status:"active",createdAt:"2026-10-25T12:31:00Z"});
    retained.revision++;
    return Response.json({study:clone(retained)});
  }
  if (method === "GET" && url.startsWith("/api/plan-studies/"+retained.id+"/evidence/")) {
    return new Response("Synthetic unavailable PDF; unchanged rendering is covered by prior evidence.",{status:503});
  }
  event.unexpected = true;
  return Response.json({code:"SYNTHETIC_OPERATION_FORBIDDEN",error:"This fixture supplies only list, reopen, answer and evidence-failure dependencies. No preparation, uploads or review execution."},{status:409});
};
function Harness() {
  const [scenario,setScenario] = React.useState("limited");
  const [generation,setGeneration] = React.useState(0);
  const [,redraw] = React.useState(0);
  refresh = () => redraw(value=>value+1);
  return React.createElement(React.Fragment,null,
    React.createElement("header",{style:{padding:16,background:"#eff6ff",border:"1px solid #93c5fd"}},
      React.createElement("h1",null,"Offline actual-component briefing check"),
      React.createElement("p",null,"Actual PlanStudySection, usePlanStudy and evidence-viewer components; synthetic in-memory persistence. No Auth, provider, upload, preparation or hosted calls. Only explicitly named wording excerpts are captured; all bindings and scenarios are synthetic."),
      React.createElement("label",null,"Synthetic scenario ",React.createElement("select",{"aria-label":"Synthetic scenario",value:scenario,onChange:event=>{const value=event.target.value; retained=briefingBrowserStudy(value);events=[];setScenario(value);setGeneration(value=>value+1)}},briefingScenarios.map(value=>React.createElement("option",{key:value,value},value)))),
      React.createElement("button",{type:"button",style:{marginLeft:12},onClick:()=>{retained=replaceBriefingBrowserSource(retained);events.push({control:"synthetic-source-replacement",sourceRevision:retained.sourceRevision});refresh()}},"Replace synthetic source"),
      React.createElement("p",{"data-qa-snapshot":true},"Synthetic retained source revision: "+retained.sourceRevision+"; fixture revision: "+retained.revision+". After replacing, use the component’s Reopen recorded state button.")),
    React.createElement(PlanStudySection,{key:generation,fetcher,ownerKey:"synthetic-owner"}),
    React.createElement("details",{style:{marginTop:20}},React.createElement("summary",null,"Synthetic dependency requests and transport checks"),
      React.createElement("pre",{"data-qa-requests":true,style:{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}},JSON.stringify({events,blockedBrowserTransport},null,2))));
}
createRoot(document.getElementById("root")).render(React.createElement(Harness));
window.addEventListener("securitypolicyviolation",event=>{blockedBrowserTransport.push("CSP: "+event.violatedDirective);refresh()});
`
}

const server = http.createServer((request, response) => {
  response.setHeader("Cache-Control", "no-store")
  response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'none'; img-src 'self' data:; worker-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'")
  if (request.method !== "GET") { response.writeHead(405); response.end(); return }
  if (request.url === "/") {
    response.setHeader("Content-Type", "text/html; charset=utf-8")
    response.end('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline Plan Study briefing</title><link rel="icon" href="data:,"></head><body style="font-family:Arial,sans-serif;margin:20px;color:#0f172a"><main id="root"></main><script src="/fixture.js" defer></script></body></html>')
    return
  }
  if (request.url === "/fixture.js") {
    try { response.setHeader("Content-Type", "application/javascript; charset=utf-8"); response.end(bundle()) }
    catch (error) { console.error(error); response.writeHead(500); response.end("Offline fixture could not load local modules.") }
    return
  }
  if (request.url === "/__qa/transport") {
    response.setHeader("Content-Type", "application/json")
    response.end(JSON.stringify({blockedNodeConnections,externalTransport:"blocked",environmentFilesRead:false,dependencies:"synthetic in-memory fetcher; real components"}))
    return
  }
  response.writeHead(404); response.end()
})
server.listen(port, "127.0.0.1", () => console.log(`Offline actual-component fixture: http://127.0.0.1:${port}/`))
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => server.close(() => process.exit(0)))
