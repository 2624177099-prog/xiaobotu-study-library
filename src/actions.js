async function upload(e,b,admin){
 const requestId=requestKey(b);
 const previous=await one(e,"SELECT rid FROM op WHERE requestId=?",requestId);
 if(previous)return {id:previous.rid,receipt:requestId};
 if(str(b,'authorized')!=='yes')fail(400,'请确认资料来源和分享授权。');
 const existingId=admin?str(b,'id'):'';let existing;
 if(existingId){existing=await one(e,'SELECT * FROM resource WHERE id=?',existingId);if(!existing)fail(404,'待更新资料不存在。');}
 const rid=existingId||uuid(),meta=metadata(b),version=makeVersion(b,rid);
 const files=b.getAll('files');if(!files.length||files.length>LIMITS.maxFiles||files.reduce((n,f)=>n+(f.size||0),0)>LIMITS.maxTotalMB*MB)fail(400,'附件数量或总大小超限。');
 const attachments=[];for(const file of files)attachments.push(await validateFile(file));
 const saleMode=str(b,'saleMode'),price=str(b,'price');
 let saleCents=0;
 if(saleMode==='paid'){
  if(!/^([1-9]\d{0,4}|0)(\.\d{1,2})?$/.test(price)||Number(price)<=0||!str(b,'contact',true,250)||str(b,'saleRights')!=='yes')fail(400,'出售申请需要有效价格、联系信息和商业分享授权。');
  saleCents=Math.round(Number(price)*100);
 }
 const created=now(),statements=[];
 if(existing)statements.push(query(e,'UPDATE resource SET '+Object.keys(meta).map(k=>k+'=?').join(',')+',current=?,updated=? WHERE id=?',...Object.values(meta),version.id,created,rid));
 else statements.push(insert(e,'resource',{id:rid,...meta,saleCents,status:admin?'draft':'pending',current:version.id,created,updated:created}));
 statements.push(insert(e,'version',version),insert(e,'op',{requestId,rid}));
 if(!existing)statements.push(insert(e,'submission',{id:uuid(),rid,contact:str(b,'contact',false,250),reason:'',authorized:1,requestId}));
 if(admin)statements.push(audit(e,'upload',rid));
 const objectKeys=[];
 try{
  for(const {bytes,...a} of attachments){const id=uuid(),obj='attachments/'+id;objectKeys.push(obj);await e.BUCKET.put(obj,bytes);statements.push(insert(e,'attachment',{...a,id,vid:version.id,obj}));}
  await e.DB.batch(statements);
 }catch(err){
  // In an ambiguous commit, keep objects whose DB references exist.
  for(const obj of objectKeys){if(!await one(e,'SELECT id FROM attachment WHERE obj=?',obj))await e.BUCKET.delete(obj);}
  const prior=await one(e,'SELECT rid FROM op WHERE requestId=?',requestId);if(prior)return {id:prior.rid,receipt:requestId};
  if(String(err).includes('UNIQUE'))fail(409,'版本号已存在，请填写新版本。');throw err;
 }
 return {id:rid,receipt:requestId};
}
async function feedback(e,b){
 const rid=str(b,'id'),version=str(b,'version'),requestId=requestKey(b),id=uuid();
 if(rid||version){if(!await one(e,"SELECT v.id FROM version v JOIN resource r ON r.id=v.rid WHERE r.id=? AND v.id=? AND r.status='published'",rid,version))fail(400,'关联资料或版本无效。');}
 await insert(e,'feedback',{id,rid:rid||null,version:version||null,type:str(b,'type',true,80),location:str(b,'location',false,240),description:str(b,'description',true,3000),suggestion:str(b,'suggestion'),contact:str(b,'contact',false,250),status:'待处理',created:now(),requestId},true).run();
 return {id:(await one(e,'SELECT id FROM feedback WHERE requestId=?',requestId)).id};
}
async function manage(e,path,b){
 const id=str(b,'id'),commands=[];
 if(path==='settings'){
  const backupUrl=str(b,'backupUrl',false,1000);
  if(backupUrl){let url;try{url=new URL(backupUrl)}catch{fail(400,'备用地址格式错误。')}if(url.protocol!=='https:'||url.username||url.password||url.hostname.endsWith('.chatgpt.site'))fail(400,'请填写独立托管的 HTTPS 地址。');}
  for(const key of ['backupUrl','intro','year','announcement','contact'])commands.push(query(e,'INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)',key,str(b,key)));
 }else if(path==='support'){
  const channel=str(b,'channel',true);if(!['微信','支付宝'].includes(channel))fail(400,'支持渠道无效。');
  const old=await one(e,'SELECT value FROM settings WHERE key=?',channel);
  if(str(b,'remove')==='yes')commands.push(query(e,'DELETE FROM settings WHERE key=?',channel));
  else {const f=await validateFile(b.get('file'),true),obj='support/'+uuid()+'.'+f.ext;await e.BUCKET.put(obj,f.bytes);commands.push(query(e,'INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)',channel,obj));}
  commands.push(audit(e,'support',channel));await e.DB.batch(commands);if(old)await e.BUCKET.delete(old.value);return {};
 }else{
  const table={edit:'resource',status:'resource',version:'version',file:'attachment',feedback:'feedback'}[path];
  if(!table||!id||!await one(e,'SELECT id FROM '+table+' WHERE id=?',id))fail(404,'记录不存在。');
  if(path==='edit'){const meta=metadata(b);if(b.priority!==undefined){const rank=Number(b.priority);if(!Number.isInteger(rank)||rank<0||rank>999)fail(400,'排序值须为 0 至 999 的整数。');meta.priority=rank;}commands.push(query(e,'UPDATE resource SET '+Object.keys(meta).map(k=>k+'=?').join(',')+', updated=? WHERE id=?',...Object.values(meta),now(),id));}
  if(path==='status'){
   const status=str(b,'status',true),reason=str(b,'reason');if(!['published','returned','withdrawn','archived','draft','pending','approved_sale'].includes(status)||status==='returned'&&!reason)fail(400,'请选择有效状态，并在退回时填写原因。');
   const item=await one(e,'SELECT saleCents FROM resource WHERE id=?',id);
   if(item.saleCents>0&&status==='published')fail(409,'此为付费申请，请选择“出售审核通过”。交易上线前附件保持私有。');
   if(!item.saleCents&&status==='approved_sale')fail(400,'此资料没有出售申请。');
   if(status==='published'&&!await one(e,'SELECT a.id FROM resource r JOIN attachment a ON a.vid=r.current WHERE r.id=? AND a.enabled=1',id))fail(400,'当前版本没有可发布的附件。');
   commands.push(query(e,'UPDATE resource SET status=?,updated=? WHERE id=?',status,now(),id),query(e,'UPDATE submission SET reason=? WHERE rid=?',reason,id));
  }
  if(path==='version'||path==='file'){const key=path==='file'?'enabled':'oldAllowed',flag=b[key];if(![0,1,true,false].includes(flag))fail(400,'状态无效。');commands.push(query(e,'UPDATE '+table+' SET '+key+'=? WHERE id=?',Number(flag),id));}
  if(path==='feedback'){const s=str(b,'status',true);if(!['待处理','核对中','已修订','暂不修改','信息不足'].includes(s))fail(400,'反馈状态无效。');commands.push(query(e,'UPDATE feedback SET status=? WHERE id=?',s,id));}
 }
 commands.push(audit(e,path,id));await e.DB.batch(commands);return {id};
}
