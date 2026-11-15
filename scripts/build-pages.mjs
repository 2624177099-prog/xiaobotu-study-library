import fs from 'node:fs/promises';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {localServer} from '../dev.mjs';

const dir=await mkdtemp(join(tmpdir(),'pages-'));
const server=await localServer({dataDirectory:dir});
const origin='https://xiaobotu-study-library.gx2jwkwhpv.chatgpt.site';
async function get(path){
 const response=await fetch(server.url+path);
 if(!response.ok)throw Error(path+' '+response.status);
 return response;
}
function replace(source,from,to){
 if(!source.includes(from))throw Error('Original UI changed: '+from);
 return source.replace(from,()=>to);
}
try {
 const catalog=await (await get('/api/catalog')).json();
 const urls=JSON.parse(await fs.readFile('docs/manifest.json','utf8')).files;
 const details={};
 for(const item of catalog.items){
  details[item.id]=await (await get('/api/resource/'+item.id)).json();
  for(const v of details[item.id].versions)for(const f of v.files){
   if(!urls.some(x=>x.path.split('/')[1]===f.id))throw Error('Missing '+f.id);
  }
 }
 catalog.settings.backupUrl='';
 catalog.settings.channels=catalog.settings.channels.map(c=>({...c,url:'./wechat.jpeg'}));
 await fs.copyFile('seed/support/wechat.jpeg','docs/wechat.jpeg');
 const data={catalog,details,files:Object.fromEntries(urls.map(f=>[f.path.split('/')[1],f.path]))};
 await fs.writeFile('docs/catalog.json',JSON.stringify(data));
 let frame=await (await get('/resources')).text();
 frame=frame.replace('src="/ui.js"','src="./library.js"').replaceAll('href="/resources/about"','href="?r=about"').replaceAll('href="/resources/submit"','href="'+origin+'/resources/submit"').replaceAll('href="/resources/feedback"','href="'+origin+'/resources/feedback"').replaceAll('href="/admin"','href="'+origin+'/admin"').replaceAll('href="/resources"','href="./"');
 let ui=await (await get('/ui.js')).text();
 ui=replace(ui,"location.pathname.replace(/\\/$/, '') || '/resources'","('/resources/'+(new URLSearchParams(location.search).get('r')||'')).replace(/\\/$/,'')");
 ui=replace(ui,"id => '/resources/'+enc(id)","id => '?r='+enc(id)");
 ui=replace(ui,'const res=await fetch(url,','if(!opt.method){const data=await snapshot; if(url==="/api/catalog")return data.catalog; if(url.startsWith("/api/resource/") && data.details[url.slice(14)])return data.details[url.slice(14)];} throw Object.assign(Error("此资料当前不可用。"),{status:404}); /* const res=await fetch(url,');
 ui=replace(ui,'return data;\n}', 'return data; */\n}');
 ui=replace(ui,"const $ =", "const snapshot=fetch('./catalog.json').then(r=>{if(!r.ok)throw Error('资料目录加载失败，请刷新重试。');return r.json()}); let files={};\nconst $ =");
 ui=replace(ui,"catalog=await api('/api/catalog')","files=(await snapshot).files;catalog=await api('/api/catalog')");
 ui=ui.replaceAll('href="/resources/about"','href="?r=about"').replaceAll('href="/resources/feedback','href="'+origin+'/resources/feedback').replaceAll('href="/resources/submit','href="'+origin+'/resources/submit').replaceAll('href="/resources"','href="./"');
 ui=replace(ui,"path+(qs.size?'?'+qs:'')","location.pathname+(qs.size?'?'+qs:'')");
 ui=replace(ui,"href=\"/file/'+enc(f.id)+'\"","download=\"'+escape(f.name)+'\" href=\"'+escape(files[f.id])+'\"");
 ui=replace(ui,"const u='/preview/'+enc(b.dataset.preview)","const u=escape(files[b.dataset.preview])");
 ui=replace(ui,'new URL(raw,location.origin)','new URL(raw,location.href)');
 ui=replace(ui,'installNotes();',`$('#topicPoll').innerHTML='<h2>给小博土留言</h2><p>匿名留言、点赞、私人反馈和下一份资料建议，在原站提交并审核。</p><a class="btn" href="${origin}/resources#topicPoll">打开原站留言 ↗</a>';`);
 const ratingStart=ui.indexOf(" main.insertAdjacentHTML('beforeend',readerRating");
 const ratingEnd=ui.indexOf(' main.querySelectorAll',ratingStart);
 if(ratingStart<0||ratingEnd<0)throw Error('Missing rating section');
 ui=ui.slice(0,ratingStart)+` main.insertAdjacentHTML('beforeend','<section class="panel"><h2>资料评价</h2><a class="btn" href="${origin}/resources/'+enc(id)+'#rateForm">前往原站评价 ↗</a></section>');\n`+ui.slice(ratingEnd);
 ui=ui.replaceAll('location.origin+path','location.href.split("#")[0]');
 ui=replace(ui,"if(!settings.publicOrigin || new URL(settings.publicOrigin).origin!==location.origin) return '';","if(location.hostname!=='2624177099-prog.github.io') return '';");
 ui=replace(ui,'src="/qr?path=\'+enc(path)+\'','src="\'+qrImage(location.href.split("#")[0])+\'');
 ui=replace(ui,"if(location.pathname!=='/'&&settings.publicOrigin)","if(true)");
 const modules=await Promise.all((await fs.readdir('vendor/qr')).map(async name=>JSON.stringify('./'+name.slice(0,-3))+':(module,exports,require)=>{'+await fs.readFile('vendor/qr/'+name,'utf8')+'}'));
 const qr=`function qrImage(url){const mods={${modules}},cache={};function req(k){if(!cache[k]){const m={exports:{}};cache[k]=m;mods[k](m,m.exports,req)}return cache[k].exports}const Q=req('./index'),q=new Q(-1,1);q.addData(url);q.make();const n=q.getModuleCount(),dots=[];for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(q.isDark(y,x))dots.push('M'+(x+4)+' '+(y+4)+'h1v1h-1z');return 'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+(n+8)+' '+(n+8)+'" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/><path d="'+dots.join('')+'"/></svg>');}\n`;
 await fs.writeFile('docs/library.js',qr+ui);
 await fs.writeFile('docs/index.html',frame);
}finally{await server.close();await rm(dir,{recursive:true,force:true});}
