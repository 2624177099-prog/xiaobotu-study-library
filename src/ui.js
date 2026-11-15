'use strict';
(() => {
const $ = (s, p=document) => p.querySelector(s);
const main = $('#main'), path = location.pathname.replace(/\/$/, '') || '/resources';
const escape = x => String(x ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const enc = encodeURIComponent, detailUrl = id => '/resources/'+enc(id);
const qs = new URLSearchParams(location.search);
const formatDate = time => {
  if (!time) return '未填写';
  const d = new Date(typeof time==='number' && time<1e12 ? time*1000 : time);
  return Number.isNaN(+d) ? String(time) : new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(d).replaceAll('/','.');
};
const size = n => n>=1048576 ? (n/1048576).toFixed(1)+' MB' : Math.ceil(n/1024)+' KB';
const stateName = {approved_sale:'出售审核通过（待开放交易）',published:'已发布',pending:'待审核',returned:'需补充',withdrawn:'已撤回',archived:'已归档',draft:'草稿'};
const feedbackStates=['待处理','核对中','已修订','暂不修改','信息不足'];
const guideLink='<a href="/resources/about">使用说明 ↗</a>';
const back='<a class="backlink" href="/resources">← 返回资料库</a>';
const paramsToObject=form=>Object.fromEntries(new FormData(form));
let catalog,settings={},adminData;
function trustedURL(raw){try{const u=new URL(raw,location.origin);return ['http:','https:'].includes(u.protocol)?escape(u.href):'';}catch{return '';}}
function selected(value,current){return String(value)===String(current)?' selected':'';}
function options(list,current){return list.map(i=>'<option'+selected(i,current)+'>'+escape(i)+'</option>').join('');}
function btn(label,attrs='',primary=false){return '<button class="btn '+(primary?'primary':'')+'" '+attrs+'>'+label+'</button>';}
function lead(title,desc){document.title=title+' · 小博土期末资料库';return back+'<header class="page-intro"><h1>'+escape(title)+'</h1><p>'+escape(desc)+'</p></header>';}
function field(label,name,value='',required=false,type='text',extra=''){
  const safe=escape(value), req=required?' required':'',title=escape(label)+(required?' <small>必填</small>':'');
  return '<label class="field"><span>'+title+'</span>'+(type==='textarea'?'<textarea rows="3" name="'+name+'"'+req+' '+extra+'>'+safe+'</textarea>':'<input type="'+type+'" name="'+name+'" value="'+safe+'"'+req+' '+extra+'>')+'</label>';
}
function choice(label,name,values,current){return '<label class="field"><span>'+escape(label)+'</span><select name="'+name+'">'+options(values,current)+'</select></label>';}
function msg(form,text){let node=$('[role=status]',form);if(node)node.textContent=text;}
function statusBox(){return '<p class="form-status" role="status"></p>';}
async function api(url, opt={}){
  const res=await fetch(url,{cache:'no-store',...opt});let data;
  try{data=await res.json();}catch{throw Error('暂时无法读取服务器响应，请重试。');}
  if(!res.ok)throw Object.assign(Error(data.error||'请求失败，请重试。'),{status:res.status});
  return data;
}
const post=(u,data)=>api(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
const iconSearch='<svg aria-hidden="true" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>';
function errorPage(error){
  const denied=error.status===401||error.status===403,missing=error.status===404;
  main.innerHTML=back+'<section class="panel notice"><h1>'+(denied?'需要管理员权限':missing?'资料暂不可用':'暂时无法加载')+'</h1><p>'+escape(error.message)+'</p>'+(denied?'<a class="btn primary" href="/signin-with-chatgpt?return_to=%2Fadmin" target="_top">管理员登录</a>':btn('重新加载','id="retry"'))+'</section>';
  $('#retry')?.addEventListener('click',()=>location.reload());
}
const formatsOf=r=>String(r.formats||'').split(/[,，、]/).map(i=>i.trim().toUpperCase()).filter(Boolean);
function cover(r){
  const drill=/练习|刷题|模拟|题库/.test(String(r.kind)+String(r.title))&&!/逐章精讲/.test(r.title);
  const short=/习概|习思想|习近平/.test(r.subject)?'习概':String(r.subject||'笔记').slice(0,4);
  return '<div class="cover'+(drill?' drill':'')+'" aria-hidden="true"><small>'+escape(r.kind||'学习资料')+'</small><b>'+escape(short)+'</b><i>'+escape(r.label||'')+'</i></div>';
}
function card(r){
 return '<article class="card"><a class="card-link" href="'+detailUrl(r.id)+'">'+cover(r)+'<div class="cardbody"><div class="meta">'+escape([r.subject,r.year].filter(Boolean).join(' · '))+'</div><h3>'+escape(r.title)+'</h3><p>'+escape(r.summary||'')+'</p><div class="card-tags">'+[r.kind,...formatsOf(r),r.checkStatus||'待说明'].filter(Boolean).map(t=>'<span class="tag">'+escape(t)+'</span>').join('')+'</div><div class="card-foot"><small>'+escape(formatDate(r.updated))+(r.label?' · '+escape(r.label):'')+'</small><b aria-hidden="true">↗</b></div></div></a></article>';
}
const archiveNotice='本批资料由川北医学院2024级同学整理，仅供学习参考。教材、授课重点和考试要求可能因学期而异，请以本学期教材和任课老师通知为准。';
function catalogHome(){
 const all=catalog.items||[],facet=(key)=>[...new Set(all.flatMap(r=>key==='formats'?formatsOf(r):[r[key]]).filter(Boolean))].sort();
 const filter=(label,key,values)=>'<label class="filter-control"><span>'+label+'</span><select name="'+key+'" aria-label="'+label+'"><option value="">全部'+label+'</option>'+options(values,qs.get(key))+'</select></label>';
 document.title='期末资料库 · 小博土';
 main.innerHTML='<section class="hero"><div class="hero-copy"><div class="kicker">学习资料 <span>/</span> STUDY LIBRARY</div><h1>期末资料库</h1><p>'+escape(settings.intro||'小博土整理的复习讲义、章节练习与模拟卷。按科目查找，查看版本后免费下载。')+'</p><div class="hero-note"><span class="dot"></span> 当前公开资料免费 <span>·</span> 自愿支持</div><a class="guest-jump" href="#topicPoll">给小博土留言 ↗</a></div>'+$('#hero-art').innerHTML+'</section>'+(settings.announcement?'<p class="notice">'+escape(settings.announcement)+'</p>':'')+'<section id="library"><div class="section-head"><div><div class="kicker">RESOURCE INDEX</div><h2>资料目录</h2></div><span class="count" id="total"></span></div><form id="filterForm" class="toolbar"><label class="search">'+iconSearch+'<input type="search" name="q" aria-label="搜索资料" placeholder="搜索标题、科目、标签或简介" value="'+escape(qs.get('q'))+'"></label><div class="filterbar filters">'+filter('科目','subject',facet('subject'))+filter('学年','year',facet('year'))+filter('类型','kind',facet('kind'))+filter('格式','formats',facet('formats'))+'<button class="text-btn" type="reset">清除筛选</button></div></form><div class="list-caption"><span>最近更新</span><span id="lastUpdate"></span></div><div id="results"></div></section><div class="guide"><div><strong>有资料想分享？</strong><p>上传你的复习笔记，审核后收录到资料库。</p></div><a class="btn" href="/resources/submit">提交资料 ↗</a></div>';
 main.insertAdjacentHTML('beforeend','<section class="panel" id="topicPoll"></section>'+fallbackLink());installNotes();
 const form=$('#filterForm');
 function refresh(update=false){
  if(update){
    for(const [key,value] of new FormData(form)){if(value)qs.set(key,value);else qs.delete(key);}
    qs.delete('page');history.replaceState(null,'',path+(qs.size?'?'+qs:''));
  }
  const q=(qs.get('q')||'').trim().toLowerCase();
  const items=all.filter(r=>['subject','year','kind'].every(k=>!qs.get(k)||r[k]===qs.get(k))&&(!qs.get('formats')||formatsOf(r).includes(qs.get('formats')))&&[r.title,r.subject,r.tags,r.summary].join(' ').toLowerCase().includes(q)).sort((a,b)=>Number(b.priority||0)-Number(a.priority||0)||String(b.updated).localeCompare(String(a.updated)));
  const page=Math.min(Math.max(1,parseInt(qs.get('page'),10)||1),Math.max(1,Math.ceil(items.length/12)));
  $('#total').textContent=items.length+' 份资料';$('#lastUpdate').textContent=items.length?'更新于 '+formatDate(items.map(r=>r.updated).sort().at(-1)):'';
  const group=items.slice((page-1)*12,page*12);
  const groups=settings.year?[[settings.year+' · 本学年',group.filter(r=>r.year===settings.year)],['其他学年',group.filter(r=>r.year!==settings.year)]]:[['',group]];
  $('#results').innerHTML=items.length?groups.filter(g=>g[1].length).map(([title,rows])=>(title?'<h3 class="year-title">'+escape(title)+'</h3>':'')+'<div class="cards">'+rows.map(card).join('')+'</div>').join('')+'<div class="actions">'+[page>1?[page-1,'上一页']:null,page*12<items.length?[page+1,'下一页']:null].filter(Boolean).map(([n,t])=>{const p=new URLSearchParams(qs);p.set('page',n);return '<a class="btn" href="?'+escape(p)+'#library">'+t+'</a>';}).join('')+'</div>':'<div class="panel notice"><h3>'+(all.length?'没有找到匹配的资料':'暂时还没有公开资料')+'</h3><p>'+(all.length?'可换个关键词，或清除筛选条件。':'有合适的笔记，可以先提交给整理者审核。')+'</p>'+ (all.length?btn('清除筛选','id="clear"'):'<a href="/resources/submit">提交资料 ↗</a>')+'</div>';
  $('#clear')?.addEventListener('click',()=>form.reset());
 }
 form.oninput=()=>refresh(true);form.onsubmit=e=>{e.preventDefault();refresh(true);};form.onreset=e=>{e.preventDefault();for(const el of form.elements)if(el.name)el.value='';refresh(true);};
 refresh();
 if(all.some(r=>String(r.tags).includes('2024级整理')))$('#library').insertAdjacentHTML('afterbegin','<p class="notice"><strong>往年资料说明</strong> '+archiveNotice+'</p>');
 if(location.pathname!=='/'&&settings.publicOrigin){main.insertAdjacentHTML('beforeend',shareBlock());attachShare();}
}
function info(rows){return '<dl class="info-grid">'+rows.filter(([k,v])=>v!==null&&v!==undefined&&v!=='').map(([k,v])=>'<div><dt>'+escape(k)+'</dt><dd>'+escape(v)+'</dd></div>').join('')+'</dl>';}
function fileRow(f,preview=true){
 const ext=String(f.ext||'').toLowerCase(), inline=['pdf','png','jpg','jpeg','webp'].includes(ext);
 return '<div class="file-row"><div><strong>'+escape(f.name)+'</strong><p class="muted">'+escape(ext.toUpperCase())+' · '+size(f.size)+(inline?'':' · 下载后使用办公软件打开')+'</p></div><div class="actions">'+(inline&&preview?btn('预览','data-preview="'+escape(f.id)+'" data-ext="'+escape(ext)+'"'):'')+'<a class="btn primary" href="/file/'+enc(f.id)+'">下载</a></div></div>';
}
function shareBlock(){
 if(!settings.publicOrigin || new URL(settings.publicOrigin).origin!==location.origin) return '';
 return '<details class="panel"><summary>分享此页</summary><div class="stack"><p>使用相机扫码打开此页。</p><img width="160" height="160" loading="lazy" src="/qr?path='+enc(path)+'" alt="资料分享二维码"><label class="field"><span>资料链接</span><input readonly value="'+escape(location.origin+path)+'"></label>'+btn('复制链接','id="copyLink"')+'<span role="status" id="copyResult"></span></div></details>';
}
function attachShare(){const copy=$('#copyLink');if(copy)copy.onclick=async()=>{try{await navigator.clipboard.writeText(location.origin+path);$('#copyResult').textContent='链接已复制。';}catch{$('#copyResult').textContent='请长按或选中上方链接复制。';}};}
function support(){
 const channels=(settings.channels||[]).filter(x=>trustedURL(x.url));if(!channels.length)return '';
 return '<details class="panel"><summary>自愿支持整理 · 查看收款码</summary><p>本份资料可免费下载。如果这份笔记帮你省了点时间，也欢迎随手支持一下，金额随意。谢谢你，祝期末顺利！——小博土</p>'+channels.map(c=>'<p>'+escape(c.channel)+'收款码</p><a href="'+trustedURL(c.url)+'" target="_blank" rel="noopener"><img width="150" loading="lazy" alt="'+escape(c.channel)+'收款码，可点开大图" src="'+trustedURL(c.url)+'"></a>').join('')+'<p>点开可放大，手机上可长按保存，再按支付应用提示操作。</p></details>';
}
async function detail(id){
 const {resource:r,versions=[],errata=[],ratings=[]}=await api('/api/resource/'+enc(id));
 const v=versions.find(x=>String(x.id)===String(r.current))||versions[0];if(!v)throw Error('资料暂时没有可用版本。');
 const oldYear=settings.year&&r.year&&/\d{4}/.test(r.year)&&Number(r.year.match(/\d{4}/)[0])<Number(String(settings.year).match(/\d{4}/)?.[0]);
 const notice=String(r.tags).includes('2024级整理')?'<p class="notice"><strong>资料使用说明</strong> '+archiveNotice+'</p>':'';
 main.innerHTML=lead(r.title,r.summary||'')+notice+'<div class="detail-layout stack"><section class="panel"><div class="section-head"><h2>适用范围</h2><span class="tag">'+escape(v.label)+'</span></div>'+info([['科目',r.subject],['学年',r.year],['年级',r.grade],['教材与版本',r.textbook||'未填写'],['资料类型',r.kind],['公开署名',r.author||'匿名'],['上传日期',formatDate(r.created)],['更新日期',formatDate(r.updated)]])+(oldYear?'<p class="notice">往年资料，请结合本学期教材、授课内容和考试要求使用。</p>':'')+'</section><section class="panel"><h2>制作与核对说明</h2>'+info([['内容来源',v.source||'未说明'],['AI 参与方式',v.ai||'未说明'],['人工核对',v.checkStatus||'待说明'],['核对范围与依据',v.scope||'未说明'],['核对日期',v.checked||'未填写']])+(v.issues?'<p class="notice"><strong>已知问题</strong> '+escape(v.issues)+'</p>':'')+'</section><section class="panel"><h2>预览与免费下载</h2>'+notice+'<div class="stack">'+((v.files||[]).filter(f=>Number(f.enabled)!==0).map(f=>fileRow(f)).join('')||'<p>此版本附件已停用。</p>')+'</div><div id="viewer"></div><p class="muted">手机内置浏览器无法保存时，可用右上角菜单选择“在浏览器打开”，再点下载。</p></section>'+support()+'<section class="panel"><h2>修订记录</h2>'+versions.map(k=>'<div class="admin-row"><strong>'+escape(k.label)+'</strong> <small>'+escape(formatDate(k.created))+'</small><p>'+escape(k.revision||'未填写修订摘要')+'</p>'+(k!==v&&Number(k.oldAllowed)?(k.files||[]).filter(f=>Number(f.enabled)!==0).map(f=>fileRow(f,false)).join(''):'')+'</div>').join('')+'</section>'+shareBlock()+'<div class="guide"><div><strong>发现题目或答案有误？</strong><p>注明页码、题号或章节，反馈会关联当前版本。</p></div><a class="btn" href="/resources/feedback?id='+enc(r.id)+'&version='+enc(v.id)+'">提交反馈 ↗</a></div></div>';
 $('#viewer').closest('section').insertAdjacentHTML('beforebegin',publicCorrections(errata));
 main.insertAdjacentHTML('beforeend',readerRating(v,ratings)+fallbackLink());handleForm($('#rateForm'),async data=>{await post('/api/rate',{...data,vid:v.id,requestId:ballotKey(v.id)});await detail(id);msg($('#rateForm'),'评分已保存。');});
 main.querySelectorAll('[data-preview]').forEach(b=>b.onclick=()=>{const u='/preview/'+enc(b.dataset.preview);const viewer=$('#viewer');viewer.innerHTML='<div class="actions"><a class="btn" href="'+u+'" target="_blank" rel="noopener">独立打开 ↗</a>'+btn('关闭预览','id="closePreview"')+'</div>'+(b.dataset.ext==='pdf'?'<iframe title="PDF 资料预览" loading="lazy" style="width:100%;height:68vh;border:0" src="'+u+'"></iframe>':'<a href="'+u+'" target="_blank" rel="noopener"><img style="max-width:100%" loading="lazy" alt="附件图片预览" src="'+u+'"></a>');$('#closePreview').onclick=()=>{viewer.replaceChildren();b.focus();};viewer.scrollIntoView({block:'nearest'});});
 attachShare();
}
function about(){
 main.innerHTML=lead('关于与使用说明','陈健博（小博土） · 川北医学院 2024 级临床医学本科生')+'<div class="stack"><section class="panel"><h2>这些资料从哪里来</h2><p>这里收录我自己整理、以及同学授权分享的复习讲义、练习与笔记。当前公开资料均可免费下载。拥有商业分享授权的作者可申请出售，由小博土审核；交易和结算尚未开放。本站由学生个人维护，与学校官方无隶属关系。</p></section><section class="panel"><h2>拿到资料后，先看这三项</h2><ol><li>核对科目、教材版次和适用学年。往年资料请对照本学期教材与授课要求。</li><li>查看每个版本的制作说明、AI 参与方式和人工核对范围。审核通过后才会公开，内容仍可能有错。</li><li>遇到疑问，保留页码或题号并提交纠错。修订后可以在详情页看到版本变化。</li></ol></section><section class="panel"><h2>投稿与权利反馈</h2><p>投稿需说明来源及分享授权。可匿名署名，表单中的私人联系方式仅管理员可见。若资料涉及授权、隐私或其他权益问题，请说明对应资料和位置。</p><div class="actions"><a class="btn primary" href="/resources/submit">参与投稿</a><a class="btn" href="/resources/feedback">纠错或权利反馈</a></div>'+(settings.contact?'<p>公开联系方式　'+escape(settings.contact)+'</p>':'')+'</section>'+shareBlock()+'</div>';
 attachShare();
}
async function feedback(){
 const items=catalog.items||[];let rid=qs.get('id')||'';
 if(rid&&!items.some(r=>r.id===rid))rid='';
 main.innerHTML=lead('纠错与权利反馈','请留下足够定位问题的信息。反馈和联系方式仅管理员可见。')+'<form class="panel stack" id="feedbackForm"><label class="field"><span>关联资料</span><select name="id"><option value="">全站反馈（未指定资料）</option>'+items.map(r=>'<option value="'+escape(r.id)+'"'+selected(r.id,rid)+'>'+escape(r.title)+'</option>').join('')+'</select></label><label class="field"><span>资料版本</span><select name="version" required disabled></select></label>'+choice('问题类型','type',['内容纠错','文件问题','权利反馈','其他'],'内容纠错')+field('页码、章节或题号','location','',false,'text','placeholder="例如：第 12 页，第 3 题"')+field('问题描述','description','',true,'textarea')+field('建议修改与依据','suggestion','',false,'textarea')+field('私人联系方式（可选）','contact')+'<div>'+btn('提交反馈','type="submit"',true)+'</div>'+statusBox()+'</form>';
 const form=$('#feedbackForm'),ridSelect=form.elements.id,vSelect=form.elements.version;let epoch=0;
 const change=async()=>{const tick=++epoch;vSelect.disabled=true;vSelect.innerHTML='<option value="">未关联具体资料</option>';if(!ridSelect.value)return;msg(form,'正在读取版本…');try{const d=await api('/api/resource/'+enc(ridSelect.value));if(tick!==epoch)return;vSelect.innerHTML=d.versions.map(v=>'<option value="'+escape(v.id)+'"'+selected(v.id,qs.get('version')||d.resource.current)+'>'+escape(v.label)+'</option>').join('');vSelect.disabled=false;msg(form,'');}catch(e){if(tick===epoch)msg(form,e.message+' 请重新选择资料后重试。');}};
 ridSelect.onchange=change;if(rid)await change();
 const requestId=crypto.randomUUID();form.onsubmit=async e=>{e.preventDefault();if(ridSelect.value&&(vSelect.disabled||!vSelect.value)){msg(form,'请先选择可用资料与版本。');return;}const b=$('[type=submit]',form);b.disabled=true;try{await post('/api/feedback',{...paramsToObject(form),requestId});form.innerHTML='<h2>反馈已收到</h2><p>管理员将结合你提交的资料版本核对。</p><a class="btn" href="/resources">返回资料库</a>';}catch(err){msg(form,err.message);b.disabled=false;}};
}
const metaFields=(r={})=>field('资料名称','title',r.title,true)+field('一句话简介','summary',r.summary,true,'textarea')+'<div class="grid">'+field('科目','subject',r.subject,true)+field('适用学年','year',r.year,true,'text','placeholder="例如：2026—2027"')+field('资料类型','kind',r.kind,true,'text','placeholder="例如：复习讲义"')+field('适用年级','grade',r.grade)+field('教材名称与版本','textbook',r.textbook)+field('标签（逗号分隔）','tags',r.tags)+field('公开署名（留空为匿名）','author',r.author)+'</div>';
const versionFields=()=>'<div class="grid">'+field('版本号','label','',true,'text','placeholder="例如：V1.0"')+choice('AI 参与方式','ai',['未说明','未使用','辅助排版','辅助整理','辅助生成初稿','其他（在来源中详述）'],'未说明')+choice('人工核对状态','checkStatus',['待说明','未核对','部分核对','已按所列范围核对'],'待说明')+field('核对日期','checked','','','date')+'</div>'+field('核对范围与依据','scope','','','textarea')+field('内容来源及分享授权情况','source','',true,'textarea')+field('已知问题','issues','','','textarea')+field('修订摘要','revision','',true,'text','placeholder="例如：首次整理，覆盖导论至第 3 章"');
function uploadForm(r=null,admin=false){
 const exts=settings.extensions||['pdf','docx','pptx','xlsx','png','jpg','jpeg','webp'];
 return '<form class="panel stack" id="uploadForm"><h2>资料信息</h2>'+metaFields(r||{})+(admin?'':saleFields()+field('私人联系方式（申请出售时必填，仅管理员可见）','contact'))+'<h2>版本与制作说明</h2>'+versionFields()+'<h2>上传附件</h2><label class="field dropzone" tabindex="0"><strong>选择文件，或拖到这里</strong><small>'+escape(exts.join('、').toUpperCase())+' · 最多 '+Number(settings.maxFiles||4)+' 个 · 单件 '+Number(settings.maxFileMB||8)+' MiB · 合计 '+Number(settings.maxTotalMB||12)+' MiB</small><input required multiple type="file" name="files" accept="'+exts.map(i=>'.'+escape(i)).join(',')+'"></label><p id="fileSelection" class="muted"></p><label class="check"><input type="checkbox" name="authorized" value="yes" required> 我确认有权分享所提交的文件，已检查其中的私人信息。</label><div class="actions">'+btn(admin?(r?'保存新版本':'保存为草稿'):'提交审核','type="submit"',true)+btn('取消上传','type="button" id="cancelUpload" hidden')+'</div><progress aria-label="文件上传进度" max="100" value="0" hidden></progress>'+statusBox()+'</form>';
}
function wireUpload(r=null,admin=false){
 const form=$('#uploadForm'),file=form.elements.files,drop=$('.dropzone',form),progress=$('progress',form),cancel=$('#cancelUpload'),send=$('[type=submit]',form);let key=crypto.randomUUID(),xhr;
 if(!admin){const toggle=()=>{const paid=form.elements.saleMode.value==='paid';$('#saleFields').hidden=!paid;for(const name of ['price','saleRights','contact'])form.elements[name].required=paid;};form.elements.saleMode.onchange=toggle;toggle();}
 form.oninput=()=>{key=crypto.randomUUID();};const selection=()=>{$('#fileSelection').textContent=Array.from(file.files).map(f=>f.name+'（'+size(f.size)+'）').join('、');};file.onchange=selection;
 drop.ondragover=e=>{e.preventDefault();drop.classList.add('dragging');};drop.ondragleave=()=>drop.classList.remove('dragging');drop.ondrop=e=>{e.preventDefault();drop.classList.remove('dragging');if(xhr)return;try{file.files=e.dataTransfer.files;key=crypto.randomUUID();selection();}catch{msg(form,'请使用“选择文件”添加附件。');}};
 drop.onkeydown=e=>{if(e.target===drop&&[' ','Enter'].includes(e.key)){e.preventDefault();file.click();}};
 cancel.onclick=()=>xhr?.abort();
 form.onsubmit=e=>{e.preventDefault();if(xhr)return;const files=Array.from(file.files);if(files.length>Number(settings.maxFiles||4)||files.some(f=>f.size>(settings.maxFileMB||8)*1048576)||files.reduce((sum,f)=>sum+f.size,0)>(settings.maxTotalMB||12)*1048576){msg(form,'附件数量或大小超过限制，请重新选择。');return;}
  const data=new FormData(form);if(r)data.set('id',r.id);data.set('requestId',key);
  xhr=new XMLHttpRequest();xhr.open('POST',admin?'/api/admin/upload':'/api/submit');send.disabled=true;cancel.hidden=false;progress.hidden=false;progress.value=0;
  const controls=[...form.querySelectorAll('input,select,textarea')];controls.forEach(c=>c.disabled=true);
  const restore=()=>{xhr=null;send.disabled=false;send.textContent='重试提交';controls.forEach(c=>c.disabled=false);cancel.hidden=true;progress.hidden=true;};
  xhr.upload.onprogress=e=>{if(e.lengthComputable){progress.value=Math.floor(e.loaded/e.total*100);msg(form,progress.value===100?'传输完成，正在保存文件和资料记录…':'正在传输 '+progress.value+'%');}};
  xhr.onload=()=>{let result;try{result=JSON.parse(xhr.responseText);}catch{result={error:'服务器响应异常'};}if(xhr.status<200||xhr.status>=300||!result.ok){restore();msg(form,result.error||'提交失败，请重新选择或重试。');return;}xhr=null;form.innerHTML='<h2>'+(admin?'已保存':'投稿已提交')+'</h2><p>'+(admin?'请在资料管理中检查发布状态。':'待审核。请保存回执编号：<strong>'+escape(result.receipt||result.id)+'</strong>')+'</p><a class="btn primary" href="'+(admin?'/admin':'/resources')+'">'+(admin?'返回资料管理':'返回资料库')+'</a>';};
  xhr.onerror=()=>{restore();msg(form,'连接中断，请重试。');};xhr.onabort=()=>{restore();msg(form,'已停止本次传输。若服务器已收到，重试会使用同一提交编号。');};msg(form,'准备上传…');xhr.send(data);
 };
}
function submission(){main.innerHTML=lead('投稿资料','提交后进入审核。公开署名会显示在资料页，私人联系方式仅管理员可见。')+uploadForm();wireUpload();}
function handleForm(form,fn){
 form.onsubmit=async event=>{event.preventDefault();const b=event.submitter||$('[type=submit]',form);if(b?.disabled)return;if(b)b.disabled=true;msg(form,'正在保存…');try{const result=await fn(paramsToObject(form),form);msg(form,typeof result==='string'?result:'已保存。');}catch(e){msg(form,e.message);}finally{if(b)b.disabled=false;}};
}
function managementNav(){
 return '<nav class="actions admin-nav" aria-label="后台导航">'+[['overview','概览'],['weekly','每周统计'],['resources','资料管理'],['pending','投稿审核'],['feedback','纠错与反馈'],['errata','公开勘误'],['notes','匿名来信'],['subjects','科目与标签'],['settings','网站设置'],['upload','上传资料']].map(([t,label])=>'<a class="btn'+((qs.get('tab')||'overview')===t?' primary':'')+'" href="/admin?tab='+t+'">'+label+'</a>').join('')+'</nav>';
}
const manageURL=id=>'/admin?tab=edit&id='+enc(id);
function manageList(items){return items.length?items.map(r=>'<div class="file-row"><div><strong>'+escape(r.title)+'</strong><p class="muted">'+escape([r.subject,r.year,r.label,stateName[r.status]].filter(Boolean).join(' · '))+'</p></div><a class="btn" href="'+manageURL(r.id)+'">查看与管理</a></div>').join(''):'<p class="notice">暂无符合条件的资料。</p>';}
function weeklyErrorName(event){
 const [kind,...reason]=event.split('_');
 const operation=kind==='preview'?'预览':'下载';
 const reasons={unavailable:'链接失效或文件未公开',unsupported:'格式不支持预览',missing:'存储中缺少附件',service_error:'文件服务异常'};
 return operation+' · '+(reasons[reason.join('_')]||'请求错误');
}
async function weeklyTab(){
 const data=await api('/api/admin/weekly');
 const link=row=>row.rid&&row.title?'<a href="'+manageURL(row.rid)+'">'+escape(row.title)+'</a>':'未关联到公开资料';
 const dateRange=escape(data.startDay)+' 至 '+escape(data.endDay)+'（北京时间，含今天）';
 const total=rows=>rows.reduce((sum,row)=>sum+Number(row.requests),0);
 const ranking=data.downloads.map((row,i)=>'<li class="file-row"><span>'+String(i+1)+'. '+link(row)+'</span><strong>'+Number(row.requests)+' 次</strong></li>').join('');
 const failures=data.errors.map(row=>'<li class="file-row"><div><strong>'+link(row)+'</strong><p class="muted">'+escape(weeklyErrorName(row.event))+'</p></div><span>'+Number(row.requests)+' 次</span></li>').join('');
 main.innerHTML=lead('每周统计',dateRange)+managementNav()+
  '<section class="panel"><h2>资料下载排行</h2><p>近七天共 '+total(data.downloads)+' 次下载请求返回附件。统计从此功能上线起记录，重复请求会重复计数。</p>'+
  (ranking?'<ol>'+ranking+'</ol>':'<p class="muted">这段时间还没有记录到下载请求。</p>')+'</section>'+
  '<section class="panel"><h2>文件请求错误</h2><p>近七天共 '+total(data.errors)+' 次。涵盖下载和预览接口返回的错误。</p>'+
  (failures?'<ul>'+failures+'</ul>':'<p class="muted">这段时间没有记录到文件请求错误。</p>')+'</section>'+
  '<section class="panel"><h2>纠错与权利反馈</h2>'+info([['近七天新收到',data.feedback.received],['当前待处理（全部日期）',data.feedback.pending],['当前核对中（全部日期）',data.feedback.checking]])+
  '<a class="btn" href="/admin?tab=feedback">查看与处理反馈</a></section>';
}
async function admin(){
 if(qs.get('tab')==='weekly'){await weeklyTab();return;}
 adminData=await api('/api/admin');settings=adminData.settings;const {items=[],feedback:messages=[],counts={}}=adminData;
 const tab=qs.get('tab')||'overview',head=lead('资料管理','上传、审核与修订资料，处理同学的反馈。')+managementNav();
 if(tab==='notes'||tab==='topics'){await noteAdmin(head);return;}
 if(['errata'].includes(tab)){await communityAdmin(tab,head,items);return;}
 if(tab==='upload'||tab==='newversion'){
  const r=tab==='newversion'?(await api('/api/admin/resource/'+enc(qs.get('id')))).resource:null;
  main.innerHTML=head+'<h2>'+(r?'更新版本 · '+escape(r.title):'上传新资料')+'</h2>'+(r?.status==='published'?'<p class="notice">保存后此版本将立即成为公开版本。</p>':'')+uploadForm(r,true);wireUpload(r,true);return;
 }
 if(tab==='edit'){
  const {resource:r,versions}=await api('/api/admin/resource/'+enc(qs.get('id')));
  main.innerHTML=head+'<section class="panel"><div class="section-head"><h2>'+escape(r.title)+'</h2><span class="tag">'+escape(stateName[r.status])+'</span></div>'+info([['投稿方式',r.saleCents?'申请出售 · 拟售价 ¥'+(r.saleCents/100).toFixed(2):'免费分享'],['投稿者私人联系方式',r.contact||'未提供'],['退回原因',r.reason||'']])+'<div class="actions"><a class="btn primary" href="/admin?tab=newversion&id='+enc(r.id)+'">上传新版本</a>'+(r.status==='published'?'<a class="btn" href="'+detailUrl(r.id)+'">查看公开页 ↗</a>':'')+'</div></section><details class="panel"><summary>编辑资料信息、科目与标签</summary><form class="stack" id="editForm">'+metaFields(r)+field('目录排序（数值越大越靠前）','priority',r.priority||0,false,'number','min="0" max="999"')+btn('保存修改','type="submit"',true)+statusBox()+'</form></details><section class="panel"><h2>发布与审核</h2><p>请检查来源、授权、文件完整性与隐私信息。撤回后原附件链接停止提供下载。</p><form class="stack" id="statusForm"><label class="field"><span>目标状态</span><select name="status">'+Object.entries(stateName).filter(([k])=>r.saleCents?k!=='published':k!=='approved_sale').map(([key,val])=>'<option value="'+key+'"'+selected(key,r.status)+'>'+val+'</option>').join('')+'</select></label>'+field('退回原因（需补充时必填）','reason',r.reason||'','', 'textarea')+btn('保存状态','type="submit"',true)+statusBox()+'</form></section><section class="panel"><h2>版本、制作说明与附件</h2>'+versions.map(v=>'<article class="admin-row"><h3>'+escape(v.label)+' '+(v.id===r.current?'<span class="tag">当前版本</span>':'')+'</h3>'+info([['修订',v.revision],['来源',v.source],['AI 参与',v.ai],['核对状态',v.checkStatus],['核对范围',v.scope],['核对日期',v.checked],['已知问题',v.issues]])+(v.id!==r.current?btn(Number(v.oldAllowed)?'停止提供旧版':'允许下载旧版','data-act="version" data-id="'+escape(v.id)+'" data-flag="'+(Number(v.oldAllowed)?0:1)+'"'):'')+(v.files||[]).map(f=>'<div class="file-row"><div><strong>'+escape(f.name)+'</strong><p class="muted">'+size(f.size)+' · '+(Number(f.enabled)?'启用':'停用')+'</p></div><div class="actions"><a class="btn" href="/file/'+enc(f.id)+'?review=1">审核下载</a>'+btn(Number(f.enabled)?'停用附件':'启用附件','data-act="file" data-id="'+escape(f.id)+'" data-flag="'+(Number(f.enabled)?0:1)+'"')+'</div></div>').join('')+'</article>').join('')+'<p id="actionMsg" role="status"></p></section>';
  handleForm($('#editForm'),async data=>{await post('/api/admin/edit',{...data,id:r.id});location.reload();});
  handleForm($('#statusForm'),async data=>{await post('/api/admin/status',{...data,id:r.id});location.reload();});
  main.querySelectorAll('[data-act]').forEach(b=>b.onclick=async()=>{b.disabled=true;const action=b.dataset.act;try{await post('/api/admin/'+action,{id:b.dataset.id,[action==='file'?'enabled':'oldAllowed']:Number(b.dataset.flag)});location.reload();}catch(e){$('#actionMsg').textContent=e.message;b.disabled=false;}});
  return;
 }
 if(tab==='settings'){
  main.innerHTML=head+'<section class="panel"><h2>资料备份</h2><p>包含文件、版本及私人投稿信息，请保存在自己的设备上。</p><a class="btn" href="/api/admin/backup">下载完整备份</a></section><section class="panel"><h2>展示信息</h2><form id="settingsForm" class="stack">'+field('首页介绍','intro',settings.intro,false,'textarea')+field('当前学年','year',settings.year)+field('公告','announcement',settings.announcement,false,'textarea')+field('公开联系方式','contact',settings.contact)+field('独立备用入口（已上线的 HTTPS 地址）','backupUrl',settings.backupUrl,false,'url')+btn('保存设置','type="submit"',true)+statusBox()+'</form></section><section class="panel"><h2>自愿支持</h2><p>仅显示已配置渠道。此处上传的图片将作为收款码公开展示。</p>'+['微信','支付宝'].map(c=>{const channel=(settings.channels||[]).find(k=>k.channel===c);return '<form class="stack support-form admin-row" data-channel="'+c+'"><h3>'+c+'</h3>'+(channel?'<img width="120" alt="'+c+'现有收款码" src="'+trustedURL(channel.url)+'">':'<p class="muted">尚未配置</p>')+'<input type="file" accept="image/png,image/jpeg,image/webp" name="file" aria-label="'+c+'收款码图片"><div class="actions">'+btn('上传或替换','type="submit"')+(channel?btn('移除渠道','type="button" data-remove'):'')+'</div>'+statusBox()+'</form>';}).join('')+'</section>';
  handleForm($('#settingsForm'),data=>post('/api/admin/settings',data));
  for(const form of main.querySelectorAll('.support-form')){
   const update=async(remove=false)=>{const data=new FormData(form);data.set('channel',form.dataset.channel);if(remove)data.set('remove','yes');else if(!form.elements.file.files.length)throw Error('请先选择图片。');await api('/api/admin/support',{method:'POST',body:data});location.reload();};
   handleForm(form,()=>update());const remove=$('[data-remove]',form);if(remove)remove.onclick=async()=>{remove.disabled=true;try{await update(true);}catch(e){msg(form,e.message);remove.disabled=false;}};
  }return;
 }
 if(tab==='feedback'){
  main.innerHTML=head+'<section class="panel"><h2>纠错与权利反馈</h2>'+(messages.length?messages.map(f=>'<article class="admin-row"><h3>'+escape(f.type)+'</h3>'+info([['资料',items.find(r=>r.id===f.rid)?.title||'全站反馈'],['版本标识',f.version],['页码或题号',f.location],['问题',f.description],['建议与依据',f.suggestion],['私人联系方式',f.contact],['收到时间',formatDate(f.created)]])+'<form class="stack feedback-update" data-id="'+escape(f.id)+'">'+choice('处理状态','status',feedbackStates,f.status)+btn('更新状态','type="submit"')+statusBox()+'</form></article>').join(''):'<p class="notice">暂无反馈。</p>')+'</section>';
  for(const f of main.querySelectorAll('.feedback-update'))handleForm(f,data=>post('/api/admin/feedback',{...data,id:f.dataset.id}));return;
 }
 if(tab==='subjects'){
  const vocab=key=>[...new Set(items.flatMap(r=>String(r[key]||'').split(/[,，、]/)).map(s=>s.trim()).filter(Boolean))].sort();
  main.innerHTML=head+'<section class="panel"><h2>科目与标签</h2><p>点击资料管理入口，可修改该资料所属科目及标签。筛选项随公开资料同步更新。</p>'+info([['科目',vocab('subject').join('、')||'暂无'],['标签',vocab('tags').join('、')||'暂无']])+manageList(items)+'</section>';return;
 }
 if(tab==='pending'||tab==='resources'){
  main.innerHTML=head+'<section class="panel"><h2>'+(tab==='pending'?'投稿审核':'全部资料')+'</h2>'+manageList(tab==='pending'?items.filter(r=>['pending','returned'].includes(r.status)):items)+'</section>';return;
 }
 main.innerHTML=head+'<section class="panel"><h2>概览</h2>'+info([['已发布',items.filter(r=>r.status==='published').length],['待审核投稿',items.filter(r=>r.status==='pending').length],['待处理反馈',messages.filter(f=>f.status==='待处理').length],...(counts.views||counts.downloads?[['页面访问请求',counts.views||0],['下载请求',counts.downloads||0]]:[])])+(counts.views||counts.downloads?'<p class="muted">请求次数可能包含重复访问和机器人，不代表独立人数或已保存文件数。</p>':'')+'</section><section class="panel"><h2>最近资料</h2>'+manageList(items.slice(0,5))+'</section>';
}
async function start(){
 if(path==='/admin'){await admin();return;}
 catalog=await api('/api/catalog');settings=catalog.settings||{};$('#publicContact').textContent=settings.contact?'联系小博土 · '+settings.contact:'';
 if(path==='/resources'||path==='/')catalogHome();
 else if(path==='/resources/submit')submission();
 else if(path==='/resources/about')about();
 else if(path==='/resources/feedback')await feedback();
 else if(path.startsWith('/resources/'))await detail(decodeURIComponent(path.slice('/resources/'.length)));
 else throw Object.assign(Error('请返回目录查找可用资料。'),{status:404});
 const active=path.startsWith('/resources/')&&!['/resources/about','/resources/submit'].includes(path)?'/resources':path;
 for(const link of document.querySelectorAll('header nav a'))if(link.getAttribute('href')===active)link.setAttribute('aria-current','page');
}
/* community UI */
start().catch(errorPage);
})();
