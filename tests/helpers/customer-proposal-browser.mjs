/**
 * Isolated offline Customer-Safe Proposal V1 actual-component fixture.
 * Run: node tests/helpers/customer-proposal-browser.mjs [loopback-port, or 0]
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
import { createRequire } from "node:module"

const localRequire = createRequire(import.meta.url)

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const port = Number(process.argv[2] || 0)
if (!Number.isSafeInteger(port) || (port !== 0 && port < 1024) || port > 65535) throw new Error("Choose a nonprivileged loopback port.")

const blockedNodeAttempts = []
const contentSecurityPolicy = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'none'; img-src 'self' data:; worker-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'"
// Serving incoming loopback requests needs no outgoing socket connections at all.
net.Socket.prototype.connect = function (...args) {
  const options = Array.isArray(args[0]) ? args[0][0] : args[0]
  const previousLimit = Error.stackTraceLimit
  let error
  try {
    Error.stackTraceLimit = Infinity
    error = new Error("Offline customer proposal fixture blocks all outgoing Node connections.")
    void error.stack
  } finally { Error.stackTraceLimit = previousLimit }
  const context = typeof options === "object" && options !== null
    ? { host: options.host ?? options.hostname ?? null, port: options.port ?? null, path: options.path ?? null }
    : typeof options === "number"
      ? { host: typeof args[1] === "string" ? args[1] : "localhost", port: options, path: null }
      : { host: null, port: null, path: typeof options === "string" ? options : null }
  blockedNodeAttempts.push({ api: "net.Socket.connect", ...context, timestamp: new Date().toISOString(), stack: error.stack ?? null })
  throw error
}

// A parser-blocking same-origin script installs these listeners before fixture
// modules execute. It uses the unchanged script-src 'self' policy, not an inline
// script, eval permission, nonce exception or transport exception.
function earlyTransportGuard() {
  return `"use strict";
(() => {
  const audit = {
    schemaVersion: 1, installedAt: new Date().toISOString(), installedPerformanceTime: performance.now(),
    documentURI: document.documentURI, bootstrapScript: document.currentScript?.src ?? null,
    policy: ${JSON.stringify(contentSecurityPolicy)}, phases: [],
    blockedBrowserTransport: [], cspViolations: [], browserErrors: []
  };
  function renderAudit() {
    if (!document.body) return;
    let output = document.querySelector("[data-qa-transport-audit]");
    if (!output) {
      const container = document.createElement("details");
      container.setAttribute("data-qa-transport-audit-container", "");
      const summary = document.createElement("summary");
      summary.textContent = "Early transport and CSP audit";
      output = document.createElement("pre");
      output.setAttribute("data-qa-transport-audit", "");
      output.style.whiteSpace = "pre-wrap"; output.style.overflowWrap = "anywhere";
      container.append(summary, output); document.body.append(container);
    }
    output.textContent = JSON.stringify(audit, null, 2);
  }
  function notify() {
    renderAudit();
    window.dispatchEvent(new Event("source-linked-draft-transport-audit"));
  }
  function time(event) {
    return { timestamp: new Date().toISOString(), performanceTime: performance.now(), eventTimeStamp: event?.timeStamp ?? null };
  }
  function targetURL(value) {
    try {
      const supplied = value && typeof value === "object" && "url" in value ? value.url : value;
      return supplied == null ? null : new URL(String(supplied), document.baseURI).href;
    } catch { return value == null ? null : String(value); }
  }
  function denied(api, target, extra = {}, shouldThrow = true) {
    const previousLimit = Error.stackTraceLimit;
    let error;
    try {
      if (typeof previousLimit === "number") Error.stackTraceLimit = Infinity;
      error = new Error("Offline fixture blocks browser transport: " + api);
      void error.stack;
    } finally { if (typeof previousLimit === "number") Error.stackTraceLimit = previousLimit; }
    audit.blockedBrowserTransport.push({ kind: "api", api, targetURL: targetURL(target), documentURI: document.documentURI, ...time(), ...extra, initiationStack: error.stack ?? null });
    notify();
    if (shouldThrow) throw error;
    return false;
  }
  window.addEventListener("securitypolicyviolation", event => {
    const violation = {
      kind: "csp", ...time(event), blockedURI: event.blockedURI, documentURI: event.documentURI,
      effectiveDirective: event.effectiveDirective, violatedDirective: event.violatedDirective,
      sourceFile: event.sourceFile, lineNumber: event.lineNumber, columnNumber: event.columnNumber,
      sample: event.sample, disposition: event.disposition, originalPolicy: event.originalPolicy,
      statusCode: event.statusCode, referrer: event.referrer,
    };
    audit.cspViolations.push(violation); audit.blockedBrowserTransport.push(violation); notify();
  });
  window.addEventListener("error", event => {
    const target = event.target;
    audit.browserErrors.push({ kind: "error", ...time(event), message: event.message ?? "Resource error", filename: event.filename ?? null,
      lineNumber: event.lineno ?? null, columnNumber: event.colno ?? null, stack: event.error?.stack ?? null,
      resourceURL: target && target !== window ? target.src || target.href || null : null });
    notify();
  }, true);
  window.addEventListener("unhandledrejection", event => {
    audit.browserErrors.push({ kind: "unhandledrejection", ...time(event), message: String(event.reason), stack: event.reason?.stack ?? null }); notify();
  });
  window.fetch = async (input, init) => denied("fetch", input, { method: init?.method ?? (input && typeof input === "object" ? input.method : undefined) ?? "GET" });
  window.XMLHttpRequest = class { constructor() { denied("XMLHttpRequest.constructor", null, { targetUnavailableReason: "Construction blocked before open() can provide a URL." }); } };
  window.WebSocket = class { constructor(url) { denied("WebSocket.constructor", url); } };
  window.EventSource = class { constructor(url) { denied("EventSource.constructor", url); } };
  navigator.sendBeacon = url => denied("navigator.sendBeacon", url, {}, false);
  window.__sourceLinkedDraftTransportGuard = { audit, mark(phase) { audit.phases.push({ phase, ...time() }); notify(); } };
  audit.phases.push({ phase: "early-guard-installed", ...time() });
  document.addEventListener("DOMContentLoaded", renderAudit, { once: true });
  renderAudit();
})();
`
}

const entry = path.join(root, "app/app/components/SourceLinkedDraftSection.tsx")
const fixture = path.join(root, "tests/fixtures/customer-proposal/browser-fixtures.ts")
const dependencyFiles = {
  react: "node_modules/react/cjs/react.development.js",
  "react/jsx-runtime": "node_modules/react/cjs/react-jsx-runtime.development.js",
  "react-dom": "node_modules/react-dom/cjs/react-dom.development.js",
  "react-dom/client": "node_modules/react-dom/cjs/react-dom-client.development.js",
  scheduler: "node_modules/scheduler/cjs/scheduler.development.js",
  zod: path.relative(root, localRequire.resolve("zod")),
  "pdf-lib": path.relative(root, localRequire.resolve("pdf-lib")),
  tslib: path.relative(root, localRequire.resolve("tslib")),
  "@pdf-lib/standard-fonts": path.relative(root, localRequire.resolve("@pdf-lib/standard-fonts")),
  "@pdf-lib/upng": path.relative(root, localRequire.resolve("@pdf-lib/upng")),
  pako: path.relative(root, localRequire.resolve("pako")),
}

function resolveModule(specifier, from) {
  if (dependencyFiles[specifier]) return path.join(root, dependencyFiles[specifier])
  // The unchanged viewer fails its explicitly synthetic PDF request before its
  // renderer import. plan-upload's dynamic PDF export is never invoked here.
  // Neither module is substituted with working behavior in this briefing check.
  if (specifier === "pdfjs-dist") return null
  if (!specifier.startsWith(".")) throw new Error(`Unapproved fixture dependency: ${specifier}`)
  const base = path.resolve(path.dirname(from), specifier)
  const result = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.cjs`, `${base}.json`, path.join(base, "index.js"), path.join(base, "index.cjs")].find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile())
  if (!result || !result.startsWith(`${root}/`)) throw new Error(`Unavailable local fixture module: ${specifier}`)
  return result
}


const persistence = path.join(root, "app/app/lib/local-persistence.ts")
const constants = path.join(root, "app/app/lib/constants.ts")
let moduleLineRanges = []

function bundle() {
  const modules = new Map()
  function include(filename) {
    if (modules.has(filename)) return
    const source = fs.readFileSync(filename, "utf8")
    const code = filename.endsWith(".json") ? "module.exports = " + source + ";" : /\.tsx?$/.test(filename) ? ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }, fileName: filename,
    }).outputText : source
    const dependencies = {}
    modules.set(filename, { code, dependencies })
    for (const match of code.matchAll(/\brequire\(["']([^"']+)["']\)/g)) {
      const dependency = resolveModule(match[1], filename)
      dependencies[match[1]] = dependency
      if (dependency) include(dependency)
    }
  }
  const react = path.join(root, dependencyFiles.react)
  const client = path.join(root, dependencyFiles["react-dom/client"])
  for (const filename of [entry, fixture, persistence, constants, react, client]) include(filename)
  const wrappers = [...modules].map(([id, { code, dependencies }]) => `\n// QA_MODULE ${JSON.stringify(id)}\n${JSON.stringify(id)}: {deps:${JSON.stringify(dependencies)}, run:function(module,exports,require,process){\n${code}\n}}`).join(",\n")
  const javascript = `"use strict";
const transportGuard = window.__sourceLinkedDraftTransportGuard;
if (!transportGuard) throw new Error("Early offline transport guard did not initialize; fixture execution refused.");
transportGuard.mark("fixture-script-started");
transportGuard.audit.moduleLineRanges = [];
const {blockedBrowserTransport,cspViolations,browserErrors} = transportGuard.audit;
const modules = {${wrappers}};
const cache = {};
function load(id) {
  if (!id || !modules[id]) throw new Error("Module not supplied to isolated offline fixture");
  if (cache[id]) return cache[id].exports;
  const module = cache[id] = {exports:{}};
  const definition = modules[id];
  definition.run(module,module.exports,(name)=>load(definition.deps[name]),{env:{NODE_ENV:"development"}});
  return module.exports;
}
const React = load(${JSON.stringify(react)});
const {createRoot} = load(${JSON.stringify(client)});
// Keep the installed validator and restrictive CSP. Its interpreter avoids the
// optional eval capability probe; validation rules and application code are real.
const installedZod = load(${JSON.stringify(path.join(root, dependencyFiles.zod))});
installedZod.config({jitless:true});
transportGuard.audit.installedZod = {moduleId:${JSON.stringify(path.join(root, dependencyFiles.zod))},configuration:{jitless:installedZod.config().jitless},execution:"installed interpreter"};
if (transportGuard.audit.installedZod.configuration.jitless !== true) throw new Error("Installed Zod interpreter configuration was not confirmed.");
transportGuard.mark("installed-zod-interpreter-configured");
const SourceLinkedDraftSection = load(${JSON.stringify(entry)}).default;
const {createOwnerLocalPersistence} = load(${JSON.stringify(persistence)});
const {DRAFT_REVISION_KEY,PROPOSAL_SNAPSHOT_KEY,HISTORY_KEY,INVOICE_KEY} = load(${JSON.stringify(constants)});
const {syntheticOwners,syntheticJobs,syntheticProfile,syntheticRevisions,syntheticProposalStudy,replaceSyntheticProposalSource,syntheticCommercial,syntheticExpected,legacySentinel,legacyInvoiceSentinel,internalMarkers} = load(${JSON.stringify(fixture)});
const studies = new Map(syntheticOwners.map(owner=>[owner,syntheticProposalStudy(owner)]));
const profiles = new Map(syntheticOwners.map(owner=>[owner,syntheticProfile(owner)]));
const initialRevisions = new Map(syntheticOwners.map(owner=>[owner,syntheticRevisions(owner)]));
const jobs = new Map(syntheticOwners.map(owner=>[owner,syntheticJobs(owner)]));
const records = new Map([[HISTORY_KEY,legacySentinel],[INVOICE_KEY,legacyInvoiceSentinel],...syntheticOwners.flatMap(owner=>{const prefix="jobestimatepro_owner:"+encodeURIComponent(owner)+":";return [[prefix+HISTORY_KEY,legacySentinel],[prefix+INVOICE_KEY,legacyInvoiceSentinel],[prefix+DRAFT_REVISION_KEY,JSON.stringify({schemaVersion:1,revisions:initialRevisions.get(owner)})]];})]);
const initialRevisionJson = new Map(syntheticOwners.flatMap(owner=>initialRevisions.get(owner).map(revision=>[revision.id,JSON.stringify(revision)])));
const pdfDownloads = [];
const originalCreateObjectURL = URL.createObjectURL.bind(URL);
URL.createObjectURL = blob => {
  const url=originalCreateObjectURL(blob);
  if (blob instanceof Blob && blob.type==="application/pdf") {
    const record={blobURL:url,type:blob.type,bytes:blob.size,base64:null,sha256:null,captureError:null};
    pdfDownloads.push(record);
    blob.arrayBuffer().then(async buffer=>{
      const bytes=new Uint8Array(buffer);
      let binary="";
      for(let offset=0;offset<bytes.length;offset+=32768) binary+=String.fromCharCode(...bytes.subarray(offset,offset+32768));
      record.base64=btoa(binary);
      const hash=await crypto.subtle.digest("SHA-256",bytes);
      record.sha256=[...new Uint8Array(hash)].map(value=>value.toString(16).padStart(2,"0")).join("");
      refresh();
    }).catch(error=>{record.captureError=String(error);refresh();});
  }
  return url;
};
let owner = syntheticOwners[0];
let sessionCurrent = true;
let unavailableStudy = false;
let storageFailure = "none";
let heldLock = "none";
let releaseHeldLock = null;
let refresh = () => {};
const events = [];
const storageEvents = [];
const syntheticDependencyMutations = [];
const syntheticStorage = {
  getItem(key) { storageEvents.push({operation:"get",key}); return records.get(key) ?? null; },
  setItem(key,value) {
    storageEvents.push({operation:"set",key,bytes:String(value).length,failure:storageFailure});
    if (storageFailure === "quota") throw new DOMException("Synthetic quota failure before write","QuotaExceededError");
    if (storageFailure === "readback") { queueMicrotask(refresh); return; }
    records.set(key,String(value)); queueMicrotask(refresh);
  },
  removeItem(key) { storageEvents.push({operation:"remove",key}); records.delete(key); queueMicrotask(refresh); },
};
const fetcher = async (input,init={}) => {
  const url = String(input), method = init.method || "GET";
  const event = {url,method,owner}; events.push(event); queueMicrotask(refresh);
  if (method !== "GET") {
    event.unexpected = true;
    return Response.json({code:"SYNTHETIC_OPERATION_FORBIDDEN",error:"No POST, provider, preparation, upload, generation or answer mutation is supplied by this fixture."},{status:409});
  }
  const retained = studies.get(owner);
  if (!sessionCurrent) return Response.json({code:"SYNTHETIC_SESSION_STALE",error:"Synthetic owner session revoked"},{status:401});
  if (url === "/api/plan-studies") return Response.json({studies:unavailableStudy ? [] : [structuredClone(retained)]});
  if (url === "/api/plan-studies/"+retained.id) return unavailableStudy
    ? Response.json({code:"SYNTHETIC_STUDY_UNAVAILABLE",error:"Synthetic source is unavailable"},{status:503})
    : Response.json({study:structuredClone(retained)});
  if (url.startsWith("/api/plan-studies/"+retained.id+"/evidence/")) return new Response("Synthetic unavailable PDF; renderer validation is outside this draft check.",{status:503});
  event.unexpected = true;
  return Response.json({code:"SYNTHETIC_OPERATION_FORBIDDEN",error:"Unexpected offline dependency request"},{status:409});
};
function snapshot() {
  const storedRecords = Object.fromEntries([...records].map(([key,value])=>{try{return [key,JSON.parse(value)]}catch{return [key,value]}}));
  return {synthetic:true,owner,sessionCurrent,unavailableStudy,storageFailure,heldLock,webLocksAvailable:Boolean(navigator.locks?.request),jobs:Object.fromEntries(jobs),profiles:Object.fromEntries(profiles),expectedTotals:syntheticExpected,internalMarkers,pdfDownloads,events,storageEvents,syntheticDependencyMutations,blockedBrowserTransport,cspViolations,browserErrors,transportGuard:transportGuard.audit,legacySentinelsIntact:records.get(HISTORY_KEY)===legacySentinel && records.get(INVOICE_KEY)===legacyInvoiceSentinel && syntheticOwners.every(id=>{const prefix="jobestimatepro_owner:"+encodeURIComponent(id)+":";return records.get(prefix+HISTORY_KEY)===legacySentinel && records.get(prefix+INVOICE_KEY)===legacyInvoiceSentinel;}),seededDraftRevisionsIntact:syntheticOwners.every(id=>{const key="jobestimatepro_owner:"+encodeURIComponent(id)+":"+DRAFT_REVISION_KEY;try{const current=JSON.parse(records.get(key));return initialRevisions.get(id).every(original=>{const saved=current.revisions.find(revision=>revision.id===original.id);return JSON.stringify(saved)===initialRevisionJson.get(original.id);});}catch{return false}}),storedRecords};
}
async function holdRealSaveLock(key) {
  if (heldLock!=="none" || !navigator.locks?.request) return;
  const capturedOwner=owner;
  heldLock="waiting: "+capturedOwner; refresh();
  try {
    await navigator.locks.request("jobestimatepro_owner:"+encodeURIComponent(capturedOwner)+":"+key,{mode:"exclusive"},()=>new Promise(resolve=>{
      releaseHeldLock=resolve; heldLock="held: "+capturedOwner; refresh();
    }));
  } finally { releaseHeldLock=null; heldLock="none"; refresh(); }
}
function Harness() {
  const [selectedOwner,setSelectedOwner] = React.useState(owner);
  const [generation,setGeneration] = React.useState(0);
  const [,redraw] = React.useState(0);
  refresh = () => redraw(value=>value+1);
  React.useEffect(()=>{transportGuard.mark("harness-mounted")},[]);
  const isCurrent = React.useMemo(()=>()=>sessionCurrent && owner===selectedOwner,[selectedOwner,generation]);
  const storage = React.useMemo(()=>createOwnerLocalPersistence(selectedOwner,isCurrent,syntheticStorage),[selectedOwner,isCurrent]);
  return React.createElement(React.Fragment,null,
    React.createElement("header",{style:{padding:16,background:"#eff6ff",border:"1px solid #93c5fd"}},
      React.createElement("h1",null,"Isolated offline customer proposal check"),
      React.createElement("p",null,"Actual saved-draft editor, customer-safe proposal workflow, renderers and checked local persistence. All profiles, jobs, sources, answers and stored estimates are authored synthetic data. PDF generation is the real local implementation; its real Blob download remains intact while a synthetic audit captures the produced bytes for inspection. No environment files, Auth, providers, uploads, preparation or hosted routes. Real browser Web Locks; synthetic memory storage never reads or writes browser localStorage."),
      React.createElement("label",null,"Synthetic owner ",React.createElement("select",{"aria-label":"Synthetic owner",value:selectedOwner,onChange:event=>{owner=event.target.value;sessionCurrent=true;unavailableStudy=false;setSelectedOwner(owner);setGeneration(value=>value+1)}},syntheticOwners.map(value=>React.createElement("option",{key:value,value},value)))),
      React.createElement("button",{type:"button",onClick:()=>{sessionCurrent=!sessionCurrent;refresh()}},sessionCurrent?"Revoke synthetic session":"Restore synthetic session"),
      React.createElement("button",{type:"button",onClick:()=>{jobs.set(owner,jobs.get(owner).filter(job=>job.id!==owner+"-job-1"));refresh()}},"Remove synthetic job 1"),
      React.createElement("button",{type:"button",onClick:()=>{jobs.set(owner,syntheticJobs(owner));refresh()}},"Restore synthetic jobs"),
      React.createElement("button",{type:"button",disabled:heldLock!=="none",onClick:()=>{void holdRealSaveLock(PROPOSAL_SNAPSHOT_KEY)}},"Hold proposal save Web Lock"),
      React.createElement("button",{type:"button",disabled:heldLock!=="none",onClick:()=>{void holdRealSaveLock(DRAFT_REVISION_KEY)}},"Hold draft save Web Lock"),
      React.createElement("button",{type:"button",disabled:!releaseHeldLock,onClick:()=>releaseHeldLock?.()},"Release real save Web Lock"),
      React.createElement("button",{type:"button",onClick:()=>{studies.set(owner,replaceSyntheticProposalSource(studies.get(owner)));refresh()}},"Replace synthetic study source"),
      React.createElement("button",{type:"button",onClick:()=>{const previous=profiles.get(owner);profiles.set(owner,{...previous,name:"Revised Synthetic Company - later profile edit",paymentTerms:"Revised synthetic terms for a later snapshot only."});syntheticDependencyMutations.push({control:"change-company-profile",owner});refresh()}},"Change synthetic company profile"),
      React.createElement("button",{type:"button",onClick:()=>{
        const next=structuredClone(studies.get(owner));
        const decision=next.decisions.find(item=>item.findingId===owner+"-synthesis-attempt:0" && item.status==="active");
        if (!decision) { syntheticDependencyMutations.push({control:"change-room101-answer",owner,outcome:"no current synthetic answer"}); refresh(); return; }
        const previousId=decision.id;
        decision.id=owner+"-answer-room101-revised";
        decision.answer="Synthetic revised Room 101 scope choice: upper walls require a separately reviewed contractor decision. This replacement answer approves neither quantity nor direct costs.";
        next.revision++;
        studies.set(owner,next);
        syntheticDependencyMutations.push({control:"change-room101-answer",owner,previousDecisionId:previousId,decisionId:decision.id,findingId:decision.findingId,sourceRevision:next.sourceRevision,studyRevision:next.revision});
        refresh();
      }},"Change synthetic Room 101 answer"),
      React.createElement("button",{type:"button",onClick:()=>{studies.set(owner,syntheticProposalStudy(owner));unavailableStudy=false;refresh()}},"Restore synthetic original study"),
      React.createElement("label",null,React.createElement("input",{type:"checkbox","aria-label":"Synthetic study unavailable",checked:unavailableStudy,onChange:event=>{unavailableStudy=event.target.checked;refresh()}})," Study unavailable"),
      React.createElement("label",null,"Synthetic storage failure ",React.createElement("select",{"aria-label":"Synthetic storage failure",value:storageFailure,onChange:event=>{storageFailure=event.target.value;refresh()}},["none","quota","readback"].map(value=>React.createElement("option",{key:value,value},value)))),
      React.createElement("button",{type:"button",onClick:()=>setGeneration(value=>value+1)},"Remount editor; retain synthetic storage"),
      React.createElement("button",{type:"button",onClick:refresh},"Refresh synthetic snapshot"),
      React.createElement("p",{"data-qa-state":true},"Session current: "+sessionCurrent+"; source revision: "+studies.get(owner).sourceRevision+"; real Web Locks available: "+Boolean(navigator.locks?.request)+"; save lock: "+heldLock+". Source controls mutate synthetic dependency data only; use the actual editor’s freshness/reopen controls to observe it.")),
    React.createElement(SourceLinkedDraftSection,{key:selectedOwner+":"+generation,ownerId:selectedOwner,ownerKey:selectedOwner+":"+generation,jobs:jobs.get(selectedOwner),storage,isCurrent,fetcher,defaults:syntheticCommercial,companyProfile:profiles.get(selectedOwner)}),
    React.createElement("details",{style:{marginTop:20}},React.createElement("summary",null,"Synthetic saved records and request audit"),React.createElement("pre",{"data-qa-snapshot":true,style:{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}},JSON.stringify(snapshot(),null,2))));
}
window.addEventListener("source-linked-draft-transport-audit",()=>refresh());
createRoot(document.getElementById("root")).render(React.createElement(Harness));
`
  // A single-line metadata replacement preserves the generated script's line
  // numbers. CSP sourceFile/lineNumber can identify the exact installed module
  // without guessing from an earlier run or requiring eval/source-map transport.
  const lines = javascript.split("\n")
  moduleLineRanges = lines.flatMap((line, index) => {
    if (!line.startsWith("// QA_MODULE ")) return []
    const moduleId = JSON.parse(line.slice("// QA_MODULE ".length))
    const emittedSourceFirstLine = index + 3
    return [{ moduleId, firstLine: index + 1, emittedSourceFirstLine,
      lastLine: emittedSourceFirstLine + modules.get(moduleId).code.split("\n").length }]
  })
  return javascript.replace("transportGuard.audit.moduleLineRanges = [];", `transportGuard.audit.moduleLineRanges = ${JSON.stringify(moduleLineRanges)};`)
}

const server = http.createServer((request, response) => {
  response.setHeader("Cache-Control", "no-store")
  response.setHeader("Content-Security-Policy", contentSecurityPolicy)
  if (request.method !== "GET") { response.writeHead(405); response.end(); return }
  if (request.url === "/") {
    response.setHeader("Content-Type", "text/html; charset=utf-8")
    response.end('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline customer proposal</title><link rel="icon" href="data:,"><script src="/transport-guard.js"></script></head><body style="font-family:Arial,sans-serif;margin:20px;color:#0f172a"><main id="root"></main><script src="/fixture.js" defer></script></body></html>')
    return
  }
  if (request.url === "/transport-guard.js") {
    response.setHeader("Content-Type", "application/javascript; charset=utf-8")
    response.end(earlyTransportGuard())
    return
  }
  if (request.url === "/fixture.js") {
    try { response.setHeader("Content-Type", "application/javascript; charset=utf-8"); response.end(bundle()) }
    catch (error) { console.error(error); response.writeHead(500); response.end("Offline fixture could not load local modules.") }
    return
  }
  if (request.url === "/__qa/transport") {
    response.setHeader("Content-Type", "application/json")
    response.end(JSON.stringify({blockedNodeConnections:blockedNodeAttempts.length,blockedNodeAttempts,externalTransport:"blocked",environmentFilesRead:false,contentSecurityPolicy,dependencies:"authored synthetic profiles/estimates/Study fetcher and memory storage; real proposal components, renderers, calculations, Blob downloads and Web Locks"}))
    return
  }
  if (request.url === "/__qa/module-lines") {
    response.setHeader("Content-Type", "application/json")
    response.end(JSON.stringify({ script: "/fixture.js", moduleLineRanges }))
    return
  }
  response.writeHead(404); response.end()
})
server.listen(port, "127.0.0.1", () => console.log(`Isolated customer proposal fixture: http://127.0.0.1:${server.address().port}/`))
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => server.close(() => process.exit(0)))
