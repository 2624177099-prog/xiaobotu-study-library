const SECURITY={'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Cache-Control':'private, no-store'};
const response=(body,type,status=200,headers={})=>new Response(body,{status,headers:{...SECURITY,'Content-Type':type,...headers}});
const json=(data,status=200)=>response(JSON.stringify(data),'application/json; charset=utf-8',status);
const canAdmin=(r,e)=>!!(e.ADMIN_EMAIL&&r.headers.get('oai-authenticated-user-id')&&r.headers.get('oai-authenticated-user-email')?.toLowerCase()===e.ADMIN_EMAIL.toLowerCase());
async function download(e,id,preview,admin,ctx){
 const kind=preview?'preview':'download';
 let resourceId='';
 let failure='service_error';
 try {
  const a=await one(e,"SELECT a.*, v.rid FROM attachment a JOIN version v ON v.id=a.vid JOIN resource r ON r.id=v.rid WHERE a.id=? "+(admin?'':"AND r.status='published' AND r.saleCents=0 AND a.enabled=1 AND (v.id=r.current OR v.oldAllowed=1)"),id);
  if(!a){failure='unavailable';fail(404,'文件未发布、已撤回或不存在。请返回资料页查看当前版本。');}
  resourceId=a.rid;
  if(preview&&a.ext!=='pdf'&&!MIME[a.ext].startsWith('image/')){failure='unsupported';fail(415,'此格式请下载后打开。');}
  const obj=await e.BUCKET.get(a.obj);if(!obj){failure='missing';fail(404,'文件暂不可用，请返回详情重试或提交反馈。');}
  const result=response(obj.body,MIME[a.ext],200,{'Content-Length':String(a.size),'Content-Disposition':(preview?'inline':'attachment')+"; filename=\"resource."+a.ext+"\"; filename*=UTF-8''"+encodeURIComponent(a.name).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16))});
  if(!preview&&!admin){ctx.waitUntil(count(e,'downloads'));countFileEvent(e,ctx,resourceId,'download');}
  return result;
 } catch(err) {
  if(!admin)countFileEvent(e,ctx,resourceId,kind+'_'+failure);
  throw err;
 }
}
function qr(e,path){
 if(!/^https:\/\//.test(e.PUBLIC_ORIGIN||'')||!/^\/resources(?:\/[a-zA-Z0-9-]+)?$/.test(path||''))fail(400,'正式分享地址未配置或路径无效。');
 const q=new QRCode(-1,1);q.addData(e.PUBLIC_ORIGIN.replace(/\/$/,'')+path);q.make();
 const n=q.getModuleCount(),dots=[];for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(q.isDark(y,x))dots.push('M'+(x+4)+' '+(y+4)+'h1v1h-1z');
 return response('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+(n+8)+' '+(n+8)+'" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/><path d="'+dots.join('')+'"/></svg>','image/svg+xml');
}
const pagesOrigin='https://2624177099-prog.github.io';
async function pagesCommunity(req,e,url){
 const headers={'Access-Control-Allow-Origin':pagesOrigin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Vary':'Origin'};
 const path=url.pathname;
 try {
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  let result;
  if(req.method==='GET'&&path==='/api/notes')result=await noteList(e,url,false);
  else if(req.method==='GET'&&path==='/api/ratings'){
   const id=url.searchParams.get('resource');
   const r=await one(e,"SELECT id FROM resource WHERE id=? AND status='published' AND saleCents=0",id);
   if(!r)fail(404,'资料不可用。');
   result={ratings:(await communityDetail(e,id)).ratings};
  }else if(req.method==='POST'&&['/api/notes','/api/like','/api/rate'].includes(path)){
   await rate(e,req,path,path==='/api/like'?100:path==='/api/rate'?24:16);
   const b=await readBody(req,false);
   result=path==='/api/rate'?await communityPost(e,path,b):await postNote(e,req,path,b);
  }else fail(405,'不支持此操作。');
  return response(JSON.stringify(result),'application/json',200,headers);
 }catch(err){return response(JSON.stringify({error:err.status?err.message:'互动服务暂时不可用，请稍后重试。'}),'application/json',err.status||503,headers);}
}
export default {async fetch(req,e,ctx){
 const url=new URL(req.url),p=url.pathname.replace(/\/$/,'')||'/',admin=canAdmin(req,e);
 if(req.headers.get('origin')===pagesOrigin&&['/api/notes','/api/like','/api/rate','/api/ratings'].includes(p))return pagesCommunity(req,e,url);
 try{
  if(p==='/ui.js'&&req.method==='GET')return response(CLIENT,'text/javascript; charset=utf-8');
  if(p==='/qr'&&req.method==='GET')return qr(e,url.searchParams.get('path'));
  if((p==='/admin'||p.startsWith('/api/admin'))&&!admin){
   if(p==='/admin'&&req.method==='GET')return response('<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>管理员登录</title><main style="font:18px system-ui;max-width:32em;margin:15vh auto;padding:24px"><h1>资料管理</h1><p>请使用站点所有者账号登录。</p><a href="/signin-with-chatgpt?return_to=%2Fadmin" target="_top">登录管理后台 →</a><p><a href="/resources">返回资料库</a></p></main></html>','text/html; charset=utf-8',403);
   fail(403,'需要管理员权限。');
  }
  if(req.method==='POST'){
   if(req.headers.get('origin')!==url.origin)fail(403,'提交来源无效，请从站内重新提交。');
   if(['/api/notes','/api/like','/api/admin/note'].includes(p)){if(!admin)await rate(e,req,p,p==='/api/like'?100:16);return json({ok:true,...await postNote(e,req,p,await readBody(req,false))});}
   if(['/api/vote','/api/rate','/api/admin/topics','/api/admin/errata'].includes(p)){if(!admin)await rate(e,req,p,24);return json({ok:true,...await communityPost(e,p,await readBody(req,false))});}
   if(!['/api/submit','/api/feedback','/api/admin/upload','/api/admin/edit','/api/admin/status','/api/admin/version','/api/admin/file','/api/admin/feedback','/api/admin/settings','/api/admin/support','/api/admin/cleanup'].includes(p))fail(404,'接口不存在。');
   if(!admin)await rate(e,req,p,p.endsWith('submit')?6:20);
   const multipart=['/api/submit','/api/admin/upload','/api/admin/support'].includes(p);
   const b=await readBody(req,multipart);
   const data=p==='/api/admin/cleanup'?await cleanup(e,str(b,'cursor')):p==='/api/submit'||p==='/api/admin/upload'?await upload(e,b,p.includes('/admin/')):p==='/api/feedback'?await feedback(e,b):await manage(e,p.split('/').pop(),b);
   return json({ok:true,...data});
  }
  if(req.method!=='GET')fail(405,'不支持此请求方式。');
  if(p==='/api/catalog'||p==='/api/admin'||p.startsWith('/api/resource/')||p.startsWith('/api/admin/resource/')||p.startsWith('/file/')||p.startsWith('/preview/'))await seed(e);
  if(p==='/api/notes'||p==='/api/admin/notes')return json(await noteList(e,url,p.startsWith('/api/admin/')));
  if(p==='/api/admin/weekly')return json(await weeklyReport(e));
  if(p==='/api/admin/backup')return await backup(e);
  if(p==='/api/admin/errata')return json({items:await all(e,'SELECT x.*,v.label,r.title FROM erratum x JOIN version v ON v.id=x.vid JOIN resource r ON r.id=v.rid WHERE x.visible=1 ORDER BY x.created DESC')});
  if(p==='/api/catalog')return json({poll:await pollState(e),items:await listResources(e,false),settings:await getSettings(e),admin});
  if(p==='/api/admin'){const counts=Object.fromEntries((await all(e,'SELECT kind,sum(n) AS n FROM metric GROUP BY kind')).map(a=>[a.kind,a.n]));return json({items:await listResources(e,true),feedback:await all(e,'SELECT * FROM feedback ORDER BY created DESC'),settings:await getSettings(e),counts:{views:0,downloads:0,...counts}});}
  if(/^\/api\/(admin\/)?resource\/[^/]+$/.test(p))return json(await detail(e,p.split('/').pop(),p.includes('/admin/')));
  if(/^\/(preview|file)\/[^/]+$/.test(p))return await download(e,p.split('/').pop(),p.startsWith('/preview/'),admin&&url.searchParams.get('review')==='1',ctx).catch(err=>{throw err;});
  if(p.startsWith('/support-image/')){const c=decodeURIComponent(p.split('/').pop());if(!['微信','支付宝'].includes(c))fail(404,'渠道不存在。');const s=await one(e,'SELECT value FROM settings WHERE key=?',c);const obj=s&&await e.BUCKET.get(s.value);if(!obj)fail(404,'暂未配置收款码。');return response(obj.body,MIME[s.value.split('.').pop()]);}
  if(p==='/'||p==='/admin'||p==='/resources'||/^\/resources\/[a-zA-Z0-9-]+$/.test(p)){if(p!=='/admin')ctx.waitUntil(count(e,'views'));return response(FRAME,'text/html; charset=utf-8',200,{'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; frame-src 'self'; object-src 'self'; base-uri 'none'; form-action 'self'"});}
  fail(404,'页面不存在。');
 }catch(err){return p.startsWith('/api/')?json({error:err.status?err.message:'服务暂时不可用，请稍后重试。'},err.status||503):response(err.status?err.message:'服务暂时不可用，请刷新重试。','text/plain; charset=utf-8',err.status||503);}
}};
