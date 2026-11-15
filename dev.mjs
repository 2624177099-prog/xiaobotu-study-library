/**
 * Local-only adapter for the production Worker. Requires Node 24 or newer.
 * Data and objects live outside the application bundle, including across restarts.
 */
import http from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { resolve, dirname, join } from 'node:path'
import { randomUUID, randomBytes, timingSafeEqual, createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { fileURLToPath, pathToFileURL } from 'node:url'

const project = dirname(fileURLToPath(import.meta.url))

class Statement {
  constructor(db, sql, args = []) { Object.assign(this, { db, sql, args }) }
  bind(...args) { return new Statement(this.db, this.sql, args) }
  executeWrite() {
    const { changes, lastInsertRowid } = this.db.prepare(this.sql).run(...this.args)
    return { success: true, results: [], meta: { changes, last_row_id: Number(lastInsertRowid) } }
  }
  async run() { return this.executeWrite() }
  async first(column) {
    const row = this.db.prepare(this.sql).get(...this.args)
    return column === undefined ? row ?? null : row?.[column] ?? null
  }
  async all() { return this.executeRead() }
  executeRead() {
    return { success: true, results: this.db.prepare(this.sql).all(...this.args), meta: {} }
  }
}

function d1(db) {
  return {
    prepare: sql => new Statement(db, sql),
    exec: sql => db.exec(sql),
    async batch(statements) {
      db.exec('BEGIN IMMEDIATE')
      try {
        const results = statements.map(s => s.db.prepare(s.sql).columns().length ? s.executeRead() : s.executeWrite())
        db.exec('COMMIT')
        return results
      } catch (error) { db.exec('ROLLBACK'); throw error }
    }
  }
}

async function migrate(db) {
  const dir = join(project, 'drizzle')
  const files = (await readdir(dir)).filter(f => f.endsWith('.sql')).sort()
  db.exec('CREATE TABLE IF NOT EXISTS _local_migrations (filename TEXT PRIMARY KEY, hash TEXT NOT NULL)')
  for (const name of files) {
    const sql = await readFile(join(dir, name), 'utf8')
    const hash = createHash('sha256').update(sql).digest('hex')
    const applied = db.prepare('SELECT hash FROM _local_migrations WHERE filename = ?').get(name)
    if (applied?.hash === hash) continue
    if (applied) throw Error('Already-applied migration changed: ' + name)
    db.exec('BEGIN IMMEDIATE')
    try {
      db.exec(sql)
      db.prepare('INSERT INTO _local_migrations VALUES (?,?)').run(name, hash)
      db.exec('COMMIT')
    } catch (error) { db.exec('ROLLBACK'); throw error }
  }
}

function bucket(directory) {
  // Hash arbitrary object keys to avoid treating them as filesystem paths.
  const pathFor = key => join(directory, createHash('sha256').update(key).digest('hex'))
  async function head(key) {
    try {
      const path = pathFor(key)
      const [meta, file] = await Promise.all([readFile(path + '.json', 'utf8'), stat(path)])
      const object = { ...JSON.parse(meta), size: file.size, uploaded: file.mtime }
      object.writeHttpMetadata = headers => {
        if (object.httpMetadata.contentType) headers.set('Content-Type', object.httpMetadata.contentType)
      }
      return object
    } catch (error) { if (error.code === 'ENOENT') return null; throw error }
  }
  return {
    head,
    async get(key, options = {}) {
      const obj = await head(key)
      if (!obj) return null
      let raw = await readFile(pathFor(key))
      if (options.range) {
        const { offset = 0, length, suffix } = options.range
        raw = suffix !== undefined ? raw.subarray(-suffix) : raw.subarray(offset, length === undefined ? undefined : offset + length)
      }
      return { ...obj, body: new Blob([raw]).stream(), arrayBuffer: async () => Uint8Array.from(raw).buffer, text: async () => raw.toString() }
    },
    async put(key, body, options = {}) {
      const data = Buffer.from(await new Response(body).arrayBuffer())
      const path = pathFor(key)
      const suffix = '.' + randomUUID() + '.tmp'
      const etag = createHash('sha256').update(data).digest('hex')
      const meta = { key, etag, httpEtag: '"' + etag + '"', httpMetadata: options.httpMetadata || {}, customMetadata: options.customMetadata || {} }
      try {
        await writeFile(path + suffix, data, { mode: 0o600 })
        await writeFile(path + '.json' + suffix, JSON.stringify(meta), { mode: 0o600 })
        await rename(path + suffix, path)
        await rename(path + '.json' + suffix, path + '.json')
      } finally {
        await Promise.all([rm(path + suffix, { force: true }), rm(path + '.json' + suffix, { force: true })])
      }
      return head(key)
    },
    async delete(keys) {
      for (const key of [].concat(keys)) {
        const path = pathFor(key)
        await Promise.all([rm(path, { force: true }), rm(path + '.json', { force: true })])
      }
    },
    async list({ prefix = '', cursor = '', limit = 1000 } = {}) {
      const objects = []
      for (const filename of await readdir(directory)) {
        if (!filename.endsWith('.json')) continue
        const { key } = JSON.parse(await readFile(join(directory, filename), 'utf8'))
        if (key.startsWith(prefix) && key > cursor) objects.push(await head(key))
      }
      objects.sort((a,b) => a.key < b.key ? -1 : 1)
      const page = objects.slice(0, limit)
      return { objects: page, truncated: objects.length > limit, cursor: page.at(-1)?.key }
    }
  }
}

export async function localBindings(directory) {
  await mkdir(join(directory, 'objects'), { recursive: true, mode: 0o700 })
  const database = new DatabaseSync(join(directory, 'resources.sqlite'))
  database.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000')
  try { await migrate(database) } catch (error) { database.close(); throw error }
  return { DB: d1(database), BUCKET: bucket(join(directory, 'objects')), close: () => database.close() }
}

function matches(actual, expected) {
  if (!expected || !actual) return false
  const digest = value => createHash('sha256').update(value).digest()
  return timingSafeEqual(digest(actual), digest(expected))
}

export async function localServer({ dataDirectory, token, env = {}, port = 0 } = {}) {
  const storage = await localBindings(dataDirectory || join(project, '.local-data'))
  const runtime = { ADMIN_EMAIL: 'owner@localhost.invalid', ...env, DB: storage.DB, BUCKET: storage.BUCKET }
  const worker = (await import('./dist/server/index.js')).default
  const session = randomBytes(32).toString('hex')
  const server = http.createServer(async (req, res) => {
    try {
      const localHost = '127.0.0.1:' + server.address().port
      // Block DNS-rebinding and foreign-origin form submissions to the dev service.
      if (![localHost, 'localhost:' + server.address().port].includes(req.headers.host)) {
        res.writeHead(403); res.end('Invalid Host'); return
      }
      const url = new URL(req.url, 'http://' + req.headers.host)
      if (url.host !== req.headers.host) { res.writeHead(400); res.end(); return }
      const headers = new Headers()
      for (const [key, value] of Object.entries(req.headers)) {
        if (/^(oai-|cf-|x-forwarded-|forwarded$)/i.test(key) || key === 'authorization') continue
        if (value !== undefined) headers.set(key, String(value))
      }
      headers.set('cf-connecting-ip', '127.0.0.1')
      const auth = req.headers.authorization || ''
      if (url.pathname === '/__local/login') {
        if (!token) { res.writeHead(503); res.end('Set DEV_ADMIN_TOKEN and restart.'); return }
        if (!matches(Buffer.from(auth.replace(/^Basic /i, ''), 'base64').toString(), 'dev:' + token)) {
          res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Local resources admin"' }); res.end('Local development credentials required.'); return
        }
        res.writeHead(303, { Location: '/admin', 'Set-Cookie': 'dev_session=' + session + '; HttpOnly; SameSite=Strict; Path=/', 'Cache-Control': 'no-store' }); res.end(); return
      }
      if (url.pathname === '/__local/logout') {
        res.writeHead(303, { Location: '/', 'Set-Cookie': 'dev_session=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/' }); res.end(); return
      }
      const localCookie = (req.headers.cookie || '').split(';').map(x=>x.trim()).find(x=>x.startsWith('dev_session='))?.slice(12)
      if (matches(auth, token ? 'Bearer ' + token : '') || matches(localCookie, session)) {
        headers.set('oai-authenticated-user-email', runtime.ADMIN_EMAIL)
        headers.set('oai-authenticated-user-id', 'local-owner')
      }
      const options = { method: req.method, headers }
      if (!['GET', 'HEAD'].includes(req.method)) {
        options.body = Readable.toWeb(req)
        options.duplex = 'half'
      }
      const ctx = { waitUntil: p => Promise.resolve(p).catch(() => console.error('Background request failed')) }
      const response = await worker.fetch(new Request(url, options), runtime, ctx)
      res.writeHead(response.status, Object.fromEntries(response.headers))
      if (req.method === 'HEAD' || !response.body) res.end()
      else Readable.fromWeb(response.body).on('error', () => res.destroy()).pipe(res)
    } catch { if (!res.headersSent) res.writeHead(500); res.end('Local worker request failed.') }
  })
  await new Promise((ok, fail) => server.once('error',fail).listen(port, '127.0.0.1', ok))
  return { url: 'http://127.0.0.1:' + server.address().port, close: async () => {
    server.closeAllConnections()
    await new Promise(ok=>server.close(ok))
    storage.close()
  } }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const portArg = process.argv.indexOf('--port')
  const host = await localServer({ port: Number(process.env.PORT ?? (portArg > 0 ? process.argv[portArg + 1] : 8787)), dataDirectory: process.env.DATA_DIR,
    token: process.env.DEV_ADMIN_TOKEN, env: Object.fromEntries(['ADMIN_EMAIL','PUBLIC_ORIGIN'].filter(key=>process.env[key]).map(key=>[key,process.env[key]])) })
  console.log('Resources:', host.url + '/resources')
  console.log('Local admin login:', host.url + '/__local/login (user dev, password DEV_ADMIN_TOKEN)')
  for (const signal of ['SIGINT','SIGTERM']) process.once(signal, async () => { await host.close(); process.exit(0) })
}
