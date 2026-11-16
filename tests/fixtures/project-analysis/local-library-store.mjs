/** Controlled loopback fixture only. No production route imports this store. */
import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { PROJECT_LIMITS, ProjectLibraryError } from '../../../app/lib/project-library/types.ts'
import { emptyInventory } from '../../../app/lib/project-library/service.ts'
import { inventoryPage, pageLimit, parsePageCursor, projectFileSummary, projectPageMetadata } from '../../../app/lib/project-library/pagination.ts'
const sha=value=>createHash('sha256').update(value).digest('hex')
function checkedRoot(value){const root=path.resolve(value);if(!root.startsWith('/private/tmp/jobestimate-full-workflow-'))throw Error('Synthetic project store requires its isolated scratch directory.');fs.mkdirSync(root,{recursive:true});return root}
const location=(root,owner,project)=>path.join(root,'library-'+sha(owner+':'+project))
const readHead=(root,owner,project)=>{const dir=location(root,owner,project),file=path.join(dir,'head.json');return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{revision:0,files:{}}}
const readRow=(root,owner,project,id)=>{const head=readHead(root,owner,project),name=head.files[id];return name?JSON.parse(fs.readFileSync(path.join(location(root,owner,project),name),'utf8')):null}
export function readLocalProjectFileMetadata(root,owner,project,id){return readRow(root,owner,project,id)?.file??null}
export function createLocalProjectLibraryStore(storeRoot,{origin,signature}){
 const root=checkedRoot(storeRoot),objectPath=key=>path.join(root,sha(key)+'.original')
 const own=(owner,file)=>{if(file.ownerId!==owner||file.objectKey!==`${owner}/${file.projectId}/${file.id}/original`)throw new ProjectLibraryError(404,'PROJECT_FILE_NOT_FOUND','Synthetic original is unavailable for this owner.')}
 function summaries(owner,project,head){return Object.keys(head.files).sort().map(id=>{const row=JSON.parse(fs.readFileSync(path.join(location(root,owner,project),head.files[id]),'utf8'));own(owner,row.file);return projectFileSummary(row.file)})}
 const store={
  async ready(){},
  async get(owner,project){const head=readHead(root,owner,project);return {...emptyInventory(owner,project),revision:head.revision,files:summaries(owner,project,head)}},
  async getRevision(owner,project){return readHead(root,owner,project).revision},
  async list(owner,project,options={}){const head=readHead(root,owner,project),start=parsePageCursor(options.cursor,head.revision),limit=pageLimit(options.limit),ids=Object.keys(head.files).sort(),files=ids.slice(start,start+limit).map(id=>projectFileSummary(readRow(root,owner,project,id).file));return inventoryPage({...emptyInventory(owner,project),revision:head.revision},files,ids.length,start)},
  async getFile(owner,project,id){const row=readRow(root,owner,project,id);if(!row)return null;own(owner,row.file);return {...row.file,pages:Object.values(row.pages).map(page=>({...page.metadata,text:'',contentLoaded:false})).sort((a,b)=>a.pageNumber-b.pageNumber)}},
  async getPage(owner,project,id,number){const row=readRow(root,owner,project,id);if(!row)return null;own(owner,row.file);const page=row.pages[number];return page?{...JSON.parse(fs.readFileSync(path.join(location(root,owner,project),page.content),'utf8')),contentLoaded:true}:null},
  async save(){throw new ProjectLibraryError(503,'PROJECT_NORMALIZED_WRITE_REQUIRED','Controlled store requires changed file/page writes.')},
  async saveFiles(owner,project,files,expected){
   // No await between reading the CAS head and atomically replacing it. This is a
   // single-process fixture, not a cross-process or power-loss guarantee.
   const head=readHead(root,owner,project);if(head.revision!==expected)throw new ProjectLibraryError(409,'PROJECT_CHANGED','Project changed; retry this operation.');if(!files.length||files.length>2)throw Error('Bounded changed rows required.');
   const dir=location(root,owner,project);fs.mkdirSync(dir,{recursive:true});const next={revision:expected+1,files:{...head.files}},transaction=randomUUID()
   for(const file of files){own(owner,file);if(file.projectId!==project)throw Error('Foreign project');const prior=readRow(root,owner,project,file.id);if(prior&&(prior.file.sha256!==file.sha256||prior.file.sourceVersion!==file.sourceVersion||prior.file.objectKey!==file.objectKey))throw Error('Immutable original changed');const pages={...(prior?.pages||{})};
    for(const page of file.pages){if(page.contentLoaded===false)continue;const content=`page-${sha(file.id+':'+page.pageNumber)}-${transaction}.json`;fs.writeFileSync(path.join(dir,content),JSON.stringify({...page,textCharacters:page.text.length,contentLoaded:true}),{flag:'wx',mode:0o600});pages[page.pageNumber]={metadata:projectPageMetadata(page),content}}
    const stats={prepared:Object.values(pages).filter(p=>p.metadata.extraction!=='failed').length,failed:Object.values(pages).filter(p=>p.metadata.extraction==='failed').length,textCharacters:Object.values(pages).reduce((n,p)=>n+p.metadata.textCharacters,0)},name=`file-${sha(file.id)}-${transaction}.json`;
    fs.writeFileSync(path.join(dir,name),JSON.stringify({file:{...projectFileSummary(file),pageStats:stats},pages}),{flag:'wx',mode:0o600});next.files[file.id]=name
   }
   const temp=path.join(dir,'head-'+transaction+'.tmp');fs.writeFileSync(temp,JSON.stringify(next),{flag:'wx',mode:0o600});fs.renameSync(temp,path.join(dir,'head.json'));return store.get(owner,project)
  },
  async ticket(owner,file){own(owner,file);return {endpoint:origin()+'/storage/tus',headers:{'x-signature':signature(file.objectKey)},bucket:'synthetic-private-projects',objectKey:file.objectKey,chunkBytes:PROJECT_LIMITS.chunkBytes}},
  async download(owner,file){own(owner,file);const current=readLocalProjectFileMetadata(root,owner,file.projectId,file.id);if(!current||current.sha256!==file.sha256)throw Error('Missing exact retained original');return new Uint8Array(fs.readFileSync(objectPath(file.objectKey)))},
  async signedDownload(owner,file){own(owner,file);return origin()+'/storage/original/'+encodeURIComponent(file.objectKey)+'?signature='+signature(file.objectKey)},
  async putProcessing(owner,file,bytes){own(owner,file);const key=file.objectKey+'.processing.jpg';fs.writeFileSync(objectPath(key),bytes,{mode:0o600});return key},
  audit(){return {synthetic:true,normalizedMetadata:true,separatePageContent:true,singleProcessOnly:true}},
 }
 return store
}
