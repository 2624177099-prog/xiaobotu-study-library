const defaultTopics=['诊断学腹部查体','医学影像学 CT 基础','医学统计学易错题'];
async function pollState(e){
 const row=await one(e,'SELECT round,options FROM topic_poll WHERE id=1');
 const round=row?.round||'first',options=row?JSON.parse(row.options):defaultTopics;
 const counts=await all(e,'SELECT optionId,COUNT(*) n FROM ballot WHERE round=? GROUP BY optionId',round);
 return {round,options:options.map((title,i)=>({title,count:counts.find(c=>c.optionId===i)?.n||0}))};
}
async function communityDetail(e,rid){
 const errata=await all(e,"SELECT x.location,x.original,x.correction,x.basis,x.created,v.label FROM erratum x JOIN version v ON x.vid=v.id WHERE v.rid=? AND x.visible=1 ORDER BY x.created DESC",rid);
 const ratings=await all(e,'SELECT vid,COUNT(*) n,ROUND(AVG(score),1) avg FROM rating WHERE vid IN (SELECT id FROM version WHERE rid=?) GROUP BY vid',rid);
 return {errata,ratings};
}
async function communityPost(e,route,b){
 if(route==='/api/admin/topics'){
  const options=str(b,'options',true,220).split('\n').map(x=>x.trim()).filter(Boolean);
  if(options.length<2||options.length>5||new Set(options).size!==options.length||options.some(x=>x.length>38))fail(400,'请填写 2–5 个不同的选题，每行一个，最多 38 字。');
  await e.DB.batch([query(e,'INSERT OR REPLACE INTO topic_poll VALUES(1,?,?)',uuid(),JSON.stringify(options)),audit(e,'new-poll','1')]);return {};
 }
 if(route==='/api/admin/errata'){
  const id=str(b,'id');
  if(id){if(!await one(e,'SELECT id FROM erratum WHERE id=?',id))fail(404,'勘误不存在');await e.DB.batch([query(e,'UPDATE erratum SET visible=0 WHERE id=?',id),audit(e,'withdraw-erratum',id)]);return {};}
  const vid=str(b,'vid',true);if(!await one(e,'SELECT id FROM version WHERE id=?',vid))fail(400,'版本不存在。');
  const row={id:uuid(),vid,location:str(b,'location',true,150),original:str(b,'original',true),correction:str(b,'correction',true),basis:str(b,'basis',true),created:now(),visible:1};
  await e.DB.batch([insert(e,'erratum',row),audit(e,'publish-erratum',vid)]);return {};
 }
 const voter=requestKey(b);
 if(route==='/api/vote'){
  const p=await pollState(e),choice=Number(b.optionId);
  if(p.round!==b.round||!Number.isInteger(choice)||!p.options[choice])fail(409,'投票已更新，请刷新。');
  await query(e,'INSERT INTO ballot(round,voter,optionId) VALUES(?,?,?) ON CONFLICT(round,voter) DO UPDATE SET optionId=excluded.optionId',p.round,voter,choice).run();return {poll:await pollState(e)};
 }
 const vid=str(b,'vid',true),score=Number(b.score);
 if(!Number.isInteger(score)||score<1||score>5)fail(400,'请选择 1–5 分。');
 const resource=await one(e,"SELECT id FROM resource WHERE current=? AND status='published' AND saleCents=0",vid);
 if(!resource)fail(404,'该版本暂不接受新评价。');
 await query(e,'INSERT INTO rating VALUES(?,?,?) ON CONFLICT(vid,voter) DO UPDATE SET score=excluded.score',vid,voter,score).run();return {};
}

async function postNote(e,req,path,b){
 if(path==='/api/notes'){
  const kind=str(b,'kind',true,20),body=str(b,'body',true,600),requestId=requestKey(b);
  if(!['comment','feedback','topic'].includes(kind))fail(400,'请选择有效的留言类型。');
  await insert(e,'note',{id:uuid(),kind,body,created:now(),receipt:uuid().replaceAll('-','').slice(0,14),requestId},true).run();
  const row=await one(e,'SELECT kind,body,receipt FROM note WHERE requestId=?',requestId);
  if(!row||row.body!==body||row.kind!==kind)fail(409,'提交编号已使用，请刷新重试。');
  return {receipt:row.receipt};
 }
 const id=str(b,'id',true,64);
 if(path==='/api/admin/note'){
  const row=await one(e,'SELECT * FROM note WHERE id=?',id);
  if(row?.kind!=='comment')fail(404,'公开留言不存在。');
  const amount=str(b,'amount',false,12)||'0';
  if(!/^\d{1,6}(\.\d{1,2})?$/.test(amount)||!['yes','no'].includes(b.visible))fail(400,'金额或展示状态有误。');
  const cents=Math.round(Number(amount)*100);
  if(cents!==row.tip&&cents>0&&b.verified!=='yes')fail(400,'请先核对收款记录、备注编号和实际金额。');
  await e.DB.batch([query(e,'UPDATE note SET visible=?,tip=? WHERE id=?',b.visible==='yes'?1:0,cents,id),audit(e,'moderate-note',id)]);
  return {};
 }
 const ip=req.headers.get('cf-connecting-ip');if(!ip)fail(503,'暂时无法确认网络地址，请稍后点赞。');
 const visible=await one(e,"SELECT id FROM note WHERE kind='comment' AND visible=1 AND id=?",id);
 if(!visible)fail(404,'留言暂不可见。');
 await query(e,"INSERT OR IGNORE INTO settings(key,value) VALUES('noteLikeSalt',?)",uuid()).run();
 const secret=await one(e,"SELECT value FROM settings WHERE key='noteLikeSalt'");
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode([secret.value,id,ip].join('|')));
 const hash=Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
 await query(e,'INSERT OR IGNORE INTO note_like VALUES(?,?)',id,hash).run();
 return {likes:(await one(e,'SELECT count(*) n FROM note_like WHERE noteId=?',id)).n};
}
async function noteList(e,url,admin){
 const offset=Number(url.searchParams.get('offset')||0);
 if(!Number.isSafeInteger(offset)||offset<0)fail(400,'页码无效。');
 const kind=admin?(url.searchParams.get('kind')||'comment'):'comment';
 if(!['comment','topic','feedback'].includes(kind))fail(400,'类别无效。');
 const rows=await all(e,"SELECT id,body,created,tip,"+(admin?'visible,receipt,':'')+"(SELECT COUNT(*) FROM note_like WHERE noteId=note.id) likes FROM note WHERE kind=? "+(admin?'':'AND visible=1 ')+'ORDER BY '+(admin?'':'(tip>0) DESC,')+'created DESC,id LIMIT 21 OFFSET ?',kind,offset);
 return {items:rows.slice(0,20),more:rows.length>20};
}
