/** Actual-component local project intake test service. Synthetic identities only.
 * node --experimental-strip-types --loader ./scripts/ts-extensionless-loader.mjs tests/helpers/project-workflow-local.mjs <scratch-root> [port]
 * Real TUS HTTP transfers and filesystem original/metadata retention; production metadata handlers.
 * No environment files, hosted account, Auth client execution, AI or paid services.
 */
import http from "node:http"
import net from "node:net"
import fs from "node:fs"
import path from "node:path"
import { createHash, createHmac, randomUUID } from "node:crypto"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"
import ts from "typescript"
import { createProjectLibraryHandlers } from "../../app/lib/project-library/handlers.ts"
import { emptyInventory } from "../../app/lib/project-library/service.ts"
import { ProjectLibraryError, PROJECT_LIMITS } from "../../app/lib/project-library/types.ts"
const localRequire=createRequire(import.meta.url)
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..")
const scratch=path.resolve(process.argv[2]||"")
if(!scratch.startsWith("/private/tmp/jobestimate-full-workflow-"))throw Error("Use the task's isolated scratch directory.")
const namespace=process.argv[4]||"local-service";if(!/^[a-z0-9-]+$/.test(namespace))throw Error("Invalid isolated service namespace");
const storeRoot=path.join(scratch,namespace);fs.mkdirSync(storeRoot,{recursive:true})
const port=Number(process.argv[3]||0)
const fixtureOwners=["synthetic-project-owner-a","synthetic-project-owner-b"]
const secret=randomUUID()
const metrics={synthetic:true,realFilesystemTransfers:true,receivedBytes:0,metadataRequests:0,tusPosts:0,tusPatches:0,tusHeads:0,interruptions:0,requests:0,peakRss:process.memoryUsage().rss,activeTransfers:0,maxTransfers:0,processingRequests:0,transportAttempts:[],startedAt:new Date().toISOString()}
const sessionsPath=path.join(storeRoot,"sessions.json");const sessions=new Map(fs.existsSync(sessionsPath)?JSON.parse(fs.readFileSync(sessionsPath,"utf8")):[]);const persistSessions=()=>{fs.writeFileSync(sessionsPath+".tmp",JSON.stringify([...sessions]));fs.renameSync(sessionsPath+".tmp",sessionsPath)};let origin="";let interruptNext=false
net.Socket.prototype.connect=function(){metrics.transportAttempts.push({api:"outgoing socket"});throw Error("Local service blocks all outgoing connections")}
const contentSecurityPolicy="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; worker-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'"
const sha=value=>createHash("sha256").update(value).digest("hex")
const objectPath=key=>path.join(storeRoot,sha(key)+".original")
const inventoryPath=(owner,project)=>path.join(storeRoot,sha(owner+":"+project)+".inventory.json")
const signature=key=>createHmac("sha256",secret).update(key).digest("hex")
const store={
 async ready(){},
 async get(ownerId,projectId){const file=inventoryPath(ownerId,projectId);return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,"utf8")):emptyInventory(ownerId,projectId)},
 async save(ownerId,inventory,expected){const currentFile=inventoryPath(ownerId,inventory.projectId);const current=fs.existsSync(currentFile)?JSON.parse(fs.readFileSync(currentFile,"utf8")):emptyInventory(ownerId,inventory.projectId);if(current.revision!==expected)throw new ProjectLibraryError(409,"PROJECT_CHANGED","Project inventory changed; retry individual operation.");if(inventory.ownerId!==ownerId)throw Error("foreignowner");const next={...inventory,revision:expected+1};const file=inventoryPath(ownerId,inventory.projectId);fs.writeFileSync(file+".tmp",JSON.stringify(next));fs.renameSync(file+".tmp",file);return structuredClone(next)},
 async ticket(ownerId,file){if(file.ownerId!==ownerId)throw Error("foreignowner");return{endpoint:origin+"/storage/tus",headers:{"x-signature":signature(file.objectKey)},bucket:"synthetic-private-projects",objectKey:file.objectKey,chunkBytes:PROJECT_LIMITS.chunkBytes}},
 async download(ownerId,file){if(file.ownerId!==ownerId)throw Error("foreignowner");return new Uint8Array(fs.readFileSync(objectPath(file.objectKey)))},
 async signedDownload(ownerId,file){if(file.ownerId!==ownerId)throw Error("foreignowner");return origin+"/storage/original/"+encodeURIComponent(file.objectKey)+"?signature="+signature(file.objectKey)},
 async putProcessing(ownerId,file,bytes){if(file.ownerId!==ownerId)throw Error("foreignowner");const key=file.objectKey+".processing.jpg";fs.writeFileSync(objectPath(key),bytes);return key}
}
const auth={async getUser(token){return{data:{user:fixtureOwners.includes(token)?{id:token,email:token+"@example.test",email_confirmed_at:"2026-11-15",is_anonymous:false,role:"authenticated"}:null},error:null}}}
const handlers=createProjectLibraryHandlers({store,auth})
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
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href);
    if (url.origin !== location.origin || !["/api/projects/","/storage/","/__qa/"].some(prefix=>url.pathname.startsWith(prefix))) return denied("fetch", url.href);
    return nativeFetch(input, init);
  };
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

const dependencyFiles={react:"node_modules/react/cjs/react.development.js","react/jsx-runtime":"node_modules/react/cjs/react-jsx-runtime.development.js","react-dom":"node_modules/react-dom/cjs/react-dom.development.js","react-dom/client":"node_modules/react-dom/cjs/react-dom-client.development.js",scheduler:"node_modules/scheduler/cjs/scheduler.development.js",zod:path.relative(root,localRequire.resolve("zod")),"pdf-lib":path.relative(root,localRequire.resolve("pdf-lib")),tslib:path.relative(root,localRequire.resolve("tslib")),"@pdf-lib/standard-fonts":path.relative(root,localRequire.resolve("@pdf-lib/standard-fonts")),"@pdf-lib/upng":path.relative(root,localRequire.resolve("@pdf-lib/upng")),pako:path.relative(root,localRequire.resolve("pako")),fflate:"node_modules/fflate/lib/browser.cjs"}
function resolveModule(specifier,from){if(dependencyFiles[specifier])return path.join(root,dependencyFiles[specifier]);if(specifier==="pdfjs-dist")return null;if(!specifier.startsWith("."))throw Error("Unapproved browser module: "+specifier);const base=path.resolve(path.dirname(from),specifier);const found=[base,base+".ts",base+".tsx",base+".js",base+".cjs",base+".json",path.join(base,"index.js"),path.join(base,"index.cjs")].find(file=>fs.existsSync(file)&&fs.statSync(file).isFile());if(!found||!found.startsWith(root+"/"))throw Error("Unavailable local module "+specifier);return found}
function bundle(){
 const modules=new Map();function include(filename){if(modules.has(filename))return;const source=fs.readFileSync(filename,"utf8");const code=filename.endsWith(".json")?"module.exports="+source:"/"===filename[0]&&/\.tsx?$/.test(filename)?ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},fileName:filename}).outputText:source;const deps={};modules.set(filename,{code,deps});for(const match of code.matchAll(/\brequire\(["']([^"']+)["']\)/g)){const dependency=resolveModule(match[1],filename);deps[match[1]]=dependency;if(dependency)include(dependency)}}
 const entry=path.join(root,"app/app/components/ProjectWorkflowSection.tsx"),persist=path.join(root,"app/app/lib/local-persistence.ts"),react=path.join(root,dependencyFiles.react),client=path.join(root,dependencyFiles["react-dom/client"]),validator=path.join(root,dependencyFiles.zod);for(const file of[entry,persist,react,client,validator])include(file);
 return `"use strict";const modules={${[...modules].map(([id,{code,deps}])=>JSON.stringify(id)+":{deps:"+JSON.stringify(deps)+",run:function(module,exports,require,process){\n"+code+"\n}}").join(",\n")}};const cache={};function load(id){if(!id||!modules[id])throw Error("Unavailable synthetic module");if(cache[id])return cache[id].exports;const module=cache[id]={exports:{}};const def=modules[id];def.run(module,module.exports,key=>load(def.deps[key]),{env:{NODE_ENV:"development"}});return module.exports;}
 const React=load(${JSON.stringify(react)}),{createRoot}=load(${JSON.stringify(client)});load(${JSON.stringify(validator)}).config({jitless:true});
 const Workspace=load(${JSON.stringify(entry)}).default,{createOwnerLocalPersistence}=load(${JSON.stringify(persist)});
 const records=new Map(),downloads=[],nativeURL=URL.createObjectURL.bind(URL);let refresh=()=>{};
 URL.createObjectURL=blob=>{const url=nativeURL(blob);if(blob.type==="application/pdf"){const record={bytes:blob.size,base64:null};downloads.push(record);blob.arrayBuffer().then(buffer=>{let text="";const bytes=new Uint8Array(buffer);for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));record.base64=btoa(text);refresh()})}return url};
 let currentOwner="synthetic-project-owner-a",sessionCurrent=true;
 const storage={getItem:key=>records.get(key)??null,setItem:(key,value)=>{records.set(key,String(value));queueMicrotask(refresh)},removeItem:key=>records.delete(key)};
 function Harness(){const[owner,setOwner]=React.useState(currentOwner),[project,setProject]=React.useState("synthetic-project-1"),[jobs,setJobs]=React.useState([{id:"synthetic-project-1",jobName:"Synthetic construction bid",clientName:"Synthetic GC",jobAddress:"Synthetic location",createdAt:1}]);const[,redraw]=React.useState(0);refresh=()=>redraw(value=>value+1);const guard=React.useMemo(()=>()=>sessionCurrent&&currentOwner===owner,[owner]);const persistence=React.useMemo(()=>createOwnerLocalPersistence(owner,guard,storage),[owner,guard]);const fetcher=React.useCallback((input,init={})=>fetch(input,{...init,headers:{...Object.fromEntries(new Headers(init.headers)),authorization:"Bearer "+owner}}),[owner]);return React.createElement(React.Fragment,null,React.createElement("h1",null,"Synthetic full-project workflow QA"),React.createElement("p",null,"Real loopback transfers and filesystem originals; production handlers/components. Synthetic identity adapter and memory estimate storage. No hosted Auth, provider or customer data."),React.createElement("button",{onClick:()=>{currentOwner=owner.endsWith("a")?"synthetic-project-owner-b":"synthetic-project-owner-a";setOwner(currentOwner)}},"Switch synthetic owner"),React.createElement("button",{onClick:()=>{sessionCurrent=!sessionCurrent;refresh()}},"Toggle synthetic session"),React.createElement(Workspace,{key:owner,ownerId:owner,ownerKey:owner,jobs,selectedProjectId:project,onProjectChange:setProject,onProjectsChange:setJobs,storage:persistence,isCurrent:guard,fetcher,defaults:{markupPct:20,taxEnabled:true,taxRate:8,depositEnabled:true,depositType:"percent",depositValue:25},companyProfile:{name:"Synthetic construction company",address:"Synthetic address",phone:"555-0100",email:"qa@example.test",license:"SYNTHETIC",paymentTerms:""},onOpenLegacyChangeOrder:()=>{throw Error("Legacy unsafe output was not supplied to synthetic QA")}}),React.createElement("details",null,React.createElement("summary",null,"Synthetic record audit"),React.createElement("pre",{"data-workflow-audit":true},JSON.stringify({synthetic:true,owner,records:Object.fromEntries([...records].map(([key,value])=>{try{return[key,JSON.parse(value)]}catch{return[key,value]}})),downloads,transport:window.__sourceLinkedDraftTransportGuard.audit},null,2))))}
 createRoot(document.getElementById("root")).render(React.createElement(Harness));`;
}
async function bytes(req,limit){const chunks=[];let count=0;for await(const chunk of req){count+=chunk.length;if(count>limit)throw Error("Request limit");chunks.push(chunk)}return Buffer.concat(chunks)}
const server=http.createServer(async(req,res)=>{
 metrics.requests++;metrics.peakRss=Math.max(metrics.peakRss,process.memoryUsage().rss);
 res.setHeader("Cache-Control","no-store");res.setHeader("Content-Security-Policy",contentSecurityPolicy);
 try{
 const url=new URL(req.url,origin);
 if(req.method==="GET"&&url.pathname==="/"){res.setHeader("Content-Type","text/html; charset=utf-8");res.end('<!doctype html><html><head><meta charset="utf-8"><title>Synthetic full project</title><link rel="icon" href="data:,"><script src="/guard.js"></script></head><body style="font-family:Arial;margin:20px;color:#102a48"><main id="root"></main><script src="/fixture.js" defer></script></body></html>');return}
 if(req.method==="GET"&&url.pathname==="/guard.js"){res.setHeader("Content-Type","application/javascript");res.end(earlyTransportGuard());return}
 if(req.method==="GET"&&url.pathname==="/fixture.js"){res.setHeader("Content-Type","application/javascript");res.end(bundle());return}
 if(url.pathname==="/__qa/metrics"){res.setHeader("Content-Type","application/json");res.end(JSON.stringify({...metrics,rss:process.memoryUsage().rss,cpuUsageMicros:process.cpuUsage(),resourceUsage:process.resourceUsage(),inventoryFiles:fs.readdirSync(storeRoot).filter(file=>file.endsWith(".inventory.json")).length}));return}
 if(req.method==="POST"&&url.pathname==="/__qa/interrupt-next"){interruptNext=true;res.end("armed");return}
 const api=/^\/api\/projects\/([^/]+)\/files$/.exec(url.pathname);
 if(api){metrics.metadataRequests++;const body=req.method==="GET"?undefined:await bytes(req,16000);if(body?.includes(Buffer.from('"prepare"')))metrics.processingRequests++;const request=new Request(origin+req.url,{method:req.method,headers:req.headers,...(body?{body}: {})});const response=await handlers.files(request,decodeURIComponent(api[1]));res.statusCode=response.status;response.headers.forEach((value,key)=>res.setHeader(key,value));res.end(Buffer.from(await response.arrayBuffer()));return}
 if(url.pathname==="/storage/tus"&&req.method==="POST"){
 const metadata=Object.fromEntries(String(req.headers["upload-metadata"]||"").split(",").map(part=>{const[k,v]=part.trim().split(" ");return[k,Buffer.from(v||"","base64").toString("utf8")]}));const key=metadata.objectName;
 if(!key||req.headers["x-signature"]!==signature(key)||metadata.bucketName!=="synthetic-private-projects"){res.writeHead(403);res.end();return}
 const size=Number(req.headers["upload-length"]);if(!Number.isSafeInteger(size)||size<1||size>PROJECT_LIMITS.maxFileBytes){res.writeHead(413);res.end();return}
 if(fs.existsSync(objectPath(key))){res.writeHead(409);res.end("Retained original or partial session exists; resume it instead.");return}
 const id=randomUUID(),session={id,key,size,offset:0};fs.writeFileSync(objectPath(key),Buffer.alloc(0),{flag:"wx"});sessions.set(id,session);persistSessions();metrics.tusPosts++;res.writeHead(201,{Location:origin+"/storage/tus/"+id,"Tus-Resumable":"1.0.0"});res.end();return}
 const match=/^\/storage\/tus\/([a-z0-9-]+)$/.exec(url.pathname);
 if(match){const session=sessions.get(match[1]);if(!session){res.writeHead(404);res.end();return}if(req.headers["x-signature"]!==signature(session.key)){res.writeHead(403);res.end();return}if(req.method==="HEAD"){metrics.tusHeads++;res.writeHead(200,{"Upload-Offset":String(session.offset),"Tus-Resumable":"1.0.0"});res.end();return}if(req.method==="PATCH"){
 metrics.activeTransfers++;metrics.maxTransfers=Math.max(metrics.maxTransfers,metrics.activeTransfers);try{const data=await bytes(req,PROJECT_LIMITS.chunkBytes);if(Number(req.headers["upload-offset"])!==session.offset||session.offset+data.length>session.size){res.writeHead(409);res.end();return}fs.appendFileSync(objectPath(session.key),data);session.offset+=data.length;persistSessions();metrics.receivedBytes+=data.length;metrics.tusPatches++;if(interruptNext&&session.offset<session.size){interruptNext=false;metrics.interruptions++;res.writeHead(503);res.end("Synthetic interruption after durable offset");return}res.writeHead(204,{"Upload-Offset":String(session.offset),"Tus-Resumable":"1.0.0"});res.end();return}finally{metrics.activeTransfers--}}
 }
 if(url.pathname.startsWith("/storage/original/")&&req.method==="GET"){const key=decodeURIComponent(url.pathname.slice("/storage/original/".length));if(url.searchParams.get("signature")!==signature(key)){res.writeHead(403);res.end();return}fs.createReadStream(objectPath(key)).pipe(res);return}
 res.writeHead(404);res.end();
 }catch(error){res.writeHead(500,{"Content-Type":"application/json"});res.end(JSON.stringify({error:String(error)}))}
});
server.listen(port,"127.0.0.1",()=>{origin="http://127.0.0.1:"+server.address().port;fs.writeFileSync(path.join(scratch,"local-service-url.txt"),origin);console.log(origin)})
for(const signal of["SIGINT","SIGTERM"])process.once(signal,()=>server.close(()=>{fs.writeFileSync(path.join(scratch,"local-service-metrics.json"),JSON.stringify(metrics,null,2));process.exit(0)}))
