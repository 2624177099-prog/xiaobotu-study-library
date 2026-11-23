const uuid=()=>crypto.randomUUID(),now=()=>new Date().toISOString();
const query=(env,sql,...args)=>env.DB.prepare(sql).bind(...args);
const one=(e,s,...a)=>query(e,s,...a).first();
const all=async(e,s,...a)=>(await query(e,s,...a).all()).results;
function insert(env,table,data,ignore=false){
 const keys=Object.keys(data);
 return query(env,'INSERT '+(ignore?'OR IGNORE ':'')+'INTO '+table+' ('+keys.join(',')+') VALUES ('+keys.map(()=>'?').join(',')+')',...Object.values(data));
}
const audit=(env,action,target)=>insert(env,'audit',{action,target,actor:'administrator',created:now()});
function str(body,key,required=false,max=1600){
 const v=body instanceof FormData?body.get(key):body?.[key];
 if(v!=null&&typeof v!=="string")fail(400,"字段格式无效："+key);
 const value=(v||"").trim();if(required&&!value||value.length>max)fail(400,"字段为空或超长："+key);
 return value;
}
function requestKey(body){const id=str(body,"requestId",true,60);if(!/^[\da-f-]{36}$/i.test(id))fail(400,"提交标识无效，请刷新重试。");return id;}
const metadata=(b)=>Object.fromEntries(["title","subject","year","kind","tags","summary","author","textbook","grade"].map(k=>[k,str(b,k,["title","subject"].includes(k),k==="summary"?1200:200)]));
function makeVersion(b,rid){
 const v=Object.fromEntries(["label","ai","checkStatus","scope","checked","issues","source","revision"].map(k=>[k,str(b,k,k==="source")]));
 return {...v,label:v.label||'V1.0',ai:v.ai||'未说明',checkStatus:v.checkStatus||'待说明',id:uuid(),rid,created:now(),oldAllowed:0};
}
async function getSettings(e){
 const rows=await all(e,"SELECT key,value FROM settings WHERE key IN ('intro','year','contact','backupUrl','announcement','微信','支付宝')");
 const settings=Object.fromEntries(rows.map(r=>[r.key,r.value]));
 const channels=['微信','支付宝'].filter(x=>settings[x]).map(channel=>({channel,url:'/support-image/'+encodeURIComponent(channel)}));
 return {year:settings.year||'2026—2027',intro:settings.intro||'',announcement:settings.announcement||'',backupUrl:settings.backupUrl||'',contact:settings.contact??'微信 17384338201',channels,publicOrigin:e.PUBLIC_ORIGIN||'',...LIMITS};
}
const columns="SELECT r.*,v.label,v.checkStatus,(SELECT group_concat(ext,',') FROM (SELECT DISTINCT upper(ext) AS ext FROM attachment WHERE vid=r.current AND enabled=1)) AS formats FROM resource r JOIN version v ON v.id=r.current ";
async function listResources(e,admin){
 return all(e,columns+(admin?"":"WHERE r.status='published' AND r.saleCents=0 ")+"ORDER BY r.updated DESC,r.id");
}
async function detail(e,id,admin){
 const resource=await one(e,columns+"WHERE r.id=? "+(admin?"":"AND r.status='published' AND r.saleCents=0"),id);
 if(!resource)fail(404,"资料尚未发布或已撤回。");
 const versions=await all(e,"SELECT * FROM version WHERE rid=? ORDER BY (id=?) DESC,created DESC",id,resource.current);
 const files=await all(e,"SELECT a.id,a.vid,a.name,a.size,a.ext,a.enabled FROM attachment a JOIN version v ON v.id=a.vid WHERE v.rid=? "+(admin?"":"AND a.enabled=1 AND (v.id=? OR v.oldAllowed=1)"),...(admin?[id]:[id,resource.current]));
 for(const v of versions)v.files=files.filter(f=>f.vid===v.id);
 if(admin)Object.assign(resource,await one(e,"SELECT contact,reason FROM submission WHERE rid=?",id)||{});
 return {resource,versions,...await communityDetail(e,id)};
}
async function seed(e){
 const done=new Set((await all(e,"SELECT key FROM settings WHERE key IN ('seed1','archive24','wechat20261114','practice-v3','nov23')")).map(r=>r.key));
 if(!done.has('wechat20261114')){
  const obj='support/wechat-20261114.jpeg';
  await e.BUCKET.put(obj,Uint8Array.from(atob(WECHAT_IMAGE),c=>c.charCodeAt(0)));
  await e.DB.batch([query(e,"INSERT OR IGNORE INTO settings(key,value) SELECT '微信',? WHERE NOT EXISTS(SELECT 1 FROM settings WHERE key='wechat20261114')",obj),insert(e,'settings',{key:'wechat20261114',value:'complete'},true)]);
 }
 for(const [batchKey,items] of [['seed1',SEEDS],['archive24',ARCHIVE],['practice-v3',[PRACTICE_V3]],['nov23',NOV23]]){
 if(done.has(batchKey))continue;
 const statements=[];
 for(const s of items){
  // Stable private keys make concurrent cold starts and partial retries harmless.
  for(const a of s.files){if(!await e.BUCKET.head(a.obj))await e.BUCKET.put(a.obj,Uint8Array.from(atob(a.base64),c=>c.charCodeAt(0)));}
  statements.push(insert(e,'resource',s.resource,true),insert(e,'version',s.version,true));
  for(const {base64,...a} of s.files)statements.push(insert(e,'attachment',a,true));
 }
 if(batchKey==='practice-v3'){const r=PRACTICE_V3.resource;statements.push(query(e,"UPDATE resource SET current=?,updated=?,summary=? WHERE id=? AND current='xigai-practice-first' AND NOT EXISTS(SELECT 1 FROM settings WHERE key='practice-v3')",r.current,r.updated,r.summary,r.id));}
 statements.push(insert(e,'settings',{key:batchKey,value:'complete'},true));await e.DB.batch(statements);
 }
}
async function rate(e,req,kind,maximum){
 const slot=Math.floor(Date.now()/3600000),ip=req.headers.get('cf-connecting-ip')||'local';
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(slot+'|'+ip)))).map(n=>n.toString(16).padStart(2,'0')).join('');
 for(const [key,max] of [[kind+slot+hash,maximum],[kind+slot,maximum*60]]){
  const row=await one(e,"INSERT INTO rate(key,n,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET n=n+1 RETURNING n",key,slot+1);
  if(row.n>max)fail(429,"本小时提交次数已达上限，请稍后再试。");
 }
 await query(e,"DELETE FROM rate WHERE expires<?",slot).run();
}
const count=(e,kind)=>query(e,"INSERT INTO metric(day,kind,n) VALUES(?,?,1) ON CONFLICT(day,kind) DO UPDATE SET n=n+1",now().slice(0,10),kind).run();
