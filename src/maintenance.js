const BACKUP_TABLES=['resource','version','attachment','submission','feedback','settings','audit','metric','op','file_metric_daily','erratum','topic_poll','ballot','rating','note','note_like'];
async function backup(e){
 const sets=await e.DB.batch(BACKUP_TABLES.map(t=>query(e,'SELECT * FROM '+t)));
 const tables=Object.fromEntries(BACKUP_TABLES.map((name,i)=>[name,sets[i].results]));
 const keys=[...tables.attachment.map(a=>a.obj),...tables.settings.filter(s=>['微信','支付宝'].includes(s.key)).map(s=>s.value)];
 let index=-1;const encode=new TextEncoder();
 const stream=new ReadableStream({async pull(controller){
  if(index<0){index++;controller.enqueue(encode.encode(JSON.stringify({format:'xb-library-1',tables})+'\n'));return;}
  if(index>=keys.length){controller.enqueue(encode.encode(JSON.stringify({complete:true,count:index})+'\n'));controller.close();return;}
  const key=keys[index++],obj=await e.BUCKET.get(key);if(!obj){controller.error(Error('备份缺少对象。'));return;}
  const data=new Uint8Array(await obj.arrayBuffer());let parts=[];
  for(let pos=0;pos<data.length;pos+=24576)parts.push(btoa(String.fromCharCode(...data.subarray(pos,pos+24576))));
  controller.enqueue(encode.encode(JSON.stringify({key,data:parts.join('')})+'\n'));
 }});
 return response(stream,'application/x-ndjson',200,{'Content-Disposition':'attachment; filename="study-library-'+now().slice(0,10)+'.ndjson"'});
}
async function cleanup(e,cursor){
 const page=await e.BUCKET.list({limit:100,...(cursor?{cursor}:{})});let removed=0;
 for(const obj of page.objects){
  if(Date.now()-new Date(obj.uploaded).getTime()<86400000)continue;
  if(!await one(e,"SELECT obj FROM attachment WHERE obj=? UNION ALL SELECT value FROM settings WHERE value=? LIMIT 1",obj.key,obj.key)){await e.BUCKET.delete(obj.key);removed++;}
 }
 return {removed,cursor:page.truncated?page.cursor:null};
}
