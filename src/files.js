const MIME={
 pdf:"application/pdf",docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
 pptx:"application/vnd.openxmlformats-officedocument.presentationml.presentation",xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
 png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",webp:"image/webp"
};
const LIMITS={maxFileMB:8,maxTotalMB:12,maxFiles:4,extensions:Object.keys(MIME)};
const MB=1024*1024;
function fail(status,message){throw Object.assign(new Error(message),{status});}
function checkOffice(bytes,ext){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const end=bytes.length-22;
 let pos=end;
 while(pos>=Math.max(0,end-65535)&&view.getUint32(pos,true)!==0x06054b50)pos--;
 if(pos<0||pos<end-65535)fail(400,"Office 文件目录损坏。");
 const count=view.getUint16(pos+10,true),central=view.getUint32(pos+16,true);
 if(count>3500||!count||central>=pos)fail(400,"Office 文件结构异常。");
 const names=new Set();let total=0,cursor=central;
 for(let i=0;i<count;i++){
  if(cursor+46>pos||view.getUint32(cursor,true)!==0x02014b50)fail(400,"无法读取 Office 文件目录。");
  const len=view.getUint16(cursor+28,true),extra=view.getUint16(cursor+30,true),note=view.getUint16(cursor+32,true);
  const name=new TextDecoder().decode(bytes.subarray(cursor+46,cursor+46+len));
  total+=view.getUint32(cursor+24,true);
  if(total>100*MB||view.getUint16(cursor+8,true)&1||/(^\/|\.\.\/|\\|vbaProject|\/embeddings\/|activeX|\.(?:exe|dll|js|html?|cmd|bat|vbs)$)/i.test(name))fail(400,"不接收加密、嵌入程序或结构异常的 Office 文件。");
  names.add(name);cursor+=46+len+extra+note;
 }
 if(cursor!==pos||!names.has("[Content_Types].xml")||!names.has({docx:"word/document.xml",pptx:"ppt/presentation.xml",xlsx:"xl/workbook.xml"}[ext]))fail(400,"文件内容与 Office 扩展名不符。");
}
async function validateFile(file,imagesOnly=false){
 if(!file||typeof file.arrayBuffer!=="function"||!file.name||!file.size||file.size>LIMITS.maxFileMB*MB)fail(400,"请选择非空、大小符合限制的附件。");
 const name=file.name.normalize("NFC"),ext=name.split(".").pop().toLowerCase();
 if(!Object.hasOwn(MIME,ext)||name.length>220||/[\\/\x00-\x1f\x7f]/.test(name))fail(400,"文件名或格式不支持。");
 if(imagesOnly&&!MIME[ext].startsWith("image/"))fail(400,"收款码仅支持图片。");
 if(file.type&&!["application/octet-stream",MIME[ext],...(["docx","xlsx","pptx"].includes(ext)?["application/zip"]:[])].includes(file.type.toLowerCase()))fail(400,"文件类型和扩展名不符。");
 const bytes=new Uint8Array(await file.arrayBuffer()),sig=Array.from(bytes.slice(0,12)),ascii=(a,b)=>new TextDecoder().decode(bytes.slice(a,b));
 let valid=true;
 if(ext==="pdf")valid=ascii(0,5)==="%PDF-"&&ascii(Math.max(0,bytes.length-2048),bytes.length).includes("%%EOF");
 else if(ext==="png")valid=[137,80,78,71,13,10,26,10].every((v,i)=>sig[i]===v)&&ascii(12,16)==="IHDR";
 else if(["jpg","jpeg"].includes(ext))valid=sig[0]===255&&sig[1]===216&&sig[2]===255&&bytes.at(-2)===255&&bytes.at(-1)===217;
 else if(ext==="webp")valid=ascii(0,4)==="RIFF"&&ascii(8,12)==="WEBP";
 else {valid=sig[0]===80&&sig[1]===75&&bytes.length>=22;if(valid)checkOffice(bytes,ext);}
 if(!valid)fail(400,"文件内容与扩展名不符或文件不完整。");
 return {name,ext,size:bytes.length,bytes};
}
// Bound the incoming stream before invoking the multipart parser, including chunked uploads.
async function readBody(req,multipart){
 const limit=multipart?(LIMITS.maxTotalMB+1)*MB:48*1024;
 if(Number(req.headers.get("content-length"))>limit)fail(413,"提交内容超过大小限制。");
 const reader=req.body?.getReader();if(!reader)fail(400,"请求内容为空。");
 let chunks=[],size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();fail(413,"提交内容超过大小限制。");}chunks.push(value);}
 const body=new Response(new Blob(chunks),{headers:{"content-type":req.headers.get("content-type")||""}});
 try{return multipart?await body.formData():await body.json();}catch{fail(400,"表单未能读取，请重新提交。");}
}
