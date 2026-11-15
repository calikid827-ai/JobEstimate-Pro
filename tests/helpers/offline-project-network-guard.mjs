import fs from 'node:fs';import net from 'node:net';import dns from 'node:dns';const attempts=[];
const local=host=>['localhost','127.0.0.1','::1','[::1]'].includes(String(host).toLowerCase());
function deny(api,host){attempts.push({api,host:String(host)});throw new Error('External transport blocked: '+api+' '+host)}
const connect=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...args){const first=Array.isArray(args[0])?args[0][0]:args[0];const host=typeof first==='object'&&first!==null?first.host??first.hostname:typeof first==='number'?typeof args[1]==='string'?args[1]:'localhost':undefined;if(host!==undefined&&!local(host))deny('socket',host);return connect.apply(this,args)};
const lookup=dns.lookup;dns.lookup=function(host,...args){if(!local(host))deny('dns',host);return lookup.call(this,host,...args)};
if(dns.promises){const promised=dns.promises.lookup;dns.promises.lookup=async function(host,...args){if(!local(host))deny('dns.promise',host);return promised.call(this,host,...args)}}
const fetch=globalThis.fetch;if(fetch)globalThis.fetch=async(input,init)=>{const value=typeof input==='string'||input instanceof URL?String(input):input.url;const url=new URL(value);if(!local(url.hostname))deny('fetch',url.hostname);return fetch(input,init)};
process.on('exit',()=>{if(process.env.OFFLINE_GUARD_LOG)fs.appendFileSync(process.env.OFFLINE_GUARD_LOG,JSON.stringify({pid:process.pid,externalAttempts:attempts})+'\n')});
