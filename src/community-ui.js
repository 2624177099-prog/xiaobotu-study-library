const browserKeys=new Map();
function ballotKey(scope){
 const key='xb-ballot-'+scope;
 let id=browserKeys.get(key);
 try{id=localStorage.getItem(key)||id;}catch{}
 if(!id){id=crypto.randomUUID();browserKeys.set(key,id);try{localStorage.setItem(key,id);}catch{}}
 return id;
}
function fallbackLink(){
 return settings.backupUrl?'<p><a class="btn" href="'+trustedURL(settings.backupUrl)+'" target="_blank" rel="noopener">备用资料入口 ↗</a></p>':'';
}
function noteForm(kind,label,placeholder){
 return '<form class="stack note-form" data-kind="'+kind+'"><label class="field"><span>'+label+'</span><textarea name="body" rows="2" maxlength="600" required placeholder="'+placeholder+'"></textarea></label>'+btn('匿名提交','type="submit"',true)+statusBox()+'</form>';
}
function installNotes(){
 const node=$('#topicPoll');
 node.innerHTML='<h2>给小博土留言</h2><p class="muted">只写你想说的话。公开留言审核后展示，已核实的打赏留言优先。</p>'+noteForm('comment','公开留言','这份资料帮到了你吗？网站哪里还可以改？')+'<div id="readerNotes"></div><div class="note-grid"><section><h3>下一份想看什么？</h3>'+noteForm('topic','给小博土的选题建议','写下科目、章节，或最想弄懂的一道题')+'</section><section><h3>匿名反馈</h3>'+noteForm('feedback','仅小博土可见','遇到的问题，或想私下说的话')+'</section></div>';
 for(const form of node.querySelectorAll('.note-form')){
  let requestId=crypto.randomUUID();
  form.oninput=()=>{requestId=crypto.randomUUID();};
  handleForm(form,async data=>{
   const kind=form.dataset.kind,result=await post('/api/notes',{kind,body:data.body,requestId});
   form.reset();requestId=crypto.randomUUID();
   return kind==='comment'?'已收到，审核后公开。若想让此条留言显示打赏金额，可在打赏备注写下编号 '+result.receipt+'，或凭此编号私下联系小博土核对。':'已送达，仅小博土可见。';
  });
 }
 let page=0;
 async function loadNotes(){
  const list=$('#readerNotes');
  try{
   const result=await api('/api/notes?offset='+page*20);
   list.innerHTML='<h3>同学留言</h3>'+ (result.items.length?result.items.map(n=>'<article class="reader-note"><div class="note-author">匿名同学 '+(n.tip?'<span class="tip-badge">已打赏 ¥'+(n.tip/100).toFixed(2)+'</span>':'')+'</div><p>'+escape(n.body)+'</p><div class="note-meta"><small>'+formatDate(n.created)+'</small>'+btn('赞 · '+n.likes,'data-like="'+escape(n.id)+'"')+'</div></article>').join(''):'<p class="muted">暂无已公开的留言。</p>')+statusBox()+'<div class="actions">'+(page?btn('上一页','data-prev'):'')+(result.more?btn('下一页','data-next'):'')+'</div>';
   for(const button of list.querySelectorAll('[data-like]'))button.onclick=async()=>{button.disabled=true;try{const res=await post('/api/like',{id:button.dataset.like});button.textContent='已赞 · '+res.likes;}catch(err){msg(list,err.message);button.disabled=false;}};
   $('[data-prev]',list)?.addEventListener('click',()=>{page--;loadNotes();});$('[data-next]',list)?.addEventListener('click',()=>{page++;loadNotes();});
  }catch(err){list.innerHTML='<p>'+escape(err.message)+'</p>'+btn('重新加载留言','data-retry');$('[data-retry]',list).onclick=loadNotes;}
 }
 loadNotes();
}
async function noteAdmin(head){
 const kind=qs.get('kind')||'comment',offset=Math.max(0,Number(qs.get('offset'))||0),result=await api('/api/admin/notes?kind='+enc(kind)+'&offset='+offset);
 const link=(k,n=0)=>'/admin?tab=notes&kind='+enc(k)+'&offset='+n;
 main.innerHTML=head+'<section class="panel"><h2>匿名来信</h2><nav class="actions">'+[['comment','公开留言审核'],['topic','选题建议'],['feedback','私密反馈']].map(([k,t])=>'<a class="btn" href="'+link(k)+'">'+t+'</a>').join('')+'</nav>'+result.items.map(n=>'<article class="reader-note"><small>'+formatDate(n.created)+'</small><p>'+escape(n.body)+'</p>'+(kind==='comment'?'<form class="stack" data-id="'+escape(n.id)+'"><small>打赏匹配编号 '+escape(n.receipt)+'</small><label class="field">公开状态<select name="visible"><option value="no">未公开</option><option value="yes"'+(n.visible?' selected':'')+'>公开</option></select></label>'+field('实际到账金额（元，零表示普通留言）','amount',(n.tip/100).toFixed(2),true,'number','min="0" max="999999.99" step="0.01"')+'<label><input name="verified" type="checkbox" value="yes"> 已逐笔核对收款记录、留言编号与金额</label>'+btn('保存','type="submit"')+statusBox()+'</form>':'')+'</article>').join('')+(result.items.length?'':'<p>暂未收到。</p>')+'<div class="actions">'+(offset?'<a href="'+link(kind,Math.max(0,offset-20))+'">上一页</a>':'')+(result.more?'<a href="'+link(kind,offset+20)+'">下一页</a>':'')+'</div></section>';
 for(const form of main.querySelectorAll('[data-id]'))handleForm(form,data=>post('/api/admin/note',{...data,id:form.dataset.id}).then(()=>undefined));
}
function publicCorrections(rows){
 return '<section class="panel"><h2>公开勘误</h2>'+(rows.length?rows.map(x=>'<article class="admin-row"><h3>'+escape(x.label)+' · '+escape(x.location)+'</h3>'+info([['原文',x.original],['更正',x.correction],['依据',x.basis],['公布日期',formatDate(x.created)]])+'</article>').join(''):'<p class="muted">暂无已公布的勘误。发现疑问可在页末反馈。</p>')+'</section>';
}
function readerRating(v,rows){
 const row=rows.find(x=>x.vid===v.id);
 return '<section class="panel"><h2>同学评价</h2><p>'+escape(v.label)+' · '+(row?row.avg+' / 5 分，共 '+row.n+' 条评分':'还没有评分')+'</p><form id="rateForm" class="stack"><label class="field"><span>这份资料对复习有帮助吗？</span><select name="score" required><option value="">请选择</option>'+['帮助很小','帮助较小','一般','有帮助','很有帮助'].map((s,i)=>'<option value="'+(i+1)+'">'+(i+1)+' 分 · '+s+'</option>').join('')+'</select></label><p class="muted">匿名读者评价，同一浏览器可更新评分。</p>'+btn('提交评分','type="submit"')+statusBox()+'</form></section>';
}
function saleFields(){
 return '<label class="field"><span>投稿方式</span><select name="saleMode"><option value="free">免费分享</option><option value="paid">申请出售</option></select></label><div id="saleFields" hidden>'+field('拟售价（元）','price','',false,'number','min="0.01" step="0.01" max="99999.99"')+'<label class="check"><input type="checkbox" name="saleRights" value="yes"> 我拥有原创作品或已取得商业销售授权。</label><p>出售申请请填写私人联系方式。管理员核对内容、来源和定价后答复。目前仅受理申请，尚未开放购买或结算。</p></div>';
}
async function communityAdmin(tab,head,items){
 if(tab==='topics'){
  const {poll}=await api('/api/catalog');
  main.innerHTML=head+'<section class="panel"><h2>选题投票</h2>'+info(poll.options.map(o=>[o.title,o.count+' 票']))+'<form class="stack">'+field('下一轮选题，每行一项（2–5 项）','options','',true,'textarea')+'<p>发布后结束当前轮次，新一轮从零票开始。</p>'+btn('发布新一轮','type="submit"')+statusBox()+'</form></section>';
  handleForm($('form',main),async data=>{await post('/api/admin/topics',data);location.reload();});return;
 }
 const result=await api('/api/admin/errata');
 main.innerHTML=head+'<section class="panel"><h2>发布公开勘误</h2><form class="stack"><label class="field"><span>资料</span><select name="resource" required><option value="">请选择</option>'+items.map(r=>'<option value="'+escape(r.id)+'">'+escape(r.title)+'</option>').join('')+'</select></label><label class="field"><span>版本</span><select name="vid" required></select></label>'+field('页码、章节或题号','location','',true)+field('原文','original','',true,'textarea')+field('更正内容','correction','',true,'textarea')+field('核对依据','basis','',true,'textarea')+btn('发布勘误','type="submit"')+statusBox()+'</form></section><section class="panel"><h2>已发布的勘误</h2>'+result.items.map(x=>'<form class="errata-remove admin-row" data-id="'+escape(x.id)+'"><strong>'+escape(x.title)+' · '+escape(x.label)+'</strong><p>'+escape(x.location)+' · '+escape(x.correction)+'</p>'+btn('撤回本条勘误','type="submit"')+statusBox()+'</form>').join('')+'</section>';
 const form=$('form',main),select=form.elements.resource,versions=form.elements.vid;
 select.onchange=async()=>{const id=select.value;versions.replaceChildren();if(!id)return;try{const r=await api('/api/admin/resource/'+enc(id));if(select.value===id)for(const v of r.versions)versions.add(new Option(v.label,v.id));}catch(e){msg(form,e.message);}};
 handleForm(form,async data=>{await post('/api/admin/errata',data);location.reload();});
 for(const f of main.querySelectorAll('.errata-remove'))handleForm(f,async()=>{await post('/api/admin/errata',{id:f.dataset.id});location.reload();});
}
