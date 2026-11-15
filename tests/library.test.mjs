import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import { localServer } from '../dev.mjs'

const pdf = await readFile(new URL('../seed/Xigai_2026_Review_V3.pdf', import.meta.url))
const word = await readFile(new URL('../seed/Xigai_2026_Review_V3.docx', import.meta.url))
const formats = { pdf:'application/pdf', docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }

test('发布、私有审核、修订、撤回及重启持久化', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'resources-qa-'))
  const token = crypto.randomUUID()
  let host = await localServer({ dataDirectory: directory, token })
  const db = new DatabaseSync(join(directory, 'resources.sqlite'), { readOnly: true })
  t.after(async () => { db.close(); await host.close(); await rm(directory, { recursive:true, force:true }) })
  const get = (path, headers = {}) => fetch(host.url + path, { headers })
  const admin = { Authorization:'Bearer ' + token }
  const post = (path, body, { user = false, headers = {} } = {}) => {
    const multipart = body instanceof FormData
    return fetch(host.url + path, { method:'POST', body: multipart ? body : JSON.stringify(body),
      headers:{ Origin:host.url, ...(multipart ? {} : { 'Content-Type':'application/json' }), ...(user ? admin : {}), ...headers } })
  }
  const load = async res => {
    const text = await res.text()
    assert.ok(res.ok, 'Expected success, got ' + res.status + ' ' + text.slice(0,200))
    return JSON.parse(text)
  }
  const upload = ({ id, label = 'V1', title = '中文权限测试资料', files = true, requestId = crypto.randomUUID() } = {}) => {
    const form = new FormData()
    const fields = { title, label, subject:'习思想', year:'2026—2027', kind:'练习', source:'自动化测试，仅存在于临时数据库',
      authorized:'yes', requestId, summary:'验收测试资料', ai:'未说明', checkStatus:'未核对', author:'测试者', contact:'private@example.invalid',
      revision:'测试修订', ...(id ? { id } : {}) }
    for (const [key,value] of Object.entries(fields)) form.append(key,value)
    if (files) {
      form.append('files',new Blob([pdf],{type:formats.pdf}),'中文讲义.pdf')
      form.append('files',new Blob([word],{type:formats.docx}),'中文原稿.docx')
    }
    return form
  }
  const catalog = async () => (await load(await get('/api/catalog')))
  const detail = async id => load(await get('/api/resource/' + id))
  async function publish(id,status='published') { await load(await post('/api/admin/status', { id,status },{ user:true })) }
  function ref(title) { return db.prepare('SELECT * FROM resource WHERE title=?').get(title) }
  function attachments(version) { return db.prepare('SELECT * FROM attachment WHERE vid=?').all(version) }
  const denied = response => assert.ok([401,403,404].includes(response.status),'Unexpected status: '+response.status)
  await t.test('访客和伪造身份均无法写后台，跨站提交被拒绝', async () => {
    denied(await post('/api/admin/status', { id:'bogus',status:'published' }))
    denied(await get('/api/admin', { 'oai-authenticated-user-email':'owner@localhost.invalid','oai-authenticated-user-id':'local-owner' }))
    denied(await post('/api/admin/status', { id:'bogus',status:'published' },{ user:true, headers:{ Origin:'https://other.invalid' } }))
  })
  await t.test('微信码字节一致，读取公开资料无需登录或支付', async () => {
    const browse=await catalog()
    assert.deepEqual(browse.settings.channels.map(c=>c.channel),['微信'])
    assert.deepEqual(Buffer.from(await (await get(browse.settings.channels[0].url)).arrayBuffer()),await readFile(new URL('../seed/support/wechat.jpeg',import.meta.url)))
    assert.equal((await get('/support-image/'+encodeURIComponent('支付宝'))).status,404)
    assert.equal(browse.items.length,14)
    const seedDir=new URL('../seed/',import.meta.url)
    const seedFiles=await readdir(seedDir)
    for (const item of browse.items) {
      const bundle=await detail(item.id)
      for(const attachment of bundle.versions[0].files){
        const prefix=item.id==='xigai-guide'?'Xigai':'川北'
        const archive=JSON.parse(await readFile(new URL('archive24.json',seedDir),'utf8')).find(r=>r.id===item.id)
        const file=archive?archive.file:seedFiles.find(f=>f.startsWith(prefix)&&f.endsWith('.'+attachment.ext))
        assert.ok(file)
        const original=await readFile(new URL((archive?"archive24/":"")+encodeURIComponent(file),seedDir))
        const response=await get('/file/'+attachment.id)
        assert.equal(response.status,200)
        assert.deepEqual(Buffer.from(await response.arrayBuffer()),original)
      }
    }
  })
  let rid, firstFiles
  await t.test('中文名 PDF 和 Word 可上传、发布、匿名下载，内容和大小精确匹配', async () => {
    const requestId = crypto.randomUUID()
    await load(await post('/api/admin/upload',upload({ requestId }),{ user:true }))
    await load(await post('/api/admin/upload',upload({ requestId }),{ user:true }))
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM resource WHERE title=?').get('中文权限测试资料').n,1)
    rid = ref('中文权限测试资料').id
    await publish(rid)
    assert.ok((await catalog()).items.some(r=>r.id===rid))
    const doc = await detail(rid)
    firstFiles = doc.versions[0].files
    for (const attachment of firstFiles) {
      const bytes = attachment.ext === 'pdf' ? pdf : word
      const response = await get('/file/' + attachment.id)
      assert.equal(response.status,200)
      assert.equal(response.headers.get('content-type'),formats[attachment.ext])
      assert.ok(decodeURIComponent(response.headers.get('content-disposition')).includes(attachment.name))
      assert.equal(attachment.size,bytes.length)
      assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes)
    }
    const preview = await get('/preview/' + firstFiles.find(f=>f.ext==='pdf').id)
    assert.equal(preview.headers.get('content-type'),formats.pdf)
    assert.equal(Buffer.from(await preview.arrayBuffer()).subarray(0,5).toString(),'%PDF-')
    const noPreview = await get('/preview/' + firstFiles.find(f=>f.ext==='docx').id)
    assert.ok(noPreview.status>=400)
  })
  await t.test('重启运行实例后，目录和附件仍然存在', async () => {
    await host.close()
    host = await localServer({ dataDirectory:directory,token })
    assert.ok((await catalog()).items.some(r=>r.id===rid))
    const response=await get('/file/'+firstFiles[0].id)
    assert.deepEqual(Buffer.from(await response.arrayBuffer()),firstFiles[0].ext==='pdf'?pdf:word)
  })
  await t.test('纠错关联具体版本，访客数据不含私人联系方式', async () => {
    const version=(await detail(rid)).versions[0].id
    const payload={ id:rid, version, type:'内容纠错', location:'第2页', description:'测试题号与目录可能不符', suggestion:'请对照原稿', contact:'student-private@example.invalid', requestId:crypto.randomUUID() }
    const received=await load(await post('/api/feedback',payload))
    const duplicate=await load(await post('/api/feedback',payload))
    assert.equal(duplicate.id,received.id)
    await load(await post('/api/admin/feedback',{id:received.id,status:'核对中'},{user:true}))
    const queue=await load(await get('/api/admin',admin))
    assert.equal(queue.feedback.find(f=>f.id===received.id).status,'核对中')
    const data=db.prepare('SELECT rid,version,contact FROM feedback WHERE requestId=?').get(payload.requestId)
    assert.equal(data.rid,rid); assert.equal(data.version,version); assert.equal(data.contact,payload.contact)
    assert.ok(!(JSON.stringify(await detail(rid))+JSON.stringify(await catalog())).includes(payload.contact))
  })
  await t.test('新版本默认展示，修订可查，关闭旧版下载，撤回使原入口失效', async () => {
    await load(await post('/api/admin/upload',upload({ id:rid,label:'V2' }),{user:true}))
    await publish(rid)
    const updated=await detail(rid)
    assert.equal(updated.versions[0].label,'V2')
    assert.ok(updated.versions.some(v=>v.label==='V1'))
    for(const old of firstFiles) denied(await get('/file/'+old.id))
    const prior=updated.versions.find(v=>v.label==='V1')
    await load(await post('/api/admin/version',{id:prior.id,oldAllowed:1},{user:true}))
    assert.equal((await get('/file/'+firstFiles[0].id)).status,200)
    await load(await post('/api/admin/version',{id:prior.id,oldAllowed:0},{user:true}))
    denied(await get('/file/'+firstFiles[0].id))
    const current=updated.versions[0].files[0]
    await load(await post('/api/admin/file',{id:current.id,enabled:0},{user:true}))
    denied(await get('/file/'+current.id))
    await load(await post('/api/admin/file',{id:current.id,enabled:1},{user:true}))
    assert.equal((await get('/file/'+current.id)).status,200)
    await publish(rid,'withdrawn')
    denied(await get('/file/'+current.id))
    denied(await get('/preview/'+current.id))
    assert.ok(!(await catalog()).items.some(r=>r.id===rid))
  })
  await t.test('投稿回执对应待审记录，访客无法读取附件、来源或私人联系信息', async () => {
    const title='匿名投稿权限测试'
    const received=await load(await post('/api/submit',upload({ title })))
    assert.ok(Object.keys(received).length)
    const item=ref(title)
    assert.ok(item && item.status!=='published')
    denied(await get('/api/resource/'+item.id))
    const files=attachments(item.current)
    assert.ok(files.length>0)
    for(const file of files){ denied(await get('/file/'+file.id)); denied(await get('/preview/'+file.id)) }
    assert.ok(!(await catalog()).items.some(r=>r.id===item.id))
    await load(await post('/api/admin/status',{ id:item.id,status:'returned',reason:'请补充分享来源' },{user:true}))
    denied(await get('/file/'+files[0].id))
    assert.equal((await load(await get('/api/admin/resource/'+item.id,admin))).resource.reason,'请补充分享来源')
    await publish(item.id)
    assert.equal((await get('/file/'+files[0].id)).status,200)
    assert.ok(!(JSON.stringify(await detail(item.id))).includes('private@example.invalid'))
  })
  await t.test('选题、匿名读者评分和公开勘误支持修改与权限隔离',async()=>{
    const c=await catalog(),{round}=c.poll,requestId=crypto.randomUUID(),id=c.items[0].id,vid=c.items[0].current
    await load(await post('/api/vote',{round,requestId,optionId:0}))
    const second=await load(await post('/api/vote',{round,requestId,optionId:1}))
    assert.deepEqual(second.poll.options.map(o=>o.count),[0,1,0])
    for(const score of [2,5])await load(await post('/api/rate',{vid,score,requestId}))
    assert.deepEqual((await detail(id)).ratings,[{vid,n:1,avg:5}])
    const entry={vid,location:'第二页',original:'甲',correction:'乙',basis:'测试用依据'}
    denied(await post('/api/admin/errata',entry))
    await load(await post('/api/admin/errata',entry,{user:true}))
    assert.equal((await detail(id)).errata[0].correction,'乙')
    const errata=await load(await get('/api/admin/errata',admin))
    await load(await post('/api/admin/errata',{id:errata.items[0].id},{user:true}))
    assert.equal((await detail(id)).errata.length,0)
    await load(await post('/api/admin/topics',{options:'甲\n乙'},{user:true}))
    assert.equal((await post('/api/vote',{round,requestId,optionId:1})).status,409)
    assert.match(c.settings.contact,/17384338201/)
  })
  await t.test('出售须有商业授权，审核通过仍不公开附件',async()=>{
    const f=upload();f.set('saleMode','paid');f.set('price','5.50')
    assert.equal((await post('/api/submit',f)).status,400)
    f.set('saleRights','yes')
    const {id}=await load(await post('/api/submit',f))
    const item=await load(await get('/api/admin/resource/'+id,admin))
    assert.equal(item.resource.saleCents,550)
    assert.equal((await post('/api/admin/status',{id,status:'published'},{user:true})).status,409)
    await publish(id,'approved_sale')
    denied(await get('/api/resource/'+id))
    for(const file of item.versions[0].files)denied(await get('/file/'+file.id))
  })
  await t.test('匿名留言、私信、文字选题、打赏核实和同 IP 点赞',async()=>{
    const adminWrite=(b)=>post('/api/admin/note',b,{user:true})
    for(const kind of ['comment','comment','feedback','topic']){
      const data={kind,body:'一条匿名内容',requestId:crypto.randomUUID(),tip:9900}
      const first=await load(await post('/api/notes',data))
      assert.equal((await load(await post('/api/notes',data))).receipt,first.receipt)
    }
    assert.equal((await load(await get('/api/notes?kind=feedback'))).items.length,0)
    const rows=(await load(await get('/api/admin/notes',admin))).items
    assert.equal(rows.length,2)
    for(const n of rows)assert.equal(n.tip,0)
    const [ordinary,supporter]=rows
    for(const row of rows)await load(await adminWrite({id:row.id,visible:'yes',amount:'0'}))
    const paid={id:supporter.id,visible:'yes',amount:'3.50'}
    assert.equal((await adminWrite(paid)).status,400)
    denied(await post('/api/admin/note',{...paid,verified:'yes'}))
    await load(await adminWrite({...paid,verified:'yes'}))
    const publicList=(await load(await get('/api/notes'))).items
    assert.equal(publicList[0].id,supporter.id);assert.equal(publicList[0].tip,350)
    assert.equal(publicList[0].receipt,undefined)
    for(const row of [ordinary,ordinary,supporter])assert.equal((await load(await post('/api/like',{id:row.id}))).likes,1)
    for(const kind of ['topic','feedback']){
      const notes=(await load(await get('/api/admin/notes?kind='+kind,admin))).items
      assert.equal(notes.length,1)
      assert.equal((await adminWrite({id:notes[0].id,visible:'yes',amount:'0'})).status,404)
    }
  })
  await t.test('错误上传和不存在的下载返回错误状态码', async () => {
    const form=upload({ title:'伪装 PDF',files:false })
    form.append('files',new Blob(['<html></html>'],{type:formats.pdf}),'错误.pdf')
    const failed=await post('/api/admin/upload',form,{user:true})
    assert.ok(failed.status>=400 && failed.status<500)
    assert.equal(ref('伪装 PDF'),undefined)
    assert.equal((await get('/file/no-such-file')).status,404)
    assert.equal((await get('/api/resource/no-such-resource')).status,404)
  })
})

test('两个独立 Node 进程共用持久卷，第二次启动保留编辑和原始文件', async t => {
  const { spawn } = await import('node:child_process')
  const { once } = await import('node:events')
  const dir=await mkdtemp(join(tmpdir(),'resources-restart-'))
  const token=crypto.randomUUID()
  let processRun
  async function start(){
    const proc=spawn(process.execPath,['dev.mjs'],{
      cwd:new URL('../',import.meta.url),
      env:{ PORT:'0',DATA_DIR:dir,DEV_ADMIN_TOKEN:token },
      stdio:['ignore','pipe','pipe']
    })
    const stop=once(proc,'exit')
    const started=new Promise((resolve,reject)=>{
      let output=''
      proc.stdout.on('data',chunk=>{
        output+=chunk
        const match=/Resources: (http:\/\/127\.0\.0\.1:\d+)\/resources/.exec(output)
        if(match)resolve(match[1])
      })
      proc.once('exit',code=>reject(Error('Dev server terminated: '+code)))
      proc.once('error',reject)
    })
    processRun={proc,stop}
    return started
  }
  async function close(){
    if(!processRun)return
    processRun.proc.kill('SIGTERM')
    await processRun.stop
    processRun=undefined
  }
  t.after(async()=>{await close();await rm(dir,{recursive:true,force:true})})
  const first=await start()
  const initial=await (await fetch(first+'/api/resource/xigai-guide')).json()
  const doc=initial.versions[0].files.find(f=>f.ext==='docx')
  const formData={...initial.resource,title:'重启前编辑的讲义标题'}
  const edited=await fetch(first+'/api/admin/edit',{method:'POST',
    headers:{'Content-Type':'application/json',Origin:first,Authorization:'Bearer '+token},body:JSON.stringify(formData)})
  assert.equal(edited.status,200)
  await close()
  const second=await start()
  const item=await(await fetch(second+'/api/resource/xigai-guide')).json()
  assert.equal(item.resource.title,formData.title)
  const response=await fetch(second+'/file/'+doc.id)
  assert.deepEqual(Buffer.from(await response.arrayBuffer()),word)
})
