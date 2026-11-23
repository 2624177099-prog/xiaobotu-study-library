import http from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync} from 'node:fs';
const siteOrigin='https://2624177099-prog.github.io';
const caps={junior:300,future:1000,feedback:500};
const allowedTags=new Set(['','题目难选','推荐不贴合','缺少职业','手机操作问题','其他']);
const validId=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function json(status,data){
  return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=UTF-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Vary':'Authorization'}});
}
async function keyFrom(request) {
  const token=request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/i)?.[1];
  if(!token)return '';
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('beyond-clinical:wall:'+token));
  return Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');
}
export async function handleWall(request,env) {
  const url=new URL(request.url);
  const match=url.pathname.match(/^\/api\/wall(?:\/([a-f0-9-]+)(\/like)?)?\/?$/i);
  if(!match||(match[1]&&!validId.test(match[1])))return json(404,{error:'没有找到这条留言。'});
  if(!env.DB)return json(503,{error:'共享留言墙暂时不可用，可以先将文字保存在本机。'});
  const [,,like]=match,id=match[1],method=request.method;
  try{
    const owner=await keyFrom(request);
    if(method==='GET'&&!id){
      const kind=url.searchParams.get('kind')||'';
      if(kind&&!Object.hasOwn(caps,kind))return json(400,{error:'留言分类无效。'});
      const raw=url.searchParams.get('before');
      if(raw!==null&&(!/^\d{1,16}$/.test(raw)||!Number.isSafeInteger(Number(raw))))return json(400,{error:'翻页参数无效。'});
      const page=await env.DB.prepare(`SELECT n.seq,n.id,n.kind,n.body,n.tag,n.created_at,n.updated_at,
        (n.owner_key=?) AS mine,(SELECT count(*) FROM wall_likes WHERE note_id=n.id) AS likes,
        EXISTS(SELECT 1 FROM wall_likes WHERE note_id=n.id AND visitor_key=?) AS liked
        FROM wall_notes n WHERE (?=\x27\x27 OR n.kind=?) AND n.seq<? ORDER BY n.seq DESC LIMIT 16`).bind(owner,owner,kind,kind,raw===null?Number.MAX_SAFE_INTEGER:Number(raw)).all();
      const items=page.results.slice(0,15);
      return json(200,{items,next:page.results.length>15?items.at(-1).seq:null});
    }
    if(!id||!['PUT','DELETE'].includes(method))return json(405,{error:'这项操作不可用。'});
    if(request.headers.get('Origin')&&![url.origin,siteOrigin].includes(request.headers.get('Origin')))return json(403,{error:'请从网站内操作。'});
    if(!owner)return json(401,{error:'当前浏览器缺少匿名操作凭据。'});
    if(like){
      if(method==='PUT'){
        await env.DB.prepare('INSERT OR IGNORE INTO wall_likes(note_id,visitor_key) SELECT id,? FROM wall_notes WHERE id=?').bind(owner,id).run();
      }else{
        await env.DB.prepare('DELETE FROM wall_likes WHERE note_id=? AND visitor_key=?').bind(id,owner).run();
      }
      const row=await env.DB.prepare('SELECT (SELECT count(*) FROM wall_likes WHERE note_id=n.id) AS likes,EXISTS(SELECT 1 FROM wall_likes WHERE note_id=n.id AND visitor_key=?) AS liked FROM wall_notes n WHERE id=?').bind(owner,id).first();
      return row?json(200,row):json(404,{error:'这条留言已撤下。'});
    }
    if(method==='DELETE'){
      const row=await env.DB.prepare('SELECT owner_key FROM wall_notes WHERE id=?').bind(id).first();
      if(row&&row.owner_key!==owner)return json(403,{error:'仅发布者可撤下留言。'});
      if(row)await env.DB.batch([
        env.DB.prepare('DELETE FROM wall_likes WHERE note_id=? AND EXISTS(SELECT 1 FROM wall_notes WHERE id=? AND owner_key=?)').bind(id,id,owner),
        env.DB.prepare('DELETE FROM wall_notes WHERE id=? AND owner_key=?').bind(id,owner)
      ]);
      return json(200,{removed:true});
    }
    if(!(request.headers.get('Content-Type')||'').includes('application/json'))return json(415,{error:'请使用网站的发布表单。'});
    if(Number(request.headers.get('Content-Length')||0)>16000)return json(413,{error:'文字超出长度限制。'});
    const raw=await request.text();if(raw.length>7000)return json(413,{error:'文字超出长度限制。'});
    let data;try{data=JSON.parse(raw)}catch{return json(400,{error:'留言格式无效。'})}
    const kind=data?.kind,body=typeof data?.body==='string'?data.body.trim():'',tag=data?.tag??'';
    if(!Object.hasOwn(caps,kind)||!body||body.length>caps[kind]||!allowedTags.has(tag)||(tag&&kind!=='feedback'))return json(400,{error:'请检查留言类型、标签和字数。'});
    const now=new Date().toISOString();
    const res=await env.DB.prepare(`INSERT INTO wall_notes(id,owner_key,kind,body,tag,created_at,updated_at) VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET body=excluded.body,tag=excluded.tag,updated_at=excluded.updated_at
      WHERE wall_notes.owner_key=excluded.owner_key AND wall_notes.kind=excluded.kind`).bind(id,owner,kind,body,tag,now,now).run();
    if(!res.meta.changes)return json(409,{error:'此留言归属不匹配。'});
    return json(200,{published:true,id});
  }catch{return json(503,{error:'暂时无法连接共享留言墙，请稍后重试。'})}
}

const dir=process.env.DATA_DIR||'./data';mkdirSync(dir,{recursive:true});const db=new DatabaseSync(dir+'/careers.sqlite');db.exec('PRAGMA journal_mode=WAL;PRAGMA foreign_keys=ON;');db.exec("CREATE TABLE IF NOT EXISTS wall_notes (\n  seq INTEGER PRIMARY KEY AUTOINCREMENT,\n  id TEXT NOT NULL UNIQUE,\n  owner_key TEXT NOT NULL,\n  kind TEXT NOT NULL CHECK (kind IN ('junior','future','feedback')),\n  body TEXT NOT NULL,\n  tag TEXT NOT NULL DEFAULT '',\n  created_at TEXT NOT NULL,\n  updated_at TEXT NOT NULL\n);\nCREATE TABLE IF NOT EXISTS wall_likes (\n  note_id TEXT NOT NULL REFERENCES wall_notes(id) ON DELETE CASCADE,\n  visitor_key TEXT NOT NULL,\n  PRIMARY KEY(note_id, visitor_key)\n);\n");
function prepared(sql,args=[]){const st=db.prepare(sql);return {bind(...v){return prepared(sql,v)},async all(){return {results:st.all(...args)}},async first(){return st.get(...args)||null},run(){return {meta:st.run(...args)}}}}
const DB={prepare:prepared,async batch(list){db.exec('BEGIN');try{const r=[];for(const item of list)r.push(item.run());db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}}};

db.exec('CREATE TABLE IF NOT EXISTS usage_events(session TEXT NOT NULL,event TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(session,event))');
function adminAllowed(request){
 const secret=process.env.ADMIN_PASSWORD||'';
 const supplied=request.headers.get('Authorization')?.replace(/^Bearer /,'')||'';
 return secret.length>=16&&Buffer.byteLength(secret)===Buffer.byteLength(supplied)&&timingSafeEqual(Buffer.from(secret),Buffer.from(supplied));
}
function snapshot(){
 const usage=Object.fromEntries(db.prepare('SELECT event,count(*) AS total FROM usage_events GROUP BY event').all().map(r=>[r.event,r.total]));
 return {usage,notes:db.prepare('SELECT count(*) AS total FROM wall_notes').get().total,likes:db.prepare('SELECT count(*) AS total FROM wall_likes').get().total};
}
async function routeRequest(request){
 const url=new URL(request.url);
 if(url.pathname.startsWith('/api/admin')){
  if(!adminAllowed(request))return json(401,{error:'管理密码错误，或服务尚未配置至少 16 位的管理密码。'});
  if(request.method==='GET'&&url.pathname==='/api/admin')return json(200,{...snapshot(),items:db.prepare('SELECT id,kind,body,tag,created_at FROM wall_notes ORDER BY seq DESC LIMIT 200').all()});
  if(request.method==='GET'&&url.pathname==='/api/admin/export')return json(200,{...snapshot(),exported_at:new Date().toISOString(),items:db.prepare('SELECT id,kind,body,tag,created_at,updated_at FROM wall_notes ORDER BY seq DESC').all(),daily:db.prepare('SELECT substr(created_at,1,10) AS day,event,count(*) AS total FROM usage_events GROUP BY day,event ORDER BY day DESC').all()});
  const id=url.pathname.slice('/api/admin/notes/'.length);
  if(request.method==='DELETE'&&url.pathname.startsWith('/api/admin/notes/')&&validId.test(id)){db.prepare('DELETE FROM wall_notes WHERE id=?').run(id);return json(200,{removed:true})}
  return json(404,{error:'没有找到该管理操作。'});
 }
 if(url.pathname==='/api/usage'){
  if(request.method!=='POST')return json(405,{error:'请求方式无效'});
  if(request.headers.get('Origin')&&![siteOrigin,url.origin].includes(request.headers.get('Origin')))return json(403,{error:'来源无效'});
  let data;try{data=await request.json()}catch{return json(400,{error:'格式无效'})}
  if(!validId.test(data?.session||'')||!['visit','start','complete'].includes(data?.event))return json(400,{error:'统计参数无效'});
  db.prepare('INSERT OR IGNORE INTO usage_events(session,event,created_at) VALUES (?,?,?)').run(data.session,data.event,new Date().toISOString());return json(200,{recorded:true});
 }
 return handleWall(request,{DB});
}

const port=Number(process.env.PORT||process.argv[process.argv.indexOf('--port')+1])||4173;
http.createServer(async(req,res)=>{try{
if(req.method==='GET'&&['/','/index.html','/careers/','/admin'].includes(req.url.split('?')[0])){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(readFileSync(new URL('../../docs/careers/index.html',import.meta.url)));return;}
if(req.headers.origin===siteOrigin){res.setHeader('Access-Control-Allow-Origin',siteOrigin);res.setHeader('Access-Control-Allow-Methods','GET, POST, PUT, DELETE, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');}
if(req.method==='OPTIONS'){res.writeHead(req.headers.origin===siteOrigin?204:403);res.end();return;}
const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>16384){res.writeHead(413);res.end();return}chunks.push(c);}
const out=await routeRequest(new Request((req.headers['x-forwarded-proto']==='https'?'https://':'http://')+req.headers.host+req.url,{method:req.method,headers:req.headers,body:chunks.length?Buffer.concat(chunks):undefined}));res.writeHead(out.status,{...Object.fromEntries(out.headers),Vary:"Origin, Authorization"});res.end(Buffer.from(await out.arrayBuffer()))}catch{res.writeHead(500);res.end()}}).listen(port,'0.0.0.0');
