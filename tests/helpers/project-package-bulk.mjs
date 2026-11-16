/** Real loopback TUS/filesystem workload against project-workflow-local.mjs.
 * Explicit synthetic owner adapter; never use hosted/customer service endpoints.
 * Run with the existing TS loader and an external-transport guard.
 */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import { randomUUID } from 'node:crypto';
import { createProjectLibraryClient, projectFileHash, runProjectQueue } from '../../app/lib/project-library/client.ts';
import { mimeForName } from '../../app/lib/project-library/validation.ts';
const scratch=path.resolve(process.argv[2]||''),folder=path.join(scratch,'package'),base=fs.readFileSync(scratch+'/local-service-url.txt','utf8').trim(),owner='synthetic-project-owner-a',project='synthetic-project-1';
const transport=(input,init={})=>fetch(new URL(String(input),base),{...init,headers:{...Object.fromEntries(new Headers(init.headers)),authorization:'Bearer '+owner}});
let client=createProjectLibraryClient(transport,project,()=>true,transport);const initial=JSON.parse(fs.readFileSync(scratch+'/package-manifest.json','utf8'));
const records=[],failures=[];let peakRss=process.memoryUsage().rss,uploadsActive=0,maxUploads=0;const started=performance.now();
const sample=setInterval(()=>{peakRss=Math.max(peakRss,process.memoryUsage().rss)},250);
function blob(file){return new Blob([fs.readFileSync(file)],{type:mimeForName(file)||'application/octet-stream'})}
async function register(file,relativePath){const data=blob(file);const sha=await projectFileHash(data);const registered=await client.register({name:path.basename(relativePath),relativePath,size:data.size,sha256:sha,mimeType:data.type,selectionId:randomUUID()});return {data,record:registered.file};}
try{
 assert.equal((await client.list()).inventory.files.length,0,"Use a fresh isolated service namespace/project; previous originals were preserved.");
 // Additional full-size PNG exercises a durable 6MiB partial transfer and real HEAD resume.
 const resumePath=path.join(scratch,'resume-photo.png');
 const {data:resumeData,record:resumeRecord}=await register(resumePath,'Recovery/Resumable original.png');
 assert.ok(resumeData.size>6*1024*1024);
 await transport('/__qa/interrupt-next',{method:'POST'});
 let interrupted=false;try{await client.upload(resumeData,resumeRecord)}catch(error){interrupted=true;failures.push({path:'Recovery/Resumable original.png',expected:true,message:String(error)})}assert.equal(interrupted,true);
 const paused=(await client.list()).inventory.files.find(file=>file.id===resumeRecord.id);assert.equal(paused.status,'uploading');assert.ok(paused.uploadUrl);
 // New client and reread bytes simulate reselecting the same original after interruption.
 client=createProjectLibraryClient(transport,project,()=>true,transport);const before=await(await transport('/__qa/metrics')).json();
 await client.upload(blob(resumePath),paused);const after=await(await transport('/__qa/metrics')).json();assert.equal(after.tusHeads,before.tusHeads+1);assert.equal(after.receivedBytes-before.receivedBytes,resumeData.size-6*1024*1024);
 const transferStart=performance.now();
 await runProjectQueue(initial.files,3,async(entry)=>{uploadsActive++;maxUploads=Math.max(maxUploads,uploadsActive);try{const original=path.join(folder,entry.path);const {data,record}=await register(original,entry.path);await client.upload(data,record);records.push({id:record.id,path:entry.path,sha256:entry.sha256,size:entry.bytes});if(records.length%50===0)console.log('Transferred '+records.length+'/'+initial.files.length)}catch(error){failures.push({path:entry.path,expected:false,message:String(error)})}finally{uploadsActive--}});
 assert.equal(failures.filter(f=>!f.expected).length,0,JSON.stringify(failures));
 let inventory=(await client.list()).inventory;assert.equal(inventory.files.length,initial.fileCount+1);assert.ok(inventory.files.every(file=>file.status==='uploaded'));
 const uploadElapsed=performance.now()-transferStart;
 // Exact duplicate bytes remain a separate source record, not a destructive dedupe.
 const copy=await register(path.join(folder,initial.files.find(f=>f.path.endsWith('.jpg')).path),'Copies/Distinct source record.jpg');await client.upload(copy.data,copy.record);assert.ok(copy.record.duplicateOfId);
 // Re-register a changed document path: both old and new immutable source versions remain.
 const originalText=path.join(folder,'Supporting/GC request.txt');const changed=new Blob([fs.readFileSync(originalText),'\nSYNTHETIC REVISION 2: clarified request, agreement still not inferred.\n'],{type:'text/plain'});
 const versioned=await client.register({name:'GC request.txt',relativePath:'Supporting/GC request.txt',size:changed.size,sha256:await projectFileHash(changed),mimeType:'text/plain',selectionId:randomUUID()});await client.upload(changed,versioned.file);assert.equal(versioned.file.sourceVersion,2);assert.ok(versioned.file.replacesId);
 inventory=(await client.list()).inventory;
 const prepStart=performance.now();let preparedCalls=0;
 for(const original of inventory.files){if(!original.active)continue;let file=original;while(!['prepared','failed','unsupported'].includes(file.preparation)){const result=await client.prepare(file.id);preparedCalls++;file=result.inventory.files.find(f=>f.id===file.id)}if(preparedCalls%50===0)console.log('Prepared file/page calls '+preparedCalls)}
 inventory=(await client.list()).inventory;
 assert.equal(inventory.files.filter(file=>file.mimeType.startsWith('image/')&&file.active&&file.preparation==='prepared').length,initial.imageCount+2);
 assert.ok(inventory.files.some(file=>file.name==='Malformed.pdf'&&file.preparation==='failed'));
 assert.ok(inventory.files.some(file=>file.name==='Unsupported.dwg'&&file.preparation==='unsupported'));
 assert.ok(inventory.files.every(file=>file.pages.length===0),'Inventory responses contain summaries, not extracted page text.');
 let pendingVisualImages=0;
 for(const file of inventory.files.filter(file=>file.mimeType.startsWith('image/'))){const source=await client.source(file.id);assert.ok(source.file.pages.length===1);assert.ok(source.file.pages.every(page=>page.review==='pending'&&page.text===''&&page.contentLoaded===false));pendingVisualImages++;}
 const preparedTextCharacters=inventory.files.reduce((sum,file)=>sum+(file.pageStats?.textCharacters||0),0);
 const dense=inventory.files.find(file=>file.relativePath.includes('Dense retained text/'));
 if(dense){assert.ok(preparedTextCharacters>3*1024**2,'Dense workload must actually exceed the removed aggregate ceiling.');const content=await client.content(dense.id,1);assert.equal(content.page.text,fs.readFileSync(path.join(folder,dense.relativePath),'utf8'));assert.equal(content.sourceSha256,dense.sha256);}
 const other=(input,init={})=>fetch(new URL(String(input),base),{...init,headers:{'Content-Type':'application/json',authorization:'Bearer synthetic-project-owner-b'}});
 const foreign=await other('/api/projects/'+project+'/files',{method:'POST',body:JSON.stringify({action:'download',fileId:resumeRecord.id})});assert.equal(foreign.status,404);
 const traversal=await transport('/api/projects/'+project+'/files',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'register',file:{name:'bad.txt',relativePath:'../bad.txt',size:1,sha256:'0'.repeat(64),selectionId:'invalid-path'}})});assert.equal(traversal.status,400);
 const metrics=await(await transport('/__qa/metrics')).json();
 const report={synthetic:true,realHttpTransfers:true,productionClientAndHandlers:true,filesystemOriginals:true,notHostedCapacityProof:true,initialPackage:{files:initial.fileCount,images:initial.imageCount,bytes:initial.bytes,pdfPages:initial.pdfPages,imageDimensions:[...new Set(initial.files.filter(x=>x.width).map(x=>x.width+'x'+x.height))]},retained:{records:inventory.files.length,bytes:inventory.files.reduce((n,f)=>n+f.size,0),uploaded:inventory.files.filter(f=>f.status==='uploaded').length,prepared:inventory.files.filter(f=>f.preparation==='prepared').length,failed:inventory.files.filter(f=>f.preparation==='failed').map(f=>({path:f.relativePath,issue:f.issue})),unsupported:inventory.files.filter(f=>f.preparation==='unsupported').map(f=>({path:f.relativePath,issue:f.issue})),pdfPages:inventory.files.filter(f=>f.mimeType==='application/pdf').reduce((n,f)=>n+(f.pageCount||0),0),pendingVisualImages,preparedTextCharacters,inventoryIsSummaryOnly:true},timing:{uploadSeconds:uploadElapsed/1000,preparationSeconds:(performance.now()-prepStart)/1000,totalSeconds:(performance.now()-started)/1000},interruptionRecoveredFromConfirmedOffset:true,duplicateRecordPreserved:true,sourceVersionRetained:true,foreignOwnerRejected:true,traversalRejected:true,maxConcurrentUploads:maxUploads,peakClientRss:peakRss,clientCpuUsageMicros:process.cpuUsage(),clientResourceUsage:process.resourceUsage(),preparedCalls,failures,metrics};
 fs.writeFileSync(scratch+'/bulk-result.json',JSON.stringify(report,null,2)+'\n');fs.writeFileSync(scratch+'/final-inventory.json',JSON.stringify(inventory,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}catch(error){fs.writeFileSync(scratch+'/bulk-failure.json',JSON.stringify({error:String(error),failures,records},null,2));throw error}finally{clearInterval(sample)}
