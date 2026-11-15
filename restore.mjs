// Restore only into a new local directory. Keep existing service data intact.
import fs from 'node:fs';
import {createInterface} from 'node:readline';
import {localBindings} from './dev.mjs';
import {resolve} from 'node:path';
const [file,directory]=process.argv.slice(2);
if(!file||!directory||fs.existsSync(directory))throw Error('Usage: node restore.mjs backup.ndjson NEW_DIRECTORY');
const staging=resolve(directory)+'.restoring';
if(fs.existsSync(staging))throw Error('Staging directory already exists.');
const e=await localBindings(staging);let tables,expected,completed=false,count=0;
try{
 for await(const line of createInterface({input:fs.createReadStream(file),crlfDelay:Infinity})){
  const row=JSON.parse(line);
  if(completed)throw Error('Trailing records.');
  if(!tables){
   if(row.format!=='xb-library-1')throw Error('Unknown backup version.');
   tables=row.tables;expected=new Set([...tables.attachment.map(f=>f.obj),...tables.settings.filter(s=>['微信','支付宝'].includes(s.key)).map(s=>s.value)]);
  }else if(row.complete){if(expected.size||row.count!==count)throw Error('Incomplete backup.');completed=true;}
  else{if(!expected.delete(row.key))throw Error('Unexpected object.');const bytes=Buffer.from(row.data,'base64');const meta=tables.attachment.find(a=>a.obj===row.key);if(meta&&meta.size!==bytes.length)throw Error('Size mismatch.');await e.BUCKET.put(row.key,bytes);count++;}
 }
 if(!completed)throw Error('Missing completion marker.');
 const commands=[];
 for(const name of ['resource','version','attachment','submission','feedback','settings','audit','metric','op','file_metric_daily','erratum','topic_poll','ballot','rating','note','note_like']){
  for(const row of tables[name]||[]){
   const keys=Object.keys(row);if(keys.some(k=>!/^\w+$/.test(k)))throw Error('Invalid column.');
   commands.push(e.DB.prepare('INSERT INTO '+name+' ('+keys.join(',')+') VALUES ('+keys.map(()=>'?').join(',')+')').bind(...Object.values(row)));
  }
 }
 await e.DB.batch(commands);e.close();fs.renameSync(staging,resolve(directory));console.log('Restored database and '+count+' objects.');
}catch(err){e.close();fs.rmSync(staging,{recursive:true,force:true});throw err;}
