import fs from 'node:fs';
const read=f=>fs.readFileSync(f,'utf8');
const src=f=>read('src/'+f);
const seeds=[];
for(const [i,prefix] of ['Xigai','川北'].entries()){
 const id=['xigai-guide','xigai-practice'][i],vid=id+'-first',label=['V3.0','V2.0'][i],stamp='2026-11-12T14:46:00Z';
 const files=fs.readdirSync('seed').filter(n=>n.startsWith(prefix)).map(name=>{
  const data=fs.readFileSync('seed/'+name),ext=name.split('.').pop(),key=id+'-'+ext;
  return {id:key,name:ext==='pdf'?['习概逐章精讲 V3.0.pdf','习概逐章单选与模拟卷 V2.0.pdf'][i]:name,ext,size:data.length,obj:'initial/'+key,vid,enabled:1,base64:data.toString('base64')};
 });
 seeds.push({resource:{id,title:['习概 · 逐章精讲与参考答案','习概 · 逐章单选与两套模拟卷'][i],subject:'习思想概论',year:'2026—2027',kind:['复习讲义','习题与模拟卷'][i],tags:['逐章精讲,材料分析','单项选择,模拟试卷'][i],summary:['导论与十七章逐章讲解，附核心背诵模块、材料分析参考答案及两套模拟卷。','按章节练习 244 道单选题，附 4 道材料分析训练、两套模拟卷及答案定位。'][i],author:'小博土',grade:'2024级临床医学',textbook:'《习近平新时代中国特色社会主义思想概论》，版次未填写',status:'published',current:vid,created:stamp,updated:stamp},version:{id:vid,rid:id,label,ai:'AI 辅助整理，具体参与环节待整理者补充',checkStatus:'核对范围待说明',scope:'尚未提供逐项人工核对记录。',checked:'',issues:['原录音未完成可靠逐字校对；教材印刷页码与 PDF 页序可能不同。模拟卷分值仅用于练习。','正式考试题型和分值尚未确认。请结合本学期授课要求使用。'][i],source:['据讲义自述，参考原彩色答案版、11月9日课堂答疑、教材扫描版及同学笔记。','据刷题册自述，参考逐章答案版、课堂答疑转写及相关笔记。'][i],revision:'首次收录原始 Word，并由同一文件转换 PDF 供在线阅读。',created:stamp,oldAllowed:0},files});
}
const archive=JSON.parse(read('seed/archive24.json')).map(({id,subject,title,summary,file})=>{
 const data=fs.readFileSync('seed/archive24/'+file),ext=file.split('.').pop(),vid=id+'-initial',key=id+'-'+ext;
 const stamp='2026-11-13T00:00:00+08:00';
 return {resource:{id,title,subject,year:'往年资料',kind:ext==='jpg'?'复习图表':'复习资料',tags:'2024级整理,往年资料',summary,author:'2024级同学整理 · 小博土分享',grade:'',textbook:'',status:'published',current:vid,created:stamp,updated:stamp},version:{id:vid,rid:id,label:'首次收录',ai:'未说明',checkStatus:'核对范围待说明',scope:'已核对附件完整性，知识点及答案的人工核对范围尚未提供。',checked:'',issues:'本学期的考试范围、题型及分值请以任课老师通知为准。',source:'由小博土提供的2024级同学复习资料。',revision:'首次收录原文件。',created:stamp,oldAllowed:0},files:[{id:key,name:ext==='jpg'?'病理生理学九个主题复习图.jpg':file,ext,size:data.length,obj:'archive24/'+key,vid,enabled:1,base64:data.toString('base64')}]};
});
const modules=fs.readdirSync('vendor/qr').map(f=>JSON.stringify('./'+f.replace('.js',''))+':(module,exports,require)=>{'+read('vendor/qr/'+f)+'}').join(',\n');
const qr='const QRCode=(()=>{const modules={'+modules+'},cache={};function req(k){if(!cache[k]){const m={exports:{}};cache[k]=m;modules[k](m,m.exports,req)}return cache[k].exports}return req("./index")})();';
const frame=src('frame.html').replace('{{STYLE}}',()=>src('style.css')).replace('{{ART}}',()=>src('art.html'));
fs.mkdirSync('dist/server',{recursive:true});
fs.writeFileSync('dist/server/index.js',[qr,'const WECHAT_IMAGE='+JSON.stringify(fs.readFileSync('seed/support/wechat.jpeg').toString('base64'))+';','const FRAME='+JSON.stringify(frame)+';', 'const CLIENT='+JSON.stringify(src('ui.js').replace('/* community UI */',()=>src('community-ui.js')))+';','const SEEDS='+JSON.stringify(seeds)+';','const ARCHIVE='+JSON.stringify(archive)+';',...['files.js','db.js','actions.js','maintenance.js','community.js','weekly.js','worker.js'].map(src)].join('\n'));
