/** Synthetic durable allowance/attempt ledger for isolated local HTTP QA only. */
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { ANALYSIS_LIMITS, ProjectAnalysisError } from '../../../app/lib/project-analysis/types.ts'
import { publicAnalysis } from '../../../app/lib/project-analysis/store.ts'
import { readLocalProjectFileMetadata } from './local-library-store.mjs'
const clone=value=>structuredClone(value)
export function createLocalAnalysisStore(storeRoot){
 const root=path.resolve(storeRoot);if(!root.startsWith('/private/tmp/jobestimate-full-workflow-'))throw Error('Synthetic analysis ledger requires its isolated scratch directory.');fs.mkdirSync(root,{recursive:true});const file=path.join(root,'synthetic-analysis-ledger.json')
 const read=()=>fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{schemaVersion:1,owners:{},records:[]}
 const write=value=>{const temp=file+'.'+randomUUID()+'.tmp';fs.writeFileSync(temp,JSON.stringify(value),{flag:'wx',mode:0o600});fs.renameSync(temp,file)}
 const allowance=(value,owner)=>value.owners[owner]??(value.owners[owner]={synthetic:true,closed:false,maxAttempts:20,maxInputTokens:2_000_000,maxOutputTokens:100_000,usedAttempts:0,reservedAttempts:0,usedInputTokens:0,reservedInputTokens:0,usedOutputTokens:0,reservedOutputTokens:0})
 const sourceCurrent=(owner,project,sources)=>sources.every(source=>{const f=readLocalProjectFileMetadata(root,owner,project,source.fileId);return f&&f.ownerId===owner&&f.projectId===project&&f.active&&f.status==='uploaded'&&f.sourceVersion===source.sourceVersion&&f.sha256===source.sourceSha256})
 const record=(value,owner,project,id)=>{const item=value.records.find(row=>row.ownerId===owner&&row.projectId===project&&row.id===id);if(!item)throw new ProjectAnalysisError(404,'ANALYSIS_NOT_FOUND','This synthetic analysis is unavailable for this owner and project.');return item}
 return {
  async ready(){},
  async list(owner,project,cursor){const value=read(),before=cursor===undefined?Infinity:Number(cursor);if(!(before===Infinity||Number.isSafeInteger(before)&&before>0))throw new ProjectAnalysisError(400,'ANALYSIS_CURSOR_INVALID','Invalid synthetic history cursor.');const rows=value.records.filter(row=>row.ownerId===owner&&row.projectId===project&&row.sequence<before).sort((a,b)=>b.sequence-a.sequence).slice(0,ANALYSIS_LIMITS.recordsPerPage);return {analyses:rows.map(({sequence,...item})=>{void sequence;return publicAnalysis(item)}),nextCursor:rows.length===ANALYSIS_LIMITS.recordsPerPage?String(rows.at(-1).sequence):null}},
  async get(owner,project,id){const {sequence,...item}=record(read(),owner,project,id);void sequence;return publicAnalysis(item)},
  async latest(owner,project,fingerprint){const rows=read().records.filter(row=>row.ownerId===owner&&row.projectId===project&&row.fingerprint===fingerprint).sort((a,b)=>b.attemptNumber-a.attemptNumber);if(!rows.length)return null;const {sequence,...item}=rows[0];void sequence;return publicAnalysis(item)},
  async claim(owner,project,spec){
   const value=read();if(!sourceCurrent(owner,project,spec.sourceVersions))throw new ProjectAnalysisError(409,'ANALYSIS_SOURCE_CHANGED','A selected synthetic source changed.');const prior=value.records.filter(row=>row.ownerId===owner&&row.projectId===project&&row.fingerprint===spec.fingerprint).sort((a,b)=>b.attemptNumber-a.attemptNumber)[0];
   if(prior&&(prior.status!=='failed'||!spec.retryFailed)){const {sequence,...attempt}=prior;void sequence;return {attempt:clone(attempt),acquired:false}}
   const ordinal=(prior?.attemptNumber||0)+1;if(ordinal>ANALYSIS_LIMITS.attemptsPerFingerprint)throw new ProjectAnalysisError(409,'ANALYSIS_RETRY_LIMIT','The exact synthetic batch reached its retry limit.');const pool=allowance(value,owner);
   if(value.records.some(row=>row.ownerId===owner&&['running','unknown'].includes(row.status))||pool.reservedAttempts)throw new ProjectAnalysisError(409,'ANALYSIS_RECONCILIATION_REQUIRED','A synthetic attempt is running/unknown; its reservation remains held.');
   if(pool.closed||spec.reservation.inputTokens!==200000||spec.reservation.outputTokens!==6000||pool.usedAttempts+1>pool.maxAttempts||pool.usedInputTokens+200000>pool.maxInputTokens||pool.usedOutputTokens+6000>pool.maxOutputTokens)throw new ProjectAnalysisError(403,'ANALYSIS_ALLOWANCE_UNAVAILABLE','Synthetic allowance is closed or insufficient; no provider attempt was made.');
   pool.reservedAttempts++;pool.reservedInputTokens+=200000;pool.reservedOutputTokens+=6000;
   const attempt={id:randomUUID(),ownerId:owner,projectId:project,fingerprint:spec.fingerprint,attemptNumber:ordinal,sourceVersions:clone(spec.sourceVersions),status:'running',createdAt:new Date().toISOString(),leaseExpiresAt:new Date(Date.now()+300000).toISOString(),modelLabel:spec.modelLabel,resultIdentity:null,result:null,claimToken:randomUUID(),reservation:clone(spec.reservation)};
   value.records.push({...attempt,sequence:value.records.length+1});write(value);return {attempt:clone(attempt),acquired:true}
  },
  async complete(owner,project,attempt,completion){
   const value=read(),item=record(value,owner,project,attempt.id);if(item.claimToken!==attempt.claimToken)throw new ProjectAnalysisError(404,'ANALYSIS_NOT_FOUND','Synthetic completion claim does not match.');if(item.status!=='running'){const {sequence,...saved}=item;void sequence;return publicAnalysis(saved)}
   let status=Date.parse(item.leaseExpiresAt)<=Date.now()?'unknown':completion.status;if(!['complete','failed','unknown'].includes(status))throw Error('Invalid synthetic completion');const current=sourceCurrent(owner,project,item.sourceVersions);if(!current&&status==='complete')status='failed';item.status=status;item.result=null;item.resultIdentity=null;item.errorCode=!current?'ANALYSIS_SOURCE_CHANGED':completion.errorCode;
   if(status!=='unknown'){const usage=completion.usage;if(!usage||!Number.isSafeInteger(usage.inputTokens)||usage.inputTokens<0||!Number.isSafeInteger(usage.outputTokens)||usage.outputTokens<0)throw Error('Known synthetic usage required.');const pool=allowance(value,owner);pool.reservedAttempts--;pool.usedAttempts++;pool.reservedInputTokens-=item.reservation.inputTokens;pool.usedInputTokens+=usage.inputTokens;pool.reservedOutputTokens-=item.reservation.outputTokens;pool.usedOutputTokens+=usage.outputTokens;item.usage=clone(usage)}
   if(status==='complete'){if(!completion.result||!completion.resultIdentity)throw Error('Validated synthetic result required.');item.result=clone(completion.result);item.resultIdentity=completion.resultIdentity}write(value);const {sequence,...saved}=item;void sequence;return publicAnalysis(saved)
  },
  audit(){const value=read();return {synthetic:true,owners:clone(value.owners),analyses:value.records.map(({sequence,...item})=>{void sequence;return publicAnalysis(item)})}},
  setClosed(owner,closed){const value=read();allowance(value,owner).closed=Boolean(closed);write(value)},
 }
}
