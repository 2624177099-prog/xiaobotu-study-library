import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { localBindings } from '../dev.mjs'
import worker from '../dist/server/index.js'

test('每周报表按北京时间分界，区分下载、错误、当前反馈积压和私有审核', async t => {
  const dir=await mkdtemp(join(tmpdir(),'weekly-qa-'))
  const storage=await localBindings(dir)
  t.after(async()=>{storage.close(); await rm(dir,{recursive:true,force:true})})
  const env={...storage,ADMIN_EMAIL:'owner@example.invalid'}
  const fakeNow=Date.parse('2026-11-14T16:15:00Z') // 11 月 15 日 00:15
  t.mock.method(Date,'now',()=>fakeNow)
  const auth={'oai-authenticated-user-id':'local-owner','oai-authenticated-user-email':env.ADMIN_EMAIL}
  async function get(path,headers={}){
    const pending=[]
    const result=await worker.fetch(new Request('https://test.example'+path,{headers}),env,{waitUntil:p=>pending.push(p)})
    await Promise.all(pending)
    return result
  }
  assert.equal((await get('/api/admin/weekly')).status,403)
  const catalog=await (await get('/api/catalog')).json()
  const getBundle=async id=>(await (await get('/api/resource/'+id)).json()).versions[0].files
  const [first,second]=catalog.items.slice(0,2)
  const attachment=(await getBundle(first.id))[0], next=(await getBundle(second.id))[0]
  for(const f of [attachment,next,attachment])assert.equal((await get('/file/'+f.id)).status,200)
  assert.equal((await get('/file/'+next.id+'?review=1',auth)).status,200)
  assert.equal((await get('/file/one-arbitrary-unknown-path')).status,404)
  assert.equal((await get('/file/second-arbitrary-unknown-path')).status,404)
  const guide=await getBundle('xigai-guide')
  assert.equal((await get('/preview/'+guide.find(f=>f.ext==='docx').id)).status,415)
  assert.equal((await get('/preview/'+guide.find(f=>f.ext==='pdf').id)).status,200)
  await env.DB.prepare("INSERT INTO file_metric_daily VALUES (?,?,?,?)").bind('2026-11-08',first.id,'download',50).run()
  await env.DB.prepare("INSERT INTO file_metric_daily VALUES (?,?,?,?)").bind('2026-11-09',first.id,'download',1).run()
  for(const [when,state] of [['2026-11-08T15:59:59.999Z','待处理'],['2026-11-08T16:00:00.000Z','已修订'],['2026-11-14T16:00:00.000Z','核对中']]){
    await env.DB.prepare('INSERT INTO feedback(id,created,status,contact,requestId) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),when,state,'do-not-return-private-email',crypto.randomUUID()).run()
  }
  const report=await (await get('/api/admin/weekly',auth)).json()
  assert.equal(report.startDay,'2026-11-09');assert.equal(report.endDay,'2026-11-15')
  assert.deepEqual(report.downloads.map(({rid,requests})=>[rid,requests]),[[first.id,3],[second.id,1]])
  assert.deepEqual(report.errors.map(({rid,event,requests})=>[rid,event,requests]),[['','download_unavailable',2],['xigai-guide','preview_unsupported',1]])
  assert.deepEqual(report.feedback,{received:2,pending:1,checking:1})
  assert.doesNotMatch(JSON.stringify(report),/arbitrary-unknown-path|do-not-return-private-email/)
  assert.equal((await (await get('/api/catalog')).json()).downloads,undefined)
})
